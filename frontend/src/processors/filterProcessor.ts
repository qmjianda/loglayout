import { LogProcessor, LogLine, LayerStats } from '../types';

export const filterProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { query, regex, caseSensitive, invert, wholeWord } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  if (!query) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  let re: RegExp | null = null;
  try {
    let pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    re = new RegExp(pattern, caseSensitive ? '' : 'i');
  } catch (e) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  // 优化：保持原始类型，避免不必要的对象化
  const processedLines: Array<LogLine | string> = [];
  const total = lines.length;

  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const content = typeof line === 'string' ? line : line.content;

    // 重置正则表达式状态
    re.lastIndex = 0;
    const matches = re.test(content);
    const keep = invert ? !matches : matches;

    if (keep) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
      // 优化：保持原始类型，不进行不必要的对象化
      processedLines.push(line);
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};