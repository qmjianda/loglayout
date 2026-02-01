
import os
import json
import array
from pathlib import Path
import sys
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend')) # logic is in backend/loglayer so we might need backend in path too?
# Actually backend.bridge uses `from loglayer`. loglayer is in backend/.
# So we need `backend` directory in path? 
# If we convert `backend.bridge` to absolute import `loglayer...` we need `backend` in path.
from PyQt6.QtCore import QCoreApplication, QEventLoop
from backend.bridge import PipelineWorker, IndexingWorker

from loglayer.core import LayerStage

class MockFilterLayer:
    stage = LayerStage.NATIVE
    def __init__(self, query):
        self.query = query
        self.regex = False
        self.caseSensitive = True
    
    def get_rg_args(self):
        # Simplistic args based on backend/bridge.py logic assumptions or just what PipelineWorker calls
        # Wait, PipelineWorker calls get_rg_args().
        # bridge.py line 174: rg_args = layer.get_rg_args()
        # builtin/filter.py FilterLayer implementation:
        args = []
        if not self.regex: args.append("-F")
        if not self.caseSensitive: args.append("-i")
        args.append(self.query)
        return args

def run_pipeline_test(rg_path, file_path, line_count):
    """Verifies that PipelineWorker can handle large result sets without hard limits."""
    print(f"--- Running Pipeline Scalability Test ({line_count} lines) ---")
    
    layer = MockFilterLayer('ERROR')
    
    worker = PipelineWorker(rg_path, str(file_path), [layer])
    
    results = {}
    loop = QEventLoop()
    
    def on_finished(indices, matches):
        results['indices'] = indices
        loop.quit()
    
    def on_error(msg):
        print(f"Error: {msg}")
        loop.quit()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    worker.start()
    loop.exec()
    
    if 'indices' in results:
        actual_count = len(results['indices'])
        print(f"Result: {actual_count} lines returned.")
        return actual_count == line_count
    return False

def run_indexing_test(file_path, line_count):
    """Verifies that IndexingWorker correctly counts lines via mmap."""
    print(f"--- Running Indexing Integrity Test ---")
    size = os.path.getsize(file_path)
    fd = os.open(file_path, os.O_RDONLY)
    import mmap
    mm = mmap.mmap(fd, 0, access=mmap.ACCESS_READ)
    
    worker = IndexingWorker(mm, size)
    results = {}
    loop = QEventLoop()
    
    def on_finished(offsets):
        results['offsets'] = offsets
        loop.quit()
        
    worker.finished.connect(on_finished)
    worker.start()
    loop.exec()
    
    mm.close()
    os.close(fd)
    
    if 'offsets' in results:
        actual_count = len(results['offsets'])
        print(f"Result: {actual_count} lines indexed.")
        return actual_count == line_count
    return False

def main():
    app = QCoreApplication([])
    
    # Setup test file
    test_file = Path("tests/test_temp.log")
    line_count = 2100000 # Test scale above previous 2M limit
    print(f"Generating test file: {test_file} ({line_count} lines)...")
    with open(test_file, "w") as f:
        for i in range(line_count):
            f.write(f"Line {i} ERROR message content\n")
            
    # Find rg
    rg_path = Path("bin/windows/rg.exe")
    if not rg_path.exists():
        rg_path = Path(os.getcwd()) / "bin/windows/rg.exe"
    
    p_success = run_pipeline_test(str(rg_path), test_file, line_count)
    i_success = run_indexing_test(test_file, line_count)
    
    # Cleanup
    if test_file.exists():
        test_file.unlink()
        
    print("\n--- Summary ---")
    print(f"Pipeline Test: {'PASS' if p_success else 'FAIL'}")
    print(f"Indexing Test: {'PASS' if i_success else 'FAIL'}")
    
    if not (p_success and i_success):
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    import sys
    main()
