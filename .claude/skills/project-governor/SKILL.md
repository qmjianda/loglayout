# Skill: Project Governor

## Frontmatter
name: project-governor
description: Enforces the "Document-Code-Test" closed-loop governance for LogLayer.

## Instructions
This skill is activated whenever a core logic change or bug fix is requested.

### 1. Planning Phase (architect_sync)
- **Action**: Read `PROJECT_MAP.md` for current architecture.
- **Constraint**: If the change affects multiple modules, update `PROJECT_MAP.md` Coupling Notes BEFORE implementation.

### 2. Design Phase (spec_update)
- **Action**: For significant logic changes, update `PROJECT_MAP.md` with:
    - `[NEW]` tag for new logic designs.
    - `[UPDATE]` tag for modifications.
    - Explicitly state the "Motivation" and "Coupling Strategy".

### 3. Execution Phase (safe_coding)
- **Action**: Implement changes based on the updated spec.
- **Guideline**: Maintain high Density, Low Token coding style (concise, no redundancy).

### 4. Verification Phase (bug_defense)
- **Action**: For any bug fix, create a script in `tests/` that reproduces the issue and verifies the fix.
- **Requirement**: Python backend fixes must be verified via standalone Python test scripts.

### 5. Archiving Phase (map_finalization)
- **Action**: Update the feature status in `PROJECT_MAP.md` checklist.
