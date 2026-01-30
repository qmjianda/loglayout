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

class FilterWorker(QThread):
    finished = pyqtSignal(object)  # array.array('I')
    error = pyqtSignal(str)

    def __init__(self, rg_path, query, file_path):
        super().__init__()
        self.rg_path = rg_path
        self.query = query
        self.file_path = file_path
        self._is_running = True
        self._process = None

    def stop(self):
        self._is_running = False
        if self._process:
            try: self._process.kill()
            except: pass

    def run(self):
        try:
            cmd = [self.rg_path, "-n", "--no-heading", "--no-filename", "-F", self.query, self.file_path]
            self._process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
            stdout, stderr = self._process.communicate()
            
            if not self._is_running: return

            indices = array.array('I')
            for line in stdout.splitlines():
                if not self._is_running: break
                parts = line.split(':', 1)
                if len(parts) >= 1 and parts[0].isdigit():
                    indices.append(int(parts[0]) - 1)
            
            if self._is_running:
                self.finished.emit(indices)
        except Exception as e:
            if self._is_running:
                self.error.emit(str(e))

class SearchWorker(QThread):
    finished = pyqtSignal(str) # JSON list
    error = pyqtSignal(str)

    def __init__(self, rg_path, query, regex, case_sensitive, file_path):
        super().__init__()
        self.rg_path = rg_path
        self.query = query
        self.regex = regex
        self.case_sensitive = case_sensitive
        self.file_path = file_path
        self._is_running = True
        self._process = None

    def stop(self):
        self._is_running = False
        if self._process:
            try: self._process.kill()
            except: pass

    def run(self):
        try:
            cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename"]
            if not self.case_sensitive: cmd.append("-i")
            if not self.regex: cmd.append("-F")
            cmd.extend([self.query, self.file_path])
            
            self._process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
            try:
                stdout, stderr = self._process.communicate(timeout=60)
            except subprocess.TimeoutExpired:
                self._process.kill()
                if self._is_running: self.error.emit("Search timed out")
                return

            if not self._is_running: return

            matches = []
            for line in stdout.splitlines():
                if not self._is_running: break
                parts = line.split(':', 1)
                if len(parts) >= 1 and parts[0].isdigit():
                    matches.append(int(parts[0]) - 1)
                if len(matches) >= 10000: break
            
            if self._is_running:
                self.finished.emit(json.dumps(matches))
        except Exception as e:
            if self._is_running:
                self.error.emit(str(e))

class StatsWorker(QThread):
    finished = pyqtSignal(str) # JSON map layerId -> {count, distribution}
    error = pyqtSignal(str)

    def __init__(self, rg_path, layers, file_path, total_lines):
        super().__init__()
        self.rg_path = rg_path
        self.layers = layers
        self.file_path = file_path
        self.total_lines = total_lines
        self._is_running = True
        self._processes = []

    def stop(self):
        self._is_running = False
        for p in self._processes:
            try: p.kill()
            except: pass

    def run(self):
        try:
            results = {}
            target_layers = [l for l in self.layers if l.get('enabled') and l.get('type') in ['HIGHLIGHT', 'FILTER']]
            
            if self.total_lines <= 0 or not target_layers:
                self.finished.emit(json.dumps({}))
                return

            from concurrent.futures import ThreadPoolExecutor
            num_workers = min(len(target_layers), 4, (os.cpu_count() or 4))
            
            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                futures = {executor.submit(self._get_layer_stats, layer): layer['id'] for layer in target_layers}
                for future in futures:
                    if not self._is_running: break
                    layer_id = futures[future]
                    try:
                        res = future.result()
                        if res: results[layer_id] = res
                    except Exception as e:
                        print(f"Stats worker error for {layer_id}: {e}")
            
            if self._is_running:
                self.finished.emit(json.dumps(results))
        except Exception as e:
            if self._is_running:
                self.error.emit(str(e))

    def _get_layer_stats(self, layer):
        if not self._is_running: return None
        cfg = layer.get('config', {})
        query = cfg.get('query')
        if not query: return None
        
        cmd = [self.rg_path, "--line-number", "--no-heading", "--no-filename"]
        if not cfg.get('caseSensitive'): cmd.append("-i")
        if not cfg.get('regex'): cmd.append("-F")
        cmd.extend([query, self.file_path])
        
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
        self._processes.append(p)
        
        distribution = [0] * 20
        count = 0
        try:
            for line in p.stdout:
                if not self._is_running: break
                parts = line.split(':', 1)
                if parts[0].isdigit():
                    line_num = int(parts[0]) - 1
                    bucket = min(19, int((line_num / self.total_lines) * 20))
                    distribution[bucket] += 1
                    count += 1
            
            p.wait()
            if p in self._processes: self._processes.remove(p)
            
            max_val = max(distribution) if any(v > 0 for v in distribution) else 0
            norm_dist = [v / max_val if max_val > 0 else 0 for v in distribution]
            
            return {"count": count, "distribution": norm_dist}
        except:
            if p in self._processes: self._processes.remove(p)
            try: p.kill()
            except: pass
            return None

class LogSession:
    """Encapsulates state for a single log file session."""
    def __init__(self, file_id, path):
        self.id = file_id
        self.path = str(path)
        self.fd = None
        self.mmap = None
        self.size = 0
        self.line_offsets = array.array('Q')
        self.visible_indices = None
        self.highlight_patterns = []
        self.cache = {}
        self.workers = {} # 'indexing', 'filter', 'search', 'stats'

    def close(self):
        for w in self.workers.values():
            if w.isRunning():
                w.stop()
                w.wait()
        if self.mmap: self.mmap.close()
        if self.fd: os.close(self.fd)

class FileBridge(QObject):
    """Unified Backend: Manages multiple LogSessions."""
    
    # Signals (now include file_id as first argument)
    fileLoaded = pyqtSignal(str, str)  # (file_id, JSON_payload)
    searchFinished = pyqtSignal(str, str)  # (file_id, JSON_payload)
    filterFinished = pyqtSignal(str, int)  # (file_id, newTotal)
    statsFinished = pyqtSignal(str, str)  # (file_id, JSON_payload)
    
    operationStarted = pyqtSignal(str, str) # (file_id, opName)
    operationProgress = pyqtSignal(str, str, float) # (file_id, opName, percent)
    operationError = pyqtSignal(str, str, str) # (file_id, opName, message)
    
    def __init__(self):
        super().__init__()
        self._sessions = {} # file_id -> LogSession
        self._rg_path = self._get_rg_path()

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
            session.fd = os.open(path, os.O_RDONLY)
            session.size = path.stat().st_size
            
            if session.size == 0:
                session.line_offsets = array.array('Q', [0])
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

    @pyqtSlot(str, str, result=bool)
    def sync_layers(self, file_id: str, layers_json: str) -> bool:
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        try:
            layers = json.loads(layers_json)
            session.cache.clear()
            
            # Rebuild Highlights
            session.highlight_patterns = []
            for layer in layers:
                if layer.get('enabled') and layer.get('type') == 'HIGHLIGHT':
                    cfg = layer.get('config', {})
                    query = cfg.get('query')
                    if query:
                        try:
                            flags = re.IGNORECASE if not cfg.get('caseSensitive') else 0
                            pattern = query if cfg.get('regex') else re.escape(query)
                            session.highlight_patterns.append({
                                "regex": re.compile(pattern, flags),
                                "color": cfg.get('color', '#3b82f6'),
                                "opacity": cfg.get('opacity', 100)
                            })
                        except: pass

            # Filter
            filter_query = None
            for layer in layers:
                if layer.get('enabled') and layer.get('type') == 'FILTER':
                    q = layer.get('config', {}).get('query')
                    if q: filter_query = q; break
            
            if filter_query:
                # Stop old filter worker
                if 'filter' in session.workers and session.workers['filter'].isRunning():
                    session.workers['filter'].stop()
                    session.workers['filter'].wait()
                
                self.operationStarted.emit(file_id, "filtering")
                worker = FilterWorker(self._rg_path, filter_query, session.path)
                session.workers['filter'] = worker
                worker.finished.connect(lambda indices: self._on_filter_finished(file_id, indices))
                worker.error.connect(lambda e: self.operationError.emit(file_id, "filtering", e))
                worker.start()
            else:
                session.visible_indices = None
                self.filterFinished.emit(file_id, len(session.line_offsets))

            # Stats
            if 'stats' in session.workers and session.workers['stats'].isRunning():
                session.workers['stats'].stop()
                session.workers['stats'].wait()
            
            worker = StatsWorker(self._rg_path, layers, session.path, len(session.line_offsets))
            session.workers['stats'] = worker
            worker.finished.connect(lambda sj: self.statsFinished.emit(file_id, sj))
            worker.start()
            
            return True
        except Exception as e:
            print(f"Sync error: {e}")
            return False

    def _on_filter_finished(self, file_id, indices):
        if file_id not in self._sessions: return
        session = self._sessions[file_id]
        session.visible_indices = indices
        session.cache.clear()
        self.filterFinished.emit(file_id, len(indices))

    @pyqtSlot(str, int, int, result=str)
    def read_processed_lines(self, file_id: str, start_line: int, count: int) -> str:
        if file_id not in self._sessions: return "[]"
        session = self._sessions[file_id]
        if not session.mmap or start_line < 0: return "[]"
        
        results = []
        total = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
        end_idx = min(start_line + count, total)
        
        for i in range(start_line, end_idx):
            if i in session.cache:
                results.append(session.cache[i]); continue
            
            real_idx = session.visible_indices[i] if session.visible_indices is not None else i
            if real_idx >= len(session.line_offsets): continue
                
            start_off = session.line_offsets[real_idx]
            end_off = session.line_offsets[real_idx + 1] if real_idx + 1 < len(session.line_offsets) else session.size
            
            chunk = session.mmap[start_off:end_off]
            if len(chunk) > 10000: chunk = chunk[:10000] + b"... [truncated]"
            content = chunk.decode('utf-8', errors='replace').rstrip('\r\n')
            
            highlights = []
            for p in session.highlight_patterns:
                for m in p['regex'].finditer(content):
                    highlights.append({
                        "start": m.start(), "end": m.end(),
                        "color": p['color'], "opacity": p['opacity']
                    })
            
            line_data = {"index": real_idx, "content": content, "highlights": highlights}
            if len(session.cache) < 5000: session.cache[i] = line_data
            results.append(line_data)
        return json.dumps(results)

    @pyqtSlot(str, str, bool, bool, result=bool)
    def search_ripgrep(self, file_id: str, query: str, regex: bool = False, case_sensitive: bool = False) -> bool:
        if file_id not in self._sessions: return False
        session = self._sessions[file_id]
        
        if 'search' in session.workers and session.workers['search'].isRunning():
            session.workers['search'].stop()
            session.workers['search'].wait()
        
        self.operationStarted.emit(file_id, "searching")
        worker = SearchWorker(self._rg_path, query, regex, case_sensitive, session.path)
        session.workers['search'] = worker
        worker.finished.connect(lambda sj: self.searchFinished.emit(file_id, sj))
        worker.error.connect(lambda e: self.operationError.emit(file_id, "searching", e))
        worker.start()
        return True

    @pyqtSlot(str)
    def close_file(self, file_id: str):
        if file_id in self._sessions:
            self._sessions[file_id].close()
            del self._sessions[file_id]

    @pyqtSlot(result=str)
    def select_file(self) -> str:
        """Helper for frontend to trigger native open."""
        from PyQt6.QtWidgets import QFileDialog, QApplication
        parent = QApplication.activeWindow()
        path, _ = QFileDialog.getOpenFileName(parent, "Open Log File", "", "Log Files (*.log *.txt *.json);;All Files (*)")
        return path
