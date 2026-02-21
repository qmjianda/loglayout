import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from bridge import FileBridge

def test_platform_api():
    bridge = FileBridge()
    platform_info = bridge.get_platform_info()
    print(f"Platform: {platform_info}")
    assert platform_info in ["Windows", "Linux", "Darwin"]
    print("Test passed!")

if __name__ == "__main__":
    test_platform_api()
