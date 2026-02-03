/**
 * useBridge - Core hook for backend communication via REST + WebSockets
 * 
 * This hook initializes the bridge connection and provides callback registration
 * for all backend signals. Other hooks should use the callbacks to update their state.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { initBridge } from '../bridge_client';
import { FileBridgeAPI } from '../types';

// Types for bridge callbacks
export interface FileLoadedInfo {
    name: string;
    size: number;
    lineCount: number;
    path?: string;
}

export interface PipelineResult {
    fileId: string;
    newTotal: number;
    matchCount: number;
}

export interface LayerStats {
    [layerId: string]: {
        count: number;
        distribution: number[];
    };
}

export interface OperationStatus {
    op: string;
    progress: number;
    error?: string;
}

export interface BridgeCallbacks {
    onFileLoaded?: (fileId: string, info: FileLoadedInfo) => void;
    onPipelineFinished?: (fileId: string, newTotal: number, matchCount: number) => void;
    onStatsFinished?: (fileId: string, stats: LayerStats) => void;
    onOperationStarted?: (fileId: string, op: string) => void;
    onOperationProgress?: (fileId: string, op: string, progress: number) => void;
    onOperationError?: (fileId: string, op: string, message: string) => void;
    onPendingFilesCount?: (count: number) => void;
    onWorkspaceOpened?: (path: string) => void;
}

export interface UseBridgeReturn {
    bridgeReady: boolean;
    bridgeApi: FileBridgeAPI | null;
    activeFileIdRef: React.MutableRefObject<string | null>;
    setActiveFileId: (fileId: string | null) => void;
}

export function useBridge(callbacks: BridgeCallbacks): UseBridgeReturn {
    const [bridgeReady, setBridgeReady] = useState(false);
    const [bridgeApi, setBridgeApi] = useState<FileBridgeAPI | null>(null);
    const activeFileIdRef = useRef<string | null>(null);

    // Store callbacks in refs to avoid re-initializing bridge on callback changes
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    const setActiveFileId = useCallback((fileId: string | null) => {
        activeFileIdRef.current = fileId;
    }, []);

    // Initialize Bridge - runs only once on mount
    useEffect(() => {
        initBridge().then(api => {
            if (!api) {
                console.error('[useBridge] Failed to initialize bridge');
                return;
            }

            setBridgeApi(api);

            // fileLoaded signal
            api.fileLoaded.connect((fileId: string, rawInfo: any) => {
                try {
                    const info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
                    callbacksRef.current.onFileLoaded?.(fileId, info);
                } catch (e) {
                    console.error('[useBridge] Failed to parse fileLoaded info:', e);
                }
            });

            // pipelineFinished signal
            api.pipelineFinished?.connect?.((fileId: string, newTotal: number, matchCount: number) => {
                callbacksRef.current.onPipelineFinished?.(fileId, newTotal, matchCount);
            });

            // statsFinished signal
            api.statsFinished?.connect?.((fileId: string, statsJson: string) => {
                try {
                    const stats = typeof statsJson === 'string' ? JSON.parse(statsJson) : statsJson;
                    callbacksRef.current.onStatsFinished?.(fileId, stats);
                } catch (e) {
                    console.error('[useBridge] Stats parse error:', e);
                }
            });

            // operationStarted signal
            api.operationStarted?.connect?.((fileId: string, op: string) => {
                callbacksRef.current.onOperationStarted?.(fileId, op);
            });

            // operationProgress signal
            api.operationProgress?.connect?.((fileId: string, op: string, progress: number) => {
                callbacksRef.current.onOperationProgress?.(fileId, op, progress);
            });

            // operationError signal
            api.operationError?.connect?.((fileId: string, op: string, message: string) => {
                callbacksRef.current.onOperationError?.(fileId, op, message);
            });

            // pendingFilesCount signal (CLI files)
            api.pendingFilesCount?.connect?.((count: number) => {
                callbacksRef.current.onPendingFilesCount?.(count);
            });

            // workspaceOpened signal
            api.workspaceOpened?.connect?.((path: string) => {
                callbacksRef.current.onWorkspaceOpened?.(path);
            });

            // Notify backend that frontend is ready
            api.ready();
            setBridgeReady(true);
        });
    }, []); // Initialize only once

    return {
        bridgeReady,
        bridgeApi,
        activeFileIdRef,
        setActiveFileId
    };
}
