import React from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  config: {
    regex?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
  };
  onConfigChange: (config: { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }) => void;
  placeholder?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  config,
  onConfigChange,
  placeholder = "搜索...",
  onMouseEnter,
  onMouseLeave
}) => {
  return (
    <div 
      className="relative flex items-center w-full group"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <input
        type="text"
        className="bg-[#1e1e1e] border border-[#444] px-2 py-1 pr-20 text-[11px] rounded text-gray-200 w-full focus:outline-none focus:border-blue-500 select-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div className="absolute right-1 flex items-center space-x-0.5 pointer-events-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onConfigChange({ ...config, caseSensitive: !config.caseSensitive }); }}
          className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${config.caseSensitive ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-[#444]'}`}
          title="区分大小写 (Alt+C)"
        >
          Aa
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onConfigChange({ ...config, wholeWord: !config.wholeWord }); }}
          className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${config.wholeWord ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-[#444]'}`}
          title="全字匹配 (Alt+W)"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onConfigChange({ ...config, regex: !config.regex }); }}
          className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${config.regex ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
          title="使用正则表达式 (Alt+R)"
        >
          .*
        </button>
      </div>
    </div>
  );
};