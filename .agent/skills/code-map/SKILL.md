---
name: code-map
description: Detailed map of the LogLayer Pro codebase, UI structure, and state flow.
---

# LogLayer Pro Code Map

Current as of: 2026-01-28
Version: 0.1.0 (Refactoring Phase)

## 🏗️ Project Architecture

### Core Tech Stack
- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: TailwindCSS (v4) + PostCSS
- **State Management**: React `useState` / `useContext` (Local State in App.tsx)

### 📂 Directory Structure

```
d:\Project\loglayer\
├── .agent/                 # AI Assistant Configuration & Memory
│   ├── rules.md            # Project Rules & Best Practices
│   └── skills/             # Specialized capabilities (ui-ux, code-map)
├── components/             # React UI Components
│   ├── UnifiedPanel.tsx    # [CORE] Left sidebar container (Files, Layers, Presets)
│   ├── Sidebar.tsx         # Narrow navigation bar (Icons)
│   ├── LogViewer.tsx       # [CORE] Virtualized log renderer
│   ├── SearchPanel.tsx     # Global search UI
│   ├── StatusBar.tsx       # Bottom status bar
│   └── ... (Widgets: EditorFindWidget, etc.)
├── processors/             # Log Processing Logic (Pure Functions)
│   ├── index.ts            # Entry point (processLayer pipeline)
│   ├── filterProcessor.ts  # Filter logic
│   ├── highlightProcessor.ts
│   └── ...
├── App.tsx                 # [ROOT] Global State & Layout Orchestration
├── types.ts                # TypeScript Interfaces (FileData, LogLayer, LogLine)
├── main.tsx                # Entry point
├── index.css               # Global Styles & Tailwind Imports
└── tailwind.config.js      # Style Configuration
```

## 🧠 Core Concepts & Data Structures

### 1. FileData (`types.ts` / `App.tsx`)
Represents an open file.
- `id`: Unique identifier
- `lines`: Raw string array of log lines
- **`layers`**: `LogLayer[]` (Independent layer stack per file)
- **`history`**: Undo/Redo stack for layers

### 2. LogLayer (`types.ts`)
A processing rule applied to logs.
- `type`: FILTER, HIGHLIGHT, TIME_RANGE, etc.
- `config`: Specific parameters (regex, color, etc.)
- `groupId`: For grouping layers (e.g. under a "Folder")

### 3. Log Processing Pipeline
`App.tsx` -> `processLayer` -> `processors/*.ts`

Data Flow:
1. `rawLogs` (from `activeFile`)
2. Loop through `activeFile.layers`
3. Apply each processor sequentially
4. Result: `processedLogs` (Lines + Metadata like highlights)

## 🖥️ UI Layout (Visual Tree)

```
[App Container (Flex Row)]
├── [Sidebar (Narrow)]          # Navigation Icons (Workspace, Search, Help)
├── [Main Content (Flex Col)]
│   ├── [Top Bar (Flex Row)]
│   │   ├── [UnifiedPanel]      # Left Panel (Resizable/Collapsible)
│   │   │   ├── Toolbar (File Open)
│   │   │   ├── FileLayerTree (Pending Implementation)
│   │   │   └── Presets
│   │   └── [LogViewer]         # Main Area (Virtual Scroll)
│   │       ├── Canvas/List
│   │       └── Overlays (FindWidget)
│   └── [StatusBar]             # Bottom Info (Line count, encoding)
```

## 🔄 State Management Flow

### Key State in `App.tsx`
- `files`: Array of all open files.
- `activeFileId`: ID of currently visible file.
- `activeFile`: Computed from `files` + `activeFileId`.
- `processedLogs`: Computed result of `activeFile.lines` + `activeFile.layers`.

### Action Flow (Example: Adding a Layer)
1. User clicks "Add Filter" in `UnifiedPanel`.
2. `UnifiedPanel` calls `onAddLayer`.
3. `App.tsx`'s `updateLayers` is triggered.
4. `updateLayers`:
    - Finds `activeFile` in `files` array.
    - Creates new `layers` array with added layer.
    - Pushes old state to `history.past`.
    - `setFiles(updatedFiles)`.
5. `activeFile` updates -> `processedLogs` re-calculates.
6. `LogViewer` re-renders with new data.

## ⚠️ Current Focus Areas
1. **Multi-File Layers**: Transitioning from global layers to per-file layers (Done logic, Pending UI).
2. **TreeView**: Merging File List and Layer List into a unified tree.
3. **Performance**: Large file handling via `file.stream()` and chunked processing.
