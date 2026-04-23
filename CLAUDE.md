# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GraphiteUI is a visual node-based editor and runtime workspace for LangGraph-style agent workflows. Users compose workflows by creating nodes, connecting state/data edges and control-flow edges, configuring agent skills and runtime defaults, validating the graph, then running it against a FastAPI + LangGraph backend.

`node_system` is the only formal graph protocol in active use. `state_schema` is the single source of truth for graph data, while nodes declare what state they read and write.

The current mainline is the Vue frontend plus the FastAPI backend. Old migration planning context should not be treated as the current implementation.

## Current Source Of Truth

When repository guidance overlaps, prefer the current files in this order:

1. `AGENTS.md`
2. `README.md`
3. `docs/current_project_status.md`
4. The code itself

Keep this file aligned with those sources and with the actual codebase.

## Development Commands

### Standard Cross-Platform Start

The standard restart command for this repository is:

```bash
npm run dev
```

This resolves to:

```bash
node scripts/start.mjs
```

Use it as the default startup and restart flow on Windows, macOS, Linux, and WSL.

Windows PowerShell note:

```powershell
npm.cmd run dev
```

Use that form if execution policy blocks `npm.ps1`.

For Bash-oriented environments, the repository also keeps this wrapper:

```bash
./scripts/start.sh
```

Both startup paths should:

- release occupied frontend and backend ports before starting
- start the frontend on `3477`
- start the backend on `8765`
- wait for readiness checks
- write logs to `.dev_frontend.log` and `.dev_backend.log`

### Dependency Install

Install frontend dependencies from the repo root:

```bash
npm --prefix frontend install
```

Install backend dependencies with Python 3.11+:

```bash
python -m pip install -r backend/requirements.txt
```

If the system Python command is `python3`, use that instead. If Python is installed outside `PATH`, set `PYTHON` before running `npm run dev`.

### Makefile Commands

```bash
make frontend-install
make frontend-dev
make frontend-build
make backend-install
make backend-dev
make backend-health
```

### Frontend npm Scripts

Run these from `frontend/`:

- `npm run dev` - Vite dev server on `127.0.0.1:3477`
- `npm run build` - `vue-tsc --noEmit && vite build`
- `npm run preview` - Vite preview server on `127.0.0.1:3477`

### Health Check

```bash
curl http://127.0.0.1:8765/health
```

Expected response:

```json
{"status":"ok"}
```

## Repository Rules

- Commit messages must be written in Chinese.
- After runtime code changes, restart with the standard cross-platform flow above.
- If a task only changes documentation or other non-runtime files, use judgment on whether a restart is needed.
- For UI work, prefer existing project libraries before custom controls.
- The primary UI library is Element Plus with `@element-plus/icons-vue`.
- Keep `scripts/start.mjs` and `scripts/start.sh` behaviorally aligned.
- Do not introduce or revive an alternate graph protocol; `node_system` is the only active graph contract.

## Frontend Architecture

### App Shell And Routing

- Entry: `frontend/src/main.ts`
- Router: `frontend/src/router/index.ts`
- Shell: `frontend/src/layouts/AppShell.vue`
- Pages:
  - `/` -> `HomePage.vue`
  - `/editor`, `/editor/new`, `/editor/:graphId` -> `EditorPage.vue`
  - `/runs` -> `RunsPage.vue`
  - `/runs/:runId` -> `RunDetailPage.vue`
  - `/settings` -> `SettingsPage.vue`

### Frontend Modules

- API helpers: `frontend/src/api/`
- Stores: `frontend/src/stores/`
- Editor code: `frontend/src/editor/`
  - `anchors/`
  - `canvas/`
  - `nodes/`
  - `workspace/`
- Global styles and Element Plus theme overrides: `frontend/src/styles/`
- Shared helpers: `frontend/src/lib/`
- Types: `frontend/src/types/`

### Editor Reality

The editor surface is custom Vue code. Element Plus is used for standard application controls, while the canvas, node cards, ports, routed edges, minimap, workspace shells, and runtime overlays are GraphiteUI-specific.

Current node families:

- `input`
- `agent`
- `condition`
- `output`

Current editor capabilities reflected in code:

- canvas-driven node creation
- node creation from connection handles
- dropped-file creation for input nodes
- state/data edges and control-flow edges
- condition branch routing with loop limits
- state editor and agent configuration popovers
- edge visibility modes
- minimap
- runtime node and edge feedback
- output previews
- Python export/import UI wiring
- human review panel plumbing in the editor workspace

### Frontend Tests

The frontend includes many colocated `*.test.ts` and `*.structure.test.ts` files across `src/api/`, `src/editor/`, `src/layouts/`, `src/lib/`, `src/pages/`, and `src/styles/`. Preserve this style when extending targeted coverage.

## Backend Architecture

### App Entry And Routers

- Entry: `backend/app/main.py`
- Routers in `backend/app/api/`:
  - `routes_graphs.py`
  - `routes_knowledge.py`
  - `routes_memories.py`
  - `routes_presets.py`
  - `routes_runs.py`
  - `routes_settings.py`
  - `routes_skills.py`
  - `routes_templates.py`

### Backend Modules

- Graph validation: `backend/app/core/compiler/validator.py`
- LangGraph runtime and codegen: `backend/app/core/langgraph/`
- Runtime state helpers: `backend/app/core/runtime/`
- Pydantic schemas: `backend/app/core/schemas/`
- JSON and SQLite storage: `backend/app/core/storage/`
- Knowledge loading and search: `backend/app/knowledge/`
- Memory loading: `backend/app/memory/`
- Skill definitions and registry: `backend/app/skills/`
- Tool registry and local LLM helpers: `backend/app/tools/`
- Built-in templates: `backend/app/templates/`

### Persistence Layout

Under `backend/data/`:

- `graphs/` - saved graphs as JSON
- `kb/` - knowledge base manifests and downloaded source archives
- `presets/` - saved presets as JSON
- `runs/` - run records as JSON
- `checkpoints/` - LangGraph checkpoint data
- `settings/` - saved app settings
- `skills/` - imported skill state
- `memories/` - memory records loaded by `/api/memories`
- `graphiteui.db` - SQLite database for knowledge base metadata and FTS search

Some directories are created on demand. Indexed knowledge base content lives in SQLite plus FTS tables, while `backend/data/kb/` stores import manifests and download artifacts used by the knowledge importer.

### Runtime Model And Tool Configuration

Settings and runtime defaults are built from the backend model catalog and tool registry.

For local runtime setup, prefer EZLLM:

```bash
pipx install ezllm
ezllm start
LOCAL_BASE_URL=http://127.0.0.1:8888/v1
```

Legacy local runtime scripts in `scripts/lm_core0.py`, `scripts/lm-server`, and `scripts/download_Gemma_gguf.py` are migration wrappers only and should not regain in-repo runtime behavior.

Relevant environment variables include:

- `LOCAL_BASE_URL`
- `LOCAL_API_KEY`
- `LOCAL_TEXT_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `TEXT_MODEL`

## Graph Execution Pipeline

1. The frontend submits a `node_system` graph payload.
2. The backend validates it with the Pydantic schema and `validator.py`.
3. Save and run flows persist graph or run state through the storage layer.
4. The LangGraph runtime executes the graph in the background when supported.
5. Checkpoints, run state, node status, outputs, and artifacts are persisted during execution.
6. The frontend polls run detail and projects runtime state back onto the editor and run-detail views.

Important runtime constraint: only `agent` nodes are compiled into real LangGraph runtime nodes. `input`, `output`, and `condition` remain editor-visible boundary or routing constructs around that runtime model.

Resume support exists for runs with available LangGraph checkpoints and valid graph snapshots.

## Key Routes

| Route | Purpose |
| --- | --- |
| `GET /health` | Backend health check |
| `GET /api/templates` | List built-in templates |
| `GET /api/templates/{template_id}` | Load one built-in template |
| `GET /api/graphs` | List saved graphs |
| `GET /api/graphs/{graph_id}` | Load one saved graph |
| `POST /api/graphs/save` | Save graph |
| `POST /api/graphs/validate` | Validate graph |
| `POST /api/graphs/run` | Execute graph |
| `POST /api/graphs/export/langgraph-python` | Export LangGraph Python source |
| `POST /api/graphs/import/python` | Import graph payload from Python source |
| `GET /api/presets` | List presets |
| `GET /api/presets/{preset_id}` | Load one preset |
| `POST /api/presets` | Create preset |
| `PUT /api/presets/{preset_id}` | Update preset |
| `GET /api/runs` | List runs |
| `GET /api/runs/{run_id}` | Load run detail |
| `GET /api/runs/{run_id}/nodes/{node_id}` | Load one node execution detail |
| `POST /api/runs/{run_id}/resume` | Resume failed, paused, or awaiting-human runs |
| `GET /api/settings` | Read settings, model catalog, tool registry, and defaults |
| `POST /api/settings` | Update settings |
| `GET /api/knowledge` | Search knowledge chunks |
| `GET /api/knowledge/bases` | List knowledge bases |
| `GET /api/skills/definitions` | List active skill definitions |
| `GET /api/skills/catalog` | List skill catalog, including importable entries |
| `POST /api/skills/{skill_key}/import` | Import a catalog skill |
| `POST /api/skills/{skill_key}/disable` | Disable a managed skill |
| `POST /api/skills/{skill_key}/enable` | Enable a managed skill |
| `DELETE /api/skills/{skill_key}` | Delete an imported GraphiteUI skill |
| `GET /api/memories` | List stored memories, optionally filtered by type |

## Built-In Templates

Current templates in `backend/app/templates/`:

- `hello_world.json`
- `knowledge_base_validation.json`
- `conditional_edge_validation.json`
- `cycle_counter_demo.json`
- `human_review_demo.json`

## Working Expectations For Agents

- Read the existing code path before editing. The project already has clear module boundaries in both frontend and backend.
- Follow the existing Vue + Pinia + Element Plus patterns on the frontend.
- Follow the existing FastAPI + Pydantic + storage-layer separation on the backend.
- Keep edits scoped to the current request. Do not revive stale migration work or broad refactors unless the task clearly needs them.
- When updating docs, keep `README.md`, `AGENTS.md`, `CLAUDE.md`, and `docs/current_project_status.md` mutually consistent.
