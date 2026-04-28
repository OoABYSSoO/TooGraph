# Task Plan: Repository Cleanup Execution Round 17

## Goal
Continue conservative `EditorCanvas.vue` cleanup by extracting connection preview and pending-connection projection helpers into a focused canvas connection model while preserving drag, snap, connect, reconnect, and node-creation behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Run planning catchup and recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `EditorCanvas.vue` connection preview and pending connection helpers.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select concrete-state key detection, pending connection creation, pending connection equality, source anchor resolution, preview state resolution, accent color resolution, and preview path model construction.
- [x] Keep pointer handling, auto-snapping, connection completion, creation-menu emits, selected edge state, and graph mutation emits inside `EditorCanvas.vue`.
- [x] Add a focused `canvasConnectionModel.ts` for pure connection helpers.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for the canvas connection model and component boundary.
- [x] Extract connection helpers into `canvasConnectionModel.ts`.
- [x] Update `EditorCanvas.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused canvas connection, connection preview path, and EditorCanvas structure tests.
- [x] Run TypeScript and meaningful frontend checks.
- [x] Run the frontend production build.
- [x] Restart the dev environment with `npm run dev`.
- **Status:** completed

### Phase 5: Commit and Push
- [x] Review diff for unrelated/runtime artifacts.
- [x] Commit source and tests with a Chinese commit message.
- [x] Commit planning updates with a Chinese commit message.
- [x] Push the branch.
- **Status:** completed

## Progress Estimate
| Scope | Estimate |
|-------|----------|
| Overall roadmap cleanup before this round | About 27% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup before this round | About 9% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 28% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup after this round | About 11% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue `EditorCanvas.vue` P2 cleanup | The previous canvas model extractions are stable and the component remains a large mixed-responsibility hotspot. |
| Extract connection preview helpers next | These helpers derive pending connection objects, source anchor ids, preview state keys, accent colors, and preview paths without performing DOM work or emitting mutations. |
| Leave connection orchestration in `EditorCanvas.vue` | Pointer handlers, snapping decisions, connection completion, and creation-menu emission depend on live component state and should not move in this slice. |

## Notes
- Source/test commit: `9fccb69 抽取画布连接预览逻辑`.
- `EditorCanvas.vue` is now 4,233 lines, down from 4,337 lines after the previous round.
- The frontend production build completed without a large chunk warning.
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
