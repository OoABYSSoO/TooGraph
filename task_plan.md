# Task Plan: Repository Cleanup Execution Round 12

## Goal
Continue conservative `NodeCard.vue` cleanup by moving agent skill attach/remove patch helpers into `skillPickerModel.ts` while preserving agent node behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `NodeCard.vue` skill picker handlers and the existing skill picker model.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select agent skill attach/remove no-op detection and patch creation.
- [x] Keep DOM events, picker visibility, lock guards, and emits inside `NodeCard.vue`.
- [x] Reuse `skillPickerModel.ts`.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for agent skill attach/remove patch helpers.
- [x] Move agent skill patch helpers into `skillPickerModel.ts`.
- [x] Update `NodeCard.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused skill picker and NodeCard structure tests.
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
| Overall roadmap cleanup before this round | About 22% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 48% complete. |
| Low-risk model extraction subset before this round | About 99% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 23% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 49% complete. |
| Low-risk model extraction subset after this round | Complete for the current NodeCard pure-model pass. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue `NodeCard.vue` P1 cleanup | Skill attach/remove patch decisions are small, pure, and already adjacent to `skillPickerModel.ts`. |
| Reuse `skillPickerModel.ts` | It already owns skill picker filtering and badge presentation. |
| Leave events and emits in `NodeCard.vue` | The component still owns DOM events, picker state, lock guards, and dispatch. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
