import React from 'react';

export const HelpPanel: React.FC = () => {
  return (
    <div className="p-8 flex flex-col h-full overflow-y-auto custom-scrollbar bg-[#1e1e1e] text-gray-300 select-text">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 border-b border-white/10 pb-6">
          <h2 className="text-2xl font-black text-blue-400 mb-2 flex items-center tracking-tight">
            <svg className="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            LogLayer 使用手册
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            欢迎使用 LogLayer —— 专为高性能日志分析设计的现代化工具。本手册将帮助您快速上手核心功能。
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Quick Start Card */}
          <div className="bg-[#252526] p-5 rounded-lg border border-white/5 hover:border-blue-500/30 transition-colors">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center">
              <span className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center mr-2 text-xs">1</span>
              打开文件与工作区
            </h3>
            <ul className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <li>• <b>打开文件</b>：点击侧边栏的 "Open File" 或直接将日志文件拖入窗口。</li>
              <li>• <b>打开文件夹</b>：点击 "Open Folder" 可将文件夹作为工作区打开，支持批量搜索与文件切换。</li>
              <li>• <b>工作区记忆</b>：自动恢复之前打开的文件和配置的图层。</li>
            </ul>
          </div>

          {/* Layers Card */}
          <div className="bg-[#252526] p-5 rounded-lg border border-white/5 hover:border-purple-500/30 transition-colors">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center">
              <span className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center mr-2 text-xs">2</span>
              图层系统 (Layers)
            </h3>
            <ul className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <li>• <b>非破坏性分析</b>：通过叠加图层来分析日志，原始文件永远不会被修改。</li>
              <li>• <b>FILTER</b>：过滤图层，只显示匹配行。</li>
              <li>• <b>HIGHLIGHT</b>：高亮图层，用颜色标记关注的关键词。</li>
            </ul>
          </div>

          {/* Bookmarks Card */}
          <div className="bg-[#252526] p-5 rounded-lg border border-white/5 hover:border-yellow-500/30 transition-colors">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center">
              <span className="w-6 h-6 rounded-md bg-yellow-500/20 text-yellow-400 flex items-center justify-center mr-2 text-xs">3</span>
              书签与标注 (Bookmarks)
            </h3>
            <ul className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <li>• <b>快速标记</b>：点击行号左侧区域可快速添加/删除书签。</li>
              <li>• <b>备注说明</b>：在侧边栏书签面板中，您可以为关键行添加自定义备注。</li>
              <li>• <b>极速跳转</b>：使用 F2 / Shift+F2 在书签间快速穿梭。</li>
            </ul>
          </div>

          {/* Performance Card */}
          <div className="bg-[#252526] p-5 rounded-lg border border-white/5 hover:border-green-500/30 transition-colors">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center">
              <span className="w-6 h-6 rounded-md bg-green-500/20 text-green-400 flex items-center justify-center mr-2 text-xs">4</span>
              性能与核心
            </h3>
            <ul className="text-xs text-gray-400 space-y-2 leading-relaxed">
              <li>• <b>GB 级秒开</b>：基于 mmap 的高效索引技术。</li>
              <li>• <b>虚拟化渲染</b>：无论文件多大，内存占用始终保持稳定。</li>
              <li>• <b>Native 桥接</b>：深度集成的 Rust/Python 后端处理引擎。</li>
            </ul>
          </div>
        </div>

        <div className="space-y-12 pb-20">
          {/* Search Feature */}
          <section className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-lg">
            <h3 className="text-sm font-black text-blue-400 mb-4 flex items-center uppercase tracking-widest">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              全局搜索与导航
            </h3>
            <div className="space-y-4 text-xs text-gray-400">
              <p>LogLayer 提供了两种搜索模式：</p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong className="text-gray-200">文件内查找 (Ctrl+F)：</strong> 快速跳转到当前视图中的匹配项，支持正则表达式。</li>
                <li><strong className="text-gray-200">全局搜索 (侧边栏)：</strong> 使用 ripgrep 引擎在整个文件中进行极速搜索，即使是 GB 级文件也能瞬间完成。点击结果可直接跳转。</li>
              </ul>
              <div className="bg-black/40 p-3 rounded font-mono text-[11px] border border-white/5 mt-2">
                提示：在搜索框中输入 "error" 并开启 "Regex" 模式，可匹配更多复杂模式。
              </div>
            </div>
          </section>

          {/* Config Persistence */}
          <section className="bg-[#252526] p-6 rounded-lg border border-white/5 shadow-xl">
            <h3 className="text-xs font-black uppercase text-green-500 mb-4 tracking-widest flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              配置自动保存
            </h3>
            <div className="flex items-start space-x-6">
              <div className="flex-1 text-xs leading-relaxed space-y-3">
                <p>
                  您的工作区配置（包括打开的文件列表、每个文件的图层设置）会自动保存到工作区目录下的
                  <span className="text-green-400 font-mono mx-1">.loglayer/config.json</span> 文件中。
                </p>
                <p className="text-gray-500">
                  下次打开同一文件夹时，一切都会恢复如初，无需重复配置。您可以放心地关闭软件或切换项目。
                </p>
              </div>
            </div>
          </section>

          {/* Shortcuts */}
          <section className="space-y-6">
            <h3 className="text-sm font-black uppercase text-gray-500 tracking-widest">常用快捷键</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/30 p-3 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-gray-400">查找匹配</span>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-200">Ctrl + F</span>
              </div>
              <div className="bg-black/30 p-3 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-gray-400">跳转行号</span>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-200">Ctrl + G</span>
              </div>
              <div className="bg-black/30 p-3 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-gray-400">下一个书签</span>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-200">F2</span>
              </div>
              <div className="bg-black/30 p-3 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-gray-400">上一个书签</span>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-200">Shift + F2</span>
              </div>
              <div className="bg-black/30 p-3 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-gray-400">撤销 / 重做</span>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-200">Ctrl + Z / Y</span>
              </div>
              <div className="bg-black/30 p-3 rounded border border-white/5 flex justify-between items-center">
                <span className="text-xs text-gray-400">侧边栏切换</span>
                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-gray-200">Ctrl + B</span>
              </div>
            </div>
          </section>

          <footer className="text-center pt-10 opacity-30">
            <div className="text-[10px] font-mono tracking-widest uppercase">
              LogLayer v5.1 • 高效日志分析体验
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};