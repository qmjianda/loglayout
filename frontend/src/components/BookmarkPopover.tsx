import React, { useState, useEffect, useRef } from 'react';

interface BookmarkPopoverProps {
    x: number;
    y: number;
    lineIndex: number;
    initialComment: string;
    onSave: (comment: string) => void;
    onRemove: () => void;
    onClose: () => void;
}

export const BookmarkPopover: React.FC<BookmarkPopoverProps> = ({
    x, y, lineIndex, initialComment, onSave, onRemove, onClose
}) => {
    const [comment, setComment] = useState(initialComment);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={popoverRef}
            style={{
                position: 'fixed',
                top: y,
                left: x,
                zIndex: 1001,
            }}
            className="bookmark-popover bg-[#252526]/90 backdrop-blur-md border border-[#454545] shadow-2xl rounded-lg p-3 min-w-[280px] flex flex-col ring-1 ring-black/50 animate-in fade-in slide-in-from-left-2 duration-200"
            onMouseDown={e => e.stopPropagation()}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                        书签注释 #{(lineIndex + 1).toLocaleString()}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            <textarea
                autoFocus
                className="bg-[#1e1e1e]/50 border border-[#3e3e42] text-gray-200 p-2.5 text-xs rounded-md outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all resize-none h-28 mb-3 placeholder:text-gray-600"
                placeholder="在此输入您的书签说明（Markdown 支持）..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        onSave(comment);
                    }
                    if (e.key === 'Escape') onClose();
                }}
            />

            <div className="flex justify-between items-center gap-3">
                <button
                    onClick={onRemove}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-all group"
                >
                    <svg className="w-3 h-3 opacity-70 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    移除书签
                </button>

                <div className="flex items-center gap-1">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-[11px] text-gray-400 hover:text-white transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => onSave(comment)}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-medium transition-all shadow-lg shadow-amber-900/20"
                    >
                        保存修改
                    </button>
                </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-[#333] flex justify-end">
                <span className="text-[9px] text-gray-600">Ctrl + Enter 快速保存</span>
            </div>
        </div>
    );
};
