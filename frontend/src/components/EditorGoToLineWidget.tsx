import React, { useState, useEffect, useRef } from 'react';

interface EditorGoToLineWidgetProps {
  totalLines: number;
  onGo: (line: number) => void;
  onClose: () => void;
}

export const EditorGoToLineWidget: React.FC<EditorGoToLineWidgetProps> = ({
  totalLines,
  onGo,
  onClose,
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const lineNum = parseInt(value, 10);
      if (!isNaN(lineNum) && lineNum > 0 && lineNum <= totalLines) {
        onGo(lineNum);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const isValid = !value || (parseInt(value, 10) > 0 && parseInt(value, 10) <= totalLines);

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-[400px] animate-in slide-in-from-top-4 duration-150">
      <div className="bg-[#252526] shadow-2xl rounded-b border border-t-0 border-[#454545] p-2">
        <div className={`flex items-center bg-[#3c3c3c] border rounded overflow-hidden transition-colors ${isValid ? 'border-blue-500/50' : 'border-red-500'}`}>
          <div className="px-2 text-gray-500 text-xs select-none">:</div>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={handleKeyDown}
            placeholder={`输入行号 (1 到 ${totalLines.toLocaleString()})`}
            className="bg-transparent text-white text-xs px-1 py-1.5 w-full focus:outline-none"
          />
        </div>
        {!isValid && (
          <div className="text-[10px] text-red-400 mt-1 px-1">
            行号必须在 1 到 {totalLines.toLocaleString()} 之间
          </div>
        )}
        <div className="mt-2 flex justify-between items-center px-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-tighter font-bold">跳转到行</span>
          <div className="flex space-x-2">
            <span className="text-[9px] text-gray-600 bg-black/20 px-1 rounded flex items-center">
              ENTER 跳转
            </span>
            <span className="text-[9px] text-gray-600 bg-black/20 px-1 rounded flex items-center">
              ESC 取消
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};