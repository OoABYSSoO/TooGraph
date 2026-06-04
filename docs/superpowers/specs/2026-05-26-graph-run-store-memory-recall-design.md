# 图运行存储与记忆召回设计

> 历史说明：本文保留图运行存储、Buddy 历史和早期记忆召回设计背景。Embedding、retrieval、聊天记忆召回、上下文压缩和知识库入库的全局目标设计已由 `docs/embedding-retrieval-lifecycle-design.md` 接管；本文中的 embedding 相关段落不再作为新实现依据。

## 背景

TooGraph 的长期方向是图优先：Buddy 的可见行为、能力选择、文件写入、页面操作、记忆整理和自我改进，都应该表现为可审计的图运行，而不是隐藏在产品特化的命令式代码里。

当前运行时已经记录了比较丰富的运行信息，但普通图运行主要保存为 `backend/data/runs/<run_id>.json`，Buddy 对话历史则保存在 `buddy_home/buddy.db`。这会带来几个问题：

- 运行记录可查，但不在统一数据库里，不适合复杂筛选、召回、统计和跨页面 join。
- Buddy 胶囊、运行详情页、播放页和历史对话显示容易保存各自的派生状态，长期会形成多个事实源。
- Buddy 主循环会把格式化后的 `conversation_history` 写入图输入和 state，容易在每次 run 中重复保存大量相同聊天历史。
- 记忆召回需要从聊天、运行、输出、节点摘要、长期记忆中混合检索，但当前缺少统一的可追溯召回索引。

目标设计是：

- 图运行记录成为所有执行事实的唯一事实源。
- Buddy 胶囊、运行历史、运行详情、播放页、审计页，都从图运行事实重新投影出来。
- Buddy 历史只保存消息和 run 引用，不保存胶囊事实和运行详情副本。
- 记忆召回使用 FTS 和 embedding 等派生索引，但每个召回结果都能追溯回原始消息、run、节点、输出、artifact 或记忆条目。

本文是目标存储模型和数据流设计，不是实现计划。

## 核心决策

建立数据库化的 Graph Run Store，并把它作为所有图执行事实的权威来源。

Graph Run Store 负责保存：

- run 元数据、状态和父子关系。
- 运行时图快照和 state 快照。
- 节点执行记录。
- 有序事件流水。
- state 写入事件。
- output 节点输出。
- Action、Tool、Subgraph 等 capability 调用。
- 模型调用记录。
- artifact 和生成文件引用。
- checkpoint 和可恢复快照。
- 本次 run 使用的上下文组装记录。

Buddy 历史只负责保存：

- 用户和伙伴消息。
- 消息顺序。
- 是否进入模型上下文。
- 消息和 run 的引用关系。
- 作为对话内容存在的最终回复文本。

Buddy 历史不负责保存：

- 胶囊。
- 运行步骤。
- output trace 状态。
- 图播放详情。
- 节点执行详情。
- 每次 run 重复内联的完整聊天历史。

FTS、trigram FTS、embedding、retrieval documents 和 retrieval chunks 都是派生索引。它们可以删除后从事实表重建，不是事实源。

## 已确认实现口径

### 数据库位置

目标使用统一 SQLite 数据库，优先放在现有 `backend/data/toograph.db`。

理由：

- `backend/data/` 已经是 TooGraph 运行时数据根目录。
- `toograph.db` 已经承载知识库、embedding 和评测等应用级结构化数据。
- Graph Run Store、Buddy 历史、记忆和召回索引需要跨表 join，不适合继续分散在 `runs/*.json`、`buddy_home/buddy.db` 和其他旁路数据库里。
- `buddy_home/` 应继续作为 Buddy Home 文档和本地可读上下文目录，不应成为执行事实源数据库所在位置。

目标形态是一个应用级 workspace database：

```text
backend/data/toograph.db
```

如未来需要重命名为 `workspace.db` 或其他名称，应作为单独产品决策处理；本设计按现有 `toograph.db` 继续扩展。

### 不迁移现有测试数据

当前本地数据库、JSON run 文件和 Buddy 历史都视为测试数据。实现时不需要迁移这些数据，也不需要做旧存储兼容读取。

落地时可以采用直接替换：

- `run_store.py` 改为 DB-backed。
- `/api/runs` 从 DB 读取。
- Buddy 历史从统一 DB 读取。
- 不做 JSON run fallback。
- 不做 `buddy_home/buddy.db` 到统一 DB 的迁移。
- 不保留旧胶囊 metadata 的兼容显示路径作为长期方案。

这能避免为了测试数据保留错误边界。

### API 与 UI 关系

存储层不兼容旧 JSON 文件，但前端 API 返回形状可以保持接近现有 `RunDetail`，以减少胶囊、运行详情页和播放页的改动范围。

换句话说：

- 存储后端直接换成 DB。
- UI 仍然通过 `run_id` 获取 run detail。
- run detail 由 DB facts 组装。
- 不让 UI 感知旧 JSON 存储是否存在。

### 流式细节边界

不持久化 token 级或 delta 级流式细节。

不需要长期保存：

- `node.output.delta`
- token-by-token streaming frame
- 仅用于直播动画的临时事件

必须持久化结果级事实：

- 每个节点最终写出的 state。
- 每个 state write 的最终值或 content ref。
- 每个 output 节点最终产生的输出。
- 每个 node execution 的开始、结束、状态、耗时和摘要。
- capability 调用输入输出。
- activity event 的结果级摘要。
- model call 的最终 request/response 审计信息，按隐私策略保存 hash、摘要或 blob。

历史胶囊和运行详情需要复现“发生了什么”和“产出了什么”，不需要复现直播时每个 token 如何出现。

所有运行中产出的 state 都属于结果事实，必须持久化。这里的 state 包括：

- 最终 state snapshot。
- 每次节点完成后写入的 state values。
- output 节点读取或导出的 state values。
- capability result package 中的结构化 outputs。
- 失败、暂停、恢复时已经确定写入的 state values。

如果某个 state 值很大，持久化的是 content ref 和 hash；值本体进入 `content_blobs` 或 artifact。

### Context Assembly 设计由运行时拥有

`context_assembly_ref` 是正式 state value 形态之一，不是 Buddy 特殊旁路。

运行时在准备 LLM prompt 时，如果遇到 `context_assembly_ref`，应通过统一 prompt expansion 路径解析到文本。解析过程应：

- 读取 `context_assemblies`。
- 按 `context_assembly_sources.order_index` 读取来源。
- 优先使用 rendered content blob。
- 如果 blob 缺失，再尝试按 source refs 重建。
- 如果重建结果 hash 不匹配，标记 audit warning。

LLM 节点看到的是展开后的上下文文本；run record 保存的是可追溯引用和 hash。

### Hermes 参考结论

Hermes 的会话存储给 TooGraph 的主要启发是：

- 用 SQLite 作为会话和消息事实库。
- 用 FTS5 作为普通全文搜索索引。
- 额外使用 trigram FTS 支持 CJK 和子串搜索。
- 对很短的 CJK query 使用 LIKE fallback。
- 搜索结果返回 snippet 和上下文窗口，但最终仍回到原始 session/message 记录。

Hermes 当前会话召回并不是完整 embedding 记忆库。TooGraph 应借鉴 Hermes 的事实表、FTS、trigram 和 fallback 设计，但不应止步于此。TooGraph 的目标是完整混合召回：

- FTS 负责精确词、标识符、错误、文件路径和中文子串。
- Embedding 负责语义相似、概念召回和跨措辞召回。
- SQL 结构化过滤负责 scope、session、graph、时间和权限边界。
- Context assembly 负责把召回结果变成可审计的运行输入。

### Embedding 结论

采用完整 embedding provider/model 方案。

实现上可以先有降级路径，但目标设计必须包含：

- 可配置 embedding provider 和 model。
- 稳定 chunk 粒度。
- content hash 去重。
- 增量 embedding job。
- 多模型并存。
- query embedding。
- 向量检索。
- FTS + vector + metadata filter 的混合排序。

如果运行环境没有 SQLite 向量扩展，第一阶段可以用应用层最近邻计算作为实现手段；但表结构和接口应按完整 embedding 检索设计，避免以后重做。

## 完整对话全文与消息引用

### 问题

Buddy 主循环启动时通常需要一个 `conversation_history` 输入。最简单的做法是把最近聊天记录渲染成一段文本，然后写入图 input 节点和 state。

这个做法虽然让单个 run 看起来很自包含，但它会重复保存大量相同文本。例如：

- 第 10 次 run 保存消息 1 到 9。
- 第 11 次 run 保存消息 1 到 10。
- 第 12 次 run 保存消息 1 到 11。

随着对话变长，同一批历史消息会被不断复制到不同 run 中。这会带来几个副作用：

- 存储重复。
- 搜索结果噪声变大。
- embedding 重复计算。
- 很难判断某段历史文本的权威来源到底是消息表还是某次 run。
- 修改、删除或修订消息后，旧 run 中内联的历史文本会和消息事实分叉。

### 更好的边界

如果每条 Buddy 消息都已经被保存为可引用、可版本化的事实，那么 run 不需要把完整聊天历史作为主要事实重复内联。

run 应该保存上下文组装引用，例如：

```json
{
  "kind": "context_assembly_ref",
  "assembly_id": "ctx_abc123",
  "target_state_key": "conversation_history",
  "renderer_key": "buddy_history",
  "renderer_version": "3",
  "rendered_content_hash": "sha256:...",
  "source_count": 14
}
```

真正记录“这段上下文是怎么来的”的，是 `context_assemblies` 和 `context_assembly_sources`：

- 用了哪个 session summary revision。
- 用了哪些 message revision。
- 用了哪些 memory entry。
- 用了哪些 retrieval chunk。
- 使用哪个 renderer。
- 使用什么 token/字符预算。
- 渲染后的内容 hash 是什么。

图 state 仍然是 schema-backed。区别是某些上下文型 state value 可以是结构化 `context_assembly_ref`，在准备 LLM prompt 时由统一 prompt expansion 路径展开成文本。

### 已有引用后，还需要保存完整对话全文吗

结论是：**不应该在每次 run 中重复保存完整对话全文；但为了审计，可以保存一次去重后的最终渲染文本。**

完整渲染文本仍有价值，原因是：

- 可以证明当时模型实际看到了什么。
- 可以调试 prompt assembly。
- 可以对比不同 renderer 版本。
- 即使后续消息被编辑、删除、归档或脱敏，旧 run 仍可复核。
- 可以避免 renderer 未来变化导致历史 run 被重建成不同上下文。

关键区别是：不要把它重复内联在每个 run JSON 或 graph snapshot 里。

推荐做法：

```text
content_blobs.content_hash -> 压缩后的渲染上下文文本
context_assemblies.rendered_content_hash -> content_blobs.content_hash
```

如果两个 run 生成完全相同的上下文，它们共享同一个 blob。如果上下文不同，hash 不同。

### 推荐策略

分三层处理：

1. source 引用必须保存。
2. source hash 和 rendered hash 必须保存。
3. 渲染后的全文 blob 可配置，但强烈建议为 LLM prompt 审计保存。

这样可以同时得到低重复和高可审计性。

### 如果消息后来变化怎么办

Buddy 消息默认应尽量 append-only。如果需要编辑或脱敏，就要引入 revision：

- `buddy_messages.message_id` 表示逻辑消息。
- `buddy_message_revisions.revision_id` 表示当时的具体版本。
- `context_assembly_sources` 引用 `message_id + revision_id + content_hash`。

如果源消息后来不可用，但 rendered blob 还在，旧 run 仍能审计。如果源消息和 rendered blob 都缺失，UI 应提示该 run 只能部分恢复，绝不能静默用当前消息重新拼一份不同上下文并当作历史事实。

## Graph Run Store 表

### `graph_runs`

一条 run 一行，是运行列表、状态查询、父子 run 树的入口。

```sql
CREATE TABLE graph_runs (
  run_id TEXT PRIMARY KEY,
  root_run_id TEXT NOT NULL,
  parent_run_id TEXT,
  parent_node_id TEXT,
  invocation_kind TEXT NOT NULL DEFAULT 'root',
  invocation_key TEXT NOT NULL DEFAULT '',
  run_depth INTEGER NOT NULL DEFAULT 0,
  run_path_json TEXT NOT NULL DEFAULT '[]',

  graph_id TEXT,
  graph_name TEXT NOT NULL,
  template_id TEXT,
  template_version TEXT,

  status TEXT NOT NULL,
  runtime_backend TEXT NOT NULL DEFAULT '',
  current_node_id TEXT,

  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,

  final_result TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  lifecycle_json TEXT NOT NULL DEFAULT '{}',
  checkpoint_metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

推荐索引：

```sql
CREATE INDEX idx_graph_runs_started ON graph_runs(started_at DESC);
CREATE INDEX idx_graph_runs_status ON graph_runs(status, started_at DESC);
CREATE INDEX idx_graph_runs_parent ON graph_runs(parent_run_id, started_at);
CREATE INDEX idx_graph_runs_root ON graph_runs(root_run_id, run_depth, started_at);
CREATE INDEX idx_graph_runs_graph ON graph_runs(graph_id, started_at DESC);
```

### `graph_run_snapshots`

保存可恢复的图快照、state 快照、artifact 摘要和节点状态。

```sql
CREATE TABLE graph_run_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  current_node_id TEXT,
  created_at TEXT NOT NULL,

  graph_snapshot_json TEXT NOT NULL,
  state_snapshot_json TEXT NOT NULL,
  node_status_map_json TEXT NOT NULL DEFAULT '{}',
  subgraph_status_map_json TEXT NOT NULL DEFAULT '{}',
  output_previews_json TEXT NOT NULL DEFAULT '[]',
  artifacts_json TEXT NOT NULL DEFAULT '{}',
  checkpoint_metadata_json TEXT NOT NULL DEFAULT '{}',
  final_result TEXT NOT NULL DEFAULT ''
);
```

`graph_snapshot_json` 应描述当时实际执行的图结构。对于大型上下文输入，优先保存 `context_assembly_ref`，避免把完整历史文本重复塞进每个图快照。

### `graph_node_executions`

保存节点执行尝试。运行详情页、胶囊展开、审计详情和耗时统计都依赖它。

```sql
CREATE TABLE graph_node_executions (
  execution_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  parent_execution_id TEXT,
  order_index INTEGER NOT NULL,
  attempt INTEGER,

  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  node_name TEXT NOT NULL DEFAULT '',
  subgraph_node_id TEXT,
  subgraph_path_json TEXT NOT NULL DEFAULT '[]',

  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,

  input_summary TEXT NOT NULL DEFAULT '',
  output_summary TEXT NOT NULL DEFAULT '',

  artifacts_json TEXT NOT NULL DEFAULT '{}',
  state_reads_json TEXT NOT NULL DEFAULT '[]',
  state_writes_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]'
);
```

推荐索引：

```sql
CREATE INDEX idx_graph_node_executions_run_order
  ON graph_node_executions(run_id, order_index);
CREATE INDEX idx_graph_node_executions_node
  ON graph_node_executions(run_id, node_id, started_at);
```

### `graph_run_events`

运行事件流水账，是结果级回放和审计的基础。

```sql
CREATE TABLE graph_run_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,

  event_type TEXT NOT NULL,
  node_id TEXT,
  execution_id TEXT,
  activity_id TEXT,
  parent_activity_id TEXT,
  invocation_id TEXT,

  status TEXT,
  created_at TEXT NOT NULL,
  duration_ms INTEGER,
  payload_json TEXT NOT NULL DEFAULT '{}'
);
```

推荐索引：

```sql
CREATE UNIQUE INDEX idx_graph_run_events_sequence
  ON graph_run_events(run_id, sequence);
CREATE INDEX idx_graph_run_events_type
  ON graph_run_events(event_type, created_at DESC);
```

`graph_node_executions` 是摘要，`graph_run_events` 是时间线事实。胶囊、播放页和调试工具可以从事件重放出运行过程。

本表不持久化 token 级或 delta 级流式细节。事件粒度应覆盖节点生命周期、activity event、state write、output completed、capability invocation 和 run lifecycle。直播 UI 可以继续消费 SSE delta，但历史记录只保证结果级重建。

### `graph_state_events`

保存 state 写入历史，用于 state 演变、重复输出、diff 和回放。

```sql
CREATE TABLE graph_state_events (
  state_event_id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES graph_run_events(event_id) ON DELETE SET NULL,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,

  node_id TEXT NOT NULL,
  execution_id TEXT,
  state_key TEXT NOT NULL,
  output_key TEXT NOT NULL,
  mode TEXT,

  previous_value_hash TEXT,
  previous_value_json TEXT,
  value_hash TEXT,
  value_json TEXT,

  created_at TEXT NOT NULL
);
```

大型值应使用 hash 和 content ref，而不是直接塞进 JSON：

```json
{
  "kind": "content_ref",
  "content_hash": "sha256:...",
  "mime_type": "text/markdown"
}
```

### `graph_outputs`

保存 output 节点输出事实。它不是 Buddy message，也不是胶囊。

```sql
CREATE TABLE graph_outputs (
  output_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  event_id TEXT REFERENCES graph_run_events(event_id) ON DELETE SET NULL,

  output_node_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  display_mode TEXT NOT NULL DEFAULT 'markdown',

  status TEXT NOT NULL,
  occurrence_index INTEGER NOT NULL DEFAULT 0,

  value_hash TEXT,
  value_json TEXT,
  persist_enabled INTEGER NOT NULL DEFAULT 0,
  persist_format TEXT NOT NULL DEFAULT '',
  saved_artifact_id TEXT,

  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

Buddy 胶囊应由 `graph_snapshot_json`、`graph_node_executions`、`graph_run_events` 和 `graph_outputs` 重新构建。不要创建 `buddy_capsules` 表。

### `graph_artifacts`

保存生成文件和外部资源引用。文件本体仍然保存在本地文件系统。

```sql
CREATE TABLE graph_artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  execution_id TEXT,
  node_id TEXT,

  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  mime_type TEXT,
  format TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL
);
```

### `graph_capability_invocations`

保存 Action、Tool、Subgraph 等能力调用。

```sql
CREATE TABLE graph_capability_invocations (
  invocation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  execution_id TEXT,
  node_id TEXT NOT NULL,

  kind TEXT NOT NULL,
  capability_key TEXT NOT NULL,
  capability_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,

  input_hash TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_hash TEXT,
  output_json TEXT NOT NULL DEFAULT '{}',

  child_run_id TEXT,
  approval_id TEXT,

  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error_json TEXT NOT NULL DEFAULT '{}'
);
```

### `graph_model_calls`

保存 LLM 调用审计。

```sql
CREATE TABLE graph_model_calls (
  model_call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  execution_id TEXT,
  node_id TEXT NOT NULL,
  phase TEXT NOT NULL,

  provider_key TEXT,
  model TEXT,
  status TEXT NOT NULL,

  request_hash TEXT,
  request_json TEXT,
  request_blob_hash TEXT,
  response_hash TEXT,
  response_json TEXT,
  response_blob_hash TEXT,

  usage_json TEXT NOT NULL DEFAULT '{}',
  cost_json TEXT NOT NULL DEFAULT '{}',

  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  error_json TEXT NOT NULL DEFAULT '{}'
);
```

是否保存完整 prompt 要受隐私和本地策略控制。可以只在 `request_json` 中保存脱敏摘要和 hash，把完整内容放到可配置的 `content_blobs`。

### `graph_checkpoints`

保存 checkpoint 元数据和可选 payload。

```sql
CREATE TABLE graph_checkpoints (
  checkpoint_row_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT,

  checkpoint_id TEXT NOT NULL,
  thread_id TEXT,
  checkpoint_ns TEXT,
  saver TEXT,

  checkpoint_payload_hash TEXT,
  checkpoint_payload_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL
);
```

如果目标是只依赖数据库恢复，checkpoint payload 应保存在这里，或通过 `content_blobs` 引用。

## Context Assembly 表

Context Assembly 是图执行和历史/记忆/知识来源之间的桥。它记录上下文是如何组装的，而不是把所有源文本复制到每个 run 中。

### `content_blobs`

内容寻址存储，用于去重保存文本或 JSON payload。

```sql
CREATE TABLE content_blobs (
  content_hash TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  encoding TEXT NOT NULL DEFAULT 'utf-8',
  compression TEXT NOT NULL DEFAULT 'none',
  size_bytes INTEGER NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL
);
```

适合保存：

- 渲染后的 `conversation_history`。
- 完整模型 prompt。
- 大型 state value。
- artifact 文本抽取内容。
- 脱敏后的审计 payload。

### `context_assemblies`

一次 run 中某个上下文输入的组装记录。

```sql
CREATE TABLE context_assemblies (
  assembly_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,

  target_node_id TEXT,
  target_state_key TEXT NOT NULL,
  target_input_name TEXT NOT NULL DEFAULT '',

  assembly_kind TEXT NOT NULL,
  renderer_key TEXT NOT NULL,
  renderer_version TEXT NOT NULL,
  token_budget INTEGER,
  char_budget INTEGER,

  rendered_content_hash TEXT,
  rendered_preview TEXT NOT NULL DEFAULT '',
  token_count INTEGER,
  char_count INTEGER,

  source_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL
);
```

`assembly_kind` 示例：

- `buddy_conversation_history`
- `memory_recall_context`
- `knowledge_context`
- `file_context`
- `model_prompt`

### `context_assembly_sources`

保存一次 assembly 使用的精确来源。

```sql
CREATE TABLE context_assembly_sources (
  assembly_source_id TEXT PRIMARY KEY,
  assembly_id TEXT NOT NULL REFERENCES context_assemblies(assembly_id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,

  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision_id TEXT,

  run_id TEXT,
  session_id TEXT,
  message_id TEXT,
  memory_id TEXT,
  retrieval_doc_id TEXT,
  chunk_id TEXT,
  artifact_id TEXT,

  source_content_hash TEXT,
  included_content_hash TEXT,
  included_chars INTEGER,
  included_tokens INTEGER,
  score REAL,

  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
```

`source_type` 示例：

- `buddy_message`
- `buddy_session_summary`
- `memory_entry`
- `retrieval_chunk`
- `graph_run`
- `graph_output`
- `node_execution`
- `artifact`

这张表回答的问题是：这次 run 为什么看到了这些上下文。

## Buddy 历史表

### `buddy_sessions`

保存逻辑对话会话。

```sql
CREATE TABLE buddy_sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  parent_session_id TEXT,
  source TEXT NOT NULL DEFAULT 'buddy',
  ended_at TEXT,
  end_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `buddy_messages`

保存逻辑消息。

```sql
CREATE TABLE buddy_messages (
  message_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES buddy_sessions(session_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  client_order REAL,
  include_in_context INTEGER NOT NULL DEFAULT 1,
  primary_run_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

不要把胶囊 metadata 当成长期事实保存。如果历史数据中存在 `output_trace` 或 `public_output` metadata，它们只能被视为 cache 或迁移材料，不是权威事实。

### `buddy_message_revisions`

保存消息版本，用于审计和历史上下文重建。

```sql
CREATE TABLE buddy_message_revisions (
  revision_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES buddy_messages(message_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  operation TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  created_at TEXT NOT NULL
);
```

即使消息默认 append-only，也可以创建初始 revision，方便 context assembly 引用稳定版本。

### `buddy_message_run_refs`

保存消息和 run 的多对多关系。

```sql
CREATE TABLE buddy_message_run_refs (
  message_id TEXT NOT NULL REFERENCES buddy_messages(message_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, run_id, relation)
);
```

`relation` 示例：

- `primary`
- `background_review`
- `target_run`
- `auto_resume`
- `memory_review`

Buddy 对话窗口加载时，应先加载 messages，再根据 run refs 加载 Graph Run Store 里的 run detail，然后重新构建胶囊和 output card。

## 旧 Buddy Message Metadata 处理

当前实现里，Buddy 完成一次可见 run 后，可能把 `output_trace` 和 `public_output` 作为 message metadata 存进 `buddy_messages.metadata_json`。目标设计中，这些 metadata 不能继续作为长期事实。

原因：

- `output_trace` 是 UI 投影结果，不是执行事实。
- `public_output` 可以从 `graph_outputs` 和 state/output records 重建。
- 持久化投影结果会让 Buddy 历史和 Graph Run Store 形成两个事实源。
- 一旦胶囊显示逻辑改变，旧 metadata 会变成陈旧 UI 快照。
- embedding 和 FTS 如果索引这些 metadata，会放大重复内容和过期显示状态。

目标处理策略：

1. 新写入的 Buddy message 不再保存 `output_trace`。
2. 新写入的 Buddy message 不再把 `public_output` 作为权威内容保存到 metadata。
3. 伙伴最终回复文本可以作为普通 assistant message content 保存，因为它是对话事实。
4. 胶囊、output card、运行步骤全部通过 `run_id` 从 Graph Run Store 重建。
5. 如果历史测试数据里存在旧 metadata，不做迁移，不做长期兼容。
6. 如果加载路径遇到旧 metadata，只有在没有 `run_id` 的孤立消息上可以当作临时 cache 显示；一旦存在 `run_id`，必须忽略 metadata 并以 Graph Run Store 为准。
7. 旧 metadata 不进入 retrieval documents，不进入 embedding，不进入 memory candidates。

这条策略和“不迁移测试数据”一致。目标不是保住旧测试历史的显示，而是消除未来事实源分叉。

## Memory Store 表

记忆不是原始历史。记忆是从事实中提炼出来的、未来值得主动召回的稳定上下文。

### `memory_entries`

长期记忆主表。

```sql
CREATE TABLE memory_entries (
  memory_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,

  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  normalized_content TEXT,
  status TEXT NOT NULL,

  salience REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,
  decay_policy TEXT,
  valid_from TEXT,
  valid_until TEXT,
  superseded_by TEXT,

  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`scope` 示例：

- `global`
- `user`
- `buddy`
- `project`
- `graph`
- `session`

`kind` 示例：

- `preference`
- `fact`
- `decision`
- `summary`
- `workflow_lesson`
- `correction`
- `capability_hint`

`status` 示例：

- `draft`
- `active`
- `superseded`
- `retracted`
- `archived`

### `memory_sources`

保存记忆证据来源。

```sql
CREATE TABLE memory_sources (
  source_id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memory_entries(memory_id) ON DELETE CASCADE,

  source_type TEXT NOT NULL,
  source_ref_id TEXT NOT NULL,

  run_id TEXT,
  message_id TEXT,
  message_revision_id TEXT,
  node_execution_id TEXT,
  output_id TEXT,
  artifact_id TEXT,

  quote TEXT,
  source_hash TEXT,
  created_at TEXT NOT NULL
);
```

除非是用户手动创建的记忆，否则每条长期记忆都应至少有一个 evidence source。

### `memory_candidates`

后台复盘图产出的候选记忆。

```sql
CREATE TABLE memory_candidates (
  candidate_id TEXT PRIMARY KEY,
  source_run_id TEXT NOT NULL REFERENCES graph_runs(run_id) ON DELETE CASCADE,
  source_session_id TEXT,

  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  proposed_action TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low',
  confidence REAL NOT NULL DEFAULT 0.5,

  status TEXT NOT NULL,
  reviewer TEXT,
  applied_memory_id TEXT,

  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
```

`proposed_action` 示例：

- `create`
- `update`
- `supersede`
- `retract`
- `ignore`

`status` 示例：

- `pending`
- `approved`
- `rejected`
- `applied`

后台复盘图应该先产候选，不应该静默把所有内容直接写入长期记忆。

### `memory_revisions`

保存可恢复的记忆变更。

```sql
CREATE TABLE memory_revisions (
  revision_id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memory_entries(memory_id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  previous_value_json TEXT NOT NULL,
  next_value_json TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  source_run_id TEXT,
  created_at TEXT NOT NULL
);
```

## Retrieval 索引表

Retrieval 层服务于记忆召回、Buddy 会话召回和 run 搜索。它是从事实表派生出来的索引层。

### `retrieval_documents`

可检索文档头表。

```sql
CREATE TABLE retrieval_documents (
  doc_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,

  run_id TEXT,
  session_id TEXT,
  memory_id TEXT,
  graph_id TEXT,
  node_id TEXT,
  artifact_id TEXT,

  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body_hash TEXT,
  scope TEXT NOT NULL DEFAULT 'default',
  tags_json TEXT NOT NULL DEFAULT '[]',

  salience REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_updated_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`entity_type` 示例：

- `buddy_message`
- `session_summary`
- `memory_entry`
- `graph_run`
- `graph_output`
- `node_execution`
- `activity_event`
- `artifact`
- `model_call`

### `retrieval_chunks`

chunk 级召回单元。

```sql
CREATE TABLE retrieval_chunks (
  chunk_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES retrieval_documents(doc_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,

  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  text_preview TEXT NOT NULL DEFAULT '',
  token_count INTEGER,
  char_count INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  created_at TEXT NOT NULL
);
```

完整 chunk 文本可以放在 `content_blobs`，用 `text_hash` 引用。

### FTS 表

建议同时使用普通 FTS 和 trigram FTS：

```sql
CREATE VIRTUAL TABLE retrieval_chunks_fts USING fts5(
  title,
  text,
  keywords,
  content=''
);

CREATE VIRTUAL TABLE retrieval_chunks_fts_trigram USING fts5(
  title,
  text,
  keywords,
  content='',
  tokenize='trigram'
);
```

也可以使用 external-content FTS 绑定物化搜索表。关键不变量是：FTS 数据必须是派生且可重建的。

普通 FTS 用于：

- 英文词。
- 精确标识符。
- 文件名。
- 错误消息。
- 协议字段。
- Action key、node id、run id。

trigram FTS 用于：

- 中文、日文、韩文。
- 子串搜索。
- 用户不记得完整词的模糊搜索。

对于 1 到 2 个中文字符的短查询，trigram 可能无法有效命中，应 fallback 到 LIKE。

### `embedding_models`

保存可用 embedding 模型配置和索引语义。

```sql
CREATE TABLE embedding_models (
  embedding_model_id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  distance_metric TEXT NOT NULL DEFAULT 'cosine',
  vector_format TEXT NOT NULL DEFAULT 'float32',
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider_key, model)
);
```

`distance_metric` 默认使用 `cosine`。如果向量保存时已经 normalize，也应在 `metadata_json` 中记录。

### `embedding_vectors`

保存 retrieval chunk 的语义向量。

```sql
CREATE TABLE embedding_vectors (
  embedding_id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES retrieval_chunks(chunk_id) ON DELETE CASCADE,
  embedding_model_id TEXT NOT NULL REFERENCES embedding_models(embedding_model_id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  distance_metric TEXT NOT NULL DEFAULT 'cosine',
  vector_blob BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (chunk_id, embedding_model_id, content_hash)
);
```

embedding 应该建立在稳定、去重后的 chunk 上，而不是建立在每次 run 重复渲染出来的 conversation history 上。

### `embedding_jobs`

保存增量索引任务，避免同步路径阻塞 Buddy 回复。

```sql
CREATE TABLE embedding_jobs (
  job_id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL REFERENCES retrieval_chunks(chunk_id) ON DELETE CASCADE,
  embedding_model_id TEXT NOT NULL REFERENCES embedding_models(embedding_model_id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (chunk_id, embedding_model_id, content_hash)
);
```

触发 embedding job 的情况：

- 新增 retrieval chunk。
- chunk 的 `text_hash` 变化。
- 启用新的 embedding model。
- 需要重建某个 scope、session、graph 或 memory 范围的索引。

query 时如果 embedding 未完成，应降级到 FTS 和结构化召回，而不是阻塞主运行。

适合做 embedding 的内容：

- 用户消息。
- 伙伴最终回复。
- session summary。
- 长期 memory entry。
- run summary。
- output summary。
- node execution summary。
- error summary。
- capability invocation summary。
- artifact 文本摘录。

不适合直接做 embedding 的内容：

- 完整 raw run JSON。
- 完整 graph snapshot。
- 完整 state snapshot。
- base64。
- 大型二进制 artifact。
- 重复渲染的 conversation history。
- 临时运行噪声。

### 向量检索实现

目标接口是向量相似度检索，而不是绑定某一个 SQLite 扩展。

优先级：

1. 如果部署环境有稳定 SQLite 向量扩展，使用数据库内向量索引。
2. 如果没有扩展，先用应用层最近邻搜索读取候选向量并计算 cosine similarity。
3. 始终先做结构化过滤，缩小候选范围，再计算向量相似度。

这保持完整 embedding 设计，同时避免第一阶段被扩展安装和平台兼容性卡住。

## 记忆召回流程

### 1. 构造查询上下文

一次新的 Buddy turn 开始时，从以下材料构造召回 query：

- 当前用户消息。
- 当前图或页面上下文。
- 当前 session id。
- 当前项目或 graph id。
- Buddy mode。
- 当前可用 capability 上下文。

### 2. 结构化过滤

先用 SQL 过滤召回范围：

- scope。
- session lineage。
- 当前 project。
- 当前 graph。
- 时间范围。
- visibility。
- 权限边界。
- deleted/archived 状态。

这一步很重要。embedding 相似不等于应该召回，必须先排除作用域不对的材料。

### 3. 词法召回

用 FTS 召回：

- 精确术语。
- 错误消息。
- 文件路径。
- run id。
- node id。
- Action key。
- 模型名。
- 中文子串。

### 4. 语义召回

用 embedding 召回：

- 同义表达。
- 概念相似。
- 相似历史讨论。
- 相似失败案例。
- 相似用户偏好。

embedding 对这类问题尤其有用：

- “我们之前是不是讨论过不要重复保存历史？”
- “上次那个胶囊显示的问题是什么？”
- “我倾向的那个数据库设计是什么？”

这些 query 未必和历史材料共享完全相同的关键词。

### 5. 合并与排序

使用混合分数：

```text
score =
  lexical_score
  + semantic_score
  + salience
  + confidence
  + scope_match
  + recency_boost
  - staleness_penalty
  - conflict_penalty
```

不要让 embedding 相似度单独压过 scope、recency 或用户明确纠正。

### 6. 构造 context assembly

被选中的召回结果进入 `context_assembly`：

- 记录 doc id、chunk id、memory id。
- 记录分数和排序原因。
- 记录 source hash。
- 必要时保存渲染后的上下文 blob。
- run state 中只保存 context ref，而不是重复保存所有 source 文本。

### 7. 保存召回审计

保存召回诊断记录：

当前实现使用两张通用审计表，而不是 Buddy 专用事件表：

```sql
CREATE TABLE retrieval_queries (
  query_id TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  embedding_model_ref TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'hybrid',
  run_id TEXT NOT NULL DEFAULT '',
  session_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE retrieval_results (
  result_id TEXT PRIMARY KEY,
  query_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  chunk_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  lexical_score REAL NOT NULL DEFAULT 0,
  vector_score REAL NOT NULL DEFAULT 0,
  final_score REAL NOT NULL DEFAULT 0,
  source_ref_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

这两张表回答的问题是：这次召回用了什么 query/filter/model，返回了哪些 chunk/source refs，以及排序分数是什么。

## Buddy 胶囊和运行显示重建

Buddy 胶囊应该从 Graph Run Store 重建：

1. 加载 Buddy session messages。
2. 找到消息关联的 run refs。
3. 根据 `run_id` 加载 run detail。
4. 从 run 的 graph snapshot 计算 output bindings。
5. 从 graph snapshot 计算 output boundary trace plan。
6. 回放 node executions 和 run events，得到 trace runtime state。
7. 加载 graph outputs 和 state events，得到 public output state。
8. 渲染胶囊和 output message。

不需要持久化 `buddy_capsules`。短期 UI cache 可以存在，但不能成为事实源。

## 搜索和召回不是事实

以下数据是可重建派生索引：

- FTS 表。
- trigram FTS 表。
- embedding vectors。
- retrieval documents。
- retrieval chunks，前提是能从事实表和 content blobs 重新生成。

以下数据是事实：

- Buddy messages 和 message revisions。
- Graph runs。
- Node executions。
- Run events。
- State events。
- Outputs。
- Artifacts。
- Model calls。
- Context assemblies。
- Context assembly sources。
- Content blobs。
- Memory entries 和 memory revisions。

## 数据卫生

避免保存：

- raw logs 作为记忆。
- 完整错误 dump 作为记忆。
- 临时路径作为长期记忆。
- 密钥。
- base64。
- 大型二进制值进 JSON。
- 每次 run 重复保存的完整 conversation history。

优先保存：

- 稳定标识符。
- revision id。
- hash。
- 短摘要。
- source links。
- artifact paths。
- 可重建索引。
- 去重 content blobs。

## 恢复语义

一个 run 可完整恢复的条件：

- 存在 `graph_run_snapshots`。
- 存在 node executions 和 run events。
- 存在 output records。
- 存在它引用的 context assembly。
- assembly sources 可解析，或 rendered content blob 仍存在。
- 必要 artifact 仍存在于引用路径，或能通过 content hash 验证。

一个 run 可部分恢复的条件：

- 图结构和节点执行历史仍可用。
- 部分上下文 source 或 artifact 文件缺失。
- UI 可以展示 run，但必须显示 warning。

UI 绝不能静默重建不同的历史上下文，并把它当作原始运行事实展示。

## 推荐近期落地形态

第一阶段不需要把每个 JSON payload 都过度范式化。推荐优先建立：

- `graph_runs`
- `graph_run_snapshots`
- `graph_node_executions`
- `graph_run_events`
- `graph_state_events`
- `graph_outputs`
- `graph_artifacts`
- `content_blobs`
- `context_assemblies`
- `context_assembly_sources`
- `buddy_message_run_refs`
- `memory_entries`
- `memory_sources`
- `memory_candidates`
- `memory_revisions`
- `retrieval_documents`
- `retrieval_chunks`
- `embedding_models`
- `embedding_vectors`
- `embedding_jobs`
- FTS 和 trigram FTS 表

复杂 payload 可以继续使用 JSON 列，但用于筛选、排序、join、ranking 的字段必须提升为结构化列。

第一阶段应直接使用 `backend/data/toograph.db`，不实现旧 JSON run 文件和 `buddy_home/buddy.db` 的迁移/兼容读取。现有本地数据视为测试数据。

## 验证把控

后续开发应至少覆盖这些验证面：

- 新 run 写入 DB 后，`/api/runs/{run_id}` 能由 DB facts 组装出 run detail。
- Buddy 对话消息只保存消息和 run refs，不保存新胶囊 metadata。
- 胶囊从 `run_id` 重新构建，刷新页面后显示一致。
- 运行详情页从 Graph Run Store 读取节点执行、outputs、artifacts 和 state。
- run 中产出的 state values 都能在 DB 中找到结果级记录。
- token/delta 流式事件不进入长期存储。
- context assembly 能记录 source refs、hash、renderer 和预算。
- context assembly 缺失 source 或 hash 不匹配时能产生 warning。
- FTS、trigram FTS 和 LIKE fallback 能覆盖普通英文、标识符和中文短查询。
- embedding job 能按 content hash 去重，chunk 不变时不重复计算。
- embedding 未完成时召回降级到 FTS，不阻塞 Buddy 主循环。
- 旧 `output_trace` / `public_output` metadata 不再作为事实参与显示、召回或 embedding。

## 非目标

本设计不要求把生成文件本体移动到 SQLite。

本设计不要求迁移现有 JSON run 文件、现有 `toograph.db` 测试内容或现有 `buddy_home/buddy.db` 测试内容。

本设计不要求保留旧 JSON run 文件或旧 Buddy DB 作为兼容读取路径。

本设计不把 embedding 当成事实源。

本设计不把 Buddy 胶囊作为事实保存。

本设计不把 memory update 隐藏到后端策略代码里。记忆创建和修改仍应通过图模板流程和受控 writer Action 完成。

## 仍需实施计划细化的问题

以下问题不改变总体设计，但需要在 implementation plan 中落到具体步骤：

- `content_blobs` 第一阶段只压缩，还是同时支持加密。
- 第一个真实 embedding provider 和默认 embedding model。
- SQLite 向量扩展是否作为可选增强，应用层最近邻作为默认 fallback。
- 完整 prompt blob 默认保留策略和 UI 开关。
- 用户脱敏或删除历史时，旧 context assembly、message revisions 和 content blob 的处理规则。
- Graph Run Store schema 拆分成哪些 Python storage 模块。
- 运行时哪些位置负责创建 context assembly。

## 总结

目标结构是：

- 每条 Buddy 消息只保存一次。
- 每次图运行保存为规范化执行事实。
- Graph Run Store 直接落在统一 `backend/data/toograph.db`。
- 不迁移、不兼容现有测试数据。
- 运行中产出的所有结果级 state 都持久化。
- 上下文组装保存 source refs、revision、hash 和分数。
- 只有需要审计时，才把最终渲染上下文保存为去重 content blob。
- 召回建立在稳定 chunks 上，通过 FTS、trigram FTS、LIKE fallback 和完整 embedding 方案混合检索。
- 胶囊、运行历史、播放页和记忆召回显示都从规范化事实重新构建。

这样既能避免每次 run 重复保存聊天历史全文，又能解释和复现每次 run 当时到底看到了什么。
