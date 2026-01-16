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

  // 高性能过滤：预分配数组，避免频繁扩容
  const processedLines: LogLine[] = [];
  const total = lines.length;
  
  for (let i = 0; i < total; i++) {
    const line = lines[i];
    const content = typeof line === 'string' ? line : line.content;
    const matches = re.test(content);
    const keep = invert ? !matches : matches;
    
    if (keep) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
      // 如果输入是原始字符串，这里进行对象化
      if (typeof line === 'string') {
          processedLines.push({ index: i, content: line });
      } else {
          processedLines.push(line);
      }
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};