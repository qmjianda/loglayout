
import { LogProcessor, LogLine, LayerStats } from '../types';

export const highlightProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { query, regex, caseSensitive, wholeWord, color = '#3b82f6', opacity = 100 } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (!query) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  let re: RegExp;
  try {
    let pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    // matchAll requires global flag
    re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch (e) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  // 优化：预分配结果数组，避免动态扩容
  const total = lines.length;
  const processedLines: Array<LogLine | string> = new Array(total);

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const content = typeof line === 'string' ? line : (line.displayContent || line.content);

    // 重置正则表达式的 lastIndex（全局正则会保留状态）
    re.lastIndex = 0;
    const matches = Array.from(content.matchAll(re));

    if (matches.length > 0) {
      matchCount += matches.length;
      distribution[Math.floor(i / chunkSize)]++;

      const highlights = matches.map(m => ({
        start: (m as any).index ?? 0,
        end: ((m as any).index ?? 0) + m[0].length,
        color,
        opacity
      }));

      if (typeof line === 'string') {
        processedLines[i] = {
          index: i,
          content: line,
          highlights
        };
      } else {
        // 优化：只在有现有高亮时才合并，否则直接赋值
        if (line.highlights && line.highlights.length > 0) {
          processedLines[i] = {
            index: line.index,
            content: line.content,
            displayContent: line.displayContent,
            highlights: line.highlights.concat(highlights),
            isMarked: line.isMarked
          };
        } else {
          processedLines[i] = {
            index: line.index,
            content: line.content,
            displayContent: line.displayContent,
            highlights,
            isMarked: line.isMarked
          };
        }
      }
    } else {
      // 没有匹配，直接复用原对象
      processedLines[i] = line;
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};
