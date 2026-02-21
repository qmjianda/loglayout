/**
 * useLayerManagement - 图层状态与操作 Hook
 * 
 * 核心功能：
 * 1. 维护当前文件的图层列表 (Layers)。
 * 2. 实现撤销/重做 (Undo/Redo) 逻辑。
 * 3. 处理图层的增删改查、拖拽排序、父子关系。
 * 4. 保存与平铺预案 (Presets)。
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
    // 图层状态
    layers: LogLayer[];
    selectedLayerId: string | null;
    setSelectedLayerId: (id: string | null) => void;
    past: LogLayer[][];
    future: LogLayer[][];

    // 计算属性
    layersFunctionalHash: string; // 用于判断图层配置是否发生实质性变化（过滤掉 UI 无关属性）

    // 图层操作
    updateLayers: (updater: LogLayer[] | ((prev: LogLayer[]) => LogLayer[]), skipHistory?: boolean) => void;
    addLayer: (type: LayerType, initialConfig?: any) => void;
    handleDrop: (draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => void;

    // 历史记录
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;

    // 预设方案
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

    // 图层数据派生自当前激活的文件对象
    const layers = activeFile?.layers || [];
    const past = activeFile?.history?.past || [];
    const future = activeFile?.history?.future || [];

    // 记录图层引用，用于 Effect 中进行对比
    const layersRef = useRef<LogLayer[]>(layers);
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    /**
     * 计算功能哈希。
     * 只有当图层的核心属性（ID, 启用状态, 类型, 配置, 父节点）发生变化时，哈希才会变。
     * 这用于触发后端的 Pipeline 运行，而折叠状态等 UI 变动则不会触发。
     */
    const layersFunctionalHash = useMemo(() => {
        return JSON.stringify(layers.map(l => [
            l.id,
            l.enabled,
            l.groupId,
            l.type,
            l.config
        ]));
    }, [layers]);

    // 从 LocalStorage 加载预设方案
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

        // 确保有一个系统默认预设
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

    /**
     * 更新图层并根据需要记录历史。
     */
    const updateLayers = useCallback((updater: LogLayer[] | ((prev: LogLayer[]) => LogLayer[]), skipHistory = false) => {
        if (!activeFileId) return;

        setFiles(prevFiles => prevFiles.map(file => {
            if (file.id !== activeFileId) return file;

            const currentLayers = file.layers || [];
            const nextLayers = typeof updater === 'function' ? updater(currentLayers) : updater;

            // 历史记录逻辑：只有内容真正改变且非 skipHistory 时才记录
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

    // 撤销
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

    // 重做
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

    // 获取从后端注册的所有图层类型描述
    const { registry } = useLayerRegistry();

    /**
     * 添加新图层。
     * @param type 类型 ID（如 FILTER, HIGHLIGHT 或插件 ID）
     * @param initialConfig 初始配置
     */
    const addLayer = useCallback((type: LayerType | string, initialConfig: any = {}) => {
        const newId = Math.random().toString(36).substr(2, 9);
        let parentId: string | undefined = undefined;

        // 如果当前选中了某个图层，根据其类型决定新图层的父组件
        if (selectedLayerId) {
            const selected = layers.find(l => l.id === selectedLayerId);
            if (selected?.type === LayerType.FOLDER) parentId = selected.id;
            else if (selected?.groupId) parentId = selected.groupId;
        }

        // 特殊处理：分组（文件夹）类型
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

        // 从 Registry 中获取默认配置（Schema）
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
            // 如果添加到了某个文件夹，确保该文件夹是展开状态
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

    /**
     * 处理图层拖拽排序。
     * 支持：移入文件夹、移至上方、移至下方。
     */
    const handleDrop = useCallback((draggedId: string, targetId: string | null, position: 'inside' | 'before' | 'after') => {
        updateLayers(prev => {
            const next = [...prev];
            const draggedIdx = next.findIndex(l => l.id === draggedId);
            if (draggedIdx === -1) return prev;

            const targetIdx = targetId ? next.findIndex(l => l.id === targetId) : -1;
            if (targetId && targetIdx === -1) return prev;

            // 防环检查：禁止将父节点拖入其自身的子节点中
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

            // 先从原位置移除
            let [draggedLayer] = next.splice(draggedIdx, 1);
            draggedLayer = { ...draggedLayer };

            // 重新计算目标位置在修改后的数组中的索引
            const currentTargetIdx = targetId ? next.findIndex(l => l.id === targetId) : -1;

            if (position === 'inside' && targetId) {
                // 移入文件夹
                draggedLayer.groupId = targetId;
                next.splice(currentTargetIdx + 1, 0, draggedLayer);
            } else if (targetId) {
                // 移至某图层的相邻位置
                const targetLayer = next[currentTargetIdx];
                draggedLayer.groupId = targetLayer.groupId;
                const finalIdx = position === 'before' ? currentTargetIdx : currentTargetIdx + 1;
                next.splice(finalIdx, 0, draggedLayer);
            } else {
                // 移至根目录末尾
                draggedLayer.groupId = undefined;
                next.push(draggedLayer);
            }

            return next;
        });
    }, [updateLayers]);

    /**
     * 保存当前的图层配置为预设。
     */
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
