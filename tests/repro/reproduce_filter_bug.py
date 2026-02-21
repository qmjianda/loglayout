
import os
import sys
import time

# Add backend to path
sys.path.append(os.path.abspath("backend"))

from bridge import PipelineWorker, FileBridge
from loglayer.builtin.filter import FilterLayer

def reproduce_filter_bug():
    print("--- Reproducing Filter Bug ---")
    
    # 1. Create a dummy log file
    log_path = "tests/repro_filter.log"
    # Ensure no lines start with literal caret '^'
    content = [
        "Line 1: Hello World",
        "Line 2: Another line",
        "Line 3: Something else",
        "Line 4: Hello Again"
    ]
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(content) + "\n")
    
    # 2. Setup Filter Layer
    # Query "Hello", Regex=False (Fixed String mode)
    # This triggers rg -F "Hello"
    # The bug was injecting "-o" "^" which makes rg search for literal "^" AND "Hello" in fixed mode (or confusing positional args)
    filter_layer = FilterLayer({"query": "Hello", "regex": False, "caseSensitive": False, "invert": False})
    
    layers = [filter_layer]
    
    # 3. Run PipelineWorker
    # Mock search_config
    bridge = FileBridge()
    rg_path = bridge._get_rg_path()
    
    worker = PipelineWorker(rg_path, log_path, layers)
    
    results = {"visible": None}
    
    def on_finished(visible, matches):
        results["visible"] = visible
    
    worker.finished.connect(on_finished)
    
    print("Starting pipeline...")
    worker.start()
    
    # Wait for completion
    worker.wait(timeout=5)
    
    # 4. Verify Results
    # Should match Line 1 and Line 4. Indices [0, 3]
    visible = results["visible"]
    print(f"Visible Indices: {list(visible) if visible else None}")
    
    # Cleanup
    try: os.remove(log_path)
    except: pass
    
    if visible is not None and len(visible) == 2 and visible[0] == 0 and visible[1] == 3:
        print("--- PASS: Filter working correctly ---")
        return True
    else:
        print("--- FAIL: Filter returned incorrect results (Bug reproduced if empty) ---")
        return False

if __name__ == "__main__":
    success = reproduce_filter_bug()
    sys.exit(0 if success else 1)
