# Task Plan: Repository Cleanup Execution Round 13

## Goal
Begin conservative `EditorCanvas.vue` cleanup by moving route handle tone, palette, and hotspot style helpers into a focused canvas model while preserving connection behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `EditorCanvas.vue` helper concentration and existing canvas model tests.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select route handle tone/palette and flow-out hotspot style helpers.
- [x] Keep DOM events, connection state, pointer handling, and drag completion inside `EditorCanvas.vue`.
- [x] Add a focused `routeHandleModel.ts` for pure canvas presentation helpers.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for route handle model helpers.
- [x] Move route handle helpers into `routeHandleModel.ts`.
- [x] Update `EditorCanvas.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused route handle and EditorCanvas structure tests.
- [x] Run TypeScript and meaningful frontend checks.
- [x] Run the frontend production build.
- [x] Restart the dev environment with `npm run dev`.
- **Status:** completed

### Phase 5: Commit and Push
- [x] Review diff for unrelated/runtime artifacts.
- [x] Commit with a Chinese commit message.
- [x] Push the branch.
- **Status:** completed

## Progress Estimate
| Scope | Estimate |
|-------|----------|
| Overall roadmap cleanup before this round | About 23% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup before this round | About 0% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 24% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup after this round | About 2% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Start `EditorCanvas.vue` P2 cleanup | NodeCard low-risk pure-model extraction is effectively complete; canvas helper concentration is the next roadmap item. |
| Extract route handle presentation first | It is pure style/tone logic and does not touch pointer lifecycle, graph mutation, or DOM measurement. |
| Leave interaction orchestration in `EditorCanvas.vue` | The component still owns drag state, connection completion, hover state, DOM events, and emits. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
