# Task Plan: Repository Cleanup Execution Round 6

## Goal
Continue conservative `NodeCard.vue` cleanup by moving agent runtime input normalization into `agentConfigModel.ts` while preserving node behavior.

## Current Phase
Phase 5 in progress

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `agentConfigModel.ts`, its tests, and agent handlers in `NodeCard.vue`.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select agent thinking-mode normalization and temperature input parsing.
- [x] Keep agent config emits, lock guards, and select blur behavior inside `NodeCard.vue`.
- [x] Reuse the existing `agentConfigModel.ts` ownership boundary.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for extracted agent config helpers.
- [x] Move thinking-mode and temperature-input helpers into `agentConfigModel.ts`.
- [x] Update `NodeCard.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused agent config and NodeCard structure tests.
- [x] Run TypeScript and meaningful frontend checks.
- [x] Run the frontend production build.
- [x] Restart the dev environment with `npm run dev`.
- **Status:** completed

### Phase 5: Commit and Push
- [x] Review diff for unrelated/runtime artifacts.
- [ ] Commit with a Chinese commit message.
- [ ] Push the branch.
- **Status:** in_progress

## Progress Estimate
| Scope | Estimate |
|-------|----------|
| Overall roadmap cleanup before this round | About 16% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 39% complete. |
| Low-risk model extraction subset before this round | About 75% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 17% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 41% complete. |
| Low-risk model extraction subset after this round | About 82% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Return to `NodeCard.vue` P1 cleanup | The large chunk warning was addressed in round 5, and NodeCard remains the highest-leverage frontend concentration. |
| Use `agentConfigModel.ts` for the helpers | It already owns agent model selection, runtime catalog, and temperature clamping behavior. |
| Keep emits in `NodeCard.vue` | Component runtime guards and event dispatch are UI concerns, not model concerns. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
