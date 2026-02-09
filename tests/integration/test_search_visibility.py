
import os
import sys
import json
import array
import time
from pathlib import Path

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from bridge import FileBridge

def test_search_not_filtering():
    """
    Verify that global search (Find) does not filter lines out.
    """
    bridge = FileBridge()
    
    # Create a dummy log file
    log_path = Path("tests/repro_search_visibility.log")
    log_path.write_text("Line 1: Hello\nLine 2: World\nLine 3: Search Me\nLine 4: End\n")
    
    file_id = "test-vis-1"
    bridge.open_file(file_id, str(log_path.absolute()))
    
    # Wait for indexing
    timeout = 5
    start = time.time()
    while file_id not in bridge._sessions or len(bridge._sessions[file_id].line_offsets) == 0:
        if time.time() - start > timeout:
            raise TimeoutError("Indexing took too long")
        time.sleep(0.1)
    
    session = bridge._sessions[file_id]
    
    # CASE 1: Search for "Search" (1 match)
    search_json = json.dumps({"query": "Search", "regex": False, "caseSensitive": False})
    bridge.sync_all(file_id, "[]", search_json)
    
    while 'pipeline' in session.workers and session.workers['pipeline'].isRunning():
        time.sleep(0.1)
    
    visible_count = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
    match_count = len(session.search_matches) if session.search_matches is not None else 0
    
    print(f"Search 'Search': visible={visible_count}, matches={match_count}")
    
    # CASE 2: Search for non-existent "Missing" (0 match)
    search_json = json.dumps({"query": "Missing", "regex": False, "caseSensitive": False})
    bridge.sync_all(file_id, "[]", search_json)
    
    while 'pipeline' in session.workers and session.workers['pipeline'].isRunning():
        time.sleep(0.1)
        
    v_count_missing = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
    m_count_missing = len(session.search_matches) if session.search_matches is not None else 0
    print(f"Search 'Missing': visible={v_count_missing}, matches={m_count_missing}")
    
    # Cleanup
    bridge.close_file(file_id)
    if log_path.exists(): log_path.unlink()
    
    # Assertions
    assert visible_count == 4, f"Search should not filter lines. Expected 4, got {visible_count}"
    assert match_count == 1, f"Search should find 1 match. Got {match_count}"
    assert v_count_missing == 4, "Search for missing term should not filter lines."
    assert m_count_missing == 0, "Search for missing term should have 0 matches."
    
    print("Test passed: Search does not filter but highlights correctly.")
    return True

if __name__ == "__main__":
    try:
        test_search_not_filtering()
        sys.exit(0)
    except Exception as e:
        print(f"Test failed: {e}")
        sys.exit(1)
