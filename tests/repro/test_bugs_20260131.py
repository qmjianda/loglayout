
import os
os.environ["QT_QPA_PLATFORM"] = "offscreen"
import json
import array
import time
from pathlib import Path
from PyQt6.QtCore import QCoreApplication, QEventLoop, QThread
from backend.bridge import FileBridge, StatsWorker

def test_empty_file():
    print("--- Testing Empty File Line Count ---")
    app = QCoreApplication.instance() or QCoreApplication([])
    bridge = FileBridge()
    
    test_file = Path("tests/empty_test.log")
    test_file.write_text("")
    
    results = {}
    loop = QEventLoop()
    
    def on_loaded(file_id, info_json):
        info = json.loads(info_json)
        results['lineCount'] = info['lineCount']
        loop.quit()
        
    bridge.fileLoaded.connect(on_loaded)
    print("Calling open_file...")
    bridge.open_file("empty-id", str(test_file))
    print("Loop execution...")
    loop.exec()
    
    print(f"Empty file line count: {results.get('lineCount')}")
    success = results.get('lineCount') == 0
    
    if test_file.exists(): test_file.unlink()
    return success

def test_stats_worker_termination():
    print("--- Testing StatsWorker Termination ---")
    app = QCoreApplication.instance() or QCoreApplication([])
    
    # Create a reasonably large file so stats take some time
    test_file = Path("tests/stats_term_test.log")
    with open(test_file, "w") as f:
        for i in range(100000):
            f.write(f"Line {i} some content with ERROR\n")
            
    rg_path = "bin/windows/rg.exe"
    layers = [
        {'id': 'l1', 'type': 'FILTER', 'enabled': True, 'config': {'query': 'ERROR'}},
        {'id': 'l2', 'type': 'HIGHLIGHT', 'enabled': True, 'config': {'query': 'Line 100'}}
    ]
    
    worker = StatsWorker(rg_path, layers, str(test_file), 100000)
    worker.start()
    time.sleep(0.1) # Let it start
    
    print("Stopping worker...")
    worker.stop()
    worker.wait(2000)
    
    is_running = worker.isRunning()
    print(f"Worker is running: {is_running}")
    
    # Check if processes are cleaned up (we can't easily check subprocesses here but wait() finishing is a good sign)
    
    if test_file.exists(): test_file.unlink()
    return not is_running

if __name__ == "__main__":
    s1 = test_empty_file()
    s2 = test_stats_worker_termination()
    
    print("\n--- Bug Fix Summary ---")
    print(f"Empty File Fix: {'PASS' if s1 else 'FAIL'}")
    print(f"StatsWorker Termination: {'PASS' if s2 else 'FAIL'}")
    
    import sys
    if not (s1 and s2):
        sys.exit(1)
    sys.exit(0)
