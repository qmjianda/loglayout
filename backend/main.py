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
# 导入核心桥接类和工具函数
from bridge import FileBridge, get_log_files_recursive

class CustomWebEnginePage(QWebEnginePage):
    """
    自定义 Web 页面类，用于捕获 JavaScript 控制台输出并打印到 Python 控制台。
    方便调试前端逻辑。
    """
    def javaScriptConsoleMessage(self, level, message, lineNumber, sourceID):
        print(f"JS [{lineNumber}]: {message} ({sourceID})")

class Bridge(QObject):
    """
    通用桥接对象，处理与具体文件无关的全局信号。
    """
    # 定义一个信号，可以发送给 React
    fileOpened = pyqtSignal(str)
    
    def __init__(self):
        super().__init__()

    @pyqtSlot(result=str)
    def get_platform(self):
        """
        供前端调用的方法：获取当前操作系统平台名称。
        """
        return sys.platform

class CustomWebView(QWebEngineView):
    """
    自定义 Web 视图，支持拖拽文件。
    """
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptDrops(True)  # 启用拖放支持

    def dragEnterEvent(self, event):
        # 当拖入内容包含 URL (文件路径) 时接受
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
        """
        处理文件拖放事件
        """
        urls = event.mimeData().urls()
        if urls:
            window = self.window()
            # 将拖放的文件转交给主窗口处理
            if hasattr(window, 'handle_dropped_urls'):
                window.handle_dropped_urls(urls)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LogLayer")
        self.resize(1200, 800)
        
        # 设置窗口图标
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "icon.png")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        # 开启远程调试端口，方便通过 Chrome 浏览器调试嵌入的 WebView
        os.environ['QTWEBENGINE_REMOTE_DEBUGGING'] = '12345'

        # 初始化 Web 视图
        self.browser = CustomWebView(self)
        self.browser.setPage(CustomWebEnginePage(self.browser))
        self.setCentralWidget(self.browser)

        # 启用开发者选项和本地文件访问权限
        settings = self.browser.settings()
        try:
            # 兼容 Qt6 和 Qt5 的属性名差异
            attr = getattr(QWebEngineSettings.WebAttribute, 'LocalContentCanAccessFileUrls', None) if hasattr(QWebEngineSettings, 'WebAttribute') else getattr(QWebEngineSettings, 'LocalContentCanAccessFileUrls', None)
            if attr is not None:
                settings.setAttribute(attr, True)
        except Exception as e:
            print(f"Warning: Could not set LocalContentCanAccessFileUrls: {e}")

        # 配置 WebChannel 通信桥梁
        self.channel = QWebChannel()
        self.bridge = Bridge()
        self.file_bridge = FileBridge() # 核心业务逻辑桥接器
        
        # 注册对象到 JS window.qt.webChannelTransport
        self.channel.registerObject('bridge', self.bridge)
        self.channel.registerObject('fileBridge', self.file_bridge)
        self.browser.page().setWebChannel(self.channel)

        # 加载 React 前端页面
        # 处理 PyInstaller 打包后的路径
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))

        prod_index_path = os.path.join(base_dir, "www", "index.html")

        if os.path.exists(prod_index_path):
            # 生产环境：启动本地 HTTP 服务器加载构建好的静态文件
            self.server_port = self._start_local_server(os.path.join(base_dir, "www"))
            url = f"http://127.0.0.1:{self.server_port}/index.html"
            print(f"Loading local frontend from: {url}")
            self.browser.setUrl(QUrl(url))
        else:
            # 开发环境：加载 Vite 开发服务器
            print("Loading dev frontend from: http://localhost:3000")
            self.browser.setUrl(QUrl("http://localhost:3000"))

        # 待处理的命令行传入路径
        self.pending_cli_paths = []

    def _start_local_server(self, root_dir):
        """
        启动一个微型 HTTP 服务器来托管前端静态文件。
        在生产环境(打包后)使用，避免跨域和文件协议限制。
        """
        from threading import Thread
        import socket
        from http.server import SimpleHTTPRequestHandler, HTTPServer

        class QuietHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=root_dir, **kwargs)
            def log_message(self, format, *args):
                # 屏蔽服务器日志输出，保持控制台整洁
                pass

        # 自动寻找一个空闲端口
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
        sock.close()

        server = HTTPServer(('127.0.0.1', port), QuietHandler)
        # 在守护线程中运行服务器，随主程序退出而退出
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        return port

    def load_cli_paths(self, paths):
        """记录命令行传入的文件路径，等待前端准备好后再打开"""
        self.pending_cli_paths = paths
        self.file_bridge.frontendReady.connect(self._on_frontend_ready)

    def _on_frontend_ready(self):
        """当前端 JS 调用 bridge.frontendReady() 时触发"""
        if not self.pending_cli_paths:
            return

        pending_files = []
        for path in self.pending_cli_paths:
            abs_path = os.path.abspath(path)
            if os.path.isdir(abs_path):
                # 如果是文件夹，递归查找日志文件
                log_files = get_log_files_recursive(abs_path)
                pending_files.extend([f['path'] for f in log_files])
            elif os.path.isfile(abs_path):
                pending_files.append(abs_path)
        
        if pending_files:
            # 通知前端有多少个文件正在加载（显示进度墙）
            self.file_bridge.pendingFilesCount.emit(len(pending_files))
            
            # 一个个打开文件
            for full_path in pending_files:
                self._open_single_file(full_path, "cli")
        
        # 处理完毕，清空队列
        self.pending_cli_paths = []

    def handle_dropped_urls(self, urls):
        """处理从系统拖入窗口的文件"""
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
        """生成唯一 ID 并调用 bridge 打开文件"""
        try:
            stats = os.stat(path)
            # 使用文件修改时间和大小生成一个简单的唯一ID
            file_id = f"{prefix}-{int(stats.st_mtime)}-{stats.st_size}"
            self.file_bridge.open_file(file_id, path)
        except Exception as e:
            print(f"Error opening {path}: {e}")

if __name__ == "__main__":
    import argparse
    
    # 1. 解析命令行参数 (例如: python main.py ./logs/test.log)
    parser = argparse.ArgumentParser(description='LogLayer - Log file viewer')
    parser.add_argument('paths', nargs='*', help='Files or folders to open')
    args, qt_args = parser.parse_known_args()
    
    # 2. 初始化 Qt 窗口环境
    # Qt 需要 sys.argv[0] 或自定义列表作为程序名
    qt_argv = [sys.argv[0]] + qt_args
    app = QApplication(qt_argv)
    
    # 3. 设置全局图标和 Windows 专用配置
    icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "icon.png")
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
        if sys.platform == "win32":
            import ctypes
            # 让 Windows 任务栏正确区分 Python 解释器和我们的应用，显示独立图标
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Antigravity.LogLayer.0.1")
            
    # 4. 创建并显示主窗口
    window = MainWindow()
    window.setAcceptDrops(True)
    window.show()
    
    # 5. 如果有命令行路径，安排加载
    if args.paths:
        window.load_cli_paths(args.paths)
    
    # 6. 运行 Qt 事件循环
    sys.exit(app.exec())
