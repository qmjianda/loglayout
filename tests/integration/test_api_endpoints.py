import pytest
from fastapi.testclient import TestClient
import json
import os
import sys

# Add backend to sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend"))

from main import app, bridge

client = TestClient(app)


def test_api_platform():
    response = client.get("/api/platform")
    assert response.status_code == 200
    assert isinstance(response.json(), str)


def test_api_layer_registry():
    response = client.get("/api/get_layer_registry")
    assert response.status_code == 200
    registry = response.json()
    assert isinstance(registry, list)
    # Check if some default layers are there
    types = [l["type"] for l in registry]
    assert "FILTER" in types
    assert "BOOKMARK" in types


def test_api_open_file_not_found():
    # Test with non-existent file
    response = client.post(
        "/api/open_file",
        json={"file_id": "missing", "file_path": "/non/existent/path.log"},
    )
    # FileBridge handles internal error, usually returns some status
    # According to bridge.py, it prints error but what does it return?
    # In main.py: return bridge.open_file(...)
    # Let's check bridge.py open_file return value.
    assert response.status_code == 200
    assert response.json() is False  # Usually returns False on failure


def test_api_read_processed_lines_empty():
    # Test reading from an invalid file_id
    response = client.get(
        "/api/read_processed_lines",
        params={"file_id": "invalid", "start_line": 0, "count": 10},
    )
    assert response.status_code == 200
    assert response.json() == []


def test_api_bookmark_endpoints(temp_log_file):
    file_id = "test-bookmark-file"

    # 1. Open the file first (synchronously for test)
    bridge.open_file(file_id, temp_log_file)

    # 2. Toggle bookmark
    response = client.post(
        "/api/toggle_bookmark", json={"file_id": file_id, "line_index": 2}
    )
    assert response.status_code == 200
    bookmarks = response.json()
    assert "2" in bookmarks

    # 3. Get bookmarks
    response = client.get(f"/api/get_bookmarks?file_id={file_id}")
    assert response.status_code == 200
    assert "2" in response.json()

    # 4. Clear bookmarks
    response = client.post("/api/clear_bookmarks", json={"file_id": file_id})
    assert response.status_code == 200
    assert response.json() == {}

    # Cleanup session
    bridge.close_file(file_id)

    # Give time for file to be released on Windows
    import time

    time.sleep(0.1)
