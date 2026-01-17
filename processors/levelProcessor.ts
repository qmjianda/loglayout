
import { LogProcessor, LogLine, LayerStats } from '../types';

export const levelProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { levels = [] } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (!levels.length) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  const levelRegex = new RegExp(`\\b(${levels.join('|')})\\b`, 'i');

  const processedLines = lines.filter((line, i) => {
    // Handle string or LogLine type for content access
    const content = typeof line === 'string' ? line : line.content;
    const matches = levelRegex.test(content);
    if (matches) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
    }
    return matches;
  });

  return { processedLines, stats: { count: matchCount, distribution } };
};
