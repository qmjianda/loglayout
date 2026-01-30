
import React from 'react';

interface StatusBarProps {
  lines: number;
  totalLines: number;
  size: number;
  isProcessing?: boolean;
  isLayerProcessing?: boolean;
  operationStatus?: { op: string, progress: number, error?: string } | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({ lines, totalLines, size, isProcessing, isLayerProcessing, operationStatus }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusMessage = () => {
    if (operationStatus) {
      if (operationStatus.error) return `错误: ${operationStatus.error}`;
      const prefix = operationStatus.op === 'indexing' ? '正在建立索引' :
        operationStatus.op === 'filtering' ? '正在过滤日志' :
          operationStatus.op === 'searching' ? '正在搜索' : '正在处理';
      return `${prefix}... ${operationStatus.progress > 0 ? `(${Math.round(operationStatus.progress)}%)` : ''}`;
    }
    if (isLayerProcessing && isProcessing) return '正在并行处理数据...';
    if (isProcessing) return '正在加载流式日志...';
    if (isLayerProcessing) return '正在刷新处理管道...';
    return '就绪';
  };

  return (
    <div className={`h-6 ${isLayerProcessing || isProcessing ? 'bg-[#007acc]' : 'bg-[#007acc]'} text-white flex items-center justify-between px-3 text-[11px] font-medium shrink-0 transition-colors duration-300`}>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5 cursor-pointer hover:bg-white/10 px-1 rounded transition-colors">
          {(isProcessing || isLayerProcessing) ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="font-bold tracking-tight">{getStatusMessage()}</span>
        </div>
        <div className="hover:bg-white/10 px-1 cursor-pointer transition-colors opacity-80">UTF-8</div>
      </div>
      <div className="flex items-center space-x-6">
        <div className="opacity-90">
          <span className="font-mono">{(Number(lines) || 0).toLocaleString()}</span>
          <span className="mx-1 opacity-50">/</span>
          <span className="font-mono opacity-70">{(Number(totalLines) || 0).toLocaleString()}</span>
          <span className="ml-1.5 opacity-60">Lines</span>
        </div>
        <div className="opacity-90">Size: {formatSize(size || 0)}</div>
        <div className="hover:bg-white/10 px-1 cursor-pointer transition-colors hidden sm:block">Tab Size: 2</div>
        <div className="hover:bg-white/10 px-1 cursor-pointer transition-colors font-mono">Ln 1, Col 1</div>
      </div>
    </div>
  );
};
