import React, { useRef, useState, useEffect, useCallback } from 'react';
import { LogLine, LayerType } from '../types';
import { readProcessedLines } from '../bridge_client';

/**
 * LogViewer - 核心日志渲染组件
 * 
 * 关键特性：
 * 1. 虚拟滚动 (Virtual Scrolling): 只渲染视口内的行，支持超大文件（GB 级）。
 * 2. 滚动缩放 (Scroll Scaling): 绕过浏览器 ~33M 像素的高度限制，支持千万行日志。
 * 3. 异步加载: 通过桥接层按需从 Python 后端拉取处理后的行数据。
 * 4. 高亮渲染: 支持多重着色方案（搜索匹配、图层高亮）。
 */

interface LogViewerProps {
  // 数据源信息
  totalLines: number; // 当前可见的总行数（过滤后的）
  fileId: string | null;

  // 交互控制
  searchQuery: string;
  searchConfig: { regex: boolean; caseSensitive: boolean; wholeWord?: boolean };
  scrollToIndex?: number | null; // 强制滚动到某一行
  highlightedIndex?: number | null; // 当前高亮的行索引（虚拟索引）
  onLineClick?: (index: number) => void;
  onAddLayer?: (type: LayerType, config?: any) => void;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  onToggleBookmark?: (lineIndex: number) => void;
  updateTrigger?: number; // 外部触发器，用于强制刷新缓存
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
  onVisibleRangeChange,
  onToggleBookmark,
  updateTrigger
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null);

  // 本地缓存：存储从后端读取的行数据
  const [bridgedLines, setBridgedLines] = useState<Map<number, LogLine | string>>(new Map());
  const lastFetchRef = useRef<{ start: number; end: number }>({ start: -1, end: -1 });

  const lineHeight = 20; // 每一行的高度
  const buffer = 50;     // 缓冲区行数，避免滚动太快时看到空白
  const VIRTUAL_HEIGHT_LIMIT = 10000000; // 虚拟高度上限 (1000万像素)，超过此高度开启缩放模式

  const realTotalHeight = totalLines * lineHeight;
  const useScrollScaling = realTotalHeight > VIRTUAL_HEIGHT_LIMIT;
  // 缩放因子：将庞大的实际高度映射到有限的浏览器显示高度
  const scaleFactor = useScrollScaling ? VIRTUAL_HEIGHT_LIMIT / realTotalHeight : 1;
  const virtualTotalHeight = useScrollScaling ? VIRTUAL_HEIGHT_LIMIT : realTotalHeight;

  // 当文件 id 变化时（切换文件），彻底清空缓存，防止显示上一个文件的内容
  useEffect(() => {
    setBridgedLines(new Map());
    lastFetchRef.current = { start: -1, end: -1 };
  }, [fileId]);

  // 当外部触发器改变（如清空搜索、切换图层、刷新）时，保留本地缓存（stale-while-revalidate），
  // 仅重置抓取状态以强制重新获取最新数据。这样可以避免数据到达前的白屏闪烁。
  useEffect(() => {
    lastFetchRef.current = { start: -1, end: -1 };
  }, [updateTrigger]);

  // 计算可见范围（考虑缩放模式）
  const maxPhysicalScroll = virtualTotalHeight - viewportHeight;
  const maxLogicalScroll = realTotalHeight - viewportHeight;

  // 核心公式：将 DOM 的 scrollTop 映射到逻辑上的有效滚动位置
  const effectiveScrollTop = useScrollScaling && maxPhysicalScroll > 0
    ? (scrollTop / maxPhysicalScroll) * maxLogicalScroll
    : scrollTop;

  const startIndex = Math.max(0, Math.floor(effectiveScrollTop / lineHeight) - buffer);
  const endIndex = Math.min(totalLines, Math.floor((effectiveScrollTop + viewportHeight) / lineHeight) + buffer);

  /**
   * 按需从后端拉取行数据。
   */
  useEffect(() => {
    if (!fileId || totalLines === 0) return;

    // 避免重复请求相同的范围
    const fetchStart = startIndex;
    const fetchEnd = endIndex;

    if (fetchStart === lastFetchRef.current.start && fetchEnd === lastFetchRef.current.end) {
      return;
    }

    lastFetchRef.current = { start: fetchStart, end: fetchEnd };

    let ignore = false;
    const timer = setTimeout(async () => {
      try {
        const count = fetchEnd - fetchStart;
        if (count <= 0 || ignore) return;

        // batch 读取：一次性拉取整个可见窗口的内容
        const lines = await readProcessedLines(fileId, fetchStart, count);
        if (ignore) return;

        setBridgedLines(prev => {
          const next = new Map(prev);
          lines.forEach((line, idx) => {
            next.set(fetchStart + idx, line);
          });

          // 缓存淘汰逻辑：当 Map 过大时，移除最早的 2000 行，保持性能
          if (next.size > 5000) {
            const keys = Array.from(next.keys()).sort((a, b) => Number(a) - Number(b));
            const toRemove = keys.slice(0, 2000);
            toRemove.forEach(k => next.delete(k));
          }

          return next;
        });
      } catch (e) {
        if (!ignore) console.error('Failed to fetch lines:', e);
      }
    }, 10); // 微调延时，防止高频滚动导致请求堆积

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [startIndex, endIndex, fileId, totalLines, updateTrigger]);

  // 从本地缓存获取一行内容
  const getLine = useCallback((index: number): LogLine | string => {
    return bridgedLines.get(index) || '';
  }, [bridgedLines]);

  // 监听容器大小变化
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

  /**
   * 跳转到指定行。
   * 会自动计算相应的逻辑滚动位置和缩放后的物理滚动位置。
   */
  useEffect(() => {
    if (scrollToIndex !== null && scrollToIndex !== undefined && containerRef.current) {
      const maxPhysicalScroll = virtualTotalHeight - viewportHeight;
      const maxLogicalScroll = realTotalHeight - viewportHeight;
      const targetLogicalScroll = Math.max(0, scrollToIndex * lineHeight - (viewportHeight / 3));
      const targetPhysicalScroll = useScrollScaling && maxLogicalScroll > 0
        ? (targetLogicalScroll / maxLogicalScroll) * maxPhysicalScroll
        : targetLogicalScroll;
      containerRef.current.scrollTo({ top: targetPhysicalScroll, behavior: 'auto' });
    }
  }, [scrollToIndex, totalLines, viewportHeight, useScrollScaling, scaleFactor]);

  /**
   * 修复缩放模式下的滚动手感。
   * 在缩放模式下（大文件），正常的滚轮步进会被缩小太多，导致滚动极其缓慢。
   * 这里拦截 wheel 事件，根据缩放因子补偿滚动增量。
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !useScrollScaling) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        container.scrollTop += e.deltaY * scaleFactor;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [useScrollScaling, scaleFactor]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, index?: number) => {
    e.preventDefault();
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      text: selectedText,
      lineIndex: index
    });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.context-menu-popup')) return;
      setContextMenu(null);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 通知父组件当前的可见范围（可用于同步统计等）
  useEffect(() => {
    onVisibleRangeChange?.(startIndex, endIndex);
  }, [startIndex, endIndex, onVisibleRangeChange]);

  /**
   * 渲染带高亮的每一行内容。
   * 将 backend 返回的高亮段 (start, end, color) 进行分段渲染。
   */
  const renderLineContent = (line: LogLine | string) => {
    if (typeof line === 'string') return <span>{line}</span>;
    if (!line) return <span></span>;
    const content = line.displayContent || line.content || '';
    if (!line.highlights || line.highlights.length === 0) return <span>{content}</span>;

    // 按起始位置排序
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
      // 如果是搜索命中或者是特定黄色，使用深色文字以保证对比度
      const isSearchMatch = (h as any).isSearch || h.color === '#facc15';
      elements.push(
        <span key={`h-${i}`} style={{
          backgroundColor: h.color.startsWith('#') ? `${h.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}` : h.color,
          color: isSearchMatch ? '#333' : '#fff',
          padding: '0 1px',
          borderRadius: '1px',
          fontWeight: isSearchMatch ? 'bold' : 'normal'
        }}>{content.substring(h.start, end)}</span>
      );
      lastIndex = end;
    }
    if (lastIndex < content.length) {
      elements.push(<span key="end">{content.substring(lastIndex)}</span>);
    }
    return elements;
  };

  // 生成可见行列表
  const visibleLines: (LogLine | string)[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    visibleLines.push(getLine(i));
  }

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onContextMenu={(e) => handleContextMenu(e)}
      className="flex-1 overflow-auto bg-[#1e1e1e] font-mono text-[12px] relative custom-scrollbar select-text"
    >
      {/* 虚拟高度占位层 */}
      <div style={{ height: `${virtualTotalHeight}px`, width: '100%', position: 'relative' }}>
        {/* 内容吸附层：通过 translate3d 实现高性能的平滑移动 */}
        <div
          className="absolute top-0 left-0 min-w-full w-fit will-change-transform"
          style={{
            transform: `translate3d(0, ${Math.round(
              (startIndex * lineHeight - effectiveScrollTop) + scrollTop
            )}px, 0)`,
            backfaceVisibility: 'hidden'
          }}
        >
          {visibleLines.map((line, idx) => {
            const absoluteIdx = startIndex + idx;
            if (absoluteIdx >= totalLines) return null;

            const isHighlighted = highlightedIndex === absoluteIdx;
            const isLogLine = line && typeof line !== 'string';
            // originalIndex 表示在原始物理文件中的行号
            const originalIndex = line ? (isLogLine ? (line as LogLine).index : absoluteIdx) : absoluteIdx;
            const isMarked = isLogLine && (line as LogLine).isMarked;

            return (
              <div
                key={`${originalIndex}-${idx}`}
                onClick={() => onLineClick?.(absoluteIdx)}
                onContextMenu={(e) => handleContextMenu(e, originalIndex)}
                className={`flex group hover:bg-[#2a2d2e] px-4 h-[20px] items-center whitespace-pre border-l-2 transition-colors cursor-default overflow-hidden
                  ${isMarked ? 'border-yellow-500' : 'border-transparent'}
                  ${isHighlighted ? 'bg-blue-500/20' : ''}`}
                style={{ height: '20px', minHeight: '20px', maxHeight: '20px' }}
              >
                {/* 行号栏：显示虚拟行号和物理行号，点击切换书签 */}
                <div
                  onClick={(e) => { e.stopPropagation(); onToggleBookmark?.(originalIndex); }}
                  className={`w-20 text-right pr-4 shrink-0 select-none text-[10px] flex flex-col justify-center items-end leading-[9px] cursor-pointer hover:bg-white/5 transition-colors ${isHighlighted ? 'text-blue-400 font-semibold' : 'text-gray-600'}`}
                  title="点击切换书签"
                >
                  <span className="flex items-center gap-1">
                    {isMarked && <span className="text-amber-400 text-[11px]">●</span>}
                    {(absoluteIdx + 1).toLocaleString()}
                  </span>
                  <span className={`text-[8px] mt-0.5 font-normal tracking-tighter opacity-0 group-hover:opacity-40 ${isHighlighted ? 'opacity-40' : ''} transition-opacity duration-300`}>
                    #{(originalIndex + 1).toLocaleString()}
                  </span>
                </div>
                <div className="flex-1 text-[#d4d4d4] overflow-hidden whitespace-pre min-w-0 pointer-events-auto select-text">{renderLineContent(line)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 自定义右键菜单 */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          className="context-menu-popup bg-[#252526] border border-[#454545] shadow-2xl rounded py-1 min-w-[160px] flex flex-col ring-1 ring-black/50 animate-in fade-in zoom-in-95 duration-100"
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.text && (
            <>
              <div className="px-3 py-1 text-[9px] uppercase font-bold text-gray-500 border-b border-[#333] mb-1">选中文本: "{contextMenu.text.length > 15 ? contextMenu.text.substring(0, 15) + '...' : contextMenu.text}"</div>
              <button
                onClick={() => { onAddLayer?.(LayerType.FILTER, { query: contextMenu.text }); setContextMenu(null); }}
                className="px-3 py-1.5 hover:bg-blue-600 text-gray-200 hover:text-white text-xs flex justify-between items-center transition-colors"
              >
                <span>以此过滤</span>
                <span className="opacity-40 text-[10px]">Filter</span>
              </button>
              <button
                onClick={() => { onAddLayer?.(LayerType.HIGHLIGHT, { query: contextMenu.text, color: '#facc15' }); setContextMenu(null); }}
                className="px-3 py-1.5 hover:bg-blue-600 text-gray-200 hover:text-white text-xs flex justify-between items-center transition-colors"
              >
                <span>以此高亮</span>
                <span className="opacity-40 text-[10px]">Highlight</span>
              </button>
              <button
                onClick={() => handleCopy(contextMenu.text)}
                className="px-3 py-1.5 hover:bg-blue-600 text-gray-200 hover:text-white text-xs flex justify-between items-center transition-colors"
              >
                <span>复制选中内容</span>
                <span className="opacity-40 text-[10px]">Copy</span>
              </button>
              <div className="h-[1px] bg-[#333] my-1" />
            </>
          )}

          {contextMenu.lineIndex !== undefined && (
            <button
              onClick={() => { onToggleBookmark?.(contextMenu.lineIndex!); setContextMenu(null); }}
              className="px-3 py-1.5 hover:bg-blue-600 text-gray-200 hover:text-white text-xs flex justify-between items-center transition-colors"
            >
              <span>{bridgedLines.get(startIndex + (contextMenu.lineIndex - (bridgedLines.get(contextMenu.lineIndex) as LogLine)?.index || 0)) ? '切换书签' : '切换书签'}</span>
              <span className="opacity-40 text-[10px]">F2</span>
            </button>
          )}

          <button
            onClick={() => {
              const line = bridgedLines.get(startIndex + (visibleLines.findIndex(l => (l as LogLine)?.index === contextMenu.lineIndex)));
              const content = typeof line === 'string' ? line : (line as LogLine)?.content || '';
              handleCopy(content);
            }}
            className="px-3 py-1.5 hover:bg-blue-600 text-gray-200 hover:text-white text-xs flex justify-between items-center transition-colors"
          >
            <span>复制整行</span>
            <span className="opacity-40 text-[10px]">Copy Line</span>
          </button>
        </div>
      )}
    </div>
  );
};
