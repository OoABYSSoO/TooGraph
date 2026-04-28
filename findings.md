# Findings & Decisions: Repository Architecture Audit

## Requirements
- Review the repository for redundant code, unused code, and extractable modules.
- Judge with an architect-level standard: maintainability, boundaries, coupling, testability, and refactor risk.
- Prefer evidence-backed recommendations over speculative rewrites.

## Research Findings
- Repository is frontend-heavy: `git ls-files` line count across TS/Vue/Python/CSS is about 79k lines.
- The largest frontend files are `frontend/src/editor/nodes/NodeCard.vue` at 5,383 lines, `frontend/src/editor/canvas/EditorCanvas.vue` at 4,672 lines, and `frontend/src/editor/workspace/EditorWorkspaceShell.vue` at 2,873 lines. These are likely the highest leverage architecture review targets.
- The largest backend runtime files are `backend/app/tools/model_provider_client.py` at 1,380 lines, `backend/app/core/runtime/node_system_executor.py` at 1,226 lines, and `backend/app/core/langgraph/runtime.py` at 1,041 lines.
- Root scripts are minimal: root `package.json` delegates only to `scripts/start.mjs`; frontend has build/dev/preview only. This reduces orchestration ambiguity.
- Frontend dependencies are intentionally small: Vue, Vue Router, Pinia, Vue I18n, Element Plus, and icons. Most complexity is application code, not dependency sprawl.
- Backend dependencies are also small and expected for this product: FastAPI, Pydantic, LangGraph, OpenAI, httpx, YAML, BeautifulSoup, multipart upload.
- No tracked `__pycache__`, `.pyc`, `dist`, or `.dev_*` files were found.
- Static unused-code check with `vue-tsc --noUnusedLocals --noUnusedParameters` found a small set of truly unused frontend symbols. Safe cleanup was applied in `NodeCard.vue`, `WorkspaceSearchField.vue`, and `graph-node-creation.ts`.
- Removed `scripts/lm_core1.py`: it was 1,989 lines, unreferenced by tracked scripts/frontend/backend/docs/README, and conflicted with the current OpenAI-compatible provider migration strategy already expressed by `lm_core0.py`, `download_Gemma_gguf.py`, and `lm-server`.
- `NodeCard.vue` mixes node chrome, state-port editing, text editing, runtime controls, skill picker, input value editor, output preview, condition editing, port drag-reorder, and CSS in one component. This is the most urgent frontend extraction candidate.
- `EditorCanvas.vue` mixes rendering, viewport, pan/zoom/pinch, minimap coordination, node drag/resize, anchor measurement, connection snapping/completion, edge editing popovers, lock handling, and run presentation. It should be split by interaction model rather than by visual section.
- `EditorWorkspaceShell.vue` mixes tab persistence, draft persistence, route sync, run polling/SSE, graph mutation forwarding, state panel actions, creation menu actions, import/export, and user feedback. It is a shell in name but currently owns too much application orchestration.
- Backend runtime concentration is similar: `model_provider_client.py`, `node_system_executor.py`, and `core/langgraph/runtime.py` each contain multiple layers of responsibilities that should be separated only after behavior tests cover the boundaries.

## Candidate Areas To Inspect
- Frontend graph editor: `frontend/src/editor/canvas`, `frontend/src/editor/nodes`, `frontend/src/editor/workspace`.
- Frontend pages/models/API wrappers: `frontend/src/pages`, `frontend/src/api`, `frontend/src/lib`.
- Backend runtime and graph execution: `backend/app/core`, `backend/app/api`, `backend/app/skills`.
- Scripts and dev orchestration: `scripts`, root `package.json`, `frontend/package.json`, backend requirements.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Do not start by deleting code | Static signals alone can be misleading in a UI-heavy codebase with dynamic routing and tests. |
| Prioritize modules with high size and high coupling | Those create the most maintenance drag and refactor risk. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `vue-tsc` unused check failed on stale handlers and imports | Removed the unused symbols and updated the structure test that asserted the previous handler shape. |

## Final Recommendations
- Next engineering slice should be `NodeCard.vue` extraction, starting with floating panel state and port reorder logic.
- The second slice should be `EditorCanvas.vue` connection/measurement extraction.
- The third slice should be `EditorWorkspaceShell.vue` run stream and draft persistence extraction.
- Backend refactor should begin with `model_provider_client.py` because its protocol boundaries are clearer than executor/runtime semantics.
- Avoid a broad rewrite; move pure functions first, keep public APIs as thin compatibility facades, and preserve current tests during each extraction.

## 2026-04-28 Cleanup Execution Findings
- Current cleanup should begin with `NodeCard.vue`, matching the roadmap's P1 recommendation.
- The safest immediate slice is the agent port reorder logic: preview ordering, target index calculation, selector escaping, source rect extraction, and floating pill style are pure or nearly pure and currently live inside the 5k-line component.
- `actionPopoverStyle`, `stateEditorPopoverStyle`, and `agentAddPopoverStyle` are identical transparent Element Plus popover style objects in `NodeCard.vue`; they can share one constant while preserving the public template bindings.
- Existing structure tests assert the previous in-component helper layout, so they must be updated alongside the extraction to verify the new module boundary instead of locking duplication in place.
- Editing existing state fields has a clean pure-model boundary: schema-to-draft conversion, immutable field updates, anchor-key extraction, and update-patch construction can live outside `NodeCard.vue` while the component keeps lock guards, popover confirmation state, translated errors, and emits.
- The production large chunk warning was primarily caused by synchronous page imports and unsplit vendor dependencies. Route-level dynamic imports reduce the app entry chunk from 1,674.16 kB to about 131 kB, while stable Vue and Element Plus vendor chunks keep routing behavior unchanged and avoid noisy circular manual chunk output.
- Agent runtime input helpers have a small model boundary in `agentConfigModel.ts`: thinking-mode normalization and temperature input parsing can be tested as pure functions while `NodeCard.vue` retains lock checks, emits, and select focus handling.
- Uploaded asset display text has a pure model boundary in `uploadedAssetModel.ts`: labels, summaries, text previews, and empty-state descriptions can be tested outside the component while `NodeCard.vue` keeps file selection, drop handling, error reporting, and graph state emits.
- Knowledge-base input presentation has a separate pure boundary in `inputKnowledgeBaseModel.ts`: option labels, unavailable-current-value handling, and selected-description fallback can move out of `NodeCard.vue` while the component keeps select events and state updates.
- Output-node advanced configuration has a shared pure boundary in `outputConfigModel.ts`: display/persist option lists, labels, active checks, and simple config patches can be reused by `NodeCard.vue` and `nodeCardViewModel.ts` instead of duplicated.
- Condition-rule editing has a pure draft boundary in `conditionRuleEditorModel.ts`: value draft normalization, operator patching, value patch no-op detection, and exists-operator disabled state can move out of `NodeCard.vue` while the component keeps DOM event handling and emits.
- Condition loop-limit editing has a pure draft and commit boundary in `conditionLoopLimit.ts`: draft formatting, invalid-value reset, no-op detection, and patch creation can move out of `NodeCard.vue` while the component keeps DOM event handling, blur behavior, lock guards, and emits.
- Agent skill picker behavior has a final small pure boundary in `skillPickerModel.ts`: attach/remove no-op detection and skills patch creation can move out of `NodeCard.vue` while the component keeps picker visibility, lock guards, and emits.
- EditorCanvas route handle presentation has a pure model boundary in `routeHandleModel.ts`: branch tone/palette, flow-out hotspot geometry, and route handle CSS variables can move out of `EditorCanvas.vue` while the component keeps DOM events, connection state, and pointer interactions.
- EditorCanvas interaction styling has a pure model boundary in `canvasInteractionStyleModel.ts`: color alpha conversion, connection preview strokes, projected edge CSS variables, flow hotspot geometry, and state anchor connection variables can move out while `EditorCanvas.vue` keeps active connection state, eligibility sets, pointer handling, and graph emits.
- EditorCanvas node presentation has a pure model boundary in `canvasNodePresentationModel.ts`: transform styles, node card size CSS variables, fallback rendered dimensions, minimap node models, and minimap run-state mapping can move out while `EditorCanvas.vue` keeps DOM measurement, resize drag state, viewport updates, and graph emits.
- EditorCanvas data-edge state editing has a pure model boundary in `canvasDataEdgeStateModel.ts`: data-edge ids, floating confirm/editor positions, data-edge matching, and confirm/request-to-editor projections can move out while `EditorCanvas.vue` keeps timers, lock guards, emits, selection state, and request watchers. The canvas can also reuse `stateEditorModel.ts` for state draft construction, immutable draft edits, and update patches instead of duplicating the NodeCard state editor logic.
- EditorCanvas connection preview has a pure model boundary in `canvasConnectionModel.ts`: concrete state key detection, pending connection creation and identity, active source anchor lookup, preview state key resolution, accent color selection, and preview path model construction can move out while `EditorCanvas.vue` keeps pointer events, auto-snapping, connection completion, node-creation menu payloads, and graph mutation emits.
- EditorCanvas still had several small pure helpers after the connection extraction. Condition route target labels now fit `conditionRouteTargetsModel.ts`; human-review/run-node wrapper presentation now fits `canvasRunPresentationModel.ts`; flow/route delete confirmation target, style, active-state, and emit-action projection now fit `flowEdgeDeleteModel.ts`. `EditorCanvas.vue` keeps live refs, timers, lock guards, selected-edge updates, and actual emits.
- EditorCanvas has a broad pure-helper cleanup seam across minimap edge projection, forced-visible edge ids, pending state previews, virtual create port visibility/transient anchors, selected reconnect projection, keyboard edge delete projection, data-edge disconnect payloads, pinch math, and viewport display formatting. Extracting those helpers reduced the component from 4,226 to 4,039 lines while preserving side-effect ownership in the Vue component.
- Repeated production builds now complete without a Vite large chunk warning. The warning is no longer a current blocker; remaining bundle work should be treated as targeted performance work rather than cleanup-risk mitigation.
- Baseline comparison showed the state auto-snap regression came from filtering pending agent input sources through concrete-only state keys, which dropped `VIRTUAL_ANY_OUTPUT_STATE_KEY`. Preserving virtual output sources restores auto-snapping from a virtual output into an agent create-input target.
- EditorCanvas connection interaction has a larger pure boundary than the earlier small connection preview model: node-body auto-snap selection, concrete state row hit selection, virtual create-input fallback anchors, reverse virtual output fallback anchors, and node-creation menu payload construction can live in `canvasConnectionInteractionModel.ts`.
- New node creation context is sensitive to preserving virtual state keys even when their value type resolves to `null`; dropping those keys removes the downstream naming/binding context for created nodes.
- Edge overlay interactions in `EditorCanvas.vue` have a composable boundary around refs, timers, state-editor requests, emitted delete/disconnect/update actions, and missing-edge cleanup. Keeping only pointer-to-canvas coordinate conversion in the component preserves the DOM event surface while moving behavior into `useCanvasEdgeInteractions.ts`.
- Node measurement state has a separate composable boundary: node element registration, resize/mutation observers, rendered anchor-slot measurement, flow anchor fallback measurement, and measured-size cache cleanup can live in `useCanvasNodeMeasurements.ts`. The component still owns canvas viewport math and graph interaction decisions.
- NodeCard title/description editing has a safe composable boundary in `useNodeCardTextEditor.ts`: trigger pointer tracking, confirm timers, focus scheduling, drafts, trim/no-op metadata patches, and close/commit behavior can move out while `NodeCard.vue` keeps popup template markup, locked-edit handling, peer panel cleanup, and the `update-node-metadata` emit payload.
- The formal roadmap document for this cleanup is `docs/future/2026-04-28-architecture-refactor-roadmap.md`; root `task_plan.md`, `findings.md`, and `progress.md` are execution memory and must stay aligned with that roadmap.
- The first roadmap `useNodeFloatingPanels` step can proceed safely in smaller sub-slices. Top-action confirm timers and global outside-panel close listeners are now isolated in `useNodeFloatingPanels.ts`; state-editor confirm/delete confirm can follow after their behavior is covered by focused controller tests.
