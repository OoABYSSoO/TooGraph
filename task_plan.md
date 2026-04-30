# Task Plan: Repository Cleanup Execution Rounds 21-30

## Goal
Run a ten-round conservative cleanup batch focused on `EditorCanvas.vue` pure projection and interaction-model helpers, then close the baseline interaction regressions in one larger pass while preserving graph editing behavior, runtime visuals, drag/connect workflows, deletion behavior, and dev startup health.

## Progress Accuracy Note
- The earlier `99.x%` values are no longer treated as the true total optimization progress. They reflected the active frontend cleanup batch getting close to its own tail, not the whole architecture roadmap.
- The honest full-roadmap progress must include P0 cleanup, P1 `NodeCard.vue`, P2 `EditorCanvas.vue`, P3 `EditorWorkspaceShell.vue`, and P4 backend runtime/provider cleanup.
- Current conservative estimate after Phase 109: full roadmap is about 91% complete; frontend-focused roadmap is about 83-85% complete; P3 `EditorWorkspaceShell.vue` is about 82% complete; backend P4 is about 73-76% started.

## Current Phase
Phase 110 in progress

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
- [x] Re-read the formal roadmap and current planning memory.
- [x] Recalculate total roadmap progress after Phase 21 and record whether it reached 100%.
- [x] Because the current total roadmap estimate is about 46%, automatically keep the cleanup loop open.
- [x] Select the next safest roadmap slice and write the next concrete implementation phase before changing code.
- [x] Continue the standard safety loop for that slice: focused red tests, scoped implementation, focused verification, broader verification, dev restart for code changes, commit, push, and another progress judgment.
- **Status:** completed

### Phase 23: Agent Skill Picker Component
- [x] Continue P1 node body component extraction with a low-risk agent-body subcomponent.
- [x] Add failing structure coverage for `AgentSkillPicker.vue` and `NodeCard.vue` delegation.
- [x] Move the agent skill picker trigger, popover panel, available-skill list, attached-skill badges, and local skill-picker styles into `AgentSkillPicker.vue`.
- [x] Keep skill list derivation, lock guards, attach/remove patch creation, and agent config emits in `NodeCard.vue`.
- [x] Run focused AgentSkillPicker/NodeCard structure tests and relevant skill model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; if below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 24: Agent Runtime Controls Component
- [x] Continue P1 node body component extraction with the next agent-body presentation boundary.
- [x] Add failing structure coverage for `AgentRuntimeControls.vue` and `NodeCard.vue` delegation.
- [x] Move the agent model select, thinking-mode select card, breakpoint switch card, and local runtime-control styles into `AgentRuntimeControls.vue`.
- [x] Keep model option derivation, refresh-model emit, thinking/breakpoint handlers, locked guards, and agent config emits in `NodeCard.vue`.
- [x] Run focused AgentRuntimeControls/NodeCard structure tests plus agent config model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; because it is still below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 25: Agent Node Body Component
- [x] Continue P1 node body component extraction with the full agent-body presentation wrapper.
- [x] Add failing structure coverage for `AgentNodeBody.vue` and `NodeCard.vue` delegation.
- [x] Move the agent input/output state port columns, `AgentRuntimeControls`, `AgentSkillPicker`, and task instruction textarea wiring into `AgentNodeBody.vue`.
- [x] Keep state port derivation, create/edit drafts, validation, lock guards, agent config emits, skill patch creation, and graph mutation emits in `NodeCard.vue`.
- [x] Run focused AgentNodeBody/NodeCard structure tests plus port reorder, skill picker, and agent config model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; because it is still below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 26: Input Node Body Component
- [x] Continue P1 node body component extraction with the input-body presentation wrapper.
- [x] Add failing structure coverage for `InputNodeBody.vue` and `NodeCard.vue` delegation.
- [x] Move input boundary controls, knowledge-base selector, asset upload/dropzone/preview, editable input textarea, and read-only surface presentation into `InputNodeBody.vue`.
- [x] Keep input value derivation, uploaded asset parsing, knowledge-base option derivation, lock guards, file/drop handlers, and graph/state mutation emits in `NodeCard.vue`.
- [x] Run focused InputNodeBody/NodeCard structure tests plus uploaded asset, knowledge-base, and input boundary model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; because it is still below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 27: Output Node Body Component
- [x] Continue P1 node body component extraction with the output-body presentation wrapper.
- [x] Add failing structure coverage for `OutputNodeBody.vue` and `NodeCard.vue` delegation.
- [x] Move output persistence controls, preview surface metadata, and rendered output preview presentation into `OutputNodeBody.vue`.
- [x] Keep output preview content derivation, display/persist option derivation, lock guards, output config handlers, and graph/state mutation emits in `NodeCard.vue`.
- [x] Preserve the output input state pill popover in a parent-owned slot unless tests prove moving it is low risk.
- [x] Run focused OutputNodeBody/NodeCard structure tests plus output preview and output config model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; because it is still below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 28: NodeCard Presentation Closeout
- [x] Continue P1 node presentation extraction with a larger NodeCard closeout slice.
- [x] Add failing structure coverage for `ConditionNodeBody.vue`, `NodeCardTopActions.vue`, and `NodeCard.vue` delegation.
- [x] Move condition source state pill presentation, state/create popover wiring, operator/value/loop controls, and local condition body styles into `ConditionNodeBody.vue`.
- [x] Move top action dock, advanced agent/output popover controls, confirm popover presentation, and top-action styles into `NodeCardTopActions.vue`.
- [x] Keep condition rule draft synchronization, loop-limit draft commits, output/agent config patch handlers, action confirmations, lock guards, and graph/state mutation emits in `NodeCard.vue`.
- [x] Remove stale condition branch editor styles that are no longer rendered.
- [x] Run focused ConditionNodeBody/NodeCardTopActions/NodeCard structure tests plus condition rule, loop-limit, output config, and agent config model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; if below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 29: NodeCard Primary State Port and Residual Chrome Closeout
- [x] Continue P1 NodeCard residual cleanup after the Phase 28 presentation closeout.
- [x] Add failing structure coverage for primary input/output state-port slot extraction and floating drag-preview delegation.
- [x] Move the remaining input/output primary state pill presentation and reusable local styles out of `NodeCard.vue` into `PrimaryStatePort.vue`.
- [x] Move the port-reorder floating pill Teleport and local floating styles out of `NodeCard.vue` into `FloatingStatePortPill.vue`.
- [x] Keep state editor confirmation timers, state draft synchronization, port creation/validation, locked guards, and graph/state mutation emits in `NodeCard.vue`.
- [x] Run focused primary-state/NodeCard structure tests plus state editor, create-port, and reorder model tests.
- [x] Run TypeScript unused-symbol verification, full frontend tests, Vite structure tests, and production build.
- [x] Restart the dev environment with `npm run dev` and verify frontend/backend health.
- [x] Recalculate total roadmap progress; because it is still below 100%, automatically open the next phase.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 30: NodeCard P1 Completion Gate and Next-Roadmap Slice Selection
- [x] Re-read the formal roadmap and decide whether remaining `NodeCard.vue` code is intentional orchestration or still safe P1 presentation debt.
- [x] Decide that remaining `NodeCard.vue` state drafts, validation, confirmation windows, lock guards, and graph/state emits should stay parent-owned until stronger controller coverage exists.
- [x] Open the next safest P2 roadmap slice because P1 low-risk presentation extraction is effectively closed.
- [x] Add focused red tests for the selected P2 boundary: node drag/resize threshold, viewport-scale projection, and resize result projection.
- [x] Extract the node drag/resize pure move model into `canvasNodeDragResizeModel.ts` while preserving DOM pointer capture, animation-frame batching, and emits in `EditorCanvas.vue`.
- [x] Preserve baseline-sensitive interactions: automatic snapping, node creation context/naming, state editor confirm windows, port creation, and drag reorder.
- [x] Run focused tests for the selected boundary, full verification, production build, dev restart, browser smoke, and re-evaluate total progress.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 30.
- [x] Commit and push the cleanup and planning updates.
- **Status:** completed

### Phase 31: EditorCanvas Node Drag/Resize Continuation
- [x] Continue P2 after `canvasNodeDragResizeModel.ts` by inspecting whether the remaining node drag/resize state can move into a small composable without touching connection completion or auto-snap.
- [x] Add focused red tests for the selected next Canvas boundary before production changes.
- [x] Keep automatic snapping, node creation payloads, connection completion, DOM measurement, pointer capture, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 31.
- **Status:** completed

### Phase 32: EditorCanvas Connection Interaction Controller Gate
- [x] Re-read the formal roadmap and Phase 31 findings before making more P2 Canvas changes.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a connection interaction composable around pending connection refs, hover target, auto-snap state, and completion coordination.
- [x] Add focused red tests for the chosen controller boundary before production changes.
- [x] Preserve baseline-sensitive behavior: automatic snapping, new-node naming/context payloads, reverse input drags, connection completion, node drag/resize, panning, DOM measurement, and graph mutation emits.
- [x] Run focused Canvas tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 32.
- **Status:** completed

### Phase 33: EditorCanvas Connection Completion Action Gate
- [x] Re-read the formal roadmap, Phase 32 findings, and current connection completion emit branches before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pure completion-action model for `connect-flow`, `connect-route`, `connect-state`, `connect-state-input-source`, `reconnect-flow`, and `reconnect-route`.
- [x] Add focused red tests for the selected completion-action boundary before production changes.
- [x] Keep actual emits, active connection refs, auto-snap target selection, node creation payloads, panning, node drag/resize, and DOM measurement behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 33.
- **Status:** completed

### Phase 34: EditorCanvas Auto-Snap Resolver Gate
- [x] Re-read the formal roadmap, Phase 33 findings, and current auto-snap resolver functions before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pure resolver model for flow target, state target, reverse state input source, and node-body target anchor selection.
- [x] Add focused red tests for the selected auto-snap resolver boundary before production changes.
- [x] Keep DOM pointer coordinate conversion, active connection refs, node creation payloads, completion emits, panning, node drag/resize, and DOM measurement behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 34.
- **Status:** completed

### Phase 35: EditorCanvas Connection Creation Menu Coordination Gate
- [x] Re-read the formal roadmap, Phase 34 findings, and current pending connection creation-menu flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a small controller/model around pending connection creation-menu payload resolution and cleanup coordination.
- [x] Add focused red tests for the selected connection creation-menu boundary before production changes.
- [x] Keep actual `emit("open-node-creation-menu")`, node creation context/naming payloads, auto-snap selection, completion emits, panning, node drag/resize, and DOM measurement behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 35.
- **Status:** completed

### Phase 36: EditorCanvas Connection Pointer-Up Decision Gate
- [x] Re-read the formal roadmap, Phase 35 findings, and current active-connection pointer-up flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a controller/model around pointer-up routing between locked cleanup, auto-snapped completion, and empty-canvas creation-menu opening.
- [x] Add focused red tests for the selected pointer-up decision boundary before production changes.
- [x] Keep actual DOM pointer capture/release, `emit` dispatch, node creation context/naming payloads, auto-snap target selection, panning, node drag/resize, and DOM measurement behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 36.
- **Status:** completed

### Phase 37: EditorCanvas Active Connection Node Pointer-Down Gate
- [x] Re-read the formal roadmap, Phase 36 findings, and current node pointer-down flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a model/controller around active-connection node-body pointer-down routing between body-snap completion and no-op connection handling.
- [x] Add focused red tests for the selected node pointer-down decision boundary before production changes.
- [x] Keep actual DOM event preventDefault/focus behavior, `emit` dispatch, node creation context/naming payloads, auto-snap target selection, panning, node drag/resize, and DOM measurement behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 37.
- **Status:** completed

### Phase 38: EditorCanvas Active Connection Pointer-Move Request Gate
- [x] Re-read the formal roadmap, Phase 37 findings, and current active-connection pointer-move flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a request model around hover-node sync plus pending connection preview target/fallback update.
- [x] Add focused red tests for the selected pointer-move request boundary before production changes.
- [x] Keep actual DOM node hit-testing, pointer-to-canvas conversion, animation-frame scheduling, auto-snap target selection, panning, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 38.
- **Status:** completed

### Phase 39: EditorCanvas Anchor Pointer-Down Request Gate
- [x] Re-read the formal roadmap, Phase 38 findings, and current anchor pointer-down flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a request model around locked-edit, completion, ignored anchor, and start/toggle routing.
- [x] Add focused red tests for the selected anchor pointer-down request boundary before production changes.
- [x] Keep actual DOM focus, selection, transient cleanup, text selection clearing, start/toggle composable execution, completion emits, panning, node drag/resize, and DOM measurement behaviorally stable.
- [x] Run focused Canvas and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 39.
- **Status:** completed

### Phase 40: EditorCanvas Node Resize Pointer-Down Gate
- [x] Re-read the formal roadmap, Phase 39 findings, and current node-resize pointer-down flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a node-resize pointer-down action model around missing node, locked edit, active connection, and start-resize routing.
- [x] Add focused red tests for the selected node-resize pointer-down boundary before production changes.
- [x] Keep actual DOM focus, pointer capture, capture element storage, transient cleanup, selected-edge cleanup, drag/resize composable execution, connection interaction, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas drag/resize and graph-connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 40.
- **Status:** completed

### Phase 41: EditorCanvas Node Pointer-Down Drag Setup Gate
- [x] Re-read the formal roadmap, Phase 40 findings, and current node pointer-down drag setup flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a node pointer-down action model around missing node, locked edit, active connection continuation/completion, inline-editor focus preservation, and start-drag setup.
- [x] Add focused red tests for the selected node pointer-down boundary before production changes.
- [x] Keep actual DOM focus/preventDefault, pointer capture, capture element storage, selection, pending connection cleanup, scheduled-frame cancellation, drag composable execution, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas drag/resize and connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 41.
- **Status:** completed

### Phase 42: EditorCanvas Canvas Pointer-Down Pan Setup Gate
- [x] Re-read the formal roadmap, Phase 41 findings, and current canvas pointer-down pan/pinch setup flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a canvas pointer-down action model around touch pinch start versus pan start setup policy.
- [x] Add focused red tests for the selected canvas pointer-down boundary before production changes.
- [x] Keep actual DOM focus/preventDefault, pointer capture, pointer snapshot storage, selection clearing, pending connection cleanup, pinch zoom startup, viewport pan execution, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas viewport/pinch/drag/connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 42.
- **Status:** completed

### Phase 43: EditorCanvas Wheel Zoom Request Gate
- [x] Re-read the formal roadmap, Phase 42 findings, and current wheel zoom flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pure wheel zoom request model around zero-delta ignore, scale delta, and pointer-centered zoom inputs.
- [x] Add focused red tests for the selected wheel zoom request boundary before production changes.
- [x] Keep actual canvas DOM rect lookup, viewport mutation, wheel event binding, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas viewport/pinch/structure tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 43.
- **Status:** completed

### Phase 44: EditorCanvas Empty Canvas Double-Click Creation Gate
- [x] Re-read the formal roadmap, Phase 43 findings, and current empty-canvas double-click creation flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a creation request model around locked edit, ignored interactive targets, and empty-canvas menu opening.
- [x] Add focused red tests for the selected double-click creation boundary before production changes.
- [x] Keep actual DOM target inspection, canvas coordinate conversion, `open-node-creation-menu` emit, dropped-file creation, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas creation/structure and connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 44.
- **Status:** completed

### Phase 45: EditorCanvas File Drop Creation Gate
- [x] Re-read the formal roadmap, Phase 44 findings, and current file-drop creation flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a drop creation request model around locked edit, node/card target ignore, missing file ignore, and create-from-file payload.
- [x] Add focused red tests for the selected file-drop creation boundary before production changes.
- [x] Keep actual DOM target inspection, `dataTransfer` file lookup/dropEffect mutation, canvas coordinate conversion, `create-node-from-file` emit, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas creation/structure and connection tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 45.
- **Status:** completed

### Phase 46: EditorCanvas Drag-Over Drop Effect Gate
- [x] Re-read the formal roadmap, Phase 45 findings, and current drag-over/drop flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a drag-over drop-effect request model around locked edit, dragged-file availability, and copy/none effect selection.
- [x] Add focused red tests for the selected drag-over boundary before production changes.
- [x] Keep actual `event.dataTransfer.dropEffect` mutation, preventDefault behavior, file-drop creation, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused Canvas creation/structure and connection tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 46.
- **Status:** completed

### Phase 47: EditorCanvas Selected Edge Keyboard Delete Gate
- [x] Re-read the formal roadmap, Phase 46 findings, and current selected-edge keyboard delete flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a keyboard-delete action model around editable target ignore, locked edit, missing selected edge, no-op non-deletable edge, and flow/route delete payload.
- [x] Add focused red tests for the selected keyboard-delete boundary before production changes.
- [x] Keep actual `event.preventDefault`, `remove-flow` / `remove-route` emits, selected-edge clearing, pending connection point clearing, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused edge/keyboard/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 47.
- **Status:** completed

### Phase 48: EditorCanvas Edge Visibility Mode Click Gate
- [x] Re-read the formal roadmap, Phase 47 findings, and current edge visibility toolbar flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is an edge-visibility click action model around locked edit, same-mode no-op, and mode-change cleanup policy.
- [x] Add focused red tests for the selected edge visibility boundary before production changes.
- [x] Keep actual toolbar event binding, locked-interaction guard side effects, edge mode ref mutation, selected-edge clearing, pending connection clearing, transient canvas cleanup, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused edge visibility/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 48.
- **Status:** completed

### Phase 49: EditorCanvas Lock Banner Click Gate
- [x] Re-read the formal roadmap, Phase 48 findings, and current lock-banner click flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a lock-banner action model around missing current run node versus opening human review for the current run node.
- [x] Add focused red tests for the selected lock-banner boundary before production changes.
- [x] Keep actual button event binding, `locked-edit-attempt` emit, `open-human-review` emit, lock styling, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused run-presentation/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 49.
- **Status:** completed

### Phase 50: EditorCanvas Locked Node Pointer Capture Gate
- [x] Re-read the formal roadmap, Phase 49 findings, and current locked-node pointer capture flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a locked-node pointer capture action model around unlocked no-op, human-review/edit target locked-attempt notification, and locked pointer-capture setup policy.
- [x] Add focused red tests for the selected locked-node pointer capture boundary before production changes.
- [x] Keep actual DOM target classification, `preventDefault`, `stopPropagation`, canvas focus, locked-attempt emit, transient cleanup, pending connection cleanup, selected-edge clearing, node selection, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused run-presentation/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 50.
- **Status:** completed

### Phase 51: EditorCanvas Locked Interaction Guard Gate
- [x] Re-read the formal roadmap, Phase 50 findings, and current generic locked-canvas interaction guard before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a generic locked-interaction guard action model around unlocked no-op, locked-attempt emit, transient cleanup, pending connection cleanup, selected-edge clearing, and canvas focus/selection preservation.
- [x] Add focused red tests for the selected locked-interaction guard boundary before production changes.
- [x] Keep actual `emit("locked-edit-attempt")`, cleanup execution, DOM event handlers, connection, panning, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused locked-interaction/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 51.
- **Status:** completed

### Phase 52: EditorCanvas Edge Pointer Down Gate
- [x] Re-read the formal roadmap, Phase 51 findings, and current edge pointer-down flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is an edge pointer-down action model around locked edit, flow/route delete confirm, data-edge state confirm, selected-edge toggle, selected-edge preview, and selection cleanup policy.
- [x] Add focused red tests for the selected edge pointer-down boundary before production changes.
- [x] Keep actual `event.preventDefault`, canvas focus, transient cleanup, pending connection cleanup, edge confirm composable calls, selected-edge ref mutation, pending connection point mutation, selection clearing, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused edge-pointer/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 52.
- **Status:** completed

### Phase 53: EditorCanvas Pending Creation Menu Gate
- [x] Re-read the formal roadmap, Phase 52 findings, and current pending-connection creation menu flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pending-connection creation-menu action model around locked/no-connection ignore, empty-request ignore, open-menu payload, and connection cleanup policy.
- [x] Add focused red tests for the selected pending creation-menu boundary before production changes.
- [x] Keep actual canvas point resolution, event coordinates, `open-node-creation-menu` emit, transient cleanup, pending connection cleanup, panning, connection, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused creation-menu/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 53.
- **Status:** completed

### Phase 54: EditorCanvas Connection Completion Gate
- [x] Re-read the formal roadmap, Phase 53 findings, and current pending-connection completion flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a connection-completion action model around locked/no-connection ignore, empty-request ignore, completion emit action, and cleanup policy.
- [x] Add focused red tests for the selected connection-completion boundary before production changes.
- [x] Keep actual completion emit dispatch, selected-edge cleanup, connection cleanup, panning, node drag/resize, and graph mutation emits behaviorally stable.
- [x] Run focused completion/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 54.
- **Status:** completed

### Phase 55: EditorCanvas Zoom Button Scale Gate
- [x] Re-read the formal roadmap, Phase 54 findings, and current viewport zoom button flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a viewport zoom button action model around zoom-out, zoom-in, reset, scale clamping, and rounded scale values.
- [x] Add focused red tests for the selected viewport zoom-button boundary before production changes.
- [x] Keep actual viewport mutation, wheel zoom, minimap center zoom, panning, pinch zoom, viewport draft emits, and graph interaction behavior stable.
- [x] Run focused viewport/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 55.
- **Status:** completed

### Phase 56: EditorCanvas Minimap Center View Gate
- [x] Re-read the formal roadmap, Phase 55 findings, and current minimap center-view flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a minimap center-view action model around empty canvas-size ignore and centered viewport projection.
- [x] Add focused red tests for the selected minimap center-view boundary before production changes.
- [x] Keep actual canvas size refresh, viewport mutation, minimap drag/click behavior, zoom button behavior, wheel zoom, panning, pinch zoom, and graph interactions stable.
- [x] Run focused minimap/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 56.
- **Status:** completed

### Phase 57: EditorCanvas Focus Node Viewport Gate
- [x] Re-read the formal roadmap, Phase 56 findings, and current external node-focus viewport flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a focus-node viewport action model around missing target ignore and focused viewport projection.
- [x] Add focused red tests for the selected focus-node viewport boundary before production changes.
- [x] Keep actual node selection, DOM rect/element measurement, viewport mutation, minimap, zoom controls, panning, and graph interactions stable.
- [x] Run focused focus-viewport/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 57.
- **Status:** completed

### Phase 58: EditorCanvas Pinch Zoom Update Gate
- [x] Re-read the formal roadmap, Phase 57 findings, and current `updatePinchZoom` flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pinch-zoom update action model around missing pinch/target cleanup, non-positive distance ignore, and zoom request projection.
- [x] Add focused red tests for the selected pinch-zoom update boundary before production changes.
- [x] Keep actual active pointer cache updates, DOM canvas rect lookup, viewport `zoomAt`, pinch cleanup execution, panning, connection pointer move, node drag/resize, and graph interactions stable.
- [x] Run focused pinch/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 58.
- **Status:** completed

### Phase 59: EditorCanvas Pinch Pointer Release Gate
- [x] Re-read the formal roadmap, Phase 58 findings, and current `handleCanvasPointerUp` pinch release flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pinch pointer-up action model around released pinch-pointer cleanup/end-pan versus normal pointer-up continuation.
- [x] Add focused red tests for the selected pinch pointer-up boundary before production changes.
- [x] Keep actual active pointer deletion, DOM pointer-capture release, node drag/resize release, connection pointer-up routing, viewport pan end, and graph interactions stable.
- [x] Run focused pinch/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 59.
- **Status:** completed

### Phase 60: EditorCanvas Touch Pointer Move Gate
- [x] Re-read the formal roadmap, Phase 59 findings, and current touch branch in `handleCanvasPointerMove` before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a touch pointer-move action model around tracked touch pointer update, pinch preventDefault, and scheduled pinch update routing.
- [x] Add focused red tests for the selected touch pointer-move boundary before production changes.
- [x] Keep actual active pointer cache mutation, event `preventDefault`, scheduled `updatePinchZoom`, connection pointer move, node drag/resize, panning, and graph interactions stable.
- [x] Run focused pinch/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 60.
- **Status:** completed

### Phase 61: EditorCanvas Pan Pointer Move Gate
- [x] Re-read the formal roadmap, Phase 60 findings, and current pan branch in `handleCanvasPointerMove` before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a pan pointer-move action model around panning/no-op routing after touch, connection, and node drag/resize handling.
- [x] Add focused red tests for the selected pan pointer-move boundary before production changes.
- [x] Keep actual scheduled `viewport.movePan`, pointer event passing, connection pointer move, node drag/resize, touch pinch handling, and graph interactions stable.
- [x] Run focused viewport/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 61.
- **Status:** completed

### Phase 62: EditorCanvas Canvas Point Projection Gate
- [x] Re-read the formal roadmap, Phase 61 findings, and current `resolveCanvasPoint` flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a canvas point projection model around missing-canvas fallback and viewport-relative world point projection.
- [x] Add focused red tests for the selected canvas point projection boundary before production changes.
- [x] Keep actual DOM canvas rect lookup, pending connection fallback point, event coordinate inputs, connection/menu/drop consumers, and graph interactions stable.
- [x] Run focused viewport/structure and Canvas interaction regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 62.
- **Status:** completed

### Phase 63: EditorCanvas Canvas Size Update Gate
- [x] Re-read the formal roadmap, Phase 62 findings, and current `updateCanvasSize` flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is a canvas size update model around missing-element ignore and changed-size/no-op decisions.
- [x] Add focused red tests for the selected canvas size update boundary before production changes.
- [x] Keep actual DOM clientWidth/clientHeight reads, `ResizeObserver` lifecycle, `canvasSize` ref mutation, minimap consumers, and viewport interactions stable.
- [x] Run focused viewport/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 63.
- **Status:** completed

### Phase 64: EditorCanvas Edge Target Point Gate
- [x] Re-read the formal roadmap, Phase 63 findings, and current `resolveEdgeTargetPoint` flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is edge target point projection for selected-edge pending connection points.
- [x] Add focused red tests for the selected edge target point boundary before production changes.
- [x] Keep actual projected anchor refs, selected-edge mutation, pending connection point mutation, edge pointer-down routing, and graph interactions stable.
- [x] Run focused edge pointer/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 64.
- **Status:** completed

### Phase 65: EditorCanvas Flow Hotspot Visibility Gate
- [x] Re-read the formal roadmap, Phase 64 findings, and current `isFlowHotspotVisible` flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is flow/route hotspot visibility projection around node-interaction and active-source checks.
- [x] Add focused red tests for the selected flow hotspot visibility boundary before production changes.
- [x] Keep actual selected/hovered refs, edge visibility mode ref, active connection source ref, anchor overlay rendering, and graph interactions stable.
- [x] Run focused edge visibility/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 65.
- **Status:** completed

### Phase 66: EditorCanvas Projected Edge Visibility Gate
- [x] Re-read the formal roadmap, Phase 65 findings, and current projected-edge visibility flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is the projected-edge visibility membership check around `visibleProjectedEdgeIds`.
- [x] Add focused red tests for the projected-edge visibility gate before production changes.
- [x] Keep `visibleProjectedEdgeIds` computation, edge projection, SVG rendering, selected edge state, and anchor overlay rendering stable.
- [x] Run focused edge visibility/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 66.
- **Status:** completed

### Phase 67: EditorCanvas Anchor Connection Class State
- [x] Re-read the formal roadmap, Phase 66 findings, and current anchor/flow hotspot class state flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is active-source and eligible-target class projection for flow hotspots and state anchors.
- [x] Add focused red tests for the selected class-state boundary before production changes.
- [x] Keep active connection source ref, eligible target ids, connection styling context, pointer handlers, and anchor overlay rendering stable.
- [x] Run focused interaction-style/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 67.
- **Status:** completed

### Phase 68: EditorCanvas Connection Completion Eligibility Gate
- [x] Re-read the formal roadmap, Phase 67 findings, and current `canCompleteCanvasConnection` flow before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is active connection target eligibility around state-target allowance and graph completion checks.
- [x] Add focused red tests for the connection completion eligibility gate before production changes.
- [x] Keep active connection ref, graph document input, projected anchors, auto-snap behavior, node creation payloads, and completion emits stable.
- [x] Run focused connection interaction/graph connection/structure tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 68.
- **Status:** completed

### Phase 69: EditorCanvas Projected Anchor Grouping
- [x] Re-read the formal roadmap, Phase 68 findings, and current projected-anchor computed grouping before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is flow/route/point anchor grouping from `projectedAnchors`.
- [x] Add focused red tests for projected anchor grouping before production changes.
- [x] Keep anchor projection, transient anchors, connection eligibility, overlay rendering, and pointer handlers stable.
- [x] Run focused anchor/structure and Canvas regression tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 69.
- **Status:** completed

### Phase 70: EditorCanvas Projected Edge Layer Grouping
- [x] Re-read the formal roadmap, Phase 69 findings, and current projected-edge SVG layer grouping before changing code.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is flow/route/data edge grouping from `projectedEdges`.
- [x] Add focused red tests for projected edge layer grouping before production changes.
- [x] Keep SVG layer ordering, delete highlights, selected-edge hitareas, edge classes, and pointer handlers stable.
- [x] Run focused edge projection/structure and Canvas regression tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 70.
- **Status:** completed

### Phase 71: EditorCanvas Projected Edge Class Projection
- [x] Re-read the formal roadmap, Phase 70 findings, and remaining edge-kind class bindings in `EditorCanvas.vue`.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is projected edge class and hitarea class projection.
- [x] Add focused red tests for projected edge class projection before production changes.
- [x] Keep selected-edge state, active-run edge state, connection preview classes, hitarea classes, SVG ordering, and pointer handlers stable.
- [x] Run focused interaction-style/structure and Canvas regression tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 71.
- **Status:** completed

### Phase 72: EditorCanvas Flow Hotspot Class Projection
- [x] Re-read the formal roadmap, Phase 71 findings, and remaining flow hotspot class bindings in `EditorCanvas.vue`.
- [x] Inspect whether the next safest `EditorCanvas.vue` boundary is flow hotspot outbound/visibility/connect class projection.
- [x] Add focused red tests for flow hotspot class projection before production changes.
- [x] Keep hotspot visibility, source/target connection styling, pointer enter/leave handlers, and flow/route anchor overlay behavior stable.
- [x] Run focused interaction-style/edge-visibility/structure and Canvas regression tests, TypeScript checks, full frontend tests or justified targeted regression, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 72.
- **Status:** completed

### Phase 73: EditorWorkspaceShell Run Event Stream Re-orientation
- [x] Re-read the formal roadmap, Phase 72 findings, and current `EditorWorkspaceShell.vue` run polling/SSE code before changing code.
- [x] Inspect whether the next safest P3 boundary is a small run event stream or run polling projection helper shared with run detail behavior.
- [x] Add focused red tests for the selected workspace-shell boundary before production changes.
- [x] Keep route sync, draft persistence, graph mutation emits, restore behavior, human-review state, and run status feedback stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 73.
- **Status:** completed

### Phase 74: Shared Run Polling Status Helper
- [x] Re-read the formal roadmap, Phase 73 findings, and duplicated run polling status checks in workspace and run detail code.
- [x] Inspect whether the next safest P3 boundary is moving queued/running/resuming polling semantics into the shared run-event model.
- [x] Add focused red tests before production changes.
- [x] Keep polling delays, abort behavior, EventSource close behavior, human-review opening, and terminal run persistence stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 74.
- **Status:** completed

### Phase 75: Run Event Output Payload Projection
- [x] Re-read the formal roadmap, Phase 74 findings, and current run event payload text/output-key/fallback-node projection code.
- [x] Inspect whether the next safest P3 boundary is moving low-risk output payload projection helpers into the shared run-event model.
- [x] Add focused red tests before production changes.
- [x] Keep EventSource lifecycle, polling timers, DOM/graph mutation, restore behavior, human-review opening, and live output display semantics stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 75.
- **Status:** completed

### Phase 76: Workspace Streaming Output Target Projection
- [x] Re-read the formal roadmap, Phase 75 findings, and current workspace streaming preview node-target resolution.
- [x] Inspect whether the next safest P3 boundary is moving output-key-to-preview-node projection into the shared run-event model.
- [x] Add focused red tests before production changes.
- [x] Keep EventSource lifecycle, polling timers, graph mutation, run output preview writes, fallback node behavior, and live display semantics stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 76.
- **Status:** completed

### Phase 77: Streaming Output Preview Patch Projection
- [x] Re-read the formal roadmap, Phase 76 findings, and current workspace streaming preview write logic.
- [x] Inspect whether the next safest P3 boundary is moving preview-by-node-id patch projection into the shared run-event model.
- [x] Add focused red tests before production changes.
- [x] Keep EventSource lifecycle, polling timers, graph mutation, preview ref assignment, fallback node behavior, and live display semantics stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 77.
- **Status:** completed

### Phase 78: Streaming Output Preview Request Projection
- [x] Re-read the formal roadmap, Phase 77 findings, and current workspace streaming preview payload-to-map orchestration.
- [x] Inspect whether the next safest P3 boundary is moving the full payload/document/current-preview projection request into the shared run-event model.
- [x] Add focused red tests before production changes.
- [x] Keep EventSource lifecycle, polling timers, graph mutation, preview ref assignment, fallback node behavior, and live display semantics stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 78.
- **Status:** completed

### Phase 79: Run Event Boundary Re-evaluation
- [x] Re-read the formal roadmap, Phase 78 findings, and remaining run event stream code in workspace/run detail.
- [x] Inspect whether another safe P3 run-event slice remains, or whether the next safer boundary should move to draft persistence.
- [x] Add focused red tests before production changes if a code slice is selected.
- [x] Keep EventSource lifecycle, polling timers, graph mutation, preview ref assignment, restore behavior, human-review opening, and live display semantics stable.
- [x] Run focused workspace/run tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 79.
- **Status:** completed

### Phase 80: Draft Persistence Boundary Re-orientation
- [x] Re-read the formal roadmap, Phase 79 findings, and remaining P3 shell orchestration code.
- [x] Inspect whether run-event lifecycle extraction should stop for now and whether the next safest P3 boundary is draft persistence.
- [x] Add focused red tests before production changes if a code slice is selected.
- [x] Keep route sync, tab registration, localStorage writes, graph mutation, restore behavior, human-review opening, and run-event stream behavior stable.
- [x] Run focused workspace/persistence tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 80 and re-judge total progress.
- **Status:** completed

### Phase 81: Document Draft Hydration Boundary
- [x] Re-read the formal roadmap, Phase 80 findings, and remaining draft persistence code paths.
- [x] Inspect whether unsaved/saved graph document draft hydration decisions can move out without changing actual storage reads or fetch behavior.
- [x] Add focused red tests before production changes if a code slice is selected.
- [x] Keep route sync, tab registration, localStorage reads/writes, graph fetches, save/open/close behavior, restore behavior, and run-event stream behavior stable.
- [x] Run focused workspace/persistence tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 81 and re-judge total progress.
- **Status:** completed

### Phase 82: Draft Persistence Controller Boundary
- [x] Re-read the formal roadmap, Phase 81 findings, and remaining draft persistence/watch code paths.
- [x] Inspect whether workspace persistence watcher decisions and tab-id pruning inputs can move out without changing actual storage writes or route behavior.
- [x] Add focused red tests before production changes if a code slice is selected.
- [x] Keep route sync, tab registration, localStorage reads/writes, graph fetches, save/open/close behavior, restore behavior, visual layout, and run-event stream behavior stable.
- [x] Run focused workspace/persistence tests, TypeScript checks, full frontend tests when needed, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 82 and re-judge total progress.
- **Status:** completed

### Phase 83: Tab Runtime Cleanup Boundary
- [x] Add focused red model and structure tests for tab-scoped runtime record cleanup.
- [x] Extract clone-and-delete runtime record cleanup into `editorTabRuntimeModel.ts`.
- [x] Keep tab close behavior, persisted draft removal, run polling cancellation, EventSource cancellation, route sync, graph data, and visual layout stable.
- [x] Run focused workspace runtime tests and include the slice in broader verification.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 83 and re-judge total progress.
- **Status:** completed

### Phase 84: Tab Runtime Write Helper Boundary
- [x] Add focused red model and structure tests for tab-scoped runtime record writes.
- [x] Extract immutable set-by-tab helper into `editorTabRuntimeModel.ts`.
- [x] Move feedback and run-output preview writes onto the helper without changing preview merge semantics or stream lifecycle.
- [x] Run focused workspace runtime tests and include the slice in broader verification.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 84 and re-judge total progress.
- **Status:** completed

### Phase 85: Run Visual State Write Boundary
- [x] Add focused red structure coverage for run visual state and polling tab-state writes.
- [x] Move run detail, node status, current node, failure messages, active edges, and restored snapshot writes onto the tab runtime helper.
- [x] Keep polling generation, EventSource lifecycle, human-review opening, terminal run persistence, and feedback formatting stable.
- [x] Run focused workspace runtime tests and include the slice in broader verification.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 85 and re-judge total progress.
- **Status:** completed

### Phase 86: Document Load State Write Boundary
- [x] Add focused red structure coverage for document registration and existing graph load tab-state writes.
- [x] Move document, loading, and error tab-state writes onto the tab runtime helper.
- [x] Keep actual localStorage reads/writes, graph fetches, `registerDocumentForTab`, loading/error timing, route sync, and visual layout stable.
- [x] Run focused workspace tests, related regression tests, TypeScript checks, full frontend tests, production build, dev restart, health checks, browser smoke, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 86 and re-judge total progress.
- **Status:** completed

### Phase 87: Node Creation Menu State Boundary
- [x] Re-read the formal roadmap, Phase 86 findings, and remaining P3 shell orchestration code.
- [x] Inspect graph mutation action helpers, node creation flow helpers, and human-review controller options.
- [x] Select the safest first slice: node creation menu open/close/query state projection.
- [x] Add focused red model and structure coverage before production changes.
- [x] Move menu state projection into `nodeCreationMenuModel.ts` while preserving automatic snapping, new-node naming/context, graph mutation payloads, route sync, drafts, run streams, visual layout, and actual create execution.
- [x] Run focused workspace/runtime tests and include the slice in broader verification.
- **Status:** completed

### Phase 88: Run Invocation Runtime Write Boundary
- [x] Add focused red structure coverage for run invocation and human-review resume tab-state writes.
- [x] Move run-start reset writes and human-review busy/error/detail writes onto `setTabScopedRecordEntry`.
- [x] Preserve `runGraph`, `resumeRun`, polling generation, EventSource lifecycle, feedback formatting, restored checkpoint usage, and human-review resume behavior.
- [x] Run focused workspace/runtime tests and include the slice in broader verification.
- **Status:** completed

### Phase 89: Created State Edge Editor Request Boundary
- [x] Add focused red model and structure coverage for created-state edge editor request projection.
- [x] Move source/target/request-id projection into `nodeCreationMenuModel.ts`.
- [x] Keep Date generation, ref assignment, actual state editor opening, node creation execution, node naming, and graph mutation ownership in `EditorWorkspaceShell.vue`.
- [x] Run focused workspace/node-creation tests and include the slice in broader verification.
- **Status:** completed

### Phase 90: Dirty Document Commit Boundary
- [x] Add focused red structure coverage for centralized dirty document commits.
- [x] Consolidate repeated `setDocumentForTab` plus dirty workspace metadata updates behind `commitDirtyDocumentForTab`.
- [x] Keep graph mutator calls, edit guards, document draft writes, workspace route behavior, save behavior, node position/size updates, and graph rename behavior stable.
- [x] Run focused workspace/runtime tests, related regression tests, TypeScript checks, full frontend tests, production build, dev restart, health checks, and browser smoke.
- **Status:** completed

### Phase 91: Next Workspace Shell Boundary Selection
- [x] Re-read the formal roadmap, Phase 90 findings, and remaining P3 shell orchestration code.
- [x] Choose the next safest boundary: tab-scoped document, side-panel, and node-focus state writes.
- [x] Add focused red structure coverage before production changes.
- [x] Replace remaining low-risk record spreads with `setTabScopedRecordEntry`.
- [x] Preserve automatic snapping, new-node naming/context, graph mutation payloads, route sync, draft persistence, run stream behavior, human-review resume behavior, and visual layout.
- [x] Run focused workspace/runtime tests, related tests, TypeScript checks, full frontend tests, production build, dev restart, health checks, and browser smoke.
- **Status:** completed

### Phase 92: Next Workspace Shell Boundary Selection
- [x] Re-read the formal roadmap, Phase 91 findings, and remaining P3 shell orchestration code.
- [x] Choose the next safest boundary: local helper consolidation for simple graph mutation commits.
- [x] Add focused red structure coverage before production changes.
- [x] Move repeated document lookup, no-op detection, dirty commit, and optional focus sequencing behind `commitDocumentMutationForTab`.
- [x] Preserve automatic snapping, new-node naming/context, graph mutation payloads, route sync, draft persistence, run stream behavior, human-review resume behavior, and visual layout.
- [x] Run focused workspace/runtime tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] Because total roadmap progress is below 100%, automatically open the next phase after Phase 92 and re-judge total progress.
- **Status:** completed

### Phase 93: Next Workspace Shell Boundary Selection
- [x] Re-read the formal roadmap, Phase 92 findings, and remaining P3 shell orchestration code.
- [x] Choose the next boundary: a higher-coverage graph mutation action composable.
- [x] Add focused red structure coverage before production changes.
- [x] Extract `useWorkspaceGraphMutationActions.ts` for state binding, port binding/reorder, node deletion, state deletion, flow/route connect/reconnect/remove, node config, condition config, output config, and state field updates.
- [x] Preserve automatic snapping, new-node naming/context, graph mutation payloads, route sync, draft persistence, run stream behavior, human-review resume behavior, and visual layout.
- [x] Run focused workspace/runtime tests, TypeScript checks, full frontend tests, production build, dev restart, browser smoke, commit, push, and progress re-evaluation.
- [x] Because total roadmap progress is below 100%, automatically open the next phase after Phase 93 and re-judge total progress.
- **Status:** completed

### Phase 94: Next Roadmap Boundary Selection
- [x] Re-read the formal roadmap, Phase 93 findings, and remaining high-line-count files.
- [x] Choose the next safest boundary: first P4 backend provider slice around shared HTTP/auth/logging/SSE request helpers.
- [x] Add focused red tests before production changes.
- [x] Preserve automatic snapping, new-node naming/context, graph mutation payloads, route sync, draft persistence, run stream behavior, human-review resume behavior, backend provider behavior, and visual layout.
- [x] Run focused tests, TypeScript/backend checks as appropriate, full verification when needed, dev restart, browser smoke for frontend changes, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 94 and re-judge total progress.
- **Status:** completed

### Phase 95: Next Backend Provider Boundary
- [x] Re-read the formal roadmap, Phase 94 findings, and remaining `model_provider_client.py` provider/discovery clusters.
- [x] Choose the next safest P4 boundary: model discovery and provider model-id parsing.
- [x] Add focused red tests before production changes.
- [x] Preserve backend provider behavior, stream delta merging, Codex token refresh, discovery fallbacks, thinking/reasoning metadata, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 95 and re-judge total progress.
- **Status:** completed

### Phase 96: Next Provider Transport Boundary
- [x] Re-read the formal roadmap, Phase 95 findings, and remaining provider transport clusters in `model_provider_client.py`.
- [x] Choose the next safest P4 boundary: OpenAI-compatible chat transport and shared response parsing helpers.
- [x] Add focused red tests before production changes.
- [x] Preserve backend provider behavior, stream delta merging, fallback retry behavior, Codex token refresh, thinking/reasoning metadata, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 96 and re-judge total progress.
- **Status:** completed

### Phase 97: Next Provider Transport Boundary
- [x] Re-read the formal roadmap, Phase 96 findings, and remaining provider transport clusters in `model_provider_client.py`.
- [x] Choose the next safest P4 boundary: Anthropic messages transport.
- [x] Add focused red tests before production changes.
- [x] Preserve backend provider behavior, stream delta merging, fallback retry behavior, Codex token refresh, thinking/reasoning metadata, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 97 and re-judge total progress.
- **Status:** completed

### Phase 98: Next Provider Transport Boundary
- [x] Re-read the formal roadmap, Phase 97 findings, and remaining provider transport clusters in `model_provider_client.py`.
- [x] Choose the next safest P4 boundary: Gemini generate-content transport.
- [x] Add focused red tests before production changes.
- [x] Preserve backend provider behavior, stream delta merging, fallback retry behavior, Codex token refresh, thinking/reasoning metadata, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 98 and re-judge total progress.
- **Status:** completed

### Phase 99: Next Provider Transport Boundary
- [x] Re-read the formal roadmap, Phase 98 findings, and remaining provider transport clusters in `model_provider_client.py`.
- [x] Choose the next safest P4 boundary: Codex responses adapter.
- [x] Add focused red tests before production changes.
- [x] Preserve backend provider behavior, stream delta merging, fallback retry behavior, Codex token refresh, thinking/reasoning metadata, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 99 and re-judge total progress.
- **Status:** completed

### Phase 100: Executor Pure Prompt/Condition/Parser Boundary
- [x] Re-read the formal roadmap, Phase 99 findings, remaining provider facade code, and first executor pure-helper candidates.
- [x] Choose the next safest P4 boundary: condition evaluation, agent prompt construction, and LLM JSON output parsing.
- [x] Add focused red tests before production changes.
- [x] Preserve backend provider behavior, stream delta merging, fallback retry behavior, Codex token refresh, thinking/reasoning metadata, executor private-helper compatibility, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 100 and re-judge total progress.
- **Status:** completed

### Phase 101: Executor Execution Graph Boundary
- [x] Re-read the formal roadmap, Phase 100 findings, and remaining `node_system_executor.py` execution/state helper clusters.
- [x] Choose the next safest P4 boundary: execution edge id construction, cycle detection, and active outgoing edge selection.
- [x] Add focused red tests before production changes.
- [x] Preserve backend execution order, conditional branch routing, cycle detection, output previews, provider behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 101 and re-judge total progress.
- **Status:** completed

### Phase 102: Executor State I/O Boundary
- [x] Re-read the formal roadmap, Phase 101 findings, and remaining `node_system_executor.py` state/output helper clusters.
- [x] Choose the next safest P4 boundary: state initialization, node input collection, and state write application.
- [x] Add focused red tests before production changes.
- [x] Preserve state value initialization, read/write records, state events, output previews, saved outputs, provider behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 102 and re-judge total progress.
- **Status:** completed

### Phase 103: Executor Output Artifact Boundary
- [x] Re-read the formal roadmap, Phase 102 findings, and remaining `node_system_executor.py` output/artifact helper clusters.
- [x] Choose the next safest P4 boundary: loop-limit output message formatting/wrapping and active output-node resolution.
- [x] Add focused red tests before production changes.
- [x] Preserve output preview filtering, saved output filtering, loop-limit messaging, active edge targeting, final result selection, provider behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 103 and re-judge total progress.
- **Status:** completed

### Phase 104: Executor Run Artifact Refresh Boundary
- [x] Re-read the formal roadmap, Phase 103 findings, and remaining `node_system_executor.py` run artifact helper clusters.
- [x] Choose the next safest P4 boundary: run artifact refresh, knowledge summary building, and snapshot append helpers.
- [x] Add focused red tests before production changes.
- [x] Preserve artifacts payload shape, state snapshot shape, active edge ids, output previews, saved outputs, knowledge summary, duration updates, provider behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 104 and re-judge total progress.
- **Status:** completed

### Phase 105: Executor Input Boundary Helpers
- [x] Re-read the formal roadmap, Phase 104 findings, and remaining `node_system_executor.py` output boundary/node handler clusters.
- [x] Choose the next safest P4 boundary: input boundary coercion and first-truthy output selection helper.
- [x] Add focused red tests before production changes.
- [x] Preserve output preview filtering, saved output filtering, output persistence calls, final result selection, input coercion, provider behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 105 and re-judge total progress.
- **Status:** completed

### Phase 106: Executor Output Boundary Collection
- [x] Re-read the formal roadmap, Phase 105 findings, and remaining `node_system_executor.py` output boundary/node handler clusters.
- [x] Choose the next safest P4 boundary: output node execution and output boundary collection.
- [x] Add focused red tests before production changes.
- [x] Preserve output preview filtering, saved output filtering, output persistence calls, final result selection, streaming delta events, provider behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 106 and re-judge total progress.
- **Status:** completed

### Phase 107: Executor Agent Streaming Boundary
- [x] Re-read the formal roadmap, Phase 106 findings, and remaining `node_system_executor.py` agent streaming/node-handler clusters.
- [x] Choose the next safest P4 boundary: agent streaming delta callbacks and completion event publishing.
- [x] Add focused red tests before production changes.
- [x] Preserve streaming delta records, completion events, output values, provider behavior, output boundary behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 107 and re-judge total progress.
- **Status:** completed

### Phase 108: Executor Reference and Skill Helpers
- [x] Re-read the formal roadmap, Phase 107 findings, and remaining `node_system_executor.py` reference/skill/node-handler clusters.
- [x] Choose the next safest P4 boundary from reference path resolution, skill invocation, callable signature inspection, condition source resolution, or node-handler extraction.
- [x] Add focused red tests before production changes.
- [x] Preserve reference path semantics, skill invocation calling conventions, condition source fallback behavior, provider behavior, output boundary behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 108 and re-judge total progress.
- **Status:** completed

### Phase 109: Executor Agent Runtime Config Boundary
- [x] Re-read the formal roadmap, Phase 108 findings, and remaining `node_system_executor.py` agent runtime/node-handler clusters.
- [x] Choose the next safest P4 boundary from agent runtime config resolution, agent response generation, or node-handler extraction.
- [x] Add focused red tests before production changes.
- [x] Preserve model/provider resolution semantics, thinking-level fallback behavior, provider behavior, output boundary behavior, frontend graph interactions, and visual layout.
- [x] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [x] If total roadmap progress is below 100%, automatically open the next phase after Phase 109 and re-judge total progress.
- **Status:** completed

### Phase 110: Executor Agent Response Generation Boundary
- [ ] Re-read the formal roadmap, Phase 109 findings, and remaining `node_system_executor.py` agent generation/node-handler clusters.
- [ ] Choose the next safest P4 boundary from agent response generation, node handler extraction, or run progress persistence.
- [ ] Add focused red tests before production changes.
- [ ] Preserve provider call routing, prompt construction, LLM JSON parsing, runtime metadata capture, provider behavior, output boundary behavior, frontend graph interactions, and visual layout.
- [ ] Run focused backend tests, full backend verification when needed, dev restart, commit, push, and progress re-evaluation.
- [ ] If total roadmap progress is below 100%, automatically open the next phase after Phase 110 and re-judge total progress.
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
| Overall roadmap cleanup after Phase 22 gate | About 46% complete; gate confirms automatic continuation into Phase 23. |
| P1 `NodeCard.vue` cleanup target for Phase 23 | About 69-70% if agent skill picker presentation moves into a child component without changing config mutation behavior. |
| Overall roadmap cleanup after Phase 23 | About 47% complete after moving agent skill picker presentation into `AgentSkillPicker.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 23 | About 70% complete after moving skill picker presentation and styles into a child component. |
| Current continuation gate after Phase 23 | Total roadmap progress is below 100%, so Phase 24 is automatically opened for the next P1 agent runtime-controls slice. |
| Overall roadmap cleanup after Phase 24 | About 48% complete after moving agent runtime-control presentation into `AgentRuntimeControls.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 24 | About 73% complete after moving runtime model/thinking/breakpoint controls and styles into a child component. |
| Current continuation gate after Phase 24 | Total roadmap progress is below 100%, so Phase 25 is automatically opened for the `AgentNodeBody.vue` wrapper slice. |
| Overall roadmap cleanup after Phase 25 | About 49% complete after moving the agent body presentation wrapper into `AgentNodeBody.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 25 | About 75% complete after moving agent body wiring and preserving parent-side graph mutations. |
| Current continuation gate after Phase 25 | Total roadmap progress is below 100%, so Phase 26 is automatically opened for the `InputNodeBody.vue` slice. |
| Overall roadmap cleanup after Phase 26 | About 50% complete after moving input body presentation into `InputNodeBody.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 26 | About 79% complete after removing the input body controls, upload/dropzone preview, and textarea styling from `NodeCard.vue`. |
| Current continuation gate after Phase 26 | Total roadmap progress is below 100%, so Phase 27 is automatically opened for the `OutputNodeBody.vue` slice. |
| Overall roadmap cleanup after Phase 27 | About 51% complete after moving output body presentation into `OutputNodeBody.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 27 | About 82% complete after removing output persistence, preview surface, and output preview styles from `NodeCard.vue`. |
| Current continuation gate after Phase 27 | Total roadmap progress is below 100%, so Phase 28 is automatically opened for the `ConditionNodeBody.vue` slice. |
| P1 `NodeCard.vue` cleanup target for Phase 28 | About 89-91% if condition body presentation and the top action/advanced popover presentation move into child components without changing mutation handlers. |
| Overall roadmap cleanup after Phase 28 | About 54% complete after moving condition body and top action/advanced popover presentation into child components. |
| P1 `NodeCard.vue` cleanup after Phase 28 | About 91% complete after reducing `NodeCard.vue` from 3,373 to 2,577 lines in this round. |
| Current continuation gate after Phase 28 | Total roadmap progress is below 100%, so Phase 29 is automatically opened for primary state-port and residual chrome cleanup. |
| Overall roadmap cleanup after Phase 29 | About 56% complete after moving primary state-port presentation and floating reorder preview out of `NodeCard.vue`. |
| P1 `NodeCard.vue` cleanup after Phase 29 | About 96% complete after reducing `NodeCard.vue` from 2,577 to 1,988 lines while leaving state drafts, lock guards, and graph emits in the parent. |
| Current continuation gate after Phase 29 | Total roadmap progress is below 100%, so Phase 30 is automatically opened to finish the P1 gate or select the next safest P2/P3 slice. |
| Overall roadmap cleanup after Phase 30 | About 57% complete after closing the low-risk NodeCard P1 gate and starting P2 with a node drag/resize pure move model. |
| P1 `NodeCard.vue` cleanup after Phase 30 | About 98% complete for low-risk presentation/composable extraction; remaining parent orchestration is intentionally deferred pending stronger controller coverage. |
| P2 `EditorCanvas.vue` cleanup after Phase 30 | About 43% complete after moving node drag/resize threshold and viewport-scale projection into `canvasNodeDragResizeModel.ts`. |
| Current continuation gate after Phase 30 | Total roadmap progress is below 100%, so Phase 31 is automatically opened for the next safe P2 Canvas slice. |
| Overall roadmap cleanup after Phase 31 | About 58% complete after moving node drag/resize refs, pointer-capture release, scheduled drag emits, and residual click suppression into `useCanvasNodeDragResize.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 31 | About 46% complete after pairing the node drag/resize pure model with a tested composable while leaving connection completion and graph emits stable. |
| Current continuation gate after Phase 31 | Total roadmap progress is below 100%, so Phase 32 is automatically opened for the next safe P2 Canvas boundary. |
| Overall roadmap cleanup after Phase 32 | About 59% complete after moving connection interaction refs, pending start/toggle, preview point updates, auto-snap target storage, and connection-hover node state into `useCanvasConnectionInteraction.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 32 | About 49% complete after extracting connection state lifecycle while preserving auto-snap selection, node creation payloads, and completion emits. |
| Current continuation gate after Phase 32 | Total roadmap progress is below 100%, so Phase 33 is automatically opened for the next safe P2 Canvas connection-completion boundary. |
| Overall roadmap cleanup after Phase 33 | About 60% complete after moving connection completion action projection into `canvasConnectionCompletionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 33 | About 51% complete after extracting the completion action mapping while preserving actual emits and auto-snap selection in `EditorCanvas.vue`. |
| Current continuation gate after Phase 33 | Total roadmap progress is below 100%, so Phase 34 is automatically opened for the next safe P2 Canvas auto-snap resolver boundary. |
| Overall roadmap cleanup after Phase 34 | About 61% complete after moving high-level auto-snap target resolution into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 34 | About 54% complete after extracting flow hotspot, reverse state input, state target, and node-body auto-snap selection while keeping DOM hit-testing in the component. |
| Current continuation gate after Phase 34 | Total roadmap progress is below 100%, so Phase 35 is automatically opened for the next safe P2 Canvas connection creation-menu coordination boundary. |
| Overall roadmap cleanup after Phase 35 | About 62% complete after moving connection creation-menu and completion cleanup policies into tested request models. |
| P2 `EditorCanvas.vue` cleanup after Phase 35 | About 56% complete after extracting creation-menu request and completion request coordination while keeping actual emits and DOM event handling in `EditorCanvas.vue`. |
| Current continuation gate after Phase 35 | Total roadmap progress is below 100%, so Phase 36 is automatically opened for the next safe P2 Canvas pointer-up decision boundary. |
| Overall roadmap cleanup after Phase 36 | About 63% complete after moving connection pointer-up routing into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 36 | About 58% complete after extracting locked cleanup, auto-snapped completion, and empty-canvas creation routing while preserving DOM pointer capture/release in the component. |
| Current continuation gate after Phase 36 | Total roadmap progress is below 100%, so Phase 37 is automatically opened for the next safe P2 Canvas active-connection node pointer-down boundary. |
| Overall roadmap cleanup after Phase 37 | About 64% complete after moving active-connection node pointer-down completion decisions into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 37 | About 60% complete after extracting node-body snap completion versus continue-node-pointer-down decisions while preserving DOM focus/preventDefault execution in the component. |
| Current continuation gate after Phase 37 | Total roadmap progress is below 100%, so Phase 38 is automatically opened for the next safe P2 Canvas active-connection pointer-move request boundary. |
| Overall roadmap cleanup after Phase 38 | About 65% complete after moving active-connection pointer-move preview requests into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 38 | About 62% complete after extracting hover-node plus preview target/fallback request projection while preserving DOM hit-testing, pointer conversion, and RAF scheduling in the component. |
| Current continuation gate after Phase 38 | Total roadmap progress is below 100%, so Phase 39 is automatically opened for the next safe P2 Canvas anchor pointer-down request boundary. |
| Overall roadmap cleanup after Phase 39 | About 66% complete after moving anchor pointer-down routing into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 39 | About 64% complete after extracting locked-edit, completion, ignored-anchor, and start/toggle decisions while preserving DOM focus, selection, and start/toggle execution in the component. |
| Current continuation gate after Phase 39 | Total roadmap progress is below 100%, so Phase 40 is automatically opened for the next safe P2 Canvas node-resize pointer-down boundary. |
| Overall roadmap cleanup after Phase 40 | About 67% complete after moving node-resize pointer-down routing into `canvasNodeDragResizeModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 40 | About 66% complete after extracting missing-node, locked-edit, active-connection, and start-resize decisions while preserving pointer capture and resize drag creation in the component. |
| Current continuation gate after Phase 40 | Total roadmap progress is below 100%, so Phase 41 is automatically opened for the next safe P2 Canvas node pointer-down drag setup boundary. |
| Overall roadmap cleanup after Phase 41 | About 68% complete after moving node pointer-down drag setup routing into `canvasNodeDragResizeModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 41 | About 68% complete after extracting missing-node, locked-edit, inline-editor focus preservation, and start-drag setup policy while preserving active-connection completion and drag execution in the component. |
| Current continuation gate after Phase 41 | Total roadmap progress is below 100%, so Phase 42 is automatically opened for the next safe P2 Canvas canvas pointer-down pan/pinch setup boundary. |
| Overall roadmap cleanup after Phase 42 | About 69% complete after moving canvas pointer-down pan/pinch setup routing into `canvasPinchZoomModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 42 | About 70% complete after extracting touch pinch versus pan setup policy while preserving pointer snapshot storage, pinch startup, viewport pan execution, and DOM side effects in the component. |
| Current continuation gate after Phase 42 | Total roadmap progress is below 100%, so Phase 43 is automatically opened for the next safe P2 Canvas wheel zoom request boundary. |
| Overall roadmap cleanup after Phase 43 | About 70% complete after moving wheel zoom request projection into `canvasViewportInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 43 | About 71% complete after extracting zero-delta ignore, scale delta, pointer-centered zoom request, and no-rect set-scale fallback while preserving actual viewport mutation in the component. |
| Current continuation gate after Phase 43 | Total roadmap progress is below 100%, so Phase 44 is automatically opened for the next safe P2 Canvas empty-canvas double-click creation boundary. |
| Overall roadmap cleanup after Phase 44 | About 71% complete after moving empty-canvas double-click creation routing into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 44 | About 72% complete after extracting locked-edit, ignored-target, and open-menu decisions while preserving DOM target inspection, canvas coordinate conversion, and actual emit execution in the component. |
| Current continuation gate after Phase 44 | Total roadmap progress is below 100%, so Phase 45 is automatically opened for the next safe P2 Canvas file-drop creation boundary. |
| Overall roadmap cleanup after Phase 45 | About 72% complete after moving file-drop creation routing into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 45 | About 73% complete after extracting locked-edit, ignored target, missing-file, and create-from-file payload decisions while preserving DOM target inspection, `dataTransfer` lookup, canvas coordinate conversion, and actual emit execution in the component. |
| Current continuation gate after Phase 45 | Total roadmap progress is below 100%, so Phase 46 is automatically opened for the next safe P2 Canvas drag-over drop-effect boundary. |
| Overall roadmap cleanup after Phase 46 | About 73% complete after moving drag-over drop-effect selection into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 46 | About 74% complete after extracting locked-edit and dragged-file copy/none drop-effect decisions while preserving the actual `dataTransfer.dropEffect` mutation in the component. |
| Current continuation gate after Phase 46 | Total roadmap progress is below 100%, so Phase 47 is automatically opened for the next safe P2 Canvas selected-edge keyboard delete boundary. |
| Overall roadmap cleanup after Phase 47 | About 74% complete after moving selected-edge keyboard delete routing into `flowEdgeDeleteModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 47 | About 75% complete after extracting editable-target, locked-edit, missing-edge, non-deletable-edge, and flow/route keyboard delete decisions while preserving actual `preventDefault`, emits, and state cleanup in the component. |
| Current continuation gate after Phase 47 | Total roadmap progress is below 100%, so Phase 48 is automatically opened for the next safe P2 Canvas edge visibility toolbar click boundary. |
| Overall roadmap cleanup after Phase 48 | About 75% complete after moving edge visibility toolbar click routing into `edgeVisibilityModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 48 | About 76% complete after extracting locked-edit, same-mode no-op, and mode-change cleanup policy while preserving actual toolbar event binding and cleanup side effects in the component. |
| Current continuation gate after Phase 48 | Total roadmap progress is below 100%, so Phase 49 is automatically opened for the next safe P2 Canvas lock-banner click boundary. |
| Overall roadmap cleanup after Phase 49 | About 76% complete after moving lock-banner click routing into `canvasRunPresentationModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 49 | About 77% complete after extracting missing-current-run-node versus open-human-review decisions while preserving actual lock-banner event binding and emits in the component. |
| Current continuation gate after Phase 49 | Total roadmap progress is below 100%, so Phase 50 is automatically opened for the next safe P2 Canvas locked-node pointer capture boundary. |
| Overall roadmap cleanup after Phase 50 | About 77% complete after moving locked-node pointer capture policy into `canvasLockedInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 50 | About 78% complete after extracting locked-node capture/no-op decisions while preserving DOM target classification and actual pointer side effects in the component. |
| Current continuation gate after Phase 50 | Total roadmap progress is below 100%, so Phase 51 is automatically opened for the next safe P2 Canvas locked-interaction guard boundary. |
| Overall roadmap cleanup after Phase 51 | About 78% complete after moving generic locked-interaction guard cleanup policy into `canvasLockedInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 51 | About 79% complete after extracting shared locked guard no-op/block decisions while preserving actual cleanup and emit execution in the component. |
| Current continuation gate after Phase 51 | Total roadmap progress is below 100%, so Phase 52 is automatically opened for the next safe P2 Canvas edge pointer-down boundary. |
| Overall roadmap cleanup after Phase 52 | About 79% complete after moving edge pointer-down routing into `canvasEdgePointerInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 52 | About 80% complete after extracting locked edge, flow/route confirm, data confirm, and selected-edge toggle policy while preserving actual side effects in the component. |
| Current continuation gate after Phase 52 | Total roadmap progress is below 100%, so Phase 53 is automatically opened for the next safe P2 Canvas pending creation-menu boundary. |
| Overall roadmap cleanup after Phase 53 | About 80% complete after moving pending-connection creation-menu action routing into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 53 | About 81% complete after extracting locked/no-connection/open-menu cleanup policy while preserving actual emit and cleanup execution in the component. |
| Current continuation gate after Phase 53 | Total roadmap progress is below 100%, so Phase 54 is automatically opened for the next safe P2 Canvas connection-completion boundary. |
| Overall roadmap cleanup after Phase 54 | About 81% complete after moving locked/no-connection connection-completion execution routing into `canvasConnectionCompletionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 54 | About 82% complete after extracting completion execution action selection while preserving actual emit dispatch and cleanup execution in the component. |
| Current continuation gate after Phase 54 | Total roadmap progress is below 100%, so Phase 55 is automatically opened for the next safe P2 Canvas viewport zoom-button boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 55 | About 83% if zoom button scale calculation moves into `canvasViewportInteractionModel.ts` without changing viewport mutation behavior. |
| Overall roadmap cleanup after Phase 55 | About 82% complete after moving zoom button scale/reset action projection into `canvasViewportInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 55 | About 83% complete after extracting zoom-out/zoom-in/reset decision logic while preserving actual viewport mutation in the component. |
| Current continuation gate after Phase 55 | Total roadmap progress is below 100%, so Phase 56 is automatically opened for the next safe P2 Canvas minimap center-view boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 56 | About 84% if minimap center-view empty-size ignore and viewport projection move into `minimapModel.ts` without changing minimap event behavior. |
| Overall roadmap cleanup after Phase 56 | About 83% complete after moving minimap center-view action projection into `minimapModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 56 | About 84% complete after extracting empty-size ignore and centered viewport projection while preserving actual viewport mutation and focus execution in the component. |
| Current continuation gate after Phase 56 | Total roadmap progress is below 100%, so Phase 57 is automatically opened for the next safe P2 Canvas focus-node viewport boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 57 | About 85% if focus-node missing-target ignore and viewport projection move into `focusNodeViewport.ts` without changing selection or DOM measurement behavior. |
| Overall roadmap cleanup after Phase 57 | About 84% complete after moving focus-node viewport action projection into `focusNodeViewport.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 57 | About 85% complete after extracting missing-target ignore and focused viewport projection while preserving actual node selection, DOM measurement, and viewport mutation in the component. |
| Current continuation gate after Phase 57 | Total roadmap progress is below 100%, so Phase 58 is automatically opened for the next safe P2 Canvas pinch-zoom update boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 58 | About 86% if pinch-zoom update cleanup/ignore/zoom request projection moves into `canvasPinchZoomModel.ts` without changing active pointer tracking or actual viewport mutation. |
| Overall roadmap cleanup after Phase 58 | About 85% complete after moving pinch-zoom update cleanup/ignore/zoom request projection into `canvasPinchZoomModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 58 | About 86% complete after extracting missing pinch/target cleanup, non-positive distance ignore, and zoom request calculation while preserving active pointer tracking and actual viewport mutation in the component. |
| Current continuation gate after Phase 58 | Total roadmap progress is below 100%, so Phase 59 is automatically opened for the next safe P2 Canvas pinch pointer-release boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 59 | About 87% if pinch pointer-release cleanup/end-pan routing moves into `canvasPinchZoomModel.ts` without changing pointer capture release, connection pointer-up, or node drag/resize behavior. |
| Overall roadmap cleanup after Phase 59 | About 86% complete after moving pinch pointer-release routing into `canvasPinchZoomModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 59 | About 87% complete after extracting released pinch-pointer cleanup/end-pan routing while preserving active pointer deletion, pointer capture release, connection pointer-up, node drag/resize release, and pan behavior in the component. |
| Current continuation gate after Phase 59 | Total roadmap progress is below 100%, so Phase 60 is automatically opened for the next safe P2 Canvas touch pointer-move boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 60 | About 88% if touch pointer-move tracked/update-pinch routing moves into `canvasPinchZoomModel.ts` without changing pointer cache mutation, scheduled pinch updates, connection pointer move, node drag/resize, or panning behavior. |
| Overall roadmap cleanup after Phase 60 | About 87% complete after moving touch pointer-move tracked/update-pinch routing into `canvasPinchZoomModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 60 | About 88% complete after extracting tracked touch pointer update, pinch preventDefault, and scheduled pinch update routing while preserving pointer cache mutation, connection pointer move, node drag/resize, and panning behavior in the component. |
| Current continuation gate after Phase 60 | Total roadmap progress is below 100%, so Phase 61 is automatically opened for the next safe P2 Canvas pan pointer-move boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 61 | About 89% if pan pointer-move schedule/no-op routing moves into `canvasViewportInteractionModel.ts` without changing actual `viewport.movePan`, connection pointer move, node drag/resize, or touch pinch behavior. |
| Overall roadmap cleanup after Phase 61 | About 88% complete after moving pan pointer-move schedule/no-op routing into `canvasViewportInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 61 | About 89% complete after extracting pan pointer-move schedule/no-op routing while preserving actual `viewport.movePan`, connection pointer move, node drag/resize, and touch pinch behavior in the component. |
| Current continuation gate after Phase 61 | Total roadmap progress is below 100%, so Phase 62 is automatically opened for the next safe P2 Canvas point projection boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 62 | About 90% if missing-canvas fallback and viewport-relative world point projection move into `canvasViewportInteractionModel.ts` without changing DOM rect lookup, pending connection fallback, or connection/drop/menu consumers. |
| Overall roadmap cleanup after Phase 62 | About 89% complete after moving canvas world-point projection into `canvasViewportInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 62 | About 90% complete after extracting missing-canvas fallback and viewport-relative world-coordinate projection while preserving DOM rect lookup and all connection/menu/drop consumers. |
| Current continuation gate after Phase 62 | Total roadmap progress is below 100%, so Phase 63 is automatically opened for the next safe P2 Canvas size update boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 63 | About 91% if canvas size changed/no-op decisions move into `canvasViewportInteractionModel.ts` without changing DOM size reads, resize observer lifecycle, minimap consumers, or viewport behavior. |
| Overall roadmap cleanup after Phase 63 | About 90% complete after moving canvas size update decisions into `canvasViewportInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 63 | About 91% complete after extracting missing-element, unchanged-size, and update-size routing while preserving DOM size reads, resize observer lifecycle, and minimap consumers. |
| Current continuation gate after Phase 63 | Total roadmap progress is below 100%, so Phase 64 is automatically opened for the next safe P2 Canvas edge target point boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 64 | About 92% if edge target point projection moves into `canvasEdgePointerInteractionModel.ts` without changing projected anchor refs, selected-edge state, or pending connection point mutation. |
| Overall roadmap cleanup after Phase 64 | About 91% complete after moving edge target point projection into `canvasEdgePointerInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 64 | About 92% complete after extracting selected-edge target point lookup while preserving projected anchor refs and actual pending connection point mutation. |
| Current continuation gate after Phase 64 | Total roadmap progress is below 100%, so Phase 65 is automatically opened for the next safe P2 Canvas flow hotspot visibility boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 65 | About 93% if flow/route hotspot visibility projection moves into `edgeVisibilityModel.ts` without changing selected/hovered refs, active-source checks, or anchor overlay rendering. |
| Overall roadmap cleanup after Phase 65 | About 92% complete after moving flow/route hotspot visibility projection into `edgeVisibilityModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 65 | About 93% complete after extracting selected/hovered/active-source hotspot decisions while preserving anchor overlay rendering. |
| Current continuation gate after Phase 65 | Total roadmap progress is below 100%, so Phase 66 is automatically opened for the next safe P2 Canvas projected-edge visibility boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 66 | About 94% if projected-edge visibility membership moves into `edgeVisibilityModel.ts` without changing visible edge id computation or SVG rendering. |
| Overall roadmap cleanup after Phase 66 | About 93% complete after moving projected-edge visibility membership into `edgeVisibilityModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 66 | About 94% complete after removing the local projected-edge visibility helper while preserving SVG edge rendering. |
| Current continuation gate after Phase 66 | Total roadmap progress is below 100%, so Phase 67 is automatically opened for the next safe P2 Canvas anchor connection class-state boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 67 | About 95% if active-source and eligible-target class-state checks move into `canvasInteractionStyleModel.ts` without changing connection styling or anchor overlay behavior. |
| Overall roadmap cleanup after Phase 67 | About 94% complete after moving active-source and eligible-target class-state checks into `canvasInteractionStyleModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 67 | About 95% complete after removing direct class-state membership checks from anchor and flow hotspot template bindings. |
| Current continuation gate after Phase 67 | Total roadmap progress is below 100%, so Phase 68 is automatically opened for the next safe P2 Canvas connection completion eligibility boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 68 | About 96% if `canCompleteCanvasConnection` eligibility routing moves into `canvasConnectionInteractionModel.ts` without changing auto-snap, node creation, or completion emits. |
| Overall roadmap cleanup after Phase 68 | About 95% complete after moving connection completion eligibility routing into `canvasConnectionInteractionModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 68 | About 96% complete after extracting state-target allowance plus graph-completion delegation while preserving auto-snap and completion emits. |
| Current continuation gate after Phase 68 | Total roadmap progress is below 100%, so Phase 69 is automatically opened for the next safe P2 Canvas projected-anchor grouping boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 69 | About 97% if projected anchor grouping moves into the anchor model without changing transient anchors, eligibility, or overlay rendering. |
| Overall roadmap cleanup after Phase 69 | About 96% complete after moving projected anchor grouping into `edgeProjection.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 69 | About 97% complete after extracting flow/route/point anchor grouping while preserving transient anchors, eligibility, and overlay rendering. |
| Current continuation gate after Phase 69 | Total roadmap progress is below 100%, so Phase 70 is automatically opened for the next safe P2 Canvas projected-edge layer grouping boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 70 | About 98% if flow/route/data projected-edge grouping moves into `edgeProjection.ts` without changing SVG layer ordering, edge hitareas, or selected-edge behavior. |
| Overall roadmap cleanup after Phase 70 | About 97% complete after moving projected edge layer grouping into `edgeProjection.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 70 | About 98% complete after extracting flow/route and data edge grouping while preserving SVG layer ordering and hitareas. |
| Current continuation gate after Phase 70 | Total roadmap progress is below 100%, so Phase 71 is automatically opened for the next safe P2 Canvas projected-edge class projection boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 71 | About 99% if projected edge class and hitarea class mapping moves into `canvasInteractionStyleModel.ts` without changing selected-edge, active-run, preview, or hitarea behavior. |
| Overall roadmap cleanup after Phase 71 | About 98% complete after moving projected edge class and hitarea class mapping into `canvasInteractionStyleModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 71 | About 99% complete after extracting preview, projected edge, selected, active-run, and hitarea class maps while preserving edge interaction behavior. |
| Current continuation gate after Phase 71 | Total roadmap progress is below 100%, so Phase 72 is automatically opened for the next safe P2 Canvas flow hotspot class projection boundary. |
| P2 `EditorCanvas.vue` cleanup target for Phase 72 | About 100% for the current low-risk P2 canvas projection pass if flow hotspot outbound/visibility/connect class projection moves into `canvasInteractionStyleModel.ts` without changing hotspot behavior. |
| Overall roadmap cleanup after Phase 72 | About 99% complete after moving flow hotspot and route handle class projection into `canvasInteractionStyleModel.ts`. |
| P2 `EditorCanvas.vue` cleanup after Phase 72 | About 100% complete for the current low-risk canvas projection pass after extracting flow hotspot and route handle class maps while preserving overlay pointer behavior. |
| Current continuation gate after Phase 72 | Total roadmap progress is still below 100%, so Phase 73 is automatically opened for the next P3 `EditorWorkspaceShell.vue` run-event boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 73 | About 10% of P3 if a small run event stream or polling projection boundary can move out without changing route sync, draft persistence, restore behavior, or graph mutation emits. |
| Overall roadmap cleanup after Phase 73 | About 99.2% complete after extracting shared run-event URL, payload parsing, and RunDetail live-output merge helpers. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 73 | About 10% complete after moving the first shared run event stream helper into `run-event-stream.ts` while preserving shell/run-detail side effects. |
| Current continuation gate after Phase 73 | Total roadmap progress is still below 100%, so Phase 74 is automatically opened for the next small shared run polling status boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 74 | About 15% of P3 if queued/running/resuming polling semantics become shared without changing polling timers, aborts, stream closure, or human-review behavior. |
| Overall roadmap cleanup after Phase 74 | About 99.3% complete after sharing queued/running/resuming run polling status semantics. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 74 | About 15% complete after moving shared run polling status semantics into `run-event-stream.ts` while preserving timer cadence and lifecycle behavior. |
| Current continuation gate after Phase 74 | Total roadmap progress is still below 100%, so Phase 75 is automatically opened for the next small run event output payload projection boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 75 | About 20% of P3 if low-risk run event output key, node id, and text projection helpers move into `run-event-stream.ts` without changing stream display or graph mutation behavior. |
| Overall roadmap cleanup after Phase 75 | About 99.4% complete after moving run event node id, text, and output-key projection helpers into `run-event-stream.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 75 | About 20% complete after extracting shared payload projection helpers while preserving live output preview behavior. |
| Current continuation gate after Phase 75 | Total roadmap progress is still below 100%, so Phase 76 is automatically opened for the next small workspace streaming output target projection boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 76 | About 25% of P3 if workspace output-key-to-preview-node resolution moves into a tested run-event helper without changing fallback node behavior or preview writes. |
| Overall roadmap cleanup after Phase 76 | About 99.5% complete after moving output-key-to-preview-node resolution into `run-event-stream.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 76 | About 25% complete after extracting shared preview target projection while preserving live preview writes. |
| Current continuation gate after Phase 76 | Total roadmap progress is still below 100%, so Phase 77 is automatically opened for the next small streaming output preview patch projection boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 77 | About 30% of P3 if preview-by-node-id patch projection moves into a tested run-event helper without changing ref assignment or displayed preview content. |
| Overall roadmap cleanup after Phase 77 | About 99.6% complete after moving streaming output preview patch construction into `run-event-stream.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 77 | About 30% complete after extracting shared preview map patching while preserving shell ref assignment. |
| Current continuation gate after Phase 77 | Total roadmap progress is still below 100%, so Phase 78 is automatically opened for the next small streaming output preview request projection boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 78 | About 35% of P3 if payload/document/current-preview-to-next-preview projection moves into a tested run-event helper without changing stream lifecycle or displayed preview content. |
| Overall roadmap cleanup after Phase 78 | About 99.7% complete after moving full streaming preview payload-to-map projection into `run-event-stream.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 78 | About 35% complete after extracting the complete preview update request while preserving shell ref assignment and stream lifecycle. |
| Current continuation gate after Phase 78 | Total roadmap progress is still below 100%, so Phase 79 is automatically opened to re-evaluate the remaining run-event boundary before choosing the next slice. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 79 | About 38-40% of P3 if another low-risk run-event slice remains; otherwise the next safe boundary should move to draft persistence rather than forcing EventSource lifecycle extraction. |
| Overall roadmap cleanup after Phase 79 | About 99.8% complete after moving the shared Event-to-payload parsing wrapper into `run-event-stream.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 79 | About 38% complete after removing the duplicated local `MessageEvent` payload wrappers from workspace and run detail without changing EventSource lifecycle. |
| Current continuation gate after Phase 79 | Total roadmap progress is still below 100%, so Phase 80 is automatically opened to re-orient around draft persistence instead of forcing a high-risk EventSource lifecycle extraction. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 80 | About 42% of P3 if the first draft persistence helper can move out without changing route sync, tab registration, localStorage writes, graph mutation, restore, or run stream behavior. |
| Overall roadmap cleanup after Phase 80 | About 99.85% complete after moving viewport draft hydration/update decisions into `editorDraftPersistenceModel.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 80 | About 42% complete after extracting missing viewport draft tab selection and immutable viewport draft updates while preserving actual storage reads/writes in the shell. |
| Current continuation gate after Phase 80 | Total roadmap progress is still below 100%, so Phase 81 is automatically opened for document draft hydration decisions. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 81 | About 46% of P3 if document draft hydration decisions move out without changing route sync, tab registration, localStorage reads/writes, graph fetches, restore behavior, or run stream behavior. |
| Overall roadmap cleanup after Phase 81 | About 99.9% complete after moving unsaved/saved document draft hydration decisions into `editorDraftPersistenceModel.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 81 | About 46% complete after extracting persisted-vs-seed and persisted-vs-cached-vs-fetch document hydration routing while preserving actual storage reads, fetches, and registration in the shell. |
| Current continuation gate after Phase 81 | Total roadmap progress is still below 100%, so Phase 82 is automatically opened for draft persistence watcher/controller decisions. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 82 | About 50% of P3 if workspace persistence watcher decisions and tab-id pruning inputs move out without changing actual storage writes, route sync, graph fetches, save/open/close behavior, restore behavior, visual layout, or run stream behavior. |
| Overall roadmap cleanup after Phase 82 | About 99.92% complete after moving workspace draft watcher hydration/pruning decisions into `editorDraftPersistenceModel.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 82 | About 50% complete after extracting workspace persistence requests while keeping actual localStorage writes and pruning side effects in the shell. |
| Current continuation gate after Phase 82 | Total roadmap progress is still below 100%, so Phase 83 is automatically opened for tab runtime record cleanup. |
| Overall roadmap cleanup after Phase 83 | About 99.94% complete after moving tab-scoped runtime clone/delete cleanup into `editorTabRuntimeModel.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 83 | About 54% complete after replacing repeated close-tab runtime cleanup blocks while preserving cancellation and close behavior. |
| Current continuation gate after Phase 83 | Total roadmap progress is still below 100%, so Phase 84 is automatically opened for tab runtime write helper extraction. |
| Overall roadmap cleanup after Phase 84 | About 99.95% complete after moving feedback and run-output preview tab writes onto a shared runtime helper. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 84 | About 56% complete after removing the first repeated tab-scoped write blocks from feedback and streaming preview code. |
| Current continuation gate after Phase 84 | Total roadmap progress is still below 100%, so Phase 85 is automatically opened for run visual state write cleanup. |
| Overall roadmap cleanup after Phase 85 | About 99.96% complete after consolidating run visual and polling tab-state writes. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 85 | About 58% complete after replacing repeated run detail/status/current-node/failure/edge writes while preserving polling and human-review behavior. |
| Current continuation gate after Phase 85 | Total roadmap progress is still below 100%, so Phase 86 is automatically opened for document load state write cleanup. |
| Overall roadmap cleanup after Phase 86 | About 99.97% complete after consolidating document registration and existing-graph loading tab-state writes. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 86 | About 60% complete after reducing repeated document/loading/error record writes while preserving storage reads, graph fetches, and visual state timing. |
| Current continuation gate after Phase 86 | Total roadmap progress is still below 100%, so Phase 87 is automatically opened to inspect graph mutation, node creation, and human-review shell boundaries before selecting the next safe slice. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 87 | About 64-68% of P3 if the next graph mutation or node creation helper boundary can move out without changing auto-snapping, node naming/context, graph mutation payloads, route sync, drafts, or run streams. |
| Overall roadmap cleanup after Phase 87 | About 99.98% complete after moving node creation menu state projection into `nodeCreationMenuModel.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 87 | About 64% complete after removing inline menu open/close/query projection while preserving actual node creation execution. |
| Overall roadmap cleanup after Phase 88 | About 99.985% complete after consolidating run invocation and human-review resume tab-state writes. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 88 | About 66% complete after replacing run-start and human-review resume record spreads with the runtime helper. |
| Legacy active frontend-batch estimate after Phase 89 | About 99.99% complete for the then-active frontend cleanup tail after moving created-state edge editor request projection into `nodeCreationMenuModel.ts`; this is not the full-roadmap percentage. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 89 | About 68% complete after removing node-creation request endpoint projection from the shell while keeping creation and graph mutation side effects in place. |
| Legacy active frontend-batch estimate after Phase 90 | About 99.992% complete for the then-active frontend cleanup tail after centralizing dirty graph document commits; this is not the full-roadmap percentage. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 90 | About 70% complete after consolidating repeated dirty document metadata writes while preserving graph mutation behavior. |
| Current continuation gate after Phase 90 | Total roadmap progress is still below 100%, so Phase 91 is automatically opened for the next safe P3 shell boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 91 | About 72% of P3 if the next boundary can move out without changing automatic snapping, node naming/context, graph mutation payloads, route sync, drafts, run streams, human-review resume behavior, or visual layout. |
| Full roadmap cleanup after Phase 91 | About 70-72% complete when P4 backend work is counted; backend provider/executor/runtime cleanup has not started. |
| Frontend roadmap cleanup after Phase 91 | About 80-82% complete across P1/P2/P3 after moving document, side-panel, and focus tab-state writes onto the runtime helper. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 91 | About 72% complete after removing more low-risk record spreads while preserving panel, focus, and document draft behavior. |
| Current continuation gate after Phase 91 | Total roadmap progress is still below 100%, so Phase 92 is automatically opened for the next safe P3 shell boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 92 | About 74% of P3 if the next graph mutation, save/open, or human-review controller slice can move out without changing behavior. |
| Full roadmap cleanup after Phase 92 | About 71-72% complete when the untouched P4 backend work is counted; this phase improves frontend shell maintainability but does not close backend provider/executor/runtime cleanup. |
| Frontend roadmap cleanup after Phase 92 | About 81-83% complete across P1/P2/P3 after consolidating simple graph mutation commit/no-op/focus policy in the workspace shell. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 92 | About 74% complete after removing repeated document lookup, no-op detection, dirty commit, and focus sequencing from simple graph mutation handlers. |
| Current continuation gate after Phase 92 | Total roadmap progress is still below 100%, so Phase 93 is automatically opened for the next safe P3 shell boundary. |
| P3 `EditorWorkspaceShell.vue` cleanup target for Phase 93 | About 76% of P3 if a narrow save/open routing, human-review controller routing, or higher-coverage graph mutation action helper can move out safely. |
| Full roadmap cleanup after Phase 93 | About 72-73% complete when P4 backend work is counted; the graph mutation composable is a large P3 frontend step but backend provider/executor/runtime cleanup remains unstarted. |
| Frontend roadmap cleanup after Phase 93 | About 83-85% complete across P1/P2/P3 after moving the workspace graph mutation action layer into `useWorkspaceGraphMutationActions.ts`. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 93 | About 82% complete after extracting the `useGraphMutationActions` roadmap slice while keeping save/open, node creation menu execution, human-review routing, and run lifecycle in the shell. |
| Current continuation gate after Phase 93 | Total roadmap progress is still below 100%, so Phase 94 is automatically opened for the next safe P3/P4 boundary. |
| P3/P4 cleanup target for Phase 94 | About 84% P3 if save/open, node-creation flow, or human-review routing can move out safely, or about 2-4% P4 if the first backend provider/runtime slice starts with behavior coverage. |
| Full roadmap cleanup after Phase 94 | About 74-75% complete after starting P4 by extracting shared model-provider HTTP/auth/logging/SSE request helpers. |
| Frontend roadmap cleanup after Phase 94 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 94 | Still about 82%; save/open, node creation execution, human-review routing, route sync, draft persistence, and run lifecycle remain shell-owned. |
| P4 backend cleanup after Phase 94 | About 6-8% complete. `model_provider_client.py` dropped from 1,380 to 1,152 lines, with request/log/auth/stream fallback helpers isolated in `model_provider_http.py`; provider transports and executor/runtime splits remain. |
| Current continuation gate after Phase 94 | Total roadmap progress is still below 100%, so Phase 95 is automatically opened for the next P4 provider-client boundary. |
| P4 cleanup target for Phase 95 | About 12-15% P4 if the next discovery or provider transport slice moves out with focused behavior tests. |
| Full roadmap cleanup after Phase 95 | About 75-76% complete after moving provider model discovery and model-id parsing into `model_provider_discovery.py`. |
| Frontend roadmap cleanup after Phase 95 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 95 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 95 | About 10-12% complete. `model_provider_client.py` is now 1,039 lines; HTTP/request and model discovery are isolated, while chat transports, executor, and LangGraph runtime remain. |
| Current continuation gate after Phase 95 | Total roadmap progress is still below 100%, so Phase 96 is automatically opened for the next provider transport boundary. |
| P4 cleanup target for Phase 96 | About 15-18% P4 if one chat transport adapter moves out with stream/fallback/thinking metadata tests. |
| Full roadmap cleanup after Phase 96 | About 76-77% complete after moving the OpenAI-compatible chat transport and shared response parsing helpers out of `model_provider_client.py`. |
| Frontend roadmap cleanup after Phase 96 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 96 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 96 | About 15-18% complete. `model_provider_client.py` is now 842 lines; HTTP/request, model discovery, OpenAI-compatible chat, and shared response parsing are isolated. |
| Current continuation gate after Phase 96 | Total roadmap progress is still below 100%, so Phase 97 is automatically opened for the next provider transport boundary. |
| P4 cleanup target for Phase 97 | About 20-23% P4 if Anthropic or Gemini transport moves out with stream/fallback/thinking metadata tests. |
| Full roadmap cleanup after Phase 97 | About 77-78% complete after moving the Anthropic messages transport out of `model_provider_client.py`. |
| Frontend roadmap cleanup after Phase 97 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 97 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 97 | About 20-23% complete. `model_provider_client.py` is now 705 lines; HTTP/request, discovery, OpenAI-compatible chat, Anthropic messages, and shared response parsing are isolated. |
| Current continuation gate after Phase 97 | Total roadmap progress is still below 100%, so Phase 98 is automatically opened for the next provider transport boundary. |
| P4 cleanup target for Phase 98 | About 25-28% P4 if Gemini transport moves out with stream/fallback/thinking metadata tests. |
| Full roadmap cleanup after Phase 98 | About 78-79% complete after moving the Gemini generate-content transport out of `model_provider_client.py`. |
| Frontend roadmap cleanup after Phase 98 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 98 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 98 | About 25-28% complete. `model_provider_client.py` is now 549 lines; HTTP/request, discovery, OpenAI-compatible, Anthropic, Gemini, and shared response parsing are isolated. |
| Current continuation gate after Phase 98 | Total roadmap progress is still below 100%, so Phase 99 is automatically opened for Codex/facade cleanup. |
| P4 cleanup target for Phase 99 | About 30-34% P4 if Codex responses transport moves out with token-refresh and stream tests. |
| Full roadmap cleanup after Phase 99 | About 80-81% complete after moving the Codex responses transport out of `model_provider_client.py`. |
| Frontend roadmap cleanup after Phase 99 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 99 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 99 | About 32-36% complete. `model_provider_client.py` is now 333 lines and mostly a provider facade; executor and LangGraph runtime are still untouched. |
| Current continuation gate after Phase 99 | Total roadmap progress is still below 100%, so Phase 100 is automatically opened for provider facade cleanup or the next backend area. |
| P4 cleanup target for Phase 100 | About 36-40% P4 if provider facade cleanup closes the `model_provider_client.py` split without behavior changes. |
| Full roadmap cleanup after Phase 100 | About 82-83% complete after extracting the first executor pure-helper group. |
| Frontend roadmap cleanup after Phase 100 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 100 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 100 | About 40-44% complete. `node_system_executor.py` is now 969 lines, with condition evaluation, agent prompt construction, and LLM output parsing isolated into focused modules while execution side effects remain in the executor. |
| Current continuation gate after Phase 100 | Total roadmap progress is still below 100%, so Phase 101 is automatically opened for the next executor execution/state boundary. |
| P4 cleanup target for Phase 101 | About 44-48% P4 if execution edge/cycle helpers or state I/O helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 101 | About 83-84% complete after extracting executor execution-graph helpers. |
| Frontend roadmap cleanup after Phase 101 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 101 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 101 | About 44-48% complete. `node_system_executor.py` is now 882 lines, with execution edge construction, edge id formatting, cycle detection, and active outgoing edge selection isolated in `execution_graph.py`. |
| Current continuation gate after Phase 101 | Total roadmap progress is still below 100%, so Phase 102 is automatically opened for the next executor state I/O or output helper boundary. |
| P4 cleanup target for Phase 102 | About 48-52% P4 if state initialization/input collection/write application or output artifact helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 102 | About 84-85% complete after extracting executor state I/O helpers. |
| Frontend roadmap cleanup after Phase 102 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 102 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 102 | About 48-52% complete. `node_system_executor.py` is now 811 lines, with state initialization, node input collection, and state write application isolated in `state_io.py`; LangGraph runtime and exported Python source now depend on that module directly. |
| Current continuation gate after Phase 102 | Total roadmap progress is still below 100%, so Phase 103 is automatically opened for the next executor output/artifact boundary. |
| P4 cleanup target for Phase 103 | About 52-56% P4 if output boundary collection or run artifact refresh helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 103 | About 85-86% complete after extracting executor output artifact helpers. |
| Frontend roadmap cleanup after Phase 103 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 103 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 103 | About 52-56% complete. `node_system_executor.py` is now 755 lines, with loop-limit output wrapping and active output-node resolution isolated in `output_artifacts.py`; output boundary execution still remains in the executor. |
| Current continuation gate after Phase 103 | Total roadmap progress is still below 100%, so Phase 104 is automatically opened for run artifact refresh or output boundary collection cleanup. |
| P4 cleanup target for Phase 104 | About 56-60% P4 if run artifact refresh, knowledge summary, or output boundary collection helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 104 | About 86-87% complete after extracting run artifact refresh and snapshot helpers. |
| Frontend roadmap cleanup after Phase 104 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 104 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 104 | About 56-60% complete. `node_system_executor.py` is now 653 lines, with run artifact refresh, knowledge summary, and run snapshot append helpers isolated in `run_artifacts.py`; LangGraph runtime now depends on that module directly. |
| Current continuation gate after Phase 104 | Total roadmap progress is still below 100%, so Phase 105 is automatically opened for output boundary or node-handler cleanup. |
| P4 cleanup target for Phase 105 | About 60-64% P4 if output boundary collection, output-node execution, or input boundary coercion helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 105 | About 87% complete after extracting input boundary coercion helpers. |
| Frontend roadmap cleanup after Phase 105 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 105 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 105 | About 58-61% complete. `node_system_executor.py` is now 633 lines, with input boundary JSON coercion and first-truthy selection isolated in `input_boundary.py`. |
| Current continuation gate after Phase 105 | Total roadmap progress is still below 100%, so Phase 106 is automatically opened for output boundary collection or node-handler cleanup. |
| P4 cleanup target for Phase 106 | About 62-66% P4 if output boundary collection, output-node execution, or streaming delta helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 106 | About 88% complete after extracting output node execution and output boundary collection. |
| Frontend roadmap cleanup after Phase 106 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 106 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 106 | About 62-66% complete. `node_system_executor.py` is now 547 lines, with output node execution and output boundary collection isolated in `output_boundaries.py`; LangGraph runtime now depends on that module directly. |
| Current continuation gate after Phase 106 | Total roadmap progress is still below 100%, so Phase 107 is automatically opened for agent streaming or node-handler cleanup. |
| P4 cleanup target for Phase 107 | About 66-70% P4 if agent streaming delta callbacks or reference/skill helper boundaries move out with focused runtime tests. |
| Full roadmap cleanup after Phase 107 | About 89% complete after extracting agent streaming delta helpers. |
| Frontend roadmap cleanup after Phase 107 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 107 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 107 | About 66-70% complete. `node_system_executor.py` is now 486 lines, with streaming delta callback construction and completion event publishing isolated in `agent_streaming.py`. |
| Current continuation gate after Phase 107 | Total roadmap progress is still below 100%, so Phase 108 is automatically opened for reference/skill helper or node-handler cleanup. |
| P4 cleanup target for Phase 108 | About 70-73% P4 if reference path resolution, skill invocation, or condition source helpers move out with focused runtime tests. |
| Full roadmap cleanup after Phase 108 | About 90% complete after extracting executor reference resolution and skill invocation helpers. |
| Frontend roadmap cleanup after Phase 108 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 108 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 108 | About 70-73% complete. `node_system_executor.py` is now 417 lines, with reference path resolution, condition source fallback, callable signature inspection, and skill invocation isolated in focused runtime modules. |
| Current continuation gate after Phase 108 | Total roadmap progress is still below 100%, so Phase 109 is automatically opened for agent runtime config or node-handler cleanup. |
| P4 cleanup target for Phase 109 | About 73-76% P4 if agent runtime config resolution or agent response generation moves out with focused runtime tests. |
| Full roadmap cleanup after Phase 109 | About 91% complete after extracting executor agent runtime config resolution. |
| Frontend roadmap cleanup after Phase 109 | Still about 83-85%; this phase was backend-only and did not touch graph editing UI. |
| P3 `EditorWorkspaceShell.vue` cleanup after Phase 109 | Still about 82%; no workspace shell changes in this phase. |
| P4 backend cleanup after Phase 109 | About 73-76% complete. `node_system_executor.py` is now 388 lines, with model/provider selection, thinking-level resolution, temperature bounds, and local progress request flags isolated in `agent_runtime_config.py`. |
| Current continuation gate after Phase 109 | Total roadmap progress is still below 100%, so Phase 110 is automatically opened for agent response generation or node-handler cleanup. |
| P4 cleanup target for Phase 110 | About 76-79% P4 if agent response generation moves out with focused runtime tests and executor keeps only orchestration wrappers. |

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
- Phase 23 starts the roadmap node-body component step with `AgentSkillPicker.vue`; `NodeCard.vue` drops to 4,231 lines before final verification while keeping skill config mutation behavior in the parent.
- Phase 24 continues the roadmap node-body component step with `AgentRuntimeControls.vue`; `NodeCard.vue` drops to 3,954 lines before final verification while keeping model derivation, refresh-model emit, lock guards, and agent config mutation behavior in the parent.
- Phase 25 wraps the agent node body presentation in `AgentNodeBody.vue`; `NodeCard.vue` drops to 3,895 lines before final verification while keeping state derivation, draft mutation, lock guards, skill patch creation, and graph emits in the parent.
- Phase 26 moves the input node body presentation into `InputNodeBody.vue`; `NodeCard.vue` drops to 3,562 lines while keeping input value derivation, uploaded asset parsing, knowledge-base options, lock guards, file/drop handlers, and state/config emits in the parent.
- Phase 27 moves the output node body presentation into `OutputNodeBody.vue`; `NodeCard.vue` drops to 3,373 lines while keeping output preview derivation, output config handlers, lock guards, and state/config emits in the parent.
- Phase 28 moves condition body presentation into `ConditionNodeBody.vue` and the top action/advanced popover presentation into `NodeCardTopActions.vue`; `NodeCard.vue` drops to 2,577 lines while keeping condition drafts, action confirmations, config handlers, lock guards, and graph/state emits in the parent.
- Phase 29 moves primary input/output state-port presentation into `PrimaryStatePort.vue` and the port-reorder floating preview into `FloatingStatePortPill.vue`; `NodeCard.vue` drops to 1,988 lines while keeping state drafts, port validation, lock guards, and graph/state emits in the parent.
- Phase 30 closes the low-risk `NodeCard.vue` P1 gate and starts P2 by moving node drag/resize move projection into `canvasNodeDragResizeModel.ts`; `EditorCanvas.vue` drops to 3,332 lines while keeping pointer capture, animation-frame batching, connection completion, and emits in the component.
- Phase 31 continues P2 by moving node drag/resize refs, pointer-capture release, drag/resize scheduling, and residual click suppression into `useCanvasNodeDragResize.ts`; `EditorCanvas.vue` drops to 3,267 lines while keeping selection, active connection cleanup, panning, DOM measurement, and graph mutation emits in the component.
- Phase 32 moves connection interaction refs, pending connection start/toggle, preview point updates, auto-snap target storage, and active connection hover node state into `useCanvasConnectionInteraction.ts`; `EditorCanvas.vue` drops to 3,238 lines while keeping auto-snap selection, connection completion emits, node creation payloads, panning, node drag/resize, and DOM measurement in the component.
- Phase 33 moves completion action projection for `connect-flow`, `connect-route`, `connect-state`, `connect-state-input-source`, `reconnect-flow`, and `reconnect-route` into `canvasConnectionCompletionModel.ts`; `EditorCanvas.vue` drops to 3,224 lines while keeping actual `emit` dispatch, active connection refs, auto-snap selection, node creation payloads, panning, node drag/resize, and DOM measurement in the component.
- Phase 34 moves high-level auto-snap target resolution into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` drops to 3,114 lines while keeping DOM node hit-testing, pointer-to-canvas coordinate conversion, actual completion emits, node creation payload emits, panning, node drag/resize, and DOM measurement in the component.
- Phase 35 moves pending connection creation-menu request projection into `canvasConnectionInteractionModel.ts` and completion request projection into `canvasConnectionCompletionModel.ts`; `EditorCanvas.vue` is 3,126 lines because the explicit request cleanup flags are more verbose than the prior inline calls, but the component now keeps only actual emits, DOM pointer inputs, and imperative cleanup execution.
- Phase 36 moves active connection pointer-up routing into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` is 3,134 lines and keeps pointer capture/release, actual `completePendingConnection`/`openCreationMenuFromPendingConnection` calls, node drag/resize finishing, and panning teardown in the component.
- Phase 37 moves active-connection node pointer-down routing into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` is 3,144 lines and keeps DOM `preventDefault`, focus, pointer capture, drag setup, and actual completion execution in the component.
- Phase 38 moves active-connection pointer-move preview requests into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` stays at 3,144 lines and keeps DOM hit-testing, pointer-to-canvas conversion, auto-snap resolution inputs, RAF scheduling, and graph mutation emits in the component.
- Phase 39 moves anchor pointer-down routing into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` is 3,165 lines because explicit setup policy wiring is more verbose, and it still keeps DOM focus, selection, transient cleanup, text-selection clearing, start/toggle execution, and completion emits in the component.
- Phase 40 moves node-resize pointer-down routing into `canvasNodeDragResizeModel.ts`; `EditorCanvas.vue` is 3,198 lines because setup policy wiring is explicit, and it still keeps DOM focus, pointer capture, selected-edge cleanup, selection, rendered-size lookup, and resize drag creation in the component.
- Phase 41 moves node pointer-down drag setup routing into `canvasNodeDragResizeModel.ts`; `EditorCanvas.vue` is 3,233 lines because active-connection completion remains explicitly interleaved, and it still keeps DOM focus, pointer capture, selected-edge cleanup, pending connection cleanup, selection, and `startNodeDrag` execution in the component.
- Phase 42 moves canvas pointer-down pan/pinch setup routing into `canvasPinchZoomModel.ts`; `EditorCanvas.vue` is 3,255 lines because setup policy wiring is explicit, and it still keeps pointer snapshot storage, pinch startup, DOM focus/preventDefault, pointer capture, transient cleanup, selection clearing, and viewport pan execution in the component.
- Phase 43 moves wheel zoom request projection into `canvasViewportInteractionModel.ts`; `EditorCanvas.vue` is 3,252 lines and keeps canvas DOM rect lookup, actual `viewport.setViewport` / `viewport.zoomAt` execution, wheel event binding, and viewport draft emits in the component.
- Phase 44 moves empty-canvas double-click creation routing into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` is 3,259 lines because the decision switch is explicit, and it still keeps DOM target inspection, canvas coordinate conversion, and the actual `open-node-creation-menu` emit in the component.
- Phase 50 moves locked-node pointer capture decisions into `canvasLockedInteractionModel.ts`; `EditorCanvas.vue` keeps DOM target classification, actual event prevention/propagation, focus, transient cleanup, selected-edge cleanup, pending connection cleanup, node selection, and emits in the component.
- Phase 51 moves generic locked-interaction guard decisions into `canvasLockedInteractionModel.ts`; `EditorCanvas.vue` keeps actual cleanup calls, selected-edge mutation, and locked-attempt emit execution in the component.
- Phase 52 moves edge pointer-down routing into `canvasEdgePointerInteractionModel.ts`; `EditorCanvas.vue` keeps actual focus, cleanup, confirm composable calls, selected-edge mutation, pending connection point mutation, selection clearing, and locked-attempt emit execution.
- Phase 53 moves pending-connection creation-menu routing into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` keeps canvas point/event inputs, actual `open-node-creation-menu` emit, connection cleanup, and selected-edge cleanup execution.
- Phase 54 moves connection-completion execution routing into `canvasConnectionCompletionModel.ts`; `EditorCanvas.vue` keeps actual typed emit dispatch, connection cleanup, selected-edge cleanup, and graph mutation behavior.
- Phase 55 moves zoom button scale/reset action projection into `canvasViewportInteractionModel.ts`; `EditorCanvas.vue` keeps actual center zoom execution, viewport reset mutation, wheel zoom execution, and viewport draft emits.
- Phase 56 moves minimap center-view action projection into `minimapModel.ts`; `EditorCanvas.vue` keeps canvas size refresh, actual viewport mutation, canvas focus execution, and minimap event binding.
- Phase 57 moves focus-node viewport action projection into `focusNodeViewport.ts`; `EditorCanvas.vue` keeps node lookup, DOM rect/element measurement, actual node selection, and viewport mutation.
- Phase 58 moves pinch-zoom update action projection into `canvasPinchZoomModel.ts`; `EditorCanvas.vue` keeps active pointer cache updates, DOM canvas rect lookup, actual pinch cleanup, and viewport `zoomAt` execution.
- Phase 59 moves pinch pointer-release action projection into `canvasPinchZoomModel.ts`; `EditorCanvas.vue` keeps active pointer deletion, actual pinch cleanup/end-pan execution, pointer capture release, connection pointer-up, and node drag/resize release.
- Phase 60 moves touch pointer-move action projection into `canvasPinchZoomModel.ts`; `EditorCanvas.vue` keeps active pointer cache mutation, event `preventDefault`, scheduled `updatePinchZoom`, connection pointer move, node drag/resize, and panning execution.
- Phase 61 moves pan pointer-move schedule/no-op routing into `canvasViewportInteractionModel.ts`; `EditorCanvas.vue` keeps actual `scheduleDragFrame` and `viewport.movePan(event)` execution.
- Phase 62 moves canvas world-point projection into `canvasViewportInteractionModel.ts`; `EditorCanvas.vue` keeps DOM rect lookup, pending connection fallback input, and connection/menu/drop consumer wiring.
- Phase 63 moves canvas size update action projection into `canvasViewportInteractionModel.ts`; `EditorCanvas.vue` keeps DOM client size reads, `ResizeObserver` lifecycle, and actual `canvasSize` ref mutation.
- Phase 64 moves selected-edge target point projection into `canvasEdgePointerInteractionModel.ts`; `EditorCanvas.vue` keeps projected anchor ref access and actual pending connection point mutation.
- Phase 65 moves flow/route hotspot visibility projection into `edgeVisibilityModel.ts`; `EditorCanvas.vue` keeps selected/hovered refs, active connection source ref, eligible target ids, and anchor overlay rendering.
- Phase 66 moves projected-edge visibility membership into `edgeVisibilityModel.ts`; `EditorCanvas.vue` keeps visible edge id computation, projected edge rendering, selected edge state, and hitarea handlers.
- Phase 67 moves active-source and eligible-target anchor class-state checks into `canvasInteractionStyleModel.ts`; `EditorCanvas.vue` keeps the style context, pointer handlers, and anchor overlay rendering.
- Phase 68 moves connection completion eligibility routing into `canvasConnectionInteractionModel.ts`; `EditorCanvas.vue` keeps active connection refs, graph document input, auto-snap callers, and completion emits.
- Phase 69 moves projected anchor grouping into `edgeProjection.ts`; `EditorCanvas.vue` keeps transient anchor construction, connection eligibility, overlay rendering, and pointer handlers.
- Phase 70 moves projected edge layer grouping into `edgeProjection.ts`; `EditorCanvas.vue` keeps SVG layer ordering, selected-edge state, edge hitarea handlers, and edge class bindings.
- Phase 71 moves projected edge class and hitarea class projection into `canvasInteractionStyleModel.ts`; `EditorCanvas.vue` keeps selected-edge state input, active-run lookup, SVG rendering, and pointer handlers.
- Phase 72 moves flow hotspot and route handle class projection into `canvasInteractionStyleModel.ts`; `EditorCanvas.vue` keeps hotspot visibility inputs, route tone resolution, anchor overlay rendering, and pointer handlers.
- Phase 73 starts P3 by moving shared run event stream URL construction, payload JSON parsing, and RunDetail live output merge semantics into `run-event-stream.ts`; `EditorWorkspaceShell.vue` and `RunDetailPage.vue` keep EventSource lifecycle, polling timers, restore behavior, and UI state updates.
- Phase 74 moves shared queued/running/resuming run polling status semantics into `run-event-stream.ts`; workspace and run detail keep polling timer cadence, abort behavior, EventSource closure, human-review opening, and terminal run persistence.
- Phase 75 moves shared run event node id, text, and output-key projection helpers into `run-event-stream.ts`; workspace and run detail keep EventSource lifecycle, live preview state writes, graph mutation, polling timers, restore behavior, and human-review opening.
- Phase 76 moves workspace output-key-to-preview-node resolution into `run-event-stream.ts`; `EditorWorkspaceShell.vue` keeps EventSource lifecycle, preview ref assignment, graph mutation, polling timers, fallback-node input, and live display state.
- Phase 77 moves streaming output preview-by-node-id patch construction into `run-event-stream.ts`; `EditorWorkspaceShell.vue` keeps EventSource lifecycle, run output preview ref assignment, graph mutation, polling timers, fallback-node input, and live display state.
- Phase 78 moves full streaming preview payload/document/current-preview projection into `run-event-stream.ts`; `EditorWorkspaceShell.vue` keeps EventSource lifecycle, run output preview ref assignment, graph mutation, polling timers, restore behavior, human-review opening, and live display state.
- Phase 79 moves the shared Event-to-payload wrapper into `run-event-stream.ts`; `EditorWorkspaceShell.vue` and `RunDetailPage.vue` keep EventSource lifecycle, listener registration, polling timers, restore/human-review behavior, and UI state writes.
- Phase 80 moves viewport draft tab selection and immutable viewport draft updates into `editorDraftPersistenceModel.ts`; `EditorWorkspaceShell.vue` keeps actual `readPersistedEditorViewportDraft` / `writePersistedEditorViewportDraft` calls and ref assignment.
- Phase 81 moves unsaved document persisted-vs-seed routing and existing graph persisted-vs-cached-vs-fetch routing into `editorDraftPersistenceModel.ts`; `EditorWorkspaceShell.vue` keeps actual localStorage reads, graph fetches, `registerDocumentForTab`, route sync, and UI loading/error state writes.
- Phase 82 moves workspace persistence watcher hydration/pruning requests into `editorDraftPersistenceModel.ts`; `EditorWorkspaceShell.vue` keeps actual `writePersistedEditorWorkspace`, document draft pruning, viewport draft pruning, and hydration calls.
- Phase 83 adds `editorTabRuntimeModel.ts` for tab-scoped clone/delete cleanup; `EditorWorkspaceShell.vue` keeps close-tab transition, persisted draft removal, run polling cancellation, and EventSource cancellation.
- Phase 84 expands `editorTabRuntimeModel.ts` with immutable tab-scoped set writes and moves feedback plus run-output preview writes onto it; preview merge semantics and stream lifecycle stay in the shell.
- Phase 85 moves run visual state and polling status tab-record writes onto the runtime helper while preserving polling generation checks, human-review opening, feedback formatting, and run artifact projection.
- Phase 86 moves document registration and existing graph load `documents/loading/error` tab-record writes onto the runtime helper while preserving actual storage reads/writes, fetch behavior, loading/error timing, route sync, and visual layout.
- Phase 87 should evaluate graph mutation action helpers, node creation flow helpers, or a narrow human-review controller slice; avoid any broad move that could disturb automatic snapping, new-node naming/context, route sync, draft persistence, or run streams.
- Do not commit runtime artifacts such as `backend/data/settings`, `.dev_*`, `dist`, or `.worktrees`.
- After code changes, restart using `npm run dev`.

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Structure test still expected the old inline forced-edge-id block | Focused post-implementation run | Updated the assertion to verify the extracted `buildForceVisibleProjectedEdgeIds` boundary and flow confirm id input. |
| Virtual any output drags no longer auto-snapped to new agent inputs after cleanup | Baseline comparison against `8017081` | Restored virtual output pending-source preservation in `buildPendingAgentInputSourceByNodeId`, added regression coverage, and extracted follow-up interaction helpers into `canvasConnectionInteractionModel.ts`. |
| `vue-tsc` flagged unused NodeCard destructures and mock DOM type gaps after `usePortReorder` extraction | Phase 19 TypeScript verification | Stopped destructuring global pointer handlers/pointer state in `NodeCard.vue`, made test source elements satisfy `EventTarget`, and narrowed query results inside `usePortReorder.ts`. |
| Agent prompt textarea lost parent scoped surface styling after moving into `AgentNodeBody.vue` | Phase 25 visual screenshot | Moved the required surface/textarea styles into `AgentNodeBody.vue` and added structure coverage for the local scoped style. |
| Root `npx vue-tsc --noEmit --noUnusedLocals --noUnusedParameters` printed TypeScript help instead of checking the project | Phase 26 TypeScript verification | Re-ran the unused-symbol check through `frontend/node_modules/.bin/vue-tsc` from the `frontend` directory, which completed with exit 0 and no diagnostics. |
| `ConditionNodeBody.vue` and `NodeCardTopActions.vue` were missing during the Phase 28 red test | First focused structure run before implementation | Added both child components and reran focused structure/model tests successfully. |
| Unescaped backticks in `rg` shell commands triggered `/bin/bash: line 1: NodeCard.vue: command not found` | Phase 28 source inspection and plan sanity-check commands | Re-ran inspection with safer quoting; no code was changed by the failed shell interpolation. |
| Fresh screenshot tooling probe found no `chromium`, `playwright`, or `puppeteer` available from the current shell | Final visual-check refresh after dev restart | Kept the Phase 28 screenshots already captured earlier in this round and used fresh HTTP health checks for final dev verification. |
| `vue-tsc` flagged an unused `nodeDrag` destructure after the Phase 31 composable extraction | Phase 31 TypeScript verification | Stopped destructuring `nodeDrag` in `EditorCanvas.vue` and updated the structure test to assert that the drag ref stays owned by the composable. |
| Vue `emit` overloads rejected a union event name from `CanvasConnectionCompletionAction` | Phase 33 TypeScript verification | Kept action projection pure, but emitted through an explicit `switch` in `EditorCanvas.vue` so each overload stays type-safe. |
| Unescaped backticks in an `rg` shell command triggered `/bin/bash: line 1: emit: command not found` | Phase 33 planning verification | Re-ran the search with single-quoted shell text; no files were changed by the failed read-only command. |
| Unescaped backticks in an `rg` shell command triggered `/bin/bash: line 1: EditorCanvas.vue: command not found` | Phase 44 progress/status inspection | The command was read-only, produced enough usable output, and no files were changed by the failed shell interpolation. |
| Structure tests still expected local `EditorCanvas.vue` auto-snap helper names after the resolver extraction | Phase 34 focused green run | Updated the assertions to lock the new `canvasConnectionInteractionModel.ts` resolver boundary instead of the previous local helper layout. |
| First Phase 38 browser screenshot captured only the app background | Phase 38 browser smoke | Re-ran headless Chrome with `--virtual-time-budget=7000`; the second screenshot rendered the workspace normally. |
| Playwright package was unavailable for the Phase 38 screenshot helper | Phase 38 browser smoke | Used the installed `google-chrome` headless screenshot command instead. |
| First browser screenshot after Phase 35 dev restart captured only the app background | Phase 35 browser smoke | Re-ran headless Chrome with a virtual-time budget; the second screenshot rendered the workspace normally. |
| Structure test still expected a direct `if (isGraphEditingLocked())` guard after lock handling had moved into action models | Phase 54 focused green run | Updated the assertion to verify delegated locked action routing for double-click/drop and connection-completion execution instead of relying on a broad inline guard substring. |
| Unescaped backticks in an `rg` shell command triggered `/bin/bash: -c: line 1: unexpected EOF while looking for matching ``` | Phase 55 documentation inspection | Re-ran the read-only search with single-quoted shell text; no files were changed by the failed command. |
| Unescaped backticks in an `rg` shell command triggered `/bin/bash: line 1: EditorWorkspaceShell.vue: command not found` | Phase 79 documentation inspection | The command was read-only and no files were changed; re-read the needed document sections with safer quoting before updating the plan. |
| Unescaped backticks in an `rg` shell command triggered `/bin/bash: line 1: EditorWorkspaceShell: command not found` | Phase 90 documentation inspection | The command was read-only and no files were changed; re-read the needed document sections with safer quoting before updating the plan. |
