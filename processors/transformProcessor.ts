
import { LogProcessor, LogLine, LayerStats } from '../types';

export const transformProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { query, replaceWith = '', regex = true, caseSensitive = false, wholeWord = false } = layer.config;
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
    re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch (e) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  // 优化：预分配结果数组
  const total = lines.length;
  const processedLines: Array<LogLine | string> = new Array(total);

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const content = typeof line === 'string' ? line : line.content;
    const currentText = (typeof line !== 'string' && line.displayContent) ? line.displayContent : content;

    // 重置正则表达式状态
    re.lastIndex = 0;
    const matches = currentText.match(re);

    if (matches) {
      matchCount += matches.length;
      distribution[Math.floor(i / chunkSize)]++;
      const newContent = currentText.replace(re, replaceWith);

      if (typeof line === 'string') {
        processedLines[i] = {
          index: i,
          content: line,
          displayContent: newContent
        };
      } else {
        // 优化：直接创建新对象，避免展开运算符
        processedLines[i] = {
          index: line.index,
          content: line.content,
          displayContent: newContent,
          highlights: line.highlights,
          isMarked: line.isMarked
        };
      }
    } else {
      // 没有匹配，直接复用原对象
      processedLines[i] = line;
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};
