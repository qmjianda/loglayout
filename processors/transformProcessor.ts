
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

  const processedLines = lines.map((line, i) => {
    // Handle string or LogLine type and use displayContent if it exists from previous transforms
    const content = typeof line === 'string' ? line : line.content;
    const currentText = (typeof line !== 'string' && line.displayContent) ? line.displayContent : content;
    const matches = currentText.match(re);

    if (matches) {
      matchCount += matches.length;
      distribution[Math.floor(i / chunkSize)]++;
      const newContent = currentText.replace(re, replaceWith);
      
      if (typeof line === 'string') {
        return {
          index: i,
          content: line,
          displayContent: newContent
        } as LogLine;
      }
      
      return { ...line, displayContent: newContent } as LogLine;
    }
    return line;
  });

  return { processedLines, stats: { count: matchCount, distribution } };
};
