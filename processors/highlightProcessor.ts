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
    re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch (e) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  const processedLines = lines.map((line, i) => {
    const matches = Array.from(line.content.matchAll(re));
    if (matches.length > 0) {
      matchCount += matches.length;
      distribution[Math.floor(i / chunkSize)]++;
      const highlights = matches.map(m => ({ 
        start: m.index || 0, 
        end: (m.index || 0) + m[0].length, 
        color, 
        opacity 
      }));
      return { ...line, highlights: [...(line.highlights || []), ...highlights] };
    }
    return line;
  });

  return { processedLines, stats: { count: matchCount, distribution } };
};