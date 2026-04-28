# Task Plan: Repository Cleanup Execution Round 5

## Goal
Address the production large chunk warning with low-risk route-level code splitting while preserving app routing behavior.

## Current Phase
Phase 5 in progress

## Phases

### Phase 1: Re-orientation
- [x] Recover previous cleanup context.
- [x] Confirm current git status.
- [x] Inspect build config and router page imports.
- **Status:** completed

### Phase 2: Select Safe Refactor Slice
- [x] Select router page lazy loading as the chunk-warning slice.
- [x] Keep route paths and route component ownership unchanged.
- [x] Avoid broad manual chunk tuning unless route splitting alone is insufficient.
- **Status:** completed

### Phase 3: Implement Cleanup
- [x] Add a failing router structure test for lazy page imports.
- [x] Convert page route components to dynamic imports.
- [x] Update routing structure assertions.
- [x] Add a failing Vite config structure test for vendor manual chunks.
- [x] Split Vue and Element Plus dependencies into stable vendor chunks.
- **Status:** completed

### Phase 4: Verification
- [x] Run focused router structure tests.
- [x] Run TypeScript and meaningful frontend checks.
- [x] Run the frontend production build and confirm the large chunk warning is resolved or document remaining chunks.
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
| Overall roadmap cleanup before this round | About 15% complete. |
| P1 `NodeCard.vue` cleanup before this round | About 39% complete. |
| Low-risk model extraction subset before this round | About 75% complete. |
| Build/chunk warning remediation before this round | 0% complete. |
| Overall roadmap cleanup after this round | About 16% complete. |
| P1 `NodeCard.vue` cleanup after this round | About 39% complete. |
| Low-risk model extraction subset after this round | About 75% complete. |
| Build/chunk warning remediation after this round | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Pause `NodeCard.vue` extraction for this round | The user previously called out the large chunk warning, and route splitting is now a practical low-risk improvement. |
| Start with route-level dynamic imports | Router currently synchronously imports every page, creating one large JS entry chunk. |
| Add manual chunks only after measuring route splitting | Route-level lazy loading reduced the main JS chunk but did not remove the warning. |

## Notes
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Large chunk warning persisted after route-level lazy loading | `npm run build` | Add explicit vendor manual chunks in Vite config and re-run build. |
