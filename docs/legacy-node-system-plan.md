# GraphiteUI node_system 改造计划

根据《GraphiteUI 仓库冗余与冲突代码深度审查报告》整理。

## 执行状态

| 阶段 | 状态 | 交付 |
|---|---|---|
| Phase 1：立刻收口 | ✅ 已完成 | conditionMode 收口、StateField 统一、文档同步 |
| Phase 2：结构与一致性 | ✅ 已完成 | worker 异常记录、共享类型统一、前端类型复用 |
| Phase 3：Cycle-ready | ✅ 已完成 | ExecutionMode 枚举、CycleDetector、执行模式透传 |

---

## Phase 1 — 立刻收口 ✅

### 1.1 conditionMode model 移除

- **backend** `ConditionMode` 只保留 `"rule"`，`"model"` 注释为未来扩展
- **frontend** `ConditionNode.conditionMode` 类型改为 `"rule"`
- `node-system-editor.tsx` UI 删除 model 选项，TODO 占位

### 1.2 前端 StateField 统一

- `StateField` / `StateFieldType` 移入 `frontend/lib/node-system-schema.ts`
- `editor-client.tsx` / `node-system-editor.tsx` 删除本地重复定义

### 1.3 文档同步

- README: Cycles 状态改为"计划中"，加路线图说明当前 DAG
- `已交付功能.md`: 删除 creative_factory 和 themeConfig 引用
- `development_plan.md`: 清理 creative_factory 双模板描述
- `acceptance_runbook.md`: 明确 creative_factory 已下线
- `framework_positioning.md`: 模板描述收口为 hello_world

---

## Phase 2 — 结构与一致性 ✅

### 2.1 worker 异常记录

- `routes_graphs._run_graph_worker` 异常不再吞掉，`logger.exception` 记录并回写 `run_state.errors` + `completed_at`

### 2.2 未用 import 清理

- `graph_store.py` 移除未用的 `from pydantic import ValidationError`

### 2.3 前端共享类型

- 新建 `frontend/lib/types.ts`，统一 `GraphSummary` / `RunSummary` / `TemplateSummary`
- `editor/page.tsx`、`workspace-dashboard-client.tsx`、`runs-list-client.tsx` 删除本地重复定义

---

## Phase 3 — Cycle-ready 🔜

### 3.1 ExecutionMode 枚举

`backend/app/core/schemas/node_system.py`:

```python
class ExecutionMode(str, Enum):
    """
    Execution mode for node system graphs.
    DAG:  Directed Acyclic Graph — current default.
    Cycle: supports cyclic graphs (LangGraph full capability) — future work.
    """
    DAG = "dag"
    # CYCLE = "cycle"  # TODO: implement LangGraph cycle executor
```

### 3.2 CycleDetector

`backend/app/core/runtime/node_system_executor.py`:

```python
class CycleDetector:
    """Detects cycles via DFS (white/gray/black)."""

    def detect(self) -> tuple[bool, list[tuple[str, str]]]:
        # Returns (has_cycle, back_edges)
```

### 3.3 执行模式透传

- `execute_node_system_graph(graph, execution_mode=ExecutionMode.DAG)` — 签名新增参数
- DAG 模式下：先运行 `CycleDetector`，检测到环则 logger.warning + 仍抛出明确错误
- `/api/graphs/run` 从 `graph.metadata.execution_mode` 读取，默认 `"dag"`
- 未来实现 cycle 模式时：只需在 `ExecutionMode` 枚举中取消注释 `CYCLE`，在 executor 中新增 `execute_cycle_mode()` 分支即可

### 3.4 文档更新

本文档已同步 Phase 3 进展。

---

## Phase 4 — Cycle Executor 实现（未来）

### 目标

完整支持 LangGraph Cycles（循环图），实现 ReAct / Agent Loop 等模式。

### 技术方案（草案）

1. **ExecutionMode.CYCLE** 枚举取消注释
2. `node_system_executor.py` 新增 `execute_cycle_mode()`：
   - 不再做 topological sort
   - 使用 `while` 循环 + visited 计数
   - 每次迭代：执行所有就绪节点 → 更新 state → 直到所有节点完成或达到 max_iterations
3. 新增 `ConditionMode.CYCLE`：由 LLM 判断是否继续循环
4. `graph.metadata.max_iterations`：最大迭代次数（防止死循环）
5. `graph.metadata.cycle_state_key`：循环终止条件的 state key（如 `"should_continue"`）
6. 前端 UI：在图配置面板中增加 execution mode 切换和 max_iterations 输入

### 待验证问题

- [ ] state 中 cycle iteration counter 如何持久化
- [ ] 循环分支如何处理 node_executions 历史（同一节点多次执行）
- [ ] WebSocket 实时推送循环迭代进度
- [ ] 循环终止条件的 UI 配置方式

---

## Phase 5 — 前端 execution_mode UI（未来）

- `frontend/lib/node-system-schema.ts`: `conditionMode` 扩展为 `"rule" | "model" | "cycle"`
- 图设置面板：增加 execution mode 单选（默认 DAG）和 max_iterations 输入
- Cycles 可视化：循环连线用虚线表示，迭代次数 badge

---

## Phase 6 — RunState Schema 版本化（未来）

`run_state` 中写入 schema 版本：

```python
state["schema_version"] = "1.0"
```

便于未来 schema 升级时做 migration。
