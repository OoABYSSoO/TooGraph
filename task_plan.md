# Task Plan: Repository Cleanup Execution Rounds 21-30

## Goal
Run a ten-round conservative cleanup batch focused on `EditorCanvas.vue` pure projection and interaction-model helpers, then close the baseline interaction regressions in one larger pass while preserving graph editing behavior, runtime visuals, drag/connect workflows, deletion behavior, and dev startup health.

## Current Phase
Phase 19 in progress

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
- [ ] Commit and push the cleanup.
- **Status:** in_progress

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
| Overall roadmap cleanup after Phase 19 | Targeting about 44% complete once commit and push pass. |
| P1 `NodeCard.vue` cleanup after Phase 19 | Targeting about 62% complete after moving port reorder interaction state into a tested composable. |

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Make the next batch exactly ten cleanup rounds | The user explicitly asked to increase the next round count to ten. |
| Stay mostly inside `EditorCanvas.vue` | It remains a large mixed-responsibility component, and the selected helpers are pure enough to test without UI risk. |
| Avoid backend runtime refactors in this batch | Backend executor/provider files need broader behavior fixtures and are higher risk than the current canvas projection helpers. |
| Keep side effects local | DOM measurement, refs, timers, emits, lock guards, and viewport mutation stay in the component. |

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
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Structure test still expected the old inline forced-edge-id block | Focused post-implementation run | Updated the assertion to verify the extracted `buildForceVisibleProjectedEdgeIds` boundary and flow confirm id input. |
| Virtual any output drags no longer auto-snapped to new agent inputs after cleanup | Baseline comparison against `8017081` | Restored virtual output pending-source preservation in `buildPendingAgentInputSourceByNodeId`, added regression coverage, and extracted follow-up interaction helpers into `canvasConnectionInteractionModel.ts`. |
| `vue-tsc` flagged unused NodeCard destructures and mock DOM type gaps after `usePortReorder` extraction | Phase 19 TypeScript verification | Stopped destructuring global pointer handlers/pointer state in `NodeCard.vue`, made test source elements satisfy `EventTarget`, and narrowed query results inside `usePortReorder.ts`. |
