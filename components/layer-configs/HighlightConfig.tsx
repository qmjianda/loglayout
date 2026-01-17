
import React from 'react';
import { LayerConfig } from '../../types';
import { SearchInput } from '../SearchInput';
import { ColorPicker } from './ColorPicker';
import { ConfigSection, ConfigLabel } from './ConfigShared';

interface HighlightConfigProps {
  config: LayerConfig;
  onUpdate: (update: Partial<LayerConfig>) => void;
  setDragDisabled: (disabled: boolean) => void;
}

export const HighlightConfig: React.FC<HighlightConfigProps> = ({ config, onUpdate, setDragDisabled }) => (
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
        placeholder="高亮目标..."
        onMouseEnter={() => setDragDisabled(true)}
        onMouseLeave={() => setDragDisabled(false)}
      />
    </ConfigSection>
    
    <div className="flex space-x-4 items-start">
      <div className="shrink-0">
        <ColorPicker 
          selectedColor={config.color || '#3b82f6'} 
          onColorChange={(color) => onUpdate({ color })} 
          setDragDisabled={setDragDisabled}
        />
      </div>
      <div className="flex-1 space-y-2 pt-0.5">
        <ConfigSection>
          <ConfigLabel extra={<span className="text-blue-400 font-mono">{config.opacity || 100}%</span>}>
            不透明度
          </ConfigLabel>
          <input 
            type="range" min="0" max="100" 
            value={config.opacity || 100} 
            onChange={e => onUpdate({ opacity: parseInt(e.target.value) })} 
            onFocus={() => setDragDisabled(true)}
            onBlur={() => setDragDisabled(false)}
            className="w-full h-1 bg-[#444] rounded appearance-none accent-blue-500 cursor-pointer" 
          />
        </ConfigSection>
      </div>
    </div>
  </div>
);
