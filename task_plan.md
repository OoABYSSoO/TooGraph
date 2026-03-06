# Task Plan: Repository Cleanup Execution Rounds 21-30

## Goal
Run a ten-round conservative cleanup batch focused on `EditorCanvas.vue` pure projection and interaction-model helpers, then close the baseline interaction regressions in one larger pass while preserving graph editing behavior, runtime visuals, drag/connect workflows, deletion behavior, and dev startup health.

## Current Phase
Phase 22 auto-continuation gate in progress because total roadmap cleanup is about 46%, below 100%.

## Autonomous Continuation Gate
- After every completed cleanup phase, re-read `docs/future/2026-04-28-architecture-refactor-roadmap.md`, `task_plan.md`, `findings.md`, and `progress.md`, then recalculate the total roadmap progress and the active area progress.
- Record the recalculated total progress in the `Progress Estimate` table before ending the round.
- If total roadmap progress is below 100%, automatically open the next phase in this plan, mark it as the current phase, choose the next safest roadmap slice, and continue with the same safety loop: red/focused tests, implementation, focused verification, full verification when needed, dev restart for code changes, commit, and push.
- If total roadmap progress reaches 100%, switch the current phase to final completion, run the final verification suite, commit/push any remaining documentation updates, and stop the automatic cleanup loop.
- If a blocker makes automatic continuation unsafe, document the blocker, the current progress estimate, and the reason continuation is paused in both `task_plan.md` and `progress.md`.

## Phases

### Phase 1: Re-orientation and Ten-Round Planning
- [x] Run planning catchup and confirm no local source changes.
- [x] Re-read the latest plan, progress, findings, and current high-line-count files.
- [x] Inspect the remaining `EditorCanvas.vue` computed/helper clusters.
- [x] Select ten low-risk pure boundaries for Rounds 21-30.
- **Status:** completed

### Phase 2: Round 21 - Minimap Edge Projection
- [x] Add focused tests for projected minimap edge models.
- [x] Extract minimap edge color/kind/path projection from `EditorCanvas.vue`.
- **Status:** completed

### Phase 3: Round 22 - Forced Visible Edge Ids
- [x] Add focused tests for forced visible projected edge id collection.
- [x] Extract selected/confirm/editor edge-id collection from `EditorCanvas.vue`.
- **Status:** completed

### Phase 4: Round 23 - Pending State Port Preview
- [x] Add focused tests for state preview labels and pending source/target maps.
- [x] Extract pending state port preview projection from `EditorCanvas.vue`.
- **Status:** completed

### Phase 5: Round 24 - Virtual Create Port Visibility
- [x] Add focused tests for virtual input/output create port visibility rules.
- [x] Extract default and interaction-based visibility decisions from `EditorCanvas.vue`.
- **Status:** completed

### Phase 6: Round 25 - Transient Virtual Anchors
- [x] Add focused tests for transient virtual create/input/output anchors.
- [x] Extract virtual anchor filtering and projection from `EditorCanvas.vue`.
- **Status:** completed

### Phase 7: Round 26 - Selected Reconnect Projection
- [x] Add focused tests for selected edge to reconnect connection projection.
- [x] Move selected reconnect connection derivation into the connection model.
- **Status:** completed

### Phase 8: Round 27 - Keyboard Edge Delete Projection
- [x] Add focused tests for projected edge to delete-action conversion.
- [x] Reuse the flow-edge delete model in keyboard delete handling.
- **Status:** completed

### Phase 9: Round 28 - Data Edge Disconnect Projection
- [x] Add focused tests for data-edge disconnect availability and payloads.
- [x] Move pure data-edge disconnect decisions into the data-edge model.
- **Status:** completed

### Phase 10: Round 29 - Pinch Pointer Math
- [x] Add focused tests for pinch pointer distance, center, and start projection.
- [x] Extract pure two-finger gesture math from `EditorCanvas.vue`.
- **Status:** completed

### Phase 11: Round 30 - Viewport Display Projection
- [x] Add focused tests for viewport transform style and zoom label formatting.
- [x] Extract viewport display helpers from `EditorCanvas.vue`.
- **Status:** completed

### Phase 12: Verification
- [x] Run focused model and structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite.
- [x] Run the frontend production build and check for chunk-warning regressions.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- **Status:** completed

### Phase 13: Commit and Push
- [x] Review diffs for unrelated/runtime artifacts.
- [x] Commit source and tests with a Chinese commit message.
- [x] Commit planning updates with a Chinese commit message if separated.
- [x] Push the branch.
- **Status:** completed

### Phase 14: Baseline Interaction Repair and Connection Model Consolidation
- [x] Compare the current behavior against the pre-cleanup baseline around state auto-snapping and node creation context.
- [x] Fix the virtual output pending-source regression that broke create-input snapping.
- [x] Add focused regression coverage for preserving virtual output pending sources.
- [x] Extract canvas connection interaction decisions into `canvasConnectionInteractionModel.ts`.
- [x] Move auto-snap target/source selection and node-creation payload building out of `EditorCanvas.vue`.
- [x] Add focused interaction-model coverage for virtual output creation payloads, create-input fallback anchors, and reverse virtual input snapping.
- [x] Run focused interaction, structure, and unused-symbol checks.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the consolidated interaction cleanup.
- **Status:** completed

### Phase 15: Edge Interaction and Node Measurement Composables
- [x] Add failing controller tests for canvas edge interactions.
- [x] Extract flow-edge delete confirmation and data-edge state editing into `useCanvasEdgeInteractions.ts`.
- [x] Add failing measurement-controller tests.
- [x] Extract node element registration, anchor-slot measurement, observer teardown, and measured node sizes into `useCanvasNodeMeasurements.ts`.
- [x] Update `EditorCanvas.vue` to consume both composables while keeping pointer event wrappers in the component.
- [x] Update structure tests to lock the new composable boundaries.
- [x] Run focused canvas interaction/measurement/structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 16: NodeCard Text Editor Composable
- [x] Add failing composable coverage for title/description confirmation, pointer activation, and metadata commit behavior.
- [x] Extract NodeCard title/description editor refs, timers, pointer handling, confirmation window, focus scheduling, draft editing, and commit behavior into `useNodeCardTextEditor.ts`.
- [x] Update `NodeCard.vue` to consume the composable while keeping template event names and surrounding panel cleanup in the component.
- [x] Update structure tests to lock the new composable boundary.
- [x] Run focused NodeCard text editor, text model, and structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 17: NodeCard Floating Panel Composable
- [x] Re-read the formal roadmap at `docs/future/2026-04-28-architecture-refactor-roadmap.md` and realign P1 work to `useNodeFloatingPanels`.
- [x] Add failing composable coverage for top-action confirmation timers and global outside-panel close behavior.
- [x] Extract NodeCard top action ref/timer state, confirm-window lifecycle, floating-surface target detection, and document listener wiring into `useNodeFloatingPanels.ts`.
- [x] Update `NodeCard.vue` to consume the composable while keeping component-specific panel cleanup and action confirmation callbacks in the component.
- [x] Update structure tests to lock the new roadmap boundary.
- [x] Run focused floating-panel and NodeCard structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 18: NodeCard State Confirm Floating Panel State
- [x] Continue the formal roadmap `useNodeFloatingPanels` step.
- [x] Add failing composable coverage for state editor confirmation and remove-state confirmation active anchors and timers.
- [x] Extend `useNodeFloatingPanels.ts` to own state editor/remove-state confirm anchor refs, timeout lifecycle, and open-state helpers.
- [x] Update `NodeCard.vue` to consume the composable while keeping state draft sync, update-state emits, and remove-port-state emits in the component.
- [x] Update structure tests and roadmap notes for the expanded composable boundary.
- [x] Run focused floating-panel and NodeCard structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 19: NodeCard Port Reorder Composable
- [x] Continue the formal roadmap P1 sequence after `useNodeFloatingPanels`.
- [x] Add failing composable coverage for port reorder pointer activation, target resolution, cleanup, and click suppression.
- [x] Extract NodeCard port reorder pointer state, window listener lifecycle, floating-port projection, and commit handling into `usePortReorder.ts`.
- [x] Update `NodeCard.vue` to consume the composable while preserving `reorder-port-state` event payloads and state-editor click behavior.
- [x] Update structure tests and roadmap notes for the new `usePortReorder` boundary.
- [x] Run focused port reorder and NodeCard structure tests.
- [x] Run TypeScript unused-symbol verification.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 20: Agent State Port List Component
- [x] Continue the formal roadmap P1 sequence after `usePortReorder`.
- [x] Add failing structure coverage for `StatePortList.vue` and `NodeCard.vue` delegation.
- [x] Extract agent real input/output state pill list markup, state-editor popover wiring, remove buttons, hover/click/reorder emits, and local port-list styles into `StatePortList.vue`.
- [x] Update `NodeCard.vue` to consume the component while keeping create-port popovers, state draft mutation, and graph mutation emits in the parent.
- [x] Update roadmap notes for the new `StatePortList.vue` boundary.
- [x] Run focused StatePortList, NodeCard structure, port reorder, and TypeScript checks.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 21: Agent State Port Create Entry Component
- [x] Continue the formal roadmap P1 `StatePortList.vue` sequence.
- [x] Add failing structure coverage for agent create rows and create-popover delegation.
- [x] Move agent `+ input` and `+ output` create row markup, anchor slots, create popover wiring, and local create-row styles into `StatePortList.vue`.
- [x] Keep port draft mutation, validation, locked-edit guards, and graph mutation emits in `NodeCard.vue`.
- [x] Update roadmap/progress notes for the expanded `StatePortList.vue` boundary.
- [x] Run focused StatePortList, NodeCard structure, port reorder, and TypeScript checks.
- [x] Run the full frontend test suite and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Commit and push the cleanup.
- **Status:** completed

### Phase 22: Auto-Continuation Progress Gate
- [ ] Re-read the formal roadmap and current planning memory.
- [ ] Recalculate total roadmap progress after Phase 21 and record whether it reached 100%.
- [ ] Because the current total roadmap estimate is about 46%, automatically keep the cleanup loop open.
- [ ] Select the next safest roadmap slice and write the next concrete implementation phase before changing code.
- [ ] Continue the standard safety loop for that slice: focused red tests, scoped implementation, focused verification, broader verification, dev restart for code changes, commit, push, and another progress judgment.
- **Status:** in progress

## Progress Estimate
| Scope | Estimate |
|-------|----------|
| Overall roadmap cleanup before this batch | About 30% complete. |
| P1 `NodeCard.vue` cleanup before this batch | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup before this batch | About 14% complete. |
| Build/chunk warning remediation before this batch | About 80% complete. |
| Overall roadmap cleanup after this batch | About 35% complete after the interaction repair pass. |
| P1 `NodeCard.vue` cleanup target after this batch | About 49% complete. |
| P2 `EditorCanvas.vue` cleanup after this batch | About 28% complete after extracting the connection interaction model. |
| Build/chunk warning remediation after this batch | Warning elimination confirmed; no Vite large chunk warning in production build. |
| Overall roadmap cleanup after Phase 15 | About 39% complete. |
| P2 `EditorCanvas.vue` cleanup after Phase 15 | About 41% complete after edge interaction and node measurement extraction. |
| Overall roadmap cleanup after Phase 16 | About 41% complete after text editor composable extraction. |
| P1 `NodeCard.vue` cleanup after Phase 16 | About 54% complete after moving text editor interaction state into a tested composable. |
| Overall roadmap cleanup after Phase 17 | About 42% complete after starting the roadmap `useNodeFloatingPanels` extraction. |
| P1 `NodeCard.vue` cleanup after Phase 17 | About 57% complete after moving top-action and global outside-close floating-panel state into a tested composable. |
| Overall roadmap cleanup after Phase 18 | About 43% complete after moving state edit/remove confirm refs and timers into `useNodeFloatingPanels`. |
| P1 `NodeCard.vue` cleanup after Phase 18 | About 59% complete after moving state edit/remove confirm refs and timers into `useNodeFloatingPanels`. |
| Overall roadmap cleanup after Phase 19 | About 44% complete after moving port reorder interaction state into a tested composable. |
| P1 `NodeCard.vue` cleanup after Phase 19 | About 62% complete after moving port reorder interaction state into a tested composable. |
| Overall roadmap cleanup after Phase 20 | About 45% complete after moving agent real state port list markup into `StatePortList.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 20 | About 65% complete after moving agent real state port list markup into `StatePortList.vue`. |
| Overall roadmap cleanup after Phase 21 | About 46% complete after moving agent state port create entries into `StatePortList.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 21 | About 68% complete after moving agent create rows and create-popover wiring into `StatePortList.vue`. |
| Current continuation gate after Phase 21 | Total roadmap progress is below 100%, so Phase 22 is automatically opened and must re-evaluate progress before selecting the next implementation slice. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Make the next batch exactly ten cleanup rounds | The user explicitly asked to increase the next round count to ten. |
| Stay mostly inside `EditorCanvas.vue` | It remains a large mixed-responsibility component, and the selected helpers are pure enough to test without UI risk. |
| Avoid backend runtime refactors in this batch | Backend executor/provider files need broader behavior fixtures and are higher risk than the current canvas projection helpers. |
| Keep side effects local | DOM measurement, refs, timers, emits, lock guards, and viewport mutation stay in the component. |
| Automatically continue below 100% total progress | The user explicitly asked that each completed round re-judge total optimization progress and open the next round when the roadmap is not yet complete. |

## Notes
- Clean baseline: `main...origin/main` after `8017081 更新第十八至二十轮清理进度`.
- `EditorCanvas.vue` starts this batch at 4,226 lines.
- The previous production build completed without a large chunk warning.
- This batch leaves `EditorCanvas.vue` at 4,039 lines, down from 4,226 at the batch start.
- The baseline interaction repair pass leaves `EditorCanvas.vue` at 3,848 lines by moving connection auto-snap and creation payload decisions into a tested model.
- Phase 15 leaves `EditorCanvas.vue` at 3,363 lines by moving edge popover interaction state and node measurement state into composables.
- Phase 16 moves NodeCard title/description editing state into `useNodeCardTextEditor.ts`; `NodeCard.vue` drops from 5,095 to 4,930 lines before final verification.
- Phase 17 starts the roadmap `useNodeFloatingPanels` step by moving top-action confirmation timers and global outside-panel close listener wiring into a tested composable; `NodeCard.vue` drops to 4,856 lines before final verification.
- Phase 18 continues `useNodeFloatingPanels` by moving state edit/remove confirmation refs and timers; `NodeCard.vue` drops to 4,808 lines before final verification.
- Phase 19 starts the roadmap `usePortReorder` step by moving pointer/listener/click-suppression state extraction from `NodeCard.vue`; `NodeCard.vue` drops to 4,652 lines before final verification.
- Phase 20 starts the roadmap `StatePortList.vue` step with a conservative slice for agent real input/output state port rows only; create-port popovers remain in `NodeCard.vue`. `NodeCard.vue` drops to 4,544 lines before final verification.
- Phase 21 continues the roadmap `StatePortList.vue` step by moving agent `+ input`/`+ output` create rows and create-popover wiring into the child component while leaving draft mutation, validation, locked guards, and graph emits in `NodeCard.vue`. `NodeCard.vue` drops to 4,472 lines before final verification.
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Structure test still expected the old inline forced-edge-id block | Focused post-implementation run | Updated the assertion to verify the extracted `buildForceVisibleProjectedEdgeIds` boundary and flow confirm id input. |
| Virtual any output drags no longer auto-snapped to new agent inputs after cleanup | Baseline comparison against `8017081` | Restored virtual output pending-source preservation in `buildPendingAgentInputSourceByNodeId`, added regression coverage, and extracted follow-up interaction helpers into `canvasConnectionInteractionModel.ts`. |
| `vue-tsc` flagged unused NodeCard destructures and mock DOM type gaps after `usePortReorder` extraction | Phase 19 TypeScript verification | Stopped destructuring global pointer handlers/pointer state in `NodeCard.vue`, made test source elements satisfy `EventTarget`, and narrowed query results inside `usePortReorder.ts`. |
