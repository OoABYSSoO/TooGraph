# Activity Events Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first durable `activity_events` slice cover permission pauses, Skill-provided low-level events, local workspace file/command actions, web search downloads, and graph patch drafts.

**Architecture:** Keep `activity_events` as run-owned audit artifacts produced by runtime and deterministic Skills, not by LLM prose. Runtime will normalize Skill-returned event dictionaries and attach node/subgraph context before publishing them; Skills only return compact event proposals. Buddy command records will carry the same event shape for graph patch drafts until graph patch apply moves into the run command path.

**Tech Stack:** Python runtime and Skill scripts, FastAPI Buddy command route, existing Node test runner for frontend renderers, pytest/unittest backend tests.

---

### Task 1: Normalize Skill-Returned Activity Events

**Files:**
- Modify: `backend/app/core/runtime/activity_events.py`
- Modify: `backend/tests/test_runtime_activity_events.py`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/tests/test_runtime_activity_events.py`:

```python
    def test_record_skill_activity_events_normalizes_skill_payloads(self) -> None:
        state = {"run_id": "run-activity"}
        published: list[tuple[str, str, dict]] = []

        from app.core.runtime.activity_events import record_skill_activity_events

        events = record_skill_activity_events(
            state,
            node_id="execute_capability",
            skill_key="local_workspace_executor",
            binding_source="capability_state",
            raw_events=[
                {
                    "kind": "file_write",
                    "summary": "Editing skill/user/demo/SKILL.md +3 -0",
                    "status": "succeeded",
                    "detail": {"path": "skill/user/demo/SKILL.md", "added": 3, "removed": 0},
                },
                {"summary": "missing kind"},
                "not an event",
            ],
            publish_run_event_func=lambda run_id, event_type, payload=None: published.append(
                (str(run_id), event_type, dict(payload or {}))
            ),
        )

        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["kind"], "file_write")
        self.assertEqual(event["node_id"], "execute_capability")
        self.assertEqual(event["summary"], "Editing skill/user/demo/SKILL.md +3 -0")
        self.assertEqual(event["detail"]["skill_key"], "local_workspace_executor")
        self.assertEqual(event["detail"]["binding_source"], "capability_state")
        self.assertEqual(event["detail"]["path"], "skill/user/demo/SKILL.md")
        self.assertEqual(event["detail"]["added"], 3)
        self.assertEqual(event["detail"]["removed"], 0)
        self.assertEqual(published[0][1], "activity.event")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest backend/tests/test_runtime_activity_events.py -q
```

Expected: fail with `ImportError` or missing `record_skill_activity_events`.

- [ ] **Step 3: Implement normalization**

Add `record_skill_activity_events` to `backend/app/core/runtime/activity_events.py`. It must:

```python
def record_skill_activity_events(
    state: dict[str, Any],
    *,
    node_id: str,
    skill_key: str,
    binding_source: str,
    raw_events: Any,
    publish_run_event_func: Callable[[str | None, str, dict[str, Any] | None], None] | None = None,
) -> list[dict[str, Any]]:
    if not isinstance(raw_events, list):
        return []
    recorded: list[dict[str, Any]] = []
    for raw_event in raw_events:
        if not isinstance(raw_event, dict):
            continue
        kind = _compact_text(raw_event.get("kind"))
        summary = _compact_text(raw_event.get("summary"))
        if not kind or not summary:
            continue
        detail = raw_event.get("detail") if isinstance(raw_event.get("detail"), dict) else {}
        event = record_activity_event(
            state,
            kind=kind,
            summary=summary,
            node_id=_compact_text(raw_event.get("node_id")) or node_id,
            status=_compact_text(raw_event.get("status")) or None,
            duration_ms=_optional_int(raw_event.get("duration_ms")),
            detail={
                "skill_key": skill_key,
                "binding_source": binding_source,
                **detail,
            },
            error=_compact_text(raw_event.get("error")) or None,
            publish_run_event_func=publish_run_event_func,
        )
        recorded.append(event)
    return recorded
```

Also add `_optional_int(value)` returning `int(value)` when possible, otherwise `None`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
python -m pytest backend/tests/test_runtime_activity_events.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/runtime/activity_events.py backend/tests/test_runtime_activity_events.py
git commit -m "规范化技能活动事件"
```

### Task 2: Runtime Permission and Dynamic Capability Events

**Files:**
- Modify: `backend/app/core/runtime/node_handlers.py`
- Modify: `backend/tests/test_node_handlers_runtime.py`

- [ ] **Step 1: Write failing tests**

Add three focused tests to `backend/tests/test_node_handlers_runtime.py`:

1. Extend `test_execute_agent_node_pauses_before_ask_first_risky_dynamic_skill` with a `record_activity_event_func` collector and assert one `permission_pause` event:

```python
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            recorded_events.append(kwargs)
            return {"sequence": len(recorded_events), **kwargs}
```

Pass `record_activity_event_func=record_activity_event_func` to `execute_agent_node`, then assert:

```python
        self.assertEqual(recorded_events[0]["kind"], "permission_pause")
        self.assertEqual(recorded_events[0]["node_id"], "execute_capability")
        self.assertEqual(recorded_events[0]["status"], "awaiting_human")
        self.assertEqual(recorded_events[0]["detail"]["skill_key"], "local_workspace_executor")
        self.assertEqual(recorded_events[0]["detail"]["permissions"], ["file_write", "subprocess"])
```

2. Add `test_execute_agent_node_records_skill_returned_activity_events` using a Skill result with `activity_events`:

```python
    def test_execute_agent_node_records_skill_returned_activity_events(self) -> None:
        # Use the same minimal static Skill setup as test_execute_agent_node_records_skill_activity_event.
        # Return {"echo": "q", "activity_events": [{"kind": "file_read", "summary": "Read docs/a.md", "detail": {"path": "docs/a.md"}}]}.
        # Assert two recorded events: the generic skill_invocation and the file_read event.
```

3. Add `test_execute_agent_node_records_dynamic_subgraph_activity_event` beside the existing subgraph test and assert:

```python
        self.assertEqual(recorded_events[0]["kind"], "subgraph_invocation")
        self.assertEqual(recorded_events[0]["summary"], "Subgraph 'advanced_web_research_loop' succeeded.")
        self.assertEqual(recorded_events[0]["detail"]["capability_key"], "advanced_web_research_loop")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest backend/tests/test_node_handlers_runtime.py -q
```

Expected: fail because permission pause, Skill-returned events, and dynamic subgraph events are not recorded yet.

- [ ] **Step 3: Implement runtime events**

In `backend/app/core/runtime/node_handlers.py`:

- Import `record_skill_activity_events`.
- Before returning `awaiting_human` for risky Skill approval, call `record_activity_event_func` with:

```python
kind="permission_pause",
summary=_permission_pause_activity_summary(skill_key, approval_decision.risky_permissions),
node_id=node_name,
status="awaiting_human",
detail={
    "skill_key": skill_key,
    "binding_source": resolved_binding.source,
    "permissions": approval_decision.risky_permissions,
    "input_keys": sorted(skill_inputs.keys()),
}
```

- After the existing generic `skill_invocation` event, call:

```python
record_skill_activity_events(
    state,
    node_id=node_name,
    skill_key=skill_key,
    binding_source=resolved_binding.source,
    raw_events=skill_result.get("activity_events"),
)
```

Use the injected `record_activity_event_func` path by passing `publish_run_event_func=None` only when using the real recorder. For tests, add a helper that can route Skill-returned events through `record_activity_event_func` directly if needed.

- After dynamic subgraph execution completes or fails, call `record_activity_event_func` with `kind="subgraph_invocation"`, status, duration, template key, input keys, output keys, and error type.

- Add helpers:

```python
def _permission_pause_activity_summary(skill_key: str, permissions: list[str]) -> str:
    permission_label = ", ".join(permissions) or "risky permission"
    return f"Paused for {permission_label} approval before Skill '{skill_key}'."

def _subgraph_invocation_activity_summary(subgraph_key: str, status: str) -> str:
    if status == "failed":
        return f"Subgraph '{subgraph_key}' failed."
    return f"Subgraph '{subgraph_key}' succeeded."
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest backend/tests/test_node_handlers_runtime.py backend/tests/test_runtime_activity_events.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/runtime/node_handlers.py backend/tests/test_node_handlers_runtime.py
git commit -m "记录运行时低层活动事件"
```

### Task 3: Local Workspace Executor Activity Events

**Files:**
- Modify: `skill/official/local_workspace_executor/after_llm.py`
- Modify: `backend/tests/test_local_workspace_executor_skill.py`

- [ ] **Step 1: Write failing tests**

Update existing local workspace executor tests so returned dictionaries include `activity_events`.

For write:

```python
        self.assertEqual(write_result["activity_events"][0]["kind"], "file_write")
        self.assertEqual(write_result["activity_events"][0]["summary"], "Editing backend/data/tmp/note.txt +1 -0")
        self.assertEqual(write_result["activity_events"][0]["detail"]["path"], "backend/data/tmp/note.txt")
```

For read:

```python
        self.assertEqual(read_result["activity_events"][0]["kind"], "file_read")
        self.assertEqual(read_result["activity_events"][0]["detail"]["characters"], len("hello workspace"))
```

For execute:

```python
        self.assertEqual(result["activity_events"][0]["kind"], "command")
        self.assertEqual(result["activity_events"][0]["status"], "succeeded")
        self.assertEqual(result["activity_events"][0]["detail"]["exit_code"], 0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest backend/tests/test_local_workspace_executor_skill.py -q
```

Expected: fail because `activity_events` is not returned.

- [ ] **Step 3: Implement Skill events**

In `skill/official/local_workspace_executor/after_llm.py`:

- Change `_succeeded(result)` and `_failed(error_type, message)` to accept `activity_events: list[dict[str, Any]] | None = None`.
- In `_read_file`, include a `file_read` event with `path` and `characters`.
- In `_write_file`, compute previous and next line counts before writing, then include a `file_write` event:

```python
previous_text = target.read_text(encoding="utf-8", errors="replace") if target.exists() else ""
previous_lines = _line_count(previous_text)
next_lines = _line_count(content)
added = max(next_lines - previous_lines, 0)
removed = max(previous_lines - next_lines, 0)
```

- In `_execute_script`, include a `command` event for success, non-zero exit, and timeout.
- Keep existing `success` and `result` keys unchanged so current graph bindings still work.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest backend/tests/test_local_workspace_executor_skill.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add skill/official/local_workspace_executor/after_llm.py backend/tests/test_local_workspace_executor_skill.py
git commit -m "补充本地工作区技能活动事件"
```

### Task 4: Web Search Download Activity Events

**Files:**
- Modify: `skill/official/web_search/after_llm.py`
- Modify: `backend/tests/test_web_search_skill.py`

- [ ] **Step 1: Write failing tests**

Update web search tests that assert exact result keys from:

```python
self.assertEqual(set(result), {"query", "source_urls", "artifact_paths", "errors"})
```

to:

```python
self.assertEqual(set(result), {"query", "source_urls", "artifact_paths", "errors", "activity_events"})
```

In the artifact test, assert:

```python
        self.assertEqual(result["activity_events"][0]["kind"], "web_search")
        self.assertEqual(result["activity_events"][0]["detail"]["query"], "full article")
        self.assertEqual(result["activity_events"][1]["kind"], "web_download")
        self.assertEqual(result["activity_events"][1]["summary"], "Downloaded 1 source document.")
        self.assertEqual(result["activity_events"][1]["detail"]["downloaded_count"], 1)
```

In the missing query test, assert the returned event is `web_search` with `status="failed"`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python -m pytest backend/tests/test_web_search_skill.py -q
```

Expected: fail because `activity_events` is missing.

- [ ] **Step 3: Implement web events**

In `skill/official/web_search/after_llm.py`:

- Extend `_final_response` with optional `activity_events`.
- For missing query and search failure, return a `web_search` failed event.
- After search normalization, return a `web_search` succeeded event with query, provider, candidate count, and selected source URL count.
- After source document fetches, return a `web_download` event with downloaded count, failed count, artifact paths, and source URLs.
- Keep full page text out of event details.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest backend/tests/test_web_search_skill.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add skill/official/web_search/after_llm.py backend/tests/test_web_search_skill.py
git commit -m "记录联网搜索下载活动事件"
```

### Task 5: Graph Patch Draft Command Event Shape

**Files:**
- Modify: `backend/app/buddy/commands.py`
- Modify: `backend/tests/test_buddy_commands.py`

- [ ] **Step 1: Write the failing test**

In `test_graph_patch_draft_records_approval_command_without_revision`, assert:

```python
        self.assertEqual(body["command"]["activity_event"]["kind"], "graph_patch_draft")
        self.assertEqual(body["command"]["activity_event"]["summary"], "Drafted graph patch for 伙伴对话循环 (1 operation).")
        self.assertEqual(body["command"]["activity_event"]["detail"]["graph_id"], "graph_buddy_loop")
        self.assertEqual(body["command"]["activity_event"]["detail"]["operation_count"], 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python -m pytest backend/tests/test_buddy_commands.py -q
```

Expected: fail because command records do not include `activity_event`.

- [ ] **Step 3: Implement command event**

In `_execute_graph_patch_draft`, build:

```python
activity_event = {
    "kind": "graph_patch_draft",
    "summary": _graph_patch_draft_activity_summary(...),
    "status": "awaiting_approval",
    "detail": {
        "graph_id": graph_id,
        "graph_name": graph_name,
        "operation_count": len(patch),
        "operations": [operation.get("op") for operation in patch],
    },
    "created_at": now,
}
```

Store it under `command["activity_event"]` and mirror it in `result["activity_event"]`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
python -m pytest backend/tests/test_buddy_commands.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/buddy/commands.py backend/tests/test_buddy_commands.py
git commit -m "记录图补丁草案活动事件"
```

### Task 6: Frontend Renderer Guard and Docs

**Files:**
- Modify: `frontend/src/editor/workspace/runActivityModel.test.ts`
- Modify: `docs/current_project_status.md`
- Modify: `docs/future/buddy-autonomous-agent-roadmap.md`

- [ ] **Step 1: Write frontend regression test**

Add a run activity model test with a stored `file_write` event and assert the renderer uses its summary as title and hides raw detail in preview.

```typescript
test("buildRunActivityEntriesFromRun replays file write activity summaries", () => {
  const run = {
    run_id: "run_1",
    artifacts: {
      activity_events: [
        {
          node_id: "execute_capability",
          kind: "file_write",
          summary: "Editing skill/user/demo/SKILL.md +3 -0",
          status: "succeeded",
          detail: { path: "skill/user/demo/SKILL.md", added: 3, removed: 0 },
          sequence: 1,
          created_at: "2026-05-12T01:00:00Z",
        },
      ],
    },
    node_executions: [],
  } as unknown as RunDetail;

  assert.deepEqual(
    buildRunActivityEntriesFromRun(run).map((entry) => ({ title: entry.title, nodeId: entry.nodeId })),
    [{ title: "Editing skill/user/demo/SKILL.md +3 -0", nodeId: "execute_capability" }],
  );
});
```

- [ ] **Step 2: Run frontend test**

Run:

```bash
node --test frontend/src/editor/workspace/runActivityModel.test.ts
```

Expected: pass; this is a regression guard for existing renderer behavior.

- [ ] **Step 3: Update docs**

Update `docs/current_project_status.md` so the current backend section says `activity_events` now covers generic Skill invocation, permission pauses, Skill-returned file/command/web events, and graph patch draft command summaries, while broader coverage remains future work.

Update `docs/future/buddy-autonomous-agent-roadmap.md` priority item 2 from “先覆盖 Skill 执行、文件写入、命令执行、web_search 下载、图编辑草案” to the next remaining stage: file exploration/search, Buddy Home writes, graph patch apply/revision, and broader run detail aggregation.

- [ ] **Step 4: Run doc stale-term check**

Run:

```bash
rg -n "先覆盖 Skill 执行、文件写入、命令执行、`web_search` 下载、图编辑草案" docs/current_project_status.md docs/future/buddy-autonomous-agent-roadmap.md
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor/workspace/runActivityModel.test.ts docs/current_project_status.md docs/future/buddy-autonomous-agent-roadmap.md
git commit -m "更新活动事件状态文档"
```

### Task 7: Final Verification and Integration

**Files:**
- No source edits unless verification exposes a failure.

- [ ] **Step 1: Run backend focused suite**

```bash
python -m pytest \
  backend/tests/test_runtime_activity_events.py \
  backend/tests/test_node_handlers_runtime.py \
  backend/tests/test_local_workspace_executor_skill.py \
  backend/tests/test_web_search_skill.py \
  backend/tests/test_buddy_commands.py \
  -q
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend focused suite**

```bash
node --test \
  frontend/src/editor/workspace/runActivityModel.test.ts \
  frontend/src/buddy/buddyChatGraph.test.ts \
  frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Build frontend**

```bash
cd frontend && npm install && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Restart TooGraph from repository root**

```bash
npm start
curl -fsS http://127.0.0.1:3477/health
```

Expected: health returns `{"status":"ok"}`.

- [ ] **Step 5: Merge and push**

```bash
git checkout main
git pull --ff-only
git merge --ff-only codex/activity-events-foundation
git push origin main
```

Expected: `main` and `origin/main` point to the implementation commits.

---

## Self-Review

- Spec coverage: covers the roadmap first-stage sources named in priority item 2, with graph patch draft represented on Buddy command records until real graph patch apply exists.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation wording remains.
- Type consistency: event dictionaries consistently use `kind`, `summary`, `status`, `detail`, optional `duration_ms`, `error`, and runtime-owned `node_id`, `subgraph_path`, `sequence`, `created_at`.
