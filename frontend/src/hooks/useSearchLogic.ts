import React, { useState, useCallback, useEffect } from 'react';
import { useSearch, SearchConfig, UseSearchReturn } from './useSearch';
import { LogLayer } from '../types';

interface UseSearchLogicProps {
    activeFileId: string | null;
    layers: LogLayer[];
    layersFunctionalHash: string;
    lineCount: number;
    searchMatchCount: number;
    setProcessedCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}

export interface UseSearchLogicReturn extends UseSearchReturn {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchConfig: SearchConfig;
    setSearchConfig: React.Dispatch<React.SetStateAction<SearchConfig>>;
}

export const useSearchLogic = ({
    activeFileId,
    layers,
    layersFunctionalHash,
    lineCount,
    searchMatchCount,
    setProcessedCache
}: UseSearchLogicProps): UseSearchLogicReturn => {
    // 搜索状态
    const [searchQuery, setSearchQuery] = useState('');
    const [searchConfig, setSearchConfig] = useState<SearchConfig>({
        regex: false,
        caseSensitive: false,
        wholeWord: false,
        mode: 'highlight' // 默认高亮模式
    });

    // 核心搜索 Hook
    const search = useSearch({
        activeFileId,
        layers,
        layersFunctionalHash,
        lineCount,
        searchMatchCount,
        setProcessedCache,
        searchQuery,
        setSearchQuery,
        searchConfig,
        setSearchConfig
    });

    // F3/Shift+F3 快捷键处理 (搜索结果跳转)
    useEffect(() => {
        const handleF3 = async (e: KeyboardEvent) => {
            if (e.key !== 'F3') return;
            e.preventDefault();

            const direction = e.shiftKey ? 'prev' : 'next';
            await search.findNextSearchMatch(direction);
        };

        window.addEventListener('keydown', handleF3);
        return () => window.removeEventListener('keydown', handleF3);
    }, [search.findNextSearchMatch]);

    return {
        searchQuery,
        setSearchQuery,
        searchConfig,
        setSearchConfig,
        ...search
    };
};
