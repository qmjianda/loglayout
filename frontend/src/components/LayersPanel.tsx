import React, { useState, useCallback, useRef, useEffect } from 'react';
import { LogLayer, LayerType } from '../types';
import { DynamicForm } from './DynamicUI/DynamicForm';
import { useLayerRegistry } from '../hooks/useLayerRegistry';

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
  isReadOnly?: boolean;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers, stats, selectedId, onSelect, onRemove, onToggle, onUpdate, onDrop, isReadOnly = false
}) => {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'inside' | 'before' | 'after' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isInputActive, setIsInputActive] = useState(false);
  const [editValue, setEditValue] = useState('');

  const { registry } = useLayerRegistry();

  const handleDragStart = (e: React.DragEvent, id: string) => {
    // Only allow dragging from a specific handle or if not clicking on controls
    const target = e.target as HTMLElement;
    if (target.closest('.no-drag') || target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button')) {
      e.preventDefault();
      return;
    }

    setDraggedLayerId(id);
    (window as any).__draggedLayerId = id;

    e.dataTransfer.setData('layerId', id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';

    // Set a clear drag image if possible (optional but good for consistency)
    const currentTarget = e.currentTarget as HTMLElement;
    currentTarget.classList.add('dragging');
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
    setDragOverId(null);
    setDropPosition(null);
    setDraggedLayerId(null);
    (window as any).__draggedLayerId = null;
  };

  const handleDragOver = (e: React.DragEvent, id: string, type: LayerType) => {
    e.preventDefault(); // IMPORTANT: Required to allow drop
    e.stopPropagation(); // STOP BUBBLING to prevent the parent from resetting state
    e.dataTransfer.dropEffect = 'move';

    const draggedId = (window as any).__draggedLayerId || draggedLayerId;
    if (draggedId === id) return;

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
    e.stopPropagation();
    if (isReadOnly) return;

    const draggedId = e.dataTransfer.getData('layerId') || (window as any).__draggedLayerId || draggedLayerId;

    if (draggedId && draggedId !== targetId && dropPosition) {
      onDrop(draggedId, targetId, dropPosition);
    }

    setDragOverId(null);
    setDropPosition(null);
    setDraggedLayerId(null);
    (window as any).__draggedLayerId = null;
  };

  const getLayerIcon = (layer: LogLayer) => {
    const entry = registry[layer.type];
    const iconKey = entry?.icon || 'default';

    const ICON_LIBRARY: Record<string, React.ReactNode> = {
      filter: <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 4h18l-7 9v6l-4 2V13L3 4z" /></svg>,
      highlight: <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>,
      range: <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M13 4l-2 16" /></svg>,
      time: <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
      transform: <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm4 4h8v8H8V8z" /></svg>,
      folder: <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>,
      level: <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
      default: <svg className="w-3.5 h-3.5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    };

    if (layer.type === LayerType.FOLDER) return ICON_LIBRARY.folder;
    return ICON_LIBRARY[iconKey] || ICON_LIBRARY.default;
  };

  const renderStatsBar = (layer: LogLayer) => {
    const distribution = stats[layer.id]?.distribution || [];
    if (distribution.length === 0) return null;
    return (
      <div className="flex h-1 gap-[1px] mt-0.5 opacity-60 px-4">
        {distribution.map((v, i) => (
          <div key={i} className="flex-1 bg-blue-500/20 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${v * 100}%` }} />
          </div>
        ))}
      </div>
    );
  };

  const renderLayerCard = (layer: LogLayer, depth: number = 0) => {
    const isSelected = selectedId === layer.id;
    const isDragOver = dragOverId === layer.id;
    const isFolder = layer.type === LayerType.FOLDER;
    const isEditing = editingId === layer.id;
    const parent = layer.groupId ? layers.find(l => l.id === layer.groupId) : null;
    const effectivelyDisabled = !layer.enabled || (parent && !parent.enabled);
    const registryEntry = registry[layer.type];
    const layerCount = stats[layer.id]?.count || 0;

    const saveName = () => {
      if (editValue.trim() && editValue.trim() !== layer.name) {
        onUpdate(layer.id, { name: editValue.trim() });
      }
      setEditingId(null);
      setIsInputActive(false);
    };

    return (
      <div
        key={layer.id}
        draggable={!isEditing && !isInputActive && !isReadOnly}
        onDragStart={(e) => isReadOnly ? e.preventDefault() : handleDragStart(e, layer.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, layer.id, layer.type)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverId(null);
            setDropPosition(null);
          }
        }}
        onDrop={(e) => handleDropLocal(e, layer.id)}
        className={`flex flex-col border-b border-[#111] relative group transition-all duration-200 select-none overflow-hidden
          ${isSelected ? 'bg-[#37373d]' : 'bg-[#252526] hover:bg-[#2d2d30]'}
          ${isDragOver && dropPosition === 'inside' ? 'bg-blue-500/15 ring-2 ring-blue-500/50 ring-inset' : ''}
          ${effectivelyDisabled ? 'opacity-40' : ''}`}
      >
        {/* Layer Header */}
        <div
          className="flex items-center min-h-[36px] px-2 space-x-1 relative"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={(e) => {
            if (isReadOnly) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('.no-drag')) return;

            if (selectedId !== layer.id) {
              onSelect(layer.id);
              if (layer.isCollapsed) onUpdate(layer.id, { isCollapsed: false });
            } else {
              onUpdate(layer.id, { isCollapsed: !layer.isCollapsed });
            }
          }}
          onDoubleClick={() => {
            if (!isReadOnly) {
              setEditingId(layer.id);
              setEditValue(layer.name);
              setIsInputActive(true);
            }
          }}
        >
          {/* Collapse toggle arrow */}
          <div className={`no-drag w-5 h-5 flex items-center justify-center shrink-0 text-gray-500 transition-transform cursor-pointer hover:text-gray-300
            ${(isFolder ? layer.isCollapsed : (!isSelected || layer.isCollapsed)) ? '-rotate-90' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(layer.id, { isCollapsed: !layer.isCollapsed });
            }}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </div>

          {/* Drag Handle Icon (visible on hover) */}
          <div className="w-4 h-5 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing text-gray-700 group-hover:text-gray-500 transition-colors">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 7a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2zm-6 4a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2zm3 0a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
          </div>

          <div className="shrink-0 w-6 h-6 flex items-center justify-center">{getLayerIcon(layer)}</div>

          {/* Name/Edit area */}
          <div className="flex-1 min-w-0 flex items-center">
            {isEditing ? (
              <input
                autoFocus
                className="no-drag w-full bg-[#1e1e1e] border border-blue-500 text-[11px] px-1 rounded text-white h-6 outline-none shadow-[0_0_5px_rgba(59,130,246,0.3)]"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') {
                    setEditingId(null);
                    setIsInputActive(false);
                  }
                }}
                onMouseDown={e => e.stopPropagation()}
              />
            ) : (
              <span className={`text-[11px] truncate leading-tight flex-1 ${isFolder ? 'font-bold text-gray-300' : 'text-gray-400'} ${isSelected ? 'text-white' : ''}`}>
                {layer.name}
              </span>
            )}
            {!isFolder && layerCount > 0 && (
              <span className="text-[9px] bg-black/40 px-1.5 py-0.5 rounded text-gray-500 font-mono ml-2 shrink-0 border border-white/5">
                {layerCount.toLocaleString()}
              </span>
            )}
          </div>

          {/* Actions */}
          {/* Actions - Visible on Hover OR if Selected */}
          <div className="no-drag flex items-center">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate(layer.id, { enabled: !layer.enabled }); }}
              className={`p-1.5 ${layer.enabled ? 'text-blue-500' : 'text-gray-400'} hover:bg-white/5 rounded`}
              title={layer.enabled ? '禁用' : '启用'}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(layer.id); }}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="删除"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>

        {/* Drop Indicators */}
        {isDragOver && dropPosition === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500 z-[100] pointer-events-none shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
        )}
        {isDragOver && dropPosition === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 z-[100] pointer-events-none shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
        )}

        {/* Nested Content Wrapper */}
        <div className={`flex flex-col ${(isFolder ? layer.isCollapsed : (!isSelected || layer.isCollapsed)) ? 'h-0 overflow-hidden' : ''}`}>
          {/* Config Form (only for non-folders) */}
          {!isFolder && isSelected && registryEntry && (
            <div
              className="no-drag px-3 pb-3 space-y-3 border-t border-black/10 pt-3 bg-black/5"
              onMouseEnter={() => setIsInputActive(true)}
              onMouseLeave={() => setIsInputActive(false)}
              onMouseDown={e => e.stopPropagation()}
              onDragOver={e => e.preventDefault()} // Prevent parent drag highlighting here
            >
              <DynamicForm
                registryEntry={registryEntry}
                config={layer.config}
                onUpdate={(cfg: any) => onUpdate(layer.id, { config: { ...layer.config, ...cfg } })}
              />
            </div>
          )}
        </div>

        {/* Render stats bar at bottom of card */}
        {!isFolder && isSelected && renderStatsBar(layer)}
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
    <div
      className="flex flex-col select-none"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Only target root if we're not over a specific card
        if (dragOverId === null) {
          setDragOverId('root');
          setDropPosition('after');
        }
      }}
      onDrop={(e) => {
        if (isReadOnly) return;
        const draggedId = e.dataTransfer.getData('layerId') || (window as any).__draggedLayerId;
        if (draggedId) {
          onDrop(draggedId, null, 'after');
        }
        setDragOverId(null);
        setDropPosition(null);
      }}
    >
      {renderRecursive()}
      {dragOverId === 'root' && (
        <div className="h-[2px] bg-blue-500 m-4 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
      )}
    </div>
  );
};
