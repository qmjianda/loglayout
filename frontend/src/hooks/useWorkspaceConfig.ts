/**
 * useWorkspaceConfig - Workspace configuration persistence hook
 * 
 * Automatically saves session state (files + layers) to workspace folder and 
 * loads them when the same workspace is opened again.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { LogLayer } from '../types';
import { saveWorkspaceConfig, loadWorkspaceConfig, WorkspaceConfig } from '../bridge_client';
import { FileData } from './useFileManagement';

const SAVE_DEBOUNCE_MS = 1000;
const CONFIG_VERSION = 2; // Bumped version for new schema

export interface UseWorkspaceConfigProps {
    workspaceRoot: { path: string; name: string } | null;
    files: FileData[];
    setFiles: React.Dispatch<React.SetStateAction<FileData[]>>;
    activeFileId: string | null;
    setActiveFileId: (id: string | null) => void;
    activeFilePath: string | undefined;
    handleFileActivate: (id: string) => void;
}

export interface UseWorkspaceConfigReturn {
    saveConfig: () => Promise<boolean>;
    loadConfig: () => Promise<boolean>;
}

export function useWorkspaceConfig({
    workspaceRoot,
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    activeFilePath
}: UseWorkspaceConfigProps): UseWorkspaceConfigReturn {
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedHashRef = useRef<string>('');
    const isLoadingRef = useRef<boolean>(false);

    // Determine the config folder path
    const getConfigPath = useCallback((): string | null => {
        // Prefer workspace root if set
        if (workspaceRoot?.path) {
            return workspaceRoot.path;
        }
        // Fallback to active file's parent directory
        if (activeFilePath) {
            const lastSep = Math.max(activeFilePath.lastIndexOf('/'), activeFilePath.lastIndexOf('\\'));
            if (lastSep > 0) {
                return activeFilePath.substring(0, lastSep);
            }
        }
        return null;
    }, [workspaceRoot, activeFilePath]);

    // Generate hash for change detection (includes files AND layers)
    const getSessionHash = useCallback((filesList: FileData[], activePath?: string | null): string => {
        const fileState = filesList.map(f => ({
            path: f.path,
            layers: f.layers.map(l => [l.id, l.type, l.enabled, l.config])
        }));
        return JSON.stringify([fileState, activePath]);
    }, []);

    // Save config to workspace
    const saveConfig = useCallback(async (): Promise<boolean> => {
        const configPath = getConfigPath();
        if (!configPath || files.length === 0) return false;

        const currentHash = getSessionHash(files, activeFilePath);
        if (currentHash === lastSavedHashRef.current) {
            return true; // No changes
        }

        const config: WorkspaceConfig = {
            version: CONFIG_VERSION,
            lastModified: new Date().toISOString(),
            files: files.map(f => ({
                path: f.path || f.name,
                name: f.name,
                size: f.size,
                layers: f.layers
            })),
            activeFilePath: activeFilePath || null
        };

        const success = await saveWorkspaceConfig(configPath, config);
        if (success) {
            lastSavedHashRef.current = currentHash;
            console.log(`[WorkspaceConfig] Saved session: ${files.length} files`);
        }
        return success;
    }, [getConfigPath, files, activeFilePath, getSessionHash]);

    // Load config from workspace
    const loadConfig = useCallback(async (): Promise<boolean> => {
        const configPath = getConfigPath();
        if (!configPath) return false;

        isLoadingRef.current = true;
        try {
            const config = await loadWorkspaceConfig(configPath);
            if (!config) return false;

            // Handle new schema (files list)
            if (config.files && config.files.length > 0) {
                console.log(`[WorkspaceConfig] Restoring session: ${config.files.length} files`);

                const newFiles: FileData[] = config.files.map((cf, i) => ({
                    id: `bridged-restored-${Date.now()}-${i}`,
                    name: cf.name,
                    size: cf.size,
                    lineCount: 0, // Will update when loaded
                    rawCount: 0,
                    // Force collapse all layers when loading from config
                    layers: (cf.layers || []).map(l => ({ ...l, isCollapsed: true })),
                    isBridged: true,
                    path: cf.path,
                    history: { past: [], future: [] }
                }));

                setFiles(newFiles);

                // Restore active file
                if (config.activeFilePath) {
                    const found = newFiles.find(f => f.path === config.activeFilePath);
                    if (found) {
                        setTimeout(() => setActiveFileId(found.id), 100);
                    }
                } else if (newFiles.length > 0) {
                    setTimeout(() => setActiveFileId(newFiles[0].id), 100);
                }

                lastSavedHashRef.current = getSessionHash(newFiles, config.activeFilePath);
                return true;
            }
            // Handle legacy/fallback (global layers) - user for upgrading from v1
            else if (config.layers && config.layers.length > 0) {
                // We don't restore files here, just layers for currently open ones?
                // Actually this case assumes files are already open, which contradicts the
                // requirement to "restore opened files". 
                // We'll ignore legacy layer-only restoration for empty sessions.
                console.log('[WorkspaceConfig] Legacy config found, skipping session restore (no files list)');
            }
            return false;
        } finally {
            isLoadingRef.current = false;
        }
    }, [getConfigPath, setFiles, setActiveFileId, getSessionHash]);

    // Auto-load when workspace changes
    useEffect(() => {
        if (workspaceRoot?.path) {
            // Always reload config when workspace changes (user explicitly switched folders)
            loadConfig().then(success => {
                if (!success) {
                    // No config found, clear current session
                    setFiles([]);
                    setActiveFileId(null);
                    console.log('[WorkspaceConfig] No config found for new workspace, cleared session');
                }
            });
        }
    }, [workspaceRoot?.path]); // Only triggers on root change

    // Auto-save debouncer
    useEffect(() => {
        if (isLoadingRef.current) return;
        if (files.length === 0 && !workspaceRoot) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(() => {
            saveConfig();
        }, SAVE_DEBOUNCE_MS);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [files, activeFileId, activeFilePath]); // Triggers on any file/layer change

    return { saveConfig, loadConfig };
}

