import os
import sys
import json
import asyncio
import threading
import uvicorn
import webview
import argparse
import time

# Windows asyncio fix for [WinError 10054]
if sys.platform == 'win32':
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except:
        pass

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
bridge.workspaceOpened.connect(lambda *args: broadcast_signal("workspaceOpened", *args))

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
    return bridge.get_platform_info()

@app.get("/api/has_native_dialogs")
def has_native_dialogs():
    """检查是否支持原生文件对话框（用于 --no-ui 模式检测）"""
    return hasattr(bridge, 'window') and bridge.window is not None

@app.post("/api/open_file")
def open_file(data: dict = Body(...)):
    return bridge.open_file(data['file_id'], data['file_path'])

@app.post("/api/sync_all")
def sync_all(data: dict = Body(...)):
    return bridge.sync_all(data['file_id'], data['layers_json'], data['search_json'] if 'search_json' in data else None)

@app.post("/api/sync_layers")
def sync_layers(data: dict = Body(...)):
    return bridge.sync_layers(data['file_id'], data['layers_json'], data.get('search_json'))

@app.post("/api/sync_decorations")
def sync_decorations(data: dict = Body(...)):
    return bridge.sync_decorations(data['file_id'], data['layers_json'])

@app.get("/api/read_processed_lines")
def read_processed_lines(file_id: str, start_line: int, count: int):
    # Returns raw string from bridge, FastAPI will wrap it in JSON correctly
    return json.loads(bridge.read_processed_lines(file_id, start_line, count))

@app.post("/api/get_lines_by_indices")
def get_lines_by_indices(data: dict = Body(...)):
    """获取指定索引的行内容"""
    return json.loads(bridge.get_lines_by_indices(data['file_id'], data['indices']))

@app.get("/api/get_search_match_index")
def get_search_match_index(file_id: str, rank: int):
    return bridge.get_search_match_index(file_id, rank)

@app.get("/api/get_nearest_search_rank")
def get_nearest_search_rank(file_id: str, current_index: int, direction: str):
    return bridge.get_nearest_search_rank(file_id, current_index, direction)

@app.get("/api/get_search_matches_range")
def get_search_matches_range(file_id: str, start_rank: int, count: int):
    return json.loads(bridge.get_search_matches_range(file_id, start_rank, count))

@app.get("/api/get_layer_registry")
def get_layer_registry():
    return bridge._registry.get_all_types()

@app.get("/api/get_ui_widgets")
def get_ui_widgets():
    """获取所有已加载插件定义的 UI 挂件信息"""
    return bridge._registry.get_ui_widgets()

@app.get("/api/get_widget_data")
def get_widget_data(type_id: str):
    """获取指定挂件的实时数据"""
    widget = bridge._registry.create_widget_instance(type_id)
    if widget:
        return widget.get_data()
    return {}

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

@app.post("/api/list_directory")
def list_directory_post(data: dict = Body(...)):
    """POST 版本的目录列表 API，用于远程路径选择器"""
    folder_path = data.get('path', '')
    items = json.loads(bridge.list_directory(folder_path))
    return {"items": items, "path": folder_path}

@app.post("/api/save_workspace_config")
def save_workspace_config(data: dict = Body(...)):
    return bridge.save_workspace_config(data['folder_path'], data['config_json'])

@app.get("/api/load_workspace_config")
def load_workspace_config(folder_path: str):
    return bridge.load_workspace_config(folder_path)

# ============================================================
# Bookmark APIs
# ============================================================

@app.post("/api/toggle_bookmark")
def toggle_bookmark(data: dict = Body(...)):
    """切换指定行的书签状态"""
    return json.loads(bridge.toggle_bookmark(data['file_id'], data['line_index']))

@app.get("/api/get_bookmarks")
def get_bookmarks(file_id: str):
    """获取当前文件的书签列表"""
    return json.loads(bridge.get_bookmarks(file_id))

@app.get("/api/get_nearest_bookmark_index")
def get_nearest_bookmark_index(file_id: str, current_index: int, direction: str):
    """查找最近的书签索引"""
    return bridge.get_nearest_bookmark_index(file_id, current_index, direction)

@app.post("/api/clear_bookmarks")
def clear_bookmarks(data: dict = Body(...)):
    """清除指定文件的所有书签"""
    return json.loads(bridge.clear_bookmarks(data['file_id']))

@app.post("/api/update_bookmark_comment")
def update_bookmark_comment(data: dict = Body(...)):
    """更新书签注释"""
    return json.loads(bridge.update_bookmark_comment(data['file_id'], data['line_index'], data['comment']))

@app.get("/api/physical_to_visual_index")
def physical_to_visual_index(file_id: str, physical_index: int):
    """将物理行索引转换为虚拟行索引"""
    return bridge.physical_to_visual_index(file_id, physical_index)


# Serve Frontend
base_dir = os.path.dirname(os.path.abspath(__file__))
www_dir = os.path.join(base_dir, "www")

if os.path.exists(www_dir):
    app.mount("/", StaticFiles(directory=www_dir, html=True), name="static")

def run_server(port):
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    except BaseException as e:
        print(f"[ServerThread] Error: {e}")

def start_app():
    parser = argparse.ArgumentParser(description='LogLayer - Log file viewer')
    parser.add_argument('paths', nargs='*', help='Files or folders to open')
    parser.add_argument('--port', type=int, default=12345, help='Backend server port')
    parser.add_argument('--no-ui', action='store_true', help='Start server only, no UI window')
    args = parser.parse_args()

    port = args.port
    
    # Windows taskbar icon fix
    if sys.platform == 'win32':
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("qmjianda.loglayer.v1")
        except:
            pass
    
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
        if args.paths and len(args.paths) > 0:
            path = args.paths[0]
            abs_path = os.path.abspath(path)
            
            if os.path.isdir(abs_path):
                # Only set workspace, don't open all files (as requested)
                bridge.workspaceOpened.emit(abs_path)
            elif os.path.isfile(abs_path):
                # Just open the single file
                try:
                    stats = os.stat(abs_path)
                    file_id = f"cli-{int(stats.st_mtime)}-{stats.st_size}-{hash(abs_path)}"
                    bridge.open_file(file_id, abs_path)
                except Exception as e:
                    print(f"[Main] CLI open_file error: {e}")

    # Subscribe to frontendReady to load CLI paths
    bridge.frontendReady.connect(on_ready)

    if not args.no_ui:
        # Create webview window
        window = webview.create_window('LogLayer', url, width=1200, height=800)
        # Pass window to bridge for native dialogs
        bridge.window = window
        
        # Set window icon
        icon_path = os.path.join(base_dir, "assets", "icon.png")
        if not os.path.exists(icon_path):
             # Try fallback path for some environments
             icon_path = os.path.join(os.getcwd(), "backend", "assets", "icon.png")
             
        # Start webview
        webview.start(icon=icon_path if os.path.exists(icon_path) else None)
    else:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            # User interrupted
            pass
        except BaseException as e:
            if not isinstance(e, KeyboardInterrupt):
                print(f"[Main] Error: {e}")
                import traceback
                traceback.print_exc()

if __name__ == "__main__":
    try:
        start_app()
    except BaseException as e:
        print(f"[Main] Fatal error: {e}")
