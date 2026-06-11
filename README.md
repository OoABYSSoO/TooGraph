<p align="center">
  <img src="frontend/public/logo.svg" alt="TooGraph logo" width="128" />
</p>

<h1 align="center">TooGraph</h1>

<p align="center">
  A visual workspace for building, running, inspecting, and evolving agent workflows as graphs.
</p>

<p align="center">
  <a href="README.md">English</a>
  · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="docs/assets/readme-show.gif" alt="TooGraph editor demo" width="760" />
</p>

<p align="center">
  <a href="https://github.com/OoABYSSoO/TooGraph/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-c89136"></a>
  <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42b883?logo=vue.js&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-runtime-222222">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20.9%2B-5fa04e?logo=node.js&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11%2B-3776ab?logo=python&logoColor=white">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>
  · <a href="#why-toograph">Why TooGraph</a>
  · <a href="#core-features">Core Features</a>
  · <a href="#model-providers">Model Providers</a>
  · <a href="#knowledge-base-and-memory">Knowledge Base and Memory</a>
  · <a href="#technical-details">Technical Details</a>
</p>

<p align="center">
  YouTube demo: coming soon
  · <a href="https://space.bilibili.com/13886340">Bilibili</a>
  · Douyin: <code>56590573478</code>
</p>

TooGraph is a local-first visual workspace for agent workflows. It turns graphs, state, nodes, data flow, execution flow, conditional branches, run records, human review, tool calls, memory, and retrieval into a single inspectable system.

The project is currently built with a Vue frontend, a FastAPI backend, and a LangGraph runtime. It is designed for developers who want to design agent behavior visually, run it locally, inspect every step, and gradually evolve reusable graph templates instead of hiding agent logic inside one opaque loop.

## Quick Start

### Requirements

TooGraph currently runs from source. Before an installer is available, `npm start` does not install system-level runtimes for you. Please install Node.js and Python first.

| Tool | Requirement | Download | Purpose |
| --- | --- | --- | --- |
| Git | Latest stable | https://git-scm.com/downloads | Clone and update the repository |
| Node.js | 20.9+, LTS recommended | https://nodejs.org/en/download | Frontend install, frontend build, and the `npm start` launcher |
| Python | 3.11+ | https://www.python.org/downloads/ | FastAPI backend, backend dependencies, Python Actions, and Tools |

On Windows, it is usually helpful to enable `Add python.exe to PATH` during Python installation. After installation, open a new terminal and check:

```bash
git --version
node -v
npm -v
python --version
```

If your system uses `python3`, check `python3 --version` instead. TooGraph also supports setting a `PYTHON` environment variable to point at a specific Python executable.

### Install And Run

```bash
git clone https://github.com/OoABYSSoO/TooGraph.git
cd TooGraph
npm start
```

Default local URLs:

- TooGraph: http://127.0.0.1:3477
- Health check: http://127.0.0.1:3477/health

When dependencies need to be installed for the first time, the launcher probes available npm and PyPI mirrors, then picks a reachable and responsive source for the current install. The selected registry, index URL, and probe URLs are printed in the terminal.

If you want to pin your own trusted mirrors, you can still use npm and pip configuration:

```bash
npm config set registry https://registry.npmmirror.com
python -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

If your Python command is `python3`:

```bash
python3 -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
```

To run on another port:

```bash
PORT=3999 npm start
```

On Windows PowerShell, if execution policy blocks `npm.ps1`, use:

```powershell
npm.cmd start
```

If Python is not on `PATH`, you can point TooGraph at a specific interpreter:

```powershell
$env:PYTHON = "C:\ProgramData\miniconda3\python.exe"
npm.cmd start
```

You can also point TooGraph at a project-specific Python environment:

```powershell
$env:TOOGRAPH_PYTHON_ENV = "D:\envs\toograph"
npm.cmd start
```

Unix-like environments can use the Bash wrapper:

```bash
./scripts/start.sh
```

## Why TooGraph

Most agent systems become hard to reason about once the loop grows beyond a few tool calls. TooGraph takes the opposite approach: the graph is the agent.

- Agent behavior is represented as visible graph templates.
- Each node has a clear role: input, LLM, condition, tool, subgraph, or output.
- State is schema-backed and inspectable.
- Tool calls and side effects are explicit graph steps.
- Runs produce snapshots, events, artifacts, warnings, errors, and recoverable records.
- Memory, knowledge ingestion, retrieval, and review are modeled as auditable graph flows.

The goal is not just to run an agent. The goal is to make the agent understandable, editable, reviewable, and able to evolve without turning into a hidden script.

## Core Features

### Visual Graph Editor

- Build workflows with `input`, `LLM`, `condition`, `tool`, `subgraph`, and `output` nodes.
- Connect nodes through schema-backed state.
- Separate data flow, execution flow, and conditional branches.
- Use true / false / exhausted branches and loop limits for condition nodes.
- Drag nodes, connect ports, edit node cards, inspect states, and preview outputs.
- Create nodes from an empty canvas, from node ports, from flow ports, or by dragging files into the editor.
- Work with multiple graph tabs, saved graphs, official templates, user templates, and restored run snapshots.
- Use human review pauses when a graph needs user input before continuing.

### Run Inspection

- Save, validate, and run graph documents.
- Execute supported graphs through the LangGraph runtime.
- Inspect run lifecycle, node status, state snapshots, output previews, artifacts, warnings, and errors.
- Continue from checkpoints and pause snapshots.
- Watch live run events through SSE.
- Open detailed run records with graph snapshots, state values, prompt/context audit, child runs, and output artifacts.

### Buddy Agent Workflows

TooGraph includes a Buddy-oriented graph architecture for conversational agent workflows:

- `buddy_autonomous_loop` is the visible Buddy conversation path.
- `buddy_autonomous_review` is the background review path for memory and low-risk writeback.
- Buddy behavior, memory, self-review, capability choice, and context packaging are modeled as graph templates instead of hidden backend policy.
- Buddy Home files live under `buddy_home/` and are not tracked by Git.

### Retrieval, Memory, And Knowledge

TooGraph has a retrieval substrate for memory and knowledge base work:

- Source normalization turns local folders or selected files into structured source packages.
- Chunking tools convert messages or documents into retrieval-ready chunks.
- Ingestion tools write retrieval documents, retrieval chunks, and embedding jobs.
- Embedding jobs are processed by official graph templates and scheduled jobs.
- Retrieval query templates can recall relevant chunks for downstream LLM nodes.
- Knowledge bases are user data and are intentionally ignored by Git.

### Model Providers

Models are configured through the Model Providers page, not through startup environment variables.

Supported provider styles include:

- Local or private OpenAI-compatible gateways.
- LM Studio-style local gateways.
- Cloud providers that expose compatible APIs.
- Login-based provider flows where supported by the app.

TooGraph can select default text and embedding models from saved provider configuration. Embedding vector dimensions are detected from provider responses rather than manually configured.

## Model Providers

For LLM nodes to run, first start a local model gateway or configure a cloud provider. Then open the Model Providers page in TooGraph.

Typical local workflow:

1. Start an OpenAI-compatible gateway.
2. Open TooGraph at http://127.0.0.1:3477.
3. Go to Model Providers.
4. Configure the `local` / LM Studio provider.
5. Use the default local base URL if applicable: `http://127.0.0.1:1234/v1`.
6. Save or discover the model list.
7. Select the default text model and default embedding model.

TooGraph reads only saved provider settings and UI model selections during execution. Startup commands such as `npm start` and `node scripts/start.mjs` do not configure model providers.

If you only want to inspect the UI, edit graphs, or browse existing run records, you can start without configuring a model provider.

## Knowledge Base And Memory

TooGraph separates raw user data from generated retrieval data.

Knowledge base source folders are user-owned local data. They are not tracked by Git. A knowledge base import records a source package, copies or references the selected source according to the configured workflow, and triggers an ingestion graph.

The current knowledge ingestion shape is:

```text
local folder or selected files
-> folder input state
-> knowledge folder normalizer
-> source chunker
-> retrieval ingestion writer
-> embedding jobs
-> embedding processor
-> retrievable knowledge base
```

Memory and knowledge use the same lower-level retrieval substrate, but they should remain logically scoped so conversation memory does not mix with external knowledge base documents.

## First Graph To Try

1. Open http://127.0.0.1:3477.
2. Go to Model Providers and configure at least one chat-capable model provider.
3. Select a default text model. If you want to test retrieval or knowledge base workflows, also select a default embedding model.
4. Go to Editor.
5. Create a minimal `input -> LLM -> output` graph.
6. Put your prompt into the input node.
7. Select a model in the LLM node if the node does not already use the default model.
8. Run the graph and inspect the run detail page.

If you have not configured a model provider yet, start by exploring the built-in templates and editor behavior.

## Graph Templates

TooGraph ships official templates under `graph_template/official/`. Templates are ordinary graph documents with metadata, state schema, nodes, edges, and layout.

Important current templates include:

- `buddy_autonomous_loop`: visible Buddy conversation workflow.
- `buddy_autonomous_review`: background memory review and low-risk writeback workflow.
- `buddy_message_retrieval_ingestion`: message ingestion into the retrieval substrate.
- `embedding_maintenance`: scheduled maintenance for embedding jobs.
- `knowledge_folder_retrieval_ingestion`: folder-to-retrieval ingestion workflow.
- `knowledge_embedding_drain`: event-driven knowledge embedding drain.
- `knowledge_retrieval_qa`: knowledge retrieval and answer preparation workflow.

Official templates can be hidden from normal users while still being available in developer mode when marked as in development.

## Technical Details

### Current Stack

- Frontend: Vue 3, Vite, TypeScript, Pinia, Vue Router, Element Plus, vue-i18n.
- Backend: FastAPI, Pydantic, LangGraph, SQLite FTS, JSON file storage.
- Graph protocol: `node_system`.
- State protocol: `state_schema` is the single source of truth for node inputs and outputs.
- Runtime: FastAPI serves both the UI and API from one local port after frontend build.
- Local runtime data: graphs, presets, runs, settings, Action state, checkpoints, retrieval documents/chunks, and embedding jobs are stored under `backend/data/`.

### Graph Protocol Principles

- The whole graph is the agent. A single LLM node is one model turn.
- An LLM node may use at most one explicit capability source: no capability, one selected Action, or one input `capability` state.
- Manual Action selection is stored as scalar `config.actionKey`, not as a list.
- Dynamic capability execution writes a structured `result_package`.
- Manual graph reuse belongs to Subgraph nodes.
- Durable side effects should be explicit Actions, Tools, graph templates, commands, or permissioned runtime primitives.
- Output nodes display, preview, export, or link results. They should not own hidden persistence policy.

### Local Data And Git Hygiene

TooGraph treats these as local runtime data:

- `backend/data/`
- `buddy_home/`
- `knowledge/`
- `.toograph_*`
- `.dev_*`
- `frontend/dist/`
- `.worktrees/`

Do not commit local settings, generated build output, runtime logs, credentials, machine-specific data, or user knowledge bases unless a task explicitly targets them.

### Logs

Common local log file:

```text
.toograph_server.log
```

## Project Structure

```text
TooGraph/
|-- frontend/
|   |-- src/api/              # Frontend API wrappers
|   |-- src/editor/           # Canvas, nodes, state panels, editor workspace
|   |-- src/i18n/             # UI copy and Element Plus locale integration
|   |-- src/layouts/          # App shell, sidebar, language switch
|   |-- src/pages/            # Home / Editor / Runs / Run Detail / Settings / Knowledge / Local Files
|   |-- src/router/           # Vue Router
|   |-- src/stores/           # Pinia stores
|   |-- src/styles/           # Global style and theme
|   `-- src/types/            # Graph protocol, run state, and API types
|-- backend/
|   |-- app/
|   |   |-- api/              # graphs / runs / templates / settings / actions / tools / buddy / knowledge
|   |   |-- core/compiler/    # node_system validation
|   |   |-- core/langgraph/   # LangGraph runtime, checkpoint, codegen
|   |   |-- core/runtime/     # node execution, state handling, run events
|   |   |-- core/storage/     # SQLite and local storage helpers
|   |   |-- buddy/            # Buddy store, Home files, review summaries
|   |   |-- scheduler/        # Scheduled and event-driven graph jobs
|   |   `-- tools/            # Model providers and built-in runtime helpers
|   `-- tests/
|-- graph_template/
|   `-- official/             # Official graph templates
|-- tool/
|   `-- official/             # Official deterministic tools
|-- action/                   # Action packages
|-- docs/                     # Long-form docs and design notes
|-- buddy_home/               # Local Buddy Home, ignored by Git
|-- knowledge/                # Local user knowledge data, ignored by Git
`-- scripts/                  # Start scripts and maintenance helpers
```

## Roadmap

TooGraph is moving toward a graph-first, auditable agent workspace:

- More complete Buddy autonomous workflows.
- Better graph revision, preview, diff, and undo/redo paths.
- Stronger knowledge base ingestion and retrieval UX.
- More robust embedding job recovery and progress reporting.
- Richer official templates for retrieval, review, and agent capability loops.
- Cleaner packaging for non-developer local installation.

## Community And Videos

- YouTube demo: coming soon
- Bilibili: https://space.bilibili.com/13886340
- Douyin: `56590573478`

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgments

TooGraph builds on Vue, FastAPI, LangGraph, Element Plus, SQLite, and the broader open-source agent tooling ecosystem.
