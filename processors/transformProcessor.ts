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
    const currentText = line.displayContent || line.content;
    const matches = currentText.match(re);

    if (matches) {
      matchCount += matches.length;
      distribution[Math.floor(i / chunkSize)]++;
      const newContent = currentText.replace(re, replaceWith);
      return { ...line, displayContent: newContent };
    }
    return line;
  });

  return { processedLines, stats: { count: matchCount, distribution } };
};