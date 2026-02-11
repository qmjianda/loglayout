# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🛠 Development Commands

### Running the App (Development)
- **Frontend**: `npm run dev` (Vite, default port 5173)
- **Backend**: `python backend/main.py` (FastAPI + pywebview)
- **Full Start**: Open two terminals and run both.

### Build & Package
- **Frontend Build**: `npm run build`
- **Install All Dependencies**: `python tools/install_deps.py`
- **Source Package (Win)**: `tools/package.bat`
- **Standalone EXE (Win)**: `tools/package_exe.bat` (Requires `pyinstaller`)
- **Source Package (Linux)**: `sh tools/package.sh`

### Testing
- **Run All Tests**: `pytest tests/`
- **Run Specific Test**: `pytest tests/test_name.py`

## 🏗 High-Level Architecture
- **Backend (Python/FastAPI)**: Core Engine (`bridge.py`) uses `mmap` for GB-scale log indexing. Layer System (`backend/loglayer/`) handles real-time filtering/highlighting.
- **Frontend (React/TypeScript)**: `LogViewer.tsx` uses O(1) virtual scrolling. `bridge_client.ts` manages API/WS communication.
- **Platform Awareness**: Use `/api/platform` via `usePlatformInfo` hook for OS-specific logic.

## ⚖️ Development Workflow & Governance

### 1. Architecture-First Principle
- Before any modification, read `PROJECT_MAP.md` and `docs/DESIGN_SPEC.md`.
- No cross-module refactoring without understanding dependencies.

### 2. Document-Code-Test Closed Loop
- **Pre-change**: Update `docs/DESIGN_SPEC.md` for logic changes.
- **Post-change**: Update `PROJECT_MAP.md` "Current Status" and "Change Log".
- **Bug Closure**: Every bug fix **MUST** include a reproduction script in `tests/`. A task is "incomplete" without a passing test.

### 3. UI/UX Excellence (ui-ux-pro-max)
- **Tools**: Use `python3 .agent/skills/ui-ux-pro-max/scripts/search.py` for design system generation and UX guidelines.
- **Checklist**:
    - No emoji icons (use SVGs/Lucide).
    - All clickable elements must have `cursor-pointer`.
    - Stable hover states (no layout shifts).
    - Ensure contrast in both Light/Dark modes.

## 📋 Key Technical Patterns
- **Virtualization**: All log viewing must be virtualized.
- **Layer Sync**: Use `sync_layers` (data-altering) or `sync_decorations` (visual-only).
- **Resource Sensitivity**: Document CPU/Memory impact when modifying core `mmap` indexing.
- **Session Persistence**: App state and layer configs are saved to `.loglayer/` folder.
