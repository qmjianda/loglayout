import React, { useState } from 'react';
import { LogLayer, LayerType, LayerPreset } from '../types';
import { LayersPanel } from './LayersPanel';

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
    // 文件相关
    files: FileInfo[];
    activeFileId: string | null;
    onFileSelect: () => void;
    onFolderSelect: () => void;
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
}

// 简化后的 Section ID
type SectionId = 'explorer' | 'presets';

export const UnifiedPanel: React.FC<UnifiedPanelProps> = ({
    files,
    activeFileId,
    onFileSelect,
    onFolderSelect,
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
    onRedo
}) => {
    const [collapsedSections, setCollapsedSections] = useState<Record<SectionId, boolean>>({
        explorer: false,
        presets: true
    });

    // Resize State
    const [presetHeight, setPresetHeight] = useState(200);

    // Track expanded files for tree view
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    // Auto-expand active file when it changes
    React.useEffect(() => {
        if (activeFileId && expandedFiles[activeFileId] === undefined) {
            setExpandedFiles(prev => ({ ...prev, [activeFileId]: true }));
        }
    }, [activeFileId]);

    const toggleSection = (section: SectionId) => {
        setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const toggleFile = (fileId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* 全局工具栏 (Actions for Active File) */}
            <div className="shrink-0 p-2 bg-[#2d2d2d] border-b border-[#111] flex flex-wrap gap-1">
                {/* 图层操作 */}
                <button onClick={() => onAddLayer(LayerType.FOLDER)} disabled={!activeFileId} className={`w-6 h-6 flex items-center justify-center rounded ${activeFileId ? 'hover:bg-[#444] text-gray-400' : 'opacity-30 cursor-not-allowed'}`} title="添加文件夹"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg></button>
                <button onClick={() => onAddLayer(LayerType.FILTER)} disabled={!activeFileId} className={`w-6 h-6 flex items-center justify-center rounded ${activeFileId ? 'hover:bg-[#444] text-blue-400' : 'opacity-30 cursor-not-allowed'}`} title="添加内容过滤"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 4h18l-7 9v6l-4 2V13L3 4z" /></svg></button>
                <button onClick={() => onAddLayer(LayerType.HIGHLIGHT)} disabled={!activeFileId} className={`w-6 h-6 flex items-center justify-center rounded ${activeFileId ? 'hover:bg-[#444] text-yellow-400' : 'opacity-30 cursor-not-allowed'}`} title="添加高亮"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg></button>
                <button onClick={() => onAddLayer(LayerType.TIME_RANGE)} disabled={!activeFileId} className={`w-6 h-6 flex items-center justify-center rounded ${activeFileId ? 'hover:bg-[#444] text-purple-400' : 'opacity-30 cursor-not-allowed'}`} title="添加时间及范围"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                <button onClick={() => onAddLayer(LayerType.LEVEL)} disabled={!activeFileId} className={`w-6 h-6 flex items-center justify-center rounded ${activeFileId ? 'hover:bg-[#444] text-red-400' : 'opacity-30 cursor-not-allowed'}`} title="添加等级过滤"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></button>
                <button onClick={() => onAddLayer(LayerType.TRANSFORM)} disabled={!activeFileId} className={`w-6 h-6 flex items-center justify-center rounded ${activeFileId ? 'hover:bg-[#444] text-orange-400' : 'opacity-30 cursor-not-allowed'}`} title="添加转换"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm4 4h8v8H8V8z" /></svg></button>

                <div className="h-4 w-px bg-white/10 mx-1 self-center" />

                {/* Undo/Redo */}
                <button onClick={onUndo} disabled={!canUndo} className={`w-6 h-6 flex items-center justify-center rounded ${canUndo ? 'hover:bg-[#444] text-gray-300' : 'opacity-30 cursor-not-allowed text-gray-600'}`} title="撤销 (Ctrl+Z)"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                <button onClick={onRedo} disabled={!canRedo} className={`w-6 h-6 flex items-center justify-center rounded ${canRedo ? 'hover:bg-[#444] text-gray-300' : 'opacity-30 cursor-not-allowed text-gray-600'}`} title="重做 (Ctrl+Y)"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>
            </div>

            {/* Explorer Section */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div
                    className="flex items-center px-3 py-2 bg-header border-b border-[#111] cursor-pointer hover:bg-[#333] select-none shrink-0"
                    onClick={() => toggleSection('explorer')}
                >
                    <svg className={`w-3 h-3 mr-2 transition-transform ${collapsedSections.explorer ? '' : 'rotate-90'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[10px] uppercase font-black tracking-wider opacity-60">资源管理器</span>
                    <span className="ml-auto text-[9px] text-gray-500">{files.length}</span>
                </div>

                {!collapsedSections.explorer && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-dark-1">
                        {/* 文件操作 */}
                        <div className="flex gap-1 p-2 border-b border-[#333] shrink-0">
                            <button onClick={onFileSelect} className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 bg-[#3c3c3c] hover:bg-[#444] text-gray-300 rounded transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                文件
                            </button>
                            <button onClick={onFolderSelect} className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1 bg-[#3c3c3c] hover:bg-[#444] text-gray-300 rounded transition-colors">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                文件夹
                            </button>
                        </div>

                        {/* File Tree List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {files.length === 0 ? (
                                <div className="p-4 text-center text-[10px] text-gray-500 italic">暂无文件</div>
                            ) : (
                                files.map(file => {
                                    const isExpanded = expandedFiles[file.id];
                                    const isActive = file.id === activeFileId;

                                    return (
                                        <div key={file.id} className="flex flex-col border-b border-[#111]">
                                            {/* File Header */}
                                            <div
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'FILE', id: file.id }));
                                                    e.dataTransfer.effectAllowed = 'copyMove';
                                                }}
                                                className={`flex items-center px-2 py-1.5 cursor-pointer select-none group transition-colors ${isActive ? 'bg-[#37373d]' : 'hover:bg-[#2a2d2e]'}`}
                                                onClick={(e) => { onFileActivate(file.id); toggleFile(file.id, e); }}
                                            >
                                                <div className="w-4 h-4 mr-1 flex items-center justify-center hover:bg-white/10 rounded" onClick={(e) => toggleFile(file.id, e)}>
                                                    <svg className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                                </div>

                                                <svg className={`w-4 h-4 mr-2 shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>

                                                <div className="flex-1 min-w-0 pr-2">
                                                    <div className={`text-[11px] truncate ${isActive ? 'text-blue-400 font-medium' : 'text-gray-300'}`}>{file.name}</div>
                                                </div>

                                                <button onClick={(e) => { e.stopPropagation(); onFileRemove(file.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-opacity">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>

                                            {/* Layers List (Nested) */}
                                            {isExpanded && (
                                                <div className={`border-l border-white/5 ml-3 pl-0 bg-black/10`}>
                                                    {file.layers && file.layers.length > 0 ? (
                                                        <LayersPanel
                                                            layers={file.layers} // Use File's layers
                                                            stats={isActive ? layerStats : {}} // Only show stats for active file
                                                            selectedId={selectedLayerId}
                                                            onSelect={onSelectLayer}
                                                            onDrop={onLayerDrop} // Warning: drag drop might cross files if not careful, but onLayerDrop in App operates on activeFileId.
                                                            onRemove={onLayerRemove}
                                                            onToggle={onLayerToggle}
                                                            onUpdate={onLayerUpdate}
                                                            onJumpToLine={isActive ? onJumpToLine : undefined}
                                                        />
                                                    ) : (
                                                        <div className="pl-6 py-2 text-[10px] text-gray-600 italic">无图层</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 预设面板 */}
            <div className="shrink-0 border-t border-[#111] relative group/presets">
                {/* Resizer Handle */}
                <div
                    className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-50 opacity-0 group-hover/presets:opacity-100 hover:opacity-100 flex items-center justify-center"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startHeight = presetHeight;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            // Dragging UP (negative delta) should INCREASE height
                            const delta = startY - moveEvent.clientY;
                            const newHeight = Math.max(100, Math.min(500, startHeight + delta));
                            setPresetHeight(newHeight);
                        };

                        const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                            document.body.style.cursor = '';
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                        document.body.style.cursor = 'row-resize';
                    }}
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
