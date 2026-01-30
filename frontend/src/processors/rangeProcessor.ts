
import { LogProcessor, LogLine, LayerStats } from '../types';

export const rangeProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { from, to } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (from === undefined && to === undefined) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  const start = from !== undefined ? from : 1;
  const end = to !== undefined ? to : Infinity;

  // 优化：使用 for 循环替代 filter
  const processedLines: Array<LogLine | string> = [];
  const total = lines.length;

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const lineIndex = typeof line === 'string' ? i : line.index;
    const lineNum = lineIndex + 1;
    const matches = lineNum >= start && lineNum <= end;

    if (matches) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
      processedLines.push(line);
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};
