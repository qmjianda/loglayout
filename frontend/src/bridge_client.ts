import { FileBridgeAPI } from './types';

/**
 * 全端唯一的桥接实例。
 * 负责 React 前端与 Python 后端的通信。
 * 已从 QWebChannel 迁移到 REST + WebSockets。
 */
let fileBridge: FileBridgeAPI | null = null;
let initPromise: Promise<FileBridgeAPI | null> | null = null;

// Determine backend URL
const isDev = window.location.port === '3000';
const BACKEND_URL = isDev ? 'http://127.0.0.1:12345' : `${window.location.protocol}//${window.location.host}`;
const WS_URL = BACKEND_URL.replace('http', 'ws') + '/ws';

console.log(`[Bridge] Connecting to backend: ${BACKEND_URL}`);

/**
 * 客户端信号模拟器 (Client-side Signal Emulator)
 */
class Signal {
    private callbacks: Function[] = [];
    connect(cb: Function) {
        this.callbacks.push(cb);
    }
    emit(...args: any[]) {
        this.callbacks.forEach(cb => cb(...args));
    }
}

/**
 * 实现 FileBridgeAPI 接口
 */
class WebBridge implements FileBridgeAPI {
    // Signals
    fileLoaded = new Signal();
    pipelineFinished = new Signal();
    statsFinished = new Signal();
    operationStarted = new Signal();
    operationProgress = new Signal();
    operationError = new Signal();
    operationStatusChanged = new Signal();
    pendingFilesCount = new Signal();
    workspaceOpened = new Signal();
    frontendReady = new Signal();

    private ws: WebSocket | null = null;

    constructor() {
        this.initWebSocket();
    }

    private initWebSocket() {
        this.ws = new WebSocket(WS_URL);
        this.ws.onmessage = (event) => {
            try {
                const { signal, args } = JSON.parse(event.data);
                if (this[signal as keyof WebBridge] instanceof Signal) {
                    (this[signal as keyof WebBridge] as Signal).emit(...args);
                }
            } catch (e) {
                console.error('[Bridge] WS message error:', e);
            }
        };
        this.ws.onclose = () => {
            console.warn('[Bridge] WS closed. Retrying in 2s...');
            setTimeout(() => this.initWebSocket(), 2000);
        };
    }

    private async post(endpoint: string, body: any = {}): Promise<any> {
        const res = await fetch(`${BACKEND_URL}/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return res.json();
    }

    private async get(endpoint: string, params: Record<string, any> = {}): Promise<any> {
        const query = new URLSearchParams(params).toString();
        const res = await fetch(`${BACKEND_URL}/api/${endpoint}?${query}`);
        return res.json();
    }

    // API Methods
    async open_file(fileId: string, path: string) { return this.post('open_file', { file_id: fileId, file_path: path }); }
    async close_file(fileId: string) { return this.post('close_file', { file_id: fileId }); }
    async select_files() { return JSON.stringify(await this.get('select_files')); }
    async select_folder() { return this.get('select_folder'); }
    async has_native_dialogs() { return this.get('has_native_dialogs'); }
    async list_logs_in_folder(path: string) { return JSON.stringify(await this.get('list_logs_in_folder', { folder_path: path })); }
    async list_directory(path: string) { return JSON.stringify(await this.get('list_directory', { folder_path: path })); }
    async save_workspace_config(path: string, json: string) { return this.post('save_workspace_config', { folder_path: path, config_json: json }); }
    async load_workspace_config(path: string) { return this.get('load_workspace_config', { folder_path: path }); }
    async ready() { return this.post('ready'); }
    async sync_layers(fileId: string, json: string) { return this.post('sync_layers', { file_id: fileId, layers_json: json }); }
    async sync_decorations(fileId: string, json: string) {
        return this.post('sync_decorations', { file_id: fileId, layers_json: json });
    }
    async sync_all(fileId: string, layersJson: string, searchJson: string) {
        return this.post('sync_all', { file_id: fileId, layers_json: layersJson, search_json: searchJson });
    }
    async read_processed_lines(fileId: string, start: number, count: number) {
        const res = await this.get('read_processed_lines', { file_id: fileId, start_line: start, count: count });
        return JSON.stringify(res);
    }
    async search_ripgrep(fileId: string, query: string, regex: boolean, caseSensitive: boolean) {
        return this.post('search_ripgrep', { file_id: fileId, query, regex, case_sensitive: caseSensitive });
    }
    async get_search_match_index(fileId: string, rank: number) {
        return this.get('get_search_match_index', { file_id: fileId, rank });
    }
    async get_nearest_search_rank(fileId: string, currentIndex: number, direction: string) {
        return this.get('get_nearest_search_rank', { file_id: fileId, current_index: currentIndex, direction });
    }
    async get_search_matches_range(fileId: string, start: number, count: number) {
        const res = await this.get('get_search_matches_range', { file_id: fileId, start_rank: start, count: count });
        return JSON.stringify(res);
    }
    async get_layer_registry() { return JSON.stringify(await this.get('get_layer_registry')); }
    async reload_plugins() { return this.post('reload_plugins'); }

    // Bookmark APIs
    async toggle_bookmark(fileId: string, lineIndex: number) {
        return this.post('toggle_bookmark', { file_id: fileId, line_index: lineIndex });
    }
    async get_bookmarks(fileId: string) {
        return this.get('get_bookmarks', { file_id: fileId });
    }
    async get_nearest_bookmark_index(fileId: string, currentIndex: number, direction: string) {
        return this.get('get_nearest_bookmark_index', { file_id: fileId, current_index: currentIndex, direction });
    }
    async clear_bookmarks(fileId: string) {
        return this.post('clear_bookmarks', { file_id: fileId });
    }
    async get_lines_by_indices(fileId: string, indices: number[]) {
        return this.post('get_lines_by_indices', { file_id: fileId, indices });
    }
    async update_bookmark_comment(fileId: string, lineIndex: number, comment: string) {
        return this.post('update_bookmark_comment', { file_id: fileId, line_index: lineIndex, comment: comment });
    }
    async physical_to_visual_index(fileId: string, physicalIndex: number) {
        return this.get('physical_to_visual_index', { file_id: fileId, physical_index: physicalIndex });
    }
}

/**
 * 确保桥接实例已创建。
 */
export const ensureBridge = (): Promise<FileBridgeAPI | null> => {
    if (fileBridge) return Promise.resolve(fileBridge);
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
        const bridge = new WebBridge();
        fileBridge = (bridge as unknown) as FileBridgeAPI;
        window.fileBridge = fileBridge;
        resolve(fileBridge);
    });
    return initPromise;
};

export const initBridge = ensureBridge;

// Existing helper exports maintained for compatibility
export async function readProcessedLines(fileId: string, start: number, count: number): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.read_processed_lines(fileId, start, count);
        return JSON.parse(jsonStr) as any[];
    } catch (e) {
        console.error(`Failed to read processed lines:`, e);
        return [];
    }
}

export async function syncAll(fileId: string, layers: any[], search: any): Promise<void> {
    if (!fileBridge) return;
    fileBridge.sync_all(fileId, JSON.stringify(layers), JSON.stringify(search));
}

/**
 * 仅同步渲染层配置 (快速响应，不重跑 Pipeline)
 */
export async function syncDecorations(fileId: string, layers: any[]): Promise<void> {
    if (!fileBridge) return;
    (fileBridge as any).sync_decorations(fileId, JSON.stringify(layers));
}

export async function searchRipgrep(fileId: string, query: string, regex: boolean = false, caseSensitive: boolean = false): Promise<boolean> {
    if (!fileBridge) return false;
    return fileBridge.search_ripgrep(fileId, query, regex, caseSensitive);
}

export async function getSearchMatchIndex(fileId: string, rank: number): Promise<number> {
    if (!fileBridge) return -1;
    return await fileBridge.get_search_match_index(fileId, rank);
}

export async function getNearestSearchRank(fileId: string, currentIndex: number, direction: 'next' | 'prev'): Promise<number> {
    if (!fileBridge) return -1;
    return await fileBridge.get_nearest_search_rank(fileId, currentIndex, direction);
}

export async function getLayerRegistry(): Promise<string> {
    const bridge = await ensureBridge();
    if (!bridge) return "[]";
    return await bridge.get_layer_registry();
}

export async function reloadPlugins(): Promise<boolean> {
    if (!fileBridge) return false;
    return await fileBridge.reload_plugins();
}

export function signalReady(): void {
    if (fileBridge) fileBridge.ready();
}

export async function getSearchMatchesRange(fileId: string, startRank: number, count: number): Promise<number[]> {
    if (!fileBridge) return [];
    try {
        const json = await fileBridge.get_search_matches_range(fileId, startRank, count);
        return JSON.parse(json);
    } catch (e) { return []; }
}

export async function openFile(fileId: string, path: string): Promise<boolean> {
    if (!fileBridge) return false;
    return fileBridge.open_file(fileId, path);
}

export async function closeFile(fileId: string): Promise<void> {
    if (!fileBridge) return;
    return fileBridge.close_file(fileId);
}

export async function selectFiles(): Promise<string[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.select_files();
        return JSON.parse(jsonStr);
    } catch (e) { return []; }
}

export async function selectFolder(): Promise<string> {
    if (!fileBridge) return "";
    return fileBridge.select_folder();
}

export async function hasNativeDialogs(): Promise<boolean> {
    if (!fileBridge) return false;
    try {
        return await (fileBridge as any).has_native_dialogs();
    } catch {
        return false;
    }
}

export async function listLogsInFolder(folderPath: string): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.list_logs_in_folder(folderPath);
        return JSON.parse(jsonStr);
    } catch (e) { return []; }
}

export async function listDirectory(folderPath: string): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.list_directory(folderPath);
        return JSON.parse(jsonStr);
    } catch (e) { return []; }
}

export interface WorkspaceConfig {
    version: number;
    lastModified: string;
    files?: Array<{ path: string; name: string; size: number; layers: any[] }>;
    activeFilePath?: string | null;
    layers?: any[];
}

export async function saveWorkspaceConfig(folderPath: string, config: WorkspaceConfig): Promise<boolean> {
    if (!fileBridge) return false;
    return await fileBridge.save_workspace_config(folderPath, JSON.stringify(config));
}

export async function loadWorkspaceConfig(folderPath: string): Promise<WorkspaceConfig | null> {
    if (!fileBridge) return null;
    try {
        const jsonStr = await fileBridge.load_workspace_config(folderPath);
        if (!jsonStr) return null;
        return JSON.parse(jsonStr) as WorkspaceConfig;
    } catch (e) { return null; }
}

// ============================================================
// 书签 API (Bookmark APIs)
// ============================================================

/**
 * 切换指定行的书签状态
 * @returns 更新后的书签对象 {lineIndex: comment}
 */
export async function toggleBookmark(fileId: string, lineIndex: number): Promise<Record<number, string>> {
    if (!fileBridge) return {};
    try {
        const res = await (fileBridge as any).toggle_bookmark(fileId, lineIndex);
        return typeof res === 'string' ? JSON.parse(res) : res;
    } catch (e) {
        console.error('[Bridge] toggleBookmark error:', e);
        return {};
    }
}

/**
 * 获取当前文件的书签列表
 */
export async function getBookmarks(fileId: string): Promise<Record<number, string>> {
    if (!fileBridge) return {};
    try {
        const res = await (fileBridge as any).get_bookmarks(fileId);
        return typeof res === 'string' ? JSON.parse(res) : res;
    } catch (e) {
        console.error('[Bridge] getBookmarks error:', e);
        return {};
    }
}

/**
 * 获取最近的书签索引
 */
export async function getNearestBookmarkIndex(fileId: string, currentIndex: number, direction: 'next' | 'prev'): Promise<number> {
    if (!fileBridge) return -1;
    try {
        return await (fileBridge as any).get_nearest_bookmark_index(fileId, currentIndex, direction);
    } catch (e) {
        console.error('[Bridge] getNearestBookmarkIndex error:', e);
        return -1;
    }
}

/**
 * 清除指定文件的所有书签
 */
export async function clearBookmarks(fileId: string): Promise<Record<number, string>> {
    if (!fileBridge) return {};
    try {
        const res = await (fileBridge as any).clear_bookmarks(fileId);
        return typeof res === 'string' ? JSON.parse(res) : res;
    } catch (e) {
        console.error('[Bridge] clearBookmarks error:', e);
        return {};
    }
}

/**
 * 更新书签注释
 */
export async function updateBookmarkComment(fileId: string, lineIndex: number, comment: string): Promise<Record<number, string>> {
    const bridge = await ensureBridge();
    if (!bridge) return {};
    try {
        const res = await (bridge as any).update_bookmark_comment(fileId, lineIndex, comment);
        return typeof res === 'string' ? JSON.parse(res) : res;
    } catch (e) {
        console.error('[Bridge] updateBookmarkComment error:', e);
        return {};
    }
}

/**
 * 获取指定索引的行内容（纯文本）
 */
export async function getLinesByIndices(fileId: string, indices: number[]): Promise<{ index: number; text: string }[]> {
    if (!fileBridge) return [];
    try {
        const res = await (fileBridge as any).get_lines_by_indices(fileId, indices);
        return typeof res === 'string' ? JSON.parse(res) : res;
    } catch (e) {
        console.error('[Bridge] getLinesByIndices error:', e);
        return [];
    }
}

/**
 * 将物理行索引转换为虚拟行索引
 */
export async function physicalToVisualIndex(fileId: string, physicalIndex: number): Promise<number> {
    if (!fileBridge) return physicalIndex;
    try {
        const res = await (fileBridge as any).physical_to_visual_index(fileId, physicalIndex);
        return typeof res === 'number' ? res : physicalIndex;
    } catch (e) {
        console.error('[Bridge] physicalToVisualIndex error:', e);
        return physicalIndex;
    }
}
