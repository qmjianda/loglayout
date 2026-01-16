import React from 'react';

interface ExplorerPanelProps {
  fileName: string;
  fileSize: number;
  onFileSelect: () => void;
}

export const ExplorerPanel: React.FC<ExplorerPanelProps> = ({ fileName, fileSize, onFileSelect }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[#111] flex justify-between items-center bg-[#2d2d2d] shrink-0">
        <h2 className="text-[10px] uppercase font-black opacity-40 tracking-wider">资源管理器</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="mb-4">
          <div className="flex items-center px-4 py-1 bg-[#37373d] text-[11px] font-bold text-gray-400 uppercase tracking-tight cursor-default">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
            打开的编辑器
          </div>
          <div className="px-6 py-2">
            {fileName ? (
              <div className="flex items-center text-xs text-blue-400 hover:bg-[#2a2d2e] p-1 rounded cursor-pointer">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                {fileName}
              </div>
            ) : (
              <div className="text-[11px] text-gray-600 italic">未打开任何文件</div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center px-4 py-1 bg-[#37373d] text-[11px] font-bold text-gray-400 uppercase tracking-tight cursor-default">
            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
            本地工作区
          </div>
          <div className="px-4 py-2 space-y-2">
            {!fileName ? (
              <div className="p-4 border border-dashed border-gray-700 rounded text-center">
                <p className="text-[10px] text-gray-500 mb-2">尚未打开日志文件。</p>
                <button 
                  onClick={onFileSelect}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-3 py-1 rounded shadow-lg transition-colors"
                >
                  打开文件
                </button>
              </div>
            ) : (
              <div className="text-[11px] space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>大小:</span>
                  <span className="text-gray-300">{formatSize(fileSize)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>状态:</span>
                  <span className="text-green-500">已加载</span>
                </div>
                <div className="pt-4">
                  <button 
                    onClick={onFileSelect}
                    className="w-full text-center text-blue-500 hover:text-blue-400 border border-blue-500/30 py-1 rounded transition-colors"
                  >
                    打开另一个...
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};