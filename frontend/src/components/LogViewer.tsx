import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LogLine, LayerType } from '../types';
import { readProcessedLines } from '../bridge_client';

interface LogViewerProps {
  // Data source
  totalLines: number;
  fileId: string | null;

  // Interaction
  searchQuery: string;
  searchConfig: { regex: boolean; caseSensitive: boolean; wholeWord?: boolean };
  scrollToIndex?: number | null;
  highlightedIndex?: number | null;
  onLineClick?: (index: number) => void;
  onAddLayer?: (type: LayerType, config?: any) => void;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  totalLines,
  fileId,
  searchQuery,
  searchConfig,
  scrollToIndex,
  highlightedIndex,
  onLineClick,
  onAddLayer,
  onVisibleRangeChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null);

  // Lines fetched from bridge for current viewport
  const [bridgedLines, setBridgedLines] = useState<Map<number, LogLine | string>>(new Map());
  const lastFetchRef = useRef<{ start: number; end: number }>({ start: -1, end: -1 });

  const lineHeight = 20;
  const buffer = 25;
  const VIRTUAL_HEIGHT_LIMIT = 10000000; // 10M pixels limit for safety, browser limit is ~33M

  const realTotalHeight = totalLines * lineHeight;
  const useScrollScaling = realTotalHeight > VIRTUAL_HEIGHT_LIMIT;
  const scaleFactor = useScrollScaling ? VIRTUAL_HEIGHT_LIMIT / realTotalHeight : 1;
  const virtualTotalHeight = useScrollScaling ? VIRTUAL_HEIGHT_LIMIT : realTotalHeight;

  // Calculate visible range with scaling support
  const effectiveScrollTop = useScrollScaling ? scrollTop / scaleFactor : scrollTop;
  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / lineHeight) - buffer);
  const endIndex = Math.min(totalLines, Math.floor((effectiveScrollTop + viewportHeight) / lineHeight) + buffer);

  // Fetch lines from bridge when viewport changes
  useEffect(() => {
    if (!fileId || totalLines === 0) return;

    // Debounce and avoid duplicate fetches
    const fetchStart = startIndex;
    const fetchEnd = endIndex;

    if (fetchStart === lastFetchRef.current.start && fetchEnd === lastFetchRef.current.end) {
      return;
    }

    lastFetchRef.current = { start: fetchStart, end: fetchEnd };

    const timer = setTimeout(async () => {
      try {
        const count = fetchEnd - fetchStart;
        if (count <= 0) return;
        const lines = await readProcessedLines(fileId, fetchStart, count);

        setBridgedLines(prev => {
          const next = new Map(prev);
          lines.forEach((line, idx) => {
            next.set(fetchStart + idx, line);
          });

          // Limit cache size
          if (next.size > 5000) {
            const keys = Array.from(next.keys()).sort((a, b) => Number(a) - Number(b));
            const toRemove = keys.slice(0, 2000);
            toRemove.forEach(k => next.delete(k));
          }

          return next;
        });
      } catch (e) {
        console.error('Failed to fetch lines:', e);
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [startIndex, endIndex, fileId, totalLines]);

  // Get line content
  const getLine = useCallback((index: number): LogLine | string => {
    return bridgedLines.get(index) || '';
  }, [bridgedLines]);

  // Resize observer
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setViewportHeight(containerRef.current.clientHeight);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scroll to index
  useEffect(() => {
    if (scrollToIndex !== null && scrollToIndex !== undefined && containerRef.current) {
      const realScroll = Math.max(0, scrollToIndex * lineHeight - (viewportHeight / 3));
      const targetScroll = useScrollScaling ? realScroll * scaleFactor : realScroll;
      containerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });
    }
  }, [scrollToIndex, totalLines, viewportHeight, useScrollScaling, scaleFactor]);

  // Fix scroll speed for large files (Scaling Mode)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !useScrollScaling) return;

    const handleWheel = (e: WheelEvent) => {
      // Only override vertical scrolling when in scaling mode
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        // The goal is to move the EFFECTIVE scroll by e.deltaY pixels.
        // Since effectiveScroll = scrollTop / scaleFactor,
        // we need d(scrollTop) = d(effectiveScroll) * scaleFactor
        container.scrollTop += e.deltaY * scaleFactor;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [useScrollScaling, scaleFactor]);

  // Context menu handling
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    if (!containerRef.current?.contains(selection.anchorNode)) return;
    const text = selection.toString().trim();
    if (!text) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const menuY = rect.top - 40 < 0 ? rect.bottom + 5 : rect.top - 40;
    setContextMenu({ x: rect.left + (rect.width / 2), y: menuY, text });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.context-menu-popup')) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Notify parent of visible range
  useEffect(() => {
    onVisibleRangeChange?.(startIndex, endIndex);
  }, [startIndex, endIndex, onVisibleRangeChange]);

  // Render line content
  const renderLineContent = (line: LogLine | string) => {
    if (typeof line === 'string') return <span>{line}</span>;
    if (!line) return <span></span>;
    const content = line.displayContent || line.content || '';
    if (!line.highlights || line.highlights.length === 0) return <span>{content}</span>;

    const sorted = [...line.highlights].sort((a, b) => a.start - b.start || b.end - a.end);
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    for (let i = 0; i < sorted.length; i++) {
      const h = sorted[i];
      if (h.start >= content.length) break;
      if (h.start < lastIndex) continue;
      if (h.start > lastIndex) {
        elements.push(<span key={`t-${i}`}>{content.substring(lastIndex, h.start)}</span>);
      }
      const opacity = (h.opacity || 100) / 100;
      const end = Math.min(h.end, content.length);
      elements.push(
        <span key={`h-${i}`} style={{
          backgroundColor: h.color.startsWith('#') ? `${h.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}` : h.color,
          color: '#fff', padding: '0 1px', borderRadius: '1px'
        }}>{content.substring(h.start, end)}</span>
      );
      lastIndex = end;
    }
    if (lastIndex < content.length) {
      elements.push(<span key="end">{content.substring(lastIndex)}</span>);
    }
    return elements;
  };

  // Build visible lines
  const visibleLines: (LogLine | string)[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleLines.push(getLine(i));
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onMouseUp={handleMouseUp}
      className="flex-1 overflow-auto bg-[#1e1e1e] font-mono text-[12px] relative custom-scrollbar"
    >
      <div style={{ height: `${virtualTotalHeight}px`, width: '100%' }}>
        <div className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${useScrollScaling ? (startIndex * lineHeight * scaleFactor) : (startIndex * lineHeight - (scrollTop % lineHeight))}px)` }}>
          {visibleLines.map((line, idx) => {
            const absoluteIdx = startIndex + idx;
            if (absoluteIdx >= totalLines) return null;

            const isHighlighted = highlightedIndex === absoluteIdx;
            const isLogLine = line && typeof line !== 'string';
            const originalIndex = line ? (isLogLine ? (line as LogLine).index : absoluteIdx) : absoluteIdx;
            const isMarked = isLogLine && (line as LogLine).isMarked;

            return (
              <div
                key={`${originalIndex}-${idx}`}
                onClick={() => onLineClick?.(absoluteIdx)}
                className={`flex hover:bg-[#2a2d2e] px-4 h-[20px] items-center whitespace-pre border-l-2 transition-colors cursor-default
                  ${isMarked ? 'border-yellow-500' : 'border-transparent'}
                  ${isHighlighted ? 'bg-blue-500/20' : ''}`}
              >
                <div className={`w-14 text-right pr-4 shrink-0 select-none text-[10px] ${isHighlighted ? 'text-blue-400 font-bold' : 'text-gray-600'}`}>
                  {(originalIndex + 1).toLocaleString()}
                </div>
                <div className="flex-1 overflow-hidden truncate text-[#d4d4d4]">{renderLineContent(line)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, transform: 'translateX(-50%)', zIndex: 1000 }}
          className="context-menu-popup bg-[#2d2d30] border border-[#454545] shadow-2xl rounded-md flex overflow-hidden ring-1 ring-black/50"
          onMouseDown={e => e.stopPropagation()}
        >
          <button title="过滤" onClick={() => { onAddLayer?.(LayerType.FILTER, { query: contextMenu.text }); setContextMenu(null); }} className="px-3 py-1.5 hover:bg-[#3e3e42] text-gray-200 text-xs flex items-center gap-1 transition-colors">过滤</button>
          <button title="高亮" onClick={() => { onAddLayer?.(LayerType.HIGHLIGHT, { query: contextMenu.text, color: '#facc15' }); setContextMenu(null); }} className="px-3 py-1.5 hover:bg-[#3e3e42] text-gray-200 text-xs flex items-center gap-1 transition-colors">高亮</button>
        </div>
      )}
    </div>
  );
};
