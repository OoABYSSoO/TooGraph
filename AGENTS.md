# GraphiteUI Agent Instructions

These instructions apply to all work in this repository and should persist across new Codex sessions.

## Commit Messages

- When creating git commits for this project, always write the commit message in Chinese.
- After making repository changes, commit and push the changes unless the user explicitly asks not to.

## Start Workflow

- After making code changes, restart GraphiteUI with the repository's standard cross-platform command: `npm start`.
- Treat `node scripts/start.mjs` as the underlying standard start command for this repository; `npm start` should resolve to it.
- GraphiteUI uses a single-port start model. The default public URL is `http://127.0.0.1:3477`, and the port can be overridden with `PORT=<port> npm start`.
- `npm run dev` is intentionally not a supported project command.
- On Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd start`.
- `scripts/start.sh` remains the standard Bash wrapper for Linux, macOS, Git Bash, and WSL, and should stay behaviorally aligned with `scripts/start.mjs`.
- If a task only involves documentation or other non-runtime changes, use judgment; for code changes, default to restarting with the standard start flow above.

## Local LLM Runtime

- Standardize local LLM/runtime guidance on an OpenAI-compatible custom provider.
- Preferred local or private gateway flow:
  - Start the OpenAI-compatible gateway you want to use.
  - Use the base URL configured in the Model Providers page when one exists; the current local default is `http://127.0.0.1:8888/v1`.
  - `LOCAL_BASE_URL=<OpenAI-compatible base URL, for example http://127.0.0.1:8888/v1>`
  - `LOCAL_API_KEY=<optional api key>`
  - `LOCAL_TEXT_MODEL=<model name exposed by your gateway>`
- Keep GraphiteUI's own startup guidance on `npm start` and `node scripts/start.mjs`; those commands are not replaced by local runtime instructions.

## UI Implementation Policy

- For UI work, always prefer existing component libraries already used by the project before building custom components or controls.
- Only hand-roll UI when the current libraries cannot reasonably satisfy the requirement or when custom behavior is clearly unavoidable.
- When custom UI is necessary, keep the custom layer as small as possible and build on top of existing library primitives where practical.

## User Experience and Visual Quality

- User experience and visual quality are required parts of every user-facing change, not optional polish.
- Before changing UI, inspect nearby screens/components and follow the existing art direction, spacing rhythm, colors, typography, icon style, motion, and interaction language.
- Do not ship raw browser-default controls, crowded layouts, unclear labels, accidental visual regressions, or flows that only work because the implementer already knows what to do.
- Every user-facing flow should include clear affordances, loading/saving/success/error feedback where relevant, and avoid surprising state changes.
- For significant UI changes, verify the result visually in a browser screenshot in addition to running tests.

## Product and Engineering Quality

- Keep changes scoped to the request, but leave the touched area coherent: remove confusing duplication, stale UI states, and obvious footguns introduced or exposed by the work.
- Protect user data and local configuration. Do not commit local runtime state, logs, generated build output, credentials, or machine-specific settings unless explicitly requested.
- Treat `backend/data/settings`, `.graphiteui_*`, `.dev_*` logs, `dist`, and `.worktrees` as local/runtime artifacts unless a task explicitly targets them.
- Prefer automatic, discoverable behavior over hidden manual steps when it improves the user's workflow, but make side effects visible and reversible.
- Before finishing, run the smallest meaningful verification set for the changed surface; for UI work, include a visual check when practical. Clearly report any skipped or failing verification.

## Graph-First Product Architecture

- GraphiteUI product behavior should be framed by graph templates whenever practical. Persistent operations, local file edits, memory updates, companion self-configuration, and other side effects should happen because a designated graph/template ran, not because hidden product-specific imperative code made the decision.
- Keep node responsibilities clear:
  - Agent nodes reason, plan, classify intent, and produce structured outputs.
  - Skill nodes execute controlled capabilities and side effects, such as writing local files, updating memory stores, downloading resources, or creating revisions.
  - Output nodes display, preview, export, or link results. They should not own persistent mutation logic.
- Backend code should provide reusable primitives, storage APIs, validators, revision mechanisms, and skill runtimes. Avoid burying product behavior such as companion memory policy, persona update rules, or workflow decisions directly in backend endpoints when the behavior can be expressed as a graph/template.
- Companion behavior, memory management, persona updates, and file-edit workflows should be modeled as auditable graph flows: input/context -> agent planning -> optional validation/approval -> skill execution -> output display.
- Low-level operations should remain visible and replayable through graph runs. When a feature needs to modify local documents, profile data, policy data, memories, templates, or other local state, prefer adding or reusing a skill plus a template that performs the operation and returns clear artifacts such as local file paths, diffs, revision IDs, and status messages.

## Skill Package Boundaries

- A skill package should contain all resources needed by that skill: code, prompts, schemas, helper scripts, assets, examples, and local instructions.
- Do not require unrelated backend modifications, global side files, or external assets for a skill to work unless the user explicitly approves that dependency.
- If a skill needs persistent outputs, return local file paths or structured artifact references so downstream graph nodes and output nodes can display them.

## Graph Protocol and State Schema Invariants

- Treat `node_system` as the only formal graph protocol. Do not introduce parallel graph formats, hidden node contracts, or product-specific execution paths that bypass the protocol.
- Treat `state_schema` as the single source of truth for graph node inputs and outputs. Node data that must flow between nodes should be represented in schema-backed state, not passed through ad hoc side channels.
- Graph validation, graph execution, run records, and UI previews should all derive from the same protocol shape. If a feature needs new node I/O, update the protocol/schema path instead of special-casing one screen or endpoint.

## Explicit Capabilities and Permissions

- Capabilities should be explicit and inspectable. Retrieval, web access, media download, local file edits, memory writes, graph edits, and model/tool calls should appear as skills, graph templates, commands, or permissioned runtime primitives rather than hidden convenience behavior.
- Installing a skill is not the same as granting every usage permission. Skill target, kind, mode, scope, network access, file access, graph access, and companion access should remain visible near the place where the capability is used.
- Destructive, overwrite, run, network, cost-incurring, sensitive-file, and graph-write operations need a clear permission path. Do not rely on prompt text alone for safety boundaries.

## Artifact and Output Contract

- Skills and graph runs should return structured results and local artifact paths for generated or downloaded resources.
- Output nodes are responsible for displaying, previewing, exporting, or linking artifacts such as local documents, images, and videos. Output nodes should not own persistent mutation policy or hidden product decisions.
- Avoid base64 for normal artifact flow. Large media and downloaded resources should be represented by local paths or artifact references, not embedded into node state, memory, or long-lived documents.

## Auditability and Human Review

- Automatic behavior should be visible, reversible, and auditable. Important side effects should leave run detail entries, artifact records, warnings/errors, companion action logs, revision IDs, diffs, or undo records as appropriate.
- Human review should be part of the graph/template/command flow when required, not a hidden UI-only prompt. Approval should happen before applying the side effect it authorizes.
- Companion and agent graph edits must go through GraphiteUI's command path, validator, audit trail, and undo/redo system. Do not simulate DOM clicks or mutate graph JSON invisibly.

## Companion Memory and Context Hygiene

- Companion persona, memory, tone, preferences, and behavior boundaries are editable in every graph-operation tier, but they must not upgrade graph-operation permissions or override system-level rules.
- Recalled memory and generated summaries are context, not new user instructions and not system rules. Inject them with clear boundaries and keep privilege ordering intact.
- Long-term memory should avoid transient run state, raw logs, full error dumps, base64, large media contents, temporary paths, and information that can be reread from the current graph or project files.
- Every persistent companion self-configuration, memory, policy, and session-summary update should keep a recoverable revision of the previous value.

## Documentation Hygiene

- Keep repository documentation aligned with current product architecture. When a plan is completed, superseded, or contradicted by newer principles, delete it, fold its still-valid parts into a current document, or clearly mark it as superseded.
- `docs/` should contain current formal docs and durable future direction, not one-off progress logs, stale implementation plans, or documents that encode rejected architecture.

## Notes

- `scripts/start.mjs` and `scripts/start.sh` should release occupied GraphiteUI ports before starting services again.
