import pytest
import os
import sys
import tempfile
import json

# Add project root and backend to sys.path
project_root = os.path.dirname(os.path.dirname(__file__))
if project_root not in sys.path:
    sys.path.append(project_root)
backend_path = os.path.join(project_root, "backend")
if backend_path not in sys.path:
    sys.path.append(backend_path)

from bridge import FileBridge, LogSession


@pytest.fixture
def bridge():
    """Provides a clean FileBridge instance."""
    return FileBridge()


@pytest.fixture
def bridge_instance(bridge):
    """Provides a clean FileBridge instance (legacy compatibility)."""
    return bridge


@pytest.fixture
def rg_path():
    """Returns the path to the bundled ripgrep binary."""
    base_dir = os.path.dirname(os.path.dirname(__file__))
    if sys.platform == "win32":
        return os.path.join(
            base_dir,
            "bin",
            "windows",
            "ripgrep-15.1.0-x86_64-pc-windows-msvc",
            "rg.exe",
        )
    else:
        return os.path.join(
            base_dir, "bin", "linux", "ripgrep-15.1.0-x86_64-unknown-linux-musl", "rg"
        )


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
            self.processing_cache = {}
            self.rendering_cache = {}

    return MockSession()


@pytest.fixture
def temp_log_file():
    """Creates a temporary log file and returns its path."""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", delete=False, encoding="utf-8"
    ) as f:
        f.write("line 1\nline 2\nline 3\nline 4\nline 5\n")
        path = f.name

    yield path

    if os.path.exists(path):
        os.remove(path)
