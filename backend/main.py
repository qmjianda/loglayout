import sys
import os
from qt_compat import (
    QtCore, QtWidgets, QtGui, QtWebEngineWidgets, QtWebEngineCore, QtWebChannel,
    pyqtSlot, pyqtSignal, Signal, Slot
)
from qt_compat import (
    QUrl, QObject, QApplication, QMainWindow, QIcon,
    QWebEngineView, QWebEngineSettings, QWebEnginePage, QWebChannel
)
from bridge import FileBridge, get_log_files_recursive

class CustomWebEnginePage(QWebEnginePage):
    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        print(f"JS [{lineNumber}]: {message} ({sourceID})")

class Bridge(QObject):
    # Signals can be emitted to React
    fileOpened = pyqtSignal(str)
    
    def __init__(self):
        super().__init__()

    @pyqtSlot(result=str)
    def get_platform(self):
        return sys.platform

class CustomWebView(QWebEngineView):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptDrops(True)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        urls = event.mimeData().urls()
        if urls:
            window = self.window()
            if hasattr(window, 'handle_dropped_urls'):
                window.handle_dropped_urls(urls)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LogLayer")
        self.resize(1200, 800)
        
        # Set window icon
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "icon.png")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        os.environ['QTWEBENGINE_REMOTE_DEBUGGING'] = '12345'

        self.browser = CustomWebView(self)
        self.browser.setPage(CustomWebEnginePage(self.browser))
        self.setCentralWidget(self.browser)

        # Enable developer extras and local file access (PyQt6 style)
        settings = self.browser.settings()
        try:
            # Handle Qt6 vs Qt5 attribute naming
            attr = getattr(QWebEngineSettings.WebAttribute, 'LocalContentCanAccessFileUrls', None) if hasattr(QWebEngineSettings, 'WebAttribute') else getattr(QWebEngineSettings, 'LocalContentCanAccessFileUrls', None)
            if attr is not None:
                settings.setAttribute(attr, True)
        except Exception as e:
            print(f"Warning: Could not set LocalContentCanAccessFileUrls: {e}")

        # Setup WebChannel
        self.channel = QWebChannel()
        self.bridge = Bridge()
        self.file_bridge = FileBridge()
        self.channel.registerObject('bridge', self.bridge)
        self.channel.registerObject('fileBridge', self.file_bridge)
        self.browser.page().setWebChannel(self.channel)

        # Load the React app
        # Handle PyInstaller frozen state
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))

        prod_index_path = os.path.join(base_dir, "www", "index.html")

        if os.path.exists(prod_index_path):
            # Start local HTTP server
            self.server_port = self._start_local_server(os.path.join(base_dir, "www"))
            url = f"http://127.0.0.1:{self.server_port}/index.html"
            print(f"Loading local frontend from: {url}")
            self.browser.setUrl(QUrl(url))
        else:
            print("Loading dev frontend from: http://localhost:3000")
            self.browser.setUrl(QUrl("http://localhost:3000"))

        # Pending CLI paths
        self.pending_cli_paths = []

    def _start_local_server(self, root_dir):
        from threading import Thread
        import socket
        from http.server import SimpleHTTPRequestHandler, HTTPServer

        class QuietHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=root_dir, **kwargs)
            def log_message(self, format, *args):
                pass

        # Find a free port
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
        sock.close()

        server = HTTPServer(('127.0.0.1', port), QuietHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return port

    def load_cli_paths(self, paths):
        self.pending_cli_paths = paths
        self.file_bridge.frontendReady.connect(self._on_frontend_ready)

    def _on_frontend_ready(self):
        if not self.pending_cli_paths:
            return

        pending_files = []
        for path in self.pending_cli_paths:
            abs_path = os.path.abspath(path)
            if os.path.isdir(abs_path):
                log_files = get_log_files_recursive(abs_path)
                pending_files.extend([f['path'] for f in log_files])
            elif os.path.isfile(abs_path):
                pending_files.append(abs_path)
        
        if pending_files:
            # Send count first so frontend can show loading state
            self.file_bridge.pendingFilesCount.emit(len(pending_files))
            
            # Open files
            for full_path in pending_files:
                self._open_single_file(full_path, "cli")
        
        # Clear paths so we don't load them again if ready is called again
        self.pending_cli_paths = []

    def handle_dropped_urls(self, urls):
        for url in urls:
            path = url.toLocalFile()
            abs_path = os.path.abspath(path)
            if os.path.isdir(abs_path):
                log_files = get_log_files_recursive(abs_path)
                for f in log_files:
                    self._open_single_file(f['path'], "dropped")
            elif os.path.isfile(abs_path):
                self._open_single_file(abs_path, "dropped")

    def _open_single_file(self, path, prefix):
        try:
            stats = os.stat(path)
            file_id = f"{prefix}-{int(stats.st_mtime)}-{stats.st_size}"
            self.file_bridge.open_file(file_id, path)
        except Exception as e:
            print(f"Error opening {path}: {e}")

    # The following are no longer needed on MainWindow if CustomWebView handles them,
    # but we keep handle_dropped_urls as a shared helper.

if __name__ == "__main__":
    import argparse
    
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='LogLayer - Log file viewer')
    parser.add_argument('paths', nargs='*', help='Files or folders to open')
    args, qt_args = parser.parse_known_args()
    
    # Qt 需要 sys.argv[0] 作为程序名
    qt_argv = [sys.argv[0]] + qt_args
    
    app = QApplication(qt_argv)
    
    # 设置程序图标 (Windows 任务栏也生效)
    icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "icon.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
        # Windows: 让任务栏图标正确显示 (避免被合并到 python 进程)
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Antigravity.LogLayer.0.1")
            
    window = MainWindow()
    window.setAcceptDrops(True)
    window.show()
    
    # 延迟打开命令行传入的文件/文件夹
    if args.paths:
        window.load_cli_paths(args.paths)
    
    sys.exit(app.exec())
