import { useState, useCallback, useMemo } from 'react';

export interface LoadingState {
    isLoading: boolean;
    progress?: number;
    message?: string;
    error?: string;
}

export interface UseLoadingStateReturn {
    states: Map<string, LoadingState>;
    isAnyLoading: boolean;
    startLoading: (key: string, message?: string) => void;
    updateProgress: (key: string, progress: number) => void;
    stopLoading: (key: string) => void;
    setError: (key: string, error: string) => void;
    clearError: (key: string) => void;
    getState: (key: string) => LoadingState | undefined;
}

export function useLoadingState(): UseLoadingStateReturn {
    const [states, setStates] = useState<Map<string, LoadingState>>(new Map());

    const startLoading = useCallback((key: string, message?: string) => {
        setStates(prev => {
            const next = new Map(prev);
            next.set(key, { isLoading: true, message });
            return next;
        });
    }, []);

    const updateProgress = useCallback((key: string, progress: number) => {
        setStates(prev => {
            const current = prev.get(key);
            if (!current) return prev;
            const next = new Map(prev);
            next.set(key, { ...current, progress });
            return next;
        });
    }, []);

    const stopLoading = useCallback((key: string) => {
        setStates(prev => {
            const current = prev.get(key);
            if (!current) return prev;
            const next = new Map(prev);
            next.set(key, { ...current, isLoading: false, progress: 100 });
            return next;
        });
    }, []);

    const setError = useCallback((key: string, error: string) => {
        setStates(prev => {
            const next = new Map(prev);
            next.set(key, { isLoading: false, error });
            return next;
        });
    }, []);

    const clearError = useCallback((key: string) => {
        setStates(prev => {
            const current = prev.get(key);
            if (!current) return prev;
            const next = new Map(prev);
            next.set(key, { ...current, error: undefined });
            return next;
        });
    }, []);

    const getState = useCallback((key: string) => {
        return states.get(key);
    }, [states]);

    const isAnyLoading = useMemo(() => {
        return Array.from(states.values()).some(s => s.isLoading);
    }, [states]);

    return {
        states,
        isAnyLoading,
        startLoading,
        updateProgress,
        stopLoading,
        setError,
        clearError,
        getState
    };
}
