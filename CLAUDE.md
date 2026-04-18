# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GraphiteUI is a visual node-based editor and runtime workspace for LangGraph agent workflows. It lets users visually compose agent workflows by dragging nodes, connecting them, configuring parameters, and executing them against a LangGraph backend. All execution is persisted and viewable as run history.

## Development Commands

### Quick Start

```bash
./scripts/start.sh    # Starts both frontend (port 3477) and backend (port 8765)
```

This script kills occupied ports, starts both services, waits for health checks, and logs to `.dev_backend.log` / `.dev_frontend.log`.

### Individual Commands (via Makefile)

```bash
make frontend-install   # cd frontend && npm install
make frontend-dev      # Vite dev server on port 3477
make frontend-build    # Vite production build
make backend-install   # pip install -r backend/requirements.txt
make backend-dev       # uvicorn app.main:app --reload --port 8765
make backend-health    # curl health endpoint
```

### Frontend npm scripts (in frontend/)

- `npm run dev` — Vite dev server
- `npm run build` — `vue-tsc --noEmit && vite build`
- `npm run preview` — Vite preview server

### Health Check

```bash
curl http://localhost:8765/health    # {"status": "ok"}
```

### Agent Instructions (from AGENTS.md)

- **Commit messages**: Always write in Chinese.
- **After code changes**: Run `./scripts/start.sh` to restart services. (Non-runtime changes like docs — use judgment.)
- The script handles port cleanup automatically.

## Architecture

### Frontend (Vue 3 + Vite)

- **Entry**: `frontend/src/main.ts` — root app bootstrap
- **Router**: `frontend/src/router/index.ts`
- **API client**: `frontend/src/api/` — typed helpers around backend endpoints
- **State**: Pinia stores under `frontend/src/stores/`
- **Node system**: `node_system` is now the only formal graph protocol. `state_schema` is the single data source, `nodes` is a map keyed by unique node names, and nodes only declare which state they read or write. Four current node families: `input`, `agent`, `condition`, `output`.
- **Canvas**: custom Vue editor under `frontend/src/editor/`
- **Styling**: Vue SFC scoped CSS + Reka UI primitives
- **Path alias**: All frontend imports use `@/*` → `./` (e.g., `import { apiGet } from "@/lib/api"`)

### Backend (Python FastAPI)

- **Entry**: `backend/app/main.py` — FastAPI app with CORS allowing `http://localhost:3477`
- **Core modules** are under `backend/app/core/`:
  - `compiler/` — 当前主要是 `validator`，负责 node-system graph 的结构校验
  - `runtime/` — `node_system_executor`, `state`, `output_boundary_utils` 等执行主链
  - `schemas/` — `graph`, `node_system`, `run`, `preset`, `skills` (Pydantic models)
  - `storage/` — JSON file persistence for graphs / runs / settings / skills, plus SQLite support for knowledge base indexing
  - 其他能力：`model_catalog`, `templates`, `skills`, `tools`
- **Templates**: `backend/app/templates/` — templates are JSON-backed and currently led by `hello_world.json`
- **Persistence**:
  - Graph / Preset / Run / Settings / Skill State: JSON files in `backend/data/`
  - Knowledge Base index: SQLite at `backend/data/graphiteui.db`
- **Local LLM config**: `LOCAL_BASE_URL`, `LOCAL_API_KEY`, `LOCAL_TEXT_MODEL` (with fallback aliases `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `TEXT_MODEL`)

### Graph Execution Pipeline

1. Frontend submits graph JSON → `POST /api/graphs/save`
2. Backend validates → `core/compiler/validator.py`
3. `save_graph()` persists the node-system graph
4. `execute_node_system_graph()` runs the workflow
5. Results persisted to JSON storage via `run_store.py`
6. Frontend polls run status and displays node execution summaries

### Key Routes

| Route                       | Purpose                             |
| --------------------------- | ----------------------------------- |
| `POST /api/graphs/save`     | Save graph                          |
| `POST /api/graphs/validate` | Validate graph                      |
| `POST /api/graphs/run`      | Execute graph                       |
| `POST /api/graphs/export/langgraph-python` | Export LangGraph Python source |
| `GET /api/runs`             | List runs                           |
| `GET /api/runs/{run_id}`    | Run detail                          |
| `POST /api/runs/{run_id}/resume` | Resume a paused/awaiting-human run |
| `GET /api/knowledge/bases`  | Knowledge base catalog              |
| `GET /api/memories`         | Experimental placeholder listing    |
| `GET /api/settings`         | System settings                     |
