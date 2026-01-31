import os
import sys

# Qt Compatibility Layer for LogLayer
# Supports PyQt6, PySide6, PyQt5, PySide2 in order of preference

QT_API = None
QT_API_PYQT6 = "PyQt6"
QT_API_PYSIDE6 = "PySide6"
QT_API_PYQT5 = "PyQt5"
QT_API_PYSIDE2 = "PySide2"

# Attempt to detect already loaded Qt
if "PySide6" in sys.modules:
    QT_API = QT_API_PYSIDE6
elif "PyQt6" in sys.modules:
    QT_API = QT_API_PYQT6
elif "PyQt5" in sys.modules:
    QT_API = QT_API_PYQT5
elif "PySide2" in sys.modules:
    QT_API = QT_API_PYSIDE2
else:
    # Try imports
    try:
        import PyQt6
        QT_API = QT_API_PYQT6
    except ImportError:
        try:
            import PySide6
            QT_API = QT_API_PYSIDE6
        except ImportError:
            try:
                import PyQt5
                QT_API = QT_API_PYQT5
            except ImportError:
                try:
                    import PySide2
                    QT_API = QT_API_PYSIDE2
                except ImportError:
                    raise ImportError("No Qt bindings (PyQt6, PySide6, PyQt5, PySide2) found.")

print(f"Using Qt API: {QT_API}")

if QT_API == QT_API_PYQT6:
    from PyQt6 import QtCore, QtWidgets, QtGui, QtWebEngineWidgets, QtWebEngineCore, QtWebChannel
    from PyQt6.QtCore import QUrl, QObject, QThread, pyqtSlot, pyqtSignal, pyqtProperty
    from PyQt6.QtWidgets import QApplication, QMainWindow, QFileDialog
    from PyQt6.QtGui import QIcon
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEngineSettings, QWebEnginePage
    from PyQt6.QtWebChannel import QWebChannel
    
    Signal = pyqtSignal
    Slot = pyqtSlot
    Property = pyqtProperty

elif QT_API == QT_API_PYSIDE6:
    from PySide6 import QtCore, QtWidgets, QtGui, QtWebEngineWidgets, QtWebEngineCore, QtWebChannel
    from PySide6.QtCore import QUrl, QObject, QThread, Slot as pyqtSlot, Signal as pyqtSignal, Property as pyqtProperty
    from PySide6.QtWidgets import QApplication, QMainWindow, QFileDialog
    from PySide6.QtGui import QIcon
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebEngineCore import QWebEngineSettings, QWebEnginePage
    from PySide6.QtWebChannel import QWebChannel
    
    Signal = pyqtSignal
    Slot = pyqtSlot
    Property = pyqtProperty

elif QT_API == QT_API_PYQT5:
    from PyQt5 import QtCore, QtWidgets, QtGui, QtWebEngineWidgets, QtWebChannel
    try:
        from PyQt5 import QtWebEngineCore
    except ImportError:
        QtWebEngineCore = QtWebEngineWidgets
        
    from PyQt5.QtCore import QUrl, QObject, QThread, pyqtSlot, pyqtSignal, pyqtProperty
    from PyQt5.QtWidgets import QApplication, QMainWindow, QFileDialog
    from PyQt5.QtGui import QIcon
    from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEngineSettings, QWebEnginePage
    from PyQt5.QtWebChannel import QWebChannel
    
    Signal = pyqtSignal
    Slot = pyqtSlot
    Property = pyqtProperty

elif QT_API == QT_API_PYSIDE2:
    from PySide2 import QtCore, QtWidgets, QtGui, QtWebEngineWidgets, QtWebChannel
    try:
        from PySide2 import QtWebEngineCore
    except ImportError:
        QtWebEngineCore = QtWebEngineWidgets
        
    from PySide2.QtCore import QUrl, QObject, QThread, Slot as pyqtSlot, Signal as pyqtSignal, Property as pyqtProperty
    from PySide2.QtWidgets import QApplication, QMainWindow, QFileDialog
    from PySide2.QtGui import QIcon
    from PySide2.QtWebEngineWidgets import QWebEngineView, QWebEngineSettings, QWebEnginePage
    from PySide2.QtWebChannel import QWebChannel
    
    Signal = pyqtSignal
    Slot = pyqtSlot
    Property = pyqtProperty

# Generic mappings for parts that differ between major versions
if QT_API in (QT_API_PYQT6, QT_API_PYSIDE6):
    # Qt6 specific mappings if any
    pass
else:
    # Qt5 specific mappings
    # In Qt5, some Enums might be top-level or in different places
    pass
