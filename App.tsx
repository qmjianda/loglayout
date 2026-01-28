
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Sidebar } from './components/Sidebar';
import { LogViewer } from './components/LogViewer';
import { SearchPanel } from './components/SearchPanel';
import { EditorFindWidget } from './components/EditorFindWidget';
import { EditorGoToLineWidget } from './components/EditorGoToLineWidget';
import { UnifiedPanel, FileInfo } from './components/UnifiedPanel';
import { HelpPanel } from './components/HelpPanel';
import { StatusBar } from './components/StatusBar';
import { LogLayer, LayerType, LogLine, LayerPreset } from './types';
import { processLayer } from './processors/index';

const DEFAULT_PRESET_ID = 'system-default-preset';
const MAX_HISTORY = 100;

// Panel Interface
interface Pane {
  id: string;
  fileId: string | null;
}

// File Data Interface
interface FileData {
  id: string;
  name: string;
  size: number;
  lines: string[];
  lineCount: number;
  layers: LogLayer[];
  history?: {
    past: LogLayer[][];
    future: LogLayer[][];
  };
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'main' | 'search' | 'help'>('main');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [isFindVisible, setIsFindVisible] = useState(false);
  const [isGoToLineVisible, setIsGoToLineVisible] = useState(false);

  // Multi-File Management
  const [files, setFiles] = useState<FileData[]>([]);

  // Split View Management
  const [panes, setPanes] = useState<Pane[]>([{ id: 'pane-1', fileId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');

  // Derived Active File (based on active pane)
  const activePane = panes.find(p => p.id === activePaneId);
  // Helper to set active file for current pane
  const setActiveFileId = (fileId: string | null) => {
    setPanes(prev => prev.map(p => p.id === activePaneId ? { ...p, fileId } : p));
  };
  const activeFileId = activePane?.fileId || null;
  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

  const rawLogs = activeFile?.lines || [];
  const fileName = activeFile?.name || '';
  const fileSize = activeFile?.size || 0;

  // Layers state derived from active file
  const layers = activeFile?.layers || [];
  const past = activeFile?.history?.past || [];
  const future = activeFile?.history?.future || [];

  // Processing Cache (Per File)
  const [processedCache, setProcessedCache] = useState<Record<string, {
    logs: Array<LogLine | string>;
    stats: Record<string, { count: number; distribution: number[] }>;
    rawStats: Record<string, number[]>;
  }>>({});

  // Convenience accessors for Active File (to maintain compatibility with existing logic components)
  const activeProcessed = activeFileId ? processedCache[activeFileId] : null;
  const processedLogs = activeProcessed?.logs || [];
  const layerStats = activeProcessed?.stats || {};
  const rawStats = activeProcessed?.rawStats || {};

  const [presets, setPresets] = useState<LayerPreset[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(288); // Default 72 * 4 = 288px
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLayerProcessing, setIsLayerProcessing] = useState<boolean>(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchConfig, setSearchConfig] = useState({ regex: false, caseSensitive: false, wholeWord: false });
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const loadingAbortController = useRef<AbortController | null>(null);
  const processingTaskId = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // 文件信息列表（用于 UnifiedPanel）
  const fileInfoList: FileInfo[] = useMemo(() =>
    files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      isActive: f.id === activeFileId,
      lineCount: f.lineCount,
      layers: f.layers // Pass layers for tree view
    })), [files, activeFileId]);

  // Use a ref to access the latest layers inside effects without triggering them
  const layersRef = useRef<LogLayer[]>(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Compute a functional hash of the layers that actually affect log processing
  const layersFunctionalHash = useMemo(() => {
    return JSON.stringify(layers.map(l => [
      l.id,
      l.enabled,
      l.groupId,
      l.type,
      l.config
    ]));
  }, [layers]);

  // Helper to update layers with history for the ACTIVE file
  const updateLayers = useCallback((updater: LogLayer[] | ((prev: LogLayer[]) => LogLayer[]), skipHistory = false) => {
    if (!activeFileId) return;

    setFiles(prevFiles => prevFiles.map(file => {
      if (file.id !== activeFileId) return file;

      const currentLayers = file.layers || [];
      const nextLayers = typeof updater === 'function' ? updater(currentLayers) : updater;

      // History logic
      let newHistory = file.history || { past: [], future: [] };
      if (!skipHistory && JSON.stringify(currentLayers) !== JSON.stringify(nextLayers)) {
        newHistory = {
          past: [...newHistory.past, currentLayers].slice(-(MAX_HISTORY - 1)),
          future: []
        };
      }

      return { ...file, layers: nextLayers, history: newHistory };
    }));
  }, [activeFileId]);

  const undo = useCallback(() => {
    if (!activeFileId) return;
    setFiles(prev => prev.map(file => {
      if (file.id !== activeFileId || !file.history || file.history.past.length === 0) return file;

      const previous = file.history.past[file.history.past.length - 1];
      const newPast = file.history.past.slice(0, -1);
      const newFuture = [file.layers, ...file.history.future].slice(0, MAX_HISTORY - 1);

      return {
        ...file,
        layers: previous,
        history: { past: newPast, future: newFuture }
      };
    }));
  }, [activeFileId]);

  const redo = useCallback(() => {
    if (!activeFileId) return;
    setFiles(prev => prev.map(file => {
      if (file.id !== activeFileId || !file.history || file.history.future.length === 0) return file;

      const next = file.history.future[0];
      const newFuture = file.history.future.slice(1);
      const newPast = [...file.history.past, file.layers].slice(-(MAX_HISTORY - 1));

      return {
        ...file,
        layers: next,
        history: { past: newPast, future: newFuture }
      };
    }));
  }, [activeFileId]);

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
    // updateLayers call removed as we rely on per-file initialization
    localStorage.setItem('loglayer_presets', JSON.stringify(initialPresets));
  }, []); // Remove updateLayers dependency

  // 处理单个文件
  const processFile = async (file: File): Promise<FileData> => {
    console.log('[processFile] Starting to process file:', file.name, 'Size:', file.size);

    try {
      const stream = file.stream();
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let partialLine = '';
      let loadedBytes = 0;

      const allLines: string[] = [];
      const updateFrequency = 100000;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        loadedBytes += value.byteLength;
        const chunk = decoder.decode(value, { stream: true });
        const lines = (partialLine + chunk).split(/\r?\n/);
        partialLine = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          allLines.push(lines[i]);
          if (allLines.length % updateFrequency === 0) {
            setLoadingProgress(Math.round((loadedBytes / file.size) * 100));
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }

      if (partialLine) {
        allLines.push(partialLine);
      }

      console.log('[processFile] Finished processing file:', file.name, 'Lines:', allLines.length);

      return {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        lines: allLines,
        lineCount: allLines.length,
        layers: [], // 将在调用处被覆盖或初始化
        history: { past: [], future: [] }
      };
    } catch (error) {
      console.error('[processFile] Error processing file:', file.name, error);
      throw error;
    }
  };

  // 处理文件上传
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[handleFileUpload] Event triggered');
    const rawFiles = event.target.files;
    console.log('[handleFileUpload] Files:', rawFiles?.length || 0);

    if (!rawFiles || rawFiles.length === 0) {
      console.log('[handleFileUpload] No files selected, returning');
      return;
    }

    // 关键修正：将 FileList 转换为数组，保存文件引用
    const fileList = Array.from(rawFiles) as File[];

    event.target.value = '';

    if (loadingAbortController.current) loadingAbortController.current.abort();
    loadingAbortController.current = new AbortController();

    setLoadingProgress(0);
    setIsProcessing(true);
    console.log('[handleFileUpload] Starting to process', fileList.length, 'files');

    try {
      const newFiles: FileData[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        console.log('[handleFileUpload] Processing file', i + 1, ':', file.name);
        const fileData = await processFile(file);

        // Initialize layers from default preset
        const defaultPreset = presets.find(p => p.id === DEFAULT_PRESET_ID);
        if (defaultPreset) {
          fileData.layers = JSON.parse(JSON.stringify(defaultPreset.layers));
        }

        newFiles.push(fileData);
      }

      console.log('[handleFileUpload] All files processed. Setting state...');
      setFiles(prev => [...prev, ...newFiles]);

      // 激活新加载的第一个文件
      if (newFiles.length > 0) {
        console.log('[handleFileUpload] Activating file:', newFiles[0].id);
        setActiveFileId(newFiles[0].id);
      }

      setLoadingProgress(100);
      console.log('[handleFileUpload] Done!');
    } catch (err) {
      console.error('[handleFileUpload] Error:', err);
      if ((err as Error).name !== 'AbortError') console.error("Error reading file:", err);
    } finally {
      setIsProcessing(false);
      loadingAbortController.current = null;
    }
  };

  // 处理文件夹上传
  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    event.target.value = '';

    // 过滤日志文件
    const allFiles = Array.from(fileList) as File[];
    const logFiles = allFiles.filter(file =>
      file.name.endsWith('.log') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.json') ||
      !file.name.includes('.')
    );

    if (logFiles.length === 0) {
      alert('未找到日志文件（.log, .txt, .json）');
      return;
    }

    if (loadingAbortController.current) loadingAbortController.current.abort();
    loadingAbortController.current = new AbortController();

    setLoadingProgress(0);
    setIsProcessing(true);

    try {
      const newFiles: FileData[] = [];

      for (let i = 0; i < logFiles.length; i++) {
        const file = logFiles[i];
        setLoadingProgress(Math.round((i / logFiles.length) * 100));
        const fileData = await processFile(file);
        newFiles.push(fileData);
      }

      setFiles(prev => [...prev, ...newFiles]);

      if (!activeFileId && newFiles.length > 0) {
        setActiveFileId(newFiles[0].id);
      }

      setLoadingProgress(100);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error("Error reading files:", err);
    } finally {
      setIsProcessing(false);
      loadingAbortController.current = null;
    }
  };

  // 激活文件
  const handleFileActivate = (fileId: string) => {
    setActiveFileId(fileId);
  };

  // 移除文件
  const handleFileRemove = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    if (activeFileId === fileId) {
      const remaining = files.filter(f => f.id !== fileId);
      setActiveFileId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const runAsyncProcessing = useCallback(async (targetFileId: string, currentRawLogs: string[], currentLayers: LogLayer[], currentSearchQuery: string, currentSearchConfig: any) => {
    const taskId = ++processingTaskId.current;
    setIsLayerProcessing(true);

    const stats: Record<string, { count: number; distribution: number[] }> = {};
    const rawCounts: Record<string, number[]> = {};

    currentLayers.forEach(l => {
      stats[l.id] = { count: 0, distribution: new Array(20).fill(0) };
      rawCounts[l.id] = new Array(20).fill(0);
    });

    if (!currentRawLogs.length) {
      setProcessedCache(prev => ({
        ...prev,
        [targetFileId]: { logs: [], stats: stats, rawStats: {} }
      }));
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

    if (activeLayers.length === 0) {
      setProcessedCache(prev => ({
        ...prev,
        [targetFileId]: { logs: currentRawLogs, stats: stats, rawStats: rawCounts }
      }));
      setIsLayerProcessing(false);
      return;
    }

    let activeLines: Array<LogLine | string> | null = null;
    let isObjectified = false;

    for (const layer of activeLayers) {
      if (taskId !== processingTaskId.current) return;
      const startTime = performance.now();

      const needsObject = layer.type === LayerType.HIGHLIGHT || layer.type === LayerType.TRANSFORM;

      if (needsObject && !isObjectified) {
        const source = activeLines ? activeLines : currentRawLogs;
        const totalToProcess = source.length;
        const newLines: LogLine[] = new Array(totalToProcess);

        const batchSize = 500000;
        for (let i = 0; i < totalToProcess; i += batchSize) {
          if (taskId !== processingTaskId.current) return;
          const end = Math.min(i + batchSize, totalToProcess);

          for (let j = i; j < end; j++) {
            const line = source[j];
            newLines[j] = typeof line === 'string'
              ? { index: j, content: line }
              : line;
          }

          if (end < totalToProcess) {
            await new Promise(r => setTimeout(r, 0));
          }
        }
        activeLines = newLines;
        isObjectified = true;
      }

      const input: Array<LogLine | string> = activeLines || currentRawLogs;
      const chunkSize = Math.max(1, Math.ceil(input.length / 20));
      const { processedLines, stats: layerResult } = processLayer(input, layer, chunkSize);
      activeLines = processedLines;
      const maxDist = Math.max(...layerResult.distribution, 1);
      stats[layer.id] = { count: layerResult.count, distribution: layerResult.distribution.map(v => v / maxDist) };
      await new Promise(r => setTimeout(r, 5));
    }

    let finalLines: Array<LogLine | string> = activeLines || currentRawLogs;

    if (taskId === processingTaskId.current) {
      setProcessedCache(prev => ({
        ...prev,
        [targetFileId]: { logs: finalLines, stats: stats, rawStats: rawCounts }
      }));
      setIsLayerProcessing(false);
      setCurrentMatchIndex(-1);
    }
  }, []);

  useEffect(() => {
    if (!activeFileId) return;
    const debounceTime = rawLogs.length > 5000000 ? 1500 : (rawLogs.length > 1000000 ? 800 : 250);
    const timer = setTimeout(() => {
      runAsyncProcessing(activeFileId, rawLogs, layersRef.current, searchQuery, searchConfig);
    }, debounceTime);
    return () => clearTimeout(timer);
  }, [rawLogs, layersFunctionalHash, searchQuery, searchConfig, runAsyncProcessing, activeFileId]);

  const addLayer = (type: LayerType, initialConfig: any = {}) => {
    const newId = Math.random().toString(36).substr(2, 9);
    let parentId: string | undefined = undefined;
    if (selectedLayerId) {
      const selected = layers.find(l => l.id === selectedLayerId);
      if (selected?.type === LayerType.FOLDER) parentId = selected.id;
      else if (selected?.groupId) parentId = selected.groupId;
    }

    const defaultConfig = type === LayerType.HIGHLIGHT ? { color: '#3b82f6', opacity: 100, query: '' } :
      type === LayerType.TIME_RANGE ? { startTime: '', endTime: '', timeFormat: '(\\d{4}-\\d{2}-\\d{2}\\s\\d{2}:\\d{2}:\\d{2})' } :
        type === LayerType.RANGE ? { from: 1, to: 1000 } :
          type === LayerType.TRANSFORM ? { query: '', replaceWith: '', regex: true } :
            type === LayerType.LEVEL ? { levels: ['ERROR', 'WARN'] } :
              type === LayerType.FILTER ? { query: '', regex: false } : {};

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
      config: { ...defaultConfig, ...initialConfig }
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
        const line = processedLogs[i];
        const content = typeof line === 'string' ? line : line.content;
        if (re.test(content)) { nextIdx = i; break; }
      }
      if (nextIdx === -1) {
        for (let i = 0; i <= startIndex; i++) {
          const line = processedLogs[i];
          const content = typeof line === 'string' ? line : line.content;
          if (re.test(content)) { nextIdx = i; break; }
        }
      }
    } else {
      for (let i = startIndex - 1; i >= 0; i--) {
        const line = processedLogs[i];
        const content = typeof line === 'string' ? line : line.content;
        if (re.test(content)) { nextIdx = i; break; }
      }
      if (nextIdx === -1) {
        for (let i = processedLogs.length - 1; i >= startIndex; i--) {
          const line = processedLogs[i];
          const content = typeof line === 'string' ? line : line.content;
          if (re.test(content)) { nextIdx = i; break; }
        }
      }
    }

    if (nextIdx !== -1) {
      setCurrentMatchIndex(nextIdx);
      handleJumpToLine(nextIdx);
    }
  }, [searchQuery, processedLogs, searchConfig, currentMatchIndex]);

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
    setTimeout(() => setSaveStatus('idle'), 1000);
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
      const line = processedLogs[i];
      const content = typeof line === 'string' ? line : line.content;
      if (re.test(content)) count++;
    }
    return count;
  }, [currentMatchIndex, searchQuery, searchConfig, processedLogs]);

  return (
    <div className="flex flex-col h-screen select-none overflow-hidden text-sm bg-[#1e1e1e] text-[#cccccc]">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileUpload}
        accept=".log,.txt,.json,*"
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderUpload}
        // @ts-ignore - webkitdirectory is a non-standard attribute
        webkitdirectory=""
        directory=""
        multiple
      />

      <div className="h-9 bg-[#2d2d2d] flex items-center px-4 border-b border-[#111] shrink-0 justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-blue-400 font-black tracking-tighter flex items-center cursor-default">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5-10-5zM2 17l10 5 10-5-10-5-10 5zM2 12l10 5 10-5-10-5-10 5z" /></svg>
            LOGLAYER PRO
          </span>
        </div>
        <div className="text-[10px] text-gray-500 font-mono truncate max-w-xs">
          {fileName || (isProcessing ? '正在解析文件...' : '就绪')}
          {files.length > 1 && ` (+${files.length - 1})`}
        </div>
      </div>

      {(isProcessing || isLayerProcessing) && (
        <div className="h-0.5 w-full bg-[#111] overflow-hidden relative">
          <div className={`h-full bg-blue-500 transition-all duration-300 ${isLayerProcessing ? 'animate-pulse' : ''}`}
            style={{ width: isLayerProcessing ? '100%' : `${loadingProgress}%` }} />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={activeView} onSetActiveView={setActiveView} />
        <div
          className="bg-[#252526] border-r border-[#111] flex flex-col shrink-0 shadow-lg relative group/sidebar"
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar Resizer Handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors opacity-0 group-hover/sidebar:opacity-100"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = sidebarWidth;

              const handleMouseMove = (moveEvent: MouseEvent) => {
                const newWidth = Math.max(200, Math.min(600, startWidth + (moveEvent.clientX - startX)));
                setSidebarWidth(newWidth);
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = 'col-resize';
            }}
          />
          {activeView === 'main' && (
            <UnifiedPanel
              files={fileInfoList}
              activeFileId={activeFileId}
              onFileSelect={() => fileInputRef.current?.click()}
              onFolderSelect={() => folderInputRef.current?.click()}
              onFileActivate={handleFileActivate}
              onFileRemove={handleFileRemove}
              layers={layers}
              layerStats={layerStats}
              rawCounts={rawStats}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              onLayerDrop={handleDrop}
              onLayerRemove={(id) => updateLayers(prev => prev.filter(l => l.id !== id && l.groupId !== id))}
              onLayerToggle={(id) => updateLayers(prev => prev.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l))}
              onLayerUpdate={(id, update) => updateLayers(prev => prev.map(l => l.id === id ? { ...l, ...update } : l))}
              onAddLayer={addLayer}
              onJumpToLine={handleJumpToLine}
              presets={presets}
              onPresetApply={(p) => updateLayers(JSON.parse(JSON.stringify(p.layers)))}
              onPresetDelete={(id) => {
                const next = presets.filter(p => p.id !== id);
                setPresets(next);
                localStorage.setItem('loglayer_presets', JSON.stringify(next));
              }}
              onPresetSave={handleSavePreset}
              saveStatus={saveStatus}
              canUndo={past.length > 0}
              canRedo={future.length > 0}
              onUndo={undo}
              onRedo={redo}
            />
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
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] relative select-text">
          {activeView === 'help' ? (
            <HelpPanel />
          ) : (
            <>
              {/* Overlays */}
              {isFindVisible && (
                <EditorFindWidget
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  config={searchConfig}
                  onConfigChange={setSearchConfig}
                  matchCount={0}
                  currentMatch={currentMatchIndex}
                  onNavigate={() => { }}
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

              {/* Split View Editor Area */}
              <PanelGroup direction="horizontal" autoSaveId="loglayer-layout">
                {panes.map((pane, index) => {
                  const paneFileId = pane.fileId;
                  const processedData = paneFileId ? processedCache[paneFileId] : null;
                  const paneLines = processedData?.logs || [];
                  // TODO: Per-pane stats for scrollbar heatmap
                  const paneStats = processedData?.stats || {};

                  return (
                    <React.Fragment key={pane.id}>
                      {index > 0 && <PanelResizeHandle className="w-1 bg-[#111] hover:bg-blue-500 transition-colors cursor-col-resize z-50" />}
                      <Panel className="flex flex-col min-w-0 bg-[#1e1e1e] relative">
                        <div
                          className={`flex-1 flex flex-col min-h-0 relative ${activePaneId === pane.id ? 'ring-1 ring-blue-500/30' : ''}`}
                          onClick={() => setActivePaneId(pane.id)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const data = e.dataTransfer.getData('application/json');
                            if (!data) return;
                            try {
                              const { type, id } = JSON.parse(data);
                              if (type === 'FILE') {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const x = e.clientX - rect.left;
                                const width = rect.width;

                                if (x > width * 0.75) {
                                  const newPaneId = `pane-${Date.now()}`;
                                  setPanes(prev => {
                                    const idx = prev.findIndex(p => p.id === pane.id);
                                    const newPanes = [...prev];
                                    newPanes.splice(idx + 1, 0, { id: newPaneId, fileId: id });
                                    return newPanes;
                                  });
                                  setActivePaneId(newPaneId);
                                } else {
                                  setPanes(prev => prev.map(p => p.id === pane.id ? { ...p, fileId: id } : p));
                                  setActivePaneId(pane.id);
                                }
                              }
                            } catch (err) {
                              console.error("Drop error", err);
                            }
                          }}
                        >
                          {/* Pane Header */}
                          <div className="h-8 bg-[#252526] flex items-center px-4 text-xs text-gray-400 border-b border-[#111] shrink-0 select-none">
                            {paneFileId ? (files.find(f => f.id === paneFileId)?.name || 'Unknown File') : 'Empty Pane'}
                            <div className="ml-auto flex gap-2">
                              {panes.length > 1 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newPanes = panes.filter(p => p.id !== pane.id);
                                    setPanes(newPanes);
                                    if (activePaneId === pane.id) setActivePaneId(newPanes[0].id);
                                  }}
                                  className="hover:text-white"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          {paneFileId ? (
                            <div className="flex-1 relative min-h-0">
                              <LogViewer
                                lines={paneLines}
                                searchQuery={searchQuery}
                                searchConfig={searchConfig}
                                scrollToIndex={activePaneId === pane.id ? scrollToIndex : null}
                                highlightedIndex={activePaneId === pane.id ? highlightedIndex : null}
                                onLineClick={(idx) => {
                                  if (activePaneId !== pane.id) setActivePaneId(pane.id);
                                }}
                                onAddLayer={(type, config) => addLayer(type, config)}
                              />
                              {/* Scrollbar Heatmap (Per Pane) */}
                              <div className="absolute right-0 top-0 bottom-0 w-3 bg-black/20 pointer-events-none border-l border-white/5 select-none z-10">
                                {Object.keys(paneStats).map(layerId => {
                                  const stats = paneStats[layerId];
                                  const layer = layers.find(l => l.id === layerId) || (layerId === 'global-search-volatile' ? { type: LayerType.HIGHLIGHT, config: { color: '#facc15' }, enabled: true } : null);
                                  if (!layer || !layer.enabled || !stats) return null;

                                  return stats.distribution.map((d, i) => d > 0 && (
                                    <div key={`${layerId}-${i}`} className="absolute w-full" style={{ top: `${(i / 20) * 100}%`, height: '5%', backgroundColor: layer.config.color || '#3b82f6', opacity: d * 0.6 }} />
                                  ));
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                              <p>Drag a file here to open</p>
                            </div>
                          )}
                        </div>
                      </Panel>
                    </React.Fragment>
                  );
                })}
              </PanelGroup>
            </>
          )}
        </div>
      </div>
      <StatusBar
        lines={processedLogs.length}
        totalLines={rawLogs.length}
        size={fileSize}
        isProcessing={isProcessing || isLayerProcessing}
        isLayerProcessing={isLayerProcessing}
      />
    </div>
  );
};

export default App;
