// @ts-ignore
declare const QWebChannel: any;

// Bridge API interface (Matching bridge.py Multi-Session)
export interface FileBridgeAPI {
    // File operations
    open_file: (fileId: string, path: string) => Promise<boolean>;
    select_file: () => Promise<string>;
    close_file: (fileId: string) => Promise<void>;

    // Line reading (Processed with highlights/filter)
    read_processed_lines: (fileId: string, start: number, count: number) => Promise<string>;

    // Layer and pipeline management
    sync_layers: (fileId: string, layersJson: string) => Promise<boolean>;

    // Search
    search_ripgrep: (fileId: string, query: string, regex: boolean, caseSensitive: boolean) => Promise<boolean>;

    // Signals (Taking fileId as first argument)
    fileLoaded: {
        connect: (callback: (fileId: string, payloadJson: string) => void) => void;
    };
    filterFinished: {
        connect: (callback: (fileId: string, newTotal: number) => void) => void;
    };
    searchFinished: {
        connect: (callback: (fileId: string, matchesJson: string) => void) => void;
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

export async function selectFile(): Promise<string> {
    if (!fileBridge) return "";
    return fileBridge.select_file();
}

export const initBridge = (): Promise<FileBridgeAPI | null> => {
    return new Promise((resolve) => {
        const checkQt = () => {
            if (typeof window.qt !== 'undefined' && window.qt.webChannelTransport) {
                new QWebChannel(window.qt.webChannelTransport, (channel: any) => {
                    // Monkey Patch: Fix for "execCallbacks[message.id] is not a function"
                    const originalHandleResponse = channel.handleResponse;
                    channel.handleResponse = function (data: any) {
                        if (channel.execCallbacks[data.id]) {
                            originalHandleResponse.call(channel, data);
                        } else {
                            console.warn("Suppressing QWebChannel error for ID:", data.id);
                        }
                    };

                    fileBridge = channel.objects.fileBridge as FileBridgeAPI;
                    window.fileBridge = fileBridge;
                    resolve(fileBridge);
                });
            } else {
                const start = Date.now();
                const interval = setInterval(() => {
                    if (typeof window.qt !== 'undefined' && window.qt.webChannelTransport) {
                        clearInterval(interval);
                        new QWebChannel(window.qt.webChannelTransport, (channel: any) => {
                            const originalHandleResponse = channel.handleResponse;
                            channel.handleResponse = function (data: any) {
                                if (channel.execCallbacks[data.id]) {
                                    originalHandleResponse.call(channel, data);
                                } else {
                                    console.warn("Suppressing QWebChannel error for ID:", data.id);
                                }
                            };
                            fileBridge = channel.objects.fileBridge as FileBridgeAPI;
                            window.fileBridge = fileBridge;
                            resolve(fileBridge);
                        });
                    } else if (Date.now() - start > 5000) {
                        clearInterval(interval);
                        resolve(null);
                    }
                }, 100);
            }
        };
        checkQt();
    });
};

declare global {
    interface Window {
        qt?: { webChannelTransport: any };
        fileBridge?: FileBridgeAPI;
    }
}
