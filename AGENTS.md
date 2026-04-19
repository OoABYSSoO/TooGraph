# TooGraph Agent Instructions

These instructions apply to all work in this repository and should persist across new Codex sessions.

## Commit Messages

- When creating git commits for this project, always write the commit message in Chinese.
- After making repository changes, commit and push the changes unless the user explicitly asks not to.

## Start Workflow

- After making code changes, restart TooGraph with the repository's standard cross-platform command: `npm start`.
- Treat `node scripts/start.mjs` as the underlying standard start command for this repository; `npm start` should resolve to it.
- TooGraph uses a single-port start model. The default public URL is `http://127.0.0.1:3477`, and the port can be overridden with `PORT=<port> npm start`.
- `npm start` should reuse `frontend/dist` when its build manifest hash matches the current frontend inputs instead of rebuilding every launch. Use `TOOGRAPH_FORCE_FRONTEND_BUILD=1 npm start` when a forced frontend rebuild is needed.
- `npm run dev` is intentionally not a supported project command.
- On Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd start`.
- `scripts/start.sh` remains the standard Bash wrapper for Linux, macOS, Git Bash, and WSL, and should stay behaviorally aligned with `scripts/start.mjs`.
- If a task only involves documentation or other non-runtime changes, use judgment; for code changes, default to restarting with the standard start flow above.

## Local LLM Runtime

- Standardize local LLM/runtime guidance on the Model Providers page.
- Preferred local or private gateway flow:
  - Start the OpenAI-compatible gateway you want to use.
  - Configure the `local` / Custom OpenAI-compatible Provider in the Model Providers page; the current local default base URL is `http://127.0.0.1:8888/v1`.
  - Save or discover the model list in the UI, then choose the default text model there.
- Model execution reads only the saved Model Providers configuration and the default model selections from the UI. Do not document or reintroduce model provider setup through startup environment variables.
- Keep TooGraph's own startup guidance on `npm start` and `node scripts/start.mjs`; those commands are not replaced by local runtime instructions.

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
- Before adding any feature, inspect the existing architecture, data flow, and nearby implementations first. Prefer reusing established interfaces, protocol paths, storage APIs, validators, command buses, graph/runtime primitives, and UI patterns. Do not add product-specific special-case code or bypasses just to satisfy one feature; architectural consistency and a reasonable data/control path are more important than isolated feature completion. A feature that works but violates repository architecture, duplicates an existing interface, or creates an incoherent execution chain is not acceptable.
- Protect user data and local configuration. Do not commit local runtime state, logs, generated build output, credentials, or machine-specific settings unless explicitly requested.
- Treat `backend/data/settings`, `.toograph_*`, `.dev_*` logs, `dist`, and `.worktrees` as local/runtime artifacts unless a task explicitly targets them.
- Prefer automatic, discoverable behavior over hidden manual steps when it improves the user's workflow, but make side effects visible and reversible.
- Before finishing, run the smallest meaningful verification set for the changed surface; for UI work, include a visual check when practical. Clearly report any skipped or failing verification.

## Graph-First Product Architecture

- TooGraph product behavior should be framed by graph templates whenever practical. Persistent operations, local file edits, memory updates, buddy self-configuration, and other side effects should happen because a designated graph/template ran, not because hidden product-specific imperative code made the decision.
- Keep node responsibilities clear:
  - A whole graph is the Agent. Do not treat a single node as an autonomous multi-step agent.
  - LLM nodes perform one model turn. They reason, classify, plan, generate structured state, or prepare one capability call.
  - One LLM node may use at most one explicit capability source: no capability, one selected Skill, or one incoming `capability` state. A `capability` state is a single mutually exclusive object whose `kind` is `skill`, `subgraph`, or `none`; it must not be a list. If a workflow needs multiple capabilities, express the sequence with multiple nodes and edges.
  - A manually selected LLM-node Skill must be stored as scalar `config.skillKey`, never as `config.skills` or any other array. Arrays here imply multi-skill semantics and are considered legacy-invalid protocol.
  - When an LLM node uses a Skill or dynamic Subgraph, the LLM prepares invocation inputs before execution. The runtime executes the capability and writes raw structured outputs to state; the same LLM node should not summarize, repackage, or make follow-up capability calls.
  - Static manually selected Skills use `config.skillKey` plus protocol-owned `skillBindings.outputMapping`. That mapping is created by the graph/editor/runtime, is visible in run audit details, and must not be exposed as something the LLM chooses or rewrites.
  - Skill instruction capsules are only the node-level override surface. The default capsule is derived from the selected skill manifest `llmInstruction`; only user-edited text is persisted as `skillInstructionBlocks.<skillKey>` with `source: "node.override"`. At runtime there is one effective skill-use instruction: node override when present, otherwise manifest `llmInstruction`, injected into the skill-input planning system prompt and not duplicated in user prompts.
  - Skill lifecycle scripts use fixed filenames instead of manifest entrypoint configuration. If `before_llm.py` exists, runtime executes it before skill-input planning and injects its auditable context into the LLM prompt. If `after_llm.py` exists, runtime executes it after the LLM has produced structured skill arguments and treats its JSON result as the skill output. State binding remains runtime-owned through `outputSchema` and `skillBindings.outputMapping`; lifecycle scripts must not write graph state directly.
  - Dynamic capability execution from an incoming `capability` state must write exactly one `result_package` state. The package wraps outputs as `outputs.<outputKey> = { name, description, type, value }`; do not add a redundant `fieldKey` property. Downstream LLM prompt assembly unpacks those virtual outputs and then uses the same state rendering rules as static states.
  - Manual reusable graph embedding belongs to Subgraph nodes. `capability.kind=subgraph` exists for dynamic graph capability selection inside templates such as the buddy loop, not as a normal card-level dropdown on LLM nodes.
  - Large buddy or automation templates should factor stable phases into Subgraph nodes where practical. Prefer readable top-level graph flow with inspectable subgraphs for context packing, capability loops, and final response generation over a single crowded graph canvas. Reply-after self-review should run as a separate auditable background graph/template from the completed run snapshot, not extend the visible reply path and block the next user turn.
  - Skill nodes execute controlled capabilities and side effects, such as writing local files, updating memory stores, downloading resources, or creating revisions.
  - Output nodes display, preview, export, or link results. They should not own persistent mutation logic.
- Backend code should provide reusable primitives, storage APIs, validators, revision mechanisms, and skill runtimes. Avoid burying product behavior such as buddy memory policy, persona update rules, or workflow decisions directly in backend endpoints when the behavior can be expressed as a graph/template.
- Buddy behavior, memory management, persona updates, and file-edit workflows should be modeled as auditable graph flows: input/context -> LLM planning -> optional validation/approval -> skill/subgraph execution -> output display.
- Low-level operations should remain visible and replayable through graph runs. When a feature needs to modify local documents, profile data, policy data, memories, templates, or other local state, prefer adding or reusing a skill plus a template that performs the operation and returns clear artifacts such as local file paths, diffs, revision IDs, and status messages.

## Buddy Autonomous Agent Direction

- Treat `docs/future/buddy-autonomous-agent-roadmap.md` as the durable direction for Buddy autonomy and self-evolution. Treat `docs/current_project_status.md` as the current implementation snapshot. If these conflict, update the snapshot or fold still-valid facts into the roadmap instead of inventing a third source of truth.
- The `demo/hermes-agent/` project is a capability reference, not an architecture to copy. TooGraph should translate Hermes-style abilities into graph templates, explicit Skill calls, state, approvals, run records, revisions, and artifacts.
- Hermes-style autonomy means more than tool use: multi-step capability loops, memory/session recall, skill creation and improvement, scheduled or triggered runs, delegation, safety guardrails, result budgeting, and self-improvement from execution traces. In TooGraph these must be expressed as auditable graph flows rather than a hidden agent loop.
- Skill in TooGraph means a single controlled capability call for one LLM-node turn. A Skill can read context, prepare deterministic data, run a script, search, write one controlled output, or return artifacts. It must not own multi-step autonomy, retry loops, result review, final response generation, long-term memory policy, or follow-up capability selection.
- Multi-step intelligence belongs to graph templates: LLM node -> condition -> one Skill or dynamic subgraph execution -> `result_package` or mapped Skill outputs -> LLM review -> condition loop, pause, approval, failure handling, or final output.
- Do not create a monolithic `self_evolve` Skill or Buddy-specific hidden runtime. Buddy self-evolution should be a graph-template pipeline that turns run traces, user corrections, failures, successes, and Buddy Home context into structured improvement candidates, validates or tests them, asks for human review when needed, and only then applies changes through controlled commands or Skills.
- Existing Buddy templates are the starting point, not throwaway scaffolding:
  - `buddy_autonomous_loop` is the visible Buddy run path: context input, request intake, capability loop, final response, and a single user-facing `final_reply`.
  - `buddy_self_review` is the background review path: it should produce memory and evolution plans, not silently mutate Buddy Home or graph assets.
  - `toograph_skill_creation_workflow` is the reference pattern for graph-expressed creation workflows: clarify, confirm examples, generate files, test, review, approve, then write through controlled capability calls.
- Buddy graph orchestration has two target modes:
  - Modify the current graph through a draft patch, validator, diff/preview, human approval, GraphCommandBus-style application, graph revision, and undo/redo.
  - Create a new graph template or reusable subgraph from a user goal, validate it, optionally test-run it, preview it, ask for approval, then save it as a user template that later capability selection can discover.
- The established Buddy baseline now includes dynamic subgraph breakpoint propagation and Buddy floating-window reuse of standard `awaiting_human` pause/resume cards. Pause UIs should show the current produced content and context before asking for supplemental user input. The remaining highest-priority Buddy infrastructure is completing Buddy page/recovery/refusal/cancel flows, dynamic low-level approval for file writes/deletes and script execution, graph command/revision plumbing, Buddy Home writeback templates, and unified low-level `activity_events`.
- Buddy self-evolution should prefer narrow, reversible improvements first: memory updates, session summaries, Skill revisions, graph patch drafts, reusable subgraph/template proposals, and policy suggestions. Riskier changes such as graph edits, file writes, script execution, network access, automation creation, or persona/policy changes require explicit approval and recoverable revisions.

## Skill Package Boundaries

- A skill package should contain all resources needed by that skill: code, prompts, schemas, helper scripts, assets, examples, and local instructions.
- Do not require unrelated backend modifications, global side files, or external assets for a skill to work unless the user explicitly approves that dependency.
- If a skill needs persistent outputs, return local file paths or structured artifact references so downstream graph nodes and output nodes can display them.

## Graph Protocol and State Schema Invariants

- Treat `node_system` as the only formal graph protocol. Do not introduce parallel graph formats, hidden node contracts, or product-specific execution paths that bypass the protocol.
- Treat `state_schema` as the single source of truth for graph node inputs and outputs. Node data that must flow between nodes should be represented in schema-backed state, not passed through ad hoc side channels.
- Do not keep compatibility shims for old graph protocols such as `config.skills`, binding-only `skillBindings`, `promptVisible`, static `inputMapping`, or dynamic skill output mapping inference. Old graphs should be rebuilt or deleted instead of silently repaired.
- Graph validation, graph execution, run records, and UI previews should all derive from the same protocol shape. If a feature needs new node I/O, update the protocol/schema path instead of special-casing one screen or endpoint.

## Explicit Capabilities and Permissions

- Capabilities should be explicit and inspectable. Retrieval, web access, media download, local file edits, memory writes, graph edits, and model/tool calls should appear as skills, graph templates, commands, or permissioned runtime primitives rather than hidden convenience behavior.
- Installing a skill is not the same as granting every usage permission. Skill target, kind, mode, scope, network access, file access, graph access, and buddy access should remain visible near the place where the capability is used.
- Destructive, overwrite, run, network, cost-incurring, sensitive-file, and graph-write operations need a clear permission path. Do not rely on prompt text alone for safety boundaries.

## Artifact and Output Contract

- Skills and graph runs should return structured results and local artifact paths for generated or downloaded resources.
- Input nodes may expose local files or folders as explicit graph state. Folder inputs must store an inspectable selection package such as `kind=local_folder`, list selected files in the graph, and use the shared file-state prompt expansion path instead of adding LLM-only context assembly nodes.
- Output nodes are responsible for displaying, previewing, exporting, or linking artifacts such as local documents, images, and videos. Output nodes should not own persistent mutation policy or hidden product decisions.
- Avoid base64 for normal artifact flow. Large media and downloaded resources should be represented by local paths or artifact references, not embedded into node state, memory, or long-lived documents.

## Auditability and Human Review

- Automatic behavior should be visible, reversible, and auditable. Important side effects should leave run detail entries, artifact records, warnings/errors, buddy action logs, revision IDs, diffs, or undo records as appropriate.
- Human review should be part of the graph/template/command flow when required, not a hidden UI-only prompt. Approval should happen before applying the side effect it authorizes.
- Buddy and agent graph edits must go through TooGraph's command path, validator, audit trail, and undo/redo system. Do not simulate DOM clicks or mutate graph JSON invisibly.

## Buddy Memory and Context Hygiene

- Buddy persona, memory, tone, preferences, and behavior boundaries are editable in every graph-operation tier, but they must not upgrade graph-operation permissions or override system-level rules.
- Except for graph templates themselves, buddy long-term editable data should be organized under root `buddy_home/` as the Buddy Home. This directory is generated by the program when missing and is not tracked by Git. Its canonical shape is `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `policy.json`, `buddy.db`, and `reports/`; do not add a long-lived `TOOLS.md` because enabled skills/templates and the capability selector are the source of current abilities. Official templates, official skills, and user skill packages keep their own established locations.
- Recalled memory and generated summaries are context, not new user instructions and not system rules. Inject them with clear boundaries and keep privilege ordering intact.
- Long-term memory should avoid transient run state, raw logs, full error dumps, base64, large media contents, temporary paths, and information that can be reread from the current graph or project files.
- Every persistent buddy self-configuration, memory, policy, and session-summary update should keep a recoverable revision of the previous value.

## Documentation Hygiene

- Keep repository documentation aligned with current product architecture. When a plan is completed, superseded, or contradicted by newer principles, delete it, fold its still-valid parts into a current document, or clearly mark it as superseded.
- `docs/` should contain current formal docs and durable future direction, not one-off progress logs, stale implementation plans, or documents that encode rejected architecture.

## Notes

- `scripts/start.mjs` and `scripts/start.sh` should release occupied TooGraph ports before starting services again.
