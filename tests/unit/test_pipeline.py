import pytest
import os
import threading
from bridge import PipelineWorker
from loglayer.builtin.filter import FilterLayer
from loglayer.builtin.level import LevelLayer
from loglayer.core import BaseLayer, LayerStage

class CustomLogicLayer(BaseLayer):
    """Custom logic layer for testing mixed pipeline"""
    stage = LayerStage.LOGIC
    display_name = "Custom Logic"
    description = "Test logic layer"
    
    def filter_line(self, content, index=-1):
        return "failure" in content.lower()

def test_unified_pipeline_logic(bridge_instance, temp_log_file):
    # Setup specific test content
    content = [
        "2026-02-01 10:00:01 INFO  [System] Started",
        "2026-02-01 10:00:02 WARN  [Engine] Temperature high",
        "2026-02-01 10:00:03 ERROR [Engine] Critical failure",
        "2026-02-01 10:00:04 DEBUG [System] Heartbeat",
        "2026-02-01 10:00:05 INFO  [Engine] Recovery success"
    ]
    with open(temp_log_file, "w", encoding="utf-8") as f:
        f.write("\n".join(content) + "\n")
    
    # Setup layers
    filter_layer = FilterLayer({
        "query": "Engine", 
        "regex": False, 
        "caseSensitive": False, 
        "invert": False
    })
    level_layer = LevelLayer({"levels": ["ERROR", "WARN"]})
    logic_layer = CustomLogicLayer({})
    
    layers = [filter_layer, level_layer, logic_layer]
    
    rg_path = bridge_instance._get_rg_path()
    worker = PipelineWorker(rg_path, str(temp_log_file), layers)
    
    finished_event = threading.Event()
    results = {}
    
    def on_finished(visible, matches):
        results["visible"] = visible
        results["matches"] = matches
        finished_event.set()

    def on_error(msg):
        results["error"] = msg
        finished_event.set()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    worker.start()
    
    assert finished_event.wait(timeout=10.0)
    assert 'error' not in results
    
    visible = results["visible"]
    # Expected: 
    # Engine -> 1, 2, 4 (WARN, ERROR, INFO)
    # Level ERROR/WARN -> 1, 2
    # Logic "failure" -> 2
    assert len(visible) == 1
    assert visible[0] == 2
