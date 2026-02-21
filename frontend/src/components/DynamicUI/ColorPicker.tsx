
import React, { useRef } from 'react';

interface ColorPickerProps {
    selectedColor: string;
    onColorChange: (color: string) => void;
    setDragDisabled?: (disabled: boolean) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
    selectedColor,
    onColorChange,
    setDragDisabled
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="flex items-center space-x-2">
            <div
                className="w-6 h-6 rounded border border-[#444] cursor-pointer relative overflow-hidden group"
                onClick={() => inputRef.current?.click()}
                style={{ backgroundColor: selectedColor }}
            >
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>

            <input
                ref={inputRef}
                type="color"
                value={selectedColor}
                onChange={(e) => onColorChange(e.target.value)}
                className="sr-only"
                onFocus={() => setDragDisabled?.(true)}
                onBlur={() => setDragDisabled?.(false)}
            />

            <input
                type="text"
                value={selectedColor.toUpperCase()}
                onChange={(e) => onColorChange(e.target.value)}
                className="bg-[#1e1e1e] border border-[#444] px-1.5 py-0.5 text-[10px] rounded text-gray-300 w-16 focus:outline-none focus:border-blue-500 font-mono"
            />
        </div>
    );
};
