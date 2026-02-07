import { useState, useEffect } from 'react';

export interface UIWidgetInfo {
    type: string;
    display_name: string;
    role: 'statusbar' | 'sidebar' | 'editor_toolbar';
    refresh_interval: number;
}

export interface UIWidgetData {
    text?: string;
    color?: string;
    tooltip?: string;
    icon?: string;
    [key: string]: any;
}

const BACKEND_URL = (window.location.port === '3000') ? 'http://127.0.0.1:12345' : '';

export const usePluginWidgets = (role: string) => {
    const [widgets, setWidgets] = useState<UIWidgetInfo[]>([]);
    const [widgetData, setWidgetData] = useState<Record<string, UIWidgetData>>({});

    // 1. Fetch available widgets on mount
    useEffect(() => {
        const fetchWidgets = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/get_ui_widgets`);
                const allWidgets: UIWidgetInfo[] = await res.json();
                setWidgets(allWidgets.filter(w => w.role === role));
            } catch (e) {
                console.error('[PluginWidgets] Failed to fetch widgets:', e);
            }
        };
        fetchWidgets();
    }, [role]);

    // 2. Setup refresh timers for each widget
    useEffect(() => {
        const timers: number[] = [];

        widgets.forEach(widget => {
            if (widget.refresh_interval > 0) {
                const fetchOnce = async () => {
                    try {
                        const res = await fetch(`${BACKEND_URL}/api/get_widget_data?type_id=${widget.type}`);
                        const data = await res.json();
                        setWidgetData(prev => ({ ...prev, [widget.type]: data }));
                    } catch (e) {
                        console.error(`[PluginWidgets] Failed to fetch data for ${widget.type}:`, e);
                    }
                };

                fetchOnce(); // Initial fetch
                const timer = window.setInterval(fetchOnce, widget.refresh_interval * 1000);
                timers.push(timer);
            }
        });

        return () => timers.forEach(t => clearInterval(t));
    }, [widgets]);

    return { widgets, widgetData };
};
