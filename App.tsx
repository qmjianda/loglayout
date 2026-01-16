import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { LogViewer } from './components/LogViewer';
import { LayersPanel } from './components/LayersPanel';
import { SearchPanel } from './components/SearchPanel';
import { EditorFindWidget } from './components/EditorFindWidget';
import { EditorGoToLineWidget } from './components/EditorGoToLineWidget';
import { PresetPanel } from './components/PresetPanel';
import { ExplorerPanel } from './components/ExplorerPanel';
import { HelpPanel } from './components/HelpPanel';
import { StatusBar } from './components/StatusBar';
import { LogLayer, LayerType, LogLine, LayerPreset } from './types';
import { processLayer } from './processors/index';

const DEFAULT_PRESET_ID = 'system-default-preset';
const MAX_HISTORY = 100;

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'explorer' | 'search' | 'layers' | 'presets' | 'help'>('layers');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [isFindVisible, setIsFindVisible] = useState(false);
  const [isGoToLineVisible, setIsGoToLineVisible] = useState(false);
  
  // Data State
  const [rawLogs, setRawLogs] = useState<string[]>([]);
  const [processedLogs, setProcessedLogs] = useState<LogLine[]>([]);
  const [layerStats, setLayerStats] = useState<Record<string, { count: number; distribution: number[] }>>({});
  const [rawStats, setRawStats] = useState<Record<string, number[]>>({});

  // Layers state with history
  const [layers, setLayersInternal] = useState<LogLayer[]>([]);
  const [past, setPast] = useState<LogLayer[][]>([]);
  const [future, setFuture] = useState<LogLayer[][]>([]);

  const [presets, setPresets] = useState<LayerPreset[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLayerProcessing, setIsLayerProcessing] = useState<boolean>(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchConfig, setSearchConfig] = useState({ regex: false, caseSensitive: false, wholeWord: false });
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const loadingAbortController = useRef<AbortController | null>(null);
  const processingTaskId = useRef<number>(0);

  // Helper to update layers with history
  const updateLayers = useCallback((updater: LogLayer[] | ((prev: LogLayer[]) => LogLayer[]), skipHistory = false) => {
    setLayersInternal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!skipHistory && JSON.stringify(prev) !== JSON.stringify(next)) {
        setPast(p => [...p.slice(-(MAX_HISTORY - 1)), prev]);
        setFuture([]);
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setLayersInternal(current => {
        setFuture(f => [current, ...f.slice(0, MAX_HISTORY - 1)]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[0];
      setLayersInternal(current => {
        setPast(p => [...p.slice(-(MAX_HISTORY - 1)), current]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      const isF = e.key.toLowerCase() === 'f';
      const isG = e.key.toLowerCase() === 'g';
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;

      if (isCmdOrCtrl && isZ) {
        e.preventDefault();
        if (isShift) redo();
        else undo();
      } else if (isCmdOrCtrl && isY) {
        e.preventDefault();
        redo();
      } else if (isCmdOrCtrl && isF) {
        e.preventDefault();
        const selection = window.getSelection()?.toString();
        if (selection) {
          const firstLine = selection.split(/\r?\n/)[0].trim();
          if (firstLine) {
            setSearchQuery(firstLine);
          }
        }
        setIsFindVisible(true);
      } else if (isCmdOrCtrl && isG) {
        e.preventDefault();
        setIsGoToLineVisible(true);
      } else if (e.key === 'Escape') {
        if (isFindVisible) setIsFindVisible(false);
        if (isGoToLineVisible) setIsGoToLineVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, isFindVisible, isGoToLineVisible]);

  // 初始化加载预设并应用默认值
  useEffect(() => {
    const saved = localStorage.getItem('loglayer_presets');
    let initialPresets: LayerPreset[] = [];
    
    if (saved) {
      try {
        initialPresets = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load presets", e);
      }
    }

    let defaultPreset = initialPresets.find(p => p.id === DEFAULT_PRESET_ID || p.name === '默认' || p.name === 'Default');
    
    if (!defaultPreset) {
      defaultPreset = {
        id: DEFAULT_PRESET_ID,
        name: '默认预设',
        layers: [
          { id: 'folder-1', name: '系统日志', type: LayerType.FOLDER, enabled: true, isCollapsed: false, config: {} },
          { id: '1', name: '仅限错误', type: LayerType.LEVEL, enabled: true, groupId: 'folder-1', config: { levels: ['ERROR', 'FATAL'] } }
        ]
      };
      initialPresets.unshift(defaultPreset);
    } else {
      defaultPreset.id = DEFAULT_PRESET_ID;
    }

    setPresets(initialPresets);
    updateLayers(JSON.parse(JSON.stringify(defaultPreset.layers)), true);
    localStorage.setItem('loglayer_presets', JSON.stringify(initialPresets));
  }, [updateLayers]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (loadingAbortController.current) loadingAbortController.current.abort();
    loadingAbortController.current = new AbortController();
    
    setFileName(file.name);
    setFileSize(file.size);
    setRawLogs([]);
    setLoadingProgress(0);
    setIsProcessing(true);

    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let partialLine = '';
    let loadedBytes = 0;
    const batchSize = 500000; 
    let currentBatch: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        loadedBytes += value.byteLength;
        const chunk = decoder.decode(value, { stream: true });
        const lines = (partialLine + chunk).split(/\r?\n/);
        partialLine = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          currentBatch.push(lines[i]);
          if (currentBatch.length >= batchSize) {
            setRawLogs(prev => prev.concat(currentBatch)); 
            currentBatch = [];
            setLoadingProgress(Math.round((loadedBytes / file.size) * 100));
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }

      if (partialLine || currentBatch.length > 0) {
        if (partialLine) currentBatch.push(partialLine);
        setRawLogs(prev => prev.concat(currentBatch));
      }
      setLoadingProgress(100);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error("Error reading file:", err);
    } finally {
      setIsProcessing(false);
      loadingAbortController.current = null;
    }
  };

  const runAsyncProcessing = useCallback(async (currentRawLogs: string[], currentLayers: LogLayer[], currentSearchQuery: string, currentSearchConfig: any) => {
    const taskId = ++processingTaskId.current;
    setIsLayerProcessing(true);

    const stats: Record<string, { count: number; distribution: number[] }> = {};
    const rawCounts: Record<string, number[]> = {};
    
    currentLayers.forEach(l => {
      stats[l.id] = { count: 0, distribution: new Array(20).fill(0) };
      rawCounts[l.id] = new Array(20).fill(0);
    });

    if (!currentRawLogs.length) {
      setProcessedLogs([]);
      setLayerStats(stats);
      setIsLayerProcessing(false);
      return;
    }

    const pipelineLayers = [...currentLayers];
    let searchLayerId = 'global-search-volatile';
    if (currentSearchQuery) {
      pipelineLayers.push({
        id: searchLayerId,
        name: '全局搜索',
        type: LayerType.HIGHLIGHT,
        enabled: true,
        config: { 
          query: currentSearchQuery, 
          ...currentSearchConfig,
          color: '#facc15', 
          opacity: 100 
        }
      });
      stats[searchLayerId] = { count: 0, distribution: new Array(20).fill(0) };
    }

    const activeLayers = pipelineLayers.filter(l => {
      if (!l.enabled || l.type === LayerType.FOLDER) return false;
      if (l.groupId) {
        const parent = currentLayers.find(p => p.id === l.groupId);
        if (parent && !parent.enabled) return false;
      }
      return true;
    });

    let activeLines: LogLine[] | null = null;
    let isObjectified = false;

    for (const layer of activeLayers) {
      if (taskId !== processingTaskId.current) return;
      const startTime = performance.now();
      const needsObject = layer.type === LayerType.HIGHLIGHT || layer.type === LayerType.TRANSFORM;

      if (needsObject && !isObjectified) {
        const source = activeLines ? activeLines : null;
        const totalToProcess = source ? source.length : currentRawLogs.length;
        const newLines: LogLine[] = new Array(totalToProcess);
        const step = 200000;
        for (let i = 0; i < totalToProcess; i += step) {
          if (taskId !== processingTaskId.current) return;
          const end = Math.min(i + step, totalToProcess);
          for (let j = i; j < end; j++) {
            newLines[j] = source ? source[j] : { index: j, content: currentRawLogs[j] };
          }
          if (performance.now() - startTime > 30) await new Promise(r => setTimeout(r, 0));
        }
        activeLines = newLines;
        isObjectified = true;
      }

      const input: LogLine[] = activeLines || currentRawLogs.map((c, i) => ({ index: i, content: c }));
      const chunkSize = Math.max(1, Math.ceil(input.length / 20));
      const { processedLines, stats: layerResult } = processLayer(input, layer, chunkSize);
      activeLines = processedLines;
      const maxDist = Math.max(...layerResult.distribution, 1);
      stats[layer.id] = { count: layerResult.count, distribution: layerResult.distribution.map(v => v / maxDist) };
      await new Promise(r => setTimeout(r, 5));
    }

    let finalLines: LogLine[] = activeLines || [];
    if (!activeLines && currentRawLogs.length > 0) {
        finalLines = new Array(currentRawLogs.length);
        for(let i=0; i<currentRawLogs.length; i++) finalLines[i] = { index: i, content: currentRawLogs[i] };
    }

    if (taskId === processingTaskId.current) {
      setProcessedLogs(finalLines);
      setLayerStats(stats);
      setRawStats(rawCounts);
      setIsLayerProcessing(false);
      setCurrentMatchIndex(-1);
    }
  }, []);

  useEffect(() => {
    const debounceTime = rawLogs.length > 5000000 ? 1500 : (rawLogs.length > 1000000 ? 800 : 250);
    const timer = setTimeout(() => {
      runAsyncProcessing(rawLogs, layers, searchQuery, searchConfig);
    }, debounceTime);
    return () => clearTimeout(timer);
  }, [rawLogs, layers, searchQuery, searchConfig, runAsyncProcessing]);

  const addLayer = (type: LayerType) => {
    const newId = Math.random().toString(36).substr(2, 9);
    let parentId: string | undefined = undefined;
    if (selectedLayerId) {
      const selected = layers.find(l => l.id === selectedLayerId);
      if (selected?.type === LayerType.FOLDER) parentId = selected.id;
      else if (selected?.groupId) parentId = selected.groupId;
    }

    const newLayer: LogLayer = {
      id: newId,
      name: type === LayerType.FOLDER ? '新建文件夹' : 
            type === LayerType.TIME_RANGE ? '时间过滤' : 
            type === LayerType.RANGE ? '行号范围' :
            type === LayerType.TRANSFORM ? '内容转换' :
            type === LayerType.LEVEL ? '日志等级' : 
            type === LayerType.FILTER ? '内容过滤' :
            type === LayerType.HIGHLIGHT ? '高亮图层' : '新建图层',
      type, enabled: true, groupId: parentId, isCollapsed: false,
      config: type === LayerType.HIGHLIGHT ? { color: '#3b82f6', opacity: 100, query: '' } : 
              type === LayerType.TIME_RANGE ? { startTime: '', endTime: '', timeFormat: '(\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2})' } : 
              type === LayerType.RANGE ? { from: 1, to: 1000 } :
              type === LayerType.TRANSFORM ? { query: '', replaceWith: '', regex: true } : 
              type === LayerType.LEVEL ? { levels: ['ERROR', 'WARN'] } : {}
    };
    updateLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newId);
  };

  const handleDrop = useCallback((draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => {
    updateLayers(prev => {
      const next = [...prev];
      const draggedIdx = next.findIndex(l => l.id === draggedId);
      if (draggedIdx === -1) return prev;
      const [draggedLayer] = next.splice(draggedIdx, 1);
      if (position === 'inside' && targetId) {
        draggedLayer.groupId = targetId;
        const targetIdx = next.findIndex(l => l.id === targetId);
        next.splice(targetIdx + 1, 0, draggedLayer);
      } else if (targetId) {
        const targetIdx = next.findIndex(l => l.id === targetId);
        draggedLayer.groupId = next[targetIdx].groupId;
        const finalIdx = position === 'before' ? targetIdx : targetIdx + 1;
        next.splice(finalIdx, 0, draggedLayer);
      } else {
        draggedLayer.groupId = undefined;
        next.push(draggedLayer);
      }
      return next;
    });
  }, [updateLayers]);

  const handleJumpToLine = (index: number) => {
    const total = processedLogs.length;
    if (total === 0) return;
    
    const boundedIndex = Math.max(0, Math.min(index, total - 1));
    setScrollToIndex(boundedIndex);
    setHighlightedIndex(boundedIndex);
    setTimeout(() => setScrollToIndex(null), 50);
  };

  const handleLogViewerInteraction = () => {
    if (highlightedIndex !== null) {
      setHighlightedIndex(null);
    }
    if (!isFindVisible && activeView !== 'search' && searchQuery) {
      setSearchQuery('');
    }
  };

  const findNextSearchMatch = useCallback((direction: 'next' | 'prev') => {
    if (!searchQuery || processedLogs.length === 0) return;

    let re: RegExp;
    try {
      let pattern = searchConfig.regex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (searchConfig.wholeWord) pattern = `\\b${pattern}\\b`;
      re = new RegExp(pattern, searchConfig.caseSensitive ? '' : 'i');
    } catch (e) { return; }

    const startIndex = currentMatchIndex === -1 ? 0 : currentMatchIndex;
    let nextIdx = -1;

    if (direction === 'next') {
      for (let i = startIndex + 1; i < processedLogs.length; i++) {
        if (re.test(processedLogs[i].content)) { nextIdx = i; break; }
      }
      if (nextIdx === -1) {
        for (let i = 0; i <= startIndex; i++) {
          if (re.test(processedLogs[i].content)) { nextIdx = i; break; }
        }
      }
    } else {
      for (let i = startIndex - 1; i >= 0; i--) {
        if (re.test(processedLogs[i].content)) { nextIdx = i; break; }
      }
      if (nextIdx === -1) {
        for (let i = processedLogs.length - 1; i >= startIndex; i--) {
          if (re.test(processedLogs[i].content)) { nextIdx = i; break; }
        }
      }
    }

    if (nextIdx !== -1) {
      setCurrentMatchIndex(nextIdx);
      handleJumpToLine(nextIdx);
    }
  }, [searchQuery, processedLogs, searchConfig, currentMatchIndex, handleJumpToLine]);

  const handleSavePreset = () => {
    const presetName = prompt("输入预设名称 (输入 '默认' 将更新系统设置):");
    if (!presetName) return;

    setPresets(prev => {
      let next = [...prev];
      const existingIdx = next.findIndex(p => p.name.toLowerCase() === presetName.toLowerCase());
      const newPreset = { 
        id: existingIdx >= 0 ? next[existingIdx].id : Date.now().toString(), 
        name: existingIdx >= 0 ? next[existingIdx].name : presetName, 
        layers: JSON.parse(JSON.stringify(layers)) 
      };
      if (existingIdx >= 0) next[existingIdx] = newPreset;
      else next = [newPreset, ...next];
      localStorage.setItem('loglayer_presets', JSON.stringify(next));
      return next;
    });
    setSaveStatus('saved'); 
    setTimeout(()=>setSaveStatus('idle'), 1000); 
  };

  const activeStats = useMemo(() => ({ ...layerStats }), [layerStats]);
  const searchMatchCount = useMemo(() => layerStats['global-search-volatile']?.count || 0, [layerStats]);

  const currentMatchNumber = useMemo(() => {
    if (currentMatchIndex === -1 || !searchQuery) return 0;
    let re: RegExp;
    try {
      let pattern = searchConfig.regex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (searchConfig.wholeWord) pattern = `\\b${pattern}\\b`;
      re = new RegExp(pattern, searchConfig.caseSensitive ? '' : 'i');
    } catch (e) { return 0; }
    let count = 0;
    for (let i = 0; i <= currentMatchIndex; i++) {
      if (re.test(processedLogs[i].content)) count++;
    }
    return count;
  }, [currentMatchIndex, searchQuery, searchConfig, processedLogs]);

  return (
    <div className="flex flex-col h-screen select-none overflow-hidden text-sm bg-[#1e1e1e] text-[#cccccc]">
      <div className="h-9 bg-[#2d2d2d] flex items-center px-4 border-b border-[#111] shrink-0 justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-blue-400 font-black tracking-tighter flex items-center cursor-default">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5-10-5zM2 17l10 5 10-5-10-5-10 5zM2 12l10 5 10-5-10-5-10 5z"/></svg>
            LOGLAYER PRO
          </span>
          <label className="cursor-pointer text-[10px] font-bold text-gray-400 hover:text-white bg-[#3c3c3c] px-2 py-1 rounded transition-all hover:bg-[#444]">
            {isProcessing ? `加载中 ${loadingProgress}%` : '打开日志'}
            <input type="file" className="hidden" onChange={handleFileUpload} disabled={isProcessing} />
          </label>
        </div>
        <div className="text-[10px] text-gray-500 font-mono truncate max-w-xs">{fileName || (isProcessing ? '正在解析文件...' : '就绪')}</div>
      </div>

      {(isProcessing || isLayerProcessing) && (
        <div className="h-0.5 w-full bg-[#111] overflow-hidden relative">
          <div className={`h-full bg-blue-500 transition-all duration-300 ${isLayerProcessing ? 'animate-pulse' : ''}`} 
               style={{ width: isLayerProcessing ? '100%' : `${loadingProgress}%` }} />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={activeView} onSetActiveView={setActiveView} />
        <div className="w-72 bg-[#252526] border-r border-[#111] flex flex-col shrink-0 shadow-lg">
          {activeView === 'explorer' && <ExplorerPanel fileName={fileName} fileSize={fileSize} onFileSelect={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} />}
          {activeView === 'layers' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-[#111] bg-[#2d2d2d] shrink-0">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[10px] uppercase font-black opacity-40 tracking-wider">图层面板</h2>
                    <div className="flex items-center space-x-0.5 border-l border-white/10 pl-2">
                        <button onClick={undo} disabled={past.length === 0} className={`p-1 rounded ${past.length > 0 ? 'text-gray-400 hover:bg-[#444] hover:text-white' : 'text-gray-700 cursor-not-allowed'}`} title="撤销 (Ctrl+Z)">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                        </button>
                        <button onClick={redo} disabled={future.length === 0} className={`p-1 rounded ${future.length > 0 ? 'text-gray-400 hover:bg-[#444] hover:text-white' : 'text-gray-700 cursor-not-allowed'}`} title="重做 (Ctrl+Y)">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/></svg>
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1 items-center">
                  <button onClick={() => addLayer(LayerType.FOLDER)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-gray-400" title="添加文件夹"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></button>
                  <button onClick={() => addLayer(LayerType.FILTER)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-blue-400" title="添加内容过滤"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 4h18l-7 9v6l-4 2V13L3 4z"/></svg></button>
                  <button onClick={() => addLayer(LayerType.HIGHLIGHT)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-yellow-400" title="添加高亮图层"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21a9 9 0 110-18 9 9 0 010 18z"/></svg></button>
                  <button onClick={() => addLayer(LayerType.TIME_RANGE)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-purple-400" title="添加时间过滤器"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                  <button onClick={() => addLayer(LayerType.LEVEL)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-red-400" title="添加等级过滤器"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></button>
                  <button onClick={() => addLayer(LayerType.RANGE)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-teal-400" title="添加行号范围过滤器"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M13 4l-2 16" /></svg></button>
                  <button onClick={() => addLayer(LayerType.TRANSFORM)} className="w-7 h-7 flex items-center justify-center hover:bg-[#444] rounded text-orange-400" title="添加转换图层"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm4 4h8v8H8V8z"/></svg></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <LayersPanel 
                  layers={layers} stats={layerStats} rawCounts={rawStats}
                  selectedId={selectedLayerId} onSelect={setSelectedLayerId} onDrop={handleDrop}
                  onJumpToLine={handleJumpToLine}
                  onRemove={(id) => updateLayers(prev => prev.filter(l => l.id !== id && l.groupId !== id))} 
                  onToggle={(id) => updateLayers(prev => prev.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l))} 
                  onUpdate={(id, update) => updateLayers(prev => prev.map(l => l.id === id ? { ...l, ...update } : l))}
                />
              </div>
              <div className="p-2 border-t border-[#111] bg-[#2d2d2d] shrink-0">
                <button onClick={handleSavePreset} className={`w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-wider ${saveStatus === 'saved' ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'} text-white shadow-lg transition-all`}>
                  {saveStatus === 'saved' ? '已更新' : '保存当前图层组'}
                </button>
              </div>
            </div>
          )}
          {activeView === 'search' && (
            <SearchPanel 
              onSearch={setSearchQuery} 
              config={searchConfig} 
              setConfig={setSearchConfig}
              matchCount={searchMatchCount}
              onNavigate={findNextSearchMatch}
              currentIndex={currentMatchNumber}
            />
          )}
          {activeView === 'presets' && <PresetPanel presets={presets} onApply={(p)=>updateLayers(JSON.parse(JSON.stringify(p.layers)))} onDelete={(id) => {
            const next = presets.filter(p => p.id !== id);
            setPresets(next);
            localStorage.setItem('loglayer_presets', JSON.stringify(next));
          }} />}
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] relative select-text">
          {activeView === 'help' ? (
            <HelpPanel />
          ) : (
            <>
              {isLayerProcessing && (
                <div className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center pointer-events-none backdrop-blur-[2px]">
                  <div className="bg-[#252526] px-8 py-5 rounded border border-[#444] shadow-2xl flex flex-col items-center space-y-4">
                    <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent animate-spin rounded-full"></div>
                    <div className="flex flex-col items-center">
                      <span className="text-[12px] font-black tracking-[0.2em] text-blue-400 uppercase">正在更新处理管道</span>
                      <span className="text-[10px] text-gray-500 font-mono mt-2 italic">正在优化 {processedLogs.length.toLocaleString()} 行数据...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {isFindVisible && (
                <EditorFindWidget 
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  config={searchConfig}
                  onConfigChange={setSearchConfig}
                  matchCount={searchMatchCount}
                  currentMatch={currentMatchNumber}
                  onNavigate={findNextSearchMatch}
                  onClose={() => setIsFindVisible(false)}
                />
              )}

              {isGoToLineVisible && (
                <EditorGoToLineWidget 
                  totalLines={processedLogs.length}
                  onGo={(lineNum) => {
                    handleJumpToLine(lineNum - 1);
                    setIsGoToLineVisible(false);
                  }}
                  onClose={() => setIsGoToLineVisible(false)}
                />
              )}

              <LogViewer 
                lines={processedLogs} 
                searchQuery={searchQuery} 
                searchConfig={searchConfig} 
                scrollToIndex={scrollToIndex}
                highlightedIndex={highlightedIndex}
                onLineClick={handleLogViewerInteraction}
              />
              
              <div className="absolute right-0 top-0 bottom-0 w-3 bg-black/20 pointer-events-none border-l border-white/5 select-none">
                {Object.keys(activeStats).map(layerId => {
                   const stats = activeStats[layerId];
                   const layer = layers.find(l => l.id === layerId) || (layerId === 'global-search-volatile' ? { type: LayerType.HIGHLIGHT, config: { color: '#facc15' }, enabled: true } : null);
                   if (!layer || !layer.enabled || !stats) return null;
                   
                   return stats.distribution.map((d, i) => d > 0 && (
                     <div key={`${layerId}-${i}`} className="absolute w-full" style={{ top: `${(i/20)*100}%`, height: '5%', backgroundColor: layer.config.color || '#3b82f6', opacity: d * 0.6 }} />
                   ));
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <StatusBar lines={processedLogs.length} totalLines={rawLogs.length} size={fileSize} isProcessing={isProcessing || isLayerProcessing} />
    </div>
  );
};

export default App;