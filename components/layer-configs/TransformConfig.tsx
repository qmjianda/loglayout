
import React from 'react';
import { LayerConfig } from '../../types';
import { SearchInput } from '../SearchInput';
import { ConfigSection, ConfigLabel, ConfigInput } from './ConfigShared';

interface TransformConfigProps {
  config: LayerConfig;
  onUpdate: (update: Partial<LayerConfig>) => void;
  setDragDisabled: (disabled: boolean) => void;
}

export const TransformConfig: React.FC<TransformConfigProps> = ({ config, onUpdate, setDragDisabled }) => (
  <div className="space-y-3">
    <ConfigSection>
      <ConfigLabel>查找目标 (正则)</ConfigLabel>
      <SearchInput 
        value={config.query || ''}
        onChange={(val) => onUpdate({ query: val })}
        config={{ 
          regex: config.regex, 
          caseSensitive: config.caseSensitive, 
          wholeWord: config.wholeWord 
        }}
        onConfigChange={(cfg) => onUpdate(cfg)}
        placeholder="匹配规则..."
        onMouseEnter={() => setDragDisabled(true)}
        onMouseLeave={() => setDragDisabled(false)}
      />
    </ConfigSection>
    <ConfigSection>
      <ConfigLabel>替换为</ConfigLabel>
      <ConfigInput 
        value={config.replaceWith || ''} 
        onChange={(e) => onUpdate({ replaceWith: e.target.value })}
        placeholder="替换文本..." 
        onFocus={() => setDragDisabled(true)}
        onBlur={() => setDragDisabled(false)}
      />
    </ConfigSection>
  </div>
);
