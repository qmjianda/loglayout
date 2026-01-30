
import React from 'react';
import { LayerConfig } from '../../types';
import { ConfigSection, ConfigLabel, ConfigInput } from './ConfigShared';

interface TimeRangeConfigProps {
  config: LayerConfig;
  onUpdate: (update: Partial<LayerConfig>) => void;
  setDragDisabled: (disabled: boolean) => void;
}

export const TimeRangeConfig: React.FC<TimeRangeConfigProps> = ({ config, onUpdate, setDragDisabled }) => {
  const presets = [
    { name: 'Unix', format: '\\d+\\.\\d+' },
    { name: 'ISO', format: '\\d{4}-\\d{2}-\\d{2}[T\\s]\\d{2}:\\d{2}:\\d{2}' },
    { name: '[]', format: '\\[(.*?)\\]' },
  ];

  return (
    <div className="space-y-4">
      <ConfigSection>
        <ConfigLabel extra={
          <div className="flex gap-1">
            {presets.map(p => (
              <button 
                key={p.name}
                onClick={() => onUpdate({ timeFormat: p.format })} 
                className="hover:text-blue-400 transition-colors"
              >{p.name}</button>
            ))}
          </div>
        }>
          时间戳格式 (正则)
        </ConfigLabel>
        <textarea 
          className="bg-[#1e1e1e] border border-[#444] px-2 py-1.5 text-[10px] rounded text-purple-300 w-full font-mono focus:border-purple-500 outline-none min-h-[44px] resize-none leading-tight shadow-inner transition-all"
          value={config.timeFormat || ''} 
          onChange={(e) => onUpdate({ timeFormat: e.target.value })}
          placeholder="例如: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})" 
          onFocus={() => setDragDisabled(true)}
          onBlur={() => setDragDisabled(false)}
          spellCheck={false}
        />
      </ConfigSection>
      
      <div className="grid grid-cols-2 gap-2 no-drag">
        <ConfigSection>
          <ConfigLabel>起始</ConfigLabel>
          <ConfigInput 
            value={config.startTime || ''} 
            onChange={(e) => onUpdate({ startTime: e.target.value })}
            placeholder="00:00:00" 
            onFocus={() => setDragDisabled(true)}
            onBlur={() => setDragDisabled(false)}
          />
        </ConfigSection>
        <ConfigSection>
          <ConfigLabel>结束</ConfigLabel>
          <ConfigInput 
            value={config.endTime || ''} 
            onChange={(e) => onUpdate({ endTime: e.target.value })}
            placeholder="23:59:59" 
            onFocus={() => setDragDisabled(true)}
            onBlur={() => setDragDisabled(false)}
          />
        </ConfigSection>
      </div>
    </div>
  );
};
