import React, { useCallback } from 'react';

interface DragOptions<T> {
    onStart?: () => T;
    onDrag: (delta: number, startState: T) => void;
    onEnd?: () => void;
    cursor?: string;
}

export const useDrag = <T = void>({ onStart, onDrag, onEnd, cursor = 'row-resize' }: DragOptions<T>) => {
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startState = onStart ? onStart() : undefined;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientY - startY;
            onDrag(delta, startState as T);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            if (onEnd) onEnd();
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = cursor;
    }, [onDrag, onEnd, onStart, cursor]);

    return { handleMouseDown };
};
