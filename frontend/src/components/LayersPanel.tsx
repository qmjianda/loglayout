
import React, { useState } from 'react';
import { LogLayer, LayerType } from '../types';
import * as Configs from './layer-configs';

interface LayersPanelProps {
  layers: LogLayer[];
  stats: Record<string, { count: number; distribution: number[] }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, update: any) => void;
  onDrop: (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => void;
  onJumpToLine?: (index: number) => void;
}

const CONFIG_COMPONENTS: Partial<Record<LayerType, React.FC<any>>> = {
  [LayerType.FILTER]: Configs.FilterConfig,
  [LayerType.HIGHLIGHT]: Configs.HighlightConfig,
  [LayerType.RANGE]: Configs.RangeConfig,
  [LayerType.TIME_RANGE]: Configs.TimeRangeConfig,
  [LayerType.LEVEL]: Configs.LevelConfig,
  [LayerType.TRANSFORM]: Configs.TransformConfig,
};

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers, stats, selectedId, onSelect, onRemove, onToggle, onUpdate, onDrop
}) => {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'inside' | 'before' | 'after' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isInputActive, setIsInputActive] = useState(false);

  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    const target = e.target as HTMLElement;
    if (target.closest('.no-drag') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || editingId === id || isInputActive) {
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
      case LayerType.FILTER: return <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 4h18l-7 9v6l-4 2V13L3 4z" /></svg>;
      case LayerType.HIGHLIGHT: return <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>;
      case LayerType.RANGE: return <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M13 4l-2 16" /></svg>;
      case LayerType.TIME_RANGE: return <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
      case LayerType.TRANSFORM: return <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm4 4h8v8H8V8z" /></svg>;
      case LayerType.FOLDER: return <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>;
      case LayerType.LEVEL: return <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
      default: return <svg className="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    }
  };

  const renderLayerCard = (layer: LogLayer, depth: number = 0) => {
    const isSelected = selectedId === layer.id;
    const isDragOver = dragOverId === layer.id;
    const isFolder = layer.type === LayerType.FOLDER;
    const isEditing = editingId === layer.id;
    const parent = layer.groupId ? layers.find(l => l.id === layer.groupId) : null;
    const effectivelyDisabled = !layer.enabled || (parent && !parent.enabled);
    const ConfigComponent = CONFIG_COMPONENTS[layer.type];

    const layerColor = layer.config.color || (layer.type === LayerType.RANGE ? '#2dd4bf' : layer.type === LayerType.TIME_RANGE ? '#a855f7' : layer.type === LayerType.TRANSFORM ? '#fb923c' : layer.type === LayerType.LEVEL ? '#f87171' : '#3b82f6');
    const layerCount = stats[layer.id]?.count || 0;

    return (
      <div
        key={layer.id}
        draggable={!isEditing && !isInputActive}
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
        onMouseLeave={() => setHoveredLayerId(null)}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.no-drag')) return;
          if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON' && !target.closest('button')) {
            onSelect(layer.id);
          }
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) return;
          // Toggle collapse
          onUpdate(layer.id, { isCollapsed: !layer.isCollapsed });
        }}
        onDoubleClick={() => setEditingId(layer.id)}
        className={`flex flex-col border-b border-[#111] relative group transition-all duration-200 overflow-hidden
          ${isSelected ? 'bg-[#37373d]' : 'bg-[#252526] hover:bg-[#2d2d30]'}
          ${isDragOver && dropPosition === 'inside' ? 'bg-blue-500/15 drop-target-inside ring-1 ring-blue-500/50 ring-inset' : ''}
          ${effectivelyDisabled ? 'opacity-40' : ''}`}
      >
        {isDragOver && dropPosition === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500 z-50 pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.8)] flex items-center justify-center">
            <span className="bg-blue-500 text-white text-[9px] px-1.5 rounded-b shadow-md font-sans -mt-0.5">插入到上方</span>
          </div>
        )}
        {isDragOver && dropPosition === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 z-50 pointer-events-none shadow-[0_0_8px_rgba(59,130,246,0.8)] flex items-center justify-center">
            <span className="bg-blue-500 text-white text-[9px] px-1.5 rounded-t shadow-md font-sans -mb-0.5">插入到下方</span>
          </div>
        )}

        <div className={`flex items-center py-1 min-h-[32px] overflow-hidden`} style={{ paddingLeft: `${depth * 10 + 2}px` }}>
          <div
            className={`w-6 h-6 flex items-center justify-center shrink-0 cursor-pointer hover:bg-white/5 rounded transition-transform ${layer.isCollapsed ? '-rotate-90' : ''}`}
            onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { isCollapsed: !layer.isCollapsed }); }}
          >
            <svg className="w-2.5 h-2.5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
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
                onBlur={() => { setEditingId(null); setIsInputActive(false); }}
                onFocus={() => setIsInputActive(true)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                onMouseDown={e => e.stopPropagation()}
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
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {isSelected && !isFolder && !layer.isCollapsed && ConfigComponent && (
          <div
            className="px-3 pb-1 space-y-3 border-t border-black/10 pt-3 bg-black/5 shadow-inner"
            onMouseEnter={() => setIsInputActive(true)}
            onMouseLeave={() => setIsInputActive(false)}
            onMouseDown={e => e.stopPropagation()}
            style={{ paddingLeft: `${depth * 10 + 20}px` }}
          >
            <ConfigComponent
              config={layer.config}
              onUpdate={(cfg: any) => onUpdate(layer.id, { config: { ...layer.config, ...cfg } })}
              setDragDisabled={setIsInputActive}
            />
          </div>
        )}

      </div>
    );
  };

  const renderRecursive = (parentId: string | undefined = undefined, depth: number = 0) => {
    return layers
      .filter(l => l.groupId === parentId)
      .map(layer => (
        <React.Fragment key={layer.id}>
          {renderLayerCard(layer, depth)}
          {layer.type === LayerType.FOLDER && !layer.isCollapsed && renderRecursive(layer.id, depth + 1)}
        </React.Fragment>
      ));
  };

  return (
    <div className="flex flex-col pb-0">
      {renderRecursive()}
    </div>
  );
};
