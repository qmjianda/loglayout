/**
 * utils/index.ts - 前端公共工具函数库
 * 
 * 提取重复的逻辑，提高代码复用性和可测试性。
 */

/**
 * 从完整路径中提取文件/文件夹名称
 * @param path 完整路径（支持 Windows 和 Unix 风格）
 * @returns 基础名称
 */
export function basename(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}

/**
 * 从 Set 中移除一个元素，返回新 Set（不可变操作）
 * @param set 原始 Set
 * @param item 要移除的元素
 * @returns 新的 Set
 */
export function removeFromSet<T>(set: Set<T>, item: T): Set<T> {
    const next = new Set(set);
    next.delete(item);
    return next;
}

/**
 * 向 Set 中添加一个元素，返回新 Set（不可变操作）
 * @param set 原始 Set
 * @param item 要添加的元素
 * @returns 新的 Set
 */
export function addToSet<T>(set: Set<T>, item: T): Set<T> {
    return new Set(set).add(item);
}

/**
 * 格式化文件大小为人类可读的字符串
 * @param bytes 字节数
 * @returns 格式化后的字符串，如 "1.5 MB"
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 生成唯一 ID
 * @param prefix 可选前缀
 * @returns 唯一 ID 字符串
 */
export function generateId(prefix: string = ''): string {
    return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 防抖函数
 * @param fn 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
        }, delay);
    };
}
