import React, { useState, useEffect } from 'react';
import { listDirectory } from '../bridge_client';
import { LayersPanel } from './LayersPanel';
import { LogLayer } from '../types';

interface FileTreeItem {
    name: string;
    path: string;
    isDir: boolean;
    size?: number;
    children?: FileTreeItem[];
}

interface FileTreeProps {
    rootPath: string;
    rootName: string;
    onFileClick: (path: string, name: string) => void;
    activeFilePath?: string | null;
    openedFiles: any[]; // Used for indicator
}

export const FileTree: React.FC<FileTreeProps> = ({
    rootPath, rootName, onFileClick, activeFilePath, openedFiles
}) => {
    const [tree, setTree] = useState<FileTreeItem | null>(null);

    useEffect(() => {
        setTree({
            name: rootName,
            path: rootPath,
            isDir: true,
            children: []
        });
    }, [rootPath, rootName]);

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar select-none py-1 bg-[#1e1e1e]">
            {tree && (
                <TreeNode
                    key={tree.path}
                    item={tree}
                    level={0}
                    onFileClick={onFileClick}
                    activeFilePath={activeFilePath}
                    openedFiles={openedFiles}
                    isRoot
                />
            )}
        </div>
    );
};

const TreeNode: React.FC<any> = ({
    item, level, onFileClick, activeFilePath, openedFiles, isRoot
}) => {
    // Helper to normalize paths for Windows comparison (casing and slashes)
    const normalizePath = (p: string | null | undefined) => {
        if (!p) return '';
        return p.replace(/\\/g, '/').toLowerCase();
    };

    const targetItemPath = normalizePath(item.path);
    const isActive = activeFilePath ? normalizePath(activeFilePath) === targetItemPath : false;
    const openedFile = openedFiles.find(f => normalizePath(f.path) === targetItemPath);

    const isExpandable = item.isDir;

    // We only want to auto-expand isRoot, but for files we want it collapsed by default unless active or newly opened
    const [isExpanded, setIsExpanded] = useState(isRoot);
    const [children, setChildren] = useState<FileTreeItem[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Reset state if item path changes (though key should handle this, secondary safety)
    useEffect(() => {
        setChildren(null);
        setIsExpanded(isRoot);
    }, [item.path, isRoot]);

    // Auto-load content when expanded
    useEffect(() => {
        if (isExpanded && isExpandable && children === null && !isLoading) {
            setIsLoading(true);
            listDirectory(item.path)
                .then(contents => {
                    setChildren(contents);
                    setIsLoading(false);
                })
                .catch(() => {
                    setChildren([]);
                    setIsLoading(false);
                });
        }
    }, [isExpanded, isExpandable, children, isLoading, item.path]);

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isExpandable) {
            setIsExpanded(!isExpanded);
        } else {
            onFileClick(item.path, item.name);
        }
    };

    // Context-aware drop handler that ensures we operate on the correct file
    // This function is removed as per instruction to remove layer management logic
    // const onLayerDropWithFileId = (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => {
    //     if (isActive && !!openedFile) {
    //         layerProps.onLayerDrop(draggedId, targetId, position);
    //     }
    // };


    return (
        <div className="flex flex-col">
            <div
                className={`flex items-center py-[3px] pr-2 cursor-pointer hover:bg-[#2a2d2e] group transition-colors relative ${isActive ? 'bg-[#37373d] text-white' : 'text-[#cccccc]'}`}
                style={{ paddingLeft: `${level * 12 + 12}px` }}
                onClick={toggle}
            >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#007acc]" />}

                <div className="w-4 h-4 flex items-center justify-center mr-1 text-gray-500">
                    {isExpandable && (
                        <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                    )}
                </div>

                <span className="mr-2 flex shrink-0">
                    <FileIcon name={item.name} isDir={item.isDir} isExpanded={isExpanded} />
                </span>

                <span className={`text-[13px] truncate ${isActive ? 'font-medium' : ''}`}>{item.name}</span>

                {openedFile && (
                    <div className="ml-2 w-1.5 h-1.5 rounded-full bg-green-500/50 shadow-[0_0_5px_rgba(34,197,94,0.3)] shrink-0" title="已打开" />
                )}
            </div>

            {isExpanded && item.isDir && (
                <div className="flex flex-col">
                    {isLoading && <div className="py-1 opacity-50 italic text-[10px] pl-10">Loading...</div>}
                    {children && children.map((child, i) => (
                        <TreeNode
                            key={child.path + i}
                            item={child}
                            level={level + 1}
                            onFileClick={onFileClick}
                            activeFilePath={activeFilePath}
                            openedFiles={openedFiles}
                        />
                    ))}
                    {children && children.length === 0 && !isLoading && (
                        <div className="py-1 opacity-50 italic text-[10px] pl-10">Empty</div>
                    )}
                </div>
            )}
        </div>
    );
};

const FileIcon: React.FC<{ name: string; isDir: boolean; isExpanded: boolean }> = ({ name, isDir, isExpanded }) => {
    if (isDir) {
        let folderColor = "text-[#858585]";
        let dot: React.ReactNode = null;

        if (name === '.agent') { dot = <div className="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-purple-500 border border-[#1e1e1e]" />; }
        else if (name === 'docs') { dot = <div className="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 border border-[#1e1e1e]" />; }
        else if (name === 'node_modules') { dot = <div className="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-green-500 border border-[#1e1e1e]" />; }
        else if (name === 'tests') { dot = <div className="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-red-500 border border-[#1e1e1e]" />; }

        return (
            <div className="relative">
                <svg className={`w-4 h-4 ${folderColor}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                </svg>
                {dot}
            </div>
        );
    }

    const ext = name.split('.').pop()?.toLowerCase();

    const iconMap: Record<string, React.ReactNode> = {
        'gitignore': <span className="text-[#f1502f] text-[9px] font-black">G</span>,
        'log': <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
        'json': <span className="text-[#facc15] font-black text-[9px]">{"{}"}</span>,
        'js': <span className="text-[#f7df1e] font-black text-[9px]">JS</span>,
        'sh': <span className="text-[#4caf50] font-black text-[9px]">&gt;_</span>,
        'py': <span className="text-[#3776ab] font-black text-[9px]">PY</span>,
        'md': <span className="text-[#007acc] font-black text-[9px]">M↓</span>,
        'ts': <span className="text-[#3178c6] font-black text-[9px]">TS</span>,
    };

    if (name === 'tsconfig.json') return <span className="text-[#3178c6] font-black text-[9px]">T⚙</span>;
    if (name === 'vite.config.ts') return <span className="text-[#bd34fe] font-black text-[10px]">⚡</span>;

    return <div className="w-4 h-4 flex items-center justify-center">{iconMap[ext || ''] || iconMap['log']}</div>;
};
