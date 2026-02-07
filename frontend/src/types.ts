
export enum LayerType {
  FILTER = 'FILTER',
  HIGHLIGHT = 'HIGHLIGHT',
  RANGE = 'RANGE',
  MARK = 'MARK',
  TIME_RANGE = 'TIME_RANGE',
  LEVEL = 'LEVEL',
  TRANSFORM = 'TRANSFORM',
  EXTRACT = 'EXTRACT',
  FOLDER = 'FOLDER',
  PYTHON = 'PYTHON'
}

export interface LayerUIField {
  name: string;
  type: 'str' | 'int' | 'bool' | 'dropdown' | 'color' | 'multiselect' | 'search' | 'range';
  display_name: string;
  value?: any;
  info?: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface LayerRegistryEntry {
  type: string;
  display_name: string;
  description: string;
  icon: string;
  ui_schema: LayerUIField[];
  is_builtin: boolean;
}

export interface LayerConfig {
  query?: string;
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  invert?: boolean;
  levels?: string[];
  color?: string;
  opacity?: number;
  [key: string]: any; // Allow custom fields for Python layers
}

export interface LogLayer {
  id: string;
  name: string;
  type: LayerType;
  enabled: boolean;
  isLocked?: boolean;
  isCollapsed?: boolean;
  isSystemManaged?: boolean;  // 系统托管图层，默认隐藏
  groupId?: string;
  config: LayerConfig;
}

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
  highlights?: Array<{ start: number; end: number; color: string; opacity: number; isSearch?: boolean }>;
  isMarked?: boolean;
  bookmarkComment?: string;
}

export interface ProcessedCache {
  searchMatchCount?: number;
  [key: string]: any;
}

// --- Bridge Interface ---

export interface FileBridgeAPI {
  // File operations
  open_file(fileId: string, path: string): Promise<boolean>;
  close_file(fileId: string): Promise<void>;
  select_files(): Promise<string>;
  select_folder(): Promise<string>;
  list_logs_in_folder(folderPath: string): Promise<string>;
  list_directory(folderPath: string): Promise<string>;
  save_workspace_config(folderPath: string, configJson: string): Promise<boolean>;
  load_workspace_config(folderPath: string): Promise<string>;
  ready(): Promise<void>;

  // Bookmark operations
  toggle_bookmark(fileId: string, lineIndex: number): Promise<Record<number, string>>;
  get_bookmarks(fileId: string): Promise<Record<number, string>>;
  clear_bookmarks(fileId: string): Promise<Record<number, string>>;
  update_bookmark_comment(fileId: string, lineIndex: number, comment: string): Promise<Record<number, string>>;

  // Pipeline operations
  sync_layers(fileId: string, layersJson: string): Promise<boolean>;
  sync_all(fileId: string, layersJson: string, searchJson: string): Promise<boolean>;
  read_processed_lines(fileId: string, start: number, count: number): Promise<string>;

  // Search operations
  search_ripgrep(fileId: string, query: string, regex: boolean, caseSensitive: boolean): Promise<boolean>;
  get_search_match_index(fileId: string, rank: number): Promise<number>;
  get_nearest_search_rank(fileId: string, currentIndex: number, direction: string): Promise<number>;
  get_search_matches_range(fileId: string, startRank: number, count: number): Promise<string>;

  // Registry operations
  get_layer_registry(): Promise<string>;
  reload_plugins(): Promise<boolean>;

  // Signals
  fileLoaded: { connect: (cb: (fileId: string, payloadJson: string) => void) => void };
  pipelineFinished: { connect: (cb: (fileId: string, newTotal: number, matchCount: number) => void) => void };
  statsFinished: { connect: (cb: (fileId: string, statsJson: string) => void) => void };
  operationStarted: { connect: (cb: (fileId: string, opName: string) => void) => void };
  operationProgress: { connect: (cb: (fileId: string, opName: string, p: number) => void) => void };
  operationError: { connect: (cb: (fileId: string, opName: string, msg: string) => void) => void };
  operationStatusChanged: { connect: (cb: (fileId: string, status: string, p: number) => void) => void };
  pendingFilesCount: { connect: (cb: (count: number) => void) => void };
  workspaceOpened: { connect: (cb: (path: string) => void) => void };
  frontendReady: { connect: (cb: () => void) => void };
}

declare global {
  interface Window {
    qt?: { webChannelTransport: any };
    fileBridge?: FileBridgeAPI;
  }
}
