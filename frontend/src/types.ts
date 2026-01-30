
export enum LayerType {
  FILTER = 'FILTER',
  HIGHLIGHT = 'HIGHLIGHT',
  RANGE = 'RANGE',
  MARK = 'MARK',
  TIME_RANGE = 'TIME_RANGE',
  LEVEL = 'LEVEL',
  TRANSFORM = 'TRANSFORM',
  EXTRACT = 'EXTRACT',
  FOLDER = 'FOLDER'
}

export interface LayerConfig {
  query?: string;
  regex?: boolean;
  color?: string;
  from?: number;
  to?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  invert?: boolean;
  opacity?: number;
  timeFormat?: string;
  startTime?: string;
  endTime?: string;
  levels?: string[];
  replaceWith?: string;
  extractPattern?: string;
}

export interface LogLayer {
  id: string;
  name: string;
  type: LayerType;
  enabled: boolean;
  isLocked?: boolean;
  isCollapsed?: boolean;
  groupId?: string;
  config: LayerConfig;
}

/**
 * Interface for saving sets of layers as reusable presets
 */
export interface LayerPreset {
  id: string;
  name: string;
  layers: LogLayer[];
}

export interface LayerStats {
  count: number;
  distribution: number[];
}

export interface LogLine {
  index: number;
  content: string;
  displayContent?: string;
  highlights?: Array<{ start: number; end: number; color: string; opacity: number }>;
  isMarked?: boolean;
}

export type LogProcessor = (
  lines: Array<LogLine | string>,
  layer: LogLayer,
  chunkSize: number
) => {
  processedLines: Array<LogLine | string>;
  stats: LayerStats;
};

// --- Bridge Interface ---

export interface PyAPI {
  open_file(path: string): Promise<boolean>;
  read_lines(start: number, count: number): Promise<string[]>;
  search(query: string): void;
  get_platform_info(): Promise<string>;

  // Signals
  fileLoaded: {
    connect: (cb: (info: { name: string; size: number; lineCount: number }) => void) => void;
  };
  searchFinished: {
    connect: (cb: (matches: number[]) => void) => void;
  };
}

declare global {
  interface Window {
    qt?: {
      webChannelTransport: any;
    };
    pyAPI: PyAPI;
  }
}
