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
    bridgedMatches: number[];
    setProcessedCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export interface UseSearchReturn {
    // Search state
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchConfig: SearchConfig;
    setSearchConfig: React.Dispatch<React.SetStateAction<SearchConfig>>;

    // Match state
    currentMatchIndex: number;
    setCurrentMatchIndex: (index: number) => void;
    isSearching: boolean;
    setIsSearching: (searching: boolean) => void;

    // Computed
    searchMatchCount: number;
    currentMatchNumber: number;

    // Operations
    findNextSearchMatch: (direction: 'next' | 'prev') => number;
    clearSearch: () => void;
}

export function useSearch({
    activeFileId,
    layers,
    layersFunctionalHash,
    lineCount,
    bridgedMatches,
    setProcessedCache
}: UseSearchProps): UseSearchReturn {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchConfig, setSearchConfig] = useState<SearchConfig>({
        regex: false,
        caseSensitive: false,
        wholeWord: false
    });
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
                setCurrentMatchIndex(-1);

                // Clear current matches to indicate loading
                setProcessedCache(prev => ({
                    ...prev,
                    [activeFileId]: { ...prev[activeFileId], searchMatches: [] }
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
    }, [layersFunctionalHash, searchQuery, searchConfig, activeFileId, lineCount]);

    // Search match count
    const searchMatchCount = useMemo(() => {
        return bridgedMatches.length;
    }, [bridgedMatches]);

    // Current match number (1-indexed position)
    const currentMatchNumber = useMemo(() => {
        if (currentMatchIndex === -1 || !searchQuery) return 0;
        const idx = bridgedMatches.indexOf(currentMatchIndex);
        return idx !== -1 ? idx + 1 : 0;
    }, [currentMatchIndex, searchQuery, bridgedMatches]);

    // Find next/prev match
    const findNextSearchMatch = useCallback((direction: 'next' | 'prev'): number => {
        if (!searchQuery || bridgedMatches.length === 0) return -1;

        let nextIdx = -1;
        const currentPos = currentMatchIndex !== -1 ? currentMatchIndex : -1;

        if (direction === 'next') {
            const found = bridgedMatches.find(m => m > currentPos);
            nextIdx = found !== undefined ? found : bridgedMatches[0];
        } else {
            // Optimized backward search
            for (let i = bridgedMatches.length - 1; i >= 0; i--) {
                if (bridgedMatches[i] < currentPos) {
                    nextIdx = bridgedMatches[i];
                    break;
                }
            }
            // Wrap around to the last match
            if (nextIdx === -1) nextIdx = bridgedMatches[bridgedMatches.length - 1];
        }

        if (nextIdx !== -1) {
            setCurrentMatchIndex(nextIdx);
        }

        return nextIdx;
    }, [searchQuery, bridgedMatches, currentMatchIndex]);

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setCurrentMatchIndex(-1);
        setIsSearching(false);
    }, []);

    return {
        searchQuery,
        setSearchQuery,
        searchConfig,
        setSearchConfig,
        currentMatchIndex,
        setCurrentMatchIndex,
        isSearching,
        setIsSearching,
        searchMatchCount,
        currentMatchNumber,
        findNextSearchMatch,
        clearSearch
    };
}
