# Model Provider Model Capabilities Design

## Context

TooGraph 的模型供应商页面已经以 Provider 作为配置单位：一个 Provider 代表一个渠道连接，例如 LM Studio、OpenAI-compatible gateway、OpenAI Codex 登录、阿里百炼或其他 API 服务。未来记忆召回和知识库会依赖 embedding 模型，但 embedding 不应该被设计成独立于 Provider 的另一套页面结构，也不应该和 LLM 在视觉上硬拆成左右两个长期区域。

用户当前选择的本地 embedding 模型是 `text-embedding-qwen3-embedding-8b`。这个模型应该作为 LM Studio Provider 下的一个模型对象出现，并通过模型能力标记为 embedding。

## Decision

Model Providers 页面继续以 Provider 卡片为主要结构。每个 Provider 卡片内不再把模型展示为简单 pill 堆叠，而是升级为一组模型行。每个模型行代表一个模型对象，并拥有独立能力配置。

核心原则：

- Provider 管连接：base URL、API key、auth、transport、启用状态、模型发现。
- Model 管能力：chat、embedding、rerank、vision、tool call、structured output 等。
- 不使用 `model_type = llm | embedding` 这种互斥类型；使用可扩展的 `capabilities` 对象。
- embedding 和 rerank 是模型能力，不是 Provider 级别开关。
- 默认模型下拉框按能力过滤，而不是显示所有模型。

## Provider Card Layout

每个 Provider 卡片保留现有头部信息：Provider 名称、Provider ID、transport、启用开关、base URL 或登录状态、添加模型、配置 Provider。

模型区域改为行式布局：

```text
Qwen3.6 35B A3B                      Chat · Vision · Tools     Configure  Remove
text-embedding-qwen3-embedding-8b     Embedding                 Configure  Remove
```

行内只显示高频识别信息：

- 模型名。
- 能力 badge。
- 配置按钮。
- 移除按钮。

模型名占据主要空间；能力 badge 和按钮固定在右侧。长模型名允许省略，但通过 title 或 tooltip 展示完整名称。

## Expanded Model Panel

点击 Configure 后，模型行下方展开小面板。面板用于配置模型能力和能力相关参数。

能力选择：

```text
Capabilities
[x] Chat
[ ] Embedding
[ ] Rerank
[x] Vision
[x] Tool calls
[x] Structured output
```

当 `chat` 启用时显示：

- 上下文窗口。
- 压缩触发阈值。
- 可选默认温度或推理等级覆盖项。

当 `embedding` 启用时显示：

- 向量维度。
- 是否作为默认检索 embedding 候选。
- 适用范围：记忆召回、知识库，默认两者都启用。
- 索引状态摘要：未索引、索引中、已同步、需要重建。
- 重新索引入口。

当 `rerank` 启用时显示：

- 默认是否用于检索重排。
- 查询时 top N 候选数。
- 失败时是否回退到 embedding 分数和关键词混排。

第一版可以只实现能力配置和 chat/embedding 的必要字段；rerank 字段可先作为协议预留，不必暴露完整工作流。

## Model Capability Detection

模型发现后，系统自动给模型能力一个初始判断，但用户可以手动修改。

判断优先级：

1. Provider discovery 如果返回明确 capabilities，则优先使用。
2. 否则用模型名称启发式识别。
3. 用户手动修改后，以用户设置为准。

embedding 名称识别关键词包括：

- `embedding`
- `embed`
- `text-embedding`
- `qwen3-embedding`
- `bge`
- `e5`
- `gte`
- `jina-embeddings`
- `nomic-embed`
- `snowflake-arctic-embed`
- `voyage`
- `mxbai-embed`

rerank 名称识别关键词包括：

- `rerank`
- `reranker`
- `bge-reranker`
- `gte-rerank`
- `qwen-rerank`

如果模型名无法判断，默认作为 chat 候选，除非 Provider 明确声明它不是 chat 模型。

## Default Model Selection

默认模型选择必须按 capabilities 过滤：

- 默认文本模型只显示 `capabilities.chat = true` 的模型。
- 默认视频或视觉模型只显示 `capabilities.chat = true` 且 `capabilities.vision = true` 的模型，或者允许回退到普通 chat 模型。
- 默认检索 embedding 模型只显示 `capabilities.embedding = true` 的模型。
- 默认 rerank 模型只显示 `capabilities.rerank = true` 的模型。

如果没有可用 embedding 模型，记忆召回和知识库页面应显示明确缺失状态，而不是让用户从聊天模型里误选。

## Memory And Knowledge Retrieval Defaults

UI 默认只展示一个“默认检索 Embedding 模型”，用于记忆召回和知识库语义检索。

高级设置可支持覆盖：

```text
Default retrieval embedding: text-embedding-qwen3-embedding-8b
Memory recall: use default
Knowledge base: use default
```

底层设置可以预留：

- `default_embedding_model_ref`
- `memory_embedding_model_ref`
- `knowledge_embedding_model_ref`

但第一版 UI 不强迫用户分别配置记忆和知识库 embedding。

## Data Shape

Provider 保存模型列表时，每个模型应保留能力和能力相关设置：

```json
{
  "model": "text-embedding-qwen3-embedding-8b",
  "label": "text-embedding-qwen3-embedding-8b",
  "capabilities": {
    "chat": false,
    "embedding": true,
    "rerank": false,
    "vision": false,
    "tool_call": false,
    "structured_output": false
  },
  "embedding": {
    "dimensions": 4096,
    "use_for_memory": true,
    "use_for_knowledge": true
  }
}
```

Existing chat fields such as `context_window` and `compression_threshold` remain model-level settings and should only appear when chat capability is enabled.

## Error Handling

If a model marked as embedding fails an embedding request, TooGraph should show the failure near the model row and in the relevant indexing job details. The model should not be silently reclassified.

If a user removes an embedding model that is currently selected as the default retrieval model, TooGraph should clear or replace that default explicitly and show a visible warning.

If changing an embedding model invalidates existing vectors, TooGraph should mark affected memory or knowledge indexes as needing rebuild rather than silently mixing vector spaces.

## Responsive Behavior

On wide desktop screens, model rows keep model name, badges, configure, and remove actions on one line.

On narrow screens, model row content stacks:

```text
model name
badges
Configure  Remove
```

Expanded panels remain inline below the owning model row.

## Out Of Scope

This design does not require a separate LLM/Embedding page tab.

This design does not require left/right LLM versus embedding columns.

This design does not require implementing rerank execution in the first pass.

This design does not require separate memory and knowledge embedding defaults in the primary UI.

## Acceptance Criteria

- A Provider card can show chat and embedding models together without visual ambiguity.
- `text-embedding-qwen3-embedding-8b` is automatically identified as an embedding model by name.
- Users can manually change model capabilities.
- Default model selectors are filtered by capability.
- Chat-only settings do not appear for embedding-only models.
- Embedding settings do not appear for chat-only models.
- Removing a model remains a distinct action from collapsing its configuration panel.
