# Task Plan: Repository Cleanup Execution Round 4

## Goal
Continue conservative GraphiteUI cleanup by extracting the state editor draft/update model from `NodeCard.vue` while preserving editor behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect state editor logic in `NodeCard.vue` and adjacent popover/model files.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select state editor draft construction and update patch helpers.
- [x] Keep confirmation, locking, focus, and event dispatch flow inside `NodeCard.vue`.
- [x] Preserve `StateEditorPopover.vue` props/events.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for the extracted state editor model.
- [x] Move pure state editor draft helpers into `stateEditorModel.ts`.
- [x] Update `NodeCard.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused model and NodeCard structure tests.
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
| Overall roadmap cleanup before this round | About 14% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 35% complete. |
| Low-risk model extraction subset before this round | About 65% complete. |
| Overall roadmap cleanup after this round | About 15% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 39% complete. |
| Low-risk model extraction subset after this round | About 75% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue with `NodeCard.vue` model extraction | It remains the P1 target and still contains pure state editor draft/update logic. |
| Create a dedicated `stateEditorModel.ts` | Editing existing state is a separate responsibility from creating a port-bound state. |
| Keep runtime guards in `NodeCard.vue` | Locking, active popover state, translations, and emits are component concerns. |
| Defer route chunk splitting | Build chunk warning is not blocking the current structural cleanup round. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
