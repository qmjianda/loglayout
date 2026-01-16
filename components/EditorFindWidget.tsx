import React, { useRef, useEffect } from 'react';

interface EditorFindWidgetProps {
  query: string;
  onQueryChange: (q: string) => void;
  config: { regex: boolean; caseSensitive: boolean; wholeWord: boolean };
  onConfigChange: React.Dispatch<React.SetStateAction<{ regex: boolean; caseSensitive: boolean; wholeWord: boolean }>>;
  matchCount: number;
  currentMatch: number;
  onNavigate: (direction: 'next' | 'prev') => void;
  onClose: () => void;
}

export const EditorFindWidget: React.FC<EditorFindWidgetProps> = ({
  query,
  onQueryChange,
  config,
  onConfigChange,
  matchCount,
  currentMatch,
  onNavigate,
  onClose
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="absolute top-2 right-8 z-30 bg-[#252526] border border-[#454545] shadow-2xl rounded flex items-center p-1 space-x-1 animate-in slide-in-from-top-2 duration-150">
      <div className="flex items-center bg-[#3c3c3c] border border-blue-500/30 rounded overflow-hidden min-w-[280px]">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="查找"
          className="bg-transparent text-white text-xs px-2 py-1 w-full focus:outline-none"
        />
        
        <div className="flex items-center pr-1 bg-[#3c3c3c]">
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
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M3 12h18M3 6h18M3 18h18"/></svg>
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

      <div className="flex items-center px-2 border-r border-white/10 text-[10px] text-gray-500 font-mono min-w-[60px] justify-center">
        {matchCount > 0 ? `${currentMatch} / ${matchCount}` : '无结果'}
      </div>

      <div className="flex items-center">
        <button
          onClick={() => onNavigate('prev')}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3c3c3c] rounded transition-colors"
          title="上一个匹配项 (Shift+Enter)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/></svg>
        </button>
        <button
          onClick={() => onNavigate('next')}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3c3c3c] rounded transition-colors"
          title="下一个匹配项 (Enter)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
        </button>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3c3c3c] rounded transition-colors ml-1"
          title="关闭 (Escape)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
};