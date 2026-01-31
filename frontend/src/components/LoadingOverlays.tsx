import React from 'react';

interface IndexingOverlayProps {
    progress: number;
    fileName: string;
}

export const IndexingOverlay: React.FC<IndexingOverlayProps> = ({ progress, fileName }) => (
    <div className="absolute inset-x-0 bottom-0 top-8 z-50 flex flex-col items-center justify-center bg-[#1e1e1e]/80 backdrop-blur-sm transition-all">
        <div className="flex flex-col items-center p-8 rounded-2xl bg-[#252526] border border-white/10 shadow-2xl scale-in-center overflow-hidden relative">
            <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
            <div className="relative w-24 h-24 mb-6">
                <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#333" strokeWidth="6" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="6" strokeDasharray="282.7" strokeDashoffset={282.7 - (282.7 * progress) / 100} strokeLinecap="round" className="transition-all duration-300" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-blue-400 font-mono">
                    {Math.round(progress)}%
                </div>
            </div>
            <h3 className="text-[13px] font-bold text-white mb-1 uppercase tracking-wider">正在构建索引</h3>
            <p className="text-[10px] text-gray-500 font-mono truncate max-w-[200px]">{fileName}</p>
            <div className="mt-6 flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
            </div>
        </div>
    </div>
);

interface FileLoadingSkeletonProps {
    fileName?: string;
}

export const FileLoadingSkeleton: React.FC<FileLoadingSkeletonProps> = ({ fileName }) => (
    <div className="absolute inset-x-0 bottom-0 top-8 z-40 bg-[#1e1e1e] overflow-hidden">
        {/* Animated gradient shimmer overlay */}
        <div className="absolute inset-0 pointer-events-none">
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.08) 20%, rgba(59, 130, 246, 0.15) 50%, rgba(59, 130, 246, 0.08) 80%, transparent 100%)',
                    animation: 'shimmer 2s ease-in-out infinite',
                }}
            />
        </div>

        {/* Skeleton lines */}
        <div className="p-4 space-y-0">
            {Array.from({ length: 35 }).map((_, i) => {
                const seed = (i * 7 + 13) % 100;
                const lineNumWidth = 20 + (seed % 15);
                const contentWidth = 15 + ((seed * 3) % 60);
                const hasSecondBlock = seed % 2 === 0;
                const secondBlockWidth = 10 + ((seed * 2) % 20);

                return (
                    <div key={i} className="flex items-center h-[20px]" style={{ opacity: Math.max(0.3, 1 - i * 0.02) }}>
                        <div className="w-20 pr-4 flex justify-end shrink-0">
                            <div className="h-3 bg-gray-700/50 rounded animate-pulse" style={{ width: `${lineNumWidth}px`, animationDelay: `${i * 50}ms` }} />
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                            <div className="h-3 bg-gray-600/40 rounded animate-pulse" style={{ width: `${contentWidth}%`, animationDelay: `${i * 50 + 25}ms` }} />
                            {hasSecondBlock && <div className="h-3 bg-gray-700/30 rounded animate-pulse" style={{ width: `${secondBlockWidth}%`, animationDelay: `${i * 50 + 50}ms` }} />}
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-4 bg-[#252526]/95 px-8 py-6 rounded-xl border border-white/10 shadow-2xl backdrop-blur-sm">
                <div className="relative w-12 h-12">
                    <svg className="w-full h-full animate-spin" viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r="20" fill="none" stroke="#333" strokeWidth="3" />
                        <circle cx="25" cy="25" r="20" fill="none" stroke="url(#gradient)" strokeWidth="3" strokeDasharray="80 125" strokeLinecap="round" />
                        <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-white">正在加载文件</p>
                    {fileName && <p className="text-xs text-gray-500 mt-1 font-mono max-w-[180px] truncate">{fileName}</p>}
                </div>
            </div>
        </div>
    </div>
);

export const PendingFilesWall: React.FC<{ count: number }> = ({ count }) => (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-dark-2">
        <div className="flex flex-col items-center gap-5">
            <div className="relative w-16 h-16">
                <svg className="w-full h-full" viewBox="0 0 64 64" fill="none">
                    <rect x="12" y="8" width="36" height="44" rx="3" fill="#333" className="animate-pulse" style={{ animationDelay: '200ms' }} />
                    <rect x="8" y="12" width="36" height="44" rx="3" fill="#3b3b3b" className="animate-pulse" style={{ animationDelay: '100ms' }} />
                    <rect x="4" y="16" width="36" height="44" rx="3" fill="#444" />
                    <rect x="10" y="26" width="20" height="2" rx="1" fill="#555" />
                    <rect x="10" y="32" width="24" height="2" rx="1" fill="#555" />
                    <rect x="10" y="38" width="16" height="2" rx="1" fill="#555" />
                    <circle cx="50" cy="50" r="10" fill="#252526" />
                    <circle cx="50" cy="50" r="7" fill="none" stroke="url(#cliGradient)" strokeWidth="2" strokeDasharray="30 15" strokeLinecap="round" className="animate-spin origin-center" style={{ transformOrigin: '50px 50px' }} />
                    <defs>
                        <linearGradient id="cliGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <div className="text-center">
                <p className="text-sm font-medium text-gray-400">Loading files...</p>
                <p className="text-xs mt-1 text-gray-600">{count} {count === 1 ? 'file' : 'files'} remaining</p>
            </div>
            <div className="w-32 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full w-1/2 rounded-full"
                    style={{
                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.5s ease-in-out infinite'
                    }}
                />
            </div>
        </div>
    </div>
);
