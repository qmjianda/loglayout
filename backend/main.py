import os
import sys
import json
import asyncio
import threading
import uvicorn
import webview
import argparse
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from contextlib import asynccontextmanager

# Import refactored bridge
from bridge import FileBridge, get_log_files_recursive

# Global bridge instance
bridge = FileBridge()

# Event loop reference for thread-safe broadcasting
main_loop = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    print("[Server] Event loop captured for signal broadcasting.")
    yield
    print("[Server] Shutting down.")

# 1. Initialize FastAPI with lifespan
app = FastAPI(lifespan=lifespan)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        # Fire and forget broadcasting with robust delivery
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WebSocket] Broadcast error to {connection}: {e}")
                self.disconnect(connection)

manager = ConnectionManager()

# Setup Bridge Signals to WebSocket
def broadcast_signal(signal_name, *args):
    """
    Called from bridge threads/uvicorn threads to broadcast signals via WebSockets.
    """
    message = {
        "signal": signal_name,
        "args": args
    }
    
    if main_loop:
        try:
            # Schedule the coroutine on the main event loop from ANY thread
            asyncio.run_coroutine_threadsafe(manager.broadcast(message), main_loop)
        except Exception as e:
            print(f"[Bridge] Signal broadcast failed for {signal_name}: {e}")
    else:
        # Pre-broadcast or late broadcast
        print(f"[Bridge] Global loop not ready for signal: {signal_name}")

# Connect signals
bridge.fileLoaded.connect(lambda *args: broadcast_signal("fileLoaded", *args))
bridge.pipelineFinished.connect(lambda *args: broadcast_signal("pipelineFinished", *args))
bridge.statsFinished.connect(lambda *args: broadcast_signal("statsFinished", *args))
bridge.operationStarted.connect(lambda *args: broadcast_signal("operationStarted", *args))
bridge.operationProgress.connect(lambda *args: broadcast_signal("operationProgress", *args))
bridge.operationError.connect(lambda *args: broadcast_signal("operationError", *args))
bridge.operationStatusChanged.connect(lambda *args: broadcast_signal("operationStatusChanged", *args))
bridge.pendingFilesCount.connect(lambda *args: broadcast_signal("pendingFilesCount", *args))
bridge.frontendReady.connect(lambda *args: broadcast_signal("frontendReady", *args))

# 2. Define API Endpoints (FastAPI)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Ping/Pong or keep-alive if needed
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/platform")
def get_platform():
    return sys.platform

@app.post("/api/open_file")
def open_file(data: dict = Body(...)):
    return bridge.open_file(data['file_id'], data['file_path'])

@app.post("/api/sync_all")
def sync_all(data: dict = Body(...)):
    return bridge.sync_all(data['file_id'], data['layers_json'], data['search_json'] if 'search_json' in data else None)

@app.get("/api/read_processed_lines")
def read_processed_lines(file_id: str, start_line: int, count: int):
    # Returns raw string from bridge, FastAPI will wrap it in JSON correctly
    return json.loads(bridge.read_processed_lines(file_id, start_line, count))

@app.get("/api/get_search_match_index")
def get_search_match_index(file_id: str, rank: int):
    return bridge.get_search_match_index(file_id, rank)

@app.get("/api/get_search_matches_range")
def get_search_matches_range(file_id: str, start_rank: int, count: int):
    return json.loads(bridge.get_search_matches_range(file_id, start_rank, count))

@app.get("/api/get_layer_registry")
def get_layer_registry():
    return json.loads(bridge.get_layer_registry())

@app.post("/api/reload_plugins")
def reload_plugins():
    return bridge.reload_plugins()

@app.post("/api/ready")
def ready():
    bridge.ready()
    return True

@app.post("/api/search_ripgrep")
def search_ripgrep(data: dict = Body(...)):
    return bridge.search_ripgrep(data['file_id'], data['query'], data.get('regex', False), data.get('case_sensitive', False))

@app.post("/api/close_file")
def close_file(data: dict = Body(...)):
    bridge.close_file(data['file_id'])
    return True

@app.get("/api/select_files")
def select_files():
    return json.loads(bridge.select_files())

@app.get("/api/select_folder")
def select_folder():
    return bridge.select_folder()

@app.get("/api/list_logs_in_folder")
def list_logs_in_folder(folder_path: str):
    return json.loads(bridge.list_logs_in_folder(folder_path))

@app.get("/api/list_directory")
def list_directory(folder_path: str):
    return json.loads(bridge.list_directory(folder_path))

@app.post("/api/save_workspace_config")
def save_workspace_config(data: dict = Body(...)):
    return bridge.save_workspace_config(data['folder_path'], data['config_json'])

@app.get("/api/load_workspace_config")
def load_workspace_config(folder_path: str):
    return bridge.load_workspace_config(folder_path)

# Serve Frontend
base_dir = os.path.dirname(os.path.abspath(__file__))
www_dir = os.path.join(base_dir, "www")

if os.path.exists(www_dir):
    app.mount("/", StaticFiles(directory=www_dir, html=True), name="static")

def run_server(port):
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="error")

def start_app():
    parser = argparse.ArgumentParser(description='LogLayer - Log file viewer')
    parser.add_argument('paths', nargs='*', help='Files or folders to open')
    parser.add_argument('--port', type=int, default=12345, help='Backend server port')
    parser.add_argument('--no-ui', action='store_true', help='Start server only, no UI window')
    args = parser.parse_args()

    port = args.port
    
    # Start server in thread
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    
    # Give server a moment to start
    time.sleep(1)
    
    url = f"http://127.0.0.1:{port}"
    if not os.path.exists(www_dir):
        # Development mode (Vite)
        url = "http://localhost:3000"
        print(f"Backend running on http://127.0.0.1:{port}")
        print(f"Opening dev frontend: {url}")
    else:
        print(f"Starting LogLayer on {url}")

    # Handle CLI paths
    def on_ready():
        if args.paths:
            pending_files = []
            for path in args.paths:
                abs_path = os.path.abspath(path)
                if os.path.isdir(abs_path):
                    log_files = get_log_files_recursive(abs_path)
                    pending_files.extend([f['path'] for f in log_files])
                elif os.path.isfile(abs_path):
                    pending_files.append(abs_path)
            
            if pending_files:
                bridge.pendingFilesCount.emit(len(pending_files))
                for full_path in pending_files:
                    try:
                        stats = os.stat(full_path)
                        file_id = f"cli-{int(stats.st_mtime)}-{stats.st_size}"
                        bridge.open_file(file_id, full_path)
                    except: pass

    # Subscribe to frontendReady to load CLI paths
    bridge.frontendReady.connect(on_ready)

    if not args.no_ui:
        # Create webview window
        window = webview.create_window('LogLayer', url, width=1200, height=800)
        # Pass window to bridge for native dialogs
        bridge.window = window
        # Start webview
        webview.start()
    else:
        try:
            while True: time.sleep(1)
        except KeyboardInterrupt:
            pass

if __name__ == "__main__":
    start_app()
