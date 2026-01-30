import React from 'react';

export const HelpPanel: React.FC = () => {
  return (
    <div className="p-8 flex flex-col h-full overflow-y-auto custom-scrollbar bg-[#1e1e1e] text-gray-300 select-text">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 border-b border-white/10 pb-6">
          <h2 className="text-2xl font-black text-blue-400 mb-2 flex items-center tracking-tight">
            <svg className="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            开发者中心: 图层架构与 Linux 部署
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            欢迎阅读 LogLayer Pro 扩展指南。我们的应用采用了受 Photoshop 调整图层启发的 <b>非破坏性管道 (Non-Destructive Pipeline)</b>。
            每个图层都作为一个处理数据流的纯函数运行。
          </p>
        </header>
        
        <div className="space-y-12 pb-20">
          {/* Linux Deployment Section */}
          <section className="bg-green-900/10 border border-green-500/20 p-6 rounded-lg">
            <h3 className="text-sm font-black text-green-400 mb-4 flex items-center uppercase tracking-widest">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M5 12h14M5 12l4-4m-4 4l4 4" /></svg>
              Linux 无 NPM 环境部署指南
            </h3>
            <div className="space-y-4 text-xs text-gray-400">
              <p>针对没有 Node.js 环境的 Linux 服务器，我们提供了一个自动化打包脚本 <code className="text-green-400">package.sh</code>。</p>
              <div className="bg-black/40 p-4 rounded font-mono text-[11px] border border-white/5 space-y-2">
                <div className="text-gray-500"># 在开发机（有网络）运行</div>
                <div className="text-white">bash package.sh</div>
                <div className="text-gray-500"># 这将生成 dist_linux 文件夹</div>
                <div className="text-white">scp -r dist_linux user@your-linux-server:~/</div>
                <div className="text-gray-500"># 在目标 Linux 上启动</div>
                <div className="text-white">cd dist_linux && ./run.sh</div>
              </div>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong className="text-gray-200">自包含编译器：</strong> 脚本会自动下载 <code className="text-blue-400">esbuild</code> 二进制文件，不依赖系统中的 Node.js 或 NPM。</li>
                <li><strong className="text-gray-200">通用启动器：</strong> <code className="text-yellow-500">run.sh</code> 使用 Linux 预装的 Python 启动 Web 服务。</li>
                <li><strong className="text-gray-200">静态资源优化：</strong> 打包后的 <code className="text-teal-400">bundle.js</code> 已过混淆和压缩，适合处理 GB 级日志时的内存效率。</li>
              </ul>
            </div>
          </section>

          <section className="bg-[#252526] p-6 rounded-lg border border-white/5 shadow-xl">
            <h3 className="text-xs font-black uppercase text-blue-500 mb-4 tracking-widest flex items-center">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
              核心概念：处理管道
            </h3>
            <div className="flex items-start space-x-6">
              <div className="flex-1 text-xs leading-relaxed space-y-3">
                <p>
                  日志流经一系列启用的图层。 <span className="text-blue-400 font-mono">图层 N</span> 的输出是 
                  <span className="text-blue-400 font-mono">图层 N+1</span> 的输入。
                </p>
                <div className="bg-black/40 p-3 rounded font-mono text-[10px] text-gray-400 border border-white/5">
                  原始日志 (字符串) → 对象化 → [ 过滤 ] → [ 转换 ] → [ 高亮 ] → 虚拟化视图
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h3 className="text-sm font-black uppercase text-gray-500 tracking-widest">扩展工作流</h3>
            
            <div className="relative pl-8 border-l-2 border-white/5 space-y-10">
              <div className="relative">
                <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-[#333] border-2 border-[#1e1e1e] flex items-center justify-center text-[10px] font-bold">1</div>
                <h4 className="text-xs font-bold text-gray-200 mb-2">定义 Schema</h4>
                <p className="text-[11px] text-gray-500 mb-3">在 <code className="text-teal-400">types.ts</code> 中添加新的图层类型和配置键。</p>
                <pre className="bg-black/50 p-4 rounded font-mono text-[11px] text-teal-400 border border-white/5">
{`export enum LayerType {
  MY_CUSTOM_LOGIC = 'MY_CUSTOM_LOGIC',
}

export interface LayerConfig {
  myParameter?: string; // 在此处添加自定义字段
}`}
                </pre>
              </div>

              <div className="relative">
                <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-[#333] border-2 border-[#1e1e1e] flex items-center justify-center text-[10px] font-bold">2</div>
                <h4 className="text-xs font-bold text-gray-200 mb-2">实现处理器 (Processor)</h4>
                <p className="text-[11px] text-gray-500 mb-3">创建 <code className="text-blue-400">processors/myProcessor.ts</code>。这是执行核心计算的地方。</p>
                <pre className="bg-black/50 p-4 rounded font-mono text-[11px] text-blue-300 border border-white/5 overflow-x-auto">
{`import { LogProcessor, LogLine } from '../types';

export const myProcessor: LogProcessor = (lines, layer, chunkSize) => {
  const { myParameter } = layer.config;
  const distribution = new Array(20).fill(0);
  let matchCount = 0;

  const processedLines: LogLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.content.includes(myParameter)) {
      matchCount++;
      distribution[Math.floor(i / chunkSize)]++;
      processedLines.push(line);
    }
  }

  return { processedLines, stats: { count: matchCount, distribution } };
};`}
                </pre>
              </div>
            </div>
          </section>

          <section className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-lg">
            <h3 className="text-sm font-black text-blue-400 mb-4 flex items-center uppercase tracking-widest">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              高性能开发指南 (大数据量)
            </h3>
            <ul className="text-xs space-y-3 text-gray-400 list-disc pl-4">
              <li>
                <strong className="text-gray-200">处理超过 100 万行时避免使用 Array.map/filter：</strong> 对于海量日志，请使用经典的 <code className="text-yellow-600">for(let i=0...)</code> 循环。
              </li>
              <li>
                <strong className="text-gray-200">非阻塞 UI：</strong> 在处理器内部使用 <code className="text-blue-400">taskId</code> 检查，如果用户中途更改参数，则中止运行时间过长的任务。
              </li>
            </ul>
          </section>

          <footer className="text-center pt-10 opacity-30">
            <div className="text-[10px] font-mono tracking-widest uppercase">
              LogLayer Pro 引擎 v2.4 • 非破坏性日志分析系统
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};