import React, { useState, useRef, useEffect } from 'react';
import { LogLayer, LayerType } from '../types';
import { SearchInput } from './SearchInput';

interface LayersPanelProps {
  layers: LogLayer[];
  stats: Record<string, { count: number; distribution: number[] }>;
  rawCounts?: Record<string, number[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, update: any) => void;
  onDrop: (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => void;
  onJumpToLine?: (index: number) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ 
  layers, stats, rawCounts = {}, selectedId, onSelect, onRemove, onToggle, onUpdate, onDrop, onJumpToLine 
}) => {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'inside' | 'before' | 'after' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isInputHovered, setIsInputHovered] = useState(false);
  
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || editingId === id || isInputHovered) {
      e.preventDefault();
      return;
    }
    
    setDraggedLayerId(id);
    e.dataTransfer.setData('layerId', id);
    e.dataTransfer.effectAllowed = 'move';
    
    const currentTarget = e.currentTarget as HTMLElement;
    currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
    setDragOverId(null);
    setDropPosition(null);
    setDraggedLayerId(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string, type: LayerType) => {
    e.preventDefault();
    if (draggedLayerId === id) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    setDragOverId(id);
    
    if (type === LayerType.FOLDER) {
        if (y > rect.height * 0.25 && y < rect.height * 0.75) setDropPosition('inside');
        else if (y < rect.height / 2) setDropPosition('before');
        else setDropPosition('after');
    } else {
        if (y < rect.height / 2) setDropPosition('before');
        else setDropPosition('after');
    }
  };

  const handleDropLocal = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('layerId');
    if (draggedId && draggedId !== targetId && dropPosition) {
      onDrop(draggedId, targetId, dropPosition);
    }
    setDragOverId(null);
    setDropPosition(null);
    setDraggedLayerId(null);
  };

  const getLayerIcon = (layer: LogLayer) => {
    switch (layer.type) {
      case LayerType.FILTER: return <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 4h18l-7 9v6l-4 2V13L3 4z"/></svg>;
      case LayerType.HIGHLIGHT: return <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 110-18 9 9 0 010 18z"/></svg>;
      case LayerType.RANGE: return <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M13 4l-2 16" /></svg>;
      case LayerType.TIME_RANGE: return <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
      case LayerType.TRANSFORM: return <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm4 4h8v8H8V8z" /></svg>;
      case LayerType.FOLDER: return <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>;
      case LayerType.LEVEL: return <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>;
      default: return <svg className="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltipPos({ x: e.clientX + 15, y: e.clientY + 10 });
  };

  const renderLayerCard = (layer: LogLayer, depth: number = 0) => {
    const isSelected = selectedId === layer.id;
    const isDragOver = dragOverId === layer.id;
    const isDragging = draggedLayerId === layer.id;
    const isFolder = layer.type === LayerType.FOLDER;
    const isEditing = editingId === layer.id;
    const parent = layer.groupId ? layers.find(l => l.id === layer.groupId) : null;
    const effectivelyDisabled = !layer.enabled || (parent && !parent.enabled);

    const layerColor = layer.config.color || (layer.type === LayerType.RANGE ? '#2dd4bf' : layer.type === LayerType.TIME_RANGE ? '#a855f7' : layer.type === LayerType.TRANSFORM ? '#fb923c' : layer.type === LayerType.LEVEL ? '#f87171' : '#3b82f6');
    const layerCount = stats[layer.id]?.count || 0;

    return (
      <div 
        key={layer.id}
        draggable={!isEditing && !isInputHovered}
        onDragStart={(e) => handleDragStart(e, layer.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, layer.id, layer.type)}
        onDragLeave={(e) => { 
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverId(null); 
            setDropPosition(null); 
          }
        }}
        onDrop={(e) => handleDropLocal(e, layer.id)}
        onMouseEnter={() => !isFolder && setHoveredLayerId(layer.id)}
        onMouseLeave={() => setHoveredLayerId(null)}
        onMouseMove={handleMouseMove}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON' && !target.closest('button')) {
            onSelect(layer.id);
          }
        }}
        onDoubleClick={() => setEditingId(layer.id)}
        className={`flex flex-col border-b border-[#111] relative group transition-all overflow-hidden
          ${isSelected ? 'bg-[#37373d]' : 'bg-[#252526] hover:bg-[#2d2d30]'}
          ${isDragOver && dropPosition === 'inside' ? 'bg-blue-500/10' : ''}
          ${effectivelyDisabled ? 'opacity-40' : ''}`}
      >
        {isDragOver && dropPosition === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500 z-50 pointer-events-none" />
        )}
        {isDragOver && dropPosition === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 z-50 pointer-events-none" />
        )}

        <div className={`flex items-center py-1 min-h-[32px] overflow-hidden`} style={{ paddingLeft: `${depth * 10 + 2}px` }}>
          <div 
            className={`w-6 h-6 flex items-center justify-center shrink-0 cursor-pointer hover:bg-white/5 rounded transition-transform ${layer.isCollapsed ? '-rotate-90' : ''}`}
            onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { isCollapsed: !layer.isCollapsed }); }}
          >
            <svg className="w-2.5 h-2.5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </div>

          <div 
            className={`w-7 h-7 flex items-center justify-center shrink-0 cursor-pointer rounded ${layer.enabled ? 'text-gray-400' : 'text-gray-700'}`}
            onClick={(e) => { e.stopPropagation(); onToggle(layer.id); }}
            title={layer.enabled ? '点击禁用图层' : '点击启用图层'}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
          </div>

          <div className="w-7 h-7 flex items-center justify-center shrink-0">
             {getLayerIcon(layer)}
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-between ml-1 pr-1">
            {isEditing ? (
              <input 
                autoFocus className="bg-[#1e1e1e] border border-blue-500 text-[11px] px-1 rounded text-white w-full select-text h-5"
                value={layer.name} onChange={(e) => onUpdate(layer.id, { name: e.target.value })}
                onBlur={() => { setEditingId(null); setIsInputHovered(false); }} 
                onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                onMouseDown={e => e.stopPropagation()}
                onMouseEnter={() => setIsInputHovered(true)}
                onMouseLeave={() => setIsInputHovered(false)}
              />
            ) : (
              <span className={`text-[11px] truncate leading-tight flex-1 ${isFolder ? 'font-bold text-gray-300' : 'text-gray-400'}`}>{layer.name}</span>
            )}
            {!isFolder && layerCount > 0 && (
              <span className="text-[9px] bg-black/40 px-1 py-0.5 rounded text-gray-500 font-mono ml-2 shrink-0">
                {layerCount.toLocaleString()}
              </span>
            )}
          </div>

          <div className="w-8 h-8 flex items-center justify-center shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(layer.id); }} 
                className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-600 transition-opacity"
                title="删除图层"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
          </div>
        </div>

        {!isFolder && stats[layer.id] && (
            <div className="h-[2px] w-full flex space-x-[1px] relative overflow-hidden shrink-0">
                {stats[layer.id].distribution.map((v, i) => (
                    <div 
                        key={i} 
                        className="flex-1" 
                        style={{ backgroundColor: layerColor, opacity: Math.max(0.05, v * 0.8) }}
                    />
                ))}
            </div>
        )}

        {isSelected && !isFolder && !layer.isCollapsed && !isDragging && (
          <div className={`px-3 pb-3 space-y-2 border-t border-black/10 pt-3 bg-black/10`} style={{ paddingLeft: `${depth * 10 + 20}px` }}>
             {(layer.type === LayerType.FILTER || layer.type === LayerType.HIGHLIGHT || layer.type === LayerType.TRANSFORM) && (
                <SearchInput 
                  value={layer.config.query || ''}
                  onChange={(val) => onUpdate(layer.id, { config: { ...layer.config, query: val } })}
                  config={{ 
                    regex: layer.config.regex, 
                    caseSensitive: layer.config.caseSensitive, 
                    wholeWord: layer.config.wholeWord 
                  }}
                  onConfigChange={(cfg) => onUpdate(layer.id, { config: { ...layer.config, ...cfg } })}
                  placeholder={layer.type === LayerType.TRANSFORM ? "查找目标..." : "正则表达式或文本模式..."}
                  onMouseEnter={() => setIsInputHovered(true)}
                  onMouseLeave={() => setIsInputHovered(false)}
                />
             )}
             {layer.type === LayerType.FILTER && (
               <div className="flex items-center space-x-2 mt-1">
                 <button 
                   onClick={() => onUpdate(layer.id, { config: { ...layer.config, invert: !layer.config.invert } })}
                   className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${layer.config.invert ? 'bg-red-900/40 border-red-500 text-red-200' : 'bg-transparent border-gray-700 text-gray-500'}`}
                 >
                   反转过滤
                 </button>
                 <span className="text-[9px] text-gray-600 uppercase">排除匹配项</span>
               </div>
             )}
             {layer.type === LayerType.TRANSFORM && (
                <input 
                  className="bg-[#1e1e1e] border border-[#444] px-2 py-1 text-[11px] rounded text-gray-200 w-full select-text focus:outline-none focus:border-blue-500 h-6"
                  value={layer.config.replaceWith || ''} onChange={(e) => onUpdate(layer.id, { config: { ...layer.config, replaceWith: e.target.value } })}
                  placeholder="替换为..." 
                  onMouseDown={e => e.stopPropagation()}
                  onMouseEnter={() => setIsInputHovered(true)}
                  onMouseLeave={() => setIsInputHovered(false)}
                />
             )}
             {layer.type === LayerType.RANGE && (
                <div className="flex items-center space-x-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-gray-500 uppercase font-bold mb-0.5 block">起始行</label>
                    <input 
                      type="number"
                      className="bg-[#1e1e1e] border border-[#444] px-2 py-1 text-[10px] rounded text-gray-200 w-full select-text focus:outline-none focus:border-blue-500 h-6"
                      value={layer.config.from ?? ''} onChange={(e) => onUpdate(layer.id, { config: { ...layer.config, from: e.target.value === '' ? undefined : parseInt(e.target.value) } })}
                      placeholder="1" 
                      onMouseDown={e => e.stopPropagation()}
                      onMouseEnter={() => setIsInputHovered(true)}
                      onMouseLeave={() => setIsInputHovered(false)}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-gray-500 uppercase font-bold mb-0.5 block">结束行</label>
                    <input 
                      type="number"
                      className="bg-[#1e1e1e] border border-[#444] px-2 py-1 text-[10px] rounded text-gray-200 w-full select-text focus:outline-none focus:border-blue-500 h-6"
                      value={layer.config.to ?? ''} onChange={(e) => onUpdate(layer.id, { config: { ...layer.config, to: e.target.value === '' ? undefined : parseInt(e.target.value) } })}
                      placeholder="最大" 
                      onMouseDown={e => e.stopPropagation()}
                      onMouseEnter={() => setIsInputHovered(true)}
                      onMouseLeave={() => setIsInputHovered(false)}
                    />
                  </div>
                </div>
             )}
             {layer.type === LayerType.LEVEL && (
                <div className="flex flex-wrap gap-1">
                  {['INFO', 'WARN', 'ERROR', 'DEBUG', 'FATAL'].map(level => (
                    <button 
                      key={level}
                      onClick={() => {
                        const current = layer.config.levels || [];
                        const next = current.includes(level) ? current.filter(l => l !== level) : [...current, level];
                        onUpdate(layer.id, { config: { ...layer.config, levels: next }});
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${layer.config.levels?.includes(level) ? 'bg-red-900/40 border-red-500 text-red-200' : 'bg-transparent border-gray-700 text-gray-500'}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
             )}
             {layer.type === LayerType.TIME_RANGE && (
                <div className="space-y-3 bg-black/20 p-2 rounded border border-white/5">
                  <div className="flex flex-col space-y-1">
                    <div className="flex justify-between items-center">
                       <label className="text-[9px] text-gray-400 uppercase font-bold">时间匹配器 (正则)</label>
                       <div className="flex space-x-2">
                         <button 
                            onClick={() => onUpdate(layer.id, { config: { ...layer.config, timeFormat: '\\d+\\.\\d+' } })}
                            className="text-[8px] text-blue-400/70 hover:text-blue-400"
                          >数字</button>
                         <button 
                            onClick={() => onUpdate(layer.id, { config: { ...layer.config, timeFormat: '\\d{4}-\\d{2}-\\d{2}[T\\s]\\d{2}:\\d{2}:\\d{2}' } })}
                            className="text-[8px] text-purple-400/70 hover:text-purple-400"
                          >ISO日期</button>
                       </div>
                    </div>
                    <input 
                      className="bg-[#1e1e1e] border border-[#444] px-2 py-1 text-[10px] rounded text-purple-300 w-full font-mono select-text focus:outline-none focus:border-blue-500 h-6"
                      value={layer.config.timeFormat || ''} onChange={(e) => onUpdate(layer.id, { config: { ...layer.config, timeFormat: e.target.value } })}
                      placeholder="例如 (\d+\.\d+) 或 ISO 模式" 
                      onMouseDown={e => e.stopPropagation()}
                      onMouseEnter={() => setIsInputHovered(true)}
                      onMouseLeave={() => setIsInputHovered(false)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col space-y-1">
                      <label className="text-[9px] text-gray-400 uppercase font-bold">起始时间/值</label>
                      <input 
                        className="bg-[#1e1e1e] border border-[#444] px-2 py-1 text-[10px] rounded text-gray-200 w-full select-text focus:outline-none focus:border-blue-500 h-6"
                        value={layer.config.startTime || ''} onChange={(e) => onUpdate(layer.id, { config: { ...layer.config, startTime: e.target.value } })}
                        placeholder="0.0 或 日期" 
                        onMouseDown={e => e.stopPropagation()}
                        onMouseEnter={() => setIsInputHovered(true)}
                        onMouseLeave={() => setIsInputHovered(false)}
                      />
                    </div>
                    <div className="flex flex-col space-y-1">
                      <label className="text-[9px] text-gray-400 uppercase font-bold">结束时间/值</label>
                      <input 
                        className="bg-[#1e1e1e] border border-[#444] px-2 py-1 text-[10px] rounded text-gray-200 w-full select-text focus:outline-none focus:border-blue-500 h-6"
                        value={layer.config.endTime || ''} onChange={(e) => onUpdate(layer.id, { config: { ...layer.config, endTime: e.target.value } })}
                        placeholder="最大 或 日期" 
                        onMouseDown={e => e.stopPropagation()}
                        onMouseEnter={() => setIsInputHovered(true)}
                        onMouseLeave={() => setIsInputHovered(false)}
                      />
                    </div>
                  </div>
                  <p className="text-[8px] text-gray-500 italic px-1">提示: 使用正则括号 () 捕获特定的时间部分。</p>
                </div>
             )}
             {layer.type === LayerType.HIGHLIGHT && (
                <div className="flex items-center space-x-2">
                  <input type="color" value={layer.config.color || '#3b82f6'} onChange={e => onUpdate(layer.id, { config: { ...layer.config, color: e.target.value }})} className="w-5 h-5 bg-transparent border-none cursor-pointer p-0" title="高亮颜色" />
                  <input type="range" min="0" max="100" value={layer.config.opacity || 100} onChange={e => onUpdate(layer.id, { config: { ...layer.config, opacity: parseInt(e.target.value)}})} className="flex-1 h-1 bg-[#444] rounded appearance-none accent-blue-500" title="透明度" />
                </div>
             )}
          </div>
        )}
      </div>
    );
  };

  const renderRecursive = (parentId: string | undefined = undefined, depth: number = 0) => {
    return layers
      .filter(l => l.groupId === parentId)
      .map(layer => {
        const isFolder = layer.type === LayerType.FOLDER;
        return (
            <React.Fragment key={layer.id}>
                {renderLayerCard(layer, depth)}
                {isFolder && !layer.isCollapsed && renderRecursive(layer.id, depth + 1)}
            </React.Fragment>
        );
    });
  };

  const StatsTooltip = () => {
    if (!hoveredLayerId || !stats[hoveredLayerId]) return null;
    const layer = layers.find(l => l.id === hoveredLayerId);
    if (!layer) return null;
    const layerStats = stats[hoveredLayerId];
    const layerColor = layer.config.color || '#3b82f6';

    const style: React.CSSProperties = {
      position: 'fixed',
      left: tooltipPos.x,
      top: tooltipPos.y,
      zIndex: 1000,
      pointerEvents: 'none',
    };

    return (
      <div style={style} className="bg-[#2d2d30] border border-[#454545] shadow-2xl rounded p-3 w-48 text-[11px] text-[#cccccc] flex flex-col space-y-2 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center justify-between border-b border-white/5 pb-1">
          <span className="font-bold text-gray-400 truncate max-w-[100px]">{layer.name}</span>
          <span className="text-blue-400 font-mono">{layerStats.count.toLocaleString()}</span>
        </div>
        <div className="flex items-end space-x-[1px] h-12 bg-black/20 p-1 rounded mt-1">
          {layerStats.distribution.map((v, i) => (
            <div 
              key={i} 
              className="flex-1 transition-all duration-300" 
              style={{ 
                height: `${Math.max(4, v * 100)}%`, 
                backgroundColor: layerColor, 
                opacity: Math.max(0.2, v)
              }} 
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col pb-10">
      {renderRecursive()}
      <StatsTooltip />
    </div>
  );
};