/**
 * useSearch - Search state and operations hook
 * 
 * Manages search query, config, match navigation, and sync with backend.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { syncAll } from '../bridge_client';
import { LogLayer } from '../types';

export interface SearchConfig {
    regex: boolean;
    caseSensitive: boolean;
    wholeWord?: boolean;
}

export interface UseSearchProps {
    activeFileId: string | null;
    layers: LogLayer[];
    layersFunctionalHash: string;
    lineCount: number;
    searchMatchCount: number;
    setProcessedCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export interface UseSearchReturn {
    // Search state
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchConfig: SearchConfig;
    setSearchConfig: React.Dispatch<React.SetStateAction<SearchConfig>>;

    // Match state
    currentMatchRank: number;
    setCurrentMatchRank: (rank: number) => void;
    currentMatchIndex: number;
    isSearching: boolean;
    setIsSearching: (searching: boolean) => void;

    // Computed
    searchMatchCount: number;
    currentMatchNumber: number;

    // Operations
    findNextSearchMatch: (direction: 'next' | 'prev') => Promise<number>;
    clearSearch: () => void;
}

export function useSearch({
    activeFileId,
    layers,
    layersFunctionalHash,
    lineCount,
    searchMatchCount,
    setProcessedCache
}: UseSearchProps): UseSearchReturn {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchConfig, setSearchConfig] = useState<SearchConfig>({
        regex: false,
        caseSensitive: false,
        wholeWord: false
    });
    const [currentMatchRank, setCurrentMatchRank] = useState(-1);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
    const [isSearching, setIsSearching] = useState(false);
    const [isLayerProcessing, setIsLayerProcessing] = useState(false);

    // Sync with backend when layers or search changes
    useEffect(() => {
        if (!activeFileId) return;

        const timer = setTimeout(async () => {
            const searchConf = searchQuery ? {
                query: searchQuery,
                regex: searchConfig.regex,
                caseSensitive: searchConfig.caseSensitive
            } : null;

            if (searchQuery) {
                setIsSearching(true);
                setCurrentMatchRank(-1);
                setCurrentMatchIndex(-1);

                // Clear current matches to indicate loading
                setProcessedCache(prev => ({
                    ...prev,
                    [activeFileId]: { ...prev[activeFileId], searchMatchCount: 0 }
                }));
            }

            await syncAll(activeFileId, layers, searchConf);

            if (!searchQuery) {
                setIsSearching(false);
                setCurrentMatchRank(-1);
                setCurrentMatchIndex(-1);
            }

            setIsLayerProcessing(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [layersFunctionalHash, searchQuery, searchConfig, activeFileId, lineCount]);

    // Current match number (1-indexed position)
    const currentMatchNumber = useMemo(() => {
        if (currentMatchRank === -1 || !searchQuery) return 0;
        return currentMatchRank + 1;
    }, [currentMatchRank, searchQuery]);

    // Find next/prev match
    const findNextSearchMatch = useCallback(async (direction: 'next' | 'prev'): Promise<number> => {
        if (!searchQuery || searchMatchCount === 0 || !activeFileId) return -1;

        let nextRank = -1;
        if (direction === 'next') {
            nextRank = (currentMatchRank + 1) % searchMatchCount;
        } else {
            nextRank = (currentMatchRank - 1 + searchMatchCount) % searchMatchCount;
        }

        if (nextRank !== -1) {
            setCurrentMatchRank(nextRank);
            const { getSearchMatchIndex } = await import('../bridge_client');
            const index = await getSearchMatchIndex(activeFileId, nextRank);
            setCurrentMatchIndex(index);
            return index;
        }

        return -1;
    }, [searchQuery, searchMatchCount, currentMatchRank, activeFileId]);

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setCurrentMatchRank(-1);
        setCurrentMatchIndex(-1);
        setIsSearching(false);
    }, []);

    return {
        searchQuery,
        setSearchQuery,
        searchConfig,
        setSearchConfig,
        currentMatchRank,
        setCurrentMatchRank,
        currentMatchIndex,
        isSearching,
        setIsSearching,
        searchMatchCount,
        currentMatchNumber,
        findNextSearchMatch,
        clearSearch
    };
}
