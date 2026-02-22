# Findings & Decisions

## Requirements
- Review GraphiteUI project code progress.
- Identify what has been completed and what still needs doing.
- Produce future work items in a useful priority order.

## Research Findings
- README positions GraphiteUI as a Vue 3 + FastAPI + LangGraph visual agent workflow editor/runtime.
- Documented core flows include graph editing, validation, execution, human review pauses/resume, runs history/detail, LangGraph import/export, model providers, skills, and knowledge base retrieval.
- Source tree is broad and feature-rich: frontend has pages for Home, Editor, Runs, Run Detail, Settings, Model Providers, Model Logs, Presets, and Skills; backend has routes for graphs, runs, templates, presets, settings, skills, knowledge, memories, and model logs.
- There is substantial test coverage already: backend pytest tests across runtime/schema/settings/providers/runs/templates; frontend Node tests across API wrappers, editor models, canvas geometry, route sync, i18n, page models, and structure tests.
- `find` output includes many `__pycache__` files under source/test directories, but git status was clean, so they are likely ignored runtime artifacts rather than pending project changes.
- `docs/current_project_status.md` says the old Vue migration is complete; current gaps are product roadmap items rather than migration leftovers.
- The official status doc lists remaining roadmap items: WebSocket realtime push, formal memory write/recall/display, human-in-the-loop breakpoint/resume/audit frontend closure, LangGraph Python export UI, richer cycle termination/visualization, stronger knowledge base management, and a companion/auto-orchestration layer.
- `docs/future/2026-04-21-agent-companion-graph-orchestration.md` is a forward-looking design for a visible companion Agent, GraphCommandBus, agent-generated graph drafts, controlled edit commands, and autonomous orchestration.
- `docs/future/2026-04-22-agent-only-langgraph-runtime.md` records that the agent-only LangGraph runtime refactor was implemented on 2026-04-22, so this is not a remaining gap.
- TODO/FIXME search did not reveal ordinary source TODO markers. Matches were mostly tests/mocks, UI placeholders, and intentional `pass`/`NotImplementedError` handling.
- Frontend routing and sidebar expose real pages for `/`, `/editor`, `/runs`, `/presets`, `/skills`, `/models`, `/model-logs`, and `/settings`, so the product surface is larger than the older README "main pages" list.
- Navigation uses Element Plus icons and a collapsible app shell; this suggests UI implementation is following the repo's existing component-library policy rather than raw controls.
- Backend currently mounts routers for graphs, knowledge, memories, model logs, presets, runs, settings, skills, and templates.
- Actual backend endpoints include graph save/validate/run/import/export, run list/detail/events/node-detail/resume, preset CRUD/status, skills catalog/import/upload/enable/disable/delete, settings model discovery, and OpenAI Codex auth.
- Frontend API wrappers line up with most backend endpoints: graphs/templates, runs/resume, settings/model discovery/Codex auth, presets, skills, knowledge bases, and model logs.
- Potential API/product gap: backend has `GET /api/runs/{run_id}/events`, but the frontend API wrapper list does not show a matching exported fetch function; this may be reserved for future real-time or event polling work.
- Potential product gap: backend has a memories route, but no frontend API wrapper/page appeared in the API export scan, matching the roadmap item that Memory is not yet a full UI feature.
- Follow-up confirmed run events are actually consumed directly through `EventSource` in `EditorWorkspaceShell.vue` and `RunDetailPage.vue`; the missing API wrapper is a style inconsistency, not an unimplemented feature.
- Memory is currently read-only/minimal: `GET /api/memories` loads JSON files from `backend/data/memories` with optional `memory_type`, with no create/update/delete/search API and no frontend page/API wrapper found.
- Root `package.json` only exposes dev/start. Frontend has `build`, but there is no root-level test/build aggregation command yet.
- Recent commits show heavy work on model providers, thinking mode, model logs, streaming responses, run record layout, and editor draft persistence; the current active development theme appears to be model/runtime observability and editor workflow hardening.
- Test inventory: 99 frontend `.test.ts` files with about 559 `test(...)` declarations, and 18 backend pytest files with about 138 test/class declarations.
- No Playwright/Cypress/Vitest config or coverage artifact was found in a shallow repo scan. Frontend tests appear to use Node's built-in test runner and structure/model tests, so browser-level E2E coverage is likely still missing.
- Codebase size scan: 272 frontend/backend source files (`.vue`, `.ts`, `.py`) totaling about 63.7k lines.
- Maintainability risk: several UI/runtime files are very large and likely carry multiple responsibilities, especially `NodeCard.vue` (5,271 lines), `EditorCanvas.vue` (3,536), `EditorWorkspaceShell.vue` (2,567), `ModelProvidersPage.vue` (2,424), plus backend `model_provider_client.py` (1,380), `node_system_executor.py` (1,122), and LangGraph `runtime.py` (1,041).
- Human review is not just backend-only anymore: frontend has `EditorHumanReviewPanel.vue`, `humanReviewPanelModel.ts`, resume calls, required-state guards, focus behavior, and tests around subscription/resume wiring.
- Human-in-loop still likely needs a release-grade audit/management layer: the current code shows pause/resume state editing, but no separate audit history UI or approval trail beyond run snapshots/events was observed in this scan.
- LangGraph Python import/export is implemented end-to-end enough for the editor: backend has export/import endpoints, frontend API wrappers, import source validation, export filename/download helper, and workspace shell actions.
- Knowledge base support is operational for graph inputs and agent retrieval: backend has catalog/search/import loader code, frontend fetches knowledge bases for editor input nodes, and node card logic supports `knowledge_base` state types.
- Knowledge base management is still limited: frontend only fetches `/api/knowledge/bases`; no dedicated knowledge page, import UI, document/chunk browser, reindex controls, or search/debug UI were observed.
- LangGraph runtime has explicit unsupported cases: non-`replace` state write modes, condition nodes as condition branch targets in agent-only runtime, condition routes without compatible agent/output targets, and ambiguous unordered state reads.
- Cycle support is present: condition loop limits, `exhausted` routes, cycle summaries/iterations, active feedback, and Run Detail visual summaries exist. The remaining roadmap item is more about advanced policies and richer UX than basic loop support.
- Model Provider/observability is one of the most mature current areas: UI supports provider add/edit/delete, model discovery, thinking level, OpenAI Codex auth, selected model pills, loading/saved/error states, and recent commits heavily focus here.
- Model request logs are stored as JSONL with pagination/search and payload sanitization for data/file URLs; frontend has a dedicated Model Logs page with stream/reasoning/content display support.
- Model log retention/cleanup is not obvious from the route/store scan; logs can grow indefinitely unless handled elsewhere.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Inspect docs, source, tests, and TODO markers | These provide the best signal for current progress and missing work. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Backlog Synthesis

### Critical / Next
- Add a proper Memory product loop: write/recall APIs, frontend management/inspection UI, agent integration semantics, and tests. Current memory route is read-only JSON listing.
- Add browser-level E2E coverage for the core happy path: create graph, configure provider/model, run graph, stream output, pause/resume human review, inspect run detail.
- Add root-level verification scripts that aggregate frontend build/tests and backend tests, so release validation is one command instead of scattered README commands.

### Near-Term Product Work
- Build a dedicated Knowledge Base management page: import/reindex, document/chunk browser, search/debug view, metadata, delete/refresh controls.
- Finish human-in-loop as a product/audit workflow: clear breakpoint configuration UI, approval trail, resume history, diff of human-edited state, and failure recovery.
- Add model log retention/export/delete controls to prevent JSONL logs from growing forever and to protect sensitive request history.
- Smooth remaining LangGraph runtime limits or expose them clearly in validation UI: non-replace writes, nested condition branch targets, ambiguous unordered writers.

### Maintainability
- Gradually split large components and service files: `NodeCard.vue`, `EditorCanvas.vue`, `EditorWorkspaceShell.vue`, `ModelProvidersPage.vue`, `model_provider_client.py`, `node_system_executor.py`, `runtime.py`.
- Normalize direct `EventSource` usage behind a small frontend run-events helper if it starts spreading further.

### Later / Strategic
- Implement the companion Agent / GraphCommandBus direction from `docs/future`.
- Add richer cycle policies and visualization beyond current loop limit/exhausted summaries.
- Consider packaging/deployment docs and production-mode configuration once core workflows stabilize.

## Resources
- [README.md](README.md)
- [docs/current_project_status.md](docs/current_project_status.md)
- [docs/future/2026-04-21-agent-companion-graph-orchestration.md](docs/future/2026-04-21-agent-companion-graph-orchestration.md)
- [docs/future/2026-04-22-agent-only-langgraph-runtime.md](docs/future/2026-04-22-agent-only-langgraph-runtime.md)
- [package.json](package.json)
- [backend](backend)
- [frontend](frontend)

## Visual/Browser Findings
- Not applicable so far.
