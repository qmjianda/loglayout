import pytest
import os
import json
import threading
from bridge import StatsWorker

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

def test_stats_worker_logic(bridge_instance, temp_log_file):
    # Find rg
    rg_path = bridge_instance._get_rg_path()
    
    # Define layers
    layers = [
        FilterLayer('FILTER', 'l1', 'ERROR', enabled=True),
        HighlightLayer('HIGHLIGHT', 'l2', 'Database', enabled=True),
        FilterLayer('FILTER', 'l3', 'Critical', enabled=False),
        HighlightLayer('HIGHLIGHT', 'l4', 'Timeout', enabled=True)
    ]
    
    # Total lines in temp_log_file is 5 (from conftest)
    # 1. line 1
    # ...
    # Wait, the conftest temp_log_file content is generic.
    # Let's write specific content for this test.
    with open(temp_log_file, "w", encoding='utf-8') as f:
        f.write("ERROR Database Timeout\n") # 1
        f.write("ERROR Database\n")         # 2
        f.write("INFO Database\n")          # 3
        f.write("ERROR Timeout\n")          # 4
        f.write("ERROR Other\n")            # 5

    worker = StatsWorker(str(rg_path), layers, str(temp_log_file), 5)
    
    finished_event = threading.Event()
    results = {}

    def on_finished(stats_json):
        results['stats'] = json.loads(stats_json)
        finished_event.set()
    
    def on_error(msg):
        results['error'] = msg
        finished_event.set()

    worker.finished.connect(on_finished)
    worker.error.connect(on_error)
    worker.start()
    
    # Wait for completion (max 5s)
    assert finished_event.wait(timeout=5.0)
    
    assert 'error' not in results, f"Worker error: {results.get('error')}"
    stats = results['stats']
    
    # Verify l1 (ERROR) -> matches lines 1, 2, 4, 5
    assert stats['l1']['count'] == 4
    
    # Verify l2 (Database) -> matches lines 1, 2 (within ERROR lines)
    assert stats['l2']['count'] == 2
    
    # Verify l4 (Timeout) -> matches lines 1, 4 (within ERROR lines)
    assert stats['l4']['count'] == 2
