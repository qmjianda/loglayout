# LogLayer 项目学习指南 (Learning Path)

欢迎来到 LogLayer 开发者社区！本项目是一个专为处理 **巨型日志文件** (GB 级) 设计的高性能查看器。通过阅读本指南，你将了解项目的设计哲学、核心架构以及如何高效地进行二次开发。

---

## 1. 核心设计哲学 (Philosophy)

*   **性能为王**: 所有的设计都围绕“快速响应”展开。千万行日志的加载、搜索、过滤必须在秒级甚至毫秒级完成。
*   **层级流水线 (Layer Pipeline)**: 借用 Photoshop 的图层概念，每一项过滤信息、高亮规则都是一个“图层”，叠加后生成最终视图。
*   **跨平台桥接 (Cross-bridge)**: 使用 Python 处理密集型计算（文件索引、正则匹配），使用 React/Monaco 构建极致的 UI 体验。

---

## 2. 核心技术栈 (Tech Stack)

*   **Backend (Python)**:
    *   `PyQt6` / `PySide6`: 桌面框架，提供 `QWebEngine` 加载前端视图。
    *   `mmap`: 内存映射文件，实现零拷贝读取超大文件。
    *   `ripgrep`: 集成最快的搜索工具进行极速预过滤。
    *   `QWebChannel`: 前后端通信桥梁。
*   **Frontend (React + TS)**:
    *   `Vite`: 极速构建工具。
    *   `Monaco Editor (Custom logic)`: 日志渲染核心（注：目前部分版本使用了自定义虚拟滚动实现，以获得更细粒度的控制）。
    *   `TailwindCSS`: 现代化样式框架。

---

## 3. 架构初探 (Architecture)

### 后端核心逻辑 (`backend/`)
1.  **`bridge.py`**: 通信中心。负责接收前端指令（如“打开文件”），调度 Worker 线程，并将进度信号（Signals）发回前端。
2.  **`loglayer/core.py`**: 定义了图层协议。`NativeLayer` (C++ 级速度) 和 `LogicLayer` (Python 级灵活) 的基类。
3.  **Workers**: `IndexingWorker` 扫描换行符建立索引；`PipelineWorker` 运行过滤流水线。

### 前端核心组件 (`frontend/src/`)
1.  **`App.tsx`**: 全局状态聚合。使用 Hook 分离架构（`useFileManagement`, `useLayerManagement` 等）。
2.  **`LogViewer.tsx`**: 极致优化的虚拟列表渲染器。支持“滚轮缩放”以绕过浏览器像素高度限制。
3.  **`bridge_client.ts`**: 前端 RPC 客户端，通过 `window.fileBridge` 与 Python 交互。

---

## 4. 学习路线图 (Roadmap)

### 第一阶段：理解数据流 (Data Flow)
*   **任务**: 打开一个文件，观察日志是如何显示的。
*   **代码阅读**:
    *   `backend/bridge.py` 中的 `open_file`。
    *   `frontend/src/hooks/useBridge.ts` 监听 `onFileLoaded`。
    *   `frontend/src/components/LogViewer.tsx` 如何调用 `readProcessedLines` 获取数据。

### 第二阶段：掌握图层系统 (Layer System)
*   **任务**: 在 UI 中添加一个“过滤”图层，看看日志行数是如何变化的。
*   **代码阅读**:
    *   `backend/loglayer/core.py` 中的 `filter_line`。
    *   `backend/bridge.py` 中的 `PipelineWorker` 了解 `ripgrep` 是如何串联的。

### 第三阶段：扩展功能 (Extending)
*   **任务**: 尝试编写一个简单的 Python 插件图层。
*   **参考**: 查看 `backend/loglayer/builtin/` 下的内置图层实现。

---

## 5. 调试技巧 (Debugging)

1.  **前端控制台**: 在应用界面按 `F12` 或右键“检查” (如果 PyQt 开启了 Remote Debugging)。
2.  **后端日志**: 观察启动终端的 Python 输出。
3.  **Dev Server**: 开发前端时运行 `npm run dev`，后端 `main.py` 会自动寻找本地开发地址。

希望这份指南能帮你快速上手！如有疑问，请查阅 `docs/DESIGN.md` 获取更深层级的架构设计概念。
