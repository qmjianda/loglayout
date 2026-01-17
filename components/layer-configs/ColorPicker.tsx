
import React from 'react';
import { ConfigLabel } from './ConfigShared';

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', 
  '#06b6d4', '#f97316', '#a855f7', '#2dd4bf', '#84cc16', '#64748b',
];

interface ColorPickerProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  setDragDisabled: (disabled: boolean) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ selectedColor, onColorChange, setDragDisabled }) => (
  <div 
    className="flex flex-col space-y-1.5 no-drag" 
    onMouseEnter={() => setDragDisabled(true)}
    onMouseLeave={() => setDragDisabled(false)}
  >
    <ConfigLabel>图层颜色</ConfigLabel>
    <div className="grid grid-cols-6 gap-1 p-1 bg-black/30 rounded border border-white/5">
      {PRESET_COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={(e) => { e.stopPropagation(); onColorChange(color); }}
          className={`w-4 h-4 rounded-sm transition-transform hover:scale-110 active:scale-95 ${selectedColor === color ? 'ring-2 ring-white ring-inset scale-110' : ''}`}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
      <div className="relative w-4 h-4 overflow-hidden rounded-sm ring-1 ring-white/10 hover:scale-110 bg-gradient-to-br from-white via-gray-400 to-black">
        <input 
          type="color" 
          value={selectedColor} 
          onChange={(e) => { e.stopPropagation(); onColorChange(e.target.value); }}
          onFocus={() => setDragDisabled(true)}
          onBlur={() => setDragDisabled(false)}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="absolute -inset-2 w-12 h-12 cursor-pointer bg-transparent border-none p-0 opacity-0"
          title="自定义颜色"
        />
        <svg className="absolute inset-0 m-auto w-2 h-2 text-white drop-shadow-md pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
      </div>
    </div>
  </div>
);
