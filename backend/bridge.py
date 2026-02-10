import os
import sys
import mmap
import array
import json
import re
import subprocess
import threading
import time
import webview
import platform
from pathlib import Path
import importlib
from concurrent.futures import ThreadPoolExecutor

try:
    import tkinter as tk
    from tkinter import filedialog
except ImportError:
    tk = None

from loglayer.registry import LayerRegistry
from loglayer.core import LayerStage, LayerCategory, ProcessedLine
from search_mixin import SearchMixin

# Constants
PROCESS_CLEANUP_TIMEOUT = 0.3  # Seconds to wait for process termination before killing

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
        items.sort(key=lambda x: (not x['isDir'], x['name'].lower()))
    except Exception as e:
        print(f"Error listing directory {folder_path}: {e}")
    return items

class Signal:
    """A simple replacement for pyqtSignal."""
    def __init__(self, *types):
        self._callbacks = []
    def connect(self, callback):
        if callback not in self._callbacks: self._callbacks.append(callback)
    def disconnect(self, callback=None):
        if callback is None: self._callbacks = []
        elif callback in self._callbacks: self._callbacks.remove(callback)
    def emit(self, *args):
        for callback in self._callbacks:
            try: 
                callback(*args)
            except Exception as e: 
                print(f"Error in signal callback: {e}")

class CustomThread:
    """A replacement for QThread using threading.Thread."""
    def __init__(self):
        self._thread = None
        self._is_running = False
    def start(self):
        self._is_running = True
        self._thread = threading.Thread(target=self.run, daemon=True)
        self._thread.start()
    def isRunning(self):
        return self._thread and self._thread.is_alive()
    def stop(self): self._is_running = False
    def wait(self, timeout=None):
        if self._thread: self._thread.join(timeout=timeout)
    def run(self): raise NotImplementedError()

class IndexingWorker(CustomThread):
    def __init__(self, mmap_obj, size):
        super().__init__()
        self.finished = Signal(object)
        self.progress = Signal(float)
        self.error = Signal(str)
        self.mmap = mmap_obj
        self.size = size
        self._is_running = True

    def run(self):
        try:
            # Using re.finditer on mmap is significantly faster in Python as it's implemented in C.
            # Even for extremely large files, it avoids the GIL bottleneck of Python loops.
            start_time = time.time()
            offsets = array.array('Q', [0])
            for m in re.finditer(b'\n', self.mmap):
                if not self._is_running: return
                offsets.append(m.start() + 1)
            
            if len(offsets) > 1 and offsets[-1] >= self.size:
                offsets.pop()
            
            print(f"[Indexing] Finished in {time.time() - start_time:.4f}s")
            self.finished.emit(offsets)
        except Exception as e:
            self.error.emit(str(e))

class PipelineWorker(CustomThread):
    def __init__(self, rg_path, file_path, layers, search_config=None):
        super().__init__()
        self.finished = Signal(object, object)
        self.progress = Signal(float)
        self.error = Signal(str)
        self.rg_path = rg_path
        self.file_path = file_path
        self.layers = layers
        self.search = search_config
        self._is_running = True
        self._processes = []

    def run(self):
        try:
            native_layers = [l for l in self.layers if l.stage == LayerStage.NATIVE]
            logic_layers = [l for l in self.layers if l.stage == LayerStage.LOGIC]
            
            # 1. Independent search match calculation to avoid filtering the view
            matching_physicals = set()
            if self.search and self.search.get('query'):
                search_cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"]
                if self.search.get('regex'): search_cmd.append("-e")
                else: search_cmd.append("-F")
                if not self.search.get('caseSensitive'): search_cmd.append("-i")
                if self.search.get('wholeWord'): search_cmd.append("-w")
                search_cmd.append(self.search['query'])
                search_cmd.append(self.file_path)
                
                try:
                    sp = subprocess.Popen(search_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=False, creationflags=get_creationflags())
                    if sp.stdout:
                        for match_line_bytes in sp.stdout:
                            if not self._is_running: break
                            match_line = match_line_bytes.decode('utf-8', errors='replace')
                            parts = match_line.split(':', 1)
                            if parts[0].isdigit():
                                matching_physicals.add(int(parts[0]) - 1)
                    sp.wait(timeout=5)
                except Exception as e:
                    print(f"[Pipeline] Search match calculation error: {e}")

            # 2. Quick Exit: If no filters at all, everything is visible
            if not native_layers and not logic_layers:
                visible_indices = None
                search_matches = array.array('I', sorted(list(matching_physicals))) if matching_physicals else array.array('I')
                if self._is_running:
                    self.finished.emit(visible_indices, search_matches)
                return

            # 3. Build Visibility Pipeline (NOT including global search)
            cmd_chain = []
            
            def build_rg_cmd(args, is_first, is_last_native):
                cmd = [self.rg_path, "--no-heading", "--no-filename", "--color", "never"]
                if is_first:
                    cmd.append("--line-number")
                

                
                cmd.extend(args)
                if is_first:
                    cmd.append(self.file_path)
                else:
                    cmd.append("-")
                return cmd

            for i, layer in enumerate(native_layers):
                rg_args = layer.get_rg_args()
                if not rg_args: continue
                is_first = len(cmd_chain) == 0
                is_last_native = (i == len(native_layers) - 1)
                cmd_chain.append(build_rg_cmd(rg_args, is_first, is_last_native))
            
            if not cmd_chain:
                # Still need a process to feed the lines if we have logic layers but no native layers
                cmd_chain.append(build_rg_cmd([""], True, True))

            self._processes = []
            last_stdout = None
            for i, cmd in enumerate(cmd_chain):
                p = subprocess.Popen(cmd, stdin=last_stdout if i > 0 else None, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1024*1024, creationflags=get_creationflags())
                self._processes.append(p)
                if i > 0 and last_stdout: last_stdout.close()
                last_stdout = p.stdout
            
            for l in logic_layers: l.reset()
            visible_indices = array.array('I')
            search_matches = array.array('I')
            v_idx = 0
            line_count = 0
            
            if last_stdout:
                for line_bytes in last_stdout:
                    if not self._is_running: break
                    line_str = line_bytes.decode('utf-8', errors='ignore')
                    parts = line_str.split(':', 1)
                    if len(parts) < 2: continue
                    try:
                        physical_idx = int(parts[0]) - 1
                        content = parts[1]
                    except ValueError: continue
                    
                    is_visible = True
                    if logic_layers:
                        for layer in logic_layers:
                            res = layer.process_line(content)
                            content = res.content if isinstance(res, ProcessedLine) else res
                            if not layer.filter_line(content, index=physical_idx):
                                is_visible = False
                                break
                    
                    if is_visible:
                        visible_indices.append(physical_idx)
                        if physical_idx in matching_physicals:
                            search_matches.append(v_idx)
                        v_idx += 1
                    
                    line_count += 1
                    if line_count % 10000 == 0: self.progress.emit(0)
            
            if self._is_running:
                self.finished.emit(visible_indices, search_matches)

        except Exception as e:
            if self._is_running: self.error.emit(str(e))
        finally:
            self._cleanup_processes()
    
    def _cleanup_processes(self, timeout=PROCESS_CLEANUP_TIMEOUT):
        """安全清理所有子进程"""
        # 第一遍: 发送 terminate 信号
        for p in self._processes:
            try:
                if p.poll() is None:
                    p.terminate()
            except:
                pass
        # 第二遍: 等待进程退出，超时则强制 kill
        for p in self._processes:
            try:
                p.wait(timeout=timeout)
            except:
                try:
                    p.kill()  # 强制杀死僵尸进程
                except:
                    pass
        self._processes = []

class StatsWorker(CustomThread):
    def __init__(self, rg_path, layers, file_path, total_lines):
        super().__init__()
        self.finished = Signal(str)
        self.error = Signal(str)
        self.rg_path = rg_path
        self.layers = layers
        self.file_path = file_path
        self.total_lines = max(1, total_lines)
        self._is_running = True
        self._processes = []

    def run(self):
        try:
            results = {}
            active_filters = []
            tasks = []
            for layer in self.layers:
                if not self._is_running: break
                l_id = getattr(layer, 'id', None)
                if not l_id: continue
                q_conf = None
                if hasattr(layer, 'query') and layer.query:
                    q_conf = {'query': layer.query, 'regex': getattr(layer, 'regex', False), 'caseSensitive': getattr(layer, 'caseSensitive', False)}
                if layer.__class__.__name__ == 'LevelLayer':
                    lvls = getattr(layer, 'levels', [])
                    if lvls: q_conf = {'query': f"\\b({'|'.join(map(re.escape, lvls))})\\b", 'regex': True, 'caseSensitive': True}
                current_filters = list(active_filters)
                if getattr(layer, "enabled", True) and layer.__class__.__name__ in ['FilterLayer', 'LevelLayer'] and q_conf:
                    active_filters.append(q_conf)
                if not q_conf: continue
                tasks.append((layer, l_id, q_conf, current_filters))
            with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as executor:
                future_to_lid = {}
                for layer, l_id, q_conf, filters in tasks:
                    future_to_lid[executor.submit(self._run_layer_stats, l_id, q_conf, filters)] = l_id
                for future in future_to_lid:
                    if not self._is_running: break
                    try:
                        lid, res = future.result()
                        if lid and res: results[lid] = res
                    except Exception as e: print(f"Stats task error: {e}")
            if self._is_running: self.finished.emit(json.dumps(results))
        except Exception as e:
            if self._is_running: self.error.emit(str(e))

    def _run_layer_stats(self, l_id, q_conf, parent_filters):
        if not self._is_running: return None, None
        cmd_chain = []
        for f in parent_filters:
            c = [self.rg_path, "--no-heading", "--no-filename", "--color", "never"]
            if not f.get('caseSensitive'): c.append("-i")
            if not f.get('regex'): c.append("-F")
            c.append(f['query'])
            cmd_chain.append(c)
        final_cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"]
        if not q_conf.get('caseSensitive'): final_cmd.append("-i")
        if not q_conf.get('regex'): final_cmd.append("-F")
        final_cmd.append(q_conf['query'])
        count = 0
        distribution = [0] * 20
        procs = []
        try:
            if not cmd_chain:
                final_cmd.append(self.file_path)
                p_final = subprocess.Popen(final_cmd, stdout=subprocess.PIPE, text=True, errors='ignore', creationflags=get_creationflags())
                procs.append(p_final)
            else:
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
            for p in procs:
                try: p.terminate(); p.wait(timeout=0.1)
                except: pass
        except Exception: pass
        max_val = max(distribution) if any(v > 0 for v in distribution) else 0
        norm_dist = [v / max_val if max_val > 0 else 0 for v in distribution]
        return l_id, {"count": count, "distribution": norm_dist}

class LogSession:
    def __init__(self, file_id, path, provider=None):
        self.id = file_id
        self.path = str(path)
        self.provider = provider
        self.file_obj = None
        self.mmap = None
        self.size = 0
        self.line_offsets = array.array('Q')
        self.visible_indices = None
        self.search_matches = None
        self.layers = []
        self.layer_instances = []      # 处理层实例
        self.rendering_instances = []  # 渲染层实例
        self.search_config = None 
        self.cache = {}
        self.workers = {}

    def close(self, bridge=None):
        for name, worker in list(self.workers.items()):
            if bridge: bridge._retire_worker(worker)
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

class FileBridge(SearchMixin):
    fileLoaded = Signal(str, str)
    pipelineFinished = Signal(str, int, int)
    statsFinished = Signal(str, str)
    operationStarted = Signal(str, str)
    operationProgress = Signal(str, str, float)
    operationError = Signal(str, str, str)
    operationStatusChanged = Signal(str, str, int)
    pendingFilesCount = Signal(int)
    frontendReady = Signal()
    workspaceOpened = Signal(str)
    
    def __init__(self):
        super().__init__()
        self._sessions = {}
        self._registry = LayerRegistry()
        self._rg_path = self._get_rg_path()
        self.executor = ThreadPoolExecutor(max_workers=4)
        self._zombie_workers = []
        self._zombie_cleanup_counter = 0  # 清理计数器
        plugin_dir = os.path.join(os.getcwd(), "backend", "plugins")
        self._registry = LayerRegistry(plugin_dir)
        self._registry.discover_plugins()

    def get_platform_info(self) -> str:
        """Returns the current operating system name."""
        return platform.system()

    def _retire_worker(self, worker):
        if not worker: return
        try:
            worker.finished.disconnect()
            worker.error.disconnect()
            if hasattr(worker, 'progress'): worker.progress.disconnect()
        except: pass
        worker.stop()
        self._zombie_workers.append(worker)
        worker.finished.connect(lambda *args: self._cleanup_zombie(worker))
        worker.error.connect(lambda *args: self._cleanup_zombie(worker))
        if not worker.isRunning(): self._cleanup_zombie(worker)

    def _cleanup_zombie(self, worker):
        """清理已完成的 zombie worker"""
        if worker in self._zombie_workers:
            self._zombie_workers.remove(worker)
        # 定期清理：每 10 次调用后检查并清理过期的 zombie workers
        self._zombie_cleanup_counter += 1
        if self._zombie_cleanup_counter >= 10:
            self._zombie_cleanup_counter = 0
            self._zombie_workers = [w for w in self._zombie_workers if w.isRunning()]
            if len(self._zombie_workers) > 20:
                print(f"[Warning] {len(self._zombie_workers)} zombie workers still running")

    def _get_rg_path(self):
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'): base_dir = sys._MEIPASS
        else: base_dir = os.path.dirname(os.path.abspath(__file__))
        bundled_bin = os.path.join(base_dir, "bin", "windows" if platform.system() == "Windows" else "linux")
        dev_bin = os.path.join(os.path.dirname(base_dir), "bin", "windows" if platform.system() == "Windows" else "linux")
        path_to_check = bundled_bin if os.path.exists(bundled_bin) else dev_bin
        exe = "rg.exe" if platform.system() == "Windows" else "rg"
        return os.path.join(path_to_check, exe)

    def open_file(self, file_id: str, file_path: str) -> bool:
        try:
            if file_id in self._sessions: self._sessions[file_id].close(self)
            
            provider = self._registry.storage.get_provider(file_path)
            session = LogSession(file_id, file_path, provider)
            
            session.size = provider.get_size(file_path)
            session.file_obj = provider.open(file_path)
            if session.size == 0:
                session.line_offsets = array.array('Q')
                self._sessions[file_id] = session
                self.fileLoaded.emit(file_id, json.dumps({"name": provider.get_name(file_path), "size": 0, "lineCount": 0}))
                return True
            
            session.mmap = provider.get_mmap(file_path)
            self._sessions[file_id] = session
            self.operationStarted.emit(file_id, "indexing")
            
            # TODO: Handle non-mmap workers for remote providers
            worker = IndexingWorker(session.mmap or session.file_obj, session.size)
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
        session.cache.clear()
        name = session.provider.get_name(session.path) if session.provider else Path(session.path).name
        self.fileLoaded.emit(file_id, json.dumps({"name": name, "size": session.size, "lineCount": len(offsets)}))

    def sync_all(self, file_id: str, layers_json: str, search_json: str) -> bool:
        """Legacy API - delegates to sync_layers for backward compatibility"""
        return self.sync_layers(file_id, layers_json, search_json)

    def _merge_system_layers(self, session, new_layers: list) -> list:
        """保持 session 中既有的系统托管图层（如书签）不被前端同步覆盖"""
        system_layers = [l for l in session.layers if l.get('isSystemManaged')]
        incoming_ids = {l.get('id') for l in new_layers}
        for sl in system_layers:
            if sl.get('id') not in incoming_ids:
                new_layers.append(sl)
        return new_layers

    def sync_layers(self, file_id: str, layers_json: str, search_json: str) -> bool:
        """
        同步处理层配置。
        触发完整的 PipelineWorker 重新计算可见行。
        """
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        try:
            incoming = json.loads(layers_json)
            session.layers = self._merge_system_layers(session, incoming)
            session.search_config = json.loads(search_json) if search_json else None
            
            # 分离处理层和渲染层实例
            session.layer_instances = []
            session.rendering_instances = []
            
            for l_conf in session.layers:
                if l_conf.get('enabled'):
                    inst = self._registry.create_layer_instance(l_conf['type'], l_conf['config'])
                    if inst:
                        inst.id = l_conf.get('id')
                        # 根据类别分类
                        if self._registry.is_rendering_layer(l_conf['type']):
                            session.rendering_instances.append(inst)
                        else:
                            session.layer_instances.append(inst)
            
            # 只传递处理层给 Pipeline
            self._start_pipeline(file_id, session.layer_instances)
            return True
        except Exception as e:
            print(f"Sync layers error: {file_id}: {e}")
            self.operationError.emit(file_id, "sync", str(e))
            self.operationStatusChanged.emit(file_id, "ready", 100)
            return False

    def sync_decorations(self, file_id: str, layers_json: str) -> bool:
        """
        同步渲染层配置。
        只刷新渲染缓存，不重新计算可见行。
        这是一个轻量级操作，用于快速响应高亮/行背景等变更。
        """
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        try:
            incoming = json.loads(layers_json)
            session.layers = self._merge_system_layers(session, incoming)
            
            # 只更新渲染层实例
            session.rendering_instances = []
            for l_conf in session.layers:
                if l_conf.get('enabled') and self._registry.is_rendering_layer(l_conf['type']):
                    inst = self._registry.create_layer_instance(l_conf['type'], l_conf['config'])
                    if inst:
                        inst.id = l_conf.get('id')
                        session.rendering_instances.append(inst)
            
            # 清除渲染缓存，强制下次读取时重新应用渲染层
            session.cache.clear()
            
            # 发送刷新信号 (不改变可见行数)
            indices_len = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
            matches_len = len(session.search_matches) if session.search_matches is not None else 0
            self.pipelineFinished.emit(file_id, indices_len, matches_len)
            
            # 更新统计（仅针对有查询的渲染层）
            if any(hasattr(inst, 'query') and inst.query for inst in session.rendering_instances):
                stat_worker = StatsWorker(self._rg_path, session.rendering_instances, session.path, len(session.line_offsets))
                session.workers['stats'] = stat_worker
                stat_worker.finished.connect(lambda stats: self.statsFinished.emit(file_id, stats))
                stat_worker.start()
            
            return True
        except Exception as e:
            print(f"Sync decorations error: {file_id}: {e}")
            return False

    def _start_pipeline(self, file_id, layer_instances):
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        if 'pipeline' in session.workers: self._retire_worker(session.workers['pipeline'])
        if 'stats' in session.workers: self._retire_worker(session.workers['stats'])
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
        if any(l.get('enabled') and l.get('type') in ['HIGHLIGHT', 'FILTER', 'LEVEL'] for l in session.layers):
            stat_worker = StatsWorker(self._rg_path, session.layer_instances, session.path, len(session.line_offsets))
            session.workers['stats'] = stat_worker
            stat_worker.finished.connect(lambda stats: self.statsFinished.emit(file_id, stats))
            stat_worker.start()
        else: self.statsFinished.emit(file_id, json.dumps({}))

    def get_layer_registry(self) -> str:
        return json.dumps(self._registry.get_all_types())

    def reload_plugins(self) -> bool:
        self._registry.discover_plugins()
        return True

    def _on_pipeline_finished(self, file_id, visible_indices, search_matches):
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        session.visible_indices = visible_indices
        session.search_matches = search_matches
        indices_len = len(visible_indices) if visible_indices is not None else len(session.line_offsets)
        matches_len = len(search_matches) if search_matches is not None else 0
        session.cache.clear()
        self.pipelineFinished.emit(file_id, indices_len, matches_len)
        self.operationStatusChanged.emit(file_id, "ready", 100)

    # Search methods have been moved to SearchMixin
        
    def read_processed_lines(self, file_id: str, start_line: int, count: int) -> str:
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        try:
            if session.mmap is None or session.mmap.closed: return "[]"
            _ = len(session.mmap)  # 验证 mmap 仍然有效
            if start_line < 0: return "[]"
            results = []
            v_indices = session.visible_indices; offsets = session.line_offsets
            total = len(v_indices) if v_indices is not None else len(offsets)
            end_idx = min(start_line + count, total)
            for i in range(start_line, end_idx):
                if i in session.cache: results.append(session.cache[i]); continue
                try:
                    real_idx = v_indices[i] if v_indices is not None else i
                    if real_idx >= len(offsets): continue
                    start_off = offsets[real_idx]
                    end_off = offsets[real_idx + 1] if real_idx + 1 < len(offsets) else session.size
                    chunk = session.mmap[start_off:end_off]
                    if len(chunk) > 10000: chunk = chunk[:10000] + b"... [truncated]"
                    content = chunk.decode('utf-8', errors='replace').replace('\r', '').replace('\n', ' ')
                    
                    # 1. 应用处理层的内容变换
                    highlights = []
                    row_style = {}
                    # 只有 Transform 类型的图层允许修改内容
                    logic_layers = [l for l in session.layer_instances if l.stage == LayerStage.LOGIC]
                    current_offset_map = None

                    for layer in logic_layers:
                        res = layer.process_line(content)
                        if isinstance(res, ProcessedLine):
                            content = res.content
                            # 这里可以累加 offset_map，如果多个转换层叠加
                            if res.offset_map:
                                current_offset_map = res.offset_map
                        else:
                            content = res

                    # 2. 应用渲染层的高亮和行样式
                    # 此时渲染层面对的是已经过滤且转换后的 content
                    rendering_layers = getattr(session, 'rendering_instances', [])
                    for layer in reversed(rendering_layers):
                        hls = layer.highlight_line(content)
                        if hls:
                            # 如果未来需要将高亮映射回原始行，可以使用 current_offset_map
                            highlights.extend(hls)

                        # 获取行样式 (如 RowTintLayer)
                        if hasattr(layer, 'get_row_style'):
                            style = layer.get_row_style(content, index=real_idx) if 'index' in layer.get_row_style.__code__.co_varnames else layer.get_row_style(content)
                            if style: row_style.update(style)
                    
                    # 3. 应用搜索高亮
                    if session.search_config and session.search_config.get('query'):
                        sc = session.search_config
                        try:
                            flags = re.IGNORECASE if not sc.get('caseSensitive') else 0
                            pattern = sc['query'] if sc.get('regex') else re.escape(sc['query'])
                            search_re = re.compile(pattern, flags)
                            for m in search_re.finditer(content):
                                highlights.append({"start": m.start(), "end": m.end(), "color": "#facc15", "opacity": 100, "isSearch": True})
                        except: pass
                    
                    line_data = {"index": real_idx, "content": content, "highlights": highlights}
                    if row_style:
                        line_data["rowStyle"] = row_style
                        # 提升 isBookmarked 到根属性 isMarked
                        # 提升 isMarked 到根属性
                        if row_style.get('isMarked') or row_style.get('isBookmarked'):
                            line_data["isMarked"] = True
                            if 'bookmarkComment' in row_style:
                                line_data["bookmarkComment"] = row_style['bookmarkComment']
                    if len(session.cache) < 5000: session.cache[i] = line_data
                    results.append(line_data)
                except (IndexError, ValueError): continue
            return json.dumps(results)
        except (ValueError, RuntimeError) as e:
            print(f"Session error for {file_id}: {e}")
            return "[]"

    def list_directory(self, folder_path: str) -> str:
        return json.dumps(get_directory_contents(folder_path))

    def save_workspace_config(self, folder_path: str, config_json: str) -> bool:
        try:
            config_dir = Path(folder_path) / ".loglayer"
            config_dir.mkdir(parents=True, exist_ok=True)
            config_file = config_dir / "config.json"
            with open(config_file, 'w', encoding='utf-8') as f: f.write(config_json)
            return True
        except Exception as e:
            print(f"[Workspace] Error saving config: {e}")
            return False

    def load_workspace_config(self, folder_path: str) -> str:
        try:
            config_file = Path(folder_path) / ".loglayer" / "config.json"
            if not config_file.exists(): return ""
            with open(config_file, 'r', encoding='utf-8') as f: return f.read()
        except Exception as e:
            print(f"[Workspace] Error loading config: {e}")
            return ""

    def get_lines_by_indices(self, file_id: str, indices: list) -> str:
        """获取指定索引的行内容（纯文本）"""
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        try:
            if session.mmap is None: return "[]"
            results = []
            offsets = session.line_offsets
            
            for idx in indices[:100]:  # 限制最多100行
                try:
                    if idx < 0 or idx >= len(offsets): continue
                    start_off = offsets[idx]
                    end_off = offsets[idx + 1] if idx + 1 < len(offsets) else session.size
                    chunk = session.mmap[start_off:end_off]
                    if len(chunk) > 200: chunk = chunk[:200]  # 截断为200字符
                    content = chunk.decode('utf-8', errors='replace').replace('\r', '').replace('\n', '').strip()
                    results.append({"index": idx, "text": content})
                except (IndexError, ValueError): continue
            return json.dumps(results)
        except (ValueError, RuntimeError) as e:
            print(f"get_lines_by_indices error for {file_id}: {e}")
            return "[]"

    def ready(self):
        self.frontendReady.emit()

    def search_ripgrep(self, file_id: str, query: str, regex: bool = False, case_sensitive: bool = False) -> bool:
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        if not query: session.search_config = None
        else: session.search_config = {"query": query, "regex": regex, "caseSensitive": case_sensitive}
        self._start_pipeline(file_id, session.layer_instances)
        return True

    def close_file(self, file_id: str):
        if file_id in self._sessions:
            session = self._sessions[file_id]
            session.close(self)
            del self._sessions[file_id]

    def select_files(self) -> str:
        if hasattr(self, 'window'):
            try:
                from webview import FileDialog
                paths = self.window.create_file_dialog(FileDialog.OPEN, allow_multiple=True, file_types=("Log files (*.log;*.txt;*.json)", "All files (*.*)"))
            except Exception as e:
                print(f"[Bridge] select_files error: {e}")
                paths = self.window.create_file_dialog(0, allow_multiple=True, file_types=("Log files (*.log;*.txt;*.json)", "All files (*.*)"))
            return json.dumps(paths if paths else [])
        
        # Fallback to tkinter for browser-only mode
        if tk:
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            paths = filedialog.askopenfilenames(
                title="选择日志文件",
                filetypes=[("Log files", "*.log *.txt *.json"), ("All files", "*.*")]
            )
            root.destroy()
            return json.dumps(list(paths) if paths else [])
            
        return "[]"

    def select_folder(self) -> str:
        if hasattr(self, 'window'):
            try:
                from webview import FileDialog
                path = self.window.create_file_dialog(FileDialog.FOLDER)
            except Exception as e:
                print(f"[Bridge] select_folder error: {e}")
                path = self.window.create_file_dialog(1) # 1 is FOLDER
            return path[0] if path else ""
            
        # Fallback to tkinter for browser-only mode
        if tk:
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            path = filedialog.askdirectory(title="选择项目文件夹")
            root.destroy()
            return path if path else ""
            
        return ""

    def list_logs_in_folder(self, folder_path: str) -> str:
        return json.dumps(get_log_files_recursive(folder_path))

    # SearchMixin provides:
    # get_search_match_index, get_nearest_search_rank, get_search_matches_range,
    # toggle_bookmark, get_bookmarks, get_nearest_bookmark_index, clear_bookmarks,
    # physical_to_visual_index, update_bookmark_comment
