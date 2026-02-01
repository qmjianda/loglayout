
import os
import sys
import json
import array
from PyQt6.QtCore import QCoreApplication

# Add backend to path
sys.path.append(os.path.abspath("backend"))

from bridge import PipelineWorker
from loglayer.builtin.filter import FilterLayer
from loglayer.builtin.level import LevelLayer
from loglayer.core import LayerStage

def test_unified_pipeline():
    print("--- Testing Unified Backend Pipeline ---")
    
    # 1. Create a dummy log file
    log_path = "tests/unified_test.log"
    content = [
        "2026-02-01 10:00:01 INFO  [System] Started",
        "2026-02-01 10:00:02 WARN  [Engine] Temperature high",
        "2026-02-01 10:00:03 ERROR [Engine] Critical failure",
        "2026-02-01 10:00:04 DEBUG [System] Heartbeat",
        "2026-02-01 10:00:05 INFO  [Engine] Recovery success"
    ]
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(content) + "\n")
    
    # 2. Setup Layer Instances
    # Layer 1: Native Filter for "Engine"
    filter_layer = FilterLayer({"query": "Engine", "regex": False, "caseSensitive": False, "invert": False})
    
    # Layer 2: Native Level for "ERROR" and "WARN"
    level_layer = LevelLayer({"levels": ["ERROR", "WARN"]})
    
    # 3. Create a Custom Python Logic Layer (Mocking a plugin)
    from loglayer.core import BaseLayer
    class CustomLogicLayer(BaseLayer):
        stage = LayerStage.LOGIC
        def filter_line(self, content):
            return "failure" in content.lower()
    
    logic_layer = CustomLogicLayer()
    
    layers = [filter_layer, level_layer, logic_layer]
    
    # 4. Run PipelineWorker
    # We need a QCoreApplication to use QThread
    app = QCoreApplication(sys.argv)
    
    from bridge import FileBridge
    bridge = FileBridge()
    rg_path = bridge._get_rg_path()
    
    worker = PipelineWorker(rg_path, log_path, layers)
    
    results = {"visible": None, "matches": None}
    
    def on_finished(visible, matches):
        results["visible"] = visible
        results["matches"] = matches
        app.quit()

    worker.finished.connect(on_finished)
    worker.error.connect(lambda msg: (print(f"Error: {msg}"), app.quit()))
    
    print("Starting pipeline...")
    worker.start()
    app.exec()
    
    # 5. Verify Results
    # Expected flow:
    # rg "Engine" -> lines 2, 3, 5
    # rg "ERROR|WARN" -> lines 2, 3
    # Python "failure" -> line 3 (index 2)
    
    visible = results["visible"]
    print(f"Visible Indices: {list(visible) if visible else None}")
    
    success = (visible is not None and len(visible) == 1 and visible[0] == 2)
    
    if success:
        print("--- Verification PASS ---")
    else:
        print("--- Verification FAIL ---")
        
    # Cleanup
    try: os.remove(log_path)
    except: pass
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    test_unified_pipeline()
