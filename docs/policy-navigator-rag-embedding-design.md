# Policy Navigator Agent RAG 与 Embedding 打磨设计

整理日期：2026-06-02

本文面向面试作品打磨，目标是把 `policy_navigator_agent` 从轻量政策解读模板升级为可演示、可评测、可审计的政策 RAG Agent。它描述理想形态和落地顺序，不把当前尚未完成的能力包装成已完成事实。

## 定位

`policy_navigator_agent` 适合成为 TooGraph 面试主讲场景，因为政策解读同时要求：

- 结论必须可追溯到政策原文、条款、来源和版本。
- 资格判断必须保守，不能承诺行政审批结果。
- 检索必须能解释命中原因、排序依据和遗漏原因。
- 高风险资料需要引用校验、版本冲突检查和人工确认建议。
- 多步流程适合用 TooGraph 图模板显式表达，而不是隐藏在后端黑盒里。

面试中的一句话定位：

> TooGraph 将政策解读做成图协议驱动的 Agentic RAG 工作流：文档进入知识库后生成可追溯 chunk 和 embedding，Agent 先规划检索，再执行 hybrid retrieval 与 rerank，最后用 citation-aware 节点生成保守资格判断、行动清单和风险提示。

## 理想工作流

```text
政策来源 / 政策文件 / 用户画像
-> 文档解析与版本识别
-> 政策知识库 ingestion
-> 结构化 chunk
-> embedding job 入队
-> embedding maintenance 图处理向量
-> query planning
-> hybrid retrieval
-> rerank
-> citation-aware 条款结构化
-> 资格保守判断
-> citation verification
-> uncertainty check
-> final policy package
```

这条链路的重点不是“回答更像人”，而是让回答背后的资料、检索、判断和风险边界都能被复查。

## Embedding 制作流程

理想的 embedding 制作流程分为数据生产、向量生产和检索消费三段。

### 1. 文档接入

输入可以来自：

- 用户粘贴的政策正文。
- Markdown、PDF、Word 或 HTML 文件。
- 政府网站 URL。
- 多个版本的政策文件或转载页面。

每份文档进入系统时应生成稳定记录：

- `document_id`
- `source_kind`
- `source_url`
- `issuer`
- `published_at`
- `effective_at`
- `region`
- `policy_type`
- `version`
- `content_hash`
- `metadata`

政策场景不能只保存正文文本。来源、发布机关、日期和版本是后续资格判断与风险提示的一部分。

### 2. 结构化 Chunk

政策文档不应只按固定字符数粗切。理想切块顺序是：

1. 按标题层级和条款号切分。
2. 对超长条款再按段落或 token 预算切分。
3. 对表格、材料清单、时间窗口保留结构化 metadata。
4. 每个 chunk 保留 source locator。

每个 chunk 至少包含：

- `chunk_id`
- `document_id`
- `ordinal`
- `title`
- `section`
- `clause_id`
- `content`
- `summary`
- `source_locator`
- `token_estimate`
- `content_hash`
- `metadata`

政策类 RAG 的 citation 必须能落回具体条款，而不是只落回整份文档。

### 3. Embedding 模型选择

Embedding 模型从 Model Providers 中选择。TooGraph 的理想边界是：

- Provider 管连接、凭据和 transport。
- Model 管能力，例如 `chat`、`embedding`、`rerank`。
- 模型可标记 `use_for_memory` 和 `use_for_knowledge`。
- 向量记录必须保存 `embedding_model_ref`、维度和距离度量。

关键规则：

```text
生成 chunk 向量用什么 embedding 模型，查询向量就必须用同一个模型。
```

不允许用真实 embedding provider 生成 chunk 向量，却用 local hash 生成 query 向量再直接比较。

### 4. Job 入队

Chunk 写入后，为当前启用的 knowledge embedding 模型创建 embedding jobs。

Job 应绑定：

- `job_id`
- `source_kind`
- `source_id`
- `chunk_id`
- `embedding_model_id`
- `content_hash`
- `status`
- `attempt_count`
- `last_error`

内容 hash 没变时不重复生成；内容变更时旧 job 或旧向量不应被混用。

### 5. 向量生成

`embedding_maintenance` 应作为图模板处理 pending jobs：

- local hash 模型用于本地 deterministic fallback。
- OpenAI-compatible embedding provider 通过 `/embeddings` 生成真实向量。
- 失败写入 job audit，不静默吞掉。
- 成功写入 `embedding_vectors`。

向量唯一性建议使用：

```text
chunk_id + embedding_model_id + content_hash
```

这样同一 chunk 可以同时保存多套模型向量，便于模型切换和回滚。

### 6. 检索消费

政策检索应使用多路召回：

1. FTS / trigram / LIKE：保证政策关键词、文号、材料名、时间窗口命中。
2. Vector search：召回语义相近表述。
3. Metadata filter：按地区、政策类型、发布机关、版本过滤。
4. Rerank：对候选 chunk 精排。
5. Context budget：控制进入 LLM 的材料量。

检索结果需要记录：

- `query`
- `filters`
- `embedding_model_ref`
- `reranker_model_ref`
- `keyword_score`
- `vector_score`
- `rerank_score`
- `final_score`
- `chunk_id`
- `source_ref`
- `omitted_reason`

这些信息应进入 run detail 或 retrieval ranking report，支撑面试中的可审计性叙事。

## Policy Navigator 图模板理想节点

理想版 `policy_navigator_agent` 可以拆成以下节点。

### 输入节点

- `policy_sources`：政策来源、官网链接或文件来源。
- `policy_documents`：政策正文、文件或解析后的文档集合。
- `policy_knowledge_base`：已导入政策知识库。
- `user_profile`：年龄、地区、学历、就业、社保、住房、企业信息等。
- `question`：用户关注的问题，例如是否能申请、需要哪些材料。

### Ingestion 与索引节点

- `policy_document_ingestor`：抽取政策元信息，生成 documents 和 chunks。
- `policy_embedding_indexer`：注册或选择 embedding model，创建 embedding jobs。
- `policy_embedding_maintenance`：可同步触发一次维护图，也可返回 pending 状态。

第一版演示可以用 mock ingestion 或预导入知识库，但数据合同要按正式形态设计。

### 检索节点

- `policy_query_planner`：根据用户画像和问题生成多条 query，例如申报条件、补贴标准、材料清单、排除条件、办理窗口。
- `policy_knowledge_retriever`：执行 hybrid retrieval，输出 `policy_knowledge_context` 和 `retrieval_report`。
- `policy_reranker`：可作为检索内部能力，也可独立节点展示精排结果。

### 推理与结构化节点

- `policy_source_validator`：检查来源可靠性、发布主体、日期、转载风险和版本冲突。
- `policy_clause_structurer`：把 chunk 和原文整理为条款、权益、材料、期限、排除项。
- `policy_card_builder`：生成权益卡片和白话摘要。
- `eligibility_matcher`：结合用户画像，输出 `可能符合`、`可能不符合` 或 `信息不足`。
- `citation_verifier`：检查关键事实是否都有 citation，发现缺口则写入 warning。
- `uncertainty_and_risk_checker`：列出人工确认项、资料不足项和不得承诺事项。
- `build_final_policy_package`：组装最终政策解读包。

## 输出合同

最终输出不应只有一段回答。理想输出包含：

- `final_policy_package.md`
- `policy_cards.json`
- `eligibility_report.md`
- `action_checklist.json`
- `citation_map.json`
- `retrieval_report.json`
- `uncertainty_report.md`

其中 `citation_map` 是政策 RAG 的核心证据表。每条 citation 至少包含：

- `citation_id`
- `chunk_id`
- `document_id`
- `source`
- `section`
- `clause_id`
- `quote_summary`
- `confidence`

## 与当前 TooGraph 底座的对应关系

当前代码中已有的可复用底座：

- `knowledge_context_loader`：已经能把知识库检索结果打包成 `context_package`，包含 source refs、retrieval metadata、budget 和 warnings。
- `embedding_model_registry`：已经能注册和列出 embedding models。
- `embedding_job_processor`：已经能处理 pending embedding jobs。
- `embedding_maintenance`：已经把 embedding job 处理表达为可审计图模板。
- `retrieval_store`：已有 `retrieval_documents`、`retrieval_chunks`、FTS、trigram、hybrid search、rerank audit。
- `embedding_store`：已有 embedding model、job、vector 和 local/provider 向量生成路径。
- `memory_store` 与 Buddy search：已经验证 memory entry 和 Buddy message 可以投影到 retrieval，并进行 hybrid recall。

需要补齐的连接点：

- 政策知识库 ingestion 要进入通用 `retrieval_documents/retrieval_chunks`。
- 知识库 embedding rebuild 要消费 Model Providers 中的真实 embedding model 配置。
- `hybrid_search` 的 query embedding 要使用同一个真实 embedding model。
- `policy_navigator_agent` 要显式调用 `knowledge_context_loader` 或新的政策检索 Tool。
- 最终输出要增加 retrieval report 和 citation verification 结果。

## 最小可演示版本

面试前不需要完成所有生产级能力。最小可演示版本应做到：

1. 准备一份政策 mock 数据和一份冲突或信息不足的补充材料。
2. 导入政策知识库，生成结构化 chunks。
3. 使用真实 embedding provider 构建 chunk 向量。
4. 用同一 embedding model 生成 query 向量并执行 hybrid retrieval。
5. 可选接入 reranker，展示 rerank 前后排序变化。
6. `policy_navigator_agent` 从知识库检索结果生成政策解读包。
7. 输出中每个关键事实都有 citation。
8. Run detail 能看到检索 query、命中 chunk、分数、上下文预算和 warning。

这个版本足以证明：

- 不是简单 prompt demo。
- 不是隐藏后端 RAG 黑盒。
- Agent 的检索、推理和执行都被图模板拆开并可审计。

## 评测与验收

建议准备 20 到 30 个政策问答样例，覆盖：

- 明确可回答的问题。
- 条款跨段落的问题。
- 资料不足的问题。
- 版本冲突的问题。
- 用户画像缺字段的问题。
- 不应承诺审批结果的问题。

最小指标：

- 检索命中率：目标条款进入 top 5 的比例。
- 引用准确率：答案 citation 是否指向正确 chunk。
- 拒答或保守判断准确率：资料不足时是否输出 `信息不足`。
- 版本风险召回率：冲突或过期材料是否进入风险提示。
- 平均检索延迟和总运行延迟。

面试中可以展示一张小表：

| 指标 | 目标 |
| --- | --- |
| Top 5 条款命中率 | >= 85% |
| 引用准确率 | >= 90% |
| 资料不足保守判断 | >= 90% |
| 平均检索延迟 | 可解释并有优化方向 |
| 运行可审计性 | 每次输出能回查 retrieval report |

## 面试讲法

可以按三层讲：

### 第一层：为什么政策场景适合 RAG

政策问答不能只靠模型记忆。它要求最新来源、明确条款、版本判断和保守表达，所以必须接入知识库和 citation。

### 第二层：为什么 TooGraph 用图表达

政策 RAG 不是一次检索就结束。它包含 query planning、检索、重排、条款结构化、资格判断、引用校验和风险提示。TooGraph 把这些阶段拆成节点，让每一步的输入、输出和副作用都可检查。

### 第三层：Embedding 在这里解决什么问题

Embedding 负责解决政策表达不一致的问题，例如用户问“我能不能拿住房补贴”，原文写的是“青年人才住房补贴申报条件”。关键词检索保证精确命中条款名，向量检索补足语义召回，rerank 负责把最适合回答的问题排到前面。

## 风险边界

政策导航助手必须保留以下边界：

- 不输出法律意见。
- 不承诺行政审批结果。
- 不把转载材料当作官方来源。
- 不在缺少用户关键信息时下确定结论。
- 不把召回记忆当作政策事实。
- 不用 prompt 文本替代权限、来源和 citation 校验。

最终表达应始终落在：

```text
可能符合 / 可能不符合 / 信息不足
```

并明确哪些材料需要官方窗口或原文再次确认。

## 打磨优先级

P0：

- `policy_navigator_agent` 接入知识库检索节点。
- 检索输出标准 `policy_knowledge_context`、`citation_map` 和 `retrieval_report`。
- 修正真实 embedding 的 query/vector 一致性。

P1：

- 政策 ingestion 进入通用 retrieval/embedding pipeline。
- Knowledge 页面支持选择真实 embedding model rebuild。
- 增加 policy-specific metadata filter。
- 加 citation verification 节点。

P2：

- 接入 PDF/Word/URL 解析。
- 加多版本冲突检测。
- 加 rerank 质量对比报告。
- 加政策 RAG 小评测集和指标报告。

## 总结

理想的 `policy_navigator_agent` 不是一个政策问答 prompt，而是一个可审计的政策 RAG Agent。Embedding 在其中承担语义召回能力，FTS 承担精确条款命中，rerank 承担上下文精排，citation map 承担事实追溯，图模板承担全流程编排和审计。

这个方向能把 TooGraph 的核心能力集中展示出来：模型适配、知识库、embedding、Action/Tool/Subgraph、图运行审计、保守决策和面向业务场景的 Agent 产品落地。
