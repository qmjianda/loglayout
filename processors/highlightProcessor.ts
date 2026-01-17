
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
    // matchAll requires global flag
    re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch (e) {
    return { processedLines: lines, stats: { count: 0, distribution } };
  }

  // Handle mixed string and LogLine types
  const processedLines = lines.map((line, i) => {
    // Determine content to match against
    const content = typeof line === 'string' ? line : (line.displayContent || line.content);
    const matches = Array.from(content.matchAll(re));
    
    if (matches.length > 0) {
      matchCount += matches.length;
      distribution[Math.floor(i / chunkSize)]++;
      
      const highlights = matches.map(m => {
        // cast to any to avoid 'unknown' index property error
        const matchIndex = (m as any).index ?? 0;
        return { 
          start: matchIndex, 
          end: matchIndex + m[0].length, 
          color, 
          opacity 
        };
      });

      if (typeof line === 'string') {
        return {
          index: i,
          content: line,
          highlights
        } as LogLine;
      }
      
      return { 
        ...line, 
        highlights: [...(line.highlights || []), ...highlights] 
      } as LogLine;
    }
    return line;
  });

  return { processedLines, stats: { count: matchCount, distribution } };
};
