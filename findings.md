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
