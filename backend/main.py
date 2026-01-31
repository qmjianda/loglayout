import sys
import os
from PyQt6.QtCore import QUrl, QObject, pyqtSlot, pyqtSignal
from PyQt6.QtWidgets import QApplication, QMainWindow
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

    @pyqtSlot(str, result=str)
    def greet(self, name):
        return f"Hello, {name}! (from Python)"

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
            if hasattr(window, 'file_bridge'):
                for url in urls:
                    path = url.toLocalFile()
                    if os.path.isdir(path):
                        # Recursive folder discovery
                        for root, dirs, files in os.walk(path):
                            for file in files:
                                if file.lower().endswith(('.log', '.txt', '.json')) or '.' not in file:
                                    full_path = os.path.join(root, file)
                                    file_id = f"dropped-{int(os.path.getmtime(full_path))}-{os.path.getsize(full_path)}"
                                    window.file_bridge.open_file(file_id, full_path)
                    elif os.path.isfile(path):
                        file_id = f"dropped-{int(os.path.getmtime(path))}-{os.path.getsize(path)}"
                        window.file_bridge.open_file(file_id, path)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LogLayer")
        self.resize(1200, 800)
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

        # Print UserAgent for debugging
        print(f"PyQt Browser UserAgent: {self.browser.page().profile().httpUserAgent()}")



    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        urls = event.mimeData().urls()
        if urls:
            for url in urls:
                path = url.toLocalFile()
                if os.path.isdir(path):
                    # Recursive folder discovery
                    for root, dirs, files in os.walk(path):
                        for file in files:
                            if file.lower().endswith(('.log', '.txt', '.json')) or '.' not in file:
                                full_path = os.path.join(root, file)
                                file_id = f"dropped-{int(os.path.getmtime(full_path))}-{os.path.getsize(full_path)}"
                                self.file_bridge.open_file(file_id, full_path)
                elif os.path.isfile(path):
                    file_id = f"dropped-{int(os.path.getmtime(path))}-{os.path.getsize(path)}"
                    self.file_bridge.open_file(file_id, path)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.setAcceptDrops(True) # Enable drops
    window.show()
    sys.exit(app.exec())
