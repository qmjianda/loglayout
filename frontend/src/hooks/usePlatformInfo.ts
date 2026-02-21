import { useState, useEffect } from 'react';
import { getPlatformInfo } from '../bridge_client';

/**
 * usePlatformInfo - 全局平台信息 Hook
 * 
 * 自动从后端获取操作系统类型，并提供便捷的 state 访问。
 */
export const usePlatformInfo = () => {
    const [platform, setPlatform] = useState<string>('Unknown');
    const [isWindows, setIsWindows] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchPlatform = async () => {
            try {
                const info = await getPlatformInfo();
                setPlatform(info);
                setIsWindows(info.toLowerCase().includes('windows'));
            } catch (error) {
                console.error('[Hook] Failed to fetch platform info:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPlatform();
    }, []);

    return {
        platform,
        isWindows,
        loading
    };
};
