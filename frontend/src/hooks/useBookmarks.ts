import { useState, useEffect, useCallback, useRef } from 'react';
import {
    getBookmarks,
    toggleBookmark as apiToggleBookmark,
    updateBookmarkComment as apiUpdateComment,
    clearBookmarks as apiClearBookmarks,
    getLinesByIndices,
    physicalToVisualIndex
} from '../bridge_client';

export interface BookmarkPreview {
    index: number;
    text: string;
}

export const useBookmarks = (activeFileId: string | null) => {
    const [bookmarks, setBookmarks] = useState<Record<number, string>>({});
    const [previews, setPreviews] = useState<Record<number, string>>({});
    const [isLoading, setIsLoading] = useState(false);

    // Internal trigger for refreshes
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const fetchBookmarks = useCallback(async () => {
        if (!activeFileId) {
            setBookmarks({});
            setPreviews({});
            return;
        }

        try {
            setIsLoading(true);
            const b = await getBookmarks(activeFileId);
            setBookmarks(b);

            // Fetch previews for the bookmarks (limited to first 50)
            const indices = Object.keys(b).map(Number);
            if (indices.length > 0) {
                const lines = await getLinesByIndices(activeFileId, indices.slice(0, 50));
                console.debug('[useBookmarks] Preview fetch:', { indices, linesReturned: lines?.length, lines });
                const newPreviews: Record<number, string> = {};
                if (Array.isArray(lines)) {
                    lines.forEach(l => {
                        if (l && typeof l.index === 'number' && typeof l.text === 'string') {
                            newPreviews[l.index] = l.text.length > 60 ? l.text.slice(0, 60) + '...' : l.text;
                        }
                    });
                }
                setPreviews(newPreviews);
            } else {
                setPreviews({});
            }
        } catch (e) {
            console.error('[useBookmarks] Fetch error:', e);
        } finally {
            setIsLoading(false);
        }
    }, [activeFileId]);

    useEffect(() => {
        fetchBookmarks();
    }, [fetchBookmarks, refreshTrigger]);

    const toggle = useCallback(async (lineIndex: number) => {
        if (!activeFileId) return;

        // Optimistic update
        setBookmarks(prev => {
            const next = { ...prev };
            if (lineIndex in next) {
                delete next[lineIndex];
            } else {
                next[lineIndex] = "";
            }
            return next;
        });

        try {
            await apiToggleBookmark(activeFileId, lineIndex);
            // Refresh both bookmarks AND previews
            setRefreshTrigger(t => t + 1);
        } catch (e) {
            console.error('[useBookmarks] Toggle error:', e);
            setRefreshTrigger(t => t + 1); // Rollback/Refresh
        }
    }, [activeFileId]);

    const updateComment = useCallback(async (lineIndex: number, comment: string) => {
        if (!activeFileId) return;

        // Optimistic update
        setBookmarks(prev => ({
            ...prev,
            [lineIndex]: comment
        }));

        try {
            await apiUpdateComment(activeFileId, lineIndex, comment);
            // Refresh both bookmarks AND previews
            setRefreshTrigger(t => t + 1);
        } catch (e) {
            console.error('[useBookmarks] Comment update error:', e);
            setRefreshTrigger(t => t + 1);
        }
    }, [activeFileId]);

    const clear = useCallback(async () => {
        if (!activeFileId) return;

        if (!window.confirm('确定要清除所有书签吗？')) return;

        setBookmarks({});
        try {
            await apiClearBookmarks(activeFileId);
            setRefreshTrigger(t => t + 1);
        } catch (e) {
            console.error('[useBookmarks] Clear error:', e);
            setRefreshTrigger(t => t + 1);
        }
    }, [activeFileId]);

    const jumpTo = useCallback(async (lineIndex: number, onJump: (visualIdx: number) => void) => {
        if (!activeFileId) return;
        const visualIdx = await physicalToVisualIndex(activeFileId, lineIndex);
        onJump(visualIdx);
    }, [activeFileId]);

    return {
        bookmarks,
        previews,
        isLoading,
        toggle,
        updateComment,
        clear,
        jumpTo,
        refresh: () => setRefreshTrigger(t => t + 1)
    };
};
