import { useState, useEffect, useCallback } from 'react';
import { ensureBridge } from '../bridge_client';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

export interface UseConnectionStateReturn {
    state: ConnectionState;
    error: string | null;
    retryCount: number;
    reconnect: () => void;
    isConnected: boolean;
    isReconnecting: boolean;
}

export function useConnectionState(): UseConnectionStateReturn {
    const [state, setState] = useState<ConnectionState>('disconnected');
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let cleanup: (() => void) | null = null;

        const initConnection = async () => {
            try {
                const bridge = await ensureBridge();
                if (!bridge) {
                    setError('Bridge not available');
                    return;
                }

                // Get initial state
                const initialState = (bridge as any).getConnectionState?.();
                if (initialState) {
                    setState(initialState);
                }

                // Subscribe to state changes
                const unsubscribe = (bridge as any).addStateListener?.((newState: ConnectionState) => {
                    setState(newState);
                    if (newState === 'connected') {
                        setError(null);
                        setRetryCount(0);
                    } else if (newState === 'disconnected') {
                        setError('Connection lost');
                    } else if (newState === 'reconnecting') {
                        setRetryCount(prev => prev + 1);
                    }
                });

                cleanup = unsubscribe || null;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to initialize connection');
            }
        };

        initConnection();

        return () => {
            if (cleanup) {
                cleanup();
            }
        };
    }, []);

    const reconnect = useCallback(() => {
        setState('reconnecting');
        // The WebBridge will automatically attempt reconnection
        // Force a re-initialization by refreshing the page or reconnecting manually
        window.location.reload();
    }, []);

    return {
        state,
        error,
        retryCount,
        reconnect,
        isConnected: state === 'connected',
        isReconnecting: state === 'reconnecting' || state === 'connecting'
    };
}
