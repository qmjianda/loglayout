# LogLayer: Project Map

## 1. System Architecture
```mermaid
graph TD
    A[Native OS] -->|mmap| B(Python Backend - FastAPI)
    B <-->|REST + WebSockets| C[React Frontend]
    B -->|ripgrep| D(Large File Search/Filter)
    B -->|Layer Engine| E(Highlight/Filter Processing)
    B -->|IndexingWorker| F[Background Index]
    B -->|PipelineWorker| G[Background ripgrep]
    B -->|pywebview| H[Desktop Shell]
    C -->|On-demand Fetch| B
```

## 2. Module Topology

| Module | Location | Responsibility | Dependencies |
| :--- | :--- | :--- | :--- |
| **Backend Core** | `backend/bridge.py` | Orchestration, Signal handling, File indexing interface | `mmap`, `fastapi`, `websockets` |
| **Unified Logic** | `backend/loglayer/` | **Unified Layer Engine**, UI Schema generator, Plugin discovery, Built-in layers | `re`, `inspect`, `importlib` |
| **API Server** | `backend/main.py` | FastAPI app, REST/WS routes, **pywebview** integration | `fastapi`, `uvicorn`, `pywebview` |
| **Bridge Client** | `frontend/src/bridge_client.ts` | Frontend API, Registry access, REST + WS protocols | `fetch`, `WebSocket` |
| **Dynamic UI** | `frontend/src/components/DynamicUI/` | `InputMapper`, `DynamicForm`: Schema-driven configuration UI | `types.ts` |
| **Log Viewer** | `frontend/src/components/LogViewer.tsx` | Virtual list, scroll scaling, processed line rendering | `bridge_client.ts` |
| **State Orchest.** | `frontend/src/App.tsx` | Global file state, UI layout, hook management | All Components |
| **Tests & Logs** | `tests/` | Unit tests, scale tests, and **test log samples** | `pytest`, `tests/logs/` |
| **Dev Tools** | `tools/` | Build and packaging scripts | `PyInstaller`, `npm` |

## 3. Core Feature List
- [x] **Large File Loading**: 1GB+ indexing via `mmap` offsets.
- [x] **Virtual Scrolling**: Viewport-only rendering for O(1) memory usage.
- [x] **Fast Search**: Native `ripgrep` integration.
- [x] **Native Interop**: Drag & drop (via browser), native file dialogs (via bridge).
- [x] **Layer Pipeline (Backend)**: Python-side filtering and highlighting via `sync_layers`.
- [x] **Browser Compatible**: Architecture ready for web-based deployment.

## 4. Coupling Notes
- **Communication Contract**: `main.py` WebSocket messages must match `WebBridge` signal emitters in `bridge_client.ts`.
- **Virtualization Sync**: `LogViewer` viewport depends on `read_processed_lines` REST endpoint.
- **Layer Sync**: Frontend calls `sync_all` REST endpoint on layer config change.

## 5. Change Log (2026-02-03)
- **Bug Fix**: Repaired Search-induced "Empty View" issue. 
    - Decoupled Global Search from the `PipelineWorker` visibility chain.
    - Search now behaves as a non-destructive highlight by default.
    - Independent search match calculation ensures high performance for large files.
- **Search Optimization**: Implemented "Nearest Next" navigation logic.
    - Search navigation now jumps to the match closest to the current cursor/selected line.
    - Added `get_nearest_search_rank` backend API using binary search (bisect) for O(log N) efficiency.
- **UI/UX Stability**:
    - Fixed search highlight lingering after closing find widget.
    - Resolved input flickering by centralizing search state in `App.tsx`.
    - Added "Auto-jump to nearest" behavior immediately after a new search is performed.
    - Fixed Windows encoding issue in search match calculation using `errors='replace'`.

## 6. Change Log (2026-02-02) 
- **Architecture Refactor**: Migrated from PyQt to FastAPI + pywebview.
- **Project Structure Reorganization**: 
    - Consolidated all `.log` files into `tests/logs/`.
    - Moved test scripts to `tests/`.
    - Moved packaging scripts to `tools/`.
    - Cleaned up root directory by removing unused metadata and ignoring test logs.

[... previous change logs ...]
