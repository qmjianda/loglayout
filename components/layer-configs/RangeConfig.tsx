
import React from 'react';
import { LayerConfig } from '../../types';
import { ConfigSection, ConfigLabel, ConfigInput } from './ConfigShared';

interface RangeConfigProps {
  config: LayerConfig;
  onUpdate: (update: Partial<LayerConfig>) => void;
  setDragDisabled: (disabled: boolean) => void;
}

export const RangeConfig: React.FC<RangeConfigProps> = ({ config, onUpdate, setDragDisabled }) => (
  <div className="grid grid-cols-2 gap-3 no-drag">
    <ConfigSection>
      <ConfigLabel>起始行</ConfigLabel>
      <ConfigInput 
        type="number"
        value={config.from ?? ''} 
        onChange={(e) => onUpdate({ from: e.target.value === '' ? undefined : parseInt(e.target.value) })}
        placeholder="1" 
        onFocus={() => setDragDisabled(true)}
        onBlur={() => setDragDisabled(false)}
      />
    </ConfigSection>
    <ConfigSection>
      <ConfigLabel>结束行</ConfigLabel>
      <ConfigInput 
        type="number"
        value={config.to ?? ''} 
        onChange={(e) => onUpdate({ to: e.target.value === '' ? undefined : parseInt(e.target.value) })}
        placeholder="最大" 
        onFocus={() => setDragDisabled(true)}
        onBlur={() => setDragDisabled(false)}
      />
    </ConfigSection>
  </div>
);
