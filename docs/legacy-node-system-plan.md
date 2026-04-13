# GraphiteUI node_system 改造计划

根据《GraphiteUI 仓库冗余与冲突代码深度审查报告》整理。

## 执行状态

| 阶段 | 状态 | 交付 |
|---|---|---|
| Phase 1：立刻收口 | ✅ 已完成 | conditionMode 收口、StateField 统一、文档同步 |
| Phase 2：结构与一致性 | ✅ 已完成 | worker 异常记录、共享类型统一，前端类型复用 |
| Phase 3：Cycle-ready | ✅ 已完成 | CycleDetector、自动环检测、明确错误提示 |

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

## Phase 3 — Cycle-ready ✅

### 3.1 CycleDetector

`backend/app/core/runtime/node_system_executor.py`:

```python
class CycleDetector:
    """Detects cycles via DFS (white/gray/black)."""

    def detect(self) -> tuple[bool, list[tuple[str, str]]]:
        # Returns (has_cycle, back_edges)
```

### 3.2 自动环检测

`execute_node_system_graph()` 启动时自动调用 `CycleDetector`：

- 有环 → `logger.warning` + 状态置 `failed` + 明确错误信息回写到 `run_state.errors`，立即返回
- 无环 → 正常 DAG 执行

不需要显式 `execution_mode` 参数，自动判断即可。

### 3.3 已废弃说明

~~`ExecutionMode` 枚举~~：不加。有环/无环由检测器自动判断，不需要用户声明意图。

---

## Phase 4 — Cycle Executor 实现（未来）

### 目标

有环时支持多轮迭代执行，完整支持 LangGraph Cycles（ReAct / Agent Loop 等模式）。

### 技术方案

不需要 ExecutionMode，全程 auto-detect + max_iterations 控制：

1. `execute_node_system_graph()` 中，检测到环时改为调用 `_execute_with_cycles()`（而非直接失败返回）
2. `_execute_with_cycles()` 逻辑：
   - 不做 topological sort
   - `while` 循环 + 已访问节点计数
   - 每次迭代：执行所有就绪节点（in-degree=0 且未执行过）→ 更新 state → 直到所有节点完成或达到 `max_iterations`
3. `graph.metadata.max_iterations`：最大迭代次数（默认 100）
4. 新增 `ConditionMode.CYCLE`：由 LLM 判断是否继续循环

### 待验证问题

- [ ] 同一节点多次执行时 `node_executions` 历史如何记录
- [ ] WebSocket 实时推送每轮迭代进度
- [ ] 循环终止条件的 state key 如何配置

---

## Phase 5 — RunState Schema 版本化（未来）

`run_state` 中写入 schema 版本：

```python
state["schema_version"] = "1.0"
```

便于未来 schema 升级时做 migration。
