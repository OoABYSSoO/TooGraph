# Task Plan: Repository Cleanup Execution Round 16

## Goal
Continue conservative `EditorCanvas.vue` cleanup by extracting data-edge state interaction helpers and reusing the existing state editor model for state draft updates while preserving edge selection, state editing, and disconnect behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Run planning catchup and recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `EditorCanvas.vue` data-edge state editor logic and existing state editor model helpers.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select data-edge id construction, floating interaction styles, active data-edge matching, confirm/editor projection, and state draft update helper reuse.
- [x] Keep timers, guard checks, emits, selection state, and request watchers inside `EditorCanvas.vue`.
- [x] Add a focused `canvasDataEdgeStateModel.ts` for pure data-edge interaction helpers.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for the canvas data-edge state model and component boundary.
- [x] Extract data-edge interaction helpers into `canvasDataEdgeStateModel.ts`.
- [x] Update `EditorCanvas.vue` to call the new model and existing `stateEditorModel` helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused data-edge state model, state editor model, and EditorCanvas structure tests.
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
| Overall roadmap cleanup before this round | About 26% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup before this round | About 7% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 27% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup after this round | About 9% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue `EditorCanvas.vue` P2 cleanup | The canvas remains the second-largest frontend component and previous pure model extractions are stable. |
| Extract data-edge state interaction helpers next | ID construction, style projection, edge matching, and confirm/editor projection are pure and easy to test outside the component. |
| Reuse `stateEditorModel.ts` for draft edits | `NodeCard.vue` already uses this model; reusing it removes duplicated state draft update and patch logic from the canvas. |
| Leave orchestration inside `EditorCanvas.vue` | Timers, lock guards, emits, selected edge state, and request watchers are interaction orchestration, not pure model logic. |

## Notes
- Source/test commit: `7078b0c 抽取画布数据边状态逻辑`.
- `EditorCanvas.vue` is now 4,337 lines, down from 4,437 lines after the previous round.
- The frontend production build completed without a large chunk warning.
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
