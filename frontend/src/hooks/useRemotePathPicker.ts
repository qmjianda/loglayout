/**
 * useRemotePathPicker.ts - 远程路径选择器 Hook
 * 
 * 封装后端 API 调用，提供简单的接口来使用远程路径选择器。
 */

import { useState, useCallback } from 'react';

export interface DirectoryItem {
    name: string;
    path: string;
    isDir: boolean;
    size: number;
}

export interface UseRemotePathPickerOptions {
    /** 后端 API 基础 URL，默认自动检测 */
    backendUrl?: string;
}

/**
 * 远程路径选择器 Hook
 * 
 * @example
 * ```tsx
 * const { openFolderPicker, openFilePicker, listDirectory } = useRemotePathPicker();
 * 
 * // 在需要时打开选择器
 * <RemotePathPicker
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   onSelect={handleSelect}
 *   listDirectory={listDirectory}
 * />
 * ```
 */
export const useRemotePathPicker = (options: UseRemotePathPickerOptions = {}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<'folder' | 'file' | 'both'>('folder');
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [resolvePromise, setResolvePromise] = useState<((result: { path: string; isDir: boolean } | null) => void) | null>(null);

    // 获取后端 URL
    const getBackendUrl = useCallback((): string => {
        if (options.backendUrl) return options.backendUrl;

        // 自动检测：与 bridge_client.ts 保持一致
        // 开发环境(port 3000) 使用 localhost:12345，生产环境使用当前域
        const isDev = window.location.port === '3000';
        return isDev ? 'http://127.0.0.1:12345' : window.location.origin;
    }, [options.backendUrl]);

    /**
     * 调用后端 API 获取目录内容
     */
    const listDirectory = useCallback(async (path: string): Promise<DirectoryItem[]> => {
        const backendUrl = getBackendUrl();

        try {
            const response = await fetch(`${backendUrl}/api/list_directory`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ path }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('[RemotePathPicker] Failed to list directory:', error);
            throw error;
        }
    }, [getBackendUrl]);

    /**
     * 打开文件夹选择器
     * 
     * @returns Promise<{path, isDir} | null> 选中的路径，取消返回 null
     */
    const openFolderPicker = useCallback((): Promise<{ path: string; isDir: boolean } | null> => {
        return new Promise((resolve) => {
            setMode('folder');
            setIsOpen(true);
            setResolvePromise(() => resolve);
        });
    }, []);

    /**
     * 打开文件选择器
     * 
     * @returns Promise<{path, isDir} | null> 选中的路径，取消返回 null
     */
    const openFilePicker = useCallback((): Promise<{ path: string; isDir: boolean } | null> => {
        return new Promise((resolve) => {
            setMode('file');
            setIsOpen(true);
            setResolvePromise(() => resolve);
        });
    }, []);

    /**
     * 打开路径选择器（文件和文件夹都可选）
     * 
     * @returns Promise<{path, isDir} | null> 选中的路径，取消返回 null
     */
    const openPathPicker = useCallback((): Promise<{ path: string; isDir: boolean } | null> => {
        return new Promise((resolve) => {
            setMode('both');
            setIsOpen(true);
            setResolvePromise(() => resolve);
        });
    }, []);

    /**
     * 处理选择完成
     */
    const handleSelect = useCallback((path: string, isDir: boolean) => {
        setSelectedPath(path);
        setIsOpen(false);

        if (resolvePromise) {
            resolvePromise({ path, isDir });
            setResolvePromise(null);
        }
    }, [resolvePromise]);

    /**
     * 处理对话框关闭
     */
    const handleOpenChange = useCallback((open: boolean) => {
        setIsOpen(open);

        if (!open && resolvePromise) {
            resolvePromise(null);
            setResolvePromise(null);
        }
    }, [resolvePromise]);

    return {
        // 状态
        isOpen,
        mode,
        selectedPath,

        // 方法
        listDirectory,
        openFolderPicker,
        openFilePicker,
        openPathPicker,

        // 控制方法（供 RemotePathPicker 组件使用）
        onSelect: handleSelect,
        onOpenChange: handleOpenChange,
    };
};

export default useRemotePathPicker;
