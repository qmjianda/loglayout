
import sys
import os
from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import QTimer
from backend.bridge import FileBridge

def test_handshake():
    app = QApplication(sys.argv)
    bridge = FileBridge()
    
    received_ready = False
    received_pending_count = 0
    
    def on_frontend_ready():
        nonlocal received_ready
        received_ready = True
        print("Backend: received_ready signal caught!")
        bridge.pendingFilesCount.emit(42) # Mock emitting something upon ready

    def on_pending_count(count):
        nonlocal received_pending_count
        received_pending_count = count
        print(f"Backend: received_pending_count: {count}")

    bridge.frontendReady.connect(on_frontend_ready)
    bridge.pendingFilesCount.connect(on_pending_count)

    # Simulation: Frontend calls ready()
    print("Frontend: calling bridge.ready()...")
    bridge.ready()
    
    # Process events to let signals propagate
    app.processEvents()
    
    if received_ready and received_pending_count == 42:
        print("Test PASSED: Handshake and signal propagation work.")
        sys.exit(0)
    else:
        print(f"Test FAILED: ready={received_ready}, count={received_pending_count}")
        sys.exit(1)

if __name__ == "__main__":
    # Add project root to path so we can import backend.bridge
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    test_handshake()
