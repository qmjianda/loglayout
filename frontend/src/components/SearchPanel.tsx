import React, { useState, useEffect, useRef } from 'react';
import { useSearchHistory, SearchHistoryItem } from '../hooks/useSearchHistory';

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
  const [isRegexValid, setIsRegexValid] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const { searchHistory, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  // 搜索防抖 (200ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(inputValue);
    }, 200);
    return () => clearTimeout(timer);
  }, [inputValue, onSearch]);

  // 正则合法性校验
  useEffect(() => {
    if (config.regex && inputValue) {
      try {
        new RegExp(inputValue);
        setIsRegexValid(true);
      } catch (e) {
        setIsRegexValid(false);
      }
    } else {
      setIsRegexValid(true);
    }
  }, [inputValue, config.regex]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click outside to close history dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 处理快捷键
    if (e.altKey) {
      if (e.key === 'c' || e.key === 'C') {
        setConfig(prev => ({ ...prev, caseSensitive: !prev.caseSensitive }));
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        setConfig(prev => ({ ...prev, wholeWord: !prev.wholeWord }));
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        setConfig(prev => ({ ...prev, regex: !prev.regex }));
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // Add to search history on Enter
      if (inputValue.trim()) {
        addToHistory(inputValue, {
          regex: config.regex,
          caseSensitive: config.caseSensitive,
          wholeWord: config.wholeWord
        });
      }
      if (e.shiftKey) {
        onNavigate?.('prev');
      } else {
        onNavigate?.('next');
      }
    } else if (e.key === 'Escape') {
      setInputValue('');
      setShowHistory(false);
      onSearch('');
    } else if (e.key === 'ArrowDown' && showHistory && searchHistory.length > 0) {
      e.preventDefault();
      setShowHistory(true);
    }
  };

  const clearSearch = () => {
    setInputValue('');
    onSearch('');
    inputRef.current?.focus();
  };

  const handleHistoryClick = (item: SearchHistoryItem) => {
    setInputValue(item.query);
    setConfig(prev => ({
      ...prev,
      regex: item.config.regex,
      caseSensitive: item.config.caseSensitive,
      wholeWord: item.config.wholeWord || false
    }));
    onSearch(item.query);
    setShowHistory(false);
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="p-4 flex flex-col h-full overflow-hidden select-none">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-wider font-bold opacity-70">搜索</h2>
        {matchCount > 0 && (
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-gray-500 font-mono">
              {matchCount > 0 ? `${currentIndex + 1} / ${matchCount}` : '无结果'}
            </span>
            <div className="flex ml-2 border-l border-white/10 pl-2">
              <button
                onClick={() => onNavigate?.('prev')}
                className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="上一个匹配项 (Shift+Enter)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button
                onClick={() => onNavigate?.('next')}
                className="p-1 hover:bg-[#3c3c3c] rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                title="下一个匹配项 (Enter)"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative group mb-4">
        <div className={`relative flex items-center bg-[#3c3c3c] border transition-all rounded overflow-hidden ${!isRegexValid ? 'border-red-500/50' : (inputValue ? 'border-blue-500/50' : 'border-transparent')
          }`}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
            placeholder={config.regex ? "输入正则表达式..." : "搜索日志..."}
            className="w-full bg-transparent text-white text-xs px-2 py-1.5 focus:outline-none pr-28"
          />

          <div className="absolute right-1 flex items-center space-x-0.5">
            {inputValue && (
              <button
                onClick={clearSearch}
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white cursor-pointer"
                title="清除"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
            {searchHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-white cursor-pointer transition-colors ${showHistory ? 'text-blue-400' : ''}`}
                title="搜索历史"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setConfig(prev => ({ ...prev, caseSensitive: !prev.caseSensitive }))}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors cursor-pointer ${config.caseSensitive ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-[#555]'}`}
              title="区分大小写 (Alt+C)"
            >
              Aa
            </button>
            <button
              onClick={() => setConfig(prev => ({ ...prev, wholeWord: !prev.wholeWord }))}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors cursor-pointer ${config.wholeWord ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-[#555]'}`}
              title="全字匹配 (Alt+W)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M3 12h18M3 6h18M3 18h18" /></svg>
            </button>
            <button
              onClick={() => setConfig(prev => ({ ...prev, regex: !prev.regex }))}
              className={`w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors cursor-pointer ${config.regex ? 'bg-blue-600 text-white shadow-inner' : 'text-gray-400 hover:bg-[#555]'}`}
              title="使用正则表达式 (Alt+R)"
            >
              .*
            </button>
          </div>
        </div>
        
        {/* Search History Dropdown */}
        {showHistory && searchHistory.length > 0 && (
          <div 
            ref={historyRef}
            className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d2d] border border-white/10 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-[10px] text-gray-500 uppercase font-bold">搜索历史</span>
              <button
                onClick={() => clearHistory()}
                className="text-[9px] text-gray-500 hover:text-red-400 cursor-pointer transition-colors"
              >
                清空
              </button>
            </div>
            <div className="py-1">
              {searchHistory.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#3c3c3c] cursor-pointer group"
                  onClick={() => handleHistoryClick(item)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px] text-gray-400 truncate font-mono">{item.query}</span>
                    <div className="flex gap-1 shrink-0">
                      {item.config.regex && <span className="text-[8px] px-1 bg-blue-500/20 text-blue-400 rounded">.*</span>}
                      {item.config.caseSensitive && <span className="text-[8px] px-1 bg-blue-500/20 text-blue-400 rounded">Aa</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-gray-600">{formatTimestamp(item.timestamp)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(index);
                      }}
                      className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-red-400 transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {!isRegexValid && (
          <div className="absolute -bottom-4 left-0 text-[9px] text-red-400">无效的正则表达式</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="text-[10px] opacity-40 uppercase font-bold mb-3 tracking-tighter">搜索技巧</div>
        <div className="space-y-4">
          <div className="group">
            <div className="flex items-center text-[11px] text-blue-400 font-bold mb-1">
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeWidth="2" /></svg>
              快捷键支持
            </div>
            <div className="text-[10px] text-gray-500 leading-relaxed px-4.5 space-y-1">
              <p>按 <kbd className="bg-[#333] px-1 rounded border border-white/10 font-mono text-gray-300">Enter</kbd> 跳转到下一个。使用 <kbd className="bg-[#333] px-1 rounded border border-white/10 font-mono text-gray-300">Shift+Enter</kbd> 跳转到上一个。</p>
              <p>使用 <kbd className="bg-[#333] px-1 rounded border border-white/10 font-mono text-gray-300">Alt + C/W/R</kbd> 快速切换搜索选项。</p>
            </div>
          </div>

          <div className="group">
            <div className="flex items-center text-[11px] text-yellow-500 font-bold mb-1">
              <svg className="w-3 h-3 mr-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z" /></svg>
              全局高亮
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed px-4.5">
              匹配项将在所有日志中以黄色突出显示，包括过滤后的视图。非持久性。
            </p>
          </div>

          <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
            <p className="text-[10px] text-blue-400 italic flex items-start">
              <svg className="w-3 h-3 mr-1.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              从图层面板使用"高亮图层"可创建永久的多颜色规则。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
