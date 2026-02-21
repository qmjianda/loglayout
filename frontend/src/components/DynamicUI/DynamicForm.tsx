
import React from 'react';
import { LayerRegistryEntry, LayerUIField } from '../../types';
import { InputMapper } from './InputMapper';

interface DynamicFormProps {
    registryEntry: LayerRegistryEntry;
    config: any;
    onUpdate: (update: any) => void;
}

export const DynamicForm: React.FC<DynamicFormProps> = ({
    registryEntry,
    config,
    onUpdate
}) => {
    const fields = registryEntry.ui_schema;

    // Generic rendering for all layers
    // Special layout for HIGHLIGHT
    if (registryEntry.type === 'HIGHLIGHT') {
        const queryField = fields.find(f => f.name === 'query');
        const colorField = fields.find(f => f.name === 'color');
        const opacityField = fields.find(f => f.name === 'opacity');

        return (
            <div className="space-y-3">
                {queryField && (
                    <InputMapper
                        field={queryField}
                        value={config[queryField.name]}
                        onChange={(v) => onUpdate({ [queryField.name]: v })}
                        searchConfig={{
                            regex: config['regex'],
                            caseSensitive: config['caseSensitive'],
                            wholeWord: config['wholeWord']
                        }}
                        onSearchConfigChange={(upd) => onUpdate(upd)}
                    />
                )}

                <div className="flex space-x-4 items-start">
                    {colorField && (
                        <div className="shrink-0 flex flex-col space-y-1">
                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tight">图层颜色</span>
                            <InputMapper
                                field={colorField}
                                value={config[colorField.name]}
                                onChange={(v) => onUpdate({ [colorField.name]: v })}
                            />
                        </div>
                    )}
                    {opacityField && (
                        <div className="flex-1 flex flex-col space-y-1 pt-0.5">
                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tight">不透明度</span>
                            <InputMapper
                                field={opacityField}
                                value={config[opacityField.name]}
                                onChange={(v) => onUpdate({ [opacityField.name]: v })}
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3">
            {fields.map(field => {
                // Skip hidden fields if any (not in schema yet)
                return (
                    <div key={field.name} className="flex flex-col space-y-1">
                        {field.type !== 'bool' && (
                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tight">
                                {field.display_name}
                            </span>
                        )}
                        <InputMapper
                            field={field}
                            value={config[field.name]}
                            onChange={(v) => onUpdate({ [field.name]: v })}
                            searchConfig={field.type === 'search' ? {
                                regex: config['regex'],
                                caseSensitive: config['caseSensitive'],
                                wholeWord: config['wholeWord']
                            } : undefined}
                            onSearchConfigChange={field.type === 'search' ? (upd) => onUpdate(upd) : undefined}
                        />
                        {field.info && (
                            <span className="text-[9px] text-gray-600 italic leading-tight">{field.info}</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
