import { useEffect, useRef } from 'react';
import { getNearestBookmarkIndex } from '../bridge_client';

interface UseBookmarkLogicProps {
    activeFileId: string | null;
    highlightedIndex: number | null;
    setHighlightedIndex: (index: number | null) => void;
    setScrollToIndex: (index: number | null) => void;
}

export const useBookmarkLogic = ({
    activeFileId,
    highlightedIndex,
    setHighlightedIndex,
    setScrollToIndex
}: UseBookmarkLogicProps) => {
    const scrollTimeoutRef = useRef<number | null>(null);

    // F2/Shift+F2 快捷键跳转到上/下一个书签
    useEffect(() => {
        const handleF2 = async (e: KeyboardEvent) => {
            if (e.key !== 'F2') return;
            e.preventDefault();

            if (!activeFileId) return;
            const currentIdx = highlightedIndex ?? 0;
            const direction = e.shiftKey ? 'prev' : 'next';

            try {
                const targetIdx = await getNearestBookmarkIndex(activeFileId, currentIdx, direction);
                if (targetIdx >= 0) {
                    // 清除之前的 timeout，防止快速连续按键时的竞态条件
                    if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                    }
                    setScrollToIndex(targetIdx);
                    setHighlightedIndex(targetIdx);
                    scrollTimeoutRef.current = window.setTimeout(() => setScrollToIndex(null), 150);
                }
            } catch (err) {
                console.error('[Bookmark] Navigation failed:', err);
            }
        };

        window.addEventListener('keydown', handleF2);
        return () => {
            window.removeEventListener('keydown', handleF2);
            if (scrollTimeoutRef.current) {
                clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [activeFileId, highlightedIndex, setScrollToIndex, setHighlightedIndex]);
};
