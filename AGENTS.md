# AGENTS.md - LogLayer Agent Guidelines

## Build / Test Commands

### Python Backend
- **Run all tests**: `pytest tests/`
- **Run specific test**: `pytest tests/test_name.py`
- **Run integration tests**: `pytest tests/integration/`
- **Run unit tests**: `pytest tests/unit/`
- **Run with coverage**: `pytest tests/ --cov=backend --cov-report=html`

### Frontend
- **Development**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: Check package.json for available scripts

### Package
- **Install deps**: `python tools/install_deps.py`
- **Package (Win)**: `tools/package.bat`
- **Standalone EXE**: `tools/package_exe.bat`

---

## Code Style Guidelines

### Python

**Imports**:
- Standard library first, then third-party, then local
- Use explicit imports: `from typing import List, Optional`
- Group: `asyncio` + `threading` + `uvicorn` + `fastapi` + `pydantic` + local

```python
import os
import sys
import json
import asyncio
import threading

import uvicorn
import webview
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel

from bridge import FileBridge
```

**Formatting**:
- 4 spaces indentation
- Max line length: 100 chars
- Use blank lines to separate logical sections (2 blank lines between top-level defs)

**Types**:
- Use Pydantic `BaseModel` for API request/response
- Use `typing` module: `List[str]`, `Optional[int]`, `Dict[str, Any]`
- Type hints on function signatures

**Naming**:
- `snake_case` for functions/variables
- `PascalCase` for classes
- `_private` prefix for internal methods

**Error Handling**:
- Wrap async operations in try/except
- Use specific exception types
- Log errors with context: `print(f"[Module] Error: {e}")`

**Patterns**:
- Use `@asynccontextmanager` for FastAPI lifespan
- WebSocket: `ConnectionManager` class with connect/disconnect/broadcast
- Thread-safe: `asyncio.run_coroutine_threadsafe()` for cross-thread comm

---

### TypeScript / React

**Imports**:
- Relative imports first, then packages
- Use explicit named imports

```typescript
import { useState, useEffect } from 'react';
import { FileBridgeAPI } from './types';
```

**Formatting**:
- 2 spaces indentation
- Single quotes for strings
- Trailing commas

**Types**:
- Use TypeScript interfaces for API types
- Define in `types.ts`
- Avoid `any`, use `unknown` if needed

**Naming**:
- `camelCase` for variables/functions
- `PascalCase` for components
- `kebab-case` for CSS classes

**Components**:
- Functional components with hooks
- Extract custom hooks to `hooks/` folder
- Use `.tsx` for components, `.ts` for logic

**State Management**:
- Use React Context for global state
- Local state with `useState`
- Derived state computed in render

---

## Key Technical Patterns

### Virtualization
All log viewing MUST use virtual scrolling (O(1) rendering).

### Layer System
- `sync_layers()` - data-altering operations
- `sync_decorations()` - visual-only changes

### Platform Awareness
Use `/api/platform` endpoint for OS-specific logic.

### Resource Sensitivity
Document CPU/Memory impact when modifying mmap indexing.

---

## Development Workflow

1. **Architecture-First**: Read `PROJECT_MAP.md` before changes
2. **Document-Code-Test**: Update docs, then code, then tests
3. **Bug Fix**: MUST include reproduction script in `tests/`

## UI/UX Guidelines

- No emoji icons (use SVGs/Lucide)
- All clickable elements: `cursor-pointer`
- Stable hover states (no layout shifts)
- Ensure contrast in Light/Dark modes
