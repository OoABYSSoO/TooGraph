# Task Plan: Repository Cleanup Execution Round 7

## Goal
Continue conservative `NodeCard.vue` cleanup by moving uploaded asset presentation helpers into `uploadedAssetModel.ts` while preserving input upload behavior.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect `uploadedAssetModel.ts`, its tests, and uploaded asset computed state in `NodeCard.vue`.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select uploaded asset label, summary, text preview, and description helpers.
- [x] Keep file picking, drop handling, state patch emits, and error logging inside `NodeCard.vue`.
- [x] Reuse the existing `uploadedAssetModel.ts` ownership boundary.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add failing tests for uploaded asset presentation helpers.
- [x] Move presentation helpers into `uploadedAssetModel.ts`.
- [x] Update `NodeCard.vue` to call the model helpers.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused uploaded asset and NodeCard structure tests.
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
| Overall roadmap cleanup before this round | About 17% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 41% complete. |
| Low-risk model extraction subset before this round | About 82% complete. |
| Build/chunk warning remediation before this round | About 80% complete. |
| Overall roadmap cleanup after this round | About 18% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 43% complete. |
| Low-risk model extraction subset after this round | About 88% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue `NodeCard.vue` P1 cleanup | The component still owns pure display logic that can move safely. |
| Use `uploadedAssetModel.ts` | It already owns uploaded asset parsing, type detection, envelope creation, and input accept rules. |
| Leave file IO and emits in `NodeCard.vue` | File input/drop handling and graph state updates are component responsibilities. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
