# 图运行存储与记忆召回实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图运行历史、Buddy 历史引用、上下文组装、FTS 检索和 embedding 召回统一落到 `backend/data/toograph.db`，让图运行记录成为执行事实的唯一来源，并让 Buddy 胶囊、运行记录、运行详情和记忆召回都从事实表重新投影。

**Architecture:** 后端扩展现有 SQLite workspace database；Graph Run Store 直接替换 JSON run store，不保留旧 JSON fallback；Buddy 历史迁入统一 DB，只保存消息事实和 run 引用；上下文输入使用 `context_assembly_ref` 和去重 `content_blobs`；检索索引分为可重建的 FTS/trigram/vector 派生层，召回结果必须回指原始 message/run/node/output/artifact/memory source。

**Tech Stack:** Python/FastAPI/Pydantic、SQLite/FTS5、Vue 3 Composition API、TypeScript、Node test runner、pytest。

---

## 源设计与边界

设计依据：

- `docs/superpowers/specs/2026-05-26-graph-run-store-memory-recall-design.md`
- Hermes 参考结论：SQLite 事实表、FTS5、trigram FTS、短 CJK query 的 LIKE fallback。
- TooGraph 目标扩展：完整 embedding 方案、混合召回、上下文组装可审计、图优先执行事实源。

明确不做：

- 不迁移 `backend/data/runs/*.json`。
- 不迁移 `buddy_home/buddy.db`。
- 不为旧 run JSON 或旧 Buddy metadata 做长期兼容读取。
- 不保存 token/delta 级流式事件。
- 不新增 `buddy_capsules` 表；胶囊由 graph run facts 重建。
- 不把完整聊天历史重复内联进每次 Buddy run 的 graph snapshot/state。

实施原则：

- 每个阶段都保持应用可启动、测试可运行。
- 每个阶段完成后本地提交一次，提交信息使用中文。
- 表结构与存储 API 先落地，再替换运行时写入，最后切换 UI 派生逻辑。
- Graph Run Store API 返回形状尽量保持现有 `RunDetail`/`RunSummary`，降低前端改动面。

---

## 文件职责

### 后端存储

- Modify `backend/app/core/storage/database.py`: 拆分并注册 Graph Run Store、Buddy Store、Context Assembly、Retrieval、Embedding、Memory schema 初始化函数。
- Create `backend/app/core/storage/content_blob_store.py`: 按 hash 去重保存大文本和结构化内容 blob。
- Create `backend/app/core/storage/context_assembly_store.py`: 保存 context assembly、source 引用、rendered blob hash 和审计信息。
- Create `backend/app/core/storage/graph_run_db_store.py`: DB-backed Graph Run Store 主实现。
- Modify `backend/app/core/storage/run_store.py`: 作为兼容导入门面，转发到 DB-backed store；移除 JSON 文件读写逻辑。
- Create `backend/app/core/storage/retrieval_store.py`: retrieval documents/chunks、FTS/trigram、LIKE fallback、结果回指。
- Create `backend/app/core/storage/embedding_store.py`: embedding model、vector、job、query vector、nearest-neighbor 接口。
- Create `backend/app/core/storage/memory_store.py`: memory entries、sources、revisions、events、retrieval projection。

### 后端运行时与 API

- Modify `backend/app/api/routes_runs.py`: 从 DB-backed Graph Run Store 读取列表、详情、树、节点详情；取消和恢复仍写回 DB。
- Modify `backend/app/core/runtime/state.py`: 所有 run lifecycle/status 更新通过 Graph Run Store upsert。
- Modify `backend/app/core/runtime/run_artifacts.py`: 输出、artifact、activity event、state event 进入结果级持久化。
- Modify `backend/app/core/runtime/node_execution_records.py`: node execution 开始、结束、摘要、state reads/writes 落库。
- Modify `backend/app/core/runtime/output_boundaries.py`: output boundary 计算继续保持纯函数；输入数据改为 DB 组装后的 `RunDetail`。
- Modify `backend/app/core/runtime/agent_prompt.py`: 识别 `context_assembly_ref` 并通过统一 prompt expansion 展开。
- Modify `backend/app/core/runtime/state_io.py`: 保存 state value 时支持 `content_ref` 和 `context_assembly_ref`。
- Modify `backend/app/core/langgraph/finalization.py`: run 完成、失败、暂停时写 final snapshot 和结果级 facts。
- Modify `backend/app/api/routes_buddy.py`: Buddy session/message CRUD 改用统一 DB store。
- Modify `backend/app/buddy/home.py`: Buddy Home 继续负责文档文件和默认目录，不再创建事实源 `buddy.db`。
- Modify `backend/app/buddy/store.py`: Buddy session/message/revision 操作转向统一 DB，同时保留 Buddy Home 文档读写职责。

### 前端

- Modify `frontend/src/api/runs.ts`: API 类型保持现有形状，并补充 `context_assembly_ref` 和 retrieval audit 类型。
- Modify `frontend/src/api/buddy.ts`: Buddy message payload 只携带 message 内容、session 信息、run_id 和普通 metadata。
- Modify `frontend/src/types/buddy.ts`: 移除胶囊事实型 metadata 的依赖，保留显示层可选缓存类型只作为瞬时 UI state。
- Modify `frontend/src/buddy/BuddyWidget.vue`: `finishBuddyVisibleRun` 不再持久化 output trace/public output 派生消息；最终回复仍作为 Buddy assistant message 持久化并引用 run_id。
- Modify `frontend/src/buddy/useBuddyMessages.ts`: 展示消息时通过 run_id 拉取 run detail，重建胶囊和 outputs；旧派生 metadata 不作为事实源。
- Modify `frontend/src/buddy/useBuddyRunDisplayMessages.ts`: 统一从 `RunDetail` 组装 visible run display messages。
- Modify `frontend/src/buddy/buddyOutputTrace.ts`: 保持 output 边界分段规则；输入事实来自 DB-backed run detail。
- Modify `frontend/src/buddy/useBuddyRunTraceDisplay.ts`: 展开胶囊时通过 `/api/runs/{run_id}/tree` 和 run detail 读取子图。
- Modify `frontend/src/buddy/buddyChatGraph.ts`: `conversation_history` 改为 `context_assembly_ref` 输入，不再把完整历史文本塞入 graph input config。
- Modify `frontend/src/pages/RunDetailPage.vue`: 运行详情继续按 `RunDetail` 展示，增加 context source/retrieval audit 可见入口。
- Modify `frontend/src/pages/runDetailModel.ts`: 生成 context source 和 retrieval audit 的展示模型。

### 测试

- Create `backend/tests/test_graph_run_db_store.py`
- Create `backend/tests/test_context_assembly_store.py`
- Create `backend/tests/test_retrieval_store.py`
- Create `backend/tests/test_embedding_store.py`
- Create `backend/tests/test_memory_store.py`
- Modify `backend/tests/test_storage_database.py`
- Modify `backend/tests/test_run_tree_store.py`
- Modify `backend/tests/test_routes_runs.py`
- Modify `backend/tests/test_runtime_progress_persistence.py`
- Modify `backend/tests/test_runtime_run_artifacts.py`
- Modify `backend/tests/test_runtime_activity_events.py`
- Modify `backend/tests/test_runtime_state_io.py`
- Modify `backend/tests/test_buddy_store.py`
- Modify `backend/tests/test_buddy_routes.py`
- Modify `frontend/src/api/runs.test.ts`
- Modify `frontend/src/api/buddy.test.ts`
- Modify `frontend/src/buddy/buddyOutputTrace.test.ts`
- Modify `frontend/src/buddy/useBuddyRunDisplayMessages.test.ts`
- Create `frontend/src/buddy/useBuddyMessages.test.ts`
- Modify `frontend/src/buddy/buddyChatGraph.test.ts`
- Modify `frontend/src/pages/runDetailModel.test.ts`

---

## 表结构实施顺序

第一批必须随 Graph Run Store 一起创建：

- `content_blobs`
- `graph_runs`
- `graph_run_snapshots`
- `graph_node_executions`
- `graph_run_events`
- `graph_state_events`
- `graph_outputs`
- `graph_artifacts`
- `graph_capability_invocations`
- `graph_model_calls`

第二批随 Buddy 统一存储创建：

- `buddy_sessions`
- `buddy_messages`
- `buddy_message_revisions`
- `buddy_message_run_refs`
- `buddy_revisions`
- `buddy_commands`
- `buddy_kv`
- `buddy_messages_fts`
- `buddy_messages_fts_trigram`

第三批随 context assembly 创建：

- `context_assemblies`
- `context_assembly_sources`
- `context_assembly_warnings`

第四批随召回系统创建：

- `retrieval_documents`
- `retrieval_chunks`
- `retrieval_chunks_fts`
- `retrieval_chunks_fts_trigram`
- `embedding_models`
- `embedding_vectors`
- `embedding_jobs`
- `retrieval_queries`
- `retrieval_results`
- `memory_entries`
- `memory_entry_sources`
- `memory_revisions`
- `memory_events`

所有 JSON 列命名统一使用 `_json` 后缀；所有事实表带 `created_at`；可更新实体带 `updated_at`；派生索引必须可通过事实表重建。

---

## Task 1: 数据库 Schema 与 Schema 初始化拆分

**Files:**

- Modify `backend/app/core/storage/database.py`
- Create `backend/app/core/storage/content_blob_store.py`
- Create `backend/app/core/storage/graph_run_db_store.py`
- Modify `backend/tests/test_storage_database.py`

- [ ] 添加测试：`initialize_storage()` 在临时 `toograph.db` 中创建 Graph Run Store 第一批表和索引。
- [ ] 添加测试：重复调用 `initialize_storage()` 不破坏已有数据，且不会重复创建冲突索引。
- [ ] 添加测试：`content_blobs.content_hash` 是主键，同一 hash 重复写入返回同一记录。
- [ ] 在 `database.py` 中保留 `get_connection()` 和 `initialize_storage()` 入口，但将大段 schema 创建拆成私有函数：
  - `_ensure_knowledge_schema(connection)`
  - `_ensure_eval_schema(connection)`
  - `_ensure_graph_run_schema(connection)`
  - `_ensure_buddy_schema(connection)`
  - `_ensure_context_assembly_schema(connection)`
  - `_ensure_retrieval_schema(connection)`
  - `_ensure_embedding_schema(connection)`
  - `_ensure_memory_schema(connection)`
- [ ] `content_blob_store.py` 提供：
  - `put_content_blob(content: str | bytes, mime_type: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]`
  - `get_content_blob(content_hash: str) -> dict[str, Any]`
  - `maybe_inline_or_ref(value: Any, mime_type: str = "application/json") -> Any`
- [ ] `content_blobs` 保存 `content_hash`、`storage_kind`、`mime_type`、`byte_length`、`content_text`、`content_bytes`、`metadata_json`、`created_at`。
- [ ] 大文本阈值先使用常量 `INLINE_JSON_VALUE_LIMIT_BYTES = 32 * 1024`，后续可配置；本阶段不加入 UI 设置。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_storage_database.py -q
```

- [ ] 提交：

```bash
git add backend/app/core/storage/database.py backend/app/core/storage/content_blob_store.py backend/tests/test_storage_database.py
git commit -m "添加图运行数据库基础表"
```

**Done when:** 临时 DB 初始化后包含 Graph Run Store 核心表，重复初始化稳定，content blob 可去重读写。

---

## Task 2: DB-backed Graph Run Store 门面

**Files:**

- Modify `backend/app/core/storage/run_store.py`
- Modify `backend/app/core/storage/graph_run_db_store.py`
- Modify `backend/tests/test_run_tree_store.py`
- Create `backend/tests/test_graph_run_db_store.py`

- [ ] 写测试：`save_run()` 保存现有 `create_initial_run_state()` payload 后，`load_run()` 返回可被 `RunDetail` 校验的 dict。
- [ ] 写测试：`list_runs()` 按 `started_at DESC, run_id DESC` 返回 summary-compatible dict。
- [ ] 写测试：`list_child_runs(parent_run_id)` 只返回直接子 run，并按 run path 深度和 started_at 排序。
- [ ] 写测试：`build_run_tree(root_run_id)` 返回和旧 JSON store 相同的嵌套结构。
- [ ] 写测试：不存在的 run 调用 `load_run()` 抛出 `FileNotFoundError`。
- [ ] 在 `graph_run_db_store.py` 实现 `save_run_state(run_state)`：
  - upsert `graph_runs`
  - upsert latest `graph_run_snapshots`
  - replace 当前 run 的 `graph_node_executions`
  - replace 当前 run 的 result-level `graph_run_events`
  - replace 当前 run 的 `graph_state_events`
  - replace 当前 run 的 `graph_outputs`
  - replace 当前 run 的 `graph_artifacts`
  - replace 当前 run 的 capability/model call rows when present
- [ ] 在 `graph_run_db_store.py` 实现 `load_run_state(run_id)`，由事实表重组现有 run dict shape。
- [ ] 在 `run_store.py` 保留函数名：
  - `save_run(run_state)`
  - `load_run(run_id)`
  - `list_runs()`
  - `list_child_runs(parent_run_id)`
  - `build_run_tree(run_id)`
- [ ] 从 `run_store.py` 移除 `RUN_DATA_DIR`、`read_json_file()`、`write_json_file()` 依赖。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_graph_run_db_store.py backend/tests/test_run_tree_store.py -q
```

- [ ] 提交：

```bash
git add backend/app/core/storage/run_store.py backend/app/core/storage/graph_run_db_store.py backend/tests/test_graph_run_db_store.py backend/tests/test_run_tree_store.py
git commit -m "将图运行存储切换为数据库"
```

**Done when:** 所有现有 run_store 调用方不改 import 也能读写 DB，并且不再创建 `backend/data/runs/*.json`。

---

## Task 3: Runs API 使用 DB facts 组装响应

**Files:**

- Modify `backend/app/api/routes_runs.py`
- Modify `backend/tests/test_routes_runs.py`

- [ ] 更新 route 测试：不再 patch JSON 行为，改用临时 DB 写入 run facts 后调用 TestClient。
- [ ] 覆盖 `/api/runs`：
  - 默认隐藏普通 internal run。
  - 继续显示 `buddy_autonomous_review` 和 `buddy_context_compaction` 审计 run。
  - `graph_name` 和 `status` 过滤保持一致。
- [ ] 覆盖 `/api/runs/{run_id}`：
  - 返回 `children` direct child summaries。
  - `restorable_snapshot_available` 由 snapshot graph presence 计算。
  - `run_snapshot_options` 从 `graph_run_snapshots` 计算。
- [ ] 覆盖 `/api/runs/{run_id}/tree`：返回 root/child/grandchild 嵌套树。
- [ ] 覆盖 `/api/runs/{run_id}/nodes/{node_id}`：从 `graph_node_executions` 返回节点详情。
- [ ] 确认 `/api/runs/{run_id}/events` 仍只依赖 run 是否存在和内存 SSE，不读取 token 级历史。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_routes_runs.py -q
```

- [ ] 提交：

```bash
git add backend/app/api/routes_runs.py backend/tests/test_routes_runs.py
git commit -m "让运行接口读取数据库事实"
```

**Done when:** Runs API 行为保持兼容，但底层数据全部来自 `toograph.db`。

---

## Task 4: 运行时结果级事实写入

**Files:**

- Modify `backend/app/core/runtime/state.py`
- Modify `backend/app/core/runtime/run_artifacts.py`
- Modify `backend/app/core/runtime/node_execution_records.py`
- Modify `backend/app/core/langgraph/finalization.py`
- Modify `backend/tests/test_runtime_progress_persistence.py`
- Modify `backend/tests/test_runtime_run_artifacts.py`
- Modify `backend/tests/test_runtime_activity_events.py`
- Modify `backend/tests/test_runtime_state_io.py`

- [ ] 写测试：run 创建后立即存在 `graph_runs` 行，状态为 running。
- [ ] 写测试：节点开始/完成写入 `graph_node_executions`，包含 `order_index`、`node_id`、`node_type`、`duration_ms`、warnings/errors。
- [ ] 写测试：state write 写入 `graph_state_events`，最终 `state_snapshot` 可由 DB 重建。
- [ ] 写测试：output 节点结果写入 `graph_outputs`，且 output preview 仍出现在 `RunDetail.output_previews`。
- [ ] 写测试：activity event 的结果级摘要写入 `graph_run_events`，不保存 `node.output.delta` 或 token delta。
- [ ] 写测试：capability invocation 输出进入 `graph_capability_invocations` 并能回到 `RunDetail.capability_outputs`。
- [ ] 写测试：run completed/failed/paused 时写入 final snapshot，`completed_at`、`duration_ms` 和 lifecycle 更新一致。
- [ ] 在 runtime 中把每次 `save_run(run_state)` 保持为事务型 upsert；需要频繁调用时避免全量 JSON 文件式思维，但本阶段允许 replace 当前 run 派生行，先保证正确性。
- [ ] 对大 state value 调用 `content_blob_store.maybe_inline_or_ref()`；小值继续 JSON inline。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_runtime_progress_persistence.py backend/tests/test_runtime_run_artifacts.py backend/tests/test_runtime_activity_events.py backend/tests/test_runtime_state_io.py -q
```

- [ ] 提交：

```bash
git add backend/app/core/runtime/state.py backend/app/core/runtime/run_artifacts.py backend/app/core/runtime/node_execution_records.py backend/app/core/langgraph/finalization.py backend/tests/test_runtime_progress_persistence.py backend/tests/test_runtime_run_artifacts.py backend/tests/test_runtime_activity_events.py backend/tests/test_runtime_state_io.py
git commit -m "持久化图运行结果级事实"
```

**Done when:** 一次真实图运行完成后，删除内存状态仍可从 DB 恢复运行详情、state、outputs、节点执行和事件摘要。

---

## Task 5: Buddy 历史迁入统一 DB

**Files:**

- Modify `backend/app/buddy/home.py`
- Modify `backend/app/buddy/store.py`
- Modify `backend/app/api/routes_buddy.py`
- Modify `backend/tests/test_buddy_store.py`
- Modify `backend/tests/test_buddy_routes.py`

- [ ] 写测试：初始化 Buddy Home 时继续创建 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`，但不创建 `buddy_home/buddy.db`。
- [ ] 写测试：`buddy_sessions`、`buddy_messages`、`buddy_message_revisions` 在 `toograph.db` 中创建。
- [ ] 写测试：追加 user/assistant 消息后，消息顺序、`include_in_context`、`run_id`、`metadata_json` 保持。
- [ ] 写测试：assistant 消息只保存最终回复文本和 run 引用，不保存 output trace/public output 派生详情。
- [ ] 写测试：软删除 session 后默认列表隐藏，`include_deleted=True` 可见。
- [ ] 写测试：message FTS 和 trigram FTS 随消息 insert/update/delete 同步。
- [ ] 在 `home.py` 中删除或停用 `ensure_buddy_database()` 对 `buddy_home/buddy.db` 的事实库创建；若保留函数名，仅让它确保统一 DB schema 已存在。
- [ ] 在 `store.py` 中将 session/message/revision/kv/command 操作全部改为 `database.get_connection()`。
- [ ] `buddy_messages` 设计为 append-first：
  - `message_id`
  - `session_id`
  - `role`
  - `content`
  - `include_in_context`
  - `run_id`
  - `metadata_json`
  - `created_at`
  - `deleted_at`
- [ ] `buddy_message_revisions` 记录每次内容变更，context assembly 引用具体 revision。
- [ ] `buddy_message_run_refs` 支持一个消息关联多个 run；当前先写 primary `run_id` 和一条 ref。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_buddy_store.py backend/tests/test_buddy_routes.py -q
```

- [ ] 提交：

```bash
git add backend/app/buddy/home.py backend/app/buddy/store.py backend/app/api/routes_buddy.py backend/tests/test_buddy_store.py backend/tests/test_buddy_routes.py
git commit -m "将伙伴历史迁入统一数据库"
```

**Done when:** Buddy 对话读写不再依赖 `buddy_home/buddy.db`，每条 assistant 消息可通过 run_id 找到对应图运行详情。

---

## Task 6: Context Assembly 与 Buddy conversation_history 引用化

**Files:**

- Create `backend/app/core/storage/context_assembly_store.py`
- Modify `backend/app/core/runtime/agent_prompt.py`
- Modify `backend/app/core/runtime/state_io.py`
- Modify `frontend/src/buddy/buddyChatGraph.ts`
- Modify `frontend/src/buddy/buddyChatGraph.test.ts`
- Create `backend/tests/test_context_assembly_store.py`
- Modify `backend/tests/test_agent_state_prompt_semantics.py`

- [ ] 写后端测试：创建 context assembly 时保存 renderer、renderer_version、budget、source refs、rendered content hash。
- [ ] 写后端测试：同一 rendered text 写入多次只产生一个 `content_blobs` 记录。
- [ ] 写后端测试：prompt expansion 遇到 `context_assembly_ref` 时展开 rendered blob。
- [ ] 写后端测试：rendered blob 缺失时按 source refs 重建；hash 不匹配时产生 audit warning。
- [ ] 写前端测试：Buddy graph source values 中 `conversation_history` 不再是完整文本，而是 `context_assembly_ref` 结构。
- [ ] `context_assembly_store.py` 提供：
  - `create_context_assembly(...) -> dict[str, Any]`
  - `load_context_assembly(assembly_id: str) -> dict[str, Any]`
  - `expand_context_assembly_ref(ref: dict[str, Any]) -> dict[str, Any]`
- [ ] source 类型至少支持：
  - `buddy_message`
  - `buddy_session_summary`
  - `memory_entry`
  - `retrieval_chunk`
  - `graph_run`
  - `graph_output`
- [ ] `context_assembly_ref` state value 使用稳定 shape：

```json
{
  "kind": "context_assembly_ref",
  "assembly_id": "ctx_...",
  "target_state_key": "conversation_history",
  "renderer_key": "buddy_history",
  "renderer_version": "1",
  "rendered_content_hash": "sha256:...",
  "source_count": 0
}
```

- [ ] `buddyChatGraph.ts` 只构造 ref 和最小 preview，不再重复写完整聊天历史。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_context_assembly_store.py backend/tests/test_agent_state_prompt_semantics.py -q
node --test frontend/src/buddy/buddyChatGraph.test.ts
```

- [ ] 提交：

```bash
git add backend/app/core/storage/context_assembly_store.py backend/app/core/runtime/agent_prompt.py backend/app/core/runtime/state_io.py backend/tests/test_context_assembly_store.py backend/tests/test_agent_state_prompt_semantics.py frontend/src/buddy/buddyChatGraph.ts frontend/src/buddy/buddyChatGraph.test.ts
git commit -m "用上下文组装引用替代重复聊天历史"
```

**Done when:** Buddy 主循环 run record 可以审计当时使用的上下文来源和 rendered hash，但 run snapshot 不再重复保存完整历史全文。

---

## Task 7: 前端 Buddy 胶囊完全从 RunDetail 重建

**Files:**

- Modify `frontend/src/buddy/BuddyWidget.vue`
- Modify `frontend/src/buddy/useBuddyMessages.ts`
- Modify `frontend/src/buddy/useBuddyRunDisplayMessages.ts`
- Modify `frontend/src/buddy/buddyOutputTrace.ts`
- Modify `frontend/src/buddy/useBuddyRunTraceDisplay.ts`
- Modify `frontend/src/buddy/buddyMessageMetadata.ts`
- Modify `frontend/src/buddy/buddyOutputTrace.test.ts`
- Modify `frontend/src/buddy/useBuddyRunDisplayMessages.test.ts`
- Create `frontend/src/buddy/useBuddyMessages.test.ts`
- Modify `frontend/src/buddy/buddyMessageMetadata.test.ts`
- Modify `frontend/src/api/buddy.test.ts`

- [ ] 写测试：保存 assistant message 时 payload 只包含最终回复文本、session_id、run_id、普通 metadata。
- [ ] 写测试：`outputTrace` 和 `publicOutput` metadata 不再通过 `persistBuddyMessage()` 写入。
- [ ] 写测试：给定一个 `RunDetail`，`buildBuddyOutputTraceStateFromRunDetail()` 仍按 output 边界分段：
  - 上游非 output 边界节点形成胶囊。
  - 同一个边界节点连接的多个 output 跟在同一胶囊后。
  - 内部决策节点不单独形成胶囊。
- [ ] 写测试：历史消息列表拿到 message.run_id 后，调用 runs API 拉取 run detail 并重建胶囊显示。
- [ ] 写测试：run detail 缺失时 UI 显示可恢复的错误状态，不使用旧 metadata 假装恢复成功。
- [ ] `BuddyWidget.vue` 中 `finishBuddyVisibleRun()` 删除 output trace/public output 持久化分支。
- [ ] `useBuddyMessages.ts` 将派生 display messages 视为运行时 view model，不写回 Buddy message store。
- [ ] `buddyMessageMetadata.ts` 保留对旧类型的解析测试只用于防御，不作为主显示逻辑。
- [ ] 运行验证：

```bash
node --test frontend/src/buddy/buddyOutputTrace.test.ts frontend/src/buddy/useBuddyRunDisplayMessages.test.ts frontend/src/buddy/useBuddyMessages.test.ts frontend/src/buddy/buddyMessageMetadata.test.ts frontend/src/api/buddy.test.ts
```

- [ ] 提交：

```bash
git add frontend/src/buddy/BuddyWidget.vue frontend/src/buddy/useBuddyMessages.ts frontend/src/buddy/useBuddyRunDisplayMessages.ts frontend/src/buddy/buddyOutputTrace.ts frontend/src/buddy/useBuddyRunTraceDisplay.ts frontend/src/buddy/buddyMessageMetadata.ts frontend/src/buddy/buddyOutputTrace.test.ts frontend/src/buddy/useBuddyRunDisplayMessages.test.ts frontend/src/buddy/useBuddyMessages.test.ts frontend/src/buddy/buddyMessageMetadata.test.ts frontend/src/api/buddy.test.ts
git commit -m "从图运行事实重建伙伴胶囊"
```

**Done when:** 删除 Buddy 消息中的派生 output trace metadata 后，历史对话仍能通过 run_id 展示胶囊、outputs 和展开详情。

---

## Task 8: Retrieval Documents、FTS、Trigram 与 LIKE fallback

**Files:**

- Create `backend/app/core/storage/retrieval_store.py`
- Modify `backend/app/core/storage/database.py`
- Create `backend/tests/test_retrieval_store.py`
- Modify `backend/tests/test_buddy_session_recall_action.py`
- Modify `backend/tests/test_knowledge_hybrid.py`

- [ ] 写测试：Buddy message、graph output、node summary、memory entry 可以投影成 `retrieval_documents` 和 `retrieval_chunks`。
- [ ] 写测试：FTS 查询返回 chunk、snippet、score 和 source ref。
- [ ] 写测试：trigram FTS 支持中文子串查询。
- [ ] 写测试：短 CJK query 使用 LIKE fallback 并返回上下文窗口。
- [ ] 写测试：删除并重建 retrieval index 后，事实表未变化，召回结果可恢复。
- [ ] `retrieval_documents` 字段至少包含：
  - `document_id`
  - `source_kind`
  - `source_id`
  - `source_revision_id`
  - `title`
  - `scope_json`
  - `metadata_json`
  - `content_hash`
  - `created_at`
  - `updated_at`
- [ ] `retrieval_chunks` 字段至少包含：
  - `chunk_id`
  - `document_id`
  - `source_kind`
  - `source_id`
  - `source_locator_json`
  - `ordinal`
  - `content`
  - `content_hash`
  - `token_estimate`
  - `metadata_json`
- [ ] `retrieval_store.py` 提供：
  - `upsert_retrieval_document(...)`
  - `upsert_retrieval_chunks(...)`
  - `search_retrieval_fts(query, filters, limit)`
  - `rebuild_retrieval_indexes(scope: dict[str, Any] | None = None)`
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_retrieval_store.py backend/tests/test_buddy_session_recall_action.py backend/tests/test_knowledge_hybrid.py -q
```

- [ ] 提交：

```bash
git add backend/app/core/storage/database.py backend/app/core/storage/retrieval_store.py backend/tests/test_retrieval_store.py backend/tests/test_buddy_session_recall_action.py backend/tests/test_knowledge_hybrid.py
git commit -m "添加统一召回全文索引"
```

**Done when:** 召回系统可以从统一 retrieval index 检索 Buddy 消息、运行输出和记忆来源，并能回指原始事实。

---

## Task 9: Embedding Store 与混合召回

**Files:**

- Create `backend/app/core/storage/embedding_store.py`
- Modify `backend/app/core/storage/retrieval_store.py`
- Modify `backend/app/core/storage/database.py`
- Create `backend/tests/test_embedding_store.py`
- Modify `backend/tests/test_knowledge_hybrid.py`

- [ ] 写测试：`embedding_models` 可以注册 provider/model/dimension/distance_metric。
- [ ] 写测试：同一 chunk content hash 和 model 下重复 upsert 不重复生成 vector 行。
- [ ] 写测试：`embedding_jobs` 支持 pending/running/completed/failed 状态和错误记录。
- [ ] 写测试：没有 SQLite vector extension 时，应用层 cosine similarity 返回稳定排序。
- [ ] 写测试：混合召回合并 FTS 分数、vector 分数、metadata filter 和 recency boost。
- [ ] 写测试：召回结果写入 `retrieval_queries` 和 `retrieval_results`，方便审计 run 使用了什么上下文。
- [ ] `embedding_store.py` 提供：
  - `register_embedding_model(...)`
  - `queue_embedding_job(source_kind, source_id, model_ref)`
  - `upsert_embedding_vector(chunk_id, model_ref, vector, content_hash)`
  - `search_embedding_vectors(query_vector, filters, limit)`
- [ ] vector 存储第一阶段使用 JSON 或 packed bytes；接口保留 `dimension` 和 `distance_metric`，后续可切换 sqlite-vss/sqlite-vec。
- [ ] `retrieval_store.py` 增加 `hybrid_search(query, filters, embedding_model_ref, limit)`。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_embedding_store.py backend/tests/test_knowledge_hybrid.py -q
```

- [ ] 提交：

```bash
git add backend/app/core/storage/database.py backend/app/core/storage/embedding_store.py backend/app/core/storage/retrieval_store.py backend/tests/test_embedding_store.py backend/tests/test_knowledge_hybrid.py
git commit -m "添加向量召回存储"
```

**Done when:** 即使没有本地向量扩展，也能用完整 embedding 表结构和应用层近邻计算完成可审计混合召回。

---

## Task 10: Memory Store 与 Buddy 记忆召回链路

**Files:**

- Create `backend/app/core/storage/memory_store.py`
- Modify `backend/app/buddy/store.py`
- Modify `action/official/buddy_session_recall/action.json`
- Modify `action/official/buddy_session_recall/after_llm.py`
- Modify `backend/tests/test_buddy_session_recall_action.py`
- Create `backend/tests/test_memory_store.py`

- [ ] 写测试：memory entry 创建后生成 revision、event 和 retrieval document。
- [ ] 写测试：memory entry source 可以引用 buddy message revision、graph run、graph output、retrieval chunk。
- [ ] 写测试：更新/归档 memory entry 后保留旧 revision，并更新 retrieval projection。
- [ ] 写测试：Buddy recall action 返回 memory entries、message snippets、run outputs，并包含 source refs。
- [ ] 写测试：召回结果进入 context assembly sources，而不是直接拼成不可追溯文本。
- [ ] `memory_entries` 支持字段：
  - `memory_id`
  - `scope_kind`
  - `scope_id`
  - `layer`
  - `memory_type`
  - `status`
  - `title`
  - `content`
  - `confidence`
  - `salience`
  - `metadata_json`
  - `created_at`
  - `updated_at`
- [ ] `memory_store.py` 提供：
  - `create_memory_entry(...)`
  - `update_memory_entry(...)`
  - `archive_memory_entry(...)`
  - `list_memory_entries(filters)`
  - `recall_memories(query, filters, limit)`
- [ ] Buddy 自配置和记忆更新仍通过图/Action 流程触发；store 只提供 primitive，不内置 Buddy 产品策略。
- [ ] 运行验证：

```bash
python -m pytest backend/tests/test_memory_store.py backend/tests/test_buddy_session_recall_action.py -q
```

- [ ] 提交：

```bash
git add backend/app/core/storage/memory_store.py backend/app/buddy/store.py action/official/buddy_session_recall/action.json action/official/buddy_session_recall/after_llm.py backend/tests/test_memory_store.py backend/tests/test_buddy_session_recall_action.py
git commit -m "添加伙伴记忆事实存储"
```

**Done when:** Buddy 召回可以混合使用长期记忆、消息、运行输出和节点摘要，且每条上下文都能追溯来源。

---

## Task 11: Run Detail、运行历史页与审计可视性

**Files:**

- Modify `frontend/src/api/runs.ts`
- Modify `frontend/src/pages/RunDetailPage.vue`
- Modify `frontend/src/pages/runDetailModel.ts`
- Modify `frontend/src/pages/RunsPage.vue`
- Modify `frontend/src/pages/runDetailModel.test.ts`
- Modify `frontend/src/pages/runsPageModel.test.ts`

- [ ] 写测试：Run Detail model 可以展示 context assembly refs、source count、renderer、rendered hash。
- [ ] 写测试：Run Detail model 可以展示 retrieval query/result audit summary。
- [ ] 写测试：Run list 过滤和排序不依赖旧 JSON 字段。
- [ ] UI 增加最小审计入口：
  - context sources count
  - retrieved memories count
  - retrieved chunks count
  - content hash / source kind / source id
- [ ] 大内容显示为 hash/path/ref 摘要，用户展开时再请求详情；本阶段避免把大 blob 自动塞进列表页。
- [ ] 运行验证：

```bash
node --test frontend/src/pages/runDetailModel.test.ts frontend/src/pages/runsPageModel.test.ts frontend/src/api/runs.test.ts
```

- [ ] 提交：

```bash
git add frontend/src/api/runs.ts frontend/src/pages/RunDetailPage.vue frontend/src/pages/runDetailModel.ts frontend/src/pages/RunsPage.vue frontend/src/pages/runDetailModel.test.ts frontend/src/pages/runsPageModel.test.ts frontend/src/api/runs.test.ts
git commit -m "展示图运行上下文审计信息"
```

**Done when:** 用户可以从运行详情看出一次 run 使用了哪些上下文来源和召回结果，但 UI 不复制事实数据。

---

## Task 12: 端到端清理、启动验证与文档收尾

**Files:**

- Modify `docs/superpowers/specs/2026-05-26-graph-run-store-memory-recall-design.md` if implementation details diverge.
- Modify `docs/README.md` to reference Graph Run Store and memory recall docs.
- Modify `README.md` only if user-facing storage or testing instructions change.

- [ ] 搜索并移除旧事实源依赖：

```bash
rg "RUN_DATA_DIR|backend/data/runs|buddy\\.db|outputTrace|publicOutput|conversation_history" backend frontend docs
```

- [ ] 对仍然出现的项逐个分类：
  - 合法：文档说明旧数据不迁移。
  - 合法：测试 fixture 特意验证旧 metadata 不再作为事实源。
  - 需要修复：运行时或 UI 主路径仍读写旧事实源。
- [ ] 运行后端重点测试：

```bash
python -m pytest backend/tests/test_storage_database.py backend/tests/test_graph_run_db_store.py backend/tests/test_routes_runs.py backend/tests/test_runtime_progress_persistence.py backend/tests/test_runtime_run_artifacts.py backend/tests/test_runtime_activity_events.py backend/tests/test_runtime_state_io.py backend/tests/test_buddy_store.py backend/tests/test_buddy_routes.py backend/tests/test_context_assembly_store.py backend/tests/test_retrieval_store.py backend/tests/test_embedding_store.py backend/tests/test_memory_store.py backend/tests/test_buddy_session_recall_action.py -q
```

- [ ] 运行前端重点测试：

```bash
node --test frontend/src/api/runs.test.ts frontend/src/api/buddy.test.ts frontend/src/buddy/buddyOutputTrace.test.ts frontend/src/buddy/useBuddyRunDisplayMessages.test.ts frontend/src/buddy/buddyMessageMetadata.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/pages/runDetailModel.test.ts frontend/src/pages/runsPageModel.test.ts
```

- [ ] 运行全量常用测试：

```bash
python -m pytest backend/tests
node --test $(find frontend/src -name '*.test.ts' -print)
```

- [ ] 启动验证：

```bash
npm start
```

- [ ] 浏览器验证默认地址：
  - `http://127.0.0.1:3477`
  - 创建一次普通图运行。
  - 打开 Runs 页，确认列表和详情从 DB 读取。
  - 发起一次 Buddy 对话，确认消息只保存最终回复和 run_id。
  - 关闭/刷新页面，确认 Buddy 历史胶囊从 run detail 重建。
  - 展开胶囊，确认子图和 output 边界展示一致。
  - 检查运行详情上下文来源和召回 audit。
- [ ] 提交文档与清理：

```bash
git add docs/superpowers/specs/2026-05-26-graph-run-store-memory-recall-design.md docs/README.md README.md
git commit -m "更新图运行存储实施文档"
```

**Done when:** 应用从统一 DB 完成图运行、Buddy 历史、胶囊重建和记忆召回闭环；旧 JSON/Buddy DB 不再是主路径。

---

## 开发顺序建议

推荐按任务编号顺序执行。原因是：

1. Schema 和 DB-backed run_store 是后续所有工作的基础。
2. Runs API 保持响应形状后，前端可以晚一点切换，降低 UI 中断。
3. Runtime 持久化必须早于 Buddy 胶囊改造，否则前端没有可靠事实可读。
4. Context assembly 必须早于 embedding/memory 完整接入，否则召回结果仍会回到不可审计拼接文本。
5. FTS 可以先于 embedding 上线，给 Buddy recall 先提供可用精确检索。
6. Embedding 和 Memory Store 最后接入，避免在事实源尚不稳定时扩大索引面。

每个任务完成后执行对应验证并提交。若某个任务超过一个工作日，应拆成更小提交，但不要改变事实源边界。

---

## 风险控制

- **事务一致性:** `save_run()` 和运行时结果级 facts 写入必须在单连接事务内完成；失败时不能只写一半 node execution。
- **大内容:** 大 state、rendered prompt、模型响应和 artifact 摘要使用 `content_blobs` 或 artifact path，不直接塞进列表响应。
- **召回污染:** FTS/vector 索引是派生层；删除索引后必须能从 facts 重建。
- **历史可审计:** 即使源消息后来修订，旧 run 的 context assembly 仍通过 source revision 和 rendered blob hash 证明当时上下文。
- **UI 显示:** Buddy 胶囊必须只按 output 边界分段，不能因为 DB 改造引入内部节点胶囊。
- **权限边界:** memory updates、Buddy self-configuration 和图修改仍通过图/Action/approval 表达；store 不内置隐藏策略。

---

## 完成标准

- `backend/data/toograph.db` 是图运行和 Buddy 历史的统一事实库。
- `backend/data/runs/*.json` 不再由运行主路径读写。
- `buddy_home/buddy.db` 不再作为事实库创建或读取。
- `/api/runs`、`/api/runs/{run_id}`、`/api/runs/{run_id}/tree` 从 DB facts 组装响应。
- Buddy message 只保存消息事实和 run refs，不保存胶囊事实。
- Buddy 历史胶囊、输出和展开详情都能从 run_id 关联的 `RunDetail` 重建。
- `conversation_history` 通过 `context_assembly_ref` 保存来源，不重复内联完整历史。
- FTS、trigram、LIKE fallback、embedding 混合召回都能返回可追溯 source refs。
- 记忆条目有 source、revision、event，并能进入 retrieval index。
- 重点测试、全量后端测试、全量前端结构/逻辑测试通过。
- `npm start` 能在 `http://127.0.0.1:3477` 启动并完成手动端到端验证。

---

## 自检结论

这份计划覆盖了表结构、存储 API、运行时写入、API 返回、Buddy 历史、胶囊显示、context assembly、FTS、embedding、memory store、测试和手动验收。实现时不需要再讨论旧数据迁移或兼容策略；如果出现疑问，应回到“图运行事实唯一来源”和“派生索引可重建”两条原则判断。
