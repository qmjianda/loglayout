import pytest
import os
import sys
import tempfile
import json

# Add backend to sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend'))

from bridge import FileBridge, LogSession

@pytest.fixture
def bridge_instance():
    """Provides a clean FileBridge instance."""
    bridge = FileBridge()
    return bridge

@pytest.fixture
def mock_session():
    """Provides a mock LogSession for testing mixins."""
    class MockSession:
        def __init__(self):
            self.file_path = "test.log"
            self.line_offsets = []
            self.visible_indices = None
            self.search_matches = None
            self.rendering_instances = []
            self.layers = []
            self.cache = {}
            
    return MockSession()

@pytest.fixture
def temp_log_file():
    """Creates a temporary log file and returns its path."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False, encoding='utf-8') as f:
        f.write("line 1\nline 2\nline 3\nline 4\nline 5\n")
        path = f.name
    
    yield path
    
    if os.path.exists(path):
        os.remove(path)
