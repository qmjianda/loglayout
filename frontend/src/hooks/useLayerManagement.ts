/**
 * useLayerManagement - Layer state and operations hook
 * 
 * Manages layer list, history (undo/redo), and layer operations.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LogLayer, LayerType, LayerPreset, LayerRegistryEntry } from '../types';
import { syncAll, getLayerRegistry } from '../bridge_client';
import { FileData } from './useFileManagement';
import { useLayerRegistry } from './useLayerRegistry';

const MAX_HISTORY = 100;
const DEFAULT_PRESET_ID = 'system-default-preset';

export interface UseLayerManagementProps {
    activeFileId: string | null;
    activeFile: FileData | undefined;
    files: FileData[];
    setFiles: React.Dispatch<React.SetStateAction<FileData[]>>;
    searchQuery: string;
    searchConfig: { regex: boolean; caseSensitive: boolean; wholeWord?: boolean };
}

export interface UseLayerManagementReturn {
    // Layer state
    layers: LogLayer[];
    selectedLayerId: string | null;
    setSelectedLayerId: (id: string | null) => void;
    past: LogLayer[][];
    future: LogLayer[][];

    // Computed
    layersFunctionalHash: string;

    // Layer operations
    updateLayers: (updater: LogLayer[] | ((prev: LogLayer[]) => LogLayer[]), skipHistory?: boolean) => void;
    addLayer: (type: LayerType, initialConfig?: any) => void;
    handleDrop: (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => void;

    // History
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;

    // Presets
    presets: LayerPreset[];
    setPresets: React.Dispatch<React.SetStateAction<LayerPreset[]>>;
    handleSavePreset: () => void;
    saveStatus: 'idle' | 'saved';
}

export function useLayerManagement({
    activeFileId,
    activeFile,
    files,
    setFiles,
    searchQuery,
    searchConfig
}: UseLayerManagementProps): UseLayerManagementReturn {
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [presets, setPresets] = useState<LayerPreset[]>([]);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

    // Layers derived from active file
    const layers = activeFile?.layers || [];
    const past = activeFile?.history?.past || [];
    const future = activeFile?.history?.future || [];

    // Layers ref for effects
    const layersRef = useRef<LogLayer[]>(layers);
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    // Functional hash for sync optimization
    const layersFunctionalHash = useMemo(() => {
        return JSON.stringify(layers.map(l => [
            l.id,
            l.enabled,
            l.groupId,
            l.type,
            l.config
        ]));
    }, [layers]);

    // Load presets from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('loglayer_presets');
        let initialPresets: LayerPreset[] = [];

        if (saved) {
            try {
                initialPresets = JSON.parse(saved);
            } catch (e) {
                console.error('[useLayerManagement] Failed to load presets:', e);
            }
        }

        let defaultPreset = initialPresets.find(p =>
            p.id === DEFAULT_PRESET_ID || p.name === '默认' || p.name === 'Default'
        );

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
        localStorage.setItem('loglayer_presets', JSON.stringify(initialPresets));
    }, []);

    // Update layers with history
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
    }, [activeFileId, setFiles]);

    // Undo
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
    }, [activeFileId, setFiles]);

    // Redo
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
    }, [activeFileId, setFiles]);

    const { registry } = useLayerRegistry();

    // Add layer
    const addLayer = useCallback((type: LayerType | string, initialConfig: any = {}) => {
        const newId = Math.random().toString(36).substr(2, 9);
        let parentId: string | undefined = undefined;

        if (selectedLayerId) {
            const selected = layers.find(l => l.id === selectedLayerId);
            if (selected?.type === LayerType.FOLDER) parentId = selected.id;
            else if (selected?.groupId) parentId = selected.groupId;
        }

        if (type === LayerType.FOLDER) {
            const newLayer: LogLayer = {
                id: newId,
                name: '新建分组',
                type: LayerType.FOLDER,
                enabled: true,
                groupId: parentId,
                isCollapsed: false,
                config: {}
            };
            updateLayers(prev => [...prev, newLayer]);
            setSelectedLayerId(newId);
            return;
        }

        // Lookup in registry
        const entry = registry[type];
        if (!entry) {
            console.warn(`[useLayerManagement] Unknown layer type: ${type}`);
            return;
        }

        const defaultConfig: any = {};
        entry.ui_schema.forEach(field => {
            if (field.value !== undefined) {
                defaultConfig[field.name] = field.value;
            }
        });

        const newLayer: LogLayer = {
            id: newId,
            name: entry.display_name,
            type: type as LayerType,
            enabled: true,
            groupId: parentId,
            isCollapsed: false,
            config: { ...defaultConfig, ...initialConfig }
        };

        updateLayers(prev => {
            const next = [...prev];
            // If added to a folder, ensure folder is expanded
            if (parentId) {
                const parentIdx = next.findIndex(l => l.id === parentId);
                if (parentIdx >= 0) {
                    next[parentIdx] = { ...next[parentIdx], isCollapsed: false };
                }
            }
            next.push(newLayer);
            return next;
        });
        setSelectedLayerId(newId);
    }, [selectedLayerId, layers, updateLayers, registry]);

    // Handle drag and drop
    const handleDrop = useCallback((draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => {
        updateLayers(prev => {
            const next = [...prev];
            const draggedIdx = next.findIndex(l => l.id === draggedId);
            if (draggedIdx === -1) return prev;

            const targetIdx = targetId ? next.findIndex(l => l.id === targetId) : -1;
            if (targetId && targetIdx === -1) return prev;

            // Prevent dropping a folder into itself or its descendants
            if (targetId) {
                let curr: string | undefined = targetId;
                while (curr) {
                    if (curr === draggedId) {
                        console.warn("[LayerManagement] Circular drop prevented");
                        return prev;
                    }
                    curr = next.find(l => l.id === curr)?.groupId;
                }
            }

            // Remove and clone the dragged layer
            let [draggedLayer] = next.splice(draggedIdx, 1);
            draggedLayer = { ...draggedLayer };

            // Find current target index in the MODIFIED array
            const currentTargetIdx = targetId ? next.findIndex(l => l.id === targetId) : -1;

            if (position === 'inside' && targetId) {
                draggedLayer.groupId = targetId;
                // Place as the first child of the folder
                next.splice(currentTargetIdx + 1, 0, draggedLayer);
            } else if (targetId) {
                const targetLayer = next[currentTargetIdx];
                draggedLayer.groupId = targetLayer.groupId;
                const finalIdx = position === 'before' ? currentTargetIdx : currentTargetIdx + 1;
                next.splice(finalIdx, 0, draggedLayer);
            } else {
                draggedLayer.groupId = undefined;
                next.push(draggedLayer);
            }

            // Clear global fallback
            (window as any).__draggedLayerId = null;
            return next;
        });
    }, [updateLayers]);

    // Save preset
    const handleSavePreset = useCallback(() => {
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
    }, [layers]);

    return {
        layers,
        selectedLayerId,
        setSelectedLayerId,
        past,
        future,
        layersFunctionalHash,
        updateLayers,
        addLayer,
        handleDrop,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        presets,
        setPresets,
        handleSavePreset,
        saveStatus
    };
}
