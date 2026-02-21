
import os
import sys
import json
import array
from pathlib import Path

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from bridge import FileBridge

def test_search_not_filtering():
    """
    Verify that searching (Find) does not filter lines out by default,
    or at least identify if it currently does.
    """
    bridge = FileBridge()
    
    # Create a dummy log file
    log_path = Path("tests/repro_search.log")
    log_path.write_text("Line 1: Hello\nLine 2: World\nLine 3: Search Me\nLine 4: End\n")
    
    file_id = "test-f1"
    bridge.open_file(file_id, str(log_path.absolute()))
    
    # Wait for indexing (it's in a thread, so we might need to poll)
    import time
    timeout = 5
    start = time.time()
    while file_id not in bridge._sessions or len(bridge._sessions[file_id].line_offsets) == 0:
        if time.time() - start > timeout:
            raise TimeoutError("Indexing took too long")
        time.sleep(0.1)
    
    session = bridge._sessions[file_id]
    print(f"Indexed {len(session.line_offsets)} lines.")
    
    # CASE 1: Normal View (no filters, no search)
    bridge.sync_all(file_id, "[]", "")
    # Wait for pipeline
    while 'pipeline' in session.workers and session.workers['pipeline'].isRunning():
        time.sleep(0.1)
    
    print(f"Normal view visible count: {len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)}")
    
    # CASE 2: Search for "Search"
    search_json = json.dumps({"query": "Search", "regex": False, "caseSensitive": False})
    bridge.sync_all(file_id, "[]", search_json)
    
    # Wait for pipeline
    while 'pipeline' in session.workers and session.workers['pipeline'].isRunning():
        time.sleep(0.1)
    
    visible_count = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
    match_count = len(session.search_matches) if session.search_matches is not None else 0
    print(f"Search 'Search' visible count: {visible_count}, match count: {match_count}")
    
    # CASE 3: Search for non-existent "Missing"
    search_json = json.dumps({"query": "Missing", "regex": False, "caseSensitive": False})
    bridge.sync_all(file_id, "[]", search_json)
    
    while 'pipeline' in session.workers and session.workers['pipeline'].isRunning():
        time.sleep(0.1)
        
    visible_count_missing = len(session.visible_indices) if session.visible_indices is not None else len(session.line_offsets)
    match_count_missing = len(session.search_matches) if session.search_matches is not None else 0
    print(f"Search 'Missing' visible count: {visible_count_missing}, match count: {match_count_missing}")
    
    # Validation
    if visible_count == 4 and match_count == 1 and visible_count_missing == 4 and match_count_missing == 0:
        print("Success: Search highlights correctly without filtering.")
        return True
    else:
        print(f"Failed: visible={visible_count}, matches={match_count}; missing_visible={visible_count_missing}, missing_matches={match_count_missing}")
        return False

if __name__ == "__main__":
    success = test_search_not_filtering()
    sys.exit(0 if success else 1)
