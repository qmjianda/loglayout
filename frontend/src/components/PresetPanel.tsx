import React from 'react';
import { LayerPreset } from '../types';

const DEFAULT_PRESET_NAME = '默认预设';

interface PresetPanelProps {
  presets: LayerPreset[];
  onApply: (preset: LayerPreset) => void;
  onDelete: (id: string) => void;
}

export const PresetPanel: React.FC<PresetPanelProps> = ({ presets, onApply, onDelete }) => {
  return (
    <div className="p-4 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] uppercase tracking-wider font-bold opacity-70">已存预设</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
        {presets.map(preset => {
          const isDefault = preset.name === '默认预设' || preset.name === 'Default';
          
          return (
            <div 
              key={preset.id} 
              className={`group relative border rounded p-3 transition-all cursor-pointer shadow-sm
                ${isDefault 
                  ? 'bg-blue-900/10 border-blue-500/40 hover:bg-blue-900/20' 
                  : 'bg-[#3c3c3c] border-[#444] hover:border-blue-500 hover:bg-[#444]'
                }`} 
              onClick={() => onApply(preset)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className={`text-xs font-bold flex items-center ${isDefault ? 'text-blue-400' : 'text-gray-200 group-hover:text-blue-400'}`}>
                  {preset.name}
                  {isDefault && (
                    <span className="ml-2 px-1 text-[8px] bg-blue-600 text-white rounded font-black tracking-tighter">系统</span>
                  )}
                </div>
              </div>
              
              <div className="text-[10px] text-gray-500 uppercase flex items-center space-x-2">
                <span>{preset.layers.length} 个图层</span>
                <span>•</span>
                <span>{preset.layers.filter(l => l.type === 'FOLDER').length} 个文件夹</span>
              </div>

              {!isDefault && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
                  className="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除预设"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              )}
              
              {isDefault && (
                <div className="absolute top-2 right-2 text-blue-500/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
        
        {presets.length === 0 && (
          <div className="text-center py-10 text-gray-600 italic text-[11px]">
            尚未保存任何预设。
          </div>
        )}
      </div>

      <div className="mt-4 p-2 bg-blue-500/5 border border-blue-500/10 rounded">
        <p className="text-[9px] text-gray-500 leading-relaxed">
          <span className="text-blue-400 font-bold">专业提示:</span> 更新 <span className="text-blue-400 font-bold">默认预设</span> 可更改您的启动环境。系统预设是永久性的，但可以完全自定义。
        </p>
      </div>
    </div>
  );
};