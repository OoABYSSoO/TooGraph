# Task Plan: Repository Cleanup Execution Rounds 18-20

## Goal
Continue conservative `EditorCanvas.vue` cleanup through three small pure-model extractions while preserving canvas editing behavior, route labels, run-state presentation, and edge deletion actions.

## Current Phase
Complete

## Phases

### Phase 1: Re-orientation and Batch Planning
- [x] Run planning catchup and confirm no unsynced local changes.
- [x] Read the previous plan, progress log, findings, and current `EditorCanvas.vue` hotspots.
- [x] Select three independent low-risk slices for a multi-round cleanup batch.
- **Status:** completed

### Phase 2: Round 18 - Condition Route Target Model
- [x] Add focused tests for condition route target projection.
- [x] Update structure tests to require a dedicated model boundary.
- [x] Extract branch-to-target-label projection from `EditorCanvas.vue`.
- **Status:** completed

### Phase 3: Round 19 - Canvas Run Presentation Model
- [x] Add focused tests for human-review and run-state presentation wrappers.
- [x] Update structure tests to require reuse of the dedicated model.
- [x] Move pure run-node visual selection and class projection out of `EditorCanvas.vue`.
- **Status:** completed

### Phase 4: Round 20 - Flow Edge Delete Model
- [x] Add focused tests for flow/route edge delete confirmation projection.
- [x] Update structure tests to require the flow-edge delete model boundary.
- [x] Move delete confirmation target/style/action projection out of `EditorCanvas.vue`.
- **Status:** completed

### Phase 5: Verification
- [x] Run focused model and structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite.
- [x] Run the frontend production build and check for chunk-warning regressions.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- **Status:** completed

### Phase 6: Commit and Push
- [x] Review diffs for unrelated/runtime artifacts.
- [x] Commit source and tests with a Chinese commit message.
- [x] Commit planning updates with a Chinese commit message if separated.
- [x] Push the branch.
- **Status:** completed

## Progress Estimate
| Scope | Estimate |
|-------|----------|
| Overall roadmap cleanup before this batch | About 28% complete. |
| P1 `NodeCard.vue` cleanup before this batch | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup before this batch | About 11% complete. |
| Build/chunk warning remediation before this batch | About 80% complete. |
| Overall roadmap cleanup target after this batch | About 30% complete. |
| P1 `NodeCard.vue` cleanup target after this batch | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup target after this batch | About 14% complete. |
| Build/chunk warning remediation target after this batch | About 80% complete. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Batch three small `EditorCanvas.vue` extractions | The user asked to complete multiple decomposition rounds before stopping, and these slices are independent pure logic. |
| Keep DOM, timers, emits, selection refs, and lock guards local | Those responsibilities depend on component lifecycle or graph mutation side effects. |
| Use test-first extraction for each slice | Refactors still need red/green proof that the new boundary captures current behavior. |

## Notes
- Current clean baseline after Round 17: `main...origin/main`.
- Candidate slices: condition route target labels, canvas run-node presentation wrappers, and flow/route edge delete confirmation projection.
- `EditorCanvas.vue` is now 4,226 lines after the batch.
- Source/test commit: `2572c6e 抽取画布纯模型逻辑`.
- The frontend production build in Round 17 completed without a large chunk warning.
- The frontend production build in this batch also completed without a large chunk warning.
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `vue-tsc` rejected a test object literal with a `state` property passed to a narrowed edge pick | First TypeScript verification | Changed the test to define a full `ProjectedCanvasEdge` data-edge fixture before passing it to the model helper. |
