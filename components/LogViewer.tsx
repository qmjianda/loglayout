import React, { useRef, useState, useEffect } from 'react';
import { LogLine, LayerType } from '../types';

interface LogViewerProps {
  lines: Array<LogLine | string>;
  searchQuery: string;
  searchConfig: { regex: boolean; caseSensitive: boolean; wholeWord?: boolean };
  scrollToIndex?: number | null;
  highlightedIndex?: number | null;
  onLineClick?: (index: number) => void;
  onAddLayer?: (type: LayerType, config?: any) => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  lines,
  searchQuery,
  searchConfig,
  scrollToIndex,
  highlightedIndex,
  onLineClick,
  onAddLayer
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null);

  const lineHeight = 20;
  const buffer = 25;

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (scrollToIndex !== null && scrollToIndex !== undefined && containerRef.current) {
      const targetLine = scrollToIndex;
      const targetScroll = Math.max(0, targetLine * lineHeight - (viewportHeight / 3));
      containerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });
    }
  }, [scrollToIndex, lines.length, viewportHeight]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    if (!containerRef.current?.contains(selection.anchorNode)) return;

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Ensure menu is visible within viewport
    const menuY = rect.top - 40 < 0 ? rect.bottom + 5 : rect.top - 40;

    setContextMenu({
      x: rect.left + (rect.width / 2),
      y: menuY,
      text
    });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.context-menu-popup')) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - buffer);
  const endIndex = Math.min(lines.length, Math.floor((scrollTop + viewportHeight) / lineHeight) + buffer);
  const visibleLines = lines.slice(startIndex, endIndex);

  const renderLineContent = (line: LogLine | string) => {
    if (typeof line === 'string') {
      return <span>{line}</span>;
    }

    const content = line.displayContent || line.content;

    if (!line.highlights || line.highlights.length === 0) {
      return <span>{content}</span>;
    }

    const sorted = [...line.highlights].sort((a, b) => a.start - b.start || b.end - a.end);
    const elements = [];
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
        <span
          key={`h-${i}`}
          style={{
            backgroundColor: h.color.startsWith('#') ? `${h.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}` : h.color,
            color: '#fff',
            padding: '0 1px',
            borderRadius: '1px'
          }}
        >
          {content.substring(h.start, end)}
        </span>
      );
      lastIndex = end;
    }

    if (lastIndex < content.length) {
      elements.push(<span key="end">{content.substring(lastIndex)}</span>);
    }

    return elements;
  };

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onMouseUp={handleMouseUp}
      className="flex-1 overflow-auto bg-[#1e1e1e] font-mono text-[12px] relative custom-scrollbar"
    >
      <div style={{ height: `${lines.length * lineHeight}px`, width: '100%' }}>
        <div className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${startIndex * lineHeight}px)` }}>
          {visibleLines.map((line, idx) => {
            const absoluteIdx = startIndex + idx;
            const isHighlighted = highlightedIndex === absoluteIdx;
            const isLogLine = typeof line !== 'string';
            const originalIndex = isLogLine ? line.index : absoluteIdx;
            const isMarked = isLogLine && line.isMarked;

            return (
              <div
                key={`${originalIndex}-${idx}`}
                onClick={() => onLineClick?.(absoluteIdx)}
                className={`flex hover:bg-[#2a2d2e] px-4 h-[20px] items-center whitespace-pre border-l-2 transition-colors cursor-default
                  ${isMarked ? 'border-yellow-500' : 'border-transparent'}
                  ${isHighlighted ? 'bg-[#3b82f6]/20' : ''}`}
                style={isHighlighted ? { backgroundColor: 'rgba(59, 130, 246, 0.2)' } : undefined}
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
          <button title="过滤包含此内容的行" onClick={() => { onAddLayer?.(LayerType.FILTER, { query: contextMenu.text }); setContextMenu(null); }} className="px-3 py-1.5 hover:bg-[#3e3e42] text-gray-200 text-xs flex items-center gap-1 transition-colors">
            <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
            过滤
          </button>
          <div className="w-[1px] bg-white/10" />
          <button title="高亮此内容" onClick={() => { onAddLayer?.(LayerType.HIGHLIGHT, { query: contextMenu.text, color: '#facc15' }); setContextMenu(null); }} className="px-3 py-1.5 hover:bg-[#3e3e42] text-gray-200 text-xs flex items-center gap-1 transition-colors">
            <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            高亮
          </button>
        </div>
      )}
    </div>
  );
};
