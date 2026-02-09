import sys
import os
import json
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

def test_selection_fallbacks():
    print("Testing selection fallbacks...")
    
    # Mock tkinter
    mock_tk = MagicMock()
    mock_filedialog = MagicMock()
    
    with patch('bridge.tk', mock_tk), \
         patch('bridge.filedialog', mock_filedialog):
        
        from bridge import FileBridge
        bridge = FileBridge()
        
        # 1. Test select_files fallback
        print("Test 1: select_files fallback")
        mock_filedialog.askopenfilenames.return_value = ["C:/test/file1.log", "C:/test/file2.log"]
        
        res = bridge.select_files()
        assert "file1.log" in res
        assert "file2.log" in res
        mock_tk.Tk.assert_called()
        print("  - select_files fallback OK")
        
        # 2. Test select_folder fallback
        print("Test 2: select_folder fallback")
        mock_filedialog.askdirectory.return_value = "C:/test/folder"
        
        res = bridge.select_folder()
        assert res == "C:/test/folder"
        mock_tk.Tk.assert_called()
        print("  - select_folder fallback OK")

    print("\nAll tests passed!")

if __name__ == "__main__":
    test_selection_fallbacks()
