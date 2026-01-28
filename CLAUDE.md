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
make frontend-dev      # next dev on port 3477
make frontend-build    # next build
make backend-install   # pip install -r backend/requirements.txt
make backend-dev       # uvicorn app.main:app --reload --port 8765
make backend-health    # curl health endpoint
```

### Frontend npm scripts (in frontend/)

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — Next.js lint

### Health Check

```bash
curl http://localhost:8765/health    # {"status": "ok"}
```

### Agent Instructions (from AGENTS.md)

- **Commit messages**: Always write in Chinese.
- **After code changes**: Run `./scripts/start.sh` to restart services. (Non-runtime changes like docs — use judgment.)
- The script handles port cleanup automatically.

## Architecture

### Frontend (Next.js 15 + React 19)

- **Entry**: `frontend/app/layout.tsx` — root layout with language/theme providers
- **API client**: `frontend/lib/api.ts` — typed helpers (`apiGet`, `apiPost`, `apiDelete`) against `process.env.NEXT_PUBLIC_API_BASE_URL`
- **State**: 目前主要由页面级 React state 与 React Flow state 驱动，仓库内没有稳定落地的 `frontend/stores/`
- **Node system**: Preset-driven via `frontend/lib/node-presets-mock.ts`. Four node families: `input`, `agent`, `condition`, `output`. Node types are defined as `NodePresetDefinition` objects, not freeform.
- **Canvas**: `@xyflow/react` (React Flow v12) — `frontend/components/editor/node-system-editor.tsx`
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/postcss`) + CSS custom properties in `frontend/app/globals.css` for design tokens
- **Path alias**: All frontend imports use `@/*` → `./` (e.g., `import { apiGet } from "@/lib/api"`)

### Backend (Python FastAPI)

- **Entry**: `backend/app/main.py` — FastAPI app with CORS allowing `http://localhost:3477`
- **Core modules** are under `backend/app/core/`:
  - `compiler/` — 当前主要是 `validator`，负责 node-system graph 的结构校验
  - `runtime/` — `node_system_executor`, `state`, `output_boundary_utils` 等执行主链
  - `schemas/` — `graph`, `node_system`, `run`, `preset`, `skills` (Pydantic models)
  - `storage/` — SQLite persistence (`database.py`, `graph_store.py`, `run_store.py`)
  - 其他能力：`model_catalog`, `templates`, `skills`, `tools`
- **Templates**: `backend/app/templates/` — 当前主模板是 `hello_world`
- **Persistence**: SQLite at `backend/data/graphiteui.db`
- **Local LLM config**: `LOCAL_BASE_URL`, `LOCAL_API_KEY`, `LOCAL_TEXT_MODEL` (with fallback aliases `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `TEXT_MODEL`)

### Graph Execution Pipeline

1. Frontend submits graph JSON → `POST /api/graphs/save`
2. Backend validates → `core/compiler/validator.py`
3. `save_graph()` persists the node-system graph
4. `execute_node_system_graph()` runs the workflow
5. Results persisted to SQLite via `run_store.py`
6. Frontend polls run status and displays node execution summaries

### Key Routes

| Route                       | Purpose                             |
| --------------------------- | ----------------------------------- |
| `POST /api/graphs/save`     | Save graph                          |
| `POST /api/graphs/validate` | Validate graph                      |
| `POST /api/graphs/run`      | Execute graph                       |
| `GET /api/runs`             | List runs                           |
| `GET /api/runs/{run_id}`    | Run detail                          |
| `GET /api/knowledge`        | Knowledge assets                    |
| `GET /api/memories`         | Experimental placeholder listing    |
| `GET /api/settings`         | System settings                     |
