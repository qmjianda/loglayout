import { FileBridgeAPI } from './types';

// @ts-ignore
declare const QWebChannel: any;

/**
 * 全端唯一的桥接实例。
 * 负责 React 前端与 Python 后端的通信。
 */
let fileBridge: FileBridgeAPI | null = null;
let initPromise: Promise<FileBridgeAPI | null> | null = null;

/**
 * 读取处理后的行。
 * 用于虚拟滚动，只获取当前视口需要的行数据。
 */
export async function readProcessedLines(fileId: string, start: number, count: number): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.read_processed_lines(fileId, start, count);
        return JSON.parse(jsonStr) as any[];
    } catch (e) {
        console.error(`Failed to read processed lines for ${fileId}: `, e);
        return [];
    }
}

/**
 * 同步图层配置。 (已弃用，建议使用 syncAll)
 */
export async function syncLayers(fileId: string, layers: any[]): Promise<void> {
    if (!fileBridge) return;
    try {
        await fileBridge.sync_layers(fileId, JSON.stringify(layers));
    } catch (e) {
        console.error(`Failed to sync layers for ${fileId}: `, e);
    }
}

/**
 * 全量同步图层和搜索配置。
 * 这是最核心的同步方法，每次图层变动或搜索变更都会调用。
 */
export async function syncAll(fileId: string, layers: any[], search: any): Promise<void> {
    if (!fileBridge) return;
    try {
        await fileBridge.sync_all(fileId, JSON.stringify(layers), JSON.stringify(search));
    } catch (e) {
        console.error(`Failed to sync all for ${fileId}: `, e);
    }
}

/**
 * 触发基于 ripgrep 的全局搜索。
 */
export async function searchRipgrep(
    fileId: string,
    query: string,
    regex: boolean = false,
    caseSensitive: boolean = false
): Promise<boolean> {
    if (!fileBridge) return false;
    try {
        return await fileBridge.search_ripgrep(fileId, query, regex, caseSensitive);
    } catch (e) {
        console.error(`Search failed for ${fileId}: `, e);
        return false;
    }
}

/**
 * 获取搜索匹配项在虚拟滚动中的行号。
 */
export async function getSearchMatchIndex(fileId: string, rank: number): Promise<number> {
    if (!fileBridge) return -1;
    return await fileBridge.get_search_match_index(fileId, rank);
}

/**
 * 获取后端支持的所有图层类型及其 UI Schema。
 */
export async function getLayerRegistry(): Promise<string> {
    const bridge = await ensureBridge();
    if (!bridge) return "[]";
    return await bridge.get_layer_registry();
}

/**
 * 重新加载 Python 插件。
 */
export async function reloadPlugins(): Promise<boolean> {
    if (!fileBridge) return false;
    return await fileBridge.reload_plugins();
}

/**
 * 向后端发送前端已准备就绪的信号。
 */
export function signalReady(): void {
    if (fileBridge) fileBridge.ready();
}

/**
 * 批量获取搜索匹配项的行号。
 */
export async function getSearchMatchesRange(fileId: string, startRank: number, count: number): Promise<number[]> {
    if (!fileBridge) return [];
    try {
        const json = await fileBridge.get_search_matches_range(fileId, startRank, count);
        return JSON.parse(json);
    } catch (e) {
        return [];
    }
}

/**
 * 打开一个日志文件。
 */
export async function openFile(fileId: string, path: string): Promise<boolean> {
    if (!fileBridge) return false;
    return fileBridge.open_file(fileId, path);
}

/**
 * 关闭一个日志文件。
 */
export async function closeFile(fileId: string): Promise<void> {
    if (!fileBridge) return;
    return fileBridge.close_file(fileId);
}

/**
 * 调出系统原生文件选择对话框。
 */
export async function selectFiles(): Promise<string[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.select_files();
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}

/**
 * 调出系统原生目录选择对话框。
 */
export async function selectFolder(): Promise<string> {
    if (!fileBridge) return "";
    return fileBridge.select_folder();
}

/**
 * 递归列出文件夹下的日志文件。
 */
export async function listLogsInFolder(folderPath: string): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.list_logs_in_folder(folderPath);
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}

/**
 * 列出当前目录下的文件和文件夹。
 */
export async function listDirectory(folderPath: string): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.list_directory(folderPath);
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}

export interface WorkspaceConfig {
    version: number;
    lastModified: string;
    files?: Array<{
        path: string;
        name: string;
        size: number;
        layers: any[];
    }>;
    activeFilePath?: string | null;
    layers?: any[]; // Legacy/Global fallback
}

/**
 * 保存工作区配置。
 */
export async function saveWorkspaceConfig(folderPath: string, config: WorkspaceConfig): Promise<boolean> {
    if (!fileBridge) return false;
    try {
        return await fileBridge.save_workspace_config(folderPath, JSON.stringify(config));
    } catch (e) {
        console.error('[Workspace] Failed to save config:', e);
        return false;
    }
}

/**
 * 加载工作区配置。
 */
export async function loadWorkspaceConfig(folderPath: string): Promise<WorkspaceConfig | null> {
    if (!fileBridge) return null;
    try {
        const jsonStr = await fileBridge.load_workspace_config(folderPath);
        if (!jsonStr) return null;
        return JSON.parse(jsonStr) as WorkspaceConfig;
    } catch (e) {
        console.error('[Workspace] Failed to load config:', e);
        return null;
    }
}

/**
 * 核心初始化函数。
 * 使用 QWebChannel 连接 Python 后端暴露的 Native 对象。
 */
export const ensureBridge = (): Promise<FileBridgeAPI | null> => {
    if (fileBridge) return Promise.resolve(fileBridge);
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve) => {
        const setupChannel = () => {
            // 检查 Qt 注入的对象是否存在
            if (typeof window.qt !== 'undefined' && window.qt.webChannelTransport) {
                new QWebChannel(window.qt.webChannelTransport, (channel: any) => {
                    // Monkey Patch: 修复 QWebChannel 在极少数情况下找不到回调函数的问题
                    const originalHandleResponse = channel.handleResponse;
                    channel.handleResponse = function (data: any) {
                        if (!data || data.id === undefined) {
                            if (typeof originalHandleResponse === 'function') originalHandleResponse.call(channel, data);
                            return;
                        }
                        const callback = channel.execCallbacks[data.id];
                        if (typeof callback === 'function') {
                            originalHandleResponse.call(channel, data);
                        } else {
                            delete channel.execCallbacks[data.id];
                            console.warn(`[Bridge] Suppressed invalid callback for msg ${data.id}. Type: ${typeof callback} `);
                        }
                    };

                    fileBridge = channel.objects.fileBridge as FileBridgeAPI;
                    window.fileBridge = fileBridge;
                    resolve(fileBridge);
                });
                return true;
            }
            return false;
        };

        // 如果注入还没生效，轮询检查
        if (!setupChannel()) {
            const start = Date.now();
            const interval = setInterval(() => {
                if (setupChannel()) {
                    clearInterval(interval);
                } else if (Date.now() - start > 5000) {
                    clearInterval(interval);
                    console.error('[Bridge] Failed to initialize QWebChannel after 5s');
                    resolve(null);
                }
            }, 100);
        }
    });
    return initPromise;
};

// 兼容性导出
export const initBridge = ensureBridge;

declare global {
    interface Window {
        qt?: { webChannelTransport: any };
        fileBridge?: FileBridgeAPI;
    }
}
