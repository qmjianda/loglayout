
import React from 'react';
import { LayerConfig } from '../../types';
import { SearchInput } from '../SearchInput';
import { ConfigSection } from './ConfigShared';

interface FilterConfigProps {
  config: LayerConfig;
  onUpdate: (update: Partial<LayerConfig>) => void;
  setDragDisabled: (disabled: boolean) => void;
}

export const FilterConfig: React.FC<FilterConfigProps> = ({ config, onUpdate, setDragDisabled }) => (
  <div className="space-y-3">
    <ConfigSection>
      <SearchInput 
        value={config.query || ''}
        onChange={(val) => onUpdate({ query: val })}
        config={{ 
          regex: config.regex, 
          caseSensitive: config.caseSensitive, 
          wholeWord: config.wholeWord 
        }}
        onConfigChange={(cfg) => onUpdate(cfg)}
        placeholder="搜索模式..."
        onMouseEnter={() => setDragDisabled(true)}
        onMouseLeave={() => setDragDisabled(false)}
      />
    </ConfigSection>
    <div className="flex items-center space-x-2">
       <button 
         type="button"
         onClick={(e) => { e.stopPropagation(); onUpdate({ invert: !config.invert }); }}
         className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${config.invert ? 'bg-red-900/40 border-red-500 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.2)]' : 'bg-[#333] border-gray-700 text-gray-500 hover:text-gray-300'}`}
       >
         {config.invert ? '排除模式' : '包含模式'}
       </button>
       <span className="text-[9px] text-gray-600 uppercase font-medium">
         {config.invert ? '正在过滤掉匹配项' : '仅显示匹配项'}
       </span>
    </div>
  </div>
);
