import os
import mmap
import array
import json
import re
import subprocess
import threading
from pathlib import Path
from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal, QThread, pyqtProperty
from concurrent.futures import ThreadPoolExecutor

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
    finished = pyqtSignal(str, str)  # (indices_json, matches_json)
    error = pyqtSignal(str)

    def __init__(self, rg_path, file_path, filter_configs, search_config=None):
        super().__init__()
        self.rg_path = rg_path
        self.file_path = file_path
        self.filters = filter_configs  # List of {query, regex, caseSensitive}
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
            if not self.filters and not self.search:
                self.finished.emit("null", "[]")
                return

            procs = []
            
            # --- Pipeline Construction ---
            # Stage 0: The file reader + first filter with line numbers
            primary = self.filters[0] if self.filters else self.search
            cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"]
            if not primary.get('caseSensitive'): cmd.append("-i")
            if not primary.get('regex'): cmd.append("-F")
            cmd.extend([primary['query'], self.file_path])
            
            print(f"[Pipeline] Start for {self.file_path}, query: {primary.get('query')}, filters: {len(self.filters)}")
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
            procs.append(p)
            current_stdout = p.stdout

            # Subsequent Stages: Must skip the "LINE_NUM:" prefix
            others = self.filters[1:] if self.filters else []
            for f in others:
                pattern = f['query'] if f.get('regex') else re.escape(f['query'])
                case_flag = "(?i)" if not f.get('caseSensitive') else ""
                wrapper_pattern = f"^{case_flag}[^:]*:.*{pattern}"
                
                cmd = [self.rg_path, "--no-heading", "--no-filename", "--color", "never", wrapper_pattern]
                p = subprocess.Popen(cmd, stdin=current_stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
                procs.append(p)
                if current_stdout: current_stdout.close()
                current_stdout = p.stdout
            
            self._processes = procs
            
            # --- Python-side Search Matching ---
            search_re = None
            if self.filters and self.search:
                flags = re.IGNORECASE if not self.search.get('caseSensitive') else 0
                pattern = self.search['query'] if self.search.get('regex') else re.escape(self.search['query'])
                try: 
                    search_re = re.compile(pattern, flags)
                    print(f"[Pipeline] Separate search re compiled: {pattern}")
                except Exception as e: 
                    print(f"[Pipeline] Search re error: {e}")

            visible_indices = array.array('I')
            search_matches = array.array('I')
            v_idx = 0
            
            for line in procs[-1].stdout:
                if not self._is_running: break
                parts = line.split(':', 1)
                if len(parts) >= 2:
                    l_str = parts[0]
                    if l_str.isdigit():
                        real_idx = int(l_str) - 1
                        visible_indices.append(real_idx)
                        
                        # If we have a separate search query, check content only
                        if search_re:
                            if search_re.search(parts[1]):
                                search_matches.append(v_idx)
                        v_idx += 1
                
                # Removed 2M line limit for consistency with stats

            if self._is_running:
                print(f"[Pipeline] Finished. Visible: {len(visible_indices)}, Matches: {len(search_matches)}")
                # Case 1: Search-only (no filters)
                # We show the full file (indices="null") and highlight the physical line numbers found.
                if not self.filters and self.search:
                    self.finished.emit("null", json.dumps(visible_indices.tolist()))
                # Case 2: Filters (+ optional search)
                # We show the filtered results and highlight the virtual indices.
                else:
                    self.finished.emit(json.dumps(visible_indices.tolist()), json.dumps(search_matches.tolist()))
        except Exception as e:
            if self._is_running: self.error.emit(str(e))
        finally:
            for p in procs:
                try: 
                    if p.poll() is None:
                        p.terminate()
                        # Check stderr for the first process if we got no results
                        if p == procs[0] and len(visible_indices) == 0:
                            err = p.stderr.read()
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
            
            for layer in self.layers:
                if not self._is_running: break
                l_id = layer['id']
                
                # We calculate stats for each layer
                # If it's a FILTER/LEVEL, it contributes to the pipeline for subsequent layers
                q_conf = None
                if layer['type'] == 'FILTER':
                    q = layer['config'].get('query')
                    if q: q_conf = {'query': q, 'regex': layer['config'].get('regex'), 'caseSensitive': layer['config'].get('caseSensitive')}
                elif layer['type'] == 'LEVEL':
                    lvls = layer['config'].get('levels', [])
                    if lvls: q_conf = {'query': f"\\b({'|'.join(map(re.escape, lvls))})\\b", 'regex': True, 'caseSensitive': True}
                elif layer['type'] == 'HIGHLIGHT':
                    q = layer['config'].get('query')
                    if q: q_conf = {'query': q, 'regex': layer['config'].get('regex'), 'caseSensitive': layer['config'].get('caseSensitive')}

                if not q_conf: continue

                # Build pipeline for this layer's count
                # Count = How many lines match this layer's query GIVEN all previous enabled filtering layers
                cmd_chain = []
                
                # 1. Add all previous active filters
                for f in active_filters:
                    c = [self.rg_path, "--no-heading", "--no-filename", "--color", "never"]
                    if not f.get('caseSensitive'): c.append("-i")
                    if not f.get('regex'): c.append("-F")
                    c.append(f['query'])
                    cmd_chain.append(c)

                # 2. Add current layer with line numbers
                # Instead of -c, we use --line-number to get distribution too
                final_cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename", "--color", "never"]
                if not q_conf.get('caseSensitive'): final_cmd.append("-i")
                if not q_conf.get('regex'): final_cmd.append("-F")
                final_cmd.append(q_conf['query'])
                
                count = 0
                distribution = [0] * 20
                
                try:
                    self._processes = []
                    if not cmd_chain:
                        # Direct count from file
                        final_cmd.append(self.file_path)
                        p_final = subprocess.Popen(final_cmd, stdout=subprocess.PIPE, text=True, errors='ignore')
                        self._processes.append(p_final)
                    else:
                        # Pipe chain
                        head_cmd = cmd_chain[0] + [self.file_path]
                        p_head = subprocess.Popen(head_cmd, stdout=subprocess.PIPE)
                        self._processes.append(p_head)
                        curr_p = p_head
                        for i in range(1, len(cmd_chain)):
                            p_next = subprocess.Popen(cmd_chain[i], stdin=curr_p.stdout, stdout=subprocess.PIPE)
                            self._processes.append(p_next)
                            curr_p.stdout.close()
                            curr_p = p_next
                        
                        p_final = subprocess.Popen(final_cmd, stdin=curr_p.stdout, stdout=subprocess.PIPE, text=True, errors='ignore')
                        self._processes.append(p_final)
                        curr_p.stdout.close()
                    
                    # Read line numbers and bucket them
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
                    
                    for p in self._processes:
                        try:
                            p.terminate()
                            p.wait(timeout=0.1)
                        except: pass
                    self._processes = []
                except Exception as e:
                    print(f"Stats layer error: {e}")
                    continue

                # Normalize distribution (0.0 to 1.0)
                max_val = max(distribution) if any(v > 0 for v in distribution) else 0
                norm_dist = [v / max_val if max_val > 0 else 0 for v in distribution]

                results[l_id] = {"count": count, "distribution": norm_dist}
                
                # Add to filter chain if it's a filtering layer
                if layer['enabled'] and layer['type'] in ['FILTER', 'LEVEL']:
                    active_filters.append(q_conf)

            if self._is_running:
                self.finished.emit(json.dumps(results))
        except Exception as e:
            if self._is_running: self.error.emit(str(e))

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
        self.visible_indices = None
        self.layers = [] 
        self.search_config = None 
        self.highlight_patterns = []
        self.cache = {}
        self.workers = {} 

    def close(self):
        for w in list(self.workers.values()):
            if w.isRunning():
                w.stop()
                w.wait()
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
    pipelineFinished = pyqtSignal(str, int, str) # (file_id, newTotal, matchesJson)
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
        import platform
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if platform.system() == "Windows":
            return os.path.join(base_path, "bin", "windows", "rg.exe")
        return os.path.join(base_path, "bin", "linux", "rg")

    @pyqtSlot(str, str, result=bool)
    def open_file(self, file_id: str, file_path: str) -> bool:
        """Open and index a log file into a new session."""
        try:
            if file_id in self._sessions:
                self._sessions[file_id].close()
            
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
            
            # Update highlights immediately for read_processed_lines
            session.highlight_patterns = []
            for l in session.layers:
                if l['enabled'] and l['type'] == 'HIGHLIGHT':
                    c = l['config']
                    query = c.get('query', '')
                    if not query: continue
                    try:
                        flags = re.IGNORECASE if not c.get('caseSensitive') else 0
                        pattern = query if c.get('regex') else re.escape(query)
                        session.highlight_patterns.append({
                            'regex': re.compile(pattern, flags),
                            'color': c.get('color', '#ff0000'),
                            'opacity': c.get('opacity', 100)
                        })
                    except: pass

            # Identify filtering layers
            filter_configs = []
            for l in session.layers:
                if not l['enabled']: continue
                if l['type'] == 'FILTER':
                    q = l['config'].get('query', '')
                    if q:
                        filter_configs.append({
                            'query': q,
                            'regex': l['config'].get('regex', False),
                            'caseSensitive': l['config'].get('caseSensitive', False)
                        })
                elif l['type'] == 'LEVEL':
                    levels = l['config'].get('levels', [])
                    if levels:
                        # Map levels to a regex pattern like \b(ERROR|WARN)\b
                        # Ensure levels are escaped for regex if they contain special characters
                        escaped_levels = [re.escape(lvl) for lvl in levels]
                        q = f"\\b({'|'.join(escaped_levels)})\\b"
                        filter_configs.append({'query': q, 'regex': True, 'caseSensitive': True})

            self._start_pipeline(file_id, filter_configs)
            return True
        except Exception as e:
            print(f"Sync all error: {e}")
            return False

    def _start_pipeline(self, file_id, filter_configs):
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
        if not filter_configs and not session.search_config:
            session.visible_indices = None
            session.cache.clear()
            self.pipelineFinished.emit(file_id, len(session.line_offsets), "[]")
            self.operationStatusChanged.emit(file_id, "ready", 100)
        else:
            self.operationStarted.emit(file_id, "pipeline")
            worker = PipelineWorker(self._rg_path, session.path, filter_configs, session.search_config)
            session.workers['pipeline'] = worker
            worker.finished.connect(lambda indices, matches: self._on_pipeline_finished(file_id, indices, matches))
            worker.error.connect(lambda e: self.operationError.emit(file_id, "pipeline", e))
            worker.start()

        # Start Stats (Parallel or sequential? Let's keep it separate for now)
        # Only run stats if there are actual layers to analyze
        if any(l.get('enabled') and l.get('type') in ['HIGHLIGHT', 'FILTER', 'LEVEL'] for l in session.layers):
            stat_worker = StatsWorker(self._rg_path, session.layers, session.path, len(session.line_offsets))
            session.workers['stats'] = stat_worker
            stat_worker.finished.connect(lambda sj: self.statsFinished.emit(file_id, sj))
            stat_worker.start()
        else:
            self.statsFinished.emit(file_id, json.dumps({})) # Emit empty stats if no active layers

    def _on_pipeline_finished(self, file_id, indices_json, matches_json):
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        
        if indices_json == "null":
            session.visible_indices = None
            indices_len = len(session.line_offsets)
        else:
            session.visible_indices = json.loads(indices_json)
            indices_len = len(session.visible_indices)
            
        session.cache.clear()
        self.pipelineFinished.emit(file_id, indices_len, matches_json)
        self.operationStatusChanged.emit(file_id, "ready", 100) # Optional status signal
        
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
                    
                    # 1. Add highlights from defined layers
                    for p in session.highlight_patterns:
                        for m in p['regex'].finditer(content):
                            highlights.append({
                                "start": m.start(), "end": m.end(),
                                "color": p['color'], "opacity": p['opacity']
                            })
                    
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
        
        # Identify filtering layers from current session layers
        filter_configs = []
        for l in session.layers:
            if not l['enabled']: continue
            if l['type'] == 'FILTER':
                q = l['config'].get('query', '')
                if q:
                    filter_configs.append({
                        'query': q,
                        'regex': l['config'].get('regex', False),
                        'caseSensitive': l['config'].get('caseSensitive', False)
                    })
            elif l['type'] == 'LEVEL':
                levels = l['config'].get('levels', [])
                if levels:
                    escaped_levels = [re.escape(lvl) for lvl in levels]
                    q = f"\\b({'|'.join(escaped_levels)})\\b"
                    filter_configs.append({'query': q, 'regex': True, 'caseSensitive': True})

        self._start_pipeline(file_id, filter_configs)
        return True

    @pyqtSlot(str)
    def close_file(self, file_id: str):
        if file_id in self._sessions:
            session = self._sessions[file_id]
            # Retire all workers before deleting session
            for w in list(session.workers.values()):
                self._retire_worker(w)
            session.workers.clear()
            session.close()
            del self._sessions[file_id]

    @pyqtSlot(result=str)
    def select_files(self) -> str:
        """Helper for frontend to trigger native open (multiple). Returns JSON list of paths."""
        from PyQt6.QtWidgets import QFileDialog, QApplication
        parent = QApplication.activeWindow()
        paths, _ = QFileDialog.getOpenFileNames(parent, "Open Log Files", "", "Log Files (*.log *.txt *.json);;All Files (*)")
        return json.dumps(paths)

    @pyqtSlot(result=str)
    def select_folder(self) -> str:
        """Helper for frontend to trigger native folder selection."""
        from PyQt6.QtWidgets import QFileDialog, QApplication
        parent = QApplication.activeWindow()
        path = QFileDialog.getExistingDirectory(parent, "Select Folder", "")
        return path

    @pyqtSlot(str, result=str)
    def list_logs_in_folder(self, folder_path: str) -> str:
        """Lists all log files in a folder recursively."""
        log_files = []
        try:
            for root, dirs, files in os.walk(folder_path):
                for file in files:
                    if file.lower().endswith(('.log', '.txt', '.json')) or '.' not in file:
                        full_path = os.path.join(root, file)
                        try:
                            stats = os.stat(full_path)
                            log_files.append({
                                "name": file,
                                "path": full_path,
                                "size": stats.st_size
                            })
                        except: pass
        except Exception as e:
            print(f"Error listing folder {folder_path}: {e}")
        return json.dumps(log_files)
