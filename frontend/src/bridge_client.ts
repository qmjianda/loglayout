// @ts-ignore
declare const QWebChannel: any;

// Bridge API interface (Matching bridge.py Multi-Session)
export interface FileBridgeAPI {
    // File operations
    open_file: (fileId: string, path: string) => Promise<boolean>;
    select_files: () => Promise<string>;
    select_folder: () => Promise<string>;
    list_logs_in_folder: (folderPath: string) => Promise<string>;
    list_directory: (folderPath: string) => Promise<string>;
    ready: () => Promise<void>;


    close_file: (fileId: string) => Promise<void>;

    // Line reading (Processed with highlights/filter)
    read_processed_lines: (fileId: string, start: number, count: number) => Promise<string>;

    // Layer and pipeline management
    sync_layers: (fileId: string, layersJson: string) => Promise<boolean>;
    sync_all: (fileId: string, layersJson: string, searchJson: string) => Promise<boolean>;

    // Search
    search_ripgrep: (fileId: string, query: string, regex: boolean, caseSensitive: boolean) => Promise<boolean>;

    // Signals (Taking fileId as first argument)
    fileLoaded: {
        connect: (callback: (fileId: string, payloadJson: string) => void) => void;
    };
    pipelineFinished: {
        connect: (callback: (fileId: string, newTotal: number, matchesJson: string) => void) => void;
    };
    statsFinished: {
        connect: (callback: (fileId: string, statsJson: string) => void) => void;
    };

    operationStarted: {
        connect: (callback: (fileId: string, op: string) => void) => void;
    };
    operationProgress: {
        connect: (callback: (fileId: string, op: string, progress: number) => void) => void;
    };
    operationError: {
        connect: (callback: (fileId: string, op: string, message: string) => void) => void;
    };
    pendingFilesCount: {
        connect: (callback: (count: number) => void) => void;
    };
    frontendReady: {
        connect: (callback: () => void) => void;
    };
}

// Global bridge instance
let fileBridge: FileBridgeAPI | null = null;

export async function readProcessedLines(fileId: string, start: number, count: number): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.read_processed_lines(fileId, start, count);
        return JSON.parse(jsonStr) as any[];
    } catch (e) {
        console.error(`Failed to read processed lines for ${fileId}:`, e);
        return [];
    }
}

export async function syncLayers(fileId: string, layers: any[]): Promise<void> {
    if (!fileBridge) return;
    try {
        await fileBridge.sync_layers(fileId, JSON.stringify(layers));
    } catch (e) {
        console.error(`Failed to sync layers for ${fileId}:`, e);
    }
}

export async function syncAll(fileId: string, layers: any[], search: any): Promise<void> {
    if (!fileBridge) return;
    try {
        await fileBridge.sync_all(fileId, JSON.stringify(layers), JSON.stringify(search));
    } catch (e) {
        console.error(`Failed to sync all for ${fileId}:`, e);
    }
}

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
        console.error(`Search failed for ${fileId}:`, e);
        return false;
    }
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
    } catch (e) {
        return [];
    }
}

export async function selectFolder(): Promise<string> {
    if (!fileBridge) return "";
    return fileBridge.select_folder();
}

export async function listLogsInFolder(folderPath: string): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.list_logs_in_folder(folderPath);
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}

export async function listDirectory(folderPath: string): Promise<any[]> {
    if (!fileBridge) return [];
    try {
        const jsonStr = await fileBridge.list_directory(folderPath);
        return JSON.parse(jsonStr);
    } catch (e) {
        return [];
    }
}



export const initBridge = (): Promise<FileBridgeAPI | null> => {
    return new Promise((resolve) => {
        const setupChannel = () => {
            if (typeof window.qt !== 'undefined' && window.qt.webChannelTransport) {
                new QWebChannel(window.qt.webChannelTransport, (channel: any) => {
                    // Monkey Patch: Fix for "execCallbacks[id] is not a function" and missing IDs
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
                            // If callback is missing or invalid, clean up and ignore
                            delete channel.execCallbacks[data.id];
                            console.warn(`[Bridge] Suppressed invalid callback for msg ${data.id}. Type: ${typeof callback}`);
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
};

declare global {
    interface Window {
        qt?: { webChannelTransport: any };
        fileBridge?: FileBridgeAPI;
    }
}
