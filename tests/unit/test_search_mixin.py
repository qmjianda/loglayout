import pytest
import numpy as np
import json
from bridge import LogSession


def test_physical_to_visual_index(bridge_instance, mock_session):
    file_id = "test-file"
    bridge_instance._sessions[file_id] = mock_session

    # CASE 1: No filtering (visible_indices is None)
    mock_session.visible_indices = None
    assert bridge_instance.physical_to_visual_index(file_id, 10) == 10

    # CASE 2: With filtering
    mock_session.visible_indices = np.array([2, 5, 10, 15, 20])

    # Exact match
    assert bridge_instance.physical_to_visual_index(file_id, 5) == 1
    assert bridge_instance.physical_to_visual_index(file_id, 10) == 2

    # Nearest match (filtered out)
    # physical 6 -> should return visual 1 (physical 5)
    assert bridge_instance.physical_to_visual_index(file_id, 6) == 1
    # physical 1 -> should return 0 (nearest start)
    assert bridge_instance.physical_to_visual_index(file_id, 1) == 0
    # physical 100 -> should return visual 4 (physical 20)
    assert bridge_instance.physical_to_visual_index(file_id, 100) == 4


def test_get_nearest_search_rank(bridge_instance, mock_session):
    file_id = "test-file"
    bridge_instance._sessions[file_id] = mock_session
    mock_session.search_matches = np.array([10, 20, 30, 40])  # ranks: 0, 1, 2, 3

    # Direction: next
    assert bridge_instance.get_nearest_search_rank(file_id, 5, "next") == 0
    assert bridge_instance.get_nearest_search_rank(file_id, 10, "next") == 1
    assert bridge_instance.get_nearest_search_rank(file_id, 25, "next") == 2
    assert (
        bridge_instance.get_nearest_search_rank(file_id, 40, "next") == 0
    )  # wrap around

    # Direction: prev
    assert bridge_instance.get_nearest_search_rank(file_id, 45, "prev") == 3
    assert bridge_instance.get_nearest_search_rank(file_id, 40, "prev") == 2
    assert bridge_instance.get_nearest_search_rank(file_id, 35, "prev") == 2
    assert (
        bridge_instance.get_nearest_search_rank(file_id, 10, "prev") == 3
    )  # wrap around


def test_get_search_match_index(bridge_instance, mock_session):
    file_id = "test-file"
    bridge_instance._sessions[file_id] = mock_session
    mock_session.search_matches = np.array([100, 200, 300])

    assert bridge_instance.get_search_match_index(file_id, 0) == 100
    assert bridge_instance.get_search_match_index(file_id, 1) == 200
    assert bridge_instance.get_search_match_index(file_id, 5) == -1  # Out of range


def test_bookmark_logic_basic(bridge_instance, mock_session):
    # This involves Signals and Registry, which are partially mocked or instantiated in conftest
    file_id = "test-file"
    bridge_instance._sessions[file_id] = mock_session

    # We need to ensure the bridge has a pipelineFinished signal that we can monitor or mock
    # In conftest, FileBridge is instantiated, so signals are real.

    # Mock some responses from registry if necessary, but here we check toggle
    # Note: SearchMixin depends on self._registry

    # Test toggle_bookmark adds a bookmark
    res = bridge_instance.toggle_bookmark(file_id, 50)
    bookmarks = json.loads(res)
    assert "50" in bookmarks

    # Test toggle removes it
    res = bridge_instance.toggle_bookmark(file_id, 50)
    bookmarks = json.loads(res)
    assert "50" not in bookmarks
