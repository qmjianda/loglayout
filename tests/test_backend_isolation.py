
import unittest
import sys
import os
import json
import time
import shutil

# Ensure backend can be imported
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from bridge import FileBridge

class TestBridgeIsolation(unittest.TestCase):
    def setUp(self):
        self.test_dir = "tests/temp_isolation_logs"
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
        os.makedirs(self.test_dir)
        
        self.bridge = FileBridge()
        
    def tearDown(self):
        # Close all sessions to release file locks
        if hasattr(self, 'bridge'):
            for fid in list(self.bridge._sessions.keys()):
                self.bridge.close_file(fid)
                
        if os.path.exists(self.test_dir):
            try:
                shutil.rmtree(self.test_dir)
            except OSError:
                pass # Ignore if still locked (Windows specific quirks)
            
    def create_log(self, name, lines):
        path = os.path.abspath(os.path.join(self.test_dir, name))
        with open(path, "w", encoding="utf-8") as f:
            for l in lines:
                f.write(l + "\n")
        return path

    def test_session_isolation(self):
        """
        Test that opening multiple files does not corrupt sessions (Signal isolation).
        """
        # File 1: 5 lines
        lines1 = [f"Log1_Line_{i}" for i in range(5)]
        path1 = self.create_log("log1.log", lines1)
        
        # File 2: 2 lines
        lines2 = [f"Log2_Line_{i}" for i in range(2)]
        path2 = self.create_log("log2.log", lines2)
        
        # Open File 1
        self.bridge.open_file("id1", path1)
        time.sleep(1) # Wait for indexing
        
        read1 = self.bridge.read_processed_lines("id1", 0, 100)
        data1 = json.loads(read1)
        self.assertEqual(len(data1), 5, "File 1 should have 5 lines initially")
        
        # Open File 2
        self.bridge.open_file("id2", path2)
        time.sleep(1) # Wait for indexing
        
        # Check File 2
        read2 = self.bridge.read_processed_lines("id2", 0, 100)
        data2 = json.loads(read2)
        self.assertEqual(len(data2), 2, "File 2 should have 2 lines")
        
        # TRIGGER THE BUG: Even without sync_all, if signals are shared, 
        # File 2's indexing finished signal could have contaminated File 1.
        # But to be sure, let's just read File 1 again. 
        # (In the repro, the corruption happened immediately upon File 2 opening event).
        
        read1_again = self.bridge.read_processed_lines("id1", 0, 100)
        data1_again = json.loads(read1_again)
        
        if len(data1_again) == 2:
            self.fail("Regression: File 1 session corrupted by File 2 (got 2 lines instead of 5)")
            
        self.assertEqual(len(data1_again), 5, "File 1 should still have 5 lines after opening File 2")
        self.assertEqual(data1_again[0]['content'].strip(), "Log1_Line_0")

if __name__ == '__main__':
    unittest.main()
