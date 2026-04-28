# Task Plan: Repository Cleanup Execution Round 10

## Goal
Continue conservative `NodeCard.vue` cleanup by moving condition-rule draft and patch helpers into `conditionRuleEditorModel.ts` while preserving condition node behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `NodeCard.vue` condition-rule draft handlers and the existing condition-rule model.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select condition-rule value draft normalization, operator patching, value patching, and disabled-state logic.
- [x] Keep DOM event handling, blur behavior, lock guards, and emits inside `NodeCard.vue`.
- [x] Reuse `conditionRuleEditorModel.ts`.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for condition-rule draft and patch helpers.
- [x] Move condition-rule helpers into `conditionRuleEditorModel.ts`.
- [x] Update `NodeCard.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused condition-rule and NodeCard structure tests.
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
| Overall roadmap cleanup before this round | About 20% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 46% complete. |
| Low-risk model extraction subset before this round | About 95% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 21% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 47% complete. |
| Low-risk model extraction subset after this round | About 97% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue `NodeCard.vue` P1 cleanup | Condition rule draft handling is still pure enough to move safely. |
| Reuse `conditionRuleEditorModel.ts` | It already owns condition rule options and editor-state derivation. |
| Leave events and emits in `NodeCard.vue` | The component still owns DOM inputs, blur handling, lock guards, and dispatch. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
