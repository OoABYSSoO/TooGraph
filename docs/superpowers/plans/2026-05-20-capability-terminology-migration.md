# Capability Terminology Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Execute this plan task-by-task and keep checkbox status current.

**Goal:** 把 TooGraph 当前混用的 `Skill` 语义迁移到已确定的新边界：Agent/Buddy 操作书叫 `Skill`，当前 LLM 节点挂载的一次性能力调用叫 `Action`，确定性无 LLM 处理节点叫 `Tool`，多节点图模板/子图能力叫 `Subgraph`，上位引用叫 `Capability`。

**Architecture:** 以 `node_system` 和 `state_schema` 为唯一图协议源头。先迁移现有节点能力调用为 Action，再引入 Tool 节点，最后释放 `Skill` 命名给 Agent/Buddy 操作书管理。不要在运行时静默修补旧图协议；官方模板和官方包在仓库内显式迁移，用户旧图通过可见迁移/重建路径处理。

**Tech Stack:** Python/FastAPI/Pydantic backend, TypeScript/Vue frontend, JSON graph templates, Python capability packages, pytest/Vitest/Playwright verification.

## Current Execution Status

As of the Action/Tool migration pass on 2026-05-20:

- The active graph/node capability implementation uses Action terminology: `actionKey`, `actionBindings`, `actionInstructionBlocks`, `action_input`, `action_output`, `selected_actions`, `action_outputs`, and `action_invocation`.
- Current node capability packages live under `action/official` and `action/user`; tracked `skill/` package roots are no longer used for Action packages.
- The graph Tool foundation exists as an independent deterministic path with Tool manifests, Tool registry/API, `tool` nodes, `tool_input`, `tool_output`, `selected_tools`, `tool_outputs`, `tool_invocation`, backend runtime support, and frontend node UI.
- Legacy Skill graph protocol names are rejected by schema/runtime validation and can be migrated explicitly with `scripts/migrate-node-system-actions.mjs`; there is no hidden load-time repair.
- Remaining valid `Skill` wording is limited to historical migration notes, legacy rejection tests, and the future Agent/Buddy operation-book namespace. Video segmenter Tool and a future Agent Skill catalog remain separate follow-up features, not part of this migration closure.

---

## Scan Summary

本次扫描覆盖 backend、frontend、official templates、official packages、docs 和 tests。关键结论：

- 后端协议根在 `backend/app/core/schemas/node_system.py`；当前正式字段仍是 `skillKey`、`skillBindings`、`skillInstructionBlocks`、`skill_input`、`skill_output`。
- 当前 Action 执行链路在 `backend/app/core/runtime/node_handlers.py`、`skill_bindings.py`、`agent_skill_input_generation.py`、`permission_approval.py`、`skill_invocation.py`、`backend/app/skills/*`、`/api/skills`。
- 前端协议镜像在 `frontend/src/types/node-system.ts`；编辑器主变更点在 `frontend/src/lib/graph-document.ts`、`AgentSkillPicker.vue`、`skillPickerModel.ts`、`SkillsPage.vue`、Buddy virtual operation 和 run detail 模型。
- 官方模板持久化旧协议很深：`buddy_autonomous_loop` 里非空 `skillKey` 39 处，`toograph_skill_creation_workflow` 38 处，`toograph_graph_template_creation_workflow` 27 处，`buddy_capability_loop` 26 处。除 `buddy_request_intake` 外，官方模板都有旧 Skill 字段。
- 官方包共有 14 个在 `skill/official/*/skill.json` 下，全部有 `after_llm.py`，其中 5 个有 `before_llm.py`。这些都是当前意义上的 Action 包，不是未来 Agent Skill。
- 仓库内至少有 2717 处当前 Skill 协议相关命中，backend/frontend 测试和源码命中约 1804 处；不能做盲目全局替换。
- `backend/app/tools` 已被模型供应商适配、视频 fallback、ffmpeg 解析等底层 runtime 工具占用。图协议里的 Tool 节点需要独立命名空间，避免代码层把 provider utility 和 graph Tool 混在一起。

---

## Target Public Vocabulary

目标语义固定如下：

| Term | Meaning | Primary Consumer |
| --- | --- | --- |
| `Skill` | Agent/Buddy 可加载的操作书、方法论、上下文说明和资源引用 | Buddy 主 Agent / 通用 Agent |
| `Capability` | 对可执行能力的上位引用值 | graph state / Buddy capability selector |
| `Action` | 当前 LLM 节点绑定的一次能力调用事务：`before_llm -> LLM 参数规划 -> after_llm -> state` | LLM node runtime |
| `Tool` | 无 LLM 的确定性处理节点，如视频分段、OCR、文档切块 | Tool node runtime |
| `Subgraph` | 多节点图模板或可复用子图能力 | Subgraph node / template runner |

目标 `capability` state 值：

```json
{ "kind": "none" }
{ "kind": "action", "key": "web_search", "name": "联网搜索" }
{ "kind": "tool", "key": "video_segmenter", "name": "视频分段" }
{ "kind": "subgraph", "key": "long_video_analysis", "name": "长视频分析" }
```

---

## Target Protocol Names

迁移后的 graph JSON 应使用这些字段：

```json
{
  "config": {
    "actionKey": "web_search",
    "actionBindings": [
      {
        "actionKey": "web_search",
        "outputMapping": { "results": "search_results" }
      }
    ],
    "actionInstructionBlocks": {
      "web_search": {
        "content": "...",
        "source": "node.override"
      }
    }
  }
}
```

State/read binding 目标：

```json
{
  "binding": {
    "kind": "action_input",
    "actionKey": "web_search",
    "fieldKey": "query",
    "managed": true
  }
}
```

```json
{
  "binding": {
    "kind": "action_output",
    "actionKey": "web_search",
    "fieldKey": "results",
    "managed": true
  }
}
```

Run/audit 目标：

```json
{
  "selected_actions": ["web_search"],
  "action_outputs": [
    {
      "action_key": "web_search",
      "status": "succeeded",
      "inputs": {},
      "outputs": {}
    }
  ],
  "activity_events": [
    { "kind": "action_invocation", "summary": "Action 'web_search' succeeded" }
  ]
}
```

审批目标建议直接使用通用 capability 审批，避免 Tool 阶段二次改名：

```json
{
  "kind": "capability_permission_approval",
  "capability_kind": "action",
  "capability_key": "local_workspace_executor",
  "capability_name": "本地工作区执行器",
  "inputs": {},
  "permission_mode": "ask"
}
```

---

## Non-Goals

- 不把视频分段做成 LLM 节点挂载的 Action。
- 不让 LLM 节点直接运行 Tool；Tool 必须是独立节点，过程和 artifact 可审计。
- 不引入 `Workflow` 作为新产品术语；已有机器 ID 里带 `workflow` 的官方模板可以分阶段处理，先改用户可见名称和新建资产命名。
- 不在运行时保留旧 graph 协议的隐式兼容修复。旧官方模板在仓库显式迁移；用户旧图通过可见迁移命令、复制成新版本或重建处理。
- 不把 provider native tool/function calling 当成 TooGraph Tool 节点。Provider tool/function calling 仍是模型调用适配层。

---

## Implementation Route

### Phase 1: Backend Action Protocol Cutover

- [ ] Add backend target schema names in `backend/app/core/schemas/node_system.py`.
  - Rename public model concepts:
    - `NodeSystemAgentSkillBinding` -> `NodeSystemAgentActionBinding`
    - `NodeSystemSkillInstructionBlock` -> `NodeSystemActionInstructionBlock`
    - `NodeSystemAgentConfig.skillKey` -> `actionKey`
    - `skillBindings` -> `actionBindings`
    - `skillInstructionBlocks` -> `actionInstructionBlocks`
    - `NodeSystemStateBindingKind.SKILL_OUTPUT` -> `ACTION_OUTPUT`
    - `NodeSystemReadBindingKind.SKILL_INPUT` -> `ACTION_INPUT`
  - Keep existing node family names unchanged: `agent`, `batch`, `condition`, `input`, `output`, `subgraph`.
  - Add validation errors that explicitly reject old `skillKey`, `skillBindings`, `skill_input`, and `skill_output` in target protocol graphs.

- [ ] Rename backend runtime modules from Skill semantics to Action semantics.
  - `backend/app/core/runtime/skill_bindings.py` -> `action_bindings.py`
  - `backend/app/core/runtime/skill_invocation.py` -> `action_invocation.py`
  - `backend/app/core/runtime/agent_skill_input_generation.py` -> `agent_action_input_generation.py`
  - `backend/app/core/runtime/structured_output.py` helpers: `build_skill_llm_output_schema` -> `build_action_llm_output_schema`
  - `backend/app/core/runtime/node_handlers.py`: rename local variables and returned fields from `selected_skills`/`skill_outputs` to `selected_actions`/`action_outputs`.

- [ ] Rename package domain from Skill to Action.
  - `backend/app/core/schemas/skills.py` -> `backend/app/core/schemas/actions.py`
  - `backend/app/skills/` -> `backend/app/actions/`
  - `SkillDefinition` -> `ActionDefinition`
  - `skillKey` in package schema -> `actionKey`
  - `skill.json` target manifest -> `action.json`
  - `SKILL.md` target package documentation -> `ACTION.md`
  - `skill/official` and `skill/user` target package roots -> `action/official` and `action/user`.

- [ ] Rename backend APIs.
  - `/api/skills` -> `/api/actions`
  - `routes_skills.py` -> `routes_actions.py`
  - `backend/app/main.py` router registration updated.
  - Existing per-package enable/import/file routes keep behavior but expose Action wording and response models.

- [ ] Rename artifact storage to capability-level storage.
  - `backend/app/core/storage/skill_artifact_store.py` -> `capability_artifact_store.py`
  - `/api/skill-artifacts` -> `/api/capability-artifacts`
  - Storage root target: `backend/data/outputs/capability_artifacts`.
  - Artifact metadata must include `capability_kind` and `capability_key`; current Action invocations write `capability_kind: "action"`.

- [ ] Rename approval and audit fields.
  - `skill_permission_approval` -> `capability_permission_approval`
  - `skill_key` -> `capability_key`
  - `skill_inputs` -> `inputs`
  - `skill_invocation` activity events -> `action_invocation`
  - Run schemas in `backend/app/core/schemas/run.py` and runtime state in `backend/app/core/runtime/state.py` use `selected_actions` and `action_outputs`.

- [ ] Update compiler and LangGraph integration.
  - `backend/app/core/compiler/validator.py`: validate `actionKey`, `actionBindings`, `action_input`, `action_output`; dynamic capability execution checks `kind: "action"`.
  - `backend/app/core/langgraph/codegen.py`: export `actionKey`, not `skillKey`.
  - `backend/app/core/langgraph/compiler.py`: collect `action_keys`.
  - `backend/app/core/langgraph/runtime.py`: merge `selected_actions` and `action_outputs`.
  - Preserve special behavior for `toograph_page_operator`, but rename it to Action-specific wording.

- [ ] Update backend tests in the same phase.
  - Rename test files where useful:
    - `test_runtime_skill_bindings.py` -> `test_runtime_action_bindings.py`
    - `test_runtime_skill_invocation.py` -> `test_runtime_action_invocation.py`
    - `test_agent_skill_input_generation.py` -> `test_agent_action_input_generation.py`
    - `test_node_system_validator_skills.py` -> `test_node_system_validator_actions.py`
  - Update assertions for `actionKey`, `action_input`, `action_output`, `selected_actions`, `action_outputs`, `action_invocation`, `capability_permission_approval`.
  - Add negative tests that old graph protocol names are rejected with explicit errors.

Verification for Phase 1:

```bash
pytest backend/tests/test_node_system_validator_actions.py \
  backend/tests/test_runtime_action_bindings.py \
  backend/tests/test_node_handlers_runtime.py \
  backend/tests/test_langgraph_permission_approval.py
```

### Phase 2: Frontend Action UI and Protocol Cutover

- [ ] Update TypeScript protocol types.
  - `frontend/src/types/node-system.ts`:
    - `AgentSkillBinding` -> `AgentActionBinding`
    - `skillKey` -> `actionKey`
    - `skillBindings` -> `actionBindings`
    - `skillInstructionBlocks` -> `actionInstructionBlocks`
    - binding kinds `skill_input`/`skill_output` -> `action_input`/`action_output`
  - `frontend/src/types/skills.ts` -> `frontend/src/types/actions.ts`
  - `frontend/src/types/run.ts`: `selected_actions`, `action_outputs`, `action_results` in context reports.

- [ ] Update frontend API clients.
  - `frontend/src/api/skills.ts` -> `frontend/src/api/actions.ts`
  - `frontend/src/api/skillArtifacts.ts` -> `frontend/src/api/capabilityArtifacts.ts`
  - Update tests beside both files.

- [ ] Rename LLM-node attachment UI.
  - `AgentSkillPicker.vue` -> `AgentActionPicker.vue`
  - `skillPickerModel.ts` -> `actionPickerModel.ts`
  - `AgentNodeBody.vue`: props/events become `select-action`, `update-action-instruction`.
  - UI wording: “Action” for the node-mounted capability, not “Skill”.

- [ ] Rename management page.
  - `SkillsPage.vue` -> `ActionsPage.vue`
  - `skillsPageModel.ts` -> `actionsPageModel.ts`
  - Router/nav labels become “Actions” / “Action 管理”.
  - Keep future “Skills” route unused or reserve it for Agent Skill management; do not point it at current Action packages.

- [ ] Update graph document mutation logic.
  - `frontend/src/lib/graph-document.ts`: all managed binding creators/reconcilers become Action-based.
  - `frontend/src/editor/workspace/statePanelBindings.ts`: managed-state protection recognizes `action_input`, `action_output`, `capability_result`, and later `tool_output`.
  - `frontend/src/lib/agent-capability-management.ts`: dynamic capability executor detection checks `actionKey` absence plus `capability` read.

- [ ] Update Buddy graph edit and virtual operation command protocol.
  - `select_skill` -> `select_action`
  - `skillKey` -> `actionKey`
  - Files:
    - `frontend/src/editor/workspace/graphEditPlaybackModel.ts`
    - `frontend/src/buddy/virtualOperationProtocol.ts`
    - `frontend/src/buddy/BuddyWidget.vue`
  - Update user-facing operation hints and tests.

- [ ] Update run display and i18n.
  - Run detail models consume `action_outputs` and `capability_permission_approval`.
  - Buddy trace and workspace lifecycle tests consume `action_invocation`.
  - `frontend/src/i18n/messages.ts` and `additionalMessages.ts`: current node capability copy becomes Action copy; reserve Skill strings for future Agent Skills.

Verification for Phase 2:

```bash
npm --prefix frontend test -- \
  src/lib/graph-document.test.ts \
  src/editor/nodes/actionPickerModel.test.ts \
  src/pages/actionsPageModel.test.ts \
  src/editor/workspace/graphEditPlaybackModel.test.ts \
  src/buddy/virtualOperationProtocol.test.ts \
  src/pages/runDetailModel.test.ts
```

### Phase 3: Official Action Package and Template Migration

- [ ] Move official packages from `skill/official` to `action/official`.
  - Each package uses:
    - `action.json`
    - `ACTION.md`
    - optional `before_llm.py`
    - `after_llm.py`
    - optional `requirements.txt`
  - Manifest keys:
    - `skillKey` -> `actionKey`
    - `llmInstruction` stays `llmInstruction`
    - `stateInputSchema`, `llmOutputSchema`, `stateOutputSchema`, `permissions`, `runtime` stay structurally equivalent.

- [ ] Rename current official package identities where user-facing names are semantically wrong.
  - `toograph_skill_builder` -> `toograph_action_builder`
  - `toograph_skill_package_reader` -> `toograph_action_package_reader`
  - `toograph_skill_creation_workflow` target label becomes Action creation Subgraph. The stable template ID can remain for one release only if every user-facing string says Action; a full ID rename should be a separate explicit template migration.
  - Do not rename stable IDs containing `workflow` in the same pass unless all references and eval cases are updated in one commit.

- [ ] Migrate official templates.
  - Replace `skillKey` -> `actionKey`.
  - Replace `skillBindings` -> `actionBindings`.
  - Replace `skill_output` -> `action_output`.
  - Replace `skill_input` -> `action_input`.
  - Replace `requiredSkills` -> `requiredActions`.
  - Replace capability payloads and instructions:
    - `kind: "skill"` -> `kind: "action"`.
    - Capability allowed kinds become `action | tool | subgraph | none`.
  - Files with highest priority:
    - `graph_template/official/buddy_autonomous_loop/template.json`
    - `graph_template/official/buddy_capability_loop/template.json`
    - `graph_template/official/toograph_skill_creation_workflow/template.json`
    - `graph_template/official/toograph_graph_template_creation_workflow/template.json`
    - `graph_template/official/buddy_context_fanout/template.json`
    - all business templates that call `buddy_session_recall`.

- [ ] Update eval cases and docs next to templates.
  - `eval_cases.json`: capability kind expectations use `action`, `subgraph`, `none`.
  - README sections “Required Skills/Subgraphs” become “Required Actions/Subgraphs”.

- [ ] Update package authoring docs.
  - `skill/SKILL_AUTHORING_GUIDE.md` should be removed or replaced by `action/ACTION_AUTHORING_GUIDE.md`.
  - Add a short `skill/README.md` only if future Agent Skill package format is introduced in Phase 6.
  - Update `docs/structured-output-and-function-calling.md` to say provider tool/function calling is unrelated to graph Tool nodes.
  - Update `docs/future/buddy-autonomous-agent-roadmap.md` so Action is the one-turn node capability and Skill is the future Agent operation-book capability.

Verification for Phase 3:

```bash
pytest backend/tests/test_template_layouts.py \
  backend/tests/test_skill_manifest_contract.py \
  backend/tests/test_toograph_capability_selector_skill.py
```

After package renames, update test names to Action equivalents and rerun the renamed tests.

### Phase 4: Explicit User Graph Migration Path

- [ ] Add a visible migration helper, not an automatic runtime shim.
  - Candidate location: `scripts/migrate-node-system-actions.mjs` or a backend command exposed through an editor review surface.
  - Input: a graph/template JSON using old `skill*` fields.
  - Output: a new graph/template JSON using Action fields plus a diff report.
  - The helper must not silently mutate saved user graphs during normal load.

- [ ] Add editor-facing validation for old protocol graphs.
  - When a graph contains `skillKey`, `skillBindings`, `skill_input`, `skill_output`, or capability `kind: "skill"`, show a clear “旧 Skill 协议图，需要迁移/重建” error.
  - If a migration helper is available, offer an explicit “复制并迁移” action with review.

- [ ] Decide old run-record behavior separately from graph behavior.
  - Old graph protocols should not run silently.
  - Old run records may be displayed read-only if the UI labels them as legacy. Do not rewrite historical audit payloads without a visible migration step.

Verification for Phase 4:

```bash
pytest backend/tests/test_node_system_validator_actions.py
npm --prefix frontend test -- src/lib/run-restore.test.ts src/pages/runDetailModel.test.ts
```

### Phase 5: Add Graph Tool Node Foundation

- [ ] Reserve product term `Tool` for graph-level deterministic processing.
  - Do not reuse `backend/app/tools` as the graph Tool package registry. That directory already holds model-provider utilities.
  - Suggested backend namespace: `backend/app/node_tools/` or `backend/app/graph_tools/`.
  - Suggested package root: `tool/official` and `tool/user`.

- [ ] Add Tool schema and manifest.
  - Backend schema file: `backend/app/core/schemas/tools.py`.
  - Manifest target:
    ```json
    {
      "toolKey": "video_segmenter",
      "name": "视频分段",
      "description": "把一个视频切成 30 秒以内的短视频片段，供 Batch 节点逐段交给 LLM 分析。",
      "version": "0.1.0",
      "inputSchema": [{ "key": "video", "name": "Video", "valueType": "video" }],
      "outputSchema": [{ "key": "segments", "name": "Segments", "valueType": "json" }],
      "permissions": ["file_read", "file_write", "subprocess"],
      "runtime": { "type": "python" }
    }
    ```
  - Tool package script target can be a fixed `run.py`; do not use `before_llm.py`/`after_llm.py` because Tool has no LLM planning phase.

- [ ] Add Tool node to `node_system`.
  - `NodeSystemNodeType.TOOL = "tool"`
  - `ToolNodeConfig.toolKey`
  - Read binding kind `tool_input`
  - State binding kind `tool_output`
  - Runtime result fields `selected_tools`, `tool_outputs`, activity event `tool_invocation`.

- [ ] Implement backend Tool execution runtime.
  - Validator checks tool exists, enabled, permissions declared, required input states bound.
  - Runtime executes deterministic script once, writes declared outputs to state, records artifacts through capability artifact storage.
  - Permission approval reuses `capability_permission_approval` with `capability_kind: "tool"`.

- [ ] Add frontend Tool node UI.
  - `frontend/src/editor/nodes/ToolNodeBody.vue`
  - Tool picker using shared select component.
  - Managed input/output capsules generated from Tool manifest schemas.
  - Node creation entry and i18n strings.

- [ ] Do not implement video segmentation in this phase unless Tool node foundation is already stable.
  - The first Tool can be a tiny deterministic fixture to validate protocol.
  - Video segmenter should follow as a separate Tool package and template after this foundation passes.

Verification for Phase 5:

```bash
pytest backend/tests/test_node_system_validator_tools.py backend/tests/test_tool_node_runtime.py
npm --prefix frontend test -- src/editor/nodes/ToolNodeBody.structure.test.ts src/lib/graph-document.test.ts
```

### Phase 6: Future Agent Skill Namespace

- [ ] Introduce Agent/Buddy Skill as a separate catalog only after current Action packages no longer live under `skill/`.
  - Suggested package root: `skill/official` and `skill/user`, now freed for real Agent operation-book packages.
  - Suggested API: `/api/agent-skills` or `/api/skills`, but only if `/api/skills` no longer points to Action packages.
  - Package content can center on `SKILL.md`, examples, references, and optional resources. It should not define `stateInputSchema`, `llmOutputSchema`, or `stateOutputSchema` unless the Skill explicitly teaches an Agent how to use graph capabilities.

- [ ] Keep Agent Skill separate from graph execution.
  - Agent Skill helps Buddy plan and act.
  - Agent Skill does not directly write graph state.
  - If a Skill needs execution, it should guide Buddy to select an Action, Tool, or Subgraph capability.

- [ ] Update Buddy capability selector prompts.
  - Capability selector output continues to use `Capability` objects with `kind: action | tool | subgraph | none`.
  - Agent Skill selection, when added, should be a Buddy context-loading decision, not a graph node `capability` state kind.

Verification for Phase 6:

```bash
pytest backend/tests/test_buddy_agent_skill_catalog.py
npm --prefix frontend test -- src/pages/AgentSkillsPage.structure.test.ts
```

### Phase 7: Release Verification and Cleanup

- [ ] Run repository-wide stale protocol checks.

```bash
rg -n 'skillKey|skillBindings|skill_input|skill_output|requiredSkills|selected_skills|skill_outputs|skill_invocation|skill_permission_approval|kind": "skill"' \
  backend/app frontend/src graph_template action tool docs
```

Allowed hits after migration:

- Legacy migration helper tests.
- Historical docs explaining the old-to-new mapping.
- Future Agent Skill docs where `Skill` means operation-book ability.
- Third-party examples or quoted old payloads clearly marked as legacy.

- [ ] Run backend verification.

```bash
pytest backend/tests
```

- [ ] Run frontend verification.

```bash
npm --prefix frontend test
npm --prefix frontend run build
```

- [ ] Run template validation/eval seed checks.

```bash
pytest backend/tests/test_template_layouts.py backend/tests/test_evaluator_official_seed.py
```

- [ ] For UI-impacting phases, start TooGraph and visually inspect.

```bash
npm start
```

Check:

- LLM node Action picker.
- Action management page.
- Run detail activity rows.
- Buddy capability loop trace.
- Template import/open for official templates.
- Tool node UI after Phase 5.

---

## Recommended PR Slicing

1. **PR 1: Backend Action protocol and runtime rename**
   - Backend only, no Tool node.
   - Tests prove old graph protocol names are rejected.

2. **PR 2: Frontend Action UI and run-detail rename**
   - Frontend type/API/UI/test migration.
   - Uses PR 1 API names.

3. **PR 3: Official package/template/doc migration**
   - Move `skill/official` to `action/official`.
   - Update official templates, eval cases, and authoring docs.

4. **PR 4: Explicit legacy graph migration/rebuild helper**
   - Visible conversion command or editor review flow.
   - No hidden load-time repair.

5. **PR 5: Tool node foundation**
   - Schema/runtime/UI/tests for deterministic Tool nodes.
   - No video segmenter yet.

6. **PR 6: Video segmenter Tool and long-video Subgraph template**
   - Build on Tool + Batch + Subgraph semantics.
   - Normal LLM node remains limited to short video; long video uses explicit template.

7. **PR 7: Agent Skill catalog**
   - Only after current package semantics are Action.
   - `Skill` becomes operation-book style capability for Buddy/Agent.

---

## Risk Notes

- The highest breakage risk is official templates, not UI labels. A template with old `skill_output` bindings can pass visual inspection but fail at runtime or produce orphan state.
- Dynamic capability migration must be atomic with Buddy templates. If the selector returns `kind: "action"` but the executor still expects `kind: "skill"`, Buddy capability runs will fail.
- Artifact storage renaming can break old run detail previews. Use capability artifact storage for new runs, and treat historical run records as read-only legacy.
- Stable template IDs with `workflow` in their name should not be renamed casually. Prefer first changing labels/descriptions and new asset naming; rename IDs only in a dedicated template migration with all references updated.
- Do not use a blind text replacement for `skill`; future Agent Skill docs and existing third-party “skill” wording may remain valid.

---

## Done Definition

The migration is complete when:

- New graph JSON contains no current node-capability `skill*` protocol fields.
- LLM nodes mount Actions via `actionKey`, not Skills.
- Dynamic capability kind uses `action`, `tool`, `subgraph`, or `none`.
- Current official packages live as Actions.
- Tool node exists as an independent deterministic node path.
- “Skill” in user-facing product language means Agent/Buddy operation-book ability only.
- Backend tests, frontend tests, template validation, and a visual app check pass.
