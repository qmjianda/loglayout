
import sys
import array
import os
import subprocess
import re

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from loglayer.builtin.filter import FilterLayer
from loglayer.builtin.highlight import HighlightLayer
from loglayer.core import LayerStage
from bridge import PipelineWorker as RealWorker

class SignalMock:
    def __init__(self):
        self.emitted = []
    def emit(self, *args):
        self.emitted.append(args)

# Inline the logic from bridge.py to debug it more easily
def simulated_run(worker_obj):
    try:
        native_layers = [l for l in worker_obj.layers if l.stage == LayerStage.NATIVE]
        logic_layers = [l for l in worker_obj.layers if l.stage == LayerStage.LOGIC]
        
        s_args = None
        if worker_obj.search and worker_obj.search.get('query'):
            s_args = []
            if worker_obj.search.get('regex'): s_args.append("-e")
            else: s_args.append("-F")
            if not worker_obj.search.get('caseSensitive'): s_args.append("-i")
            s_args.append(worker_obj.search['query'])

        cmd_chain = []
        
        def build_rg_cmd(args, is_first, is_last_native):
            cmd = [worker_obj.rg_path, "--no-heading", "--no-filename", "--color", "never"]
            if is_first:
                cmd.append("--line-number")
            
            if not logic_layers:
                cmd.extend(["-o", "^"])
            elif not is_last_native:
                cmd.extend(["-o", "^"])
            
            cmd.extend(args)
            if is_first:
                cmd.append(worker_obj.file_path)
            else:
                cmd.append("-")
            return cmd

        if not native_layers and not s_args:
            cmd_chain.append(build_rg_cmd([""], True, True))
        else:
            for i, layer in enumerate(native_layers):
                rg_args = layer.get_rg_args()
                print(f"Layer {i} ({layer.display_name}) RG args: {rg_args}")
                if not rg_args: continue
                is_last_native = (i == len(native_layers) - 1) and (not s_args)
                cmd_chain.append(build_rg_cmd(rg_args, i == 0, is_last_native))
            
            if s_args:
                is_first = len(cmd_chain) == 0
                cmd_chain.append(build_rg_cmd(s_args, is_first, True))

        print(f"Command Chain: {cmd_chain}")
        worker_obj._processes = []
        last_stdout = None
        for i, cmd in enumerate(cmd_chain):
            p = subprocess.Popen(cmd, stdin=last_stdout if i > 0 else None, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1024*1024)
            worker_obj._processes.append(p)
            if i > 0 and last_stdout: last_stdout.close()
            last_stdout = p.stdout
            
        print(f"last_stdout type: {type(last_stdout)}")
        
        for l in logic_layers: l.reset()
        visible_indices = array.array('I')
        search_matches = array.array('I')
        v_idx = 0
        line_count = 0
        
        for line_bytes in last_stdout:
            # THIS IS THE SUSPECTED CRASH POINT PER IMAGE
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
                    content = layer.process_line(content)
                    if not layer.filter_line(content, index=physical_idx):
                        is_visible = False
                        break
            
            if is_visible:
                visible_indices.append(physical_idx)
                if worker_obj.search and worker_obj.search.get('query'):
                    search_matches.append(v_idx)
                v_idx += 1
            
            line_count += 1
        
        print(f"Finished. Visible lines: {len(visible_indices)}")
        
    except Exception as e:
        print(f"Simulation Error: {e}")
        import traceback
        traceback.print_exc()

class MockWorker:
    def __init__(self, **kwargs):
        self.file_path = kwargs.get('file_path')
        self.rg_path = kwargs.get('rg_path')
        self.layers = kwargs.get('layers', [])
        self.search = kwargs.get('search')
        self._is_running = True
        self.finished = SignalMock()
        self.progress = SignalMock()
        self.error = SignalMock()
        self._processes = []

def test_reproduction():
    # 1. An empty filter layer
    filter_layer = FilterLayer({"query": "", "enabled": True})
    filter_layer.id = "f1"
    
    # 2. A highlight layer
    highlight_layer = HighlightLayer({"query": "test", "color": "#ff0000", "enabled": True})
    highlight_layer.id = "h1"
    
    layers = [filter_layer, highlight_layer]
    
    print("Testing attribute binding...")
    # FilterLayer has SearchInput("query", ...)
    if hasattr(filter_layer, "query_regex"):
        print(f"Attribute binding OK: filter_layer.query_regex = {filter_layer.query_regex}")
    else:
        print("Error: Attribute binding failed for query_regex")
        
    if hasattr(filter_layer, "regex"):
        print(f"Legacy attribute binding OK: filter_layer.regex = {filter_layer.regex}")
    
    worker = MockWorker(
        file_id="test",
        file_path="tests/logs/dummy_log_1.log",
        rg_path="bin/windows/rg.exe",
        layers=layers,
        search=None
    )
    
    print("Running PATCED PipelineWorker.run...")
    try:
        # We need to call the real run method from RealWorker, but we can't easily 
        # as MockWorker doesn't inherit it correctly for a one-file test with mocks.
        # Let's just use RealWorker but mock the signals.
        
        real_worker = RealWorker(
            rg_path="bin/windows/rg.exe",
            file_path="tests/logs/dummy_log_1.log",
            layers=layers,
            search_config=None
        )
        real_worker.finished = SignalMock()
        real_worker.progress = SignalMock()
        real_worker.error = SignalMock()
        
        real_worker.run()
        
        if real_worker.error.emitted:
            print(f"Worker emitted ERROR: {real_worker.error.emitted}")
        else:
            v_count = len(real_worker.finished.emitted[0][0]) if real_worker.finished.emitted else 0
            print(f"Worker finished successfully. Visible lines: {v_count}")
            
    except Exception as e:
        print(f"Caught exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_reproduction()
