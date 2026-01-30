import React, { useState, useEffect, useRef } from 'react';

interface SearchPanelProps {
  onSearch: (query: string) => void;
  config: { regex: boolean; caseSensitive: boolean; wholeWord: boolean };
  setConfig: React.Dispatch<React.SetStateAction<{ regex: boolean; caseSensitive: boolean; wholeWord: boolean }>>;
  matchCount?: number;
  currentIndex?: number;
  onNavigate?: (direction: 'next' | 'prev') => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ 
  onSearch, config, setConfig, matchCount = 0, currentIndex = 0, onNavigate 
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigate?.('prev');
      } else {
        onNavigate?.('next');
      }
    } else if (e.key === 'Escape') {
      setInputValue('');
      onSearch('');
    }
  };

  const clearSearch = () => {
    setInputValue('');
    onSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="p-4 flex flex-col h-full overflow-hidden select-none">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-wider font-bold opacity-70">搜索</h2>
        {matchCount > 0 && (
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-gray-500 font-mono">
              {matchCount > 0 ? `${currentIndex} / ${matchCount}` : '无结果'}
            </span>
            <div className="flex ml-2 border-l border-white/10 pl-2">
              <button 
                onClick={() => onNavigate?.('prev')}
                className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors"
                title="上一个匹配项 (Shift+Enter)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7"/></svg>
              </button>
              <button 
                onClick={() => onNavigate?.('next')}
                className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors"
                title="下一个匹配项 (Enter)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative group mb-4">
        <div className={`relative flex items-center bg-[#3c3c3c] border transition-all rounded overflow-hidden ${inputValue ? 'border-blue-500/50' : 'border-transparent'}`}>
          <input 
            ref={inputRef}
            type="text" 
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              onSearch(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索日志..."
            className="w-full bg-transparent text-white text-xs px-2 py-1.5 focus:outline-none pr-28"
          />
          
          <div className="absolute right-1 flex items-center space-x-0.5">
            {inputValue && (
              <button 
                onClick={clearSearch}
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white"
                title="清除"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
            <button 
              onClick={() => setConfig(prev => ({ ...prev, caseSensitive: !prev.caseSensitive }))}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors ${config.caseSensitive ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-[#555]'}`}
              title="区分大小写"
            >
              Aa
            </button>
            <button 
              onClick={() => setConfig(prev => ({ ...prev, wholeWord: !prev.wholeWord }))}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors ${config.wholeWord ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-[#555]'}`}
              title="全字匹配"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <button 
              onClick={() => setConfig(prev => ({ ...prev, regex: !prev.regex }))}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors ${config.regex ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-[#555]'}`}
              title="使用正则表达式"
            >
              .*
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="text-[10px] opacity-40 uppercase font-bold mb-3 tracking-tighter">搜索技巧</div>
        <div className="space-y-4">
          <div className="group">
            <div className="flex items-center text-[11px] text-blue-400 font-bold mb-1">
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2"/></svg>
              快捷键支持
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed px-4.5">
              按 <kbd className="bg-[#333] px-1 rounded border border-white/10 font-mono text-gray-300">Enter</kbd> 跳转到下一个结果。使用 <kbd className="bg-[#333] px-1 rounded border border-white/10 font-mono text-gray-300">Shift+Enter</kbd> 跳转到上一个。
            </p>
          </div>

          <div className="group">
            <div className="flex items-center text-[11px] text-yellow-500 font-bold mb-1">
              <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
              全局高亮
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed px-4.5">
              匹配项将在所有日志中以黄色突出显示，包括过滤后的视图。非持久性。
            </p>
          </div>

          <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
             <p className="text-[10px] text-blue-400 italic flex items-start">
               <svg className="w-3 h-3 mr-1.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
               从图层面板使用“高亮图层”可创建永久的多颜色规则。
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};