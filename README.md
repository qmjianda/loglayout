# LogLayer

[English](#english) | [中文](#chinese)

---

<a name="english"></a>
## English

LogLayer is a high-performance log analysis tool designed to handle massive log files (1GB+) with ease. It combines the raw power of Python's system-level operations with a modern React frontend via a Qt-based WebEngine bridge, providing a desktop-class experience for developers and SREs.

### 🚀 Key Features
- **Lightning-Fast Indexing**: Leverages `mmap` and multi-threaded indexing to parse 1GB+ logs in seconds.
- **O(1) Virtual Scrolling**: High-performance virtualization ensures consistent 60FPS UI even when viewing millions of lines.
- **Native Search (ripgrep)**: Integrated with `ripgrep` for blazing-fast, case-insensitive searching across massive datasets.
- **Layered Pipeline Engine**: A Python-powered backend pipeline that supports multiple FILTER and HIGHLIGHT layers applied in real-time.
- **Workspace Session Persistence**: Automatically saves and restores your opened files and layer configurations into a `.loglayer/` folder.
- **One-Click Offline Packaging**: Build a standalone, portable distribution for Windows and Linux with a single command.
- **Cross-Library Qt Support**: Compatible with PyQt6, PySide6, PyQt5, and PySide2.

### 🛠 Tech Stack
- **Backend**: Python 3.10+, `qt_compat` (PyQt/PySide), QWebChannel, `mmap`, `ripgrep`.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4.

### 🚦 Quick Start

#### 1. Prerequisites
- **Node.js**: v18+
- **Python**: v3.10+
- **Qt Bindings**: One of `PyQt6`, `PySide6`, `PyQt5`, or `PySide2`.

#### 2. Installation
```bash
# Clone the repository
git clone https://github.com/qmjianda/loglayout.git
cd loglayer

# Install frontend dependencies
npm install

# Install backend dependencies (example for PyQt6)
pip install PyQt6 PyQt6-WebEngine
```

#### 3. Running the App
**Development Mode**: Open two terminal windows.
1. `npm run dev`
2. `python backend/main.py`

**Standalone Packaging**:
- **Source-based Bundle**: Run `package.bat` (Win) or `./package.sh` (Linux). Requires Python on the user's machine.
- **Standalone EXE (Frozen)**: Run `package_exe.bat` (Win) or `./package_exe.sh` (Linux). Requires `pip install pyinstaller`. No Python required on the target machine.
The build will be generated in `dist_offline/`.

---

<a name="chinese"></a>
## 中文

LogLayer 是一款专门针对海量日志文件（1GB+）设计的高性能日志分析工具。它通过 Qt WebEngine 桥接了 Python 原生系统级的处理能力与现代化的 React 前端，为开发者和运维工程师提供原生级别的桌面分析体验。

### 🚀 核心特性
- **极速索引**: 利用 `mmap` 和多线程偏移量索引技术，数秒内即可载入 GB 级日志。
- **O(1) 虚拟化渲染**: 高性能虚拟列表确保在处理数百万行日志时，界面依然保持 60FPS 的流畅度。
- **原生搜索 (ripgrep)**: 集成 `ripgrep`，在大规模数据集中提供瞬间响应的全文检索。
- **图层流水线引擎**: 基于 Python 后端的处理流水线，支持多路“过滤器（FILTER）”和“高亮（HIGHLIGHT）”图层叠加。
- **工作区会话持久化**: 自动保存并恢复已打开的文件列表和图层配置（存储于 `.loglayer/` 目录）。
- **一键离线发布**: 提供一键打包脚本，生成支持 Windows 和 Linux 的自包含绿色版离线应用。
- **广泛的 Qt 兼容性**: 完美支持 PyQt6, PySide6, PyQt5, 以及 PySide2。

### 🛠 技术栈
- **后端**: Python 3.10+, `qt_compat` (PyQt/PySide), QWebChannel, `mmap`, `ripgrep`.
- **前端**: React 19, TypeScript, Vite, Tailwind CSS 4.

### 🚦 快速开始

#### 1. 前置要求
- **Node.js**: v18+
- **Python**: v3.10+
- **Qt 绑定**: 安装 `PyQt6`, `PySide6`, `PyQt5`, 或 `PySide2` 其中的任意一个。

#### 2. 安装
```bash
# 克隆仓库
git clone https://github.com/qmjianda/loglayout.git
cd loglayer

# 安装前端依赖
npm install

# 安装后端依赖 (以 PyQt6 为例)
pip install PyQt6 PyQt6-WebEngine
```

#### 3. 运行应用
**开发模式**: 需要开启两个终端。
1. `npm run dev`
2. `python backend/main.py`

**离线打包**:
- **源码包**: 运行 `package.bat` (Win) 或 `./package.sh` (Linux)。需要目标机器安装有 Python。
- **独立可执行程序 (Frozen)**: 运行 `package_exe.bat` (Win) 或 `./package_exe.sh` (Linux)。需要先安装 `pip install pyinstaller`。生成的程序无需 Python 即可运行。
打包结果将生成在 `dist_offline/` 目录下。
