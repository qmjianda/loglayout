
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { LogViewer } from './components/LogViewer';
import { SearchPanel } from './components/SearchPanel';
import { EditorFindWidget } from './components/EditorFindWidget';
import { EditorGoToLineWidget } from './components/EditorGoToLineWidget';
import { UnifiedPanel, FileInfo } from './components/UnifiedPanel';
import { HelpPanel } from './components/HelpPanel';
import { StatusBar } from './components/StatusBar';
import { IndexingOverlay, FileLoadingSkeleton, PendingFilesWall } from './components/LoadingOverlays';
import { LogLayer, LayerType, LogLine, LayerPreset } from './types';
import { initBridge, openFile, selectFiles, selectFolder, listLogsInFolder, syncLayers, syncAll, searchRipgrep, readProcessedLines } from './bridge_client';


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
  lineCount: number;
  rawCount: number; // Original line count (for status bar)
  layers: LogLayer[];
  isBridged: true;
  path?: string;
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
  const [loadingFileIds, setLoadingFileIds] = useState<Set<string>>(new Set());
  const [pendingCliFiles, setPendingCliFiles] = useState<number>(0);

  // Multi-File Management
  const [files, setFiles] = useState<FileData[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<{ path: string, name: string } | null>(null);

  // Split View Management
  const [panes, setPanes] = useState<Pane[]>([{ id: 'pane-1', fileId: null }]);
  const [activePaneId, setActivePaneId] = useState<string>('pane-1');

  const activePane = panes.find(p => p.id === activePaneId);
  const activeFileId = activePane?.fileId || null;
  const activeFile = useMemo(() => files.find(f => f.id === activeFileId), [files, activeFileId]);

  // Helper to set active file for current pane
  function setActiveFileId(fileId: string | null) {
    setPanes(prev => prev.map(p => p.id === activePaneId ? { ...p, fileId } : p));
  }

  // 激活文件
  function handleFileActivate(fileId: string) {
    if (activeFileId === fileId) return;

    setActiveFileId(fileId);
    const file = files.find(f => f.id === fileId);

    // 只有在文件未加载时才调用 openFile
    const isLoaded = (window as any)._BRIDGED_COUNTS && (window as any)._BRIDGED_COUNTS[fileId] !== undefined;

    if (file?.path && !isLoaded) {
      // 标记文件正在加载
      setLoadingFileIds(prev => new Set(prev).add(fileId));
      setIsProcessing(true); // 立即标记加速渲染
      openFile(fileId, file.path);
    }
  }

  // 移除文件
  function handleFileRemove(fileId: string) {
    setFiles(prev => {
      const next = prev.filter(f => f.id !== fileId);
      if (activeFileId === fileId) {
        setActiveFileId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }

  // Bridge State Tracking (Minimal state to trigger renders)
  const [bridgedUpdateTrigger, setBridgedUpdateTrigger] = useState(0);
  const lastFetchedRange = useRef<{ start: number, end: number }>({ start: -1, end: -1 });

  const activeFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  // Initialize Bridge
  useEffect(() => {
    initBridge().then(api => {
      if (api) {
        api.fileLoaded.connect((fileId, rawInfo) => {
          let info: any;
          try {
            info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
          } catch (e) {
            console.error('Failed to parse fileLoaded info:', e);
            return;
          }

          setFiles(prev => {
            const existingIndex = prev.findIndex(f => f.id === fileId);

            if (!(window as any)._BRIDGED_COUNTS) (window as any)._BRIDGED_COUNTS = {};
            (window as any)._BRIDGED_COUNTS[fileId] = info.lineCount;

            if (existingIndex >= 0) {
              const newFiles = [...prev];
              const oldFile = prev[existingIndex];
              newFiles[existingIndex] = {
                ...oldFile,
                lineCount: info.lineCount,
                rawCount: info.lineCount,
                size: info.size,
                path: info.path || oldFile.path // Use path from backend if available
              };
              return newFiles;
            } else {
              const newFile: FileData = {
                id: fileId,
                name: info.name,
                size: info.size,
                lineCount: info.lineCount,
                rawCount: info.lineCount,
                layers: [],
                isBridged: true,
                path: info.path || info.name,
                history: { past: [], future: [] }
              };
              setTimeout(() => {
                setActiveFileId(fileId);
              }, 0);

              return [...prev, newFile];
            }
          });
          setBridgedUpdateTrigger(v => v + 1);
          setIsProcessing(false);
          setOperationStatus(null);
          setLoadingFileIds(prev => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          setPendingCliFiles(prev => Math.max(0, prev - 1));
        });

        api.pipelineFinished?.connect?.((fileId, newTotal, resultsJson) => {
          if (!(window as any)._BRIDGED_COUNTS) (window as any)._BRIDGED_COUNTS = {};
          (window as any)._BRIDGED_COUNTS[fileId] = newTotal;

          try {
            const matches = JSON.parse(resultsJson);

            // Atomic update for both files (total count) and cache (search matches)
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, lineCount: newTotal } : f));
            setProcessedCache(prev => ({
              ...prev,
              [fileId]: { ...prev[fileId], searchMatches: matches }
            }));

            setBridgedUpdateTrigger(v => v + 1);

            if (activeFileIdRef.current === fileId) {
              setOperationStatus(null);
              setIsProcessing(false);
              setIsSearching(false);
            }
          } catch (e) {
            console.error('Pipeline parse error:', e);
          }
        });

        // CLI 文件加载通知
        api.pendingFilesCount?.connect?.((count) => {
          setPendingCliFiles(count);
        });

        api.statsFinished?.connect?.((fileId, statsJson) => {
          try {
            const stats = JSON.parse(statsJson);
            setProcessedCache(prev => ({
              ...prev,
              [fileId]: { ...prev[fileId], layerStats: { ...prev[fileId]?.layerStats, ...stats } }
            }));
          } catch (e) { console.error('Stats parse error:', e); }
        });

        api.operationStarted?.connect?.((fileId, op) => {
          if (activeFileIdRef.current === fileId) {
            setOperationStatus({ op, progress: 0 });
            setLoadingProgress(0);
            if (op === 'searching') setIsSearching(true);
            else setIsProcessing(true);
          }
        });

        api.operationProgress?.connect?.((fileId, op, progress) => {
          if (activeFileIdRef.current === fileId) {
            setOperationStatus(prev => prev ? { ...prev, progress } : { op, progress });
            setLoadingProgress(progress);
          }
        });

        api.operationError?.connect?.((fileId, op, message) => {
          if (activeFileIdRef.current === fileId) {
            setOperationStatus({ op, progress: 0, error: message });
            setIsProcessing(false);
            setIsSearching(false);
          }
        });

        // Notify backend that we are ready to receive files
        api.ready();
      }
    });
  }, []); // Initialize bridge only once on mount


  const fileName = activeFile?.name || '';
  const fileSize = activeFile?.size || 0;

  // Layers state derived from active file
  const layers = activeFile?.layers || [];
  const past = activeFile?.history?.past || [];
  const future = activeFile?.history?.future || [];

  // Processing Cache (Per File)
  const [processedCache, setProcessedCache] = useState<Record<string, {
    layerStats: Record<string, { count: number; distribution: number[] }>;
    searchMatches: number[];
  }>>({});

  // Convenience accessors for Active File
  const activeProcessed = activeFileId ? processedCache[activeFileId] : null;
  const layerStats = activeProcessed?.layerStats || {};
  const bridgedMatches = activeProcessed?.searchMatches || [];

  const [presets, setPresets] = useState<LayerPreset[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(288); // Default 72 * 4 = 288px
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLayerProcessing, setIsLayerProcessing] = useState<boolean>(false);
  const [operationStatus, setOperationStatus] = useState<{ op: string, progress: number, error?: string } | null>(null);

  // Bridged search state
  const [isSearching, setIsSearching] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchConfig, setSearchConfig] = useState({ regex: false, caseSensitive: false, wholeWord: false });
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const loadingAbortController = useRef<AbortController | null>(null);
  const processingTaskId = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const bridgedFileIdRef = useRef<string | null>(null);

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


  // Unified file adding logic
  const addNewFiles = useCallback((incomingFiles: { name: string, size?: number, path: string }[], autoActivateFirst = true) => {
    if (incomingFiles.length === 0) return;

    const newFiles: FileData[] = incomingFiles.map((f, i) => {
      const fileId = `bridged-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${i}`;
      return {
        id: fileId,
        name: f.name,
        size: f.size || 0,
        lineCount: 0,
        rawCount: 0,
        layers: [],
        isBridged: true,
        path: f.path,
        history: { past: [], future: [] }
      };
    });

    setFiles(prev => [...prev, ...newFiles]);

    // Activate and open the first one
    if (autoActivateFirst) {
      const first = newFiles[0];
      setActiveFileId(first.id);
      setLoadingFileIds(prev => new Set(prev).add(first.id));
      setIsProcessing(true);
      openFile(first.id, first.path);
    }
  }, []);

  const handleOpenFileByPath = useCallback((path: string, name: string) => {
    // Check if already open
    const existing = files.find(f => f.path === path);
    if (existing) {
      handleFileActivate(existing.id);
      return;
    }

    // Otherwise add and open
    addNewFiles([{ name, path }], true);
  }, [files, handleFileActivate, addNewFiles]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = event.target.files;
    if (!rawFiles || rawFiles.length === 0) return;
    const fileList = Array.from(rawFiles) as any[];
    event.target.value = '';

    const validFiles = fileList
      .filter(f => f.path)
      .map(f => ({ name: f.name, size: f.size, path: f.path }));

    addNewFiles(validFiles);
  };

  const handleNativeFileSelect = async () => {
    try {
      if (!window.fileBridge) return;
      const paths = await selectFiles();
      if (!paths || paths.length === 0) return;

      const validFiles = paths.map(path => ({
        name: path.split(/[/\\]/).pop() || path,
        path: path
      }));

      addNewFiles(validFiles);
    } catch (e) { console.error('Native file select error:', e); }
  };

  const handleNativeFolderSelect = async () => {
    try {
      if (!window.fileBridge) return;
      const folderPath = await selectFolder();
      if (!folderPath) return;

      const folderName = folderPath.split(/[/\\]/).pop() || folderPath;
      setWorkspaceRoot({ path: folderPath, name: folderName });
    } catch (e) {
      console.error('Native folder select error:', e);
    }
  };

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = event.target.files;
    if (!rawFiles || rawFiles.length === 0) return;
    const logFiles = Array.from(rawFiles).filter((file: any) =>
      file.name.endsWith('.log') || file.name.endsWith('.txt') || file.name.endsWith('.json') || !file.name.includes('.')
    ) as any[];

    const validFiles = logFiles
      .filter(f => f.path)
      .map(f => ({ name: f.name, size: f.size, path: f.path }));

    addNewFiles(validFiles);
  };

  useEffect(() => {
    if (!activeFileId || !activeFile) return;

    const timer = setTimeout(async () => {
      const searchConf = searchQuery ? {
        query: searchQuery,
        regex: searchConfig.regex,
        caseSensitive: searchConfig.caseSensitive
      } : null;

      if (searchQuery) {
        setIsSearching(true);
        setCurrentMatchIndex(-1);

        // We still clear current matches here to indicate loading, but syncAll will 
        // ensure the correct results arrive in a single signal sequence.
        setProcessedCache(prev => ({
          ...prev,
          [activeFileId!]: { ...prev[activeFileId!], searchMatches: [] }
        }));
      }

      await syncAll(activeFileId, layers, searchConf);

      if (!searchQuery) {
        setIsSearching(false);
        setCurrentMatchIndex(-1);
      }

      setIsLayerProcessing(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [layersFunctionalHash, searchQuery, searchConfig, activeFileId, activeFile?.lineCount]);

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
    const total = activeFile?.lineCount || 0;
    if (total === 0) return;

    const boundedIndex = Math.max(0, Math.min(index, total - 1));

    // Batch updates
    setScrollToIndex(boundedIndex);
    setHighlightedIndex(boundedIndex);

    // Clear the scroll signal after a delay to allow UI to react
    // and to allow jumping to the same line multiple times
    setTimeout(() => {
      setScrollToIndex(null);
    }, 150);
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
    if (!searchQuery || bridgedMatches.length === 0) return;

    let nextIdx = -1;
    // Start searching from the currently highlighted line or the last known match
    const currentPos = (highlightedIndex !== null) ? highlightedIndex : currentMatchIndex;

    if (direction === 'next') {
      const found = bridgedMatches.find(m => m > currentPos);
      nextIdx = found !== undefined ? found : bridgedMatches[0];
    } else {
      // Optimized backward search for large match arrays
      for (let i = bridgedMatches.length - 1; i >= 0; i--) {
        if (bridgedMatches[i] < currentPos) {
          nextIdx = bridgedMatches[i];
          break;
        }
      }
      // Wrap around to the last match if none found before currentPos
      if (nextIdx === -1) nextIdx = bridgedMatches[bridgedMatches.length - 1];
    }

    if (nextIdx !== -1) {
      setCurrentMatchIndex(nextIdx);
      handleJumpToLine(nextIdx);
    }
  }, [searchQuery, bridgedMatches, currentMatchIndex, highlightedIndex, handleJumpToLine]);

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
  const searchMatchCount = useMemo(() => {
    if (activeFile?.isBridged) return bridgedMatches.length;
    return layerStats['global-search-volatile']?.count || 0;
  }, [layerStats, bridgedMatches, activeFile]);

  const currentMatchNumber = useMemo(() => {
    if (currentMatchIndex === -1 || !searchQuery) return 0;

    if (activeFile?.isBridged) {
      const idx = bridgedMatches.indexOf(currentMatchIndex);
      return idx !== -1 ? idx + 1 : 0;
    }

    let re: RegExp;
    try {
      let pattern = searchConfig.regex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (searchConfig.wholeWord) pattern = `\\b${pattern}\\b`;
      re = new RegExp(pattern, searchConfig.caseSensitive ? '' : 'i');
    } catch (e) { return 0; }
    let count = 0;
    // This part of the code is unreachable for non-bridged files as they are not supported anymore.
    // Keeping it for now, but it will likely be removed in future refactors.
    // For now, `processedLogs` is not defined here, so this will cause a runtime error if reached.
    // The `activeFile?.isBridged` check should prevent this.
    // for (let i = 0; i <= currentMatchIndex; i++) {
    //   const line = processedLogs[i];
    //   const content = typeof line === 'string' ? line : line.content;
    //   if (re.test(content)) count++;
    // }
    return count;
  }, [currentMatchIndex, searchQuery, searchConfig, activeFile, bridgedMatches]);

  return (
    <div className="flex flex-col h-screen select-none overflow-hidden text-sm bg-[#1e1e1e] text-[#cccccc]">
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileUpload}
        accept=".log,.txt,.json,*"
      />
      <input
        ref={folderInputRef}
        type="file"
        style={{ display: 'none' }}
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
            LogLayer
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
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
          {activeView === 'main' && (
            <UnifiedPanel
              workspaceRoot={workspaceRoot}
              onOpenFileByPath={handleOpenFileByPath}
              files={fileInfoList}
              activeFileId={activeFileId}
              onFileSelect={() => {
                if (window.fileBridge) {
                  handleNativeFileSelect();
                } else {
                  fileInputRef.current?.click();
                }
              }}
              onFolderSelect={() => {
                if (window.fileBridge) {
                  handleNativeFolderSelect();
                } else {
                  folderInputRef.current?.click();
                }
              }}

              onFileActivate={handleFileActivate}
              onFileRemove={handleFileRemove}
              layers={layers}
              layerStats={layerStats}
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

        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#1e1e1e] relative select-text overflow-hidden">
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
                  matchCount={searchMatchCount}
                  currentMatch={currentMatchNumber}
                  onNavigate={findNextSearchMatch}
                  onClose={() => {
                    setIsFindVisible(false);
                    setSearchQuery('');
                    setProcessedCache(prev => ({
                      ...prev,
                      [activeFileId!]: { ...prev[activeFileId!], searchMatches: [] }
                    }));
                    setCurrentMatchIndex(-1);
                  }}
                />
              )}

              {isGoToLineVisible && (
                <EditorGoToLineWidget
                  totalLines={activeFile?.lineCount || 0}
                  onGo={(lineNum) => {
                    handleJumpToLine(lineNum - 1);
                    setIsGoToLineVisible(false);
                  }}
                  onClose={() => setIsGoToLineVisible(false)}
                />
              )}

              {/* Split View Editor Area */}
              {/* Simple Flexbox Editor Area (Replaces crashing PanelGroup) */}
              <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
                {panes.map((pane, index) => {
                  const paneFileId = pane.fileId;
                  const processedData = paneFileId ? processedCache[paneFileId] : null;
                  const paneStats = processedData?.layerStats || {};
                  const isActive = activeFileId === paneFileId;

                  return (
                    <div key={pane.id} className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#1e1e1e] relative border-r border-[#111] overflow-hidden">
                      <div
                        className={`flex-1 flex flex-col min-h-0 relative ${activePaneId === pane.id ? 'ring-1 ring-blue-500/30' : ''}`}
                        onClick={() => setActivePaneId(pane.id)}
                      >
                        {/* Pane Header */}
                        <div className="h-8 bg-[#252526] flex items-center px-4 text-xs text-gray-400 border-b border-[#111] shrink-0 select-none">
                          <span className="truncate">{paneFileId ? (files.find(f => f.id === paneFileId)?.name || 'Unknown File') : 'Empty Pane'}</span>
                          <div className="ml-auto flex gap-2">
                            {panes.length > 1 && (
                              <button onClick={(e) => {
                                e.stopPropagation();
                                const newPanes = panes.filter(p => p.id !== pane.id);
                                setPanes(newPanes);
                                if (activePaneId === pane.id) setActivePaneId(newPanes[0].id);
                              }} className="hover:text-white">✕</button>
                            )}
                          </div>
                        </div>

                        {paneFileId === activeFileId && isProcessing && operationStatus?.op === 'indexing' && (
                          <IndexingOverlay progress={loadingProgress} fileName={activeFile?.name || ''} />
                        )}

                        {/* File Loading Skeleton - 文件正在切换/加载 */}
                        {paneFileId && loadingFileIds.has(paneFileId) && !operationStatus && (
                          <FileLoadingSkeleton fileName={files.find(f => f.id === paneFileId)?.name} />
                        )}

                        {paneFileId ? (
                          <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
                            <LogViewer
                              totalLines={(() => {
                                const file = files.find(f => f.id === pane.fileId);
                                return file?.lineCount || 0;
                              })()}
                              fileId={pane.fileId}


                              searchQuery={searchQuery}
                              searchConfig={searchConfig}
                              scrollToIndex={activePaneId === pane.id ? scrollToIndex : null}
                              highlightedIndex={activePaneId === pane.id ? highlightedIndex : null}
                              onLineClick={(idx) => {
                                if (activePaneId !== pane.id) setActivePaneId(pane.id);
                                setHighlightedIndex(idx);
                              }}
                              onAddLayer={(type, config) => addLayer(type, config)}
                              updateTrigger={bridgedUpdateTrigger}
                            />
                          </div>

                        ) : pendingCliFiles > 0 ? (
                          <PendingFilesWall count={pendingCliFiles} />
                        ) : (
                          <div
                            className="flex-1 flex flex-col items-center justify-center text-gray-600 bg-dark-2 cursor-pointer hover:bg-dark-1 transition-colors"
                            onClick={() => {
                              if (window.fileBridge) {
                                handleNativeFileSelect();
                              } else {
                                fileInputRef.current?.click();
                              }
                            }}
                          >
                            <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <p className="text-sm font-medium">Drag a file here to open</p>
                            <p className="text-[10px] mt-2 opacity-50">or click to browse local files</p>
                          </div>

                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      <StatusBar
        lines={activeFile?.lineCount || 0}
        totalLines={activeFile?.rawCount || 0}
        size={fileSize}
        isProcessing={isProcessing || (activeFileId ? loadingFileIds.has(activeFileId) : false)}
        isLayerProcessing={isLayerProcessing}
        operationStatus={operationStatus}
        searchMatchCount={searchMatchCount}
        currentLine={(highlightedIndex !== null) ? highlightedIndex + 1 : undefined}
        pendingCliFiles={pendingCliFiles}
      />
    </div>
  );
};

export default App;
