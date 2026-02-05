/**
 * RemotePathPicker.tsx - 远程路径选择器组件
 * 
 * 类似 VS Code Remote-SSH 的路径选择器，使用 cmdk 库实现。
 * 支持：
 * - 路径输入与自动补全
 * - 文件树浏览
 * - 快速导航（Home、根目录等）
 * - 键盘快捷键支持
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import './RemotePathPicker.css';

// 图标组件
const RPP_LAST_PATH_KEY = 'loglayer_rpp_last_path';

const FolderIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.879a1.5 1.5 0 0 1 1.06.44L7.56 3.56A.5.5 0 0 0 7.914 3.75H13.5A1.5 1.5 0 0 1 15 5.25v7.25a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"
            fill="#DCB67A" />
    </svg>
);

const FileIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 1.5A1.5 1.5 0 0 1 5.5 0h4.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 1 .439 1.061V14.5A1.5 1.5 0 0 1 12.5 16h-7A1.5 1.5 0 0 1 4 14.5v-13z"
            fill="#8DA3BF" />
    </svg>
);

const HomeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-4h3v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354l-6-6z" />
    </svg>
);

const DriveIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.5 5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zM3 4.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0z" />
        <path d="M16 11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6zM2 4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H2z" />
    </svg>
);

const ParentDirIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d="M8 11.293l-5.146-5.147a.5.5 0 1 0-.708.708l5.5 5.5a.5.5 0 0 0 .708 0l5.5-5.5a.5.5 0 0 0-.708-.708L8 11.293z" transform="rotate(180, 8, 8)" />
    </svg>
);

const RefreshIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
);

const LoadingSpinner = () => (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
);

interface DirectoryItem {
    name: string;
    path: string;
    isDir: boolean;
    size: number;
}

interface RemotePathPickerProps {
    /** 是否显示对话框 */
    open: boolean;
    /** 关闭时回调 */
    onOpenChange: (open: boolean) => void;
    /** 选择路径后的回调，增加 isDir 参数 */
    onSelect: (path: string, isDir: boolean) => void;
    /** 选择模式：folder 只选文件夹，file 只选文件，both 都可以 */
    mode?: 'folder' | 'file' | 'both';
    /** 对话框标题 */
    title?: string;
    /** 初始路径 */
    initialPath?: string;
    /** 后端 API：获取目录内容 */
    listDirectory: (path: string) => Promise<DirectoryItem[]>;
}

/**
 * 远程路径选择器组件
 * 
 * 使用 cmdk 实现类似 VS Code Remote-SSH 的路径选择体验
 */
export const RemotePathPicker: React.FC<RemotePathPickerProps> = ({
    open,
    onOpenChange,
    onSelect,
    mode = 'folder',
    title = '选择路径',
    initialPath = '',
    listDirectory
}) => {
    // 当前浏览的路径
    const [currentPath, setCurrentPath] = useState(initialPath);
    // 用户输入的搜索/路径
    const [inputValue, setInputValue] = useState(initialPath);
    // 目录内容
    const [items, setItems] = useState<DirectoryItem[]>([]);
    // 加载状态
    const [loading, setLoading] = useState(false);
    // 错误信息
    const [error, setError] = useState<string | null>(null);
    // 展示历史路径
    const [pathHistory, setPathHistory] = useState<string[]>([]);

    // 获取用户主目录和驱动器列表 (跨平台)
    const quickAccessItems = useMemo(() => {
        const isWindows = navigator.platform.toLowerCase().includes('win');
        if (isWindows) {
            return [
                { name: '本地磁盘 (C:)', path: 'C:\\', icon: <DriveIcon /> },
                { name: '本地磁盘 (D:)', path: 'D:\\', icon: <DriveIcon /> },
                { name: '用户目录', path: 'C:\\Users', icon: <HomeIcon /> },
            ];
        }
        return [
            { name: '根目录', path: '/', icon: <DriveIcon /> },
            { name: '用户目录', path: '/home', icon: <HomeIcon /> },
        ];
    }, []);

    // 规范化路径
    const normalizePath = useCallback((path: string): string => {
        const isWindows = navigator.platform.toLowerCase().includes('win');
        if (isWindows) {
            // Windows 路径规范化
            return path.replace(/\//g, '\\').replace(/\\+/g, '\\');
        }
        // Unix 路径规范化
        return path.replace(/\/+/g, '/');
    }, []);

    // 获取父目录
    const getParentPath = useCallback((path: string): string => {
        const normalized = normalizePath(path);
        const isWindows = navigator.platform.toLowerCase().includes('win');
        const separator = isWindows ? '\\' : '/';

        // 去掉末尾的分隔符
        const trimmed = normalized.endsWith(separator)
            ? normalized.slice(0, -1)
            : normalized;

        const lastSep = trimmed.lastIndexOf(separator);
        if (lastSep <= 0) {
            // 已经到根目录
            return isWindows ? trimmed.slice(0, 3) : '/'; // C:\ 或 /
        }

        // Windows 特殊处理：C:\ 的父目录还是 C:\
        if (isWindows && lastSep === 2) {
            return trimmed.slice(0, 3);
        }

        return trimmed.slice(0, lastSep) || (isWindows ? '' : '/');
    }, [normalizePath]);

    // 加载目录内容
    const loadDirectory = useCallback(async (path: string) => {
        if (!path) return;

        setLoading(true);
        setError(null);

        try {
            const normalizedPath = normalizePath(path);
            const directoryItems = await listDirectory(normalizedPath);
            setItems(directoryItems);
            setCurrentPath(normalizedPath);

            // 更新历史
            setPathHistory(prev => {
                const newHistory = prev.filter(p => p !== normalizedPath);
                return [normalizedPath, ...newHistory].slice(0, 10);
            });

            // 保存到上一次路径记忆
            localStorage.setItem(RPP_LAST_PATH_KEY, normalizedPath);
        } catch (err) {
            setError(err instanceof Error ? err.message : '无法加载目录');
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [listDirectory, normalizePath]);

    // 刷新当前目录
    const handleRefresh = useCallback(() => {
        if (currentPath) {
            loadDirectory(currentPath);
        }
    }, [currentPath, loadDirectory]);

    // 打开时加载初始目录
    useEffect(() => {
        if (open) {
            // 优先级：initialPath > localStorage > quickAccess[0] > empty
            const savedPath = localStorage.getItem(RPP_LAST_PATH_KEY);
            const startPath = initialPath || savedPath || quickAccessItems[0]?.path || '';

            setInputValue(startPath);
            if (startPath) {
                loadDirectory(startPath);
            }
        }
    }, [open, initialPath, loadDirectory, quickAccessItems]);

    // 监听键盘快捷键 (Ctrl+R 刷新)
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                handleRefresh();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, handleRefresh]);

    // 处理输入变化（带防抖的路径自动补全）
    const handleInputChange = useCallback((value: string) => {
        setInputValue(value);

        // 如果输入的是完整路径，尝试加载
        const normalized = normalizePath(value);
        if (normalized && (normalized.endsWith('\\') || normalized.endsWith('/'))) {
            loadDirectory(normalized);
        }
    }, [normalizePath, loadDirectory]);

    // 处理项目选择
    const handleItemSelect = useCallback((item: DirectoryItem) => {
        if (item.isDir) {
            // 进入目录
            setInputValue(item.path);
            loadDirectory(item.path);
        } else {
            // 选择文件
            if (mode === 'file' || mode === 'both') {
                onSelect(item.path, false);
                onOpenChange(false);
            }
        }
    }, [mode, onSelect, onOpenChange, loadDirectory]);

    // 处理确认选择当前目录
    const handleConfirmCurrentPath = useCallback(() => {
        if (mode === 'folder' || mode === 'both') {
            onSelect(currentPath, true);
            onOpenChange(false);
        }
    }, [mode, currentPath, onSelect, onOpenChange]);

    // 处理快捷进入父目录
    const handleGoParent = useCallback(() => {
        const parentPath = getParentPath(currentPath);
        if (parentPath !== currentPath) {
            setInputValue(parentPath);
            loadDirectory(parentPath);
        }
    }, [currentPath, getParentPath, loadDirectory]);

    // 过滤项目（基于搜索）
    const filteredItems = useMemo(() => {
        const searchTerm = inputValue.toLowerCase();
        const pathPrefix = currentPath.toLowerCase();

        // 如果输入完全匹配当前路径，显示所有子项
        if (searchTerm === pathPrefix || searchTerm.startsWith(pathPrefix)) {
            const filterPart = searchTerm.slice(pathPrefix.length).replace(/^[\\\/]/, '');
            if (!filterPart) return items;

            return items.filter(item =>
                item.name.toLowerCase().includes(filterPart)
            );
        }

        return items;
    }, [items, inputValue, currentPath]);

    // 根据模式过滤可选项目
    const selectableItems = useMemo(() => {
        return filteredItems.filter(item => {
            if (mode === 'folder') return item.isDir;
            if (mode === 'file') return !item.isDir;
            return true;
        });
    }, [filteredItems, mode]);

    // 格式化文件大小
    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '-';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // 面包屑导航
    const breadcrumbs = useMemo(() => {
        const isWindows = navigator.platform.toLowerCase().includes('win');
        const separator = isWindows ? '\\' : '/';
        const parts = currentPath.split(separator).filter(Boolean);

        const crumbs: { name: string; path: string }[] = [];
        let accPath = '';

        for (const part of parts) {
            accPath += (isWindows && !accPath ? '' : separator) + part;
            if (isWindows && !crumbs.length) {
                accPath = part + '\\';
            }
            crumbs.push({ name: part, path: accPath });
        }

        return crumbs;
    }, [currentPath]);

    if (!open) return null;

    return (
        <div className="remote-path-picker-overlay" onClick={() => onOpenChange(false)}>
            <div
                className="remote-path-picker-container"
                onClick={(e) => e.stopPropagation()}
            >
                <Command
                    className="remote-path-picker-command"
                    shouldFilter={false}
                    loop
                >
                    {/* 头部标题 */}
                    <div className="rpp-header">
                        <span className="rpp-title">{title}</span>
                        <div className="rpp-header-actions">
                            <button
                                className="rpp-header-btn"
                                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                                title="刷新 [Ctrl+R]"
                                disabled={loading || !currentPath}
                            >
                                <RefreshIcon />
                            </button>
                            <button
                                className="rpp-close-btn"
                                onClick={() => onOpenChange(false)}
                                aria-label="关闭"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* 路径输入框 */}
                    <div className="rpp-input-container">
                        <Command.Input
                            value={inputValue}
                            onValueChange={handleInputChange}
                            placeholder="输入路径或搜索..."
                            className="rpp-input"
                            autoFocus
                        />
                    </div>

                    {/* 面包屑导航 */}
                    <div className="rpp-breadcrumb">
                        {breadcrumbs.map((crumb, idx) => (
                            <React.Fragment key={crumb.path}>
                                {idx > 0 && <span className="rpp-breadcrumb-sep">/</span>}
                                <button
                                    className="rpp-breadcrumb-item"
                                    onClick={() => {
                                        setInputValue(crumb.path);
                                        loadDirectory(crumb.path);
                                    }}
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* 列表区域 */}
                    <Command.List className="rpp-list">
                        {loading && (
                            <Command.Loading className="rpp-loading">
                                <LoadingSpinner />
                                <span>加载中...</span>
                            </Command.Loading>
                        )}

                        {error && (
                            <div className="rpp-error">
                                <span>⚠️ {error}</span>
                            </div>
                        )}

                        {!loading && !error && (
                            <>
                                {/* 快捷访问区 */}
                                {!currentPath && (
                                    <Command.Group heading="快捷访问" className="rpp-group">
                                        {quickAccessItems.map((item) => (
                                            <Command.Item
                                                key={item.path}
                                                value={item.path}
                                                onSelect={() => {
                                                    setInputValue(item.path);
                                                    loadDirectory(item.path);
                                                }}
                                                className="rpp-item"
                                            >
                                                <span className="rpp-item-icon">{item.icon}</span>
                                                <span className="rpp-item-name">{item.name}</span>
                                                <span className="rpp-item-path">{item.path}</span>
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}

                                {/* 父目录 */}
                                {currentPath && getParentPath(currentPath) !== currentPath && (
                                    <Command.Item
                                        value="__parent__"
                                        onSelect={handleGoParent}
                                        className="rpp-item rpp-item-parent"
                                    >
                                        <span className="rpp-item-icon"><ParentDirIcon /></span>
                                        <span className="rpp-item-name">..</span>
                                        <span className="rpp-item-path">返回上级目录</span>
                                    </Command.Item>
                                )}

                                {/* 目录内容 */}
                                {currentPath && filteredItems.length > 0 && (
                                    <Command.Group heading="目录内容" className="rpp-group">
                                        {filteredItems.map((item) => (
                                            <Command.Item
                                                key={item.path}
                                                value={item.path}
                                                onSelect={() => handleItemSelect(item)}
                                                className={`rpp-item ${!item.isDir && mode === 'folder' ? 'rpp-item-disabled' : ''}`}
                                                disabled={!item.isDir && mode === 'folder'}
                                            >
                                                <span className="rpp-item-icon">
                                                    {item.isDir ? <FolderIcon /> : <FileIcon />}
                                                </span>
                                                <span className="rpp-item-name">{item.name}</span>
                                                <span className="rpp-item-size">
                                                    {item.isDir ? '文件夹' : formatSize(item.size)}
                                                </span>
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}

                                {/* 空目录 */}
                                {currentPath && !loading && filteredItems.length === 0 && !error && (
                                    <Command.Empty className="rpp-empty">
                                        此目录为空
                                    </Command.Empty>
                                )}

                                {/* 历史路径 */}
                                {pathHistory.length > 0 && !currentPath && (
                                    <Command.Group heading="最近访问" className="rpp-group">
                                        {pathHistory.slice(0, 5).map((histPath) => (
                                            <Command.Item
                                                key={histPath}
                                                value={histPath}
                                                onSelect={() => {
                                                    setInputValue(histPath);
                                                    loadDirectory(histPath);
                                                }}
                                                className="rpp-item"
                                            >
                                                <span className="rpp-item-icon"><FolderIcon /></span>
                                                <span className="rpp-item-name">{histPath.split(/[\\\/]/).pop()}</span>
                                                <span className="rpp-item-path">{histPath}</span>
                                            </Command.Item>
                                        ))}
                                    </Command.Group>
                                )}
                            </>
                        )}
                    </Command.List>

                    {/* 底部操作栏 */}
                    <div className="rpp-footer">
                        <div className="rpp-footer-hint">
                            <kbd>↑↓</kbd> 导航
                            <kbd>Enter</kbd> 选择
                            <kbd>Ctrl+R</kbd> 刷新
                            <kbd>Esc</kbd> 取消
                        </div>
                        <div className="rpp-footer-actions">
                            {(mode === 'folder' || mode === 'both') && currentPath && (
                                <button
                                    className="rpp-btn rpp-btn-primary"
                                    onClick={handleConfirmCurrentPath}
                                >
                                    选择此文件夹
                                </button>
                            )}
                            <button
                                className="rpp-btn"
                                onClick={() => onOpenChange(false)}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </Command>
            </div>
        </div>
    );
};

export default RemotePathPicker;
