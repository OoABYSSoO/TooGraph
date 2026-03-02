# Task Plan: Repository Cleanup Execution Round 9

## Goal
Continue conservative `NodeCard.vue` cleanup by moving output-node advanced configuration options, labels, and patch helpers into a dedicated model while preserving output configuration behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `NodeCard.vue` output advanced settings and related view-model label helpers.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select output display/persist option lists, active-state checks, file-name patching, and output label formatting.
- [x] Keep Element Plus controls, popover behavior, and emits inside `NodeCard.vue`.
- [x] Add a small `outputConfigModel.ts` boundary reused by `NodeCard.vue` and `nodeCardViewModel.ts`.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for output configuration model helpers.
- [x] Move output option, label, active-state, and patch helpers into `outputConfigModel.ts`.
- [x] Update `NodeCard.vue` and `nodeCardViewModel.ts` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused output config, node-card view-model, and NodeCard structure tests.
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
| Overall roadmap cleanup before this round | About 19% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 45% complete. |
| Low-risk model extraction subset before this round | About 92% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 20% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 46% complete. |
| Low-risk model extraction subset after this round | About 95% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue `NodeCard.vue` P1 cleanup | Output advanced settings still have pure configuration rules and duplicated labels. |
| Add `outputConfigModel.ts` | Output config options and labels should be shared by the component and view-model instead of duplicated. |
| Leave emits and controls in `NodeCard.vue` | The component should still own UI interaction and event dispatch. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
