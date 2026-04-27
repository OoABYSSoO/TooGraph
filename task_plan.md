# Task Plan: Native Skill Refactor Continuation

## Goal
Continue the GraphiteUI native Skill refactor after the foundation merge, focusing on the next smallest production slice that makes Skills useful from Agent nodes without reintroducing automatic external discovery.

## Current Phase
Complete

## Phases

### Phase 1: Current State Alignment
- [x] Re-read existing native Skill docs and implementation.
- [x] Inspect backend Skill catalog/import/runtime code.
- [x] Inspect frontend Skill management and Agent node Skill picker code.
- [x] Identify the smallest missing end-to-end slice.
- **Status:** complete

### Phase 2: Lock Behavior With Tests
- [x] Add or update backend tests for the selected Skill contract.
- [x] Add or update frontend model/API/UI tests for the selected Skill flow.
- [x] Confirm new tests fail for the intended missing behavior before implementation when feasible.
- **Status:** complete

### Phase 3: Implement Backend Contract
- [x] Update backend schemas, catalog, validation, or runtime modules as required.
- [x] Preserve manual import-only behavior and existing API compatibility.
- [x] Keep permission/config/health distinctions explicit.
- **Status:** complete

### Phase 4: Implement Frontend Experience
- [x] Update Skill management and/or Agent node UI using existing Element Plus patterns.
- [x] Ensure Agent nodes only expose appropriate installed/enabled/configured Skills.
- [x] Provide clear status and error/empty states.
- **Status:** complete

### Phase 5: Verify, Restart, Commit, Push
- [x] Run targeted backend tests.
- [x] Run targeted frontend tests.
- [x] Run broader verification when touched surface warrants it.
- [x] Restart dev environment with `npm run dev` after code changes.
- [x] Commit all relevant tracked changes with a Chinese commit message.
- [x] Push the current branch.
- **Status:** complete

## Key Questions
1. What parts of the native Skill foundation are already implemented?
2. Is Agent node Skill binding already present, or only catalog/import UI?
3. Which missing slice gives the largest product value with limited risk?
4. How should this slice preserve future Companion Skill Loadout support?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Continue from the merged native Skill foundation | It already establishes `skill.json`, manual import, taxonomy metadata, and no default external discovery. |
| Use GraphiteUI native manifest as runtime truth | Matches the documented product direction and avoids treating `SKILL.md` as executable truth. |
| Keep one Skill system with target-specific usage | Agent node and Companion should share installation/diagnostics but use different binding/loadout surfaces. |
| First continuation slice is Agent attachability and native built-in manifests | This makes existing Agent nodes consume the native Skill catalog safely before structured binding/workflow mode is added. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- For code changes, restart using `npm run dev`.
