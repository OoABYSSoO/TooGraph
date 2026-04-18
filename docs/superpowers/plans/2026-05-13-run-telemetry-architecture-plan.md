# Run Telemetry Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TooGraph run telemetry authoritative, replayable, and shared by canvas nodes, output nodes, Buddy chat output cards, run detail, and activity history without adding product-specific timing channels.

**Architecture:** Backend writes durable execution facts into the existing run record as soon as a node starts, then updates the same execution record when that attempt completes, fails, or pauses. Frontend treats `GET /api/runs/{run_id}` as the authoritative restore source and SSE as live acceleration only; canvas and Buddy both project timing from the same run facts and state events. Output node timing is state availability timing: from the upstream writer execution start to the matching state update that the parent output node reads.

**Tech Stack:** Python FastAPI runtime, LangGraph runtime adapter, existing run store and SSE event stream, Vue 3, TypeScript, Element Plus, Node test runner, pytest/unittest.

---

## Current Decision

本计划处理的是运行遥测链路，不重新设计 Buddy 主循环模板，也不新增单独的计时接口。保留现有三条运行入口和读取路径：

- `POST /api/graphs/run`: 创建 run，并启动后台执行。
- `GET /api/runs/{run_id}`: 返回可恢复、可回放、可刷新后的权威 run detail。
- `GET /api/runs/{run_id}/events`: 提供实时增量事件，加快 UI 响应。

计时胶囊、Buddy 输出耗时、Run Detail 活动历史都必须从同一份 run detail 和同一条 SSE 事件语义投影出来。不能为了 Buddy、画布胶囊、运行记录恢复分别新增特殊数据通道。

## Current Code Audit

### Backend

- `backend/app/api/routes_graphs.py`
  - `run_graph_endpoint` 创建 `run_state`，初始化 `runtime_backend`、`metadata`、`graph_snapshot` 和 `node_status_map` 后保存 run。
  - 后台通过 `_run_graph_worker` 执行图。

- `backend/app/api/routes_runs.py`
  - `GET /api/runs/{run_id}` 返回 `RunDetail`。
  - `GET /api/runs/{run_id}/events` 订阅当前进程内的 live SSE。这个流目前不是事件日志，也没有 replay backlog。

- `backend/app/core/runtime/run_events.py`
  - 只管理内存订阅者和当前 live publish。
  - 本轮不把它升级成持久事件日志，避免把“恢复来源”拆成第二套事实源。

- `backend/app/core/langgraph/runtime.py`
  - `_build_langgraph_node_callable` 在节点开始时发布 `node.started`，设置 `node_status_map[node_id] = "running"`，并持久化进度。
  - 但当前 `node_executions` 只在节点结束、失败、暂停时追加；`started_at` 和 `finished_at` 都在结束路径调用 `utc_now_iso()`，所以持久记录里的 `started_at` 不是实际开始时间。
  - condition route 会发布 `node.started` / `node.completed`，但不写入 `node_executions`，刷新后 condition 节点没有可恢复的计时事实。

- `backend/app/core/langgraph/compiler.py`
  - LangGraph runtime nodes 只包含可执行节点，output 节点不是实际执行节点。
  - output 边界在 finalization 里由 `collect_output_boundaries` 处理。因此 output 计时不能被建模成“output 节点执行时长”，只能建模成“这个 output 读取的 state 何时可用”。

- `backend/app/core/runtime/state_io.py`
  - `apply_state_writes` 已经写入 `state_events`，包含 `node_id`、`state_key`、`output_key`、`value`、`created_at`、`sequence`。
  - 这是 output 计时结束点的现有权威事实。

- `backend/app/core/runtime/run_artifacts.py`
  - `artifacts` 已包含 `activity_events`、`output_previews`、`node_outputs`、`active_edge_ids`、`state_events`、`state_values`、`streaming_outputs` 等。
  - 当前不需要新增 `node_timing` artifact；应先让 `node_executions` 和 `state_events` 足够表达恢复事实。

- `backend/app/core/runtime/run_recovery.py`
  - 服务重启时会把 active run 标记失败，并追加一个失败 `node_executions`。
  - 当运行中 execution 记录存在后，恢复逻辑应优先更新已有 running execution，而不是再追加重复失败记录。

### Frontend

- `frontend/src/editor/workspace/useWorkspaceRunController.ts`
  - 启动 run 后清理 queued visual state，再启动 SSE 和轮询。

- `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`
  - 同时使用 EventSource 和 `fetchRun` 轮询。
  - 这条设计可以保留：SSE 提供快响应，轮询和 run detail 负责最终一致性。

- `frontend/src/editor/workspace/runNodeTimingModel.ts`
  - live 计时使用前端 `performance.now()` 收到 `node.started` 的时间。
  - restore 计时从 `node_executions.duration_ms` 和 `state_events` 派生。
  - 当前无法从持久 run detail 恢复一个正在运行的节点，因为后端没有在节点开始时写 running execution。
  - output restore 当前退化为 writer execution duration，不能精确表达“state 什么时候写出”。

- `frontend/src/buddy/buddyPublicOutput.ts`
  - Buddy 已经只扫描父图 root-level output 节点，子图内部 output 不会直接进入聊天窗口。
  - Buddy live output timing 和 canvas output timing 是两套近似逻辑，后续应合并到共享投影。

- `frontend/src/buddy/BuddyWidget.vue`
  - Buddy 自己启动 run、监听 SSE、轮询 run detail，并把父图 output 节点变成多条聊天输出。
  - `buildPublicOutputRuntimeStateFromRunDetail` 已经试图从 `node_executions` 和 `state_events` 恢复 output 消息，但后端 `started_at` 不准确时只能回退到 writer duration。

- `frontend/src/editor/workspace/runActivityModel.ts`
  - live activity 会展示 `node.started` / `node.completed` / `node.failed`。
  - restore activity 只从 `state_events` 和 `activity_events` 构建，刷新后节点开始/完成历史会消失。

## Protocol Decisions

1. `RunDetail` 是恢复和运行记录的权威事实源。
   - UI 可以先消费 SSE，但只要刷新页面、打开历史记录、从运行记录恢复编辑，都必须能靠 `GET /api/runs/{run_id}` 重建合理显示。

2. SSE 是 live acceleration，不是唯一事实源。
   - 如果页面错过 `node.started`，下一次轮询到 run detail 后仍应显示正在运行的计时胶囊。
   - 本轮不做 SSE replay backlog。

3. `node_executions` 表示节点执行 attempt。
   - 节点开始时写入一条 `status = "running"` 的 attempt。
   - 节点成功、失败、暂停时更新同一条 attempt。
   - 循环图中同一个 `node_id` 可以有多条 attempt。画布默认展示该节点最后一条 attempt，Run Detail 保留全部 attempt。

4. output 节点不是执行节点。
   - output timing 是 availability timing。
   - 对于一个 output 节点，它有且只有一个输入 state；耗时起点是写入该 state 的 writer attempt `started_at`，终点是对应 `state_events.created_at`。
   - Buddy 聊天窗口只显示父图用 output 节点导出的内容，子图 output 不直接显示。

5. 不新增 Buddy 专用接口。
   - Buddy 和画布都应复用 run detail、SSE 事件、graph snapshot、state schema、state events、node executions。

6. 不做每秒持久化。
   - 运行中的动态时间由前端根据 `started_at` 和当前时间计算。
   - 后端只在节点开始、状态写入、节点结束/失败/暂停、run 生命周期变化时持久化。

## File Structure

- Create `backend/app/core/runtime/node_execution_records.py`
  - Central helper for creating and updating node execution attempt records.
  - Keeps runtime, recovery, condition routes, and pause paths from each hand-writing execution dictionaries.

- Modify `backend/app/core/langgraph/runtime.py`
  - Use the helper when agent/subgraph/condition nodes start and finish.
  - Publish `node.started` with the same `started_at` written to `node_executions`.
  - Update paused and failed paths in place.

- Modify `backend/app/core/runtime/run_recovery.py`
  - When interrupting active runs, update the latest running execution for `current_node_id` if it exists.
  - Append an interrupted record only when no matching running attempt exists.

- Modify `backend/app/core/schemas/run.py`
  - Add optional `execution_id` and `attempt` to `NodeExecutionDetail`.
  - Keep existing fields compatible for old run records.

- Modify `backend/tests/test_langgraph_runtime_progress_events.py`
  - Add tests for persisted running executions, true started timestamps, and condition execution records.

- Modify `backend/tests/test_run_startup_recovery.py`
  - Add tests for updating existing running execution during startup recovery.

- Create `frontend/src/lib/runTelemetryProjection.ts`
  - Shared projection helpers for node timings and output availability timings.
  - Consumed by editor timing model and Buddy output model.

- Modify `frontend/src/editor/workspace/runNodeTimingModel.ts`
  - Wrap or re-export shared projection helpers.
  - Move from `performance.now()` semantics to epoch-millisecond semantics based on `Date.now()`.

- Modify `frontend/src/editor/workspace/runNodeTimingModel.test.ts`
  - Cover live events, restore from running execution, restore from completed execution, and output availability timing.

- Modify `frontend/src/editor/nodes/NodeCard.vue`
  - Read the migrated timing shape.
  - Keep the current visual capsule behavior, but compute running elapsed time from epoch milliseconds.

- Modify `frontend/src/buddy/buddyPublicOutput.ts`
  - Reuse shared output timing projection.
  - Keep root-only output binding discovery.

- Modify `frontend/src/buddy/buddyPublicOutput.test.ts`
  - Cover restored output duration from `writer.started_at -> state_event.created_at`.

- Modify `frontend/src/buddy/BuddyWidget.vue`
  - Use shared projection during run detail reconciliation.
  - Keep Buddy chat driven only by parent graph output nodes.

- Modify `frontend/src/editor/workspace/runActivityModel.ts`
  - Build restored node started/completed/failed entries from `node_executions`.

- Modify `frontend/src/editor/workspace/runActivityModel.test.ts`
  - Cover restored activity history containing node start, state update, node completion, and activity events in chronological order.

- Modify `frontend/src/types/run.ts`
  - Add optional `execution_id` and `attempt` fields to `NodeExecutionDetail`.

## Data Contract

### Node Execution Attempt

The backend should write records in this shape:

```python
{
    "execution_id": "agent_answer:1",
    "attempt": 1,
    "node_id": "agent_answer",
    "node_type": "agent",
    "status": "running",
    "started_at": "2026-05-13T10:00:00.000000+00:00",
    "finished_at": None,
    "duration_ms": 0,
    "input_summary": "",
    "output_summary": "",
    "artifacts": {
        "family": "agent",
        "iteration": 1,
        "inputs": {},
        "outputs": {},
        "state_reads": [],
        "state_writes": [],
    },
    "warnings": [],
    "errors": [],
}
```

On completion, failure, or pause, update the same dictionary:

```python
execution.update(
    {
        "status": "success",
        "finished_at": "2026-05-13T10:00:03.250000+00:00",
        "duration_ms": 3250,
        "input_summary": "...",
        "output_summary": "...",
        "artifacts": {
            **execution.get("artifacts", {}),
            "inputs": input_values,
            "outputs": outputs,
            "state_reads": state_reads,
            "state_writes": state_writes,
        },
        "warnings": body.get("warnings", []),
        "errors": [],
    }
)
```

### Frontend Timing Shape

Use one time domain in frontend timing records:

```ts
export type RunNodeTiming = {
  status: "running" | "success" | "failed" | "paused";
  startedAtEpochMs: number | null;
  durationMs: number | null;
};
```

For running records:

```ts
const elapsedMs =
  timing.status === "running" && timing.startedAtEpochMs !== null
    ? Math.max(0, Date.now() - timing.startedAtEpochMs)
    : timing.durationMs;
```

Do not mix `performance.now()` with persisted ISO timestamps. `performance.now()` is only valid inside one page lifetime and cannot restore historical runs.

### Output Availability Timing

For an output node reading state `reply`:

```ts
const stateEvent = lastStateEventForState(run.artifacts.state_events, "reply");
const writerExecution = lastExecutionBefore(
  run.node_executions,
  stateEvent.node_id,
  stateEvent.created_at,
);
const durationMs = Date.parse(stateEvent.created_at) - Date.parse(writerExecution.started_at);
```

Fallback rules:

- If `state_event.created_at` or `writerExecution.started_at` is missing, use `writerExecution.duration_ms`.
- If both are missing, show no output duration instead of inventing one.
- If the duration is negative because of a malformed old run record, clamp to `0` and keep the original raw facts unchanged.

## Task 1: Backend Tests for Durable Node Execution Facts

**Files:**
- Modify: `backend/tests/test_langgraph_runtime_progress_events.py`
- Modify: `backend/tests/test_run_startup_recovery.py`

- [ ] **Step 1: Add a progress persistence test for running executions**

In `backend/tests/test_langgraph_runtime_progress_events.py`, add imports:

```python
import copy
from datetime import datetime
```

Add this test method to `LangGraphRuntimeProgressEventTests`:

```python
def test_langgraph_runtime_persists_running_execution_before_node_finishes(self) -> None:
    graph = NodeSystemGraphDocument.model_validate(
        {
            "graph_id": "graph_running_timing",
            "name": "Running Timing Graph",
            "state_schema": {
                "question": {"name": "Question", "type": "text", "value": "Abyss"},
                "answer": {"name": "Answer", "type": "text"},
            },
            "nodes": {
                "input_question": {
                    "kind": "input",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "writes": [{"state": "question"}],
                },
                "agent_answer": {
                    "kind": "agent",
                    "ui": {"position": {"x": 240, "y": 0}},
                    "reads": [{"state": "question"}],
                    "writes": [{"state": "answer"}],
                    "config": {"taskInstruction": "Say hello.", "skillKey": ""},
                },
                "output_answer": {
                    "kind": "output",
                    "ui": {"position": {"x": 480, "y": 0}},
                    "reads": [{"state": "answer"}],
                },
            },
            "edges": [
                {"source": "input_question", "target": "agent_answer"},
                {"source": "agent_answer", "target": "output_answer"},
            ],
            "conditional_edges": [],
        }
    )
    saved_states: list[dict] = []

    def capture_save(run: dict) -> None:
        saved_states.append(copy.deepcopy(run))

    with patch("app.core.runtime.node_system_executor.save_run", side_effect=capture_save), patch(
        "app.core.langgraph.runtime.save_run", side_effect=capture_save
    ), patch("app.core.runtime.node_system_executor.chat_with_model_ref_with_meta") as chat, patch(
        "app.core.runtime.node_system_executor._chat_with_local_model_with_meta"
    ) as local_chat:
        chat.return_value = ('{"answer":"Hello, Abyss!"}', {"warnings": [], "model": "test"})
        local_chat.return_value = ('{"answer":"Hello, Abyss!"}', {"warnings": [], "model": "test"})
        execute_node_system_graph_langgraph(
            graph,
            {"run_id": "run_running_timing", "status": "running"},
            persist_progress=True,
        )

    running_snapshot = next(
        snapshot
        for snapshot in saved_states
        if any(
            execution.get("node_id") == "agent_answer" and execution.get("status") == "running"
            for execution in snapshot.get("node_executions", [])
        )
    )
    running_execution = next(
        execution
        for execution in running_snapshot["node_executions"]
        if execution["node_id"] == "agent_answer" and execution["status"] == "running"
    )
    self.assertIsNotNone(running_execution["started_at"])
    self.assertIsNone(running_execution["finished_at"])
    self.assertEqual(running_execution["duration_ms"], 0)

    final_execution = [
        execution
        for execution in saved_states[-1]["node_executions"]
        if execution.get("node_id") == "agent_answer"
    ][-1]
    self.assertEqual(final_execution["status"], "success")
    self.assertIsNotNone(final_execution["finished_at"])
    self.assertEqual(final_execution["started_at"], running_execution["started_at"])
    self.assertGreaterEqual(
        datetime.fromisoformat(final_execution["finished_at"]),
        datetime.fromisoformat(final_execution["started_at"]),
    )
```

- [ ] **Step 2: Add a condition execution record test**

In the existing `test_langgraph_runtime_publishes_condition_duration`, after the `execute_node_system_graph_langgraph` call, keep the returned value:

```python
result = execute_node_system_graph_langgraph(
    graph,
    {"run_id": "run_condition", "status": "running"},
    persist_progress=False,
)
```

Then assert the condition execution exists:

```python
condition_execution = next(
    execution
    for execution in result["node_executions"]
    if execution["node_id"] == "judge_answer"
)
self.assertEqual(condition_execution["node_type"], "condition")
self.assertEqual(condition_execution["status"], "success")
self.assertEqual(condition_execution["artifacts"]["selected_branch"], "true")
self.assertIsNotNone(condition_execution["started_at"])
self.assertIsNotNone(condition_execution["finished_at"])
```

- [ ] **Step 3: Add startup recovery test for updating an existing running execution**

In `backend/tests/test_run_startup_recovery.py`, add a new test:

```python
def test_mark_interrupted_active_runs_updates_existing_running_execution(self) -> None:
    active_run = {
        "run_id": "run_active",
        "status": "running",
        "current_node_id": "agent_a",
        "graph_snapshot": {"nodes": {"agent_a": {"kind": "agent"}}},
        "node_status_map": {"agent_a": "running"},
        "node_executions": [
            {
                "execution_id": "agent_a:1",
                "attempt": 1,
                "node_id": "agent_a",
                "node_type": "agent",
                "status": "running",
                "started_at": "2026-05-04T11:29:55+00:00",
                "finished_at": None,
                "duration_ms": 0,
                "input_summary": "",
                "output_summary": "",
                "artifacts": {"family": "agent"},
                "warnings": [],
                "errors": [],
            }
        ],
        "errors": [],
        "warnings": [],
        "completed_at": None,
        "lifecycle": {"updated_at": "old"},
    }

    interrupted_count = mark_interrupted_active_runs(
        list_runs_func=lambda: [active_run],
        save_run_func=lambda _run: None,
        now_func=lambda: "2026-05-04T11:30:00+00:00",
    )

    self.assertEqual(interrupted_count, 1)
    self.assertEqual(len(active_run["node_executions"]), 1)
    execution = active_run["node_executions"][0]
    self.assertEqual(execution["status"], "failed")
    self.assertEqual(execution["finished_at"], "2026-05-04T11:30:00+00:00")
    self.assertEqual(execution["duration_ms"], 5000)
    self.assertEqual(execution["errors"], ["Run was interrupted because the backend service restarted before it completed."])
```

- [ ] **Step 4: Run the focused failing tests**

Run:

```bash
python -m pytest backend/tests/test_langgraph_runtime_progress_events.py backend/tests/test_run_startup_recovery.py -q
```

Expected before implementation:

- Running execution test fails because no `running` execution record is persisted.
- Condition execution test fails because condition nodes are not recorded in `node_executions`.
- Startup recovery test fails because recovery appends a second interrupted execution instead of updating the running one.

- [ ] **Step 5: Commit only the failing tests**

```bash
git add backend/tests/test_langgraph_runtime_progress_events.py backend/tests/test_run_startup_recovery.py
git commit -m "补充运行计时持久化测试"
git push
```

## Task 2: Backend Execution Record Helper and Runtime Integration

**Files:**
- Create: `backend/app/core/runtime/node_execution_records.py`
- Modify: `backend/app/core/langgraph/runtime.py`
- Modify: `backend/app/core/runtime/run_recovery.py`
- Modify: `backend/app/core/schemas/run.py`
- Modify: `frontend/src/types/run.ts`

- [ ] **Step 1: Create the execution record helper**

Create `backend/app/core/runtime/node_execution_records.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.runtime.state import utc_now_iso

INTERRUPTED_RUN_MESSAGE = "Run was interrupted because the backend service restarted before it completed."


def start_node_execution(
    state: dict[str, Any],
    *,
    node_id: str,
    node_type: str,
    started_at: str | None = None,
    iteration: int | None = None,
    artifacts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    executions = state.setdefault("node_executions", [])
    if not isinstance(executions, list):
        state["node_executions"] = []
        executions = state["node_executions"]
    attempt = sum(1 for item in executions if isinstance(item, dict) and item.get("node_id") == node_id) + 1
    execution = {
        "execution_id": f"{node_id}:{len(executions) + 1}",
        "attempt": attempt,
        "node_id": node_id,
        "node_type": node_type,
        "status": "running",
        "started_at": started_at or utc_now_iso(),
        "finished_at": None,
        "duration_ms": 0,
        "input_summary": "",
        "output_summary": "",
        "artifacts": {
            "family": node_type,
            "iteration": iteration,
            "inputs": {},
            "outputs": {},
            "state_reads": [],
            "state_writes": [],
            **dict(artifacts or {}),
        },
        "warnings": [],
        "errors": [],
    }
    executions.append(execution)
    return execution


def finish_node_execution(
    execution: dict[str, Any],
    *,
    status: str,
    finished_at: str | None = None,
    duration_ms: int | None = None,
    input_summary: str = "",
    output_summary: str = "",
    artifacts: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
    errors: list[str] | None = None,
) -> dict[str, Any]:
    resolved_finished_at = finished_at or utc_now_iso()
    execution["status"] = status
    execution["finished_at"] = resolved_finished_at
    execution["duration_ms"] = (
        max(int(duration_ms), 0)
        if duration_ms is not None
        else duration_between_iso_ms(execution.get("started_at"), resolved_finished_at)
    )
    execution["input_summary"] = input_summary
    execution["output_summary"] = output_summary
    execution["artifacts"] = {
        **dict(execution.get("artifacts") or {}),
        **dict(artifacts or {}),
    }
    execution["warnings"] = list(warnings or [])
    execution["errors"] = list(errors or [])
    return execution


def find_latest_running_execution(state: dict[str, Any], node_id: str) -> dict[str, Any] | None:
    executions = state.get("node_executions")
    if not isinstance(executions, list):
        return None
    for execution in reversed(executions):
        if not isinstance(execution, dict):
            continue
        if execution.get("node_id") == node_id and execution.get("status") == "running":
            return execution
    return None


def duration_between_iso_ms(started_at: Any, finished_at: Any) -> int:
    try:
        started = datetime.fromisoformat(str(started_at))
        finished = datetime.fromisoformat(str(finished_at))
    except (TypeError, ValueError):
        return 0
    return max(int((finished - started).total_seconds() * 1000), 0)
```

- [ ] **Step 2: Wire helper into agent/subgraph node runtime start**

In `backend/app/core/langgraph/runtime.py`, import:

```python
from app.core.runtime.node_execution_records import finish_node_execution, start_node_execution
```

Inside `_build_langgraph_node_callable._call`, replace the current start block with this shape:

```python
node_started_perf = time.perf_counter()
node_started_at = utc_now_iso()
iteration = _current_cycle_iteration(cycle_tracker)
node_execution = start_node_execution(
    state,
    node_id=node_name,
    node_type=node.kind,
    started_at=node_started_at,
    iteration=iteration,
)
state["current_node_id"] = node_name
state["node_status_map"][node_name] = "running"
_record_subgraph_node_status(state, node_name, "running")
touch_run_lifecycle(state)
state["state_values"] = {
    **dict(state.get("state_values", {})),
    **dict(current_values or {}),
}
publish_run_event(
    str(state.get("run_id") or ""),
    "node.started",
    {
        "node_id": node_name,
        "node_type": node.kind,
        "status": "running",
        "started_at": node_started_at,
        **_subgraph_event_context(state),
    },
)
```

Remove the later duplicate `iteration = _current_cycle_iteration(cycle_tracker)` assignment inside the `try` block.

- [ ] **Step 3: Update success path in place**

Replace the success-path `state["node_executions"] = [*state.get(...), {...}]` append with:

```python
finish_node_execution(
    node_execution,
    status="success",
    duration_ms=duration_ms,
    input_summary=_summarize_values(input_values),
    output_summary=_summarize_values(outputs, body.get("final_result")),
    artifacts={
        "inputs": input_values,
        "outputs": outputs,
        "family": node.kind,
        "iteration": iteration,
        "subgraph": body.get("subgraph"),
        "selected_branch": body.get("selected_branch"),
        "response": body.get("response"),
        "reasoning": body.get("reasoning"),
        "runtime_config": body.get("runtime_config"),
        "selected_capabilities": body.get("selected_capabilities", []),
        "capability_outputs": body.get("capability_outputs", []),
        "state_reads": state_reads,
        "state_writes": state_writes,
    },
    warnings=body.get("warnings", []),
    errors=[],
)
```

Keep `node.completed` payload unchanged except that `started_at` may optionally be included:

```python
"started_at": node_execution.get("started_at"),
```

- [ ] **Step 4: Update pause paths in place**

Change `_apply_subgraph_waiting_parent_state` and `_apply_permission_approval_waiting_state` signatures to accept `node_execution: dict[str, Any]`.

Replace their `state["node_executions"] = [*state.get(...), {...}]` append blocks with `finish_node_execution(...)`.

For subgraph breakpoint pause:

```python
finish_node_execution(
    node_execution,
    status="paused",
    duration_ms=duration_ms,
    input_summary=_summarize_values(subgraph_artifact.get("input_values", {})),
    output_summary="",
    artifacts={
        "inputs": subgraph_artifact.get("input_values", {}),
        "outputs": {},
        "family": node.kind,
        "subgraph": subgraph_artifact,
        "state_reads": state_reads,
        "state_writes": [],
    },
    warnings=body.get("warnings", []),
    errors=[],
)
```

For permission approval pause:

```python
finish_node_execution(
    node_execution,
    status="paused",
    duration_ms=duration_ms,
    input_summary=_summarize_values(pending.get("skill_inputs", {})),
    output_summary="",
    artifacts={
        "inputs": pending.get("skill_inputs", {}),
        "outputs": {},
        "family": node.kind,
        "state_reads": state_reads,
        "state_writes": [],
        "permission_approval": pending,
        "selected_capabilities": body.get("selected_capabilities", []),
        "capability_outputs": [],
    },
    warnings=body.get("warnings", []),
    errors=[],
)
```

- [ ] **Step 5: Update failure path in place**

Replace the failure append block with:

```python
finish_node_execution(
    node_execution,
    status="failed",
    duration_ms=duration_ms,
    input_summary="",
    output_summary="",
    artifacts={
        "family": node.kind,
        "iteration": iteration,
    },
    warnings=[],
    errors=[str(exc)],
)
```

- [ ] **Step 6: Record condition route attempts**

Inside the condition route loop in `backend/app/core/langgraph/runtime.py`, create a condition execution when the condition starts:

```python
condition_started_perf = time.perf_counter()
condition_started_at = utc_now_iso()
condition_execution = start_node_execution(
    state,
    node_id=condition_name,
    node_type=condition_node.kind,
    started_at=condition_started_at,
    iteration=iteration,
)
state["node_status_map"][condition_name] = "running"
_record_subgraph_node_status(state, condition_name, "running")
publish_run_event(
    str(state.get("run_id") or ""),
    "node.started",
    {
        "node_id": condition_name,
        "node_type": condition_node.kind,
        "status": "running",
        "started_at": condition_started_at,
        **_subgraph_event_context(state),
    },
)
```

After selecting a branch and computing `duration_ms`, finish it:

```python
finish_node_execution(
    condition_execution,
    status="success",
    duration_ms=duration_ms,
    input_summary=_summarize_values(input_values),
    output_summary=str(selected_branch),
    artifacts={
        "inputs": input_values,
        "outputs": dict(body.get("outputs", {})),
        "family": condition_node.kind,
        "iteration": iteration,
        "selected_branch": selected_branch,
        "state_reads": _state_reads,
        "state_writes": [],
    },
    warnings=body.get("warnings", []),
    errors=[],
)
```

If the condition raises, finish the same record before re-raising:

```python
finish_node_execution(
    condition_execution,
    status="failed",
    duration_ms=int((time.perf_counter() - condition_started_perf) * 1000),
    input_summary="",
    output_summary="",
    artifacts={"family": condition_node.kind, "iteration": iteration},
    warnings=[],
    errors=[str(exc)],
)
```

- [ ] **Step 7: Update startup recovery**

In `backend/app/core/runtime/run_recovery.py`, import:

```python
from app.core.runtime.node_execution_records import (
    INTERRUPTED_RUN_MESSAGE,
    duration_between_iso_ms,
    find_latest_running_execution,
)
```

Remove the local `INTERRUPTED_RUN_MESSAGE` constant so recovery uses the shared message.

Change `_append_interrupted_node_execution`:

```python
def _append_interrupted_node_execution(run: dict[str, Any], current_node_id: str, now: str) -> None:
    if not current_node_id:
        return

    running_execution = find_latest_running_execution(run, current_node_id)
    if running_execution is not None:
        running_execution["status"] = "failed"
        running_execution["finished_at"] = now
        running_execution["duration_ms"] = duration_between_iso_ms(running_execution.get("started_at"), now)
        running_execution["errors"] = [*_without_message(running_execution.get("errors"), INTERRUPTED_RUN_MESSAGE), INTERRUPTED_RUN_MESSAGE]
        return

    ...
```

Add the helper:

```python
def _without_message(values: Any, message: str) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if str(value) != message]
```

Keep the old append fallback for queued or legacy runs with no running execution.

- [ ] **Step 8: Update schemas and frontend types**

In `backend/app/core/schemas/run.py`, add fields to `NodeExecutionDetail`:

```python
execution_id: str | None = None
attempt: int | None = None
```

In `frontend/src/types/run.ts`, add:

```ts
execution_id?: string | null;
attempt?: number | null;
```

- [ ] **Step 9: Run backend focused tests**

Run:

```bash
python -m pytest backend/tests/test_langgraph_runtime_progress_events.py backend/tests/test_run_startup_recovery.py -q
```

Expected: PASS.

- [ ] **Step 10: Commit backend runtime changes**

```bash
git add backend/app/core/runtime/node_execution_records.py backend/app/core/langgraph/runtime.py backend/app/core/runtime/run_recovery.py backend/app/core/schemas/run.py frontend/src/types/run.ts backend/tests/test_langgraph_runtime_progress_events.py backend/tests/test_run_startup_recovery.py
git commit -m "持久化节点运行计时事实"
git push
```

## Task 3: Shared Frontend Timing Projection

**Files:**
- Create: `frontend/src/lib/runTelemetryProjection.ts`
- Modify: `frontend/src/editor/workspace/runNodeTimingModel.ts`
- Modify: `frontend/src/editor/workspace/runNodeTimingModel.test.ts`
- Modify: `frontend/src/editor/nodes/NodeCard.vue`

- [ ] **Step 1: Add projection tests**

In `frontend/src/editor/workspace/runNodeTimingModel.test.ts`, update the expected field name from `startedAtMs` to `startedAtEpochMs`.

Add a restore test for a running node:

```ts
test("buildRunNodeTimingByNodeIdFromRun restores running node timing from started_at", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun({
    node_executions: [
      {
        node_id: "agent",
        status: "running",
        started_at: "2026-05-13T10:00:00.000Z",
        finished_at: null,
        duration_ms: 0,
      },
    ],
  });

  assert.equal(timings.agent.status, "running");
  assert.equal(timings.agent.startedAtEpochMs, Date.parse("2026-05-13T10:00:00.000Z"));
  assert.equal(timings.agent.durationMs, null);
});
```

Add a restore test for output availability timing:

```ts
test("buildRunNodeTimingByNodeIdFromRun derives output duration from writer start to state event time", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: [
        {
          node_id: "agent",
          status: "success",
          started_at: "2026-05-13T10:00:00.000Z",
          finished_at: "2026-05-13T10:00:03.500Z",
          duration_ms: 3500,
        },
      ],
      artifacts: {
        state_events: [
          {
            node_id: "agent",
            state_key: "reply",
            created_at: "2026-05-13T10:00:02.250Z",
          },
        ],
      },
    },
    graphDocument(),
  );

  assert.equal(timings.output.status, "success");
  assert.equal(timings.output.startedAtEpochMs, Date.parse("2026-05-13T10:00:00.000Z"));
  assert.equal(timings.output.durationMs, 2250);
});
```

- [ ] **Step 2: Run timing tests to see current failures**

Run:

```bash
node --test frontend/src/editor/workspace/runNodeTimingModel.test.ts
```

Expected before implementation: FAIL because `startedAtEpochMs` does not exist and restore output timing uses writer duration.

- [ ] **Step 3: Create shared projection module**

Create `frontend/src/lib/runTelemetryProjection.ts`:

```ts
import type { GraphDocument, GraphNode, GraphPayload } from "@/types/node-system";
import type { NodeExecutionDetail, StateEvent } from "@/types/run";

export type RunNodeTimingStatus = "running" | "success" | "failed" | "paused";

export type RunNodeTiming = {
  status: RunNodeTimingStatus;
  startedAtEpochMs: number | null;
  durationMs: number | null;
};

export type RunNodeTimingByNodeId = Record<string, RunNodeTiming>;

type TimingGraphDocument = Pick<GraphPayload | GraphDocument, "nodes">;

export function reduceRunNodeTimingEvent(
  current: RunNodeTimingByNodeId,
  eventType: string,
  payload: Record<string, unknown>,
  nowEpochMs: number,
  document?: TimingGraphDocument | null,
): RunNodeTimingByNodeId {
  const nodeId = normalizeText(payload.node_id);
  if (eventType === "node.started") {
    const startedAtEpochMs = parseIsoEpochMs(payload.started_at) ?? nowEpochMs;
    return nodeId ? startNodeAndConnectedOutputTiming(current, nodeId, startedAtEpochMs, document) : current;
  }
  if (eventType === "node.completed") {
    return nodeId ? completeNodeTiming(current, nodeId, "success", payload.duration_ms, nowEpochMs) : current;
  }
  if (eventType === "node.failed") {
    return nodeId ? completeNodeAndConnectedOutputTiming(current, nodeId, "failed", payload.duration_ms, nowEpochMs, document) : current;
  }
  if (eventType === "run.paused" || eventType === "node.paused") {
    return nodeId ? completeNodeAndConnectedOutputTiming(current, nodeId, "paused", payload.duration_ms, nowEpochMs, document) : current;
  }
  if (eventType === "state.updated") {
    const createdAtEpochMs = parseIsoEpochMs(payload.created_at) ?? nowEpochMs;
    return completeOutputTimingForState(current, payload.state_key, "success", createdAtEpochMs, document, nodeId);
  }
  return current;
}

export function buildRunNodeTimingByNodeIdFromRun(
  run: {
    node_executions?: Array<Partial<NodeExecutionDetail>>;
    artifacts?: { state_events?: Array<Partial<StateEvent>> };
  },
  document?: TimingGraphDocument | null,
): RunNodeTimingByNodeId {
  let result: RunNodeTimingByNodeId = {};
  for (const execution of run.node_executions ?? []) {
    const nodeId = normalizeText(execution.node_id);
    if (!nodeId) {
      continue;
    }
    result = {
      ...result,
      [nodeId]: timingFromExecution(execution),
    };
  }
  return deriveOutputTimingsFromRun(result, run, document);
}

function timingFromExecution(execution: Partial<NodeExecutionDetail>): RunNodeTiming {
  const status = normalizeExecutionStatus(execution.status);
  const startedAtEpochMs = parseIsoEpochMs(execution.started_at);
  return {
    status,
    startedAtEpochMs,
    durationMs: status === "running" ? null : normalizeDurationMs(execution.duration_ms),
  };
}
```

Move the existing helper functions from `runNodeTimingModel.ts` into this shared module and update the old `startedAtMs` references to `startedAtEpochMs`.

- [ ] **Step 4: Implement output availability projection**

In the same module, implement `deriveOutputTimingsFromRun` using `state_events.created_at`:

```ts
function deriveOutputTimingsFromRun(
  current: RunNodeTimingByNodeId,
  run: {
    node_executions?: Array<Partial<NodeExecutionDetail>>;
    artifacts?: { state_events?: Array<Partial<StateEvent>> };
  },
  document?: TimingGraphDocument | null,
) {
  let next = current;
  for (const event of run.artifacts?.state_events ?? []) {
    const stateKey = normalizeText(event.state_key);
    if (!stateKey) {
      continue;
    }
    const writerNodeId = normalizeText(event.node_id);
    const writerExecution = writerNodeId ? findLastNodeExecution(run.node_executions ?? [], writerNodeId) : null;
    const writerStartedAtEpochMs = parseIsoEpochMs(writerExecution?.started_at);
    const eventCreatedAtEpochMs = parseIsoEpochMs(event.created_at);
    const fallbackDurationMs = normalizeDurationMs(writerExecution?.duration_ms);
    const durationMs =
      writerStartedAtEpochMs !== null && eventCreatedAtEpochMs !== null
        ? Math.max(0, Math.round(eventCreatedAtEpochMs - writerStartedAtEpochMs))
        : fallbackDurationMs;
    for (const outputNodeId of listOutputNodeIdsForState(document, stateKey)) {
      next = {
        ...next,
        [outputNodeId]: {
          status: "success",
          startedAtEpochMs: writerStartedAtEpochMs,
          durationMs,
        },
      };
    }
  }
  return next;
}
```

- [ ] **Step 5: Re-export from editor model**

Replace `frontend/src/editor/workspace/runNodeTimingModel.ts` with a thin wrapper:

```ts
export {
  buildRunNodeTimingByNodeIdFromRun,
  reduceRunNodeTimingEvent,
  type RunNodeTiming,
  type RunNodeTimingByNodeId,
  type RunNodeTimingStatus,
} from "@/lib/runTelemetryProjection";
```

If local imports do not resolve `@/` in node tests, keep relative imports in this wrapper:

```ts
export {
  buildRunNodeTimingByNodeIdFromRun,
  reduceRunNodeTimingEvent,
  type RunNodeTiming,
  type RunNodeTimingByNodeId,
  type RunNodeTimingStatus,
} from "../../lib/runTelemetryProjection.ts";
```

Use the import style that matches existing Node test execution.

- [ ] **Step 6: Update NodeCard time domain**

In `frontend/src/editor/nodes/NodeCard.vue`, update:

```ts
if (timing.status === "running" && timing.startedAtEpochMs !== null) {
  return Math.max(0, Math.round(nodeRunTimingNowMs.value - timing.startedAtEpochMs));
}
```

Change the clock source:

```ts
function nowNodeRunTimingMs() {
  return Date.now();
}
```

Update the watcher:

```ts
() => [props.runTiming?.status ?? null, props.runTiming?.startedAtEpochMs ?? null] as const,
```

- [ ] **Step 7: Run frontend focused tests**

Run:

```bash
node --test frontend/src/editor/workspace/runNodeTimingModel.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit frontend shared timing projection**

```bash
git add frontend/src/lib/runTelemetryProjection.ts frontend/src/editor/workspace/runNodeTimingModel.ts frontend/src/editor/workspace/runNodeTimingModel.test.ts frontend/src/editor/nodes/NodeCard.vue
git commit -m "统一前端运行计时投影"
git push
```

## Task 4: Buddy Output Timing Uses the Shared Projection

**Files:**
- Modify: `frontend/src/buddy/buddyPublicOutput.ts`
- Modify: `frontend/src/buddy/buddyPublicOutput.test.ts`
- Modify: `frontend/src/buddy/BuddyWidget.vue`

- [ ] **Step 1: Add Buddy restore test for output duration**

In `frontend/src/buddy/buddyPublicOutput.test.ts`, add a test that uses `buildBuddyPublicOutputBindings` and restored run detail facts:

```ts
import { buildRunNodeTimingByNodeIdFromRun } from "../lib/runTelemetryProjection.ts";

test("buddy output restore uses writer started_at to state event created_at duration", () => {
  const graph = graphWithWriterAndOutput();
  const bindings = buildBuddyPublicOutputBindings(graph);
  const timings = buildRunNodeTimingByNodeIdFromRun(
    {
      node_executions: [
        {
          node_id: "writer",
          status: "success",
          started_at: "2026-05-13T10:00:00.000Z",
          finished_at: "2026-05-13T10:00:04.000Z",
          duration_ms: 4000,
        },
      ],
      artifacts: {
        state_events: [
          {
            node_id: "writer",
            state_key: "answer",
            created_at: "2026-05-13T10:00:01.500Z",
            value: "你好",
          },
        ],
      },
    },
    graph,
  );

  assert.equal(bindings[0].outputNodeId, "output_answer");
  assert.equal(timings.output_answer.durationMs, 1500);
});
```

Use the existing test graph helper if one already exists; otherwise create `graphWithWriterAndOutput()` in the test file.

- [ ] **Step 2: Run Buddy output tests**

Run:

```bash
node --test frontend/src/buddy/buddyPublicOutput.test.ts
```

Expected before implementation: FAIL if the shared projection is not imported or Buddy restore still computes duration locally.

- [ ] **Step 3: Remove duplicate timing logic from Buddy output restore**

In `frontend/src/buddy/BuddyWidget.vue`, update `buildPublicOutputRuntimeStateFromRunDetail` to compute timing once:

```ts
const outputTimingByNodeId = buildRunNodeTimingByNodeIdFromRun(
  {
    node_executions: runDetail.node_executions,
    artifacts: { state_events: runDetail.artifacts?.state_events ?? [] },
  },
  activeBuddyGraph.value,
);
```

When creating each `BuddyPublicOutputMessage`, use:

```ts
const timing = outputTimingByNodeId[binding.outputNodeId] ?? null;
startedAtMs: timing?.startedAtEpochMs ?? null,
durationMs: timing?.durationMs ?? null,
```

Keep the existing public-output binding rule:

- Only root `graph.nodes` are scanned.
- Only nodes with `kind === "output"` are eligible.
- Each output must read exactly one state.
- Subgraph-internal output nodes are ignored unless the parent graph exposes their values through a parent output node.

- [ ] **Step 4: Update Buddy live reducer to use epoch milliseconds**

In `frontend/src/buddy/buddyPublicOutput.ts`, rename message timing fields only if necessary:

```ts
startedAtMs: number | null;
```

can remain for message compatibility, but its meaning becomes epoch milliseconds. Add a local type comment:

```ts
// Epoch milliseconds. Kept as startedAtMs to avoid changing persisted chat message shape.
startedAtMs: number | null;
```

Ensure callers pass `Date.now()` instead of `performance.now()`.

- [ ] **Step 5: Run Buddy focused tests**

Run:

```bash
node --test frontend/src/buddy/buddyPublicOutput.test.ts frontend/src/buddy/buddyChatGraph.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Buddy timing integration**

```bash
git add frontend/src/buddy/buddyPublicOutput.ts frontend/src/buddy/buddyPublicOutput.test.ts frontend/src/buddy/BuddyWidget.vue
git commit -m "复用运行投影恢复伙伴输出耗时"
git push
```

## Task 5: Restored Run Activity Includes Node Lifecycle

**Files:**
- Modify: `frontend/src/editor/workspace/runActivityModel.ts`
- Modify: `frontend/src/editor/workspace/runActivityModel.test.ts`

- [ ] **Step 1: Add restored activity test**

In `frontend/src/editor/workspace/runActivityModel.test.ts`, add:

```ts
test("buildRunActivityEntriesFromRun restores node lifecycle entries from node executions", () => {
  const entries = buildRunActivityEntriesFromRun({
    ...baseRunDetail(),
    node_executions: [
      {
        node_id: "agent",
        node_type: "agent",
        status: "success",
        started_at: "2026-05-13T10:00:00.000Z",
        finished_at: "2026-05-13T10:00:01.200Z",
        duration_ms: 1200,
        input_summary: "",
        output_summary: "Answer",
        artifacts: {
          inputs: {},
          outputs: { answer: "Hello" },
          family: "agent",
          state_reads: [],
          state_writes: [],
        },
        warnings: [],
        errors: [],
      },
    ],
    artifacts: {
      state_events: [
        {
          node_id: "agent",
          state_key: "answer",
          output_key: "answer",
          value: "Hello",
          created_at: "2026-05-13T10:00:01.000Z",
          sequence: 1,
        },
      ],
      activity_events: [],
    },
  });

  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ["node-started", "state-updated", "node-completed"],
  );
});
```

Use the existing `baseRunDetail()` test helper if present. If the file uses inline run objects, add the minimum required `RunDetail` object following its current style.

- [ ] **Step 2: Run activity tests**

Run:

```bash
node --test frontend/src/editor/workspace/runActivityModel.test.ts
```

Expected before implementation: FAIL because restored activity currently omits node lifecycle entries.

- [ ] **Step 3: Implement node lifecycle reconstruction**

In `frontend/src/editor/workspace/runActivityModel.ts`, add node lifecycle entries before sorting:

```ts
const nodeEntries = (run.node_executions ?? []).flatMap((execution, index) => {
  const nodeId = execution.node_id ?? "";
  const nodeType = execution.node_type ?? null;
  const baseSequence = (index + 1) * 1000;
  const startedAt = execution.started_at ?? "";
  const finishedAt = execution.finished_at ?? "";
  const entries: RunActivityEntry[] = [];
  if (startedAt) {
    entries.push(
      createEntry(
        "node-started",
        baseSequence,
        nodeId,
        nodeType,
        null,
        `${nodeId} running`,
        "agent running",
        execution,
        startedAt,
      ),
    );
  }
  if (finishedAt) {
    entries.push(
      createEntry(
        execution.status === "failed" ? "node-failed" : "node-completed",
        baseSequence + 999,
        nodeId,
        nodeType,
        null,
        execution.status === "failed" ? `${nodeId} failed` : `${nodeId} completed`,
        execution.status === "failed" ? (execution.errors ?? []).join("\n") : `${Number(execution.duration_ms ?? 0)}ms`,
        execution,
        finishedAt,
      ),
    );
  }
  return entries;
});
```

Then sort:

```ts
const entries = [...nodeEntries, ...stateEntries, ...activityEntries].sort(compareRunActivityEntries);
```

- [ ] **Step 4: Run activity tests**

Run:

```bash
node --test frontend/src/editor/workspace/runActivityModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit activity restore changes**

```bash
git add frontend/src/editor/workspace/runActivityModel.ts frontend/src/editor/workspace/runActivityModel.test.ts
git commit -m "恢复运行活动中的节点生命周期"
git push
```

## Task 6: End-to-End Verification and Visual Check

**Files:**
- No required source changes unless verification exposes defects.

- [ ] **Step 1: Run backend focused suite**

Run:

```bash
python -m pytest backend/tests/test_langgraph_runtime_progress_events.py backend/tests/test_run_startup_recovery.py backend/tests/test_subgraph_node_system.py -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend focused suite**

Run:

```bash
node --test frontend/src/editor/workspace/runNodeTimingModel.test.ts frontend/src/buddy/buddyPublicOutput.test.ts frontend/src/editor/workspace/runActivityModel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run structure tests for touched UI surfaces**

Run:

```bash
node --test frontend/src/editor/nodes/NodeCard.structure.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: PASS.

- [ ] **Step 4: Restart TooGraph**

Because this plan changes runtime and UI code, restart with the standard command:

```bash
npm start
```

Expected:

- TooGraph starts on `http://127.0.0.1:3477` unless `PORT` is set.
- The start command reuses `frontend/dist` when its manifest is current, or rebuilds if necessary.

- [ ] **Step 5: Browser verification**

In the graph editor:

1. Open a simple graph `Input -> LLM -> Output`.
2. Start a run.
3. Confirm the LLM node timing capsule appears while the node is running, not only after completion.
4. Confirm the output node timing capsule appears when the upstream writer starts and completes when the output state is written.
5. Refresh the page during a long run; confirm the running capsule is restored from run detail polling.
6. Open the completed run from history; confirm node and output durations are still visible.

In Buddy:

1. Send one message that produces at least one parent output node.
2. Confirm the chat window only renders parent output node messages.
3. Confirm each output message shows the output node duration.
4. Refresh or reopen the run history; confirm Buddy output duration matches the canvas output duration for the same output node.

- [ ] **Step 6: Commit verification fixes if any**

If verification exposes a defect, commit the fix with a scoped message:

```bash
git add <changed-files>
git commit -m "修正运行计时恢复细节"
git push
```

If no source changes are needed, do not create an empty commit.

## Acceptance Criteria

- Node timing capsule appears when a node starts running.
- A refresh during a running node can restore the timing capsule from `GET /api/runs/{run_id}` without relying on a previously received SSE event.
- Completed runs preserve node durations in run history.
- Condition nodes have persisted execution attempts and can show timing like other nodes.
- Output node timing appears on the canvas and represents writer-start to state-available duration.
- Buddy chat output messages use the same output timing projection as the canvas.
- Buddy chat still ignores subgraph-internal output nodes unless the parent graph exposes them through a parent output node.
- Restored Run Activity includes node started/completed/failed lifecycle entries, not only state and activity events.
- No new public `/timing` endpoint exists.
- No Buddy-only timing channel exists.
- No backend per-tick timing persistence exists.

## Compatibility Rules

- Old run records without `execution_id` or `attempt` remain valid.
- Old run records with only `duration_ms` but no true `started_at` should still display completed durations.
- Old output timing records that cannot compute availability duration should fall back to writer `duration_ms`.
- If a graph loops, canvas displays the latest attempt per `node_id`; Run Detail keeps all attempts in order.
- If a run is interrupted after this change, recovery updates the latest running attempt. If no running attempt exists because the run is old, recovery appends the existing legacy interrupted record.

## Implementation Order

1. Backend tests.
2. Backend execution attempt helper and LangGraph integration.
3. Shared frontend timing projection.
4. Buddy output timing reuse.
5. Restored Run Activity lifecycle.
6. Focused tests, browser verification, `npm start`.

This order keeps the durable run record correct before frontend starts depending on it, and it lets Buddy reuse the editor projection instead of carrying a second timing interpretation.

## Self-Review

- Spec coverage:
  - Running-time capsule from node start: Task 1, Task 2, Task 3, Task 6.
  - Output node timing, including Buddy chat display: Task 3, Task 4, Task 6.
  - Restore after refresh and run history: Task 1, Task 2, Task 3, Task 4, Task 5.
  - No special channels or duplicate APIs: Protocol Decisions and Acceptance Criteria.
  - Architecture-level reuse: File Structure, Data Contract, Task 3, Task 4.

- Placeholder scan:
  - The plan contains no open placeholder steps.
  - Each implementation task names exact files, focused tests, expected failures, expected passes, and commit commands.

- Type consistency:
  - Backend uses `execution_id`, `attempt`, `started_at`, `finished_at`, `duration_ms`.
  - Frontend timing projection uses `startedAtEpochMs` for canvas node timing.
  - Buddy message compatibility may keep `startedAtMs`, but its documented meaning becomes epoch milliseconds.
