import sys
import os
from PyQt6.QtCore import QUrl, QObject, pyqtSlot, pyqtSignal, QSize
from PyQt6.QtWidgets import QApplication, QMainWindow
from PyQt6.QtGui import QIcon
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEnginePage
from PyQt6.QtWebChannel import QWebChannel
from bridge import FileBridge

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
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        except Exception as e:
            print(f"Warning: Could not set LocalContentCanAccessFileUrls: {e}")

        # Setup WebChannel
        self.channel = QWebChannel()
        self.bridge = Bridge()
        self.file_bridge = FileBridge()
        self.channel.registerObject('bridge', self.bridge)
        self.channel.registerObject('fileBridge', self.file_bridge)
        self.browser.page().setWebChannel(self.channel)

        # Load the React app from Vite dev server
        self.browser.setUrl(QUrl("http://localhost:3000"))

        # Pending CLI paths
        self.pending_cli_paths = []

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
                for root, dirs, files in os.walk(abs_path):
                    for file in files:
                        if file.lower().endswith(('.log', '.txt', '.json')) or '.' not in file:
                            pending_files.append(os.path.join(root, file))
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
                # Use the recursive discovery logic from bridge if possible, 
                # but here we need to call open_file for each.
                for root, dirs, files in os.walk(abs_path):
                    for file in files:
                        if file.lower().endswith(('.log', '.txt', '.json')) or '.' not in file:
                            full_path = os.path.join(root, file)
                            self._open_single_file(full_path, "dropped")
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
