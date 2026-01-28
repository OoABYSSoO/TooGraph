# GraphiteUI legacy → node_system 改造计划

根据《GraphiteUI 仓库冗余与冲突代码深度审查报告》（附带 PDF），我们整理如下详细改动方案：

## 1. 目标与约束
- **目的**：彻底清理 legacy graph/Creative Factory 逻辑，统一前后端 schema，并在保证未来支持 LangGraph Cycles 的前提下，打造可验证、可观测、可扩展的 node_system 运行时。（参考报告第1-5页结论）
- **约束**：后端运行态目前只支持 DAG/`rule` condition（第3页提到 `node_system_executor` 只接受 rule 模式），但未来必须兼容循环模式，因此改动需要预留「cycle-safe executor」路径（第7页 Flowchart 的 E 节点）。

## 2. 关键冲突点与处理建议
1. **Condition `model` 模式+前端多余选项（报告页3、9）**
   - 删除 `frontend/components/editor/node-system-editor.tsx` 中 `CONDITION_MODE_SELECT_OPTIONS` 里 `model` 选项，仅显示 `rule` 并在 UI/说明中提醒后端当前仅支持 rule。避免用户在 UI 切换后运行失败（报告中提及后端直接 reject）。
   - 保留未来 Cycle 模式的留白：预留 hook（TODO comment）用于后端可变后动态加载选项。
2. **Shared `StateField` 定义分裂（页3、9）**
   - 把 `StateField` 定义移动到 `backend/app/core/schemas/node_system.py` 与 `frontend/lib/types.ts` 等共享模块，不再在 `editor-client` 或多个地方重复声明（参考 diff 示例）。
   - 更新 `hello_world/state.py` 里的 key 列表，使其至少包含 editor 的默认 fields（`question`, `knowledge_base`, `answer`, `value`），避免 `state-aware editor` 破裂（页10）。
3. **docs/README 仍提 Cycles 与 `creative_factory`（页6、7）**
   - 在 README、docs/active/*.md 中明确：当前运行只支持 DAG/rule，仅是 LangGraph `state machine` 的子集；`creative_factory` 模板已下线，否则文档会导致预期/实现漂移。
   - 同时在 `docs/active/development_plan.md` 里记录「未来改造计划（Cycle-safe executor + schema source）」的路线图，说明 Cycles 是后续目标（页7 flowchart E → F）。
4. **RunState/实体字段冗余（页6、7）**
   - 将 `backend/app/core/runtime/state.py` 中的 `RunState` 精简为 `node_system` 所需字段，并在保存/运行时明确记录 `state_schema` 版本（报告建议拆分“执行必须字段 vs 扩展字段”）。便于未来支持额外 `cycles` 字段。
5. **worker 异常吞掉（页10）**
   - 增加 `routes_graphs._run_graph_worker` 的异常 logging/回写（如 diff 中所示），保证 `run_state.errors` 和日志可观测。必要时在 `run_store` 添加 `errors` 索引字段供 UI 查询。
6. **graph_store 未用 ValidationError（页11）**
   - 清理 unused import，并在 `graph_store.save_graph` 里明确捕获验证异常并返回明确错误；可复用在 `/api/graphs/save` 模式验证流程，使接口响应更 deterministic。

## 3. 改造分阶段实施计划
| 阶段 | 内容 | 持续 | 重点产出 |
|---|---|---|---|
| Phase 1：立刻收口 | 禁止 UI `model` 条目；统一 `StateField` 定义；文档明确运行限制 | 1-3天 | 提交 `node-system-editor.tsx`、`editor-client.tsx`、`docs/README` 的改动，附说明“rule-only” | 
| Phase 2：结构与一致性 | 统一 `hello_world/state_schema`、前端重复类型；`routes_graphs`/`graph_store` 只接受 node_system | 1周 | 清理 `backend/app/api/routes_graphs.py`、`graph_store.py`、`state.py`，确保 schema key 追踪 | 
| Phase 3：Cycle-ready | 继承 `node_system_executor` 增加 `cycle-safe` hook；增加 `run_state` errors/failed status；README 里加入 “Cycles future support” 说明 | 2-6周 | 引入 cycle-safe executor stub（可配置 run_type，全局枚举），相关 docs + tests | 
|

## 4. 交付物清单
- `docs/legacy-node-system-plan.md`（已生成）
- `frontend/components/editor/node-system-editor.tsx` 与 `editor-client.tsx` 的 `field`/`condition` 固定项
- `backend/app/core/schemas/node_system.py`、`templates/hello_world/state.py` 的一致 key 列表
- `backend/app/api/routes_graphs.py`/`graph_store.py`/`core/runtime/state.py` 的 schema validation
- `docs/README.md`/`docs/active/*.md` 中明确 “rule-only” 与 Cycles 未来路线
- `routes_graphs._run_graph_worker` & `run_store` 中的异常记录机制

## 5. 后续可选扩展（Cycle 全链路）
1. 引入 `node_system_executor` 的 cycle-safe runner，支持 multiple passes/loop nodes；保持 API `execution mode` 兼容。
2. 在 `frontend/lib/node-system-schema.ts` 中为 Condition 定义 `conditionMode: "rule" | "model" | "cycle"`，并在 UI 中分段展示可用选项。
3. 将 `run_state` schema 版本号写入 `state_schema`（report 建议为版本边界），便于未来兼容。
4. 使用 FastAPI OpenAPI 自动生成前端类型（report 第6页中段提到 `contract single source`），减少 TS 维护压力。

需要我在 repo 中为这些阶段生成 task 代办或直接修改文件？