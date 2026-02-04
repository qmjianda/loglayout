
import React, { useRef, useEffect, useState, useCallback } from 'react';

export type SearchMode = 'highlight' | 'filter';

interface EditorFindWidgetProps {
  query: string;
  onQueryChange: (q: string) => void;
  config: { regex: boolean; caseSensitive: boolean; wholeWord: boolean };
  onConfigChange: React.Dispatch<React.SetStateAction<{ regex: boolean; caseSensitive: boolean; wholeWord: boolean }>>;
  matchCount: number;
  currentMatch: number;
  onNavigate: (direction: 'next' | 'prev') => void;
  onClose: () => void;
  // New: Search mode support
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
}

export const EditorFindWidget: React.FC<EditorFindWidgetProps> = ({
  query,
  onQueryChange,
  config,
  onConfigChange,
  matchCount,
  currentMatch,
  onNavigate,
  onClose,
  searchMode = 'highlight',
  onSearchModeChange
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(440);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onNavigate(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(300, Math.min(window.innerWidth * 0.8, startWidth + delta));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [width]);

  const toggleSearchMode = () => {
    if (onSearchModeChange) {
      onSearchModeChange(searchMode === 'highlight' ? 'filter' : 'highlight');
    }
  };

  return (
    <div
      ref={widgetRef}
      style={{ width: `${width}px` }}
      className={`absolute top-2 right-8 z-30 bg-[#252526] border border-[#454545] shadow-2xl rounded flex items-center p-1 space-x-1 animate-in slide-in-from-top-2 duration-150 select-none ${isResizing ? 'ring-1 ring-blue-500/50' : ''}`}
    >
      {/* Resizer Handle */}
      <div
        onMouseDown={startResizing}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-blue-500/30 transition-colors z-40 group"
        title="拖动调整宽度"
      >
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[1px] h-4 bg-gray-600 group-hover:bg-blue-400" />
      </div>

      {/* Search Mode Toggle */}
      {onSearchModeChange && (
        <button
          onClick={toggleSearchMode}
          className={`ml-1 px-2 py-1 rounded text-[9px] font-medium tracking-wide transition-all shrink-0 ${searchMode === 'filter'
              ? 'bg-blue-600 text-white'
              : 'bg-[#3c3c3c] text-gray-400 hover:text-white hover:bg-[#4c4c4c]'
            }`}
          title={searchMode === 'highlight' ? '当前: 仅高亮模式。点击切换到过滤模式' : '当前: 过滤模式（隐藏不匹配行）。点击切换到仅高亮模式'}
        >
          {searchMode === 'filter' ? '过滤' : '高亮'}
        </button>
      )}

      <div className="flex-1 flex items-center bg-[#3c3c3c] border border-blue-500/30 rounded overflow-hidden ml-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="查找"
          className="bg-transparent text-white text-xs px-2 py-1 w-full focus:outline-none select-text"
        />

        <div className="flex items-center pr-1 bg-[#3c3c3c] shrink-0">
          <button
            onClick={() => onConfigChange(prev => ({ ...prev, caseSensitive: !prev.caseSensitive }))}
            className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${config.caseSensitive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#555]'}`}
            title="区分大小写 (Alt+C)"
          >
            Aa
          </button>
          <button
            onClick={() => onConfigChange(prev => ({ ...prev, wholeWord: !prev.wholeWord }))}
            className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${config.wholeWord ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#555]'}`}
            title="全字匹配 (Alt+W)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <button
            onClick={() => onConfigChange(prev => ({ ...prev, regex: !prev.regex }))}
            className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${config.regex ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#555]'}`}
            title="使用正则表达式 (Alt+R)"
          >
            .*
          </button>
        </div>
      </div>

      <div className="flex items-center px-2 border-r border-white/10 text-[10px] text-gray-500 font-mono min-w-[70px] justify-center shrink-0 select-none">
        {matchCount > 0 ? `${currentMatch} / ${matchCount}` : '无结果'}
      </div>

      <div className="flex items-center shrink-0 select-none">
        <button
          onClick={() => onNavigate('prev')}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3c3c3c] rounded transition-colors"
          title="上一个匹配项 (Shift+Enter)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
        </button>
        <button
          onClick={() => onNavigate('next')}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3c3c3c] rounded transition-colors"
          title="下一个匹配项 (Enter)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3c3c3c] rounded transition-colors ml-1"
          title="关闭 (Escape)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
};
