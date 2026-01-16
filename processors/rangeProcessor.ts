import { LogProcessor, LogLine, LayerStats } from '../types';

export const rangeProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { from, to } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (from === undefined && to === undefined) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  const processedLines = lines.filter((line, i) => {
    const lineNum = line.index + 1;
    const start = from !== undefined ? from : 1;
    const end = to !== undefined ? to : Infinity;
    const matches = lineNum >= start && lineNum <= end;
    if (matches) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
    }
    return matches;
  });

  return { processedLines, stats: { count: matchCount, distribution } };
};