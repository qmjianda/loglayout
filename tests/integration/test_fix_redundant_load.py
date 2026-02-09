
import os
import json
import time
from pathlib import Path
from PyQt6.QtCore import QCoreApplication, QEventLoop, QTimer
from backend.bridge import FileBridge

def test_bridge_session_reloading():
    """
    Verifies the backend FileBridge's behavior when open_file is called repeatedly.
    While the fix is in the frontend (App.tsx), this test ensures the backend
    correctly cleans up and restarts sessions if the frontend were to call it.
    """
    app = QCoreApplication([])
    bridge = FileBridge()
    
    test_file = Path("tests/redundant_load_test.log")
    with open(test_file, "w") as f:
        f.write("Line 1\nLine 2\nLine 3\n")
    
    file_id = "test-file-id"
    abs_path = str(test_file.absolute())
    
    loaded_count = 0
    loop = QEventLoop()
    
    def on_file_loaded(fid, info):
        nonlocal loaded_count
        if fid == file_id:
            loaded_count += 1
            print(f"File loaded (attempt {loaded_count})")
            if loaded_count >= 2:
                loop.quit()
            else:
                # Immediately call open_file again to simulate redundant load
                QTimer.singleShot(10, lambda: bridge.open_file(file_id, abs_path))

    bridge.fileLoaded.connect(on_file_loaded)
    
    print("Initiating first open_file call...")
    bridge.open_file(file_id, abs_path)
    
    # Timeout after 5 seconds
    QTimer.singleShot(5000, loop.quit)
    loop.exec()
    
    # Explicitly close sessions before cleanup
    for fid in list(bridge._sessions.keys()):
        bridge.close_file(fid)
        
    # Cleanup
    if test_file.exists():
        try:
            test_file.unlink()
        except:
            pass # Ignore if still locked on Windows
        
    print(f"Final loaded count: {loaded_count}")
    assert loaded_count == 2, "Backend should have processed both open_file calls (simulating re-indexing)"
    print("Test Passed: Backend handled repeated open_file calls correctly.")

if __name__ == "__main__":
    test_bridge_session_reloading()
