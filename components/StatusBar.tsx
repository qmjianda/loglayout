import React from 'react';

interface StatusBarProps {
  lines: number;
  totalLines: number;
  size: number;
  isProcessing?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ lines, totalLines, size, isProcessing }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="h-6 bg-blue-700 text-white flex items-center justify-between px-3 text-[11px] font-medium shrink-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1 cursor-pointer hover:bg-blue-600 px-1 rounded">
          <svg className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>{isProcessing ? '正在流式处理数据...' : '就绪'}</span>
        </div>
        <div className="hover:bg-blue-600 px-1 cursor-pointer">UTF-8</div>
      </div>
      <div className="flex items-center space-x-6">
        <div>可见: {lines.toLocaleString()} / 总计: {totalLines.toLocaleString()}</div>
        <div>大小: {formatSize(size)}</div>
        <div className="hover:bg-blue-600 px-1 cursor-pointer">Tab 缩进: 2</div>
        <div className="hover:bg-blue-600 px-1 cursor-pointer">行 1, 列 1</div>
      </div>
    </div>
  );
};