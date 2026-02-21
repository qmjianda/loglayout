import { useState, useCallback, useEffect } from 'react';

export interface SearchHistoryItem {
    query: string;
    timestamp: number;
    config: {
        regex: boolean;
        caseSensitive: boolean;
        wholeWord?: boolean;
    };
}

const STORAGE_KEY = 'loglayer_search_history';
const MAX_HISTORY = 20;

export function useSearchHistory() {
    const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);

    const addToHistory = useCallback((query: string, config: SearchHistoryItem['config']) => {
        if (!query.trim()) return;
        
        setSearchHistory(prev => {
            // Remove duplicate if exists (will move to front)
            const filtered = prev.filter(item => item.query !== query);
            // Add new entry at the beginning
            const newItem: SearchHistoryItem = {
                query,
                timestamp: Date.now(),
                config
            };
            // Cap at MAX_HISTORY
            return [newItem, ...filtered].slice(0, MAX_HISTORY);
        });
    }, []);

    const removeFromHistory = useCallback((index: number) => {
        setSearchHistory(prev => prev.filter((_, i) => i !== index));
    }, []);

    const clearHistory = useCallback(() => {
        setSearchHistory([]);
    }, []);

    return {
        searchHistory,
        addToHistory,
        removeFromHistory,
        clearHistory
    };
}
