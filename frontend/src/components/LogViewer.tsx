import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LogLine, LayerType } from '../types';
import { readProcessedLines } from '../bridge_client';
import { BookmarkPopover } from './BookmarkPopover';

interface LogViewerProps {
  totalLines: number;
  fileId: string | null;
  searchQuery: string;
  searchConfig: { regex: boolean; caseSensitive: boolean; wholeWord?: boolean };
  scrollToIndex?: number | null;
  highlightedIndex?: number | null;
  onLineClick?: (index: number) => void;
  onAddLayer?: (type: LayerType, config?: any) => void;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  onToggleBookmark?: (lineIndex: number) => void;
  onUpdateBookmarkComment?: (lineIndex: number, comment: string) => void;
  onSelectedTextChange?: (text: string) => void;
  updateTrigger?: number;
  layerStats?: Record<string, { count: number, distribution: number[] }>;
  bookmarks?: Record<number, string>;
}

/**
 * Normalize selection to top-to-bottom order regardless of drag direction.
 * Returns { topLine, topChar, bottomLine, bottomChar }.
 */
function normalizeSelection(sel: { startLine: number; startChar: number; endLine: number; endChar: number }) {
  if (sel.startLine < sel.endLine || (sel.startLine === sel.endLine && sel.startChar <= sel.endChar)) {
    return { topLine: sel.startLine, topChar: sel.startChar, bottomLine: sel.endLine, bottomChar: sel.endChar };
  }
  return { topLine: sel.endLine, topChar: sel.endChar, bottomLine: sel.startLine, bottomChar: sel.startChar };
}

/**
 * Get the character range [s, e) for a given line index within a normalized selection.
 */
function getLineSelectionRange(i: number, norm: ReturnType<typeof normalizeSelection>, contentLength: number) {
  let s = 0, e = contentLength;
  if (norm.topLine === norm.bottomLine) {
    s = norm.topChar;
    e = norm.bottomChar;
  } else if (i === norm.topLine) {
    s = norm.topChar;
    // e stays contentLength (select to end of line)
  } else if (i === norm.bottomLine) {
    e = norm.bottomChar;
    // s stays 0 (select from start of line)
  }
  // else: middle line, s=0, e=contentLength (entire line)
  return { s, e };
}

/**
 * LogViewer - Canvas-based Redesign
 *
 * Performance Optimized: Uses HTML5 Canvas for rendering millions of lines.
 * Hybrid Scroll: Native OS scrolling with Canvas drawing.
 * High-DPI: Sharp rendering on all displays.
 */
export const LogViewer: React.FC<LogViewerProps> = ({
  totalLines,
  fileId,
  searchQuery,
  searchConfig,
  scrollToIndex,
  highlightedIndex,
  onLineClick,
  onAddLayer,
  onVisibleRangeChange,
  onToggleBookmark,
  onUpdateBookmarkComment,
  onSelectedTextChange,
  updateTrigger,
  layerStats = {},
  bookmarks = {}
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [maxLineWidth, setMaxLineWidth] = useState(viewportWidth);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string, lineIndex?: number } | null>(null);
  const [commentPopover, setCommentPopover] = useState<{ x: number, y: number, lineIndex: number, comment: string } | null>(null);

  const [selection, setSelection] = useState<{
    startLine: number, startChar: number,
    endLine: number, endChar: number
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null);

  const [bridgedLines, setBridgedLines] = useState<Map<number, LogLine | string>>(new Map());
  const lastFetchRef = useRef<{ start: number; end: number }>({ start: -1, end: -1 });

  const lineHeight = 20;
  const gutterWidth = 80;
  const VIRTUAL_HEIGHT_LIMIT = 10000000;

  const realTotalHeight = totalLines * lineHeight;
  const useScrollScaling = realTotalHeight > VIRTUAL_HEIGHT_LIMIT;
  // 针对大文件增加缓冲区，防止滚动太快出现空白，增加到 500 行以应对快速滚动
  const buffer = useScrollScaling ? 500 : 200;
  const scaleFactor = useScrollScaling ? VIRTUAL_HEIGHT_LIMIT / realTotalHeight : 1;
  // 在总高度基础上增加 100px 的留白，提供更宽裕的底部空间
  const virtualTotalHeight = (useScrollScaling ? VIRTUAL_HEIGHT_LIMIT : realTotalHeight) + 100;

  const charWidthRef = useRef(7.22);
  const font = '12px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  useEffect(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = font;
      charWidthRef.current = ctx.measureText('M').width;
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setViewportHeight(containerRef.current.clientHeight);
        setViewportWidth(containerRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxPhysicalScroll = Math.max(0, virtualTotalHeight - viewportHeight);
  const maxLogicalScroll = Math.max(0, realTotalHeight - viewportHeight);
  const effectiveScrollTop = useScrollScaling && maxPhysicalScroll > 0
    ? (scrollTop / maxPhysicalScroll) * maxLogicalScroll
    : scrollTop;

  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / lineHeight) - buffer);
  const endIndex = Math.min(totalLines, Math.ceil((effectiveScrollTop + viewportHeight) / lineHeight) + buffer);

  useEffect(() => {
    setBridgedLines(new Map());
    lastFetchRef.current = { start: -1, end: -1 };
  }, [fileId]);

  useEffect(() => {
    lastFetchRef.current = { start: -1, end: -1 };
  }, [updateTrigger]);

  useEffect(() => {
    if (!fileId || totalLines === 0) return;
    if (startIndex === lastFetchRef.current.start && endIndex === lastFetchRef.current.end) return;

    lastFetchRef.current = { start: startIndex, end: endIndex };
    let ignore = false;

    const timer = setTimeout(async () => {
      try {
        const count = endIndex - startIndex;
        if (count <= 0 || ignore) return;
        const lines = await readProcessedLines(fileId, startIndex, count);
        if (ignore) return;

        setBridgedLines(prev => {
          const next = new Map(prev);
          let newMaxInnerWidth = maxLineWidth;
          lines.forEach((line, idx) => {
            const lineIdx = startIndex + idx;
            next.set(lineIdx, line);

            // 跟踪最大行宽
            const content = typeof line === 'string' ? line : line.content || '';
            const lineW = content.length * charWidthRef.current + gutterWidth + 100;
            if (lineW > newMaxInnerWidth) newMaxInnerWidth = lineW;
          });

          if (newMaxInnerWidth > maxLineWidth) setMaxLineWidth(newMaxInnerWidth);

          if (next.size > 5000) {
            const center = Math.floor((startIndex + endIndex) / 2);
            for (const key of next.keys()) {
              if (Math.abs(Number(key) - center) > 3000) next.delete(key);
            }
          }
          return next;
        });
      } catch (e) { console.error('Failed to fetch lines:', e); }
    }, 10);

    return () => { ignore = true; clearTimeout(timer); };
  }, [startIndex, endIndex, fileId, totalLines, updateTrigger]);

  useEffect(() => {
    onVisibleRangeChange?.(startIndex, endIndex);
  }, [startIndex, endIndex, onVisibleRangeChange]);

  useEffect(() => {
    if (scrollToIndex !== null && scrollToIndex !== undefined && containerRef.current) {
      const targetLogicalScroll = Math.max(0, scrollToIndex * lineHeight - (viewportHeight / 3));
      const targetPhysicalScroll = useScrollScaling && maxLogicalScroll > 0
        ? (targetLogicalScroll / maxLogicalScroll) * maxPhysicalScroll
        : targetLogicalScroll;
      containerRef.current.scrollTo({ top: targetPhysicalScroll, behavior: 'auto' });
    }
  }, [scrollToIndex, totalLines, viewportHeight, useScrollScaling, maxLogicalScroll, maxPhysicalScroll]);

  const getPosFromEvent = (e: MouseEvent | React.MouseEvent) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const logicalY = y + effectiveScrollTop;
    const lineIndex = Math.floor(logicalY / lineHeight);
    const charIndex = Math.floor(Math.max(0, x - gutterWidth + scrollLeft) / charWidthRef.current);
    return { lineIndex, charIndex, x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const pos = getPosFromEvent(e);
    if (!pos) return;
    setSelection({ startLine: pos.lineIndex, startChar: pos.charIndex, endLine: pos.lineIndex, endChar: pos.charIndex });
    setIsSelecting(true);
    setContextMenu(null);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelecting) return;
    const pos = getPosFromEvent(e);
    if (!pos) return;
    setSelection(prev => prev ? { ...prev, endLine: pos.lineIndex, endChar: pos.charIndex } : null);
  }, [isSelecting, effectiveScrollTop]);

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Custom wheel handler: normalize each tick to exactly 3 lines
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const linesToScroll = 3;
      // Calculate logical delta in pixels (3 lines)
      const logicalDelta = Math.sign(e.deltaY) * linesToScroll * lineHeight;
      // Convert to physical scroll delta when scaling is active
      const physicalDelta = useScrollScaling && maxLogicalScroll > 0
        ? (logicalDelta / maxLogicalScroll) * maxPhysicalScroll
        : logicalDelta;
      container.scrollTop += physicalDelta;
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [useScrollScaling, maxLogicalScroll, maxPhysicalScroll, lineHeight]);

  const handleClick = (e: React.MouseEvent) => {
    const pos = getPosFromEvent(e);
    if (!pos) return;

    if (pos.x < gutterWidth) {
      const line = bridgedLines.get(pos.lineIndex);
      const isLogLine = line && typeof line !== 'string';
      const logLine = isLogLine ? (line as LogLine) : null;
      const originalIndex = logLine ? logLine.index : pos.lineIndex;

      if (pos.x < 30 && logLine?.isMarked) {
        const rect = containerRef.current!.getBoundingClientRect();
        setCommentPopover({
          x: rect.left + gutterWidth,
          y: e.clientY,
          lineIndex: originalIndex,
          comment: logLine.bookmarkComment || ''
        });
      } else {
        onToggleBookmark?.(originalIndex);
      }
    } else {
      if (!selection || (selection.startLine === selection.endLine && Math.abs(selection.startChar - selection.endChar) < 2)) {
        onLineClick?.(pos.lineIndex);
      }
    }
  };

  // Report selected text to parent (for Ctrl+F auto-fill etc.)
  useEffect(() => {
    if (!selection || !onSelectedTextChange) return;
    const norm = normalizeSelection(selection);
    if (norm.topLine === norm.bottomLine && norm.topChar === norm.bottomChar) {
      onSelectedTextChange('');
      return;
    }
    let text = '';
    for (let i = norm.topLine; i <= norm.bottomLine; i++) {
      const line = bridgedLines.get(i);
      const content = typeof line === 'string' ? line : (line as LogLine)?.content || '';
      const { s, e } = getLineSelectionRange(i, norm, content.length);
      text += content.substring(s, e) + (i === norm.bottomLine ? '' : '\n');
    }
    onSelectedTextChange(text.trim());
  }, [selection, bridgedLines, onSelectedTextChange]);

  useEffect(() => {
    const handleCopyEvent = (e: ClipboardEvent) => {
      // If we have a selection, use our calculated text for native copy
      if (selection) {
        let selectedText = '';
        const norm = normalizeSelection(selection);

        for (let i = norm.topLine; i <= norm.bottomLine; i++) {
          const line = bridgedLines.get(i);
          const text = typeof line === 'string' ? line : (line as LogLine)?.content || '';
          const { s, e } = getLineSelectionRange(i, norm, text.length);
          selectedText += text.substring(s, e) + (i === norm.bottomLine ? '' : '\n');
        }

        if (selectedText) {
          e.clipboardData?.setData('text/plain', selectedText.trim());
          e.preventDefault();
        }
      }
    };
    window.addEventListener('copy', handleCopyEvent);
    return () => window.removeEventListener('copy', handleCopyEvent);
  }, [selection, bridgedLines]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getPosFromEvent(e);
    if (!pos) return;

    let selectedText = '';
    if (selection) {
      const norm = normalizeSelection(selection);
      if (norm.topLine !== norm.bottomLine || norm.topChar !== norm.bottomChar) {
        for (let i = norm.topLine; i <= norm.bottomLine; i++) {
          const line = bridgedLines.get(i);
          const text = typeof line === 'string' ? line : (line as LogLine)?.content || '';
          const { s, e } = getLineSelectionRange(i, norm, text.length);
          selectedText += text.substring(s, e) + (i === norm.bottomLine ? '' : '\n');
        }
      }
    }

    const line = bridgedLines.get(pos.lineIndex);
    const originalIndex = (line && typeof line !== 'string') ? (line as LogLine).index : pos.lineIndex;

    setContextMenu({ x: e.clientX, y: e.clientY, text: selectedText.trim(), lineIndex: originalIndex });
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !Number.isFinite(viewportWidth) || viewportWidth <= 0 || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    try {
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.floor(viewportWidth * dpr);
      const targetHeight = Math.floor(viewportHeight * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Read scroll position directly from DOM for frame-perfect rendering
      const currentScrollTop = containerRef.current?.scrollTop || 0;
      const currentScrollLeft = containerRef.current?.scrollLeft || 0;
      const drawEffectiveScroll = useScrollScaling && maxPhysicalScroll > 0
        ? (currentScrollTop / maxPhysicalScroll) * maxLogicalScroll
        : currentScrollTop;
      const safeScrollTop = Number.isFinite(drawEffectiveScroll) ? drawEffectiveScroll : 0;
      const safeScrollLeft = Number.isFinite(currentScrollLeft) ? currentScrollLeft : 0;

      // --- Draw Overview Ruler ---
      const rulerWidth = 12;
      const rulerX = viewportWidth - rulerWidth;
      ctx.fillStyle = '#252526';
      ctx.fillRect(rulerX, 0, rulerWidth, viewportHeight);

      // Draw markers for layers/search
      Object.entries(layerStats).forEach(([id, stats]: [string, any]) => {
        const color = id === 'search' ? '#facc15' : '#3b82f6';
        ctx.fillStyle = color;
        stats.distribution.forEach((v: number, idx: number) => {
          if (v > 0) {
            const h = Math.max(2, v * (viewportHeight / 20));
            ctx.globalAlpha = 0.5;
            ctx.fillRect(rulerX + 2, idx * (viewportHeight / 20), rulerWidth - 4, h);
            ctx.globalAlpha = 1.0;
          }
        });
      });

      // Draw markers for bookmarks
      const bookmarkIndices = Object.keys(bookmarks).map(Number);
      if (bookmarkIndices.length > 0) {
        ctx.fillStyle = '#fbbf24';
        bookmarkIndices.forEach(idx => {
          const yPos = (idx / totalLines) * viewportHeight;
          ctx.fillRect(rulerX, yPos, rulerWidth, 2);
        });
      }

      // Draw viewport indicator in ruler (uses drawEffectiveScroll, not the outer effectiveScrollTop)
      const viewStart = (drawEffectiveScroll / realTotalHeight) * viewportHeight;
      const viewSize = (viewportHeight / realTotalHeight) * viewportHeight;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.strokeRect(rulerX, viewStart, rulerWidth, Math.max(5, viewSize));

      // 只有在有数据时才填充背景
      if (totalLines > 0) {
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, viewportWidth - rulerWidth, viewportHeight);

        // If lines are not yet loaded into the bridge, show a loading message
        if (bridgedLines.size === 0) {
          ctx.font = '14px "JetBrains Mono"';
          ctx.fillStyle = '#aaa';
          ctx.textAlign = 'center';
          ctx.fillText('Loading lines...', (viewportWidth - rulerWidth) / 2, viewportHeight / 2);
          return;
        }
      } else {
        ctx.clearRect(0, 0, viewportWidth, viewportHeight);
        return;
      }

      const firstVisibleY = startIndex * lineHeight - safeScrollTop;

      for (let i = startIndex; i < endIndex; i++) {
        if (i >= totalLines) break;
        const line = bridgedLines.get(i);
        const y = firstVisibleY + (i - startIndex) * lineHeight;
        if (y + lineHeight < 0 || y > viewportHeight) continue;

        const isLogLine = line && typeof line !== 'string';
        const logLine = isLogLine ? (line as LogLine) : null;
        const content = typeof line === 'string' ? line : logLine?.content || '';
        const isMarked = logLine?.isMarked;

        // 1. Backgrounds
        const rowStyle = (line as any)?.rowStyle;
        if (highlightedIndex === i) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
          ctx.fillRect(0, y, viewportWidth, lineHeight);
        } else if (rowStyle?.backgroundColor) {
          ctx.fillStyle = rowStyle.backgroundColor;
          ctx.fillRect(0, y, viewportWidth, lineHeight);
        } else if (isMarked) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
          ctx.fillRect(0, y, viewportWidth, lineHeight);
        }

        // 2. Selection
        if (selection) {
          const norm = normalizeSelection(selection);
          if (i >= norm.topLine && i <= norm.bottomLine) {
            const { s, e } = getLineSelectionRange(i, norm, content.length);
            ctx.fillStyle = 'rgba(38, 79, 120, 0.6)';
            ctx.fillRect(gutterWidth + s * charWidthRef.current - safeScrollLeft, y, (e - s) * charWidthRef.current, lineHeight);
          }
        }

        // 3. Gutter
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, y, gutterWidth - 5, lineHeight);

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = highlightedIndex === i ? '#60a5fa' : '#666';
        ctx.textAlign = 'right';
        ctx.fillText((i + 1).toLocaleString(), gutterWidth - 15, y + lineHeight / 2 + 4);

        if (isMarked) {
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'center';
          ctx.font = '12px "JetBrains Mono"';
          ctx.fillText(logLine?.bookmarkComment ? '★' : '●', 15, y + lineHeight / 2 + 4);

          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(0, y, 2, lineHeight);
        }

        // 4. Content
        ctx.font = font;
        ctx.textAlign = 'left';
        const contentX = gutterWidth - safeScrollLeft;

        if (logLine?.highlights && logLine.highlights.length > 0) {
          let lastIdx = 0;
          const sorted = [...logLine.highlights].sort((a, b) => a.start - b.start);
          sorted.forEach(h => {
            if (h.start > lastIdx) {
              ctx.fillStyle = '#d4d4d4';
              ctx.fillText(content.substring(lastIdx, h.start), contentX + lastIdx * charWidthRef.current, y + lineHeight / 2 + 4);
            }
            const opacity = (h.opacity || 100) / 100;
            const hText = content.substring(h.start, h.end);
            if (h.isSearch || h.color === '#facc15') {
              ctx.fillStyle = h.color;
              ctx.fillRect(contentX + h.start * charWidthRef.current, y + 2, hText.length * charWidthRef.current, lineHeight - 4);
              ctx.fillStyle = '#000';
            } else {
              ctx.fillStyle = h.color.startsWith('#') ? `${h.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}` : h.color;
            }
            ctx.fillText(hText, contentX + h.start * charWidthRef.current, y + lineHeight / 2 + 4);
            lastIdx = h.end;
          });
          if (lastIdx < content.length) {
            ctx.fillStyle = '#d4d4d4';
            ctx.fillText(content.substring(lastIdx), contentX + lastIdx * charWidthRef.current, y + lineHeight / 2 + 4);
          }
        } else {
          ctx.fillStyle = rowStyle?.color || '#d4d4d4';
          ctx.fillText(content, contentX, y + lineHeight / 2 + 4);
        }
      }
    } catch (err) {
      console.error('Canvas draw error:', err);
    }
  }, [viewportWidth, viewportHeight, startIndex, endIndex, bridgedLines, selection, highlightedIndex, totalLines, layerStats, bookmarks, useScrollScaling, maxPhysicalScroll, maxLogicalScroll, lineHeight]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-[#1e1e1e] relative custom-scrollbar"
      onScroll={(e) => {
        const st = e.currentTarget.scrollTop;
        const sl = e.currentTarget.scrollLeft;
        // Directly update canvas position via DOM for instant visual sync (no React state lag)
        if (canvasRef.current) {
          canvasRef.current.style.transform = `translate3d(${sl}px, ${st}px, 0)`;
        }
        setScrollTop(st);
        setScrollLeft(sl);
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
    >
      {/* Spacer in normal flow to create scrollable area */}
      <div style={{ height: virtualTotalHeight, width: maxLineWidth, pointerEvents: 'none' }} />

      {fileId && totalLines > 0 && viewportWidth > 0 && viewportHeight > 0 && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: viewportWidth,
            height: viewportHeight,
            transform: `translate3d(${scrollLeft}px, ${scrollTop}px, 0)`,
            willChange: 'transform',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />
      )}

      {contextMenu && (
        <div
          className="context-menu-popup fixed bg-[#252526] border border-[#454545] shadow-2xl rounded py-1 min-w-[160px] z-[1000] text-[12px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.text && (
            <>
              <button className="w-full text-left px-3 py-1.5 hover:bg-blue-600 text-gray-200" onClick={() => { navigator.clipboard.writeText(contextMenu.text); setContextMenu(null); }}>复制选中内容</button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-blue-600 text-gray-200" onClick={() => { onAddLayer?.(LayerType.HIGHLIGHT, { query: contextMenu.text, color: '#facc15' }); setContextMenu(null); }}>以此高亮</button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-blue-600 text-gray-200" onClick={() => { onAddLayer?.(LayerType.FILTER, { query: contextMenu.text }); setContextMenu(null); }}>以此过滤</button>
              <div className="h-[1px] bg-[#333] my-1" />
            </>
          )}
          <button className="w-full text-left px-3 py-1.5 hover:bg-blue-600 text-gray-200" onClick={() => { onToggleBookmark?.(contextMenu.lineIndex!); setContextMenu(null); }}>切换书签</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-blue-600 text-gray-200" onClick={() => {
            const line = bridgedLines.get(contextMenu.lineIndex!);
            navigator.clipboard.writeText(typeof line === 'string' ? line : (line as LogLine)?.content || '');
            setContextMenu(null);
          }}>复制整行</button>
        </div>
      )}

      {commentPopover && (
        <BookmarkPopover
          x={commentPopover.x}
          y={commentPopover.y}
          lineIndex={commentPopover.lineIndex}
          initialComment={commentPopover.comment}
          onSave={async (c) => { await onUpdateBookmarkComment?.(commentPopover.lineIndex, c); setCommentPopover(null); }}
          onRemove={() => { onToggleBookmark?.(commentPopover.lineIndex); setCommentPopover(null); }}
          onClose={() => setCommentPopover(null)}
        />
      )}
    </div>
  );
};
