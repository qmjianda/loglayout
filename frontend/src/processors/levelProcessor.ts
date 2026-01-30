
import { LogProcessor, LogLine, LayerStats } from '../types';

export const levelProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { levels = [] } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (!levels.length) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  const levelRegex = new RegExp(`\\b(${levels.join('|')})\\b`, 'i');

  // 优化：使用 for 循环替代 filter
  const processedLines: Array<LogLine | string> = [];
  const total = lines.length;

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const content = typeof line === 'string' ? line : line.content;

    levelRegex.lastIndex = 0;
    const matches = levelRegex.test(content);

    if (matches) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
      processedLines.push(line);
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};
