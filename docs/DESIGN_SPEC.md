# LogLayer: Global Design Spec

## 1. Core Logic: Large File Performance
- **Motivation**: Browser-based file reading crashes on >500MB logs.
- **Strategy**: Offset-based streaming. Python backend handles the binary mmap, frontend only holds an ID and total line count.
- **Threading**: All heavy I/O and processing (indexing, filtering) must run in `QThread` workers to keep the UI responsive.
- **Acceleration**: Line indexing is parallelized using `ThreadPoolExecutor` across file chunks.
- **Constraint**: Never pass raw file content arrays over the bridge. Always use the `read_lines` windowed API.

## 2. Logic Implementation: Virtual Logging
- **Proxy Pattern**: `App.tsx` uses a JS Proxy for `GLOBAL_BRIDGED_LINES` to pretend the file is a regular array.
- **Signal Flow**: 
    1. Python `open_file` -> Starts `IndexingWorker` (background)
    2. `IndexingWorker` finished -> Signal `_on_indexing_finished`
    3. Emit `fileLoaded(json_str)`
    4. JS `App.tsx` updates `files` state -> Sets active file.
    5. `LogViewer` computes viewport -> Calls `bridge_client.readLines`.

## 3. Unified Layer Architecture
- **Concept**: A single source of truth for both logic and UI. Every layer is a Python class defining its `stage` (Native/Logic/Decor) and its `ui_schema`.
- **Schema Engine**: `loglayer.ui` defines primitive types (`StrInput`, `ColorPicker`, etc.) that map to React components in the frontend.
- **Pipeline Stages**:
    1. **Native (ripgrep)**: Fast line filtering using piped OS processes. 
    2. **Logic (Python)**: Complex line content modification and metadata generation.
    3. **Decor (Metadata)**: Post-processing for UI attributes (colors, highlights).
- **Extensibility**: Custom plugins can be placed in `backend/plugins/` and are automatically registered and UI-rendered at startup.

## 4. Modification Guidelines
- **UI Safety**: All numerical displays (lines, sizes) MUST have null/undefined fallbacks.
- **Backend Stability**: Python methods must catch all I/O exceptions and return `bool` or empty strings to prevent bridge hangs.
- **Schema Parity**: When adding new `ui_schema` types, ensure a corresponding component exists in `frontend/src/components/DynamicUI/InputMapper.tsx`.
