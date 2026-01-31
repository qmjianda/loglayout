# LogLayer

[English](#english) | [中文](#chinese)

---

<a name="english"></a>
## English

LogLayer is a high-performance log analysis tool designed to handle massive log files (1GB+) with ease. It combines the raw power of Python's system-level operations with a modern React frontend via PyQt6 WebEngine, providing a desktop-class experience for developers and SREs.

### 🚀 Key Features
- **Lightning-Fast Indexing**: Leverages `mmap` and multi-threaded indexing to parse 1GB+ logs in seconds.
- **O(1) Virtual Scrolling**: High-performance virtualization ensures consistent 60FPS UI even when viewing millions of lines.
- **Native Search (ripgrep)**: Integrated with `ripgrep` for blazing-fast, case-insensitive searching across massive datasets.
- **Layered Pipeline Engine**: A Python-powered backend pipeline that supports multiple FILTER and HIGHLIGHT layers applied in real-time.
- **Dual-Line Numbering**: Seamlessly switch between or view both sequential display line numbers and physical file line indices.
- **Native Desktop Interop**: Supports Drag & Drop, native file dialogs, and high-DPI scaling.

### 🛠 Tech Stack
- **Backend**: Python 3.10+, PyQt6, QWebChannel, `mmap`, `ripgrep`.
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4.

### 🚦 Quick Start

#### 1. Prerequisites
- **Node.js**: v18+
- **Python**: v3.10+
- **ripgrep**: `rg` must be in your system PATH.

#### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-repo/loglayer.git
cd loglayer

# Install frontend dependencies
npm install

# Install backend dependencies
pip install PyQt6 PyQt6-WebEngine
```

#### 3. Running the App
Open two terminal windows:

**Terminal 1 (Vite Dev Server)**:
```bash
npm run dev
```

**Terminal 2 (Python GUI Shell)**:
```bash
python backend/main.py
```

---

<a name="chinese"></a>
## 中文

LogLayer 是一款专门针对海量日志文件（1GB+）设计的高性能日志分析工具。它通过 PyQt6 WebEngine 桥接了 Python 原生系统级的处理能力与现代化的 React 前端，为开发者和运维工程师提供原生级别的桌面分析体验。

### 🚀 核心特性
- **极速索引**: 利用 `mmap` 和多线程偏移量索引技术，数秒内即可载入 GB 级日志。
- **O(1) 虚拟化渲染**: 高性能虚拟列表确保在处理数百万行日志时，界面依然保持 60FPS 的流畅度。
- **原生搜索 (ripgrep)**: 集成 `ripgrep`，在大规模数据集中提供瞬间响应的全文检索。
- **图层流水线引擎**: 基于 Python 后端的处理流水线，支持多路“过滤器（FILTER）”和“高亮（HIGHLIGHT）”图层叠加。
- **双行号系统**: 同时支持显示连续的序列行号和日志文件的原始物理行号。
- **原生桌面交互**: 支持文件拖拽（Drag & Drop）、原生文件选择对话框及高分屏（DPI）自动缩放。

### 🛠 技术栈
- **后端**: Python 3.10+, PyQt6, QWebChannel, `mmap`, `ripgrep`.
- **前端**: React 19, TypeScript, Vite, Tailwind CSS 4.

### 🚦 快速开始

#### 1. 前置要求
- **Node.js**: v18+
- **Python**: v3.10+
- **ripgrep**: 确保 `rg` 命令已加入系统环境变量 PATH。

#### 2. 安装
```bash
# 克隆仓库
git clone https://github.com/your-repo/loglayer.git
cd loglayer

# 安装前端依赖
npm install

# 安装后端依赖
pip install PyQt6 PyQt6-WebEngine
```

#### 3. 运行应用
需要开启两个终端：

**终端 1 (Vite 开发服务器)**:
```bash
npm run dev
```

**终端 2 (Python 核心外壳)**:
```bash
python backend/main.py
```
