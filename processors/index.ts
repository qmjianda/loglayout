import { LayerType, LogProcessor } from '../types';
import { filterProcessor } from './filterProcessor';
import { highlightProcessor } from './highlightProcessor';
import { rangeProcessor } from './rangeProcessor';
import { timeRangeProcessor } from './timeRangeProcessor';
import { levelProcessor } from './levelProcessor';
import { transformProcessor } from './transformProcessor';

export const PROCESSORS: Partial<Record<LayerType, LogProcessor>> = {
  [LayerType.FILTER]: filterProcessor,
  [LayerType.HIGHLIGHT]: highlightProcessor,
  [LayerType.RANGE]: rangeProcessor,
  [LayerType.TIME_RANGE]: timeRangeProcessor,
  [LayerType.LEVEL]: levelProcessor,
  [LayerType.TRANSFORM]: transformProcessor,
};

export const processLayer = (lines: any[], layer: any, chunkSize: number) => {
  const processor = PROCESSORS[layer.type as LayerType];
  if (processor) {
    return processor(lines, layer, chunkSize);
  }
  // Default for FOLDER or unsupported types
  return { 
    processedLines: lines, 
    stats: { count: 0, distribution: new Array(20).fill(0) } 
  };
};