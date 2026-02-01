
import os
import sys
import json
import time
from pathlib import Path
from PyQt6.QtCore import QCoreApplication, QEventLoop
# Adjust path to import backend modules
sys.path.append(os.getcwd())
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from backend.bridge import StatsWorker

class BaseMockLayer:
    def __init__(self, l_type, l_id, query=None, enabled=True):
        self.type = l_type
        self.id = l_id
        self.query = query
        self.enabled = enabled
        self.regex = False
        self.caseSensitive = False
        self.config = {}

class FilterLayer(BaseMockLayer): pass
class HighlightLayer(BaseMockLayer): pass
class LevelLayer(BaseMockLayer): pass

def run_stats_test(rg_path, file_path):
    print(f"--- Running StatsWorker Test ---")
    
    # Define layers
    # Layer 1: Filter "ERROR" (Active)
    # Layer 2: Highlight "Database" (Should count "Database" within "ERROR" lines)
    # Layer 3: Filter "Critical" (Disabled)
    # Layer 4: Highlight "Timeout" (Should count "Timeout" within "ERROR" lines, ignoring disabled filter)
    
    layers = [
        FilterLayer('FILTER', 'l1', 'ERROR', enabled=True),
        HighlightLayer('HIGHLIGHT', 'l2', 'Database', enabled=True),
        FilterLayer('FILTER', 'l3', 'Critical', enabled=False),
        HighlightLayer('HIGHLIGHT', 'l4', 'Timeout', enabled=True)
    ]
    
    # Create file content
    # 5 lines total
    # 1. ERROR Database Timeout
    # 2. ERROR Database
    # 3. INFO Database
    # 4. ERROR Timeout
    # 5. ERROR Other
    
    # Expected Counts:
    # l1 (ERROR): 4 matches (lines 1, 2, 4, 5) -> but StatsWorker calculates counts FOR the layer query.
    #   Filter "ERROR": 4 matches.
    
    # l2 (Database): Given "ERROR" filter active.
    #   Lines with ERROR: 1, 2, 4, 5.
    #   "Database" matches in lines 1, 2. -> 2 matches.
    
    # l3 (Critical): Disabled. Should probably return count if we calculate it? 
    #   "Critical" matches 0 lines.
    
    # l4 (Timeout): "ERROR" filter active (l1). "Critical" (l3) is disabled.
    #   Lines with ERROR: 1, 2, 4, 5.
    #   "Timeout" matches in lines 1, 4. -> 2 matches.
    
    worker = StatsWorker(str(rg_path), layers, str(file_path), 5)
    
    results = {}
    loop = QEventLoop()
    
    def on_finished(stats_json):
        print(f"Stats Finished: {stats_json}")
        results['stats'] = json.loads(stats_json)
        loop.quit()
    
    def on_error(msg):
        print(f"Error: {msg}")
        loop.quit()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    worker.start()
    loop.exec()
    
    if 'stats' not in results:
        print("No stats returned")
        return False
        
    stats = results['stats']
    
    # Verify l1
    if stats['l1']['count'] != 4:
        print(f"FAIL: l1 count expected 4, got {stats['l1']['count']}")
        return False
        
    # Verify l2
    if stats['l2']['count'] != 2:
        print(f"FAIL: l2 count expected 2, got {stats['l2']['count']}")
        return False
        
    # Verify l4
    if stats['l4']['count'] != 2:
        print(f"FAIL: l4 count expected 2, got {stats['l4']['count']}")
        return False
        
    print("PASS: StatsWorker logic verified.")
    return True

def main():
    app = QCoreApplication([])
    
    test_file = Path("tests/test_stats.log")
    print(f"Generating test file: {test_file}...")
    with open(test_file, "w") as f:
        f.write("ERROR Database Timeout\n")
        f.write("ERROR Database\n")
        f.write("INFO Database\n")
        f.write("ERROR Timeout\n")
        f.write("ERROR Other\n")
            
    # Find rg
    rg_path = Path("bin/windows/rg.exe")
    if not rg_path.exists():
        rg_path = Path(os.getcwd()) / "bin/windows/rg.exe"
    
    try:
        success = run_stats_test(rg_path, test_file)
    finally:
        if test_file.exists():
            test_file.unlink()
    
    if not success:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
