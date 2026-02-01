import os
import sys
import mmap
import array
import json
import re
import subprocess

import platform
from pathlib import Path
from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal, QThread, QProcess
import importlib
from concurrent.futures import ThreadPoolExecutor

from loglayer.registry import LayerRegistry
from loglayer.core import LayerStage

def get_creationflags():
    """Returns subprocess creation flags to hide windows on Windows."""
    if platform.system() == "Windows":
        return 0x08000000  # CREATE_NO_WINDOW
    return 0

def get_log_files_recursive(folder_path):
    """Utility to find log files in a directory recursively."""
    log_files = []
    try:
        for root, _, files in os.walk(folder_path):
            for file in files:
                # Common log extensions or files with no extension (often logs in linux)
                if file.lower().endswith(('.log', '.txt', '.json', '.csv', '.md')) or '.' not in file:
                    full_path = os.path.join(root, file)
                    try:
                        stats = os.stat(full_path)
                        log_files.append({
                            "name": file,
                            "path": full_path,
                            "size": stats.st_size
                        })
                    except: continue
    except Exception as e:
        print(f"Error walking directory {folder_path}: {e}")
    return log_files

def get_directory_contents(folder_path):
    """Utility to list all files and folders in a directory (one level)."""
    items = []
    try:
        path = Path(folder_path)
        for entry in path.iterdir():
            try:
                is_dir = entry.is_dir()
                items.append({
                    "name": entry.name,
                    "path": str(entry.absolute()),
                    "isDir": is_dir,
                    "size": entry.stat().st_size if not is_dir else 0
                })
            except: continue
        # Sort: directories first, then files, then alphabetical
        items.sort(key=lambda x: (not x['isDir'], x['name'].lower()))
    except Exception as e:
        print(f"Error listing directory {folder_path}: {e}")
    return items

class IndexingWorker(QThread):
    """
    索引工作线程。
    扫描文件中的换行符 (\n)，记录每一行起始位置的文件偏移量。
    """
    finished = pyqtSignal(object)  # 完成信号，发送 array.array('Q') (偏移量数组)
    progress = pyqtSignal(float)   # 进度信号 (0-100)
    error = pyqtSignal(str)        # 错误信号

    def __init__(self, mmap_obj, size):
        super().__init__()
        self.mmap = mmap_obj
        self.size = size
        self._is_running = True

    def stop(self):
        self._is_running = False

    def run(self):
        try:
            # 使用多线程并行扫描文件（大文件提速明显）
            num_threads = min(os.cpu_count() or 4, 8)
            chunk_size = self.size // num_threads
            
            with ThreadPoolExecutor(max_workers=num_threads) as executor:
                futures = []
                for i in range(num_threads):
                    if not self._is_running: break
                    start = i * chunk_size
                    end = self.size if i == num_threads - 1 else (i + 1) * chunk_size
                    futures.append(executor.submit(self._index_chunk, start, end))
                
                results = []
                total_futures = len(futures)
                for idx, f in enumerate(futures):
                    if not self._is_running: break
                    results.append(f.result())
                    self.progress.emit((idx + 1) / total_futures * 100)
            
            if not self._is_running: return

            # 合并各分块扫描到的偏移量
            total_offsets = array.array('Q', [0]) # 第一行的偏移量总是 0
            for chunk_offsets in results:
                total_offsets.extend(chunk_offsets)
            
            # 修正末尾多余的换行符
            if len(total_offsets) > 1 and total_offsets[-1] >= self.size:
                total_offsets.pop()
                
            self.finished.emit(total_offsets)
        except Exception as e:
            self.error.emit(str(e))

    def _index_chunk(self, start, end):
        """扫描指定范围内的所有换行符"""
        offsets = array.array('Q')
        pos = start
        while self._is_running:
            pos = self.mmap.find(b'\n', pos, end)
            if pos == -1:
                break
            pos += 1
            if pos < self.size:
                offsets.append(pos)
            else:
                break
        return offsets

class PipelineWorker(QThread):
    """
    流水线处理工作线程。
    1. 调用 ripgrep (Native Stage) 进行快速过滤。
    2. 对 ripgrep 的结果应用 Python 过滤逻辑 (Logic Stage)。
    3. 生成最终可见行的索引映射。
    """
    finished = pyqtSignal(object, object)  # (可见行索引数组, 搜索匹配项在可见行中的排名)
    progress = pyqtSignal(float) # 用于 logic 阶段进度
    error = pyqtSignal(str)

    def __init__(self, rg_path, file_path, layers, search_config=None):
        super().__init__()
        self.rg_path = rg_path
        self.file_path = file_path
        self.layers = layers # BaseLayer 实例列表
        self.search = search_config    # {query, regex, caseSensitive}
        self._is_running = True
        self._processes = []

    def stop(self):
        self._is_running = False
        for p in self._processes:
            try: p.terminate()
            except: pass

    def run(self):
        try:
            # --- 阶段 1: Native 流水线 (ripgrep) ---
            cmd_chain = []
            
            # 准备图层中的 Native 过滤条件
            native_layers = [l for l in self.layers if l.stage == LayerStage.NATIVE]
            
            # 如果存在全局搜索查询，准备参数
            s_args = None
            if self.search and self.search.get('query'):
                s_args = []
                if self.search.get('regex'): s_args.append("-e")
                else: s_args.append("-F")
                if not self.search.get('caseSensitive'): s_args.append("-i")
                s_args.append(self.search['query'])

            # 构建命令链
            # 第一阶段总是生成行号并读取文件
            # 后续阶段必须保留或包裹 "行号:" 前缀
            
            # 如果没有 native 图层且没有搜索条件，匹配全量内容
            if not native_layers and not s_args:
                cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never", "", self.file_path])
            else:
                for i, layer in enumerate(native_layers):
                    rg_args = layer.get_rg_args()
                    if not rg_args: continue
                    
                    if i == 0:
                        # 第一阶段：生成行号
                        cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"] + rg_args + [self.file_path])
                    else:
                        # 管道后续阶段：必须包裹模式以保留行号
                        query = rg_args[-1]
                        is_regex = "-e" in rg_args
                        is_case_insensitive = "-i" in rg_args
                        
                        pattern = query if is_regex else re.escape(query)
                        case_flag = "(?i)" if is_case_insensitive else ""
                        wrapper_pattern = f"^{case_flag}[^:]*:.*{pattern}"
                        
                        cmd_chain.append([self.rg_path, "--no-heading", "--no-filename", "--color", "never", wrapper_pattern, "-"])

                # 如果有全局搜索，作为最终管道阶段
                if s_args:
                    query = s_args[-1]
                    is_regex = "-e" in s_args
                    is_case_insensitive = "-i" in s_args
                    
                    pattern = query if is_regex else re.escape(query)
                    case_flag = "(?i)" if is_case_insensitive else ""
                    wrapper_pattern = f"^{case_flag}[^:]*:.*{pattern}"
                    
                    # 如果这是唯一的一个阶段，它需要直接读取文件
                    if not cmd_chain:
                        cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"] + s_args + [self.file_path])
                    else:
                        cmd_chain.append([self.rg_path, "--no-heading", "--no-filename", "--color", "never", wrapper_pattern, "-"])

            # 兜底：如果命令链为空（例如所有图层都被跳过），执行全量匹配
            if not cmd_chain:
                cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never", "", self.file_path])

            # --- 执行流水线 ---
            self._processes = []
            last_stdout = None
            
            for i, cmd in enumerate(cmd_chain):
                p = subprocess.Popen(cmd, 
                                   stdin=last_stdout if i > 0 else None,
                                   stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE,
                                   bufsize=1024*1024,
                                   creationflags=get_creationflags())
                self._processes.append(p)
                if i > 0 and last_stdout: last_stdout.close()
                last_stdout = p.stdout

            # --- 阶段 2: 逻辑处理 (Python 过滤器) ---
            # 找到任何逻辑阶段运行的图层
            logic_layers = [l for l in self.layers if l.stage == LayerStage.LOGIC]
            for l in logic_layers: l.reset()
            
            visible_indices = array.array('I')
            search_matches = array.array('I')
            
            v_idx = 0
            line_count = 0
            
            for line_bytes in last_stdout:
                if not self._is_running: break
                line_str = line_bytes.decode('utf-8', errors='ignore')
                parts = line_str.split(':', 1)
                
                if len(parts) < 2: continue # 跳过异常行（如 rg 报错）
                
                try:
                    physical_idx = int(parts[0]) - 1
                    content = parts[1]
                except ValueError:
                    continue # 如果行号不是整数则跳过

                # 应用逻辑阶段过滤器和变换
                is_visible = True
                for layer in logic_layers:
                    # 首先允许内容变换（例如在过滤前将 'Error' 重写为 'Info'）
                    content = layer.process_line(content)
                    if not layer.filter_line(content, index=physical_idx):
                        is_visible = False
                        break
                
                if is_visible:
                    visible_indices.append(physical_idx)
                    # 如果有全局搜索，流水线已经过滤过了，所以到达这里的都是匹配项
                    if self.search and self.search.get('query'):
                        search_matches.append(v_idx)
                    v_idx += 1
                
                line_count += 1
                if line_count % 10000 == 0:
                    self.progress.emit(0) # 保持 UI 响应
            
            if self._is_running:
                print(f"[Pipeline] Finished. Visible: {len(visible_indices)}, Matches: {len(search_matches)}")
                self.finished.emit(visible_indices, search_matches)
        except Exception as e:
            if self._is_running: self.error.emit(str(e))
        finally:
            for p in self._processes:
                try: 
                    if p.poll() is None:
                        p.terminate()
                        # Check stderr for the first process if we got no results
                        if p == self._processes[0] and len(visible_indices) == 0:
                            err = p.stderr.read().decode('utf-8', errors='ignore')
                            if err: print(f"[Pipeline] rg error: {err.strip()}")
                    p.wait(timeout=0.2)
                except: pass


class StatsWorker(QThread):
    """
    统计工作线程。
    计算各个图层的匹配行数以及在文件中的分布比例。
    """
    finished = pyqtSignal(str) # 发送 JSON 映射 layerId -> {count, distribution}
    error = pyqtSignal(str)

    def __init__(self, rg_path, layers, file_path, total_lines):
        super().__init__()
        self.rg_path = rg_path
        self.layers = layers
        self.file_path = file_path
        self.total_lines = max(1, total_lines)
        self._is_running = True
        self._processes = []

    def stop(self):
        self._is_running = False
        for p in self._processes:
            try: p.terminate()
            except: pass

    def run(self):
        try:
            results = {}
            active_filters = []
            
            # 预计算任务以允许并行执行
            tasks = []
            
            # 顺序跟踪活跃的过滤器
            for layer in self.layers:
                if not self._is_running: break
                l_id = getattr(layer, 'id', None)
                if not l_id: continue
                
                # 检查基于查询的图层
                q_conf = None
                
                if hasattr(layer, 'query') and layer.query:
                    q_conf = {
                        'query': layer.query,
                        'regex': getattr(layer, 'regex', False),
                        'caseSensitive': getattr(layer, 'caseSensitive', False)
                    }
                
                # LevelLayer 的特殊处理
                if layer.__class__.__name__ == 'LevelLayer':
                    lvls = getattr(layer, 'levels', [])
                    if lvls:
                         q_conf = {'query': f"\\b({'|'.join(map(re.escape, lvls))})\\b", 'regex': True, 'caseSensitive': True}

                # 捕获活跃过滤器的当前状态（副本）
                current_filters = list(active_filters)
                
                # 如果是过滤图层，则添加到过滤器链中
                if getattr(layer, "enabled", True) and layer.__class__.__name__ in ['FilterLayer', 'LevelLayer'] and q_conf:
                    active_filters.append(q_conf)

                if not q_conf: continue

                # 为该图层创建一个任务
                tasks.append((layer, l_id, q_conf, current_filters))

            # 使用线程池并行执行统计 (ripgrep)
            with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as executor:
                future_to_lid = {}
                for layer, l_id, q_conf, filters in tasks:
                    future_to_lid[executor.submit(self._run_layer_stats, l_id, q_conf, filters)] = l_id
                
                for future in future_to_lid:
                    if not self._is_running: break
                    try:
                        lid, res = future.result()
                        if lid and res:
                            results[lid] = res
                    except Exception as e:
                        print(f"Stats task error: {e}")

            if self._is_running:
                self.finished.emit(json.dumps(results))
        except Exception as e:
            if self._is_running: self.error.emit(str(e))

    def _run_layer_stats(self, l_id, q_conf, parent_filters):
        """运行单图层统计的辅助函数"""
        if not self._is_running: return None, None
        
        # 构建流水线命令链
        cmd_chain = []
        
        # 1. 添加之前的过滤器
        for f in parent_filters:
            c = [self.rg_path, "--no-heading", "--no-filename", "--color", "never"]
            if not f.get('caseSensitive'): c.append("-i")
            if not f.get('regex'): c.append("-F")
            c.append(f['query'])
            cmd_chain.append(c)

        # 2. 添加当前图层
        final_cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"]
        if not q_conf.get('caseSensitive'): final_cmd.append("-i")
        if not q_conf.get('regex'): final_cmd.append("-F")
        final_cmd.append(q_conf['query'])
        
        count = 0
        distribution = [0] * 20
        procs = []
        
        try:
            if not cmd_chain:
                # 直接计数
                final_cmd.append(self.file_path)
                p_final = subprocess.Popen(final_cmd, stdout=subprocess.PIPE, text=True, errors='ignore', creationflags=get_creationflags())
                procs.append(p_final)
            else:
                # 管道链
                head_cmd = cmd_chain[0] + [self.file_path]
                p_head = subprocess.Popen(head_cmd, stdout=subprocess.PIPE, creationflags=get_creationflags())
                procs.append(p_head)
                curr_p = p_head
                for i in range(1, len(cmd_chain)):
                    p_next = subprocess.Popen(cmd_chain[i], stdin=curr_p.stdout, stdout=subprocess.PIPE, creationflags=get_creationflags())
                    procs.append(p_next)
                    curr_p.stdout.close()
                    curr_p = p_next
                
                p_final = subprocess.Popen(final_cmd, stdin=curr_p.stdout, stdout=subprocess.PIPE, text=True, errors='ignore', creationflags=get_creationflags())
                procs.append(p_final)
                curr_p.stdout.close()
            
            # 读取输出
            for line in p_final.stdout:
                if not self._is_running: break
                colon_pos = line.find(':')
                if colon_pos != -1:
                    l_str = line[:colon_pos]
                    if l_str.isdigit():
                        l_num = int(l_str) - 1
                        bucket = min(19, int((l_num / self.total_lines) * 20))
                        distribution[bucket] += 1
                        count += 1
            
            # 清理进程
            for p in procs:
                try: 
                    p.terminate() 
                    p.wait(timeout=0.1)
                except: pass

        except Exception:
            pass
            
        # 归一化分布
        max_val = max(distribution) if any(v > 0 for v in distribution) else 0
        norm_dist = [v / max_val if max_val > 0 else 0 for v in distribution]

        return l_id, {"count": count, "distribution": norm_dist}

class LogSession:
    """
    日志会话类。
    封装了单个打开的日志文件的所有状态。
    """
    def __init__(self, file_id, path):
        self.id = file_id
        self.path = str(path)
        self.file_obj = None
        self.fd = None
        self.mmap = None      # 内存映射对象
        self.size = 0         # 文件大小
        self.line_offsets = array.array('Q')  # 每行对应的偏移量映射
        self.visible_indices = None           # 过滤后可见行的索引
        self.search_matches = None            # 搜索命中的行索引排名
        self.layers = []                      # 前端传来的图层配置
        self.layer_instances = []            # 实例化的 Python 图层对象
        self.search_config = None 
        self.highlight_patterns = []
        self.cache = {}                      # 行内容缓存 (由于 read_processed_lines 频繁调用)
        self.workers = {}                    # 后台线程句柄 (indexing, pipeline, stats)

    def close(self, bridge=None):
        """关闭会话。如果提供了 bridge，工作线程将异步退出。"""
        for name, worker in list(self.workers.items()):
            if bridge:
                bridge._retire_worker(worker)
            else:
                if worker.isRunning():
                    worker.stop()
                    worker.wait()
        self.workers.clear()
        
        if self.mmap:
            try: self.mmap.close()
            except: pass
            self.mmap = None
        if self.file_obj:
            try: self.file_obj.close()
            except: pass
            self.file_obj = None
        elif self.fd: # 兜底逻辑
            try: os.close(self.fd)
            except: pass
            self.fd = None

class FileBridge(QObject):
    """
    统一后端 (Unified Backend)：管理多个日志会话。
    通过 QWebChannel 与前端 React 应用通信。
    """
    
    # 信号定义（第一个参数通常是 file_id，用于前端区分文件）
    fileLoaded = pyqtSignal(str, str)  # (file_id, JSON_payload)
    pipelineFinished = pyqtSignal(str, int, int) # (file_id, newTotal, matchCount)
    statsFinished = pyqtSignal(str, str)  # (file_id, JSON_payload)
    
    operationStarted = pyqtSignal(str, str) # (file_id, opName)
    operationProgress = pyqtSignal(str, str, float) # (file_id, opName, percent)
    operationError = pyqtSignal(str, str, str) # (file_id, opName, message)
    operationStatusChanged = pyqtSignal(str, str, int) # (file_id, status, percent)
    
    # CLI file loading signal
    pendingFilesCount = pyqtSignal(int)  # Number of files being loaded from CLI
    frontendReady = pyqtSignal()         # Signal to indicate frontend is ready
    
    def __init__(self):
        super().__init__()
        self._sessions = {} # file_id -> LogSession
        self._rg_path = self._get_rg_path()
        self._zombie_workers = [] # 记录正在停止的工作线程，防止其过早被回收
        
        # 初始化图层注册表并发现插件
        plugin_dir = os.path.join(os.getcwd(), "backend", "plugins")
        self._registry = LayerRegistry(plugin_dir)
        self._registry.discover_plugins()

    def _retire_worker(self, worker):
        """记录停止一个工作线程，直到其真正结束。"""
        if not worker: return
        try:
            # 断开所有信号，防止已弃用的线程再向前端发送消息
            worker.finished.disconnect()
            worker.error.disconnect()
            if hasattr(worker, 'progress'): worker.progress.disconnect()
        except: pass
        
        worker.stop()
        self._zombie_workers.append(worker)
        # 等到工作线程真正结束（由于子进程可能需要时间 terminate），再从僵尸列表中移除
        worker.finished.connect(lambda *args: self._cleanup_zombie(worker))
        worker.error.connect(lambda *args: self._cleanup_zombie(worker))
        if not worker.isRunning():
            self._cleanup_zombie(worker)

    def _cleanup_zombie(self, worker):
        if worker in self._zombie_workers:
            self._zombie_workers.remove(worker)

    def _get_rg_path(self):
        """获取 ripgrep 可执行文件的路径，考虑打包和开发环境。"""
        # 处理 PyInstaller 打包后的路径
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        # 1. 检查 bin 目录（打包后的结构）
        bundled_bin = os.path.join(base_dir, "bin", "windows" if platform.system() == "Windows" else "linux")
        
        # 2. 检查父目录的 bin（开发模式结构）
        dev_bin = os.path.join(os.path.dirname(base_dir), "bin", "windows" if platform.system() == "Windows" else "linux")
        
        path_to_check = bundled_bin if os.path.exists(bundled_bin) else dev_bin
        
        exe = "rg.exe" if platform.system() == "Windows" else "rg"
        return os.path.join(path_to_check, exe)

    @pyqtSlot(str, str, result=bool)
    def open_file(self, file_id: str, file_path: str) -> bool:
        """
        打开并索引日志文件 (Open and Index)。
        这是在前端选择文件后的第一步。
        """
        try:
            # 如果session已存在，先关闭（防止内存泄漏）
            if file_id in self._sessions:
                self._sessions[file_id].close(self)
            
            path = Path(file_path)
            if not path.exists(): return False
            
            session = LogSession(file_id, path)
            # 使用 open() 而不是 os.open() 以获得更好的 Windows 文件共享支持
            session.file_obj = open(path, 'rb')
            session.fd = session.file_obj.fileno()
            session.size = path.stat().st_size
            
            # 处理空文件
            if session.size == 0:
                session.line_offsets = array.array('Q')
                self._sessions[file_id] = session
                self.fileLoaded.emit(file_id, json.dumps({
                    "name": path.name, "size": 0, "lineCount": 0
                }))
                return True
            
            # 使用内存映射 (mmap) 技术，高效读取大文件
            session.mmap = mmap.mmap(session.fd, 0, access=mmap.ACCESS_READ)
            self._sessions[file_id] = session
            
            # 启动后台索引线程 (IndexingWorker)
            # 这一步是为了快速建立 "行号 -> 文件偏移量" 的映射，
            # 让我们之后可以瞬间跳转到第 100 万行。
            self.operationStarted.emit(file_id, "indexing")
            worker = IndexingWorker(session.mmap, session.size)
            session.workers['indexing'] = worker
            
            worker.finished.connect(lambda offsets: self._on_indexing_finished(file_id, offsets))
            worker.progress.connect(lambda p: self.operationProgress.emit(file_id, "indexing", p))
            worker.error.connect(lambda e: self.operationError.emit(file_id, "indexing", e))
            worker.start()
            
            return True
        except Exception as e:
            print(f"Error opening file: {e}")
            return False

    def _on_indexing_finished(self, file_id, offsets):
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        session.line_offsets = offsets
        session.visible_indices = None
        session.search_matches = None
        session.cache.clear()
        
        self.fileLoaded.emit(file_id, json.dumps({
            "name": Path(session.path).name,
            "size": session.size,
            "lineCount": len(offsets)
        }))
        print(f"Session {file_id}: {len(offsets)} lines indexed")

    @pyqtSlot(str, str, str, result=bool)
    def sync_all(self, file_id: str, layers_json: str, search_json: str) -> bool:
        """Consolidated update to prevent race conditions between layers and search."""
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        try:
            session.layers = json.loads(layers_json)
            session.search_config = json.loads(search_json) if search_json else None
            
            # Identify instances for all enabled layers
            session.layer_instances = []
            for l_conf in session.layers:
                if l_conf.get('enabled'):
                    inst = self._registry.create_layer_instance(l_conf['type'], l_conf['config'])
                    if inst:
                        inst.id = l_conf.get('id')
                        session.layer_instances.append(inst)

            # Update highlights immediately for read_processed_lines
            # Legacy manual highlight extraction removed in favor of layer.highlight_line()
            session.highlight_patterns = []

            # Start pipeline with instances
            self._start_pipeline(file_id, session.layer_instances)
            return True
        except Exception as e:
            print(f"Sync all error: {file_id}: {e}")
            return False

    def _get_filter_configs(self, layers):
        """Extracts filter configurations from layers."""
        configs = []
        for l in layers:
            if not l.get('enabled'): continue
            if l['type'] == 'FILTER':
                q = l['config'].get('query', '')
                if q:
                    configs.append({
                        'query': q,
                        'regex': l['config'].get('regex', False),
                        'caseSensitive': l['config'].get('caseSensitive', False)
                    })
            elif l['type'] == 'LEVEL':
                levels = l['config'].get('levels', [])
                if levels:
                    q = f"\\b({'|'.join(map(re.escape, levels))})\\b"
                    configs.append({'query': q, 'regex': True, 'caseSensitive': True})
        return configs

    def _start_pipeline(self, file_id, layer_instances):
        if file_id not in self._sessions: return
        session = self._sessions[file_id]

        # Retire any existing pipeline/stats workers
        if 'pipeline' in session.workers:
            self._retire_worker(session.workers['pipeline'])
            del session.workers['pipeline']
        if 'stats' in session.workers:
            self._retire_worker(session.workers['stats'])
            del session.workers['stats']

        # Start Pipeline
        # If there are no filters and no search, we just emit the full file as filtered.
        if not layer_instances and not (session.search_config and session.search_config.get('query')):
            session.visible_indices = None
            session.search_matches = None
            session.cache.clear()
            self.pipelineFinished.emit(file_id, len(session.line_offsets), 0)
            self.operationStatusChanged.emit(file_id, "ready", 100)
        else:
            self.operationStarted.emit(file_id, "pipeline")
            worker = PipelineWorker(self._rg_path, session.path, layer_instances, session.search_config)
            session.workers['pipeline'] = worker
            worker.finished.connect(lambda indices, matches: self._on_pipeline_finished(file_id, indices, matches))
            worker.error.connect(lambda e: self.operationError.emit(file_id, "pipeline", e))
            worker.start()

        # Start Stats (Currently using legacy logic, will unify later)
        if any(l.get('enabled') and l.get('type') in ['HIGHLIGHT', 'FILTER', 'LEVEL'] for l in session.layers):
            stat_worker = StatsWorker(self._rg_path, session.layer_instances, session.path, len(session.line_offsets))
            session.workers['stats'] = stat_worker
            stat_worker.finished.connect(lambda stats: self.statsFinished.emit(file_id, stats))
            stat_worker.start()
        else:
            self.statsFinished.emit(file_id, json.dumps({}))

    @pyqtSlot(result=str)
    def get_layer_registry(self) -> str:
        """Returns the available layer types and their schemas."""
        return json.dumps(self._registry.get_all_types())

    @pyqtSlot(result=bool)
    def reload_plugins(self) -> bool:
        """Reloads Python plugins from disk."""
        self._registry.discover_plugins()
        return True

    def _on_pipeline_finished(self, file_id, visible_indices, search_matches):
        """流水线运行结束的回调"""
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        
        session.visible_indices = visible_indices
        session.search_matches = search_matches
        
        # indices_len 是过滤后总行数
        # matches_len 是搜索命中的次数
        indices_len = len(visible_indices) if visible_indices is not None else len(session.line_offsets)
        matches_len = len(search_matches) if search_matches is not None else 0
            
        session.cache.clear() # 刷新缓存，确保显示的是过滤后的内容
        self.pipelineFinished.emit(file_id, indices_len, matches_len)
        self.operationStatusChanged.emit(file_id, "ready", 100)

    @pyqtSlot(str, int, result=int)
    def get_search_match_index(self, file_id: str, rank: int) -> int:
        """根据搜索命中的排名 (第几处) 返回其在 LogViewer 中的虚拟行号"""
        if file_id not in self._sessions: return -1
        session = self._sessions[file_id]
        if session.search_matches is None or rank < 0 or rank >= len(session.search_matches):
            return -1
        return session.search_matches[rank]

    @pyqtSlot(str, int, int, result=str)
    def get_search_matches_range(self, file_id: str, start_rank: int, count: int) -> str:
        """返回搜索结果索引范围（用于批量处理）"""
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        if session.search_matches is None: return "[]"
        
        start = max(0, start_rank)
        end = min(len(session.search_matches), start + count)
        if start >= end: return "[]"
        
        return json.dumps(session.search_matches[start:end].tolist())
        
    @pyqtSlot(str, int, int, result=str)
    def read_processed_lines(self, file_id: str, start_line: int, count: int) -> str:
        """
        读取处理后的行 (Read Processed Lines)。
        前端 LogViewer 滚动时会不断调用此方法来获取要显示的内容。
        这是虚拟滚动的关键：只读取视口内的数据。
        """
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        
        try:
            # 防御性检查：确保 mmap 可用
            if session.mmap is None: return "[]"
            # 健康检查：访问 len() 可以在 mmap 已关闭时抛出错误
            _ = len(session.mmap) 
            
            if start_line < 0: return "[]"
            
            results = []
            # Safety: use a local snapshot of indices to avoid race conditions during updates
            v_indices = session.visible_indices
            offsets = session.line_offsets
            total = len(v_indices) if v_indices is not None else len(offsets)
            
            end_idx = min(start_line + count, total)
            
            for i in range(start_line, end_idx):
                if i in session.cache:
                    results.append(session.cache[i]); continue
                
                try:
                    real_idx = v_indices[i] if v_indices is not None else i
                    if real_idx >= len(offsets): continue
                        
                    start_off = offsets[real_idx]
                    end_off = offsets[real_idx + 1] if real_idx + 1 < len(offsets) else session.size
                    
                    chunk = session.mmap[start_off:end_off]
                    if len(chunk) > 10000: chunk = chunk[:10000] + b"... [truncated]"
                    content = chunk.decode('utf-8', errors='replace').rstrip('\r\n')
                    
                    highlights = []
                    
                    # Apply Logic Stage Transformations (ReplaceLayer etc.)
                    # We reuse the instances from the session
                    # Note: We do NOT filter here, as indices are already determined by the pipeline.
                    # We only apply transformations.
                    logic_layers = [l for l in session.layer_instances if l.stage == LayerStage.LOGIC]
                    
                    for layer in logic_layers:
                        content = layer.process_line(content)

                    # Highlight layers (Decor Stage or just Logic Stage logic like HighlightLayer)
                    for layer in reversed(session.layer_instances):
                        hls = layer.highlight_line(content)
                        if hls: highlights.extend(hls)
                    
                    # 2. Add volatile highlight for the active search query
                    if session.search_config and session.search_config.get('query'):
                        sc = session.search_config
                        try:
                            flags = re.IGNORECASE if not sc.get('caseSensitive') else 0
                            pattern = sc['query'] if sc.get('regex') else re.escape(sc['query'])
                            search_re = re.compile(pattern, flags)
                            for m in search_re.finditer(content):
                                highlights.append({
                                    "start": m.start(), "end": m.end(),
                                    "color": "#facc15", "opacity": 100,
                                    "isSearch": True
                                })
                        except: pass
                    
                    line_data = {"index": real_idx, "content": content, "highlights": highlights}
                    if len(session.cache) < 5000: session.cache[i] = line_data
                    results.append(line_data)
                except (IndexError, ValueError):
                    continue # Skip problematic lines during transitions
                    
            return json.dumps(results)
        except (ValueError, RuntimeError) as e:
            # Handle closed mmap or other session-level errors
            print(f"Session error for {file_id}: {e}")
            return "[]"

    @pyqtSlot()
    def ready(self):
        """Called by frontend when it is fully initialized."""
        self.frontendReady.emit()

    @pyqtSlot(str, str, bool, bool, result=bool)
    def search_ripgrep(self, file_id: str, query: str, regex: bool = False, case_sensitive: bool = False) -> bool:
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        
        # If query is empty, it effectively clears the search
        if not query:
            session.search_config = None
        else:
            session.search_config = {"query": query, "regex": regex, "caseSensitive": case_sensitive}
        
        # Trigger pipeline with the latest instances
        self._start_pipeline(file_id, session.layer_instances)
        return True

    @pyqtSlot(str)
    def close_file(self, file_id: str):
        if file_id in self._sessions:
            session = self._sessions[file_id]
            session.close(self)
            del self._sessions[file_id]

    @pyqtSlot(result=str)
    def select_files(self) -> str:
        """Helper for frontend to trigger native open (multiple). Returns JSON list of paths."""
        from qt_compat import QFileDialog, QApplication
        parent = QApplication.activeWindow()
        paths, _ = QFileDialog.getOpenFileNames(parent, "Open Log Files", "", "Log Files (*.log *.txt *.json);;All Files (*)")
        return json.dumps(paths)

    @pyqtSlot(result=str)
    def select_folder(self) -> str:
        """Helper for frontend to trigger native folder selection."""
        from qt_compat import QFileDialog, QApplication
        parent = QApplication.activeWindow()
        path = QFileDialog.getExistingDirectory(parent, "Select Folder", "")
        return path

    @pyqtSlot(str, result=str)
    def list_logs_in_folder(self, folder_path: str) -> str:
        """递归列出文件夹下的所有日志文件"""
        return json.dumps(get_log_files_recursive(folder_path))

    @pyqtSlot(str, result=str)
    def list_directory(self, folder_path: str) -> str:
        """列出目录下的文件和文件夹（单层）"""
        return json.dumps(get_directory_contents(folder_path))

    @pyqtSlot(str, str, result=bool)
    def save_workspace_config(self, folder_path: str, config_json: str) -> bool:
        """将当前工作状态保存到指定目录的 .loglayer/config.json"""
        try:
            config_dir = Path(folder_path) / ".loglayer"
            config_dir.mkdir(parents=True, exist_ok=True)
            config_file = config_dir / "config.json"
            
            with open(config_file, 'w', encoding='utf-8') as f:
                f.write(config_json)
            
            print(f"[Workspace] Saved config to {config_file}")
            return True
        except Exception as e:
            print(f"[Workspace] Error saving config: {e}")
            return False

    @pyqtSlot(str, result=str)
    def load_workspace_config(self, folder_path: str) -> str:
        """从指定目录加载工作状态"""
        try:
            config_file = Path(folder_path) / ".loglayer" / "config.json"
            if not config_file.exists():
                return ""
            
            with open(config_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            print(f"[Workspace] Loaded config from {config_file}")
            return content
        except Exception as e:
            print(f"[Workspace] Error loading config: {e}")
            return ""
