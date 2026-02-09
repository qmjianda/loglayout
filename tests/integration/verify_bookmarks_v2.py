import sys
import os
import json
import unittest
from unittest.mock import MagicMock

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from loglayer.bookmark_manager import BookmarkManager

class TestBookmarkManager(unittest.TestCase):
    def setUp(self):
        # Mock Bridge and Session
        self.bridge = MagicMock()
        self.manager = BookmarkManager(self.bridge)
        
        self.session = MagicMock()
        self.session.rendering_instances = []
        self.session.layers = []
        self.session.visible_indices = None
        self.session.line_offsets = [0, 10, 20]
        self.session.cache = {}
        
        self.bridge._sessions = {"test_file": self.session}
        
        # Mock BookmarkLayer instance
        self.mock_layer = MagicMock()
        self.mock_layer.bookmarks = {}
        self.mock_layer.__class__.__name__ = 'BookmarkLayer'
        self.mock_layer.id = "test_layer"
        
        self.bridge._registry.create_layer_instance.return_value = self.mock_layer

    def test_toggle_and_get(self):
        # Set layer in session
        self.session.rendering_instances = [self.mock_layer]
        
        # Toggle on
        res = self.manager.toggle_bookmark("test_file", 5)
        bookmarks = json.loads(res)
        self.assertIn("5", bookmarks)
        
        # Toggle off
        res = self.manager.toggle_bookmark("test_file", 5)
        bookmarks = json.loads(res)
        self.assertNotIn("5", bookmarks)

    def test_comment(self):
        self.session.rendering_instances = [self.mock_layer]
        self.manager.toggle_bookmark("test_file", 10)
        res = self.manager.update_comment("test_file", 10, "Hello World")
        bookmarks = json.loads(res)
        # JSON standard: keys are strings
        self.assertEqual(bookmarks["10"], "Hello World")

    def test_nearest(self):
        self.mock_layer.bookmarks = {10: "", 20: "", 30: ""}
        self.session.rendering_instances = [self.mock_layer]
        
        # direction='next'
        self.bridge.physical_to_visual_index.side_effect = lambda fid, pi: pi # Identity for test
        
        idx = self.manager.get_nearest_index("test_file", 15, "next")
        self.assertEqual(idx, 20)
        
        idx = self.manager.get_nearest_index("test_file", 15, "prev")
        self.assertEqual(idx, 10)
        
        idx = self.manager.get_nearest_index("test_file", 35, "next")
        self.assertEqual(idx, 10)
        
        idx = self.manager.get_nearest_index("test_file", 5, "prev")
        self.assertEqual(idx, 30)

if __name__ == '__main__':
    unittest.main()
