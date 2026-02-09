import sys
import os
import json
import array
from pathlib import Path

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from bridge import FileBridge

def test_large_file_indexing():
    bridge = FileBridge()
    file_id = "test-large"
    # Create a dummy large file (e.g. 5000 lines)
    test_file = Path("tests/large_dummy.log")
    with open(test_file, "w") as f:
        for i in range(5000):
            f.write(f"Line {i+1}: Some dummy data for testing virtualization limits.\n")
    
    print(f"Created test file with 5000 lines.")
    
    # Open file (async indexing)
    bridge.open_file(file_id, str(test_file.absolute()))
    
    # Wait for indexing to finish (in reality it's a QThread, but for this test we'll wait)
    # Actually bridge._on_indexing_finished is called by signal.
    # In a script we might need to use a QEventLoop or just check session data.
    
    import time
    timeout = 10
    while timeout > 0:
        if file_id in bridge._sessions and len(bridge._sessions[file_id].line_offsets) >= 5000:
            break
        time.sleep(0.5)
        timeout -= 0.5
    
    session = bridge._sessions[file_id]
    line_count = len(session.line_offsets)
    print(f"Indexed line count: {line_count}")
    assert line_count >= 5000, "Should index at least 5000 lines"

    # Test reading line 4500 (beyond 1000)
    lines_json = bridge.read_processed_lines(file_id, 4500, 10)
    lines = json.loads(lines_json)
    
    assert len(lines) == 10, "Should read 10 lines"
    assert lines[0]['content'].startswith("Line 4501"), f"Line content mismatch: {lines[0]['content']}"
    print("Backend virtualization check passed (can read beyond 1000 lines).")
    
    # Clean up
    bridge.close_file(file_id)
    test_file.unlink()

if __name__ == "__main__":
    if not os.path.exists("tests"): os.makedirs("tests")
    try:
        test_large_file_indexing()
        print("Test Result: SUCCESS")
    except Exception as e:
        print(f"Test Result: FAILED - {e}")
        sys.exit(1)
