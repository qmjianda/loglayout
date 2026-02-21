import sys
import os
import json
import unittest
from unittest.mock import MagicMock

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from search_mixin import SearchMixin
from loglayer.registry import LayerRegistry

class MockBridge(SearchMixin):
    def __init__(self):
        self._sessions = {}
        self._registry = LayerRegistry()
        self.pipelineFinished = MagicMock()

class TestLayerIntegration(unittest.TestCase):
    def setUp(self):
        self.bridge = MockBridge()
        
        self.session = MagicMock()
        self.session.rendering_instances = []
        self.session.layers = []
        self.session.visible_indices = None
        self.session.line_offsets = [0, 10, 20]
        self.session.cache = {}
        
        self.bridge._sessions = {"test_file": self.session}
        
        # We need a real LayerRegistry to mock create_layer_instance properly 
        # or just mock it on the bridge
        self.bridge._registry.create_layer_instance = MagicMock()
        
        # Mock BookmarkLayer
        from loglayer.builtin.bookmark import BookmarkLayer
        self.mock_layer = BookmarkLayer({'bookmarks': {}})
        self.bridge._registry.create_layer_instance.return_value = self.mock_layer

    def test_integration_flow(self):
        # 1. Toggle bookmark via Mixin
        res = self.bridge.toggle_bookmark("test_file", 5)
        bookmarks = json.loads(res)
        self.assertIn("5", bookmarks)
        self.assertIn(5, self.mock_layer.bookmarks)
        
        # 2. Update comment
        res = self.bridge.update_bookmark_comment("test_file", 5, "Refactor test")
        bookmarks = json.loads(res)
        self.assertEqual(bookmarks["5"], "Refactor test")
        
        # 3. Get nearest (next)
        self.mock_layer.toggle(15) # Add another one
        # Current index 0, should go to 5
        idx = self.bridge.get_nearest_bookmark_index("test_file", 0, "next")
        self.assertEqual(idx, 5)
        
        # 4. Clear all
        self.bridge.clear_bookmarks("test_file")
        self.assertEqual(len(self.mock_layer.bookmarks), 0)

if __name__ == '__main__':
    unittest.main()
