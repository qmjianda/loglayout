
import React from 'react';
import { LayerConfig } from '../../types';
import { ConfigSection, ConfigLabel } from './ConfigShared';

interface LevelConfigProps {
  config: LayerConfig;
  onUpdate: (update: Partial<LayerConfig>) => void;
  setDragDisabled: (disabled: boolean) => void;
}

const LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG', 'FATAL'];

export const LevelConfig: React.FC<LevelConfigProps> = ({ config, onUpdate }) => (
  <ConfigSection>
    <ConfigLabel>日志等级筛选</ConfigLabel>
    <div className="flex flex-wrap gap-1 mt-1">
      {LEVELS.map(level => {
        const isActive = config.levels?.includes(level);
        return (
          <button 
            key={level}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const current = config.levels || [];
              const next = isActive ? current.filter(l => l !== level) : [...current, level];
              onUpdate({ levels: next });
            }}
            className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-all ${isActive 
              ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-[0_0_8px_rgba(59,130,246,0.2)]' 
              : 'bg-[#333] border-gray-700 text-gray-500 hover:text-gray-300'}`}
          >
            {level}
          </button>
        );
      })}
    </div>
  </ConfigSection>
);
