import React, { useRef, useState, useEffect } from 'react';
import { LogLine } from '../types';

interface LogViewerProps {
  lines: LogLine[];
  searchQuery: string;
  searchConfig: { regex: boolean; caseSensitive: boolean };
  scrollToIndex?: number | null;
  highlightedIndex?: number | null;
  onLineClick?: (index: number) => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ 
  lines, 
  searchQuery, 
  searchConfig, 
  scrollToIndex, 
  highlightedIndex,
  onLineClick 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

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
      const targetLine = scrollToIndex < 1 && lines.length > 1000 ? Math.floor(scrollToIndex * lines.length) : scrollToIndex;
      const targetScroll = Math.max(0, targetLine * lineHeight - (viewportHeight / 3)); // Scroll to roughly 1/3 down the view
      containerRef.current.scrollTo({ top: targetScroll, behavior: 'auto' });
    }
  }, [scrollToIndex, lines.length, viewportHeight]);

  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - buffer);
  const endIndex = Math.min(lines.length, Math.floor((scrollTop + viewportHeight) / lineHeight) + buffer);
  const visibleLines = lines.slice(startIndex, endIndex);

  const renderLine = (line: LogLine) => {
    const content = line.displayContent || line.content;
    
    if (!line.highlights || line.highlights.length === 0) {
      return <span>{content}</span>;
    }

    // Sort highlights by start position
    const sorted = [...line.highlights].sort((a, b) => a.start - b.start || b.end - a.end);
    const elements = [];
    let lastIndex = 0;

    for (let i = 0; i < sorted.length; i++) {
      const h = sorted[i];
      
      // Ensure we don't move backwards and only process within bounds
      if (h.start >= content.length) break;
      if (h.start < lastIndex) continue; // Skip overlaps for simple rendering

      // Add text before the highlight
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
    <div ref={containerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="flex-1 overflow-auto bg-[#1e1e1e] font-mono text-[12px] relative custom-scrollbar">
      <div style={{ height: `${lines.length * lineHeight}px`, width: '100%' }}>
        <div className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${startIndex * lineHeight}px)` }}>
          {visibleLines.map((line, idx) => {
            const absoluteIdx = startIndex + idx;
            const isHighlighted = highlightedIndex === absoluteIdx;
            
            return (
              <div 
                key={`${line.index}`} 
                onClick={() => onLineClick?.(absoluteIdx)}
                className={`flex hover:bg-[#2a2d2e] px-4 h-[20px] items-center whitespace-pre border-l-2 transition-colors cursor-default
                  ${line.isMarked ? 'border-yellow-500' : 'border-transparent'}
                  ${isHighlighted ? 'bg-[#3b82f6]/20' : ''}`}
                style={isHighlighted ? { backgroundColor: 'rgba(59, 130, 246, 0.2)' } : undefined}
              >
                <div className={`w-14 text-right pr-4 shrink-0 select-none text-[10px] ${isHighlighted ? 'text-blue-400 font-bold' : 'text-gray-600'}`}>
                  {line.index + 1}
                </div>
                <div className="flex-1 overflow-hidden truncate text-[#d4d4d4]">{renderLine(line)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};