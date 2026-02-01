
import { useState, useEffect } from 'react';
import { LayerRegistryEntry } from '../types';
import { getLayerRegistry } from '../bridge_client';

export function useLayerRegistry() {
    const [registry, setRegistry] = useState<Record<string, LayerRegistryEntry>>({});
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try {
            const json = await getLayerRegistry();
            console.log("[useLayerRegistry] Received registry JSON:", json);
            const data: LayerRegistryEntry[] = JSON.parse(json);
            const map: Record<string, LayerRegistryEntry> = {};
            data.forEach(entry => {
                map[entry.type] = entry;
            });
            setRegistry(map);
        } catch (e) {
            console.error("Failed to load layer registry:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    return { registry, loading, refresh };
}
