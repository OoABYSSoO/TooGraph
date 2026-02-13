# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GraphiteUI is a visual node-based editor and runtime workspace for LangGraph-style agent workflows. Users compose workflows by creating nodes, connecting state/data edges and control-flow edges, configuring agent skills and runtime options, then validating and running the graph against a FastAPI + LangGraph backend.

`node_system` is the only formal graph protocol. `state_schema` is the single source of truth for graph data, while nodes declare which state they read and write.

## Development Commands

### Quick Start

```bash
./scripts/start.sh
```

This starts the frontend on port `3477` and the backend on port `8765`. The script releases occupied ports, starts both services, waits for health checks, and writes logs to `.dev_backend.log` and `.dev_frontend.log`.

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

- `npm run dev` - Vite dev server
- `npm run build` - `vue-tsc --noEmit && vite build`
- `npm run preview` - Vite preview server

### Health Check

```bash
curl http://localhost:8765/health
```

Expected response:

```json
{"status":"ok"}
```

## Repository Rules

- Commit messages must be written in Chinese.
- After runtime code changes, restart with `./scripts/start.sh`.
- For UI work, prefer existing project libraries before custom controls.
- Current UI library preference is Element Plus with `@element-plus/icons-vue`.

## Frontend Architecture

- Entry: `frontend/src/main.ts`
- Router: `frontend/src/router/index.ts`
- API helpers: `frontend/src/api/`
- State: Pinia stores under `frontend/src/stores/`
- Editor: `frontend/src/editor/`
- Global style and Element Plus theme overrides: `frontend/src/styles/`
- Path alias: `@/*` maps to `frontend/src/*`

The editor is custom Vue code. Element Plus is used for common controls such as tabs, dialogs, popovers, selects, inputs, buttons, icons and switches. The canvas, node card, state ports, edge routing, minimap and runtime feedback are GraphiteUI-specific components.

Current node families:

- `input`
- `agent`
- `condition`
- `output`

Important editor capabilities:

- node creation from blank canvas, output drag and dropped files
- state/data edges and control-flow edges
- condition route edges
- state editor popovers
- agent skill and port popovers
- edge visibility modes
- minimap
- runtime node and edge feedback

## Backend Architecture

- Entry: `backend/app/main.py`
- API routers: `backend/app/api/`
- Graph validation: `backend/app/core/compiler/validator.py`
- LangGraph runtime and codegen: `backend/app/core/langgraph/`
- Runtime state helpers: `backend/app/core/runtime/`
- Pydantic schemas: `backend/app/core/schemas/`
- JSON and SQLite storage: `backend/app/core/storage/`
- Knowledge base importer and retrieval: `backend/app/knowledge/`
- Built-in templates: `backend/app/templates/`

Persistence:

- Graph / preset / run / settings / skill state: JSON files in `backend/data/`
- Knowledge base index: SQLite / FTS under `backend/data/`

Local LLM configuration:

- `LOCAL_BASE_URL`
- `LOCAL_API_KEY`
- `LOCAL_TEXT_MODEL`

Fallback aliases:

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `TEXT_MODEL`

## Graph Execution Pipeline

1. Frontend submits graph JSON.
2. Backend validates with `validator.py`.
3. Graph is saved through the graph store.
4. LangGraph runtime executes the node-system graph.
5. Run state and artifacts are persisted.
6. Frontend polls run detail and maps results back onto nodes, edges and output previews.

## Key Routes

| Route | Purpose |
| --- | --- |
| `POST /api/graphs/save` | Save graph |
| `POST /api/graphs/validate` | Validate graph |
| `POST /api/graphs/run` | Execute graph |
| `POST /api/graphs/export/langgraph-python` | Export LangGraph Python source |
| `GET /api/runs` | List runs |
| `GET /api/runs/{run_id}` | Run detail |
| `POST /api/runs/{run_id}/resume` | Resume failed, paused, or awaiting-human runs |
| `GET /api/templates` | List templates |
| `GET /api/presets` | List presets |
| `GET /api/knowledge/bases` | List knowledge bases |
| `GET /api/skills/definitions` | List skill definitions |
| `GET /api/settings` | Read settings |
| `POST /api/settings` | Update settings |
