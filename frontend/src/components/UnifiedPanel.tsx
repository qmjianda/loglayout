import React, { useState, useRef, useEffect } from 'react';
import { LogLayer, LayerType, LayerPreset, LayerRegistryEntry } from '../types';
import { LayersPanel } from './LayersPanel';
import { FileTree } from './FileTree';
import { useLayerRegistry } from '../hooks/useLayerRegistry';
import { useDrag } from '../hooks/useDrag';
import { getBookmarks, clearBookmarks, getLinesByIndices, physicalToVisualIndex } from '../bridge_client';

// 文件信息接口
export interface FileInfo {
    id: string;
    name: string;
    size: number;
    path?: string;
    isActive: boolean;
    lineCount?: number;
}

interface UnifiedPanelProps {
    // Workspace
    workspaceRoot: { path: string, name: string } | null;
    onOpenFileByPath: (path: string, name: string) => void;

    // 文件相关
    files: FileInfo[];
    activeFileId: string | null;
    onOpen: () => void;
    onFileActivate: (fileId: string) => void;
    onFileRemove: (fileId: string) => void;

    // 图层相关
    layers: LogLayer[];
    layerStats: Record<string, { count: number; distribution: number[] }>;
    selectedLayerId: string | null;
    onSelectLayer: (id: string | null) => void;
    onLayerDrop: (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => void;
    onLayerRemove: (id: string) => void;
    onLayerToggle: (id: string) => void;
    onLayerUpdate: (id: string, update: Partial<LogLayer>) => void;
    onAddLayer: (type: LayerType) => void;
    onJumpToLine: (index: number) => void;

    // 预设相关
    presets: LayerPreset[];
    onPresetApply: (preset: LayerPreset) => void;
    onPresetDelete: (id: string) => void;
    onPresetSave: () => void;
    saveStatus: 'idle' | 'saved';

    // 撤销/重做
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;

    // 书签刷新触发器（每次书签变化时递增）
    bookmarkRefreshTrigger?: number;
}

// 简化后的 Section ID
type SectionId = 'openFiles' | 'explorer' | 'presets';

export const UnifiedPanel: React.FC<UnifiedPanelProps> = ({
    workspaceRoot,
    onOpenFileByPath,
    files,
    activeFileId,
    onOpen,
    onFileActivate,
    onFileRemove,
    layers, // Note: This prop now comes from activeFile layers but we rely on files.layers for tree
    layerStats,
    selectedLayerId,
    onSelectLayer,
    onLayerDrop,
    onLayerRemove,
    onLayerToggle,
    onLayerUpdate,
    onAddLayer,
    onJumpToLine,
    presets,
    onPresetApply,
    onPresetDelete,
    onPresetSave,
    saveStatus,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    bookmarkRefreshTrigger = 0
}) => {
    const [collapsedSections, setCollapsedSections] = useState<Record<SectionId, boolean>>({
        openFiles: false,
        explorer: false,
        presets: true
    });

    // Resize State
    const [openedHeight, setOpenedHeight] = useState(200);
    const [presetHeight, setPresetHeight] = useState(200);

    // Track expanded files for tree view
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    // Add layer menu state
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Debug: show system-managed layers
    const [showSystemLayers, setShowSystemLayers] = useState(false);

    // Bookmarks state for each file
    const [bookmarksMap, setBookmarksMap] = useState<Record<string, number[]>>({});
    // Bookmark line content previews: { fileId: { lineIdx: "line content preview..." } }
    const [bookmarkPreviewsMap, setBookmarkPreviewsMap] = useState<Record<string, Record<number, string>>>({});

    // Fetch bookmarks for active file (triggered by activeFileId or bookmarkRefreshTrigger)
    useEffect(() => {
        if (!activeFileId) return;
        const fetchBookmarksWithPreviews = async () => {
            try {
                const bookmarks = await getBookmarks(activeFileId);
                setBookmarksMap(prev => ({ ...prev, [activeFileId]: bookmarks }));

                // 获取书签行的内容预览
                if (bookmarks.length > 0) {
                    const lines = await getLinesByIndices(activeFileId, bookmarks.slice(0, 50));
                    const previews: Record<number, string> = {};
                    lines.forEach(line => {
                        // 截断为60字符
                        previews[line.index] = line.text.length > 60 ? line.text.slice(0, 60) + '...' : line.text;
                    });
                    setBookmarkPreviewsMap(prev => ({ ...prev, [activeFileId]: previews }));
                }
            } catch (e) {
                console.error('[Bookmarks] Failed to fetch:', e);
            }
        };
        fetchBookmarksWithPreviews();
    }, [activeFileId, bookmarkRefreshTrigger]);

    // Click outside to close menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenuId(null);
            }
        };
        if (activeMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMenuId]);

    // Auto-expand active file ONLY when first opened (not interacted with yet)
    // This effect only sets to true if the file has never been toggled (undefined state)
    // Auto-expand logic removed to enforce "collapse all by default" behavior
    const prevActiveFileIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (activeFileId && activeFileId !== prevActiveFileIdRef.current) {
            // Strict auto-expand active, collapse others
            // We use a completely new object with only the active file as true, effectively collapsing all others
            setExpandedFiles({ [activeFileId]: true });
        }
        prevActiveFileIdRef.current = activeFileId;
    }, [activeFileId]);

    const toggleSection = (section: SectionId) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const toggleFile = (fileId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedFiles(prev => ({
            ...prev,
            [fileId]: prev[fileId] === true ? false : true
        }));
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const { registry } = useLayerRegistry();

    // Shared icon library
    const ICON_LIBRARY: Record<string, React.ReactNode> = {
        filter: <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 4h18l-7 9v6l-4 2V13L3 4z" /></svg>,
        highlight: <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>,
        range: <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M13 4l-2 16" /></svg>,
        time: <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
        transform: <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm4 4h8v8H8V8z" /></svg>,
        level: <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
        plugin: <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" /></svg>,
        default: <svg className="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    };

    const getIcon = (entry: LayerRegistryEntry) => {
        return ICON_LIBRARY[entry.icon] || (entry.is_builtin ? ICON_LIBRARY.default : ICON_LIBRARY.plugin);
    };

    // Drag handlers - Defined at top level to follow Rules of Hooks
    const { handleMouseDown: handleExplorerResize } = useDrag<number>({
        onStart: () => openedHeight,
        onDrag: (delta, startH) => {
            setOpenedHeight(Math.max(80, Math.min(600, startH + delta)));
        }
    });

    const { handleMouseDown: handlePresetResize } = useDrag<number>({
        onStart: () => presetHeight,
        onDrag: (delta, startH) => {
            // Dragging UP (negative delta) should INCREASE height
            // Old logic: delta = startY - moveEvent.clientY (positive when going up)
            // Hook logic: delta = moveEvent.clientY - startY (negative when going up)
            // So: startH - HookDelta (negative) = startH + AbsDelta.
            setPresetHeight(Math.max(100, Math.min(500, startH - delta)));
        }
    });


    // Render dropdown menu for adding layers
    const renderAddMenu = (fileId: string) => (
        <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 w-40 bg-[#252526] border border-[#454545] shadow-2xl rounded py-1 z-[100] animate-in fade-in zoom-in-95 duration-100"
        >
            {/* Built-in Layers */}
            <div className="px-3 py-1.5 text-[9px] uppercase font-black text-gray-500 tracking-wider bg-[#2d2d2d] border-b border-[#333]">核心图层</div>
            {Object.values(registry as Record<string, LayerRegistryEntry>).filter(entry => entry.is_builtin).map(entry => (
                <button
                    key={entry.type}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        onAddLayer(entry.type);
                        setActiveMenuId(null);
                        setExpandedFiles(prev => ({ ...prev, [fileId]: true }));
                    }}
                    className="w-full flex items-center px-3 py-1.5 text-[11px] text-gray-300 hover:bg-blue-600 hover:text-white transition-colors"
                >
                    <span className="mr-3 w-4 flex justify-center shrink-0">{getIcon(entry)}</span>
                    <span className="truncate text-left">{entry.display_name}</span>
                </button>
            ))}

            {/* Plugin Layers */}
            {Object.values(registry as Record<string, LayerRegistryEntry>).some(entry => !entry.is_builtin) && (
                <>
                    <div className="px-3 py-1.5 text-[9px] uppercase font-black text-gray-500 tracking-wider bg-[#2d2d2d] border-y border-[#333] mt-1">扩展插件</div>
                    {Object.values(registry as Record<string, LayerRegistryEntry>).filter(entry => !entry.is_builtin).map(entry => (
                        <button
                            key={entry.type}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                onAddLayer(entry.type);
                                setActiveMenuId(null);
                                setExpandedFiles(prev => ({ ...prev, [fileId]: true }));
                            }}
                            className="w-full flex items-center px-3 py-1.5 text-[11px] text-gray-300 hover:bg-blue-600 hover:text-white transition-colors"
                        >
                            <span className="mr-3 w-4 flex justify-center shrink-0">{getIcon(entry)}</span>
                            <span className="truncate text-left">{entry.display_name}</span>
                        </button>
                    ))}
                </>
            )}

            {presets.length > 0 && (
                <>
                    <div className="px-3 py-1.5 text-[9px] uppercase font-black text-gray-500 tracking-wider bg-[#2d2d2d] border-y border-[#333] mt-1">预设库</div>
                    {presets.map(p => (
                        <button
                            key={p.id}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                onPresetApply(p);
                                setActiveMenuId(null);
                            }}
                            className="w-full flex items-center px-3 py-1.5 text-[11px] text-gray-300 hover:bg-blue-600 hover:text-white transition-colors group"
                            title={p.name}
                        >
                            <span className="mr-3 w-4 flex justify-center shrink-0">
                                <svg className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            </span>
                            <span className="truncate text-left flex-1">{p.name}</span>
                        </button>
                    ))}
                </>
            )}
        </div>
    );

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* 全局工具栏 (Actions for Active File) */}
            <div className="shrink-0 p-2 bg-[#2d2d2d] border-b border-[#111] flex flex-wrap gap-1">

                {/* Undo/Redo - Left aligned for quick access */}
                <button onClick={onUndo} disabled={!canUndo} className={`w-6 h-6 flex items-center justify-center rounded ${canUndo ? 'hover:bg-[#444] text-gray-300' : 'opacity-30 cursor-not-allowed text-gray-600'}`} title="撤销 (Ctrl+Z)"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                <button onClick={onRedo} disabled={!canRedo} className={`w-6 h-6 flex items-center justify-center rounded ${canRedo ? 'hover:bg-[#444] text-gray-300' : 'opacity-30 cursor-not-allowed text-gray-600'}`} title="重做 (Ctrl+Y)"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>


            </div>

            {/* 1. 已打开文件 & 图层 (Flattened List with nested layers) */}
            <div className={`flex flex-col overflow-hidden min-h-0 ${collapsedSections.explorer ? 'flex-1' : 'shrink-0'}`}>
                <div
                    className="flex items-center px-3 py-2 bg-header border-b border-[#111] cursor-pointer hover:bg-[#333] select-none shrink-0"
                    onClick={() => toggleSection('openFiles')}
                >
                    <svg className={`w-3 h-3 mr-2 transition-transform ${collapsedSections.openFiles ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[10px] uppercase font-black tracking-wider opacity-60">已打开</span>
                    {/* Debug toggle for system layers */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowSystemLayers(prev => !prev); }}
                        className={`ml-2 px-1 py-0.5 text-[8px] rounded transition-colors ${showSystemLayers ? 'bg-amber-500/30 text-amber-400' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                        title={showSystemLayers ? '隐藏系统图层' : '显示系统图层'}
                    >
                        {showSystemLayers ? '系统' : '用户'}
                    </button>
                    <span className="ml-auto text-[9px] text-gray-500">{files.length}</span>
                </div>

                {!collapsedSections.openFiles && (
                    <div
                        className="overflow-y-auto custom-scrollbar bg-dark-1"
                        style={collapsedSections.explorer ? { flex: 1 } : { height: openedHeight }}
                    >
                        {files.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-500 italic">暂无文件 (从资源管理器中选取)</div>
                        ) : (
                            files.map(file => {
                                const isExpanded = expandedFiles[file.id] === true;
                                const isActive = file.id === activeFileId;
                                // Filter out system-managed layers unless debug mode is on
                                const visibleLayers = file.layers ? file.layers.filter(l => showSystemLayers || !l.isSystemManaged) : [];
                                const hasLayers = visibleLayers.length > 0;

                                return (
                                    <div key={file.id} className="flex flex-col border-b border-[#111]">
                                        {/* File Header Row - Click to activate AND toggle expand */}
                                        <div
                                            className={`flex items-center py-1 px-2 cursor-pointer select-none group transition-colors relative ${isActive ? 'bg-[#37373d] text-blue-400' : 'hover:bg-[#2a2d2e] text-gray-400'}`}
                                            onClick={() => {
                                                if (file.id === activeFileId) {
                                                    // Toggle ONLY if already active (manual collapse/expand)
                                                    // Switching files is handled by useEffect
                                                    setExpandedFiles(prev => {
                                                        const currentlyExpanded = prev[file.id] === true;
                                                        return { ...prev, [file.id]: !currentlyExpanded };
                                                    });
                                                }
                                                onFileActivate(file.id);
                                            }}
                                        >
                                            {/* Expand/Collapse Arrow - Visual indicator only */}
                                            <div className={`w-4 h-4 mr-1 shrink-0 flex items-center justify-center text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" /></svg>
                                            </div>

                                            {/* File Icon */}
                                            <div className="mr-2 shrink-0">
                                                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            </div>

                                            {/* File Name */}
                                            <span className={`text-xs truncate flex-1 ${isActive ? 'text-white font-medium' : ''}`}>{file.name}</span>

                                            {/* Action Buttons - Always visible for active file, hover for others */}
                                            {/* Use pointer-events-none when hidden to allow clicks to pass through */}
                                            <div className={`flex items-center space-x-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                                                {isActive && (
                                                    <>
                                                        {/* Save as Preset */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onPresetSave(); }}
                                                            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-500 hover:text-white"
                                                            title="保存为预设"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                                        </button>
                                                        {/* Add Folder */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAddLayer(LayerType.FOLDER); }}
                                                            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-500 hover:text-white"
                                                            title="新建分组"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                                                        </button>
                                                        {/* Add Layer Dropdown */}
                                                        <div className="relative">
                                                            <button
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveMenuId(activeMenuId === file.id ? null : file.id);
                                                                }}
                                                                className={`p-1 hover:bg-white/10 rounded transition-colors ${activeMenuId === file.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                                                title="添加图层"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                                                            </button>
                                                            {activeMenuId === file.id && renderAddMenu(file.id)}
                                                        </div>
                                                    </>
                                                )}
                                                {/* Close File */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onFileRemove(file.id); }}
                                                    className="p-1 hover:bg-red-500/20 rounded transition-colors text-gray-500 hover:text-red-400"
                                                    title="关闭文件"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Layers or Hint */}
                                        {isExpanded && (
                                            <div className="bg-black/10 border-l border-blue-500/20 ml-5 py-0.5">
                                                {hasLayers ? (
                                                    <LayersPanel
                                                        layers={visibleLayers}
                                                        stats={isActive ? layerStats : {}}
                                                        selectedId={isActive ? selectedLayerId : null}
                                                        onSelect={isActive ? onSelectLayer : () => { }}
                                                        onDrop={isActive ? onLayerDrop : () => { }}
                                                        onRemove={isActive ? onLayerRemove : () => { }}
                                                        onToggle={isActive ? onLayerToggle : () => { }}
                                                        onUpdate={isActive ? onLayerUpdate : () => { }}
                                                        onJumpToLine={isActive ? onJumpToLine : undefined}
                                                        isReadOnly={!isActive}
                                                    />
                                                ) : (
                                                    <div className="py-2 pl-4 text-[10px] text-blue-400/60 italic">
                                                        点击上方 + 图标添加图层进行分析
                                                    </div>
                                                )}

                                                {/* Bookmarks Section */}
                                                {isActive && bookmarksMap[file.id]?.length > 0 && (
                                                    <div className="mt-1 border-t border-[#333] pt-1">
                                                        <div className="px-2 py-1 flex items-center gap-1">
                                                            <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
                                                            <span className="text-[9px] uppercase font-bold text-gray-500">书签</span>
                                                            <span className="text-[9px] text-gray-600">{bookmarksMap[file.id].length}</span>
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm(`确定要清除全部 ${bookmarksMap[file.id].length} 个书签吗？`)) {
                                                                        await clearBookmarks(file.id);
                                                                        setBookmarksMap(prev => ({ ...prev, [file.id]: [] }));
                                                                    }
                                                                }}
                                                                className="ml-auto px-1.5 py-0.5 text-[9px] bg-red-500/20 text-red-400 hover:bg-red-500/40 rounded transition-colors"
                                                                title="清除所有书签"
                                                            >
                                                                清除
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 px-2 pb-1 max-h-24 overflow-y-auto custom-scrollbar">
                                                            {bookmarksMap[file.id].map(lineIdx => (
                                                                <button
                                                                    key={lineIdx}
                                                                    onClick={async () => {
                                                                        const visualIdx = await physicalToVisualIndex(file.id, lineIdx);
                                                                        onJumpToLine(visualIdx);
                                                                    }}
                                                                    className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 rounded transition-colors"
                                                                    title={bookmarkPreviewsMap[file.id]?.[lineIdx] || `行 ${lineIdx + 1}`}
                                                                >
                                                                    {lineIdx + 1}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* 2. 资源管理器 (Pure Tree) */}
            <div className={`${collapsedSections.explorer ? 'flex-none' : 'flex-1'} flex flex-col overflow-hidden min-h-0 border-t border-[#111] relative group/explorer`}>
                {/* Resizer Handle for Opened Section */}
                <div
                    className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-50 opacity-0 group-hover/explorer:opacity-100 hover:opacity-100 flex items-center justify-center transition-opacity"
                    onMouseDown={handleExplorerResize}
                >
                    <div className="w-8 h-1 bg-blue-500/50 rounded-full" />
                </div>

                <div
                    className="flex items-center px-3 py-2 bg-header border-b border-[#111] cursor-pointer hover:bg-[#333] select-none shrink-0"
                    onClick={() => toggleSection('explorer')}
                >
                    <svg className={`w-3 h-3 mr-2 transition-transform ${collapsedSections.explorer ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[10px] uppercase font-black tracking-wider opacity-60 whitespace-nowrap">资源管理器</span>
                    {workspaceRoot && <span className="ml-2 text-[10px] text-blue-400 font-medium truncate shrink whitespace-nowrap">{workspaceRoot.name}</span>}
                </div>

                {!collapsedSections.explorer && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-dark-1">
                        {/* 文件/文件夹选择操作 - 始终显示，以便于随时切换文件夹 */}
                        <div className="flex gap-1 p-2 border-b border-[#111] bg-[#252526] shrink-0">
                            <button onClick={onOpen} className="flex-1 flex items-center justify-center gap-2 text-[10px] py-1.5 bg-[#0078d4] hover:bg-[#1084d8] text-white rounded transition-colors shadow-sm font-bold" title="打开文件或项目文件夹">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                                浏览并打开 (Open)
                            </button>
                        </div>

                        {workspaceRoot ? (
                            <FileTree
                                rootPath={workspaceRoot.path}
                                rootName={workspaceRoot.name}
                                onFileClick={onOpenFileByPath}
                                activeFilePath={files.find(f => f.id === activeFileId)?.path}
                                openedFiles={files}
                            />
                        ) : (
                            <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                                <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                <p className="text-[11px] text-gray-500 leading-relaxed">未选择项目文件夹。<br />通过上方“浏览并打开”按钮选择目录或文件。</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 预设面板 */}
            <div className="shrink-0 border-t border-[#111] relative group/presets">
                {/* Resizer Handle */}
                <div
                    className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-50 opacity-0 group-hover/presets:opacity-100 hover:opacity-100 flex items-center justify-center"
                    onMouseDown={handlePresetResize}
                >
                    <div className="w-8 h-1 bg-blue-500/50 rounded-full" />
                </div>

                <div
                    className="flex items-center px-3 py-2 bg-[#2d2d2d] cursor-pointer hover:bg-[#333] select-none"
                    onClick={() => toggleSection('presets')}
                >
                    <svg className={`w-3 h-3 mr-2 transition-transform ${collapsedSections.presets ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[10px] uppercase font-black tracking-wider opacity-60">预设</span>
                    <span className="ml-auto text-[9px] text-gray-500">{presets.length}</span>
                </div>

                {!collapsedSections.presets && (
                    <div
                        className="overflow-y-auto custom-scrollbar bg-[#252526] transition-none"
                        style={{ height: presetHeight }}
                    >
                        {/* Save Button */}
                        <div className="p-2 border-b border-[#111]">
                            <button
                                onClick={onPresetSave}
                                className={`w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wider ${saveStatus === 'saved' ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'} text-white shadow-lg transition-all`}
                            >
                                {saveStatus === 'saved' ? '已保存' : '保存为预设'}
                            </button>
                        </div>
                        <div className="p-2 space-y-1.5">
                            {presets.map(preset => {
                                const isDefault = preset.name === '默认预设' || preset.name === 'Default';
                                return (
                                    <div
                                        key={preset.id}
                                        onClick={() => onPresetApply(preset)}
                                        className={`group relative rounded p-2 transition-all cursor-pointer ${isDefault
                                            ? 'bg-blue-900/10 border border-blue-500/30 hover:bg-blue-900/20'
                                            : 'bg-[#3c3c3c] border border-[#444] hover:border-blue-500/50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className={`text-[11px] font-medium ${isDefault ? 'text-blue-400' : 'text-gray-300'}`}>
                                                {preset.name}
                                            </div>
                                            {!isDefault && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onPresetDelete(preset.id); }}
                                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-opacity"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
