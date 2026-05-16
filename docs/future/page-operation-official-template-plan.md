# 页面操作官方模板长期实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan phase-by-phase. Each phase must end with targeted tests, a real TooGraph restart/smoke check when runtime behavior changed, and a Chinese commit message.

**Goal:** Build a complete official page-operation graph template that takes a user intent, operates the current TooGraph UI, and ends only when the user's concrete goal is completed.

**Architecture:** Use the existing `node_system` graph protocol and existing node kinds only: `input`, `agent`, `condition`, `subgraph`, and `output`. The implementation extends the current app-native virtual operation path, page operation book, activity events, and run resume flow so graph templates can request one visible UI operation, wait for the real UI outcome, refresh page context, verify completion, and loop.

**Tech Stack:** Vue 3, Pinia, Element Plus, FastAPI, LangGraph runtime, official Skill packages, official graph templates, existing run/activity event storage.

---

## Non-Negotiables

- Do not add a new graph node type. Existing node kinds are enough.
- Do not bypass TooGraph's graph protocol with hidden imperative Buddy-only behavior.
- Do not use DOM selectors, screen coordinates, screenshots, or external browser automation as the planning surface for the LLM.
- Keep each LLM node to at most one explicit capability source.
- Use `toograph_page_operator` for controlled UI operation requests.
- Use graph templates and subgraphs for multi-step intelligence.
- Every page operation must leave auditable activity events.
- The official template must stop only when a verifier can say the requested goal is complete, or when it reaches a clear, user-visible failure/clarification state.
- Each development phase must be testable, committed, and pushed before moving to the next phase.

## Current Baseline From Code

- `skill/official/toograph_page_operator/` already exists and emits `virtual_ui_operation` activity events.
- `frontend/src/buddy/pageOperationAffordances.ts` already builds a structured page operation book from `data-virtual-affordance-id` elements.
- `frontend/src/buddy/virtualOperationProtocol.ts` already parses `click`, `focus`, `clear`, `type`, `press`, `wait`, and `graph_edit` operations.
- `frontend/src/buddy/BuddyWidget.vue` and `frontend/src/editor/workspace/EditorWorkspaceShell.vue` already consume virtual operation activity events and dispatch visible virtual cursor playback.
- `frontend/src/editor/workspace/graphEditPlaybackModel.ts` already supports semantic graph edit intents, including `subgraph` nodes.
- `GraphLibraryPage`, `RunsPage`, editor tabs, and editor action buttons are not yet fully exposed as semantic page operation affordances.
- `toograph_page_operator` currently accepts only one `click` or `graph_edit` operation per invocation and does not return real UI completion state.
- Run resume and `awaiting_human` already exist and should be reused for operation continuation instead of introducing a new node type.

## Target User Goals

The official template must handle these goal classes:

- View records: open run history, optionally open a specific run detail, restore an editable run snapshot when requested.
- Open a page/tab: navigate to a top-level page, switch editor tabs, open graph/template picker panels, or focus a known editor panel.
- Run a graph: find/open the requested graph, start the run, wait until it reaches a terminal state, and expose a concise result summary.
- Edit a graph: find/open or create the target graph, apply semantic graph edit playback, save when the goal implies persistence, and verify the graph changed.
- Create a graph: create/open a blank graph or template-based graph, optionally apply requested edits, optionally save, and verify the intended canvas exists.

## Completion Semantics

The template is complete only when all of the following are true:

- The latest page snapshot or run result matches the parsed user goal.
- The verifier has written `goal_completed=true`.
- The final output explains what was completed and includes important identifiers such as route, graph name/id, run id, or saved template/graph id when available.

The template is not complete when:

- A virtual operation was merely requested.
- A click happened but the route or selected object did not change as expected.
- A graph run was started but has not reached `completed`, `failed`, or `cancelled`.
- A graph edit was visually played but failed validation, failed application, or was not saved when saving is part of the goal.

## Target Official Template

Template id: `toograph_page_operation_workflow`

Visible name: `操作 TooGraph 页面`

Default graph name: `操作 TooGraph 页面`

Inputs:

- `user_goal` (`text`): user intent.
- `page_context` (`markdown`): human-readable current page context.
- `page_operation_context` (`json`): latest structured operation book and page snapshot. This is updated by frontend resume payloads.
- `conversation_history` (`markdown`, optional): recent instruction context, only for resolving pronouns such as "刚才那个图".

Outputs:

- `final_reply` (`markdown`): user-visible result.
- `operation_report` (`json`, optional but useful in run detail): structured route/run/graph/action outcome.

Core states:

- `goal_plan` (`json`): classified goal, target object hints, required side effects, and success criteria.
- `operation_request` (`json`): the next operation that should be attempted.
- `operation_result` (`json`): latest frontend execution ack, including status, route before/after, target id, errors, triggered run id, and graph edit summary.
- `page_snapshot` (`json`): latest page snapshot after operation.
- `goal_review` (`json`): verifier result with `goal_completed`, `needs_more_operations`, `needs_clarification`, `failure_reason`, `next_requirement`.
- `loop_trace` (`json`): compact list of attempted operations.

Top-level flow:

```text
input_user_goal
  -> classify_goal
  -> operation_loop_subgraph
  -> draft_final_reply
  -> output_final_reply
```

`operation_loop_subgraph` uses only existing node kinds:

```text
plan_next_operation
  -> execute_page_operation_with_toograph_page_operator
  -> pause_for_frontend_virtual_operation
  -> verify_goal_against_refreshed_context
  -> continue_condition
```

The pause is expressed through existing graph run pause/resume mechanics. The frontend auto-resumes only for safe virtual operation continuations that came from `toograph_page_operator`.

## Phase 1: Formalize Virtual Operation Outcome Contract

**Purpose:** Make a page operation request traceable from Skill output to frontend execution and back into graph state.

Files to modify:

- `skill/official/toograph_page_operator/after_llm.py`
- `skill/official/toograph_page_operator/skill.json`
- `skill/official/toograph_page_operator/SKILL.md`
- `frontend/src/buddy/virtualOperationProtocol.ts`
- `frontend/src/buddy/virtualOperationProtocol.test.ts`
- `frontend/src/types/run.ts`
- `backend/app/core/runtime/activity_events.py`
- `backend/tests/test_toograph_page_operator_skill.py`

Implementation:

- Add a stable `operation_request_id` to every successful `virtual_ui_operation` event.
- Add `expected_continuation` detail:
  - `mode: "auto_resume_after_ui_operation"`
  - `resume_state_keys: ["page_operation_context", "page_context", "operation_result"]`
- Keep LLM output unchanged; the id and continuation metadata are generated deterministically by the Skill/runtime.
- Keep one operation per Skill call.
- Ensure activity events include enough node/run context for the frontend to resume the correct run.

Tests:

- Backend: `py -3 -m pytest backend/tests/test_toograph_page_operator_skill.py -q`
- Frontend: `node --test frontend/src/buddy/virtualOperationProtocol.test.ts`
- Build: `cd frontend; npm run build`

Commit:

```text
建立页面操作结果协议
```

## Phase 2: Add Frontend Operation Ack And Auto-Resume

**Purpose:** Let a paused graph continue with fresh UI state after the real UI operation finishes.

Files to modify:

- `frontend/src/stores/buddyMascotDebug.ts`
- `frontend/src/buddy/BuddyWidget.vue`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`
- `frontend/src/api/runs.ts`
- `backend/app/api/routes_runs.py`
- `backend/app/core/langgraph/runtime.py`
- `backend/tests/test_langgraph_runtime_setup.py`
- `backend/tests/test_langgraph_runtime_progress_events.py`
- `frontend/src/buddy/BuddyWidget.structure.test.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.structure.test.ts`

Implementation:

- When a `virtual_ui_operation` event includes `expected_continuation`, execute it visibly as today.
- Capture an `operation_result` object:
  - `operation_request_id`
  - `status: "succeeded" | "failed" | "interrupted"`
  - `target_id`
  - `commands`
  - `route_before`
  - `route_after`
  - `page_snapshot_before`
  - `page_snapshot_after`
  - `triggered_run_id`
  - `graph_edit_summary`
  - `error`
- After execution, rebuild page operation context using `buildPageOperationRuntimeContext`.
- Resume the paused run with:
  - `operation_result`
  - refreshed `page_context`
  - refreshed `page_operation_context`
- Auto-resume only when the paused run metadata confirms the pending continuation belongs to the same `operation_request_id`.
- If the operation is interrupted by the stop button, resume only if the graph expects failure handling; otherwise leave the run paused with a clear message.

Tests:

- Backend targeted resume tests: `py -3 -m pytest backend/tests/test_langgraph_runtime_setup.py backend/tests/test_langgraph_runtime_progress_events.py -q`
- Frontend structure and model tests for event-to-resume wiring.
- Build: `cd frontend; npm run build`
- Runtime smoke: `npm.cmd start`, run a simple page-operation graph that navigates to `/runs`, verify the graph resumes with route `/runs`.

Commit:

```text
接通页面操作自动恢复
```

## Phase 3: Expand Semantic Affordance Coverage

**Purpose:** Give the operation template enough stable UI targets to accomplish real goals.

Files to modify:

- `frontend/src/layouts/AppShell.vue`
- `frontend/src/pages/GraphLibraryPage.vue`
- `frontend/src/pages/RunsPage.vue`
- `frontend/src/pages/RunDetailPage.vue`
- `frontend/src/editor/workspace/EditorTabBar.vue`
- `frontend/src/editor/workspace/EditorTabLauncherPanel.vue`
- `frontend/src/editor/workspace/EditorActionCapsule.vue`
- `frontend/src/editor/canvas/EditorCanvas.vue`
- Related structure tests in the same folders.

Affordance ids to add:

- `library.action.newBlankGraph`
- `library.action.importPython`
- `library.template.<templateId>.open`
- `library.graph.<graphId>.open`
- `library.search.query`
- `library.filter.status.<status>`
- `runs.run.<runId>.openDetail`
- `runs.run.<runId>.restoreEdit`
- `runs.run.<runId>.restoreTarget.<targetKey>`
- `runs.filter.status.<status>`
- `runs.search.graphName`
- `runs.action.refresh`
- `runDetail.action.restoreEdit`
- `editor.tab.<tabId>.activate`
- `editor.tab.<tabId>.close`
- `editor.launcher.open`
- `editor.launcher.createNew`
- `editor.launcher.openGraph.<graphId>`
- `editor.launcher.createFromTemplate.<templateId>`
- `editor.action.runActiveGraph`
- `editor.action.saveActiveGraph`
- `editor.action.validateActiveGraph`
- `editor.action.toggleRunActivity`
- `editor.action.toggleStatePanel`

Safety:

- Mark destructive or irreversible actions with `data-virtual-affordance-requires-confirmation="true"` or `data-virtual-affordance-destructive="true"`.
- Keep Buddy self surfaces forbidden.
- Do not expose hidden disabled controls as allowed operations.

Tests:

- `node --test frontend/src/layouts/AppShell.structure.test.ts`
- `node --test frontend/src/pages/GraphLibraryPage.structure.test.ts`
- `node --test frontend/src/pages/RunsPage.structure.test.ts`
- `node --test frontend/src/editor/workspace/EditorTabBar.structure.test.ts`
- `node --test frontend/src/editor/workspace/EditorActionCapsule.structure.test.ts`
- Build: `cd frontend; npm run build`
- Runtime smoke: use the operation book display/context to verify card and action targets appear on `/library`, `/runs`, and `/editor`.

Commit:

```text
补齐页面操作语义目标
```

## Phase 4: Expand `toograph_page_operator`

**Purpose:** Allow the Skill to execute the operations the frontend already understands.

Files to modify:

- `skill/official/toograph_page_operator/before_llm.py`
- `skill/official/toograph_page_operator/after_llm.py`
- `skill/official/toograph_page_operator/skill.json`
- `skill/official/toograph_page_operator/SKILL.md`
- `backend/tests/test_toograph_page_operator_skill.py`
- `frontend/src/buddy/virtualOperationProtocol.ts`
- `frontend/src/buddy/virtualOperationProtocol.test.ts`

Implementation:

- Accept `click`, `focus`, `clear`, `type`, `press`, `wait`, and `graph_edit` commands when they come from the current operation book.
- Preserve one operation per Skill invocation.
- Add text input validation using the operation book's `inputs`.
- Support `graph_edit` intents with `nodeType: "subgraph"` to match the editor playback model.
- Reject commands not present in the latest operation book unless they are the built-in safe wait command.
- Return clear recoverable errors for stale affordances, missing inputs, and unsupported graph edit intents.

Tests:

- Backend: `py -3 -m pytest backend/tests/test_toograph_page_operator_skill.py -q`
- Frontend: `node --test frontend/src/buddy/virtualOperationProtocol.test.ts`
- Build: `cd frontend; npm run build`

Commit:

```text
扩展页面操作器命令范围
```

## Phase 5: Add Page Goal Observation And Verification Inputs

**Purpose:** Give the graph enough structured evidence to decide whether the user's goal is done.

Files to modify:

- `frontend/src/buddy/pageOperationAffordances.ts`
- `frontend/src/buddy/buddyPageContext.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- `frontend/src/buddy/BuddyWidget.vue`
- `frontend/src/pages/runDetailModel.ts`
- `frontend/src/editor/workspace/runActivityModel.ts`
- Related tests.

Implementation:

- Extend page operation runtime context with structured page facts:
  - current route
  - current page title
  - active editor tab id/title/kind
  - active graph id/name/dirty status
  - visible graph/template/run cards with ids and labels
  - latest foreground run id/status/result summary when available
  - latest operation result
- Keep `page_context` as readable markdown for LLMs, but put machine-checkable data in `page_operation_context`.
- Add a compact `operation_report` helper projection for run details.

Tests:

- `node --test frontend/src/buddy/pageOperationAffordances.test.ts`
- `node --test frontend/src/buddy/buddyPageContext.test.ts`
- `node --test frontend/src/editor/workspace/runActivityModel.test.ts`
- Build: `cd frontend; npm run build`

Commit:

```text
增加页面目标验证上下文
```

## Phase 6: Attribute Graph Runs Triggered By Virtual Operations

**Purpose:** Make "run this graph" verifiable rather than just clicking the run button.

Files to modify:

- `frontend/src/editor/workspace/useWorkspaceRunController.ts`
- `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- `frontend/src/buddy/BuddyWidget.vue`
- `frontend/src/stores/buddyMascotDebug.ts`
- `frontend/src/types/run.ts`
- Related tests.

Implementation:

- When a virtual operation clicks `editor.action.runActiveGraph`, link the next run created from that editor tab to the operation result.
- Store `triggered_run_id`, `triggered_graph_id`, and initial run status in `operation_result`.
- Keep watching the triggered run until terminal status when the operation template goal requires run completion.
- Add a small frontend wait/observe loop for run completion, then auto-resume the operation workflow with updated run detail summary.

Tests:

- `node --test frontend/src/editor/workspace/useWorkspaceRunController.test.ts`
- `node --test frontend/src/editor/workspace/useWorkspaceRunLifecycleController.test.ts`
- Build: `cd frontend; npm run build`
- Runtime smoke: open a known small graph, ask the workflow to run it, verify final reply includes run id and terminal status.

Commit:

```text
归因虚拟操作触发的图运行
```

## Phase 7: Build The Official Graph Template

**Purpose:** Add the graph template users and Buddy can run as an enabled capability.

Files to create:

- `graph_template/official/toograph_page_operation_workflow/template.json`

Files to modify:

- `backend/tests/test_template_layouts.py`
- `backend/tests/test_run_graph_snapshot.py`
- `docs/current_project_status.md`
- `docs/future/buddy-autonomous-agent-roadmap.md`

Template structure:

- `input_user_goal` writes `user_goal`.
- `input_page_context` writes `page_context`.
- `input_page_operation_context` writes `page_operation_context`.
- `classify_goal` writes `goal_plan`.
- `operation_loop` is a `subgraph` node that:
  - plans next operation from `goal_plan`, `page_operation_context`, `operation_result`, and `loop_trace`;
  - invokes `toograph_page_operator`;
  - pauses for frontend virtual operation continuation;
  - verifies goal completion after resume;
  - loops through a condition node with a conservative loop limit.
- `draft_final_reply` writes `final_reply`.
- `output_final_reply` displays `final_reply`.
- Optional `output_operation_report` displays `operation_report`.

Verifier behavior:

- For record viewing: complete when route and selected run detail match target.
- For tab opening: complete when active tab/route matches target.
- For new graph: complete when active editor canvas is a blank or requested template draft.
- For graph editing: complete when graph edit playback applied and expected graph facts changed.
- For graph running: complete when triggered run reaches terminal state and result summary is available.

Tests:

- `py -3 -m pytest backend/tests/test_template_layouts.py::TemplateLayoutTests -q`
- `py -3 -m pytest backend/tests/test_run_graph_snapshot.py -q`
- `py -3 -m pytest backend/tests/test_node_system_validator_skills.py -q`
- Build: `cd frontend; npm run build`

Commit:

```text
新增页面操作官方模板
```

## Phase 8: End-To-End Goal Flows

**Purpose:** Make the feature real, not just structurally valid.

Add or update tests and smoke scripts for:

- "打开运行记录"
- "打开某个运行详情"
- "打开图与模板页面"
- "新建一个空白图"
- "打开名为 X 的图"
- "运行当前图并告诉我结果"
- "新建一个包含输入、LLM、输出的图"
- "编辑当前图，给某个节点改名"

Files likely to modify:

- `frontend/src/buddy/BuddyWidget.structure.test.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.structure.test.ts`
- `frontend/src/buddy/pageOperationAffordances.test.ts`
- `backend/tests/test_template_layouts.py`
- Add focused model tests where new pure helpers are introduced.

Manual verification:

1. Run `npm.cmd start`.
2. Open `http://127.0.0.1:3477`.
3. Run the official template from the editor with a direct input first.
4. Bind it as a Buddy capability/template candidate only after direct editor runs work.
5. Verify the virtual cursor operates visibly.
6. Verify the graph run does not finish until the requested UI goal is truly complete.
7. Verify stop button interruption is respected and does not get auto-resumed as success.

Commit:

```text
验证页面操作模板端到端流程
```

## Phase 9: Documentation, Capability Selection, And Product Polish

**Purpose:** Make the feature discoverable and safe to use.

Files to modify:

- `docs/current_project_status.md`
- `docs/future/buddy-autonomous-agent-roadmap.md`
- `skill/official/toograph_page_operator/SKILL.md`
- `graph_template/official/toograph_page_operation_workflow/template.json`
- Capability selector tests if candidate scoring needs updates.

Implementation:

- Document that `toograph_page_operation_workflow` is the official page-operation template.
- Make sure the capability selector can discover it for page operation goals.
- Keep Buddy self-surface restrictions explicit.
- Add concise failure messages for impossible goals:
  - missing target graph
  - no matching run record
  - stale page snapshot
  - blocked destructive action
  - run failed
  - operation interrupted

Tests:

- `py -3 -m pytest backend/tests/test_toograph_capability_selector_skill.py -q`
- `py -3 -m pytest backend/tests/test_template_layouts.py -q`
- Build: `cd frontend; npm run build`
- Runtime smoke with Buddy: ask Buddy to open a page, run a graph, and create a simple graph.

Commit:

```text
完善页面操作模板文档和发现能力
```

## Phase 10: Final Hardening

**Purpose:** Close reliability gaps before declaring the plan complete.

Checklist:

- Full backend tests: `py -3 -m pytest backend/tests -q`
- Full frontend structure/model tests:
  - PowerShell: `Get-ChildItem frontend/src -Recurse -Filter *.test.ts | ForEach-Object { $_.FullName } | node --test`
  - Bash equivalent: `node --test $(find frontend/src -name '*.test.ts' -print)`
- Frontend build: `cd frontend; npm run build`
- Restart: `npm.cmd start`
- Visual smoke on:
  - `/library`
  - `/runs`
  - `/editor`
  - Buddy floating window operation flow
- Confirm no local artifacts are staged:
  - `backend/data/settings`
  - `.toograph_*`
  - `.dev_*`
  - `frontend/dist`
  - `.worktrees`
  - `buddy_home`
  - root `package-lock.json` unless explicitly intended.

Commit:

```text
完成页面操作模板硬化验证
```

## Suggested Development Order

1. Complete Phase 1 and Phase 2 before adding more affordances. Without ack/resume, the template cannot know whether a goal is done.
2. Complete Phase 3 before expanding goal classes. Without stable affordances, the LLM will not have trustworthy targets.
3. Complete Phase 4 before template creation. The template depends on `toograph_page_operator` being able to use the operation book.
4. Complete Phase 5 and Phase 6 before claiming graph running is supported.
5. Add the official template only after direct operation-loop mechanics work in a small test graph.
6. Bind or advertise the official template to Buddy after the template works from the editor.

## Risks And Mitigations

- **Stale page snapshots:** Require every operation continuation to refresh `page_operation_context` before verification.
- **Wrong target clicked:** Use stable semantic affordance ids and labels; verifier checks route/object identity after the click.
- **Run starts asynchronously:** Attribute the next editor run to the virtual operation request id and wait for terminal status.
- **Graph edit playback succeeds visually but not structurally:** Apply graph edit commands through the existing graph mutation path and verify document facts after application.
- **User interrupts operation:** Mark `operation_result.status="interrupted"` and let the graph produce a clear non-success final reply.
- **Capability selector loops into itself:** Ensure template metadata and selector instructions avoid choosing the currently running page-operation workflow as a nested capability unless explicitly intended.
- **Over-broad permissions:** Keep destructive operations blocked unless the existing approval path handles them.

## Definition Of Done

- `toograph_page_operation_workflow` exists as an official visible template.
- The template uses only existing node types.
- The template can open pages, open tabs, view run records, create graphs, edit graphs, and run graphs from user intent.
- Every operation is visible through the virtual cursor or graph edit playback.
- The graph run waits for real UI completion and resumes with fresh page context.
- The final reply is emitted only after verifier success or a clear terminal failure.
- Activity events show request, execution, outcome, retry/failure, and triggered run attribution.
- Targeted tests and runtime smoke checks pass for every phase.
- Final full backend/frontend verification passes.

## Plan Self-Review

- No new graph node type is required.
- The plan uses existing Skill, Subgraph, Condition, Output, and run resume mechanisms.
- Each phase has a test command and a commit boundary.
- The official template is created only after the operation loop can truly close.
- Known gaps from the current codebase are mapped to explicit phases.
