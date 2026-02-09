
import os
import json
import array
import time
from pathlib import Path
from PyQt6.QtCore import QCoreApplication, QEventLoop
from backend.bridge import FileBridge, PipelineWorker

def test_search_scale():
    print("--- Testing Search Scale Optimization ---")
    app = QCoreApplication.instance() or QCoreApplication([])
    bridge = FileBridge()
    
    test_file = Path("tests/search_scale_test.log")
    line_count = 1000000
    print(f"Generating test file with {line_count} lines...")
    with open(test_file, "w") as f:
        for i in range(line_count):
            # Match every 10th line
            if i % 10 == 0:
                f.write(f"Line {i} MATCH\n")
            else:
                f.write(f"Line {i} other\n")
    
    expected_matches = line_count // 10
    
    # 1. Open and Index
    loop = QEventLoop()
    bridge.fileLoaded.connect(lambda fid, info: loop.quit())
    bridge.open_file("scale-id", str(test_file))
    loop.exec()
    print("File indexed.")
    
    # 2. Run Pipeline (Search)
    search_json = json.dumps({"query": "MATCH", "regex": False, "caseSensitive": True})
    
    results = {}
    loop = QEventLoop()
    
    def on_pipeline_finished(file_id, newTotal, matchCount):
        results['matchCount'] = matchCount
        loop.quit()
        
    bridge.pipelineFinished.connect(on_pipeline_finished)
    bridge.sync_all("scale-id", "[]", search_json)
    loop.exec()
    
    print(f"Total matches detected: {results.get('matchCount')}")
    if results.get('matchCount') != expected_matches:
        print(f"FAIL: Expected {expected_matches} matches, got {results.get('matchCount')}")
        return False
    
    # 3. Verify on-demand rank lookup
    print("Verifying rank-to-index lookup...")
    
    # Check first match (Rank 0)
    idx0 = bridge.get_search_match_index("scale-id", 0)
    print(f"Rank 0 -> Index {idx0} (Expected 0)")
    
    # Check middle match (Rank 50000)
    rank_mid = expected_matches // 2
    idx_mid = bridge.get_search_match_index("scale-id", rank_mid)
    expected_mid = rank_mid * 10
    print(f"Rank {rank_mid} -> Index {idx_mid} (Expected {expected_mid})")
    
    # Check last match (Rank expected_matches - 1)
    rank_last = expected_matches - 1
    idx_last = bridge.get_search_match_index("scale-id", rank_last)
    expected_last = rank_last * 10
    print(f"Rank {rank_last} -> Index {idx_last} (Expected {expected_last})")
    
    success = (idx0 == 0 and idx_mid == expected_mid and idx_last == expected_last)
    
    # 4. Verify range lookup
    print("Verifying range lookup...")
    range_json = bridge.get_search_matches_range("scale-id", 100, 5)
    range_list = json.loads(range_json)
    expected_range = [1000, 1010, 1020, 1030, 1040]
    print(f"Rank 100-104 -> {range_list} (Expected {expected_range})")
    
    # Cleanup
    try:
        # Give some time for file handles to be released
        time.sleep(1)
        if test_file.exists(): test_file.unlink()
    except Exception as e:
        print(f"Warning: Could not delete test file: {e}")
    
    return success

if __name__ == "__main__":
    import sys
    os.environ["QT_QPA_PLATFORM"] = "offscreen"
    if test_search_scale():
        print("\n--- Verification PASS ---")
        sys.exit(0)
    else:
        print("\n--- Verification FAIL ---")
        sys.exit(1)
