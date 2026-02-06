/**
 * useUIState - UI interaction state hook
 * 
 * Manages UI state like sidebar width, active views, find/goto visibility,
 * scroll position, and keyboard shortcuts.
 */

import { useState, useCallback, useEffect } from 'react';

export type ActiveView = 'main' | 'search' | 'help';

export interface UseUIStateProps {
    undo: () => void;
    redo: () => void;
    setSearchQuery: (query: string) => void;
    searchQuery: string;
    // 书签导航回调
    onNavigateToNextBookmark?: () => void;
    onNavigateToPrevBookmark?: () => void;
}

export interface UseUIStateReturn {
    // View state
    activeView: ActiveView;
    setActiveView: (view: ActiveView) => void;

    // Sidebar
    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;

    // Find/GoTo widgets
    isFindVisible: boolean;
    setIsFindVisible: (visible: boolean) => void;
    isGoToLineVisible: boolean;
    setIsGoToLineVisible: (visible: boolean) => void;

    // Scroll/highlight
    scrollToIndex: number | null;
    setScrollToIndex: (index: number | null) => void;
    highlightedIndex: number | null;
    setHighlightedIndex: (index: number | null) => void;

    // Processing status
    isProcessing: boolean;
    setIsProcessing: (processing: boolean) => void;
    loadingProgress: number;
    setLoadingProgress: (progress: number) => void;
    operationStatus: { op: string; progress: number; error?: string } | null;
    setOperationStatus: (status: { op: string; progress: number; error?: string } | null) => void;

    // Workspace
    workspaceRoot: { path: string; name: string } | null;
    setWorkspaceRoot: (root: { path: string; name: string } | null) => void;

    // Jump to line helper
    handleJumpToLine: (index: number, totalLines: number) => void;

    // Log viewer interaction handler
    handleLogViewerInteraction: () => void;
}

export function useUIState({
    undo,
    redo,
    setSearchQuery,
    searchQuery,
    onNavigateToNextBookmark,
    onNavigateToPrevBookmark
}: UseUIStateProps): UseUIStateReturn {
    // View state
    const [activeView, setActiveView] = useState<ActiveView>('main');

    // Sidebar
    const [sidebarWidth, setSidebarWidth] = useState(288);

    // Find/GoTo widgets
    const [isFindVisible, setIsFindVisible] = useState(false);
    const [isGoToLineVisible, setIsGoToLineVisible] = useState(false);

    // Scroll/highlight
    const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

    // Processing status
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [operationStatus, setOperationStatus] = useState<{ op: string; progress: number; error?: string } | null>(null);

    // Workspace
    const [workspaceRoot, setWorkspaceRoot] = useState<{ path: string; name: string } | null>(null);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isZ = e.key.toLowerCase() === 'z';
            const isY = e.key.toLowerCase() === 'y';
            const isF = e.key.toLowerCase() === 'f';
            const isG = e.key.toLowerCase() === 'g';
            const isCmdOrCtrl = e.metaKey || e.ctrlKey;
            const isShift = e.shiftKey;

            if (isCmdOrCtrl && isZ) {
                e.preventDefault();
                if (isShift) redo();
                else undo();
            } else if (isCmdOrCtrl && isY) {
                e.preventDefault();
                redo();
            } else if (isCmdOrCtrl && isF) {
                e.preventDefault();
                const selection = window.getSelection()?.toString();
                if (selection) {
                    const firstLine = selection.split(/\r?\n/)[0].trim();
                    if (firstLine) {
                        setSearchQuery(firstLine);
                    }
                }
                setIsFindVisible(true);
            } else if (isCmdOrCtrl && isG) {
                e.preventDefault();
                setIsGoToLineVisible(true);
            } else if (e.key === 'F2') {
                // F2: Navigate to next/prev bookmark
                e.preventDefault();
                if (isShift) {
                    onNavigateToPrevBookmark?.();
                } else {
                    onNavigateToNextBookmark?.();
                }
            } else if (e.key === 'Escape') {
                if (isFindVisible) setIsFindVisible(false);
                if (isGoToLineVisible) setIsGoToLineVisible(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, isFindVisible, isGoToLineVisible, setSearchQuery, onNavigateToNextBookmark, onNavigateToPrevBookmark]);

    // Jump to line
    const handleJumpToLine = useCallback((index: number, totalLines: number) => {
        if (totalLines === 0) return;

        const boundedIndex = Math.max(0, Math.min(index, totalLines - 1));

        setScrollToIndex(boundedIndex);
        setHighlightedIndex(boundedIndex);

        // Clear scroll signal after delay
        setTimeout(() => {
            setScrollToIndex(null);
        }, 150);
    }, []);

    // Handle log viewer interaction (clears highlight when user interacts)
    const handleLogViewerInteraction = useCallback(() => {
        if (highlightedIndex !== null) {
            setHighlightedIndex(null);
        }
        if (!isFindVisible && activeView !== 'search' && searchQuery) {
            setSearchQuery('');
        }
    }, [highlightedIndex, isFindVisible, activeView, searchQuery, setSearchQuery]);

    return {
        activeView,
        setActiveView,
        sidebarWidth,
        setSidebarWidth,
        isFindVisible,
        setIsFindVisible,
        isGoToLineVisible,
        setIsGoToLineVisible,
        scrollToIndex,
        setScrollToIndex,
        highlightedIndex,
        setHighlightedIndex,
        isProcessing,
        setIsProcessing,
        loadingProgress,
        setLoadingProgress,
        operationStatus,
        setOperationStatus,
        workspaceRoot,
        setWorkspaceRoot,
        handleJumpToLine,
        handleLogViewerInteraction
    };
}
