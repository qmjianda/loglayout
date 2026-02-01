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
    finished = pyqtSignal(object)  # array.array('Q')
    progress = pyqtSignal(float)
    error = pyqtSignal(str)

    def __init__(self, mmap_obj, size):
        super().__init__()
        self.mmap = mmap_obj
        self.size = size
        self._is_running = True

    def stop(self):
        self._is_running = False

    def run(self):
        try:
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

            total_offsets = array.array('Q', [0])
            for chunk_offsets in results:
                total_offsets.extend(chunk_offsets)
            
            if len(total_offsets) > 1 and total_offsets[-1] >= self.size:
                total_offsets.pop()
                
            self.finished.emit(total_offsets)
        except Exception as e:
            self.error.emit(str(e))

    def _index_chunk(self, start, end):
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
    """Processes a chain of filters followed by an optional search in a single pipeline."""
    finished = pyqtSignal(object, object)  # (indices_array, matches_array)
    progress = pyqtSignal(float) # For logic stage processing
    error = pyqtSignal(str)

    def __init__(self, rg_path, file_path, layers, search_config=None):
        super().__init__()
        self.rg_path = rg_path
        self.file_path = file_path
        self.layers = layers # List of BaseLayer instances
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
            # Stage 1: Native Pipeline (ripgrep)
            cmd_chain = []
            
            # Prepare Native Filters from layers
            native_layers = [l for l in self.layers if l.stage == LayerStage.NATIVE]
            
            # Final search query if present
            s_args = None
            if self.search and self.search.get('query'):
                s_args = []
                if self.search.get('regex'): s_args.append("-e")
                else: s_args.append("-F")
                if not self.search.get('caseSensitive'): s_args.append("-i")
                s_args.append(self.search['query'])

            # Build command chain
            # The FIRST stage always generates line numbers and reads the file
            # Subsequent stages must preserve the "LINE_NUM:" prefix
            
            # If no native layers and no search, we match all
            if not native_layers and not s_args:
                cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never", "", self.file_path])
            else:
                for i, layer in enumerate(native_layers):
                    rg_args = layer.get_rg_args()
                    if not rg_args: continue
                    
                    if i == 0:
                        # First stage: generates line numbers
                        cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"] + rg_args + [self.file_path])
                    else:
                        # Piped stages: must wrap and preserve
                        # We assume the layer provided a simple query or args. 
                        # For simplicity in this unified architecture, we'll try to extract the query.
                        # BUT, a better way is to let the layer decide how to wrap itself or 
                        # have a utility that wraps any rg command to skip prefixes.
                        
                        # Legacy-style wrapping (works if rg_args is like ['-i', '-e/F', 'query'])
                        query = rg_args[-1]
                        is_regex = "-e" in rg_args
                        is_case_insensitive = "-i" in rg_args
                        
                        pattern = query if is_regex else re.escape(query)
                        case_flag = "(?i)" if is_case_insensitive else ""
                        wrapper_pattern = f"^{case_flag}[^:]*:.*{pattern}"
                        
                        cmd_chain.append([self.rg_path, "--no-heading", "--no-filename", "--color", "never", wrapper_pattern, "-"])

                # Add search as final piped stage if it exists
                if s_args:
                    query = s_args[-1]
                    is_regex = "-e" in s_args
                    is_case_insensitive = "-i" in s_args
                    
                    pattern = query if is_regex else re.escape(query)
                    case_flag = "(?i)" if is_case_insensitive else ""
                    wrapper_pattern = f"^{case_flag}[^:]*:.*{pattern}"
                    
                    # If this is the ONLY stage, it needs to read the file
                    if not cmd_chain:
                        cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"] + s_args + [self.file_path])
                    else:
                        cmd_chain.append([self.rg_path, "--no-heading", "--no-filename", "--color", "never", wrapper_pattern, "-"])

            # Fallback: If cmd_chain is empty (e.g. all layers skipped), perform a match-all
            if not cmd_chain:
                cmd_chain.append([self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never", "", self.file_path])

            # ... Execute Pipeline ...
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

            # Stage 2: Logical Processing (Python Filters)
            # Find any logic stage layers
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
                
                if len(parts) < 2: continue # Skip malformed lines (e.g., rg errors)
                
                try:
                    physical_idx = int(parts[0]) - 1
                    content = parts[1]
                except ValueError:
                    continue # Skip if line number is not an integer

                # Apply Logic Stage Filters
                # Apply Logic Stage Filters & Transformations
                is_visible = True
                for layer in logic_layers:
                    # Allow transformation first (e.g. rewrite 'Error' to 'Info' before filtering)
                    content = layer.process_line(content)
                    if not layer.filter_line(content, index=physical_idx):
                        is_visible = False
                        break
                
                if is_visible:
                    visible_indices.append(physical_idx)
                    # If we had a separate search query, the rg pipeline already filtered for it.
                    # So, all lines reaching here are matches.
                    if self.search and self.search.get('query'):
                        search_matches.append(v_idx)
                    v_idx += 1
                
                line_count += 1
                if line_count % 10000 == 0:
                    self.progress.emit(0) # Keep UI alive
            
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
    finished = pyqtSignal(str) # JSON map layerId -> {count, distribution}
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
            
            # Pre-calculate tasks to allow parallel execution
            tasks = []
            
            # We track active filters sequentially 
            for layer in self.layers:
                if not self._is_running: break
                l_id = getattr(layer, 'id', None)
                if not l_id: continue
                
                # Check for query-based layers
                q_conf = None
                
                if hasattr(layer, 'query') and layer.query:
                    q_conf = {
                        'query': layer.query,
                        'regex': getattr(layer, 'regex', False),
                        'caseSensitive': getattr(layer, 'caseSensitive', False)
                    }
                
                # Special handling for LEVEL
                if layer.__class__.__name__ == 'LevelLayer':
                    lvls = getattr(layer, 'levels', [])
                    if lvls:
                         q_conf = {'query': f"\\b({'|'.join(map(re.escape, lvls))})\\b", 'regex': True, 'caseSensitive': True}

                # Capture current state of active_filters (copy)
                current_filters = list(active_filters)
                
                # Add to filter chain if it's a filtering layer
                # This ensures the NEXT layer will see this filter
                if getattr(layer, "enabled", True) and layer.__class__.__name__ in ['FilterLayer', 'LevelLayer'] and q_conf:
                    active_filters.append(q_conf)

                if not q_conf: continue

                # Create a task for this layer
                tasks.append((layer, l_id, q_conf, current_filters))

            # Execute tasks in parallel
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
        """Helper to run rg for a single layer stats."""
        if not self._is_running: return None, None
        
        # Build pipeline
        cmd_chain = []
        
        # 1. Add previous filters
        for f in parent_filters:
            c = [self.rg_path, "--no-heading", "--no-filename", "--color", "never"]
            if not f.get('caseSensitive'): c.append("-i")
            if not f.get('regex'): c.append("-F")
            c.append(f['query'])
            cmd_chain.append(c)

        # 2. Add current layer
        final_cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"]
        if not q_conf.get('caseSensitive'): final_cmd.append("-i")
        if not q_conf.get('regex'): final_cmd.append("-F")
        final_cmd.append(q_conf['query'])
        
        count = 0
        distribution = [0] * 20
        procs = []
        
        try:
            if not cmd_chain:
                # Direct count
                final_cmd.append(self.file_path)
                p_final = subprocess.Popen(final_cmd, stdout=subprocess.PIPE, text=True, errors='ignore', creationflags=get_creationflags())
                procs.append(p_final)
            else:
                # Pipe chain
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
            
            # Track processes (thread safe-ish, just for cleanup if needed, 
            # but here we wait in this thread so it is distinct)
            # Actually, self._processes is shared. We shouldn't use it in threads.
            # Local procs list is fine.

            # Reading
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
            
            # Cleanup
            for p in procs:
                try: 
                    p.terminate() 
                    p.wait(timeout=0.1)
                except: pass

        except Exception as e:
            # print(f"Layer stats error {l_id}: {e}")
            pass
            
        # Normalize
        max_val = max(distribution) if any(v > 0 for v in distribution) else 0
        norm_dist = [v / max_val if max_val > 0 else 0 for v in distribution]

        return l_id, {"count": count, "distribution": norm_dist}

class LogSession:
    """Encapsulates state for a single log file session."""
    def __init__(self, file_id, path):
        self.id = file_id
        self.path = str(path)
        self.file_obj = None
        self.fd = None
        self.mmap = None
        self.size = 0
        self.line_offsets = array.array('Q')
        self.visible_indices = None # array.array('I')
        self.search_matches = None # array.array('I')
        self.layers = [] 
        self.layer_instances = []
        self.search_config = None 
        self.highlight_patterns = []
        self.cache = {}
        self.workers = {} 

    def close(self, bridge=None):
        """Closes the session. If bridge is provided, workers are retired asynchronously."""
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
        elif self.fd: # Fallback
            try: os.close(self.fd)
            except: pass
            self.fd = None

class FileBridge(QObject):
    """Unified Backend: Manages multiple LogSessions."""
    
    # Signals (now include file_id as first argument)
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
        self._zombie_workers = [] # Keep references to stopping workers
        
        plugin_dir = os.path.join(os.getcwd(), "backend", "plugins")
        self._registry = LayerRegistry(plugin_dir)
        self._registry.discover_plugins()

    def _retire_worker(self, worker):
        """Safely move a worker to the zombie list until it finishes."""
        if not worker: return
        try:
            # Disconnect all signals to prevent old workers from emitting
            worker.finished.disconnect()
            worker.error.disconnect()
            if hasattr(worker, 'progress'): worker.progress.disconnect()
        except: pass
        
        worker.stop()
        self._zombie_workers.append(worker)
        # Remove from list when really finished
        worker.finished.connect(lambda *args: self._cleanup_zombie(worker))
        worker.error.connect(lambda *args: self._cleanup_zombie(worker))
        if not worker.isRunning():
            self._cleanup_zombie(worker)

    def _cleanup_zombie(self, worker):
        if worker in self._zombie_workers:
            self._zombie_workers.remove(worker)

    def _get_rg_path(self):
        # Handle PyInstaller frozen state
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        # 1. Check if bin is inside the current directory (bundled or frozen)
        bundled_bin = os.path.join(base_dir, "bin", "windows" if platform.system() == "Windows" else "linux")
        
        # 2. Check if bin is in the parent directory (dev mode)
        dev_bin = os.path.join(os.path.dirname(base_dir), "bin", "windows" if platform.system() == "Windows" else "linux")
        
        path_to_check = bundled_bin if os.path.exists(bundled_bin) else dev_bin
        
        exe = "rg.exe" if platform.system() == "Windows" else "rg"
        return os.path.join(path_to_check, exe)

    @pyqtSlot(str, str, result=bool)
    def open_file(self, file_id: str, file_path: str) -> bool:
        """Open and index a log file into a new session."""
        try:
            if file_id in self._sessions:
                self._sessions[file_id].close(self)
            
            path = Path(file_path)
            if not path.exists(): return False
            
            session = LogSession(file_id, path)
            # Use open() instead of os.open() for better Windows sharing support
            session.file_obj = open(path, 'rb')
            session.fd = session.file_obj.fileno()
            session.size = path.stat().st_size
            
            if session.size == 0:
                session.line_offsets = array.array('Q')
                self._sessions[file_id] = session
                self.fileLoaded.emit(file_id, json.dumps({
                    "name": path.name, "size": 0, "lineCount": 0
                }))
                return True
            
            session.mmap = mmap.mmap(session.fd, 0, access=mmap.ACCESS_READ)
            self._sessions[file_id] = session
            
            # Start background indexing
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
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        
        session.visible_indices = visible_indices
        session.search_matches = search_matches
        
        # In search-only mode (Case 1), visible_indices is None and search_matches 
        # contains the physical indices found.
        # In filtered mode (Case 2), visible_indices contains the virtual->physical mapping,
        # and search_matches contains the ranks within visible_indices.
        
        indices_len = len(visible_indices) if visible_indices is not None else len(session.line_offsets)
        matches_len = len(search_matches) if search_matches is not None else 0
            
        session.cache.clear()
        self.pipelineFinished.emit(file_id, indices_len, matches_len)
        self.operationStatusChanged.emit(file_id, "ready", 100)

    @pyqtSlot(str, int, result=int)
    def get_search_match_index(self, file_id: str, rank: int) -> int:
        """Returns the virtual index of a specific search match rank."""
        if file_id not in self._sessions: return -1
        session = self._sessions[file_id]
        if session.search_matches is None or rank < 0 or rank >= len(session.search_matches):
            return -1
        return session.search_matches[rank]

    @pyqtSlot(str, int, int, result=str)
    def get_search_matches_range(self, file_id: str, start_rank: int, count: int) -> str:
        """Returns a list of search match indices for a given rank range."""
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        if session.search_matches is None: return "[]"
        
        start = max(0, start_rank)
        end = min(len(session.search_matches), start + count)
        if start >= end: return "[]"
        
        return json.dumps(session.search_matches[start:end].tolist())
        
    @pyqtSlot(str, int, int, result=str)
    def read_processed_lines(self, file_id: str, start_line: int, count: int) -> str:
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        
        try:
            # Defensive check for mmap validity
            if session.mmap is None: return "[]"
            # Some operations on a closed mmap don't raise ValueError until accessed
            # We check the size as a health probe
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
        """Lists all log files in a folder recursively."""
        return json.dumps(get_log_files_recursive(folder_path))

    @pyqtSlot(str, result=str)
    def list_directory(self, folder_path: str) -> str:
        """Lists all files and folders in a directory (one level)."""
        return json.dumps(get_directory_contents(folder_path))

    @pyqtSlot(str, str, result=bool)
    def save_workspace_config(self, folder_path: str, config_json: str) -> bool:
        """Save workspace configuration to .loglayer/config.json in the specified folder."""
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
        """Load workspace configuration from .loglayer/config.json in the specified folder."""
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
