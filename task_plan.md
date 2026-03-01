# Task Plan: Repository Cleanup Execution

## Goal
Clean up the GraphiteUI codebase by implementing conservative, behavior-preserving refactors based on the existing architecture audit, while keeping the application functional and verified.

## Current Phase
Phase 4: Verification

## Phases

### Phase 1: Re-orientation
- [x] Re-read architecture reports and current planning context.
- [x] Inspect the highest-priority cleanup target from the roadmap.
- [x] Confirm current git status and verification commands.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Identify duplicated or over-concentrated logic with clear test coverage.
- [x] Avoid broad rewrites or behavior-sensitive runtime changes.
- [x] Choose the smallest useful extraction or cleanup.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add or identify relevant regression coverage before production edits.
- [x] Refactor the selected code path without changing public behavior.
- [x] Keep changes scoped to touched modules.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused tests for the touched surface.
- [x] Run the smallest meaningful broader frontend/backend checks.
- [x] Restart the dev environment with `npm run dev` after code changes.
- **Status:** completed

### Phase 5: Commit and Push
- [ ] Review git diff for unrelated/runtime artifacts.
- [ ] Commit with a Chinese commit message.
- [ ] Push the branch.
- **Status:** in_progress

## Key Questions
1. Which roadmap recommendation can be implemented safely in one pass?
2. Which duplicated state or interaction logic can be extracted without changing UI behavior?
3. Which tests prove the editor still works after cleanup?
4. Are any generated/runtime artifacts present that must stay uncommitted?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use the existing architecture roadmap as the starting point | It already identifies risk-ranked cleanup targets. |
| Prefer frontend NodeCard cleanup first | The roadmap marks it as P1 and it has existing structure/model tests. |
| Preserve behavior over reducing line count aggressively | The user explicitly prioritized functional stability. |
| Extract NodeCard port reorder helpers first | The logic has a clear boundary and can receive focused model tests. |
| Share identical transparent popover style objects | This removes exact duplication without changing template bindings. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.
