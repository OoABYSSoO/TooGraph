# 多平台内容包：本地知识库检索更新

## 核心观点

这次更新的重点不是“搜索更智能”，而是 TooGraph 开始为业务模板补上可追溯的证据链：每个检索结果都带 citation id、chunk id、来源、section 和 retrieval score。

## 微信公众号

标题：TooGraph 的知识库检索，开始补证据链了

这次更新把知识库检索从基础关键词匹配推进到混合检索。它做了三件具体事：给 chunk 增加 content hash 和本地 hash embedding；把 FTS、LIKE、向量候选合并排序；把 citation id、chunk id、source、section 和 retrieval score 留给下游模板。

我更关心第三点。业务模板真正需要的不是“搜到一段话”，而是能说清楚这段话来自哪里、为什么被选中、能不能被评测复查。

限制也要讲清楚：现在的 embedding 是 deterministic local-hash baseline，还不是外部语义 embedding。高精度召回、RSS 接入、网页抓取和检索质量评测都还在后面。

## 小红书

标题：别只说 RAG，先把引用链补上

TooGraph 这次做了一个偏工程但很关键的更新：知识库检索结果开始带 citation id、chunk id、来源和分数。  
它还不是终点，当前 embedding 只是本地 hash baseline。  
但这一步的价值是：业务模板以后可以解释“我为什么引用这段材料”。

## X Thread

1. TooGraph knowledge retrieval update: not magic search, but auditability.
2. Chunks now carry content hash and deterministic local hash embeddings.
3. Retrieval merges FTS, LIKE, and vector candidates.
4. Runtime context returns citation id, chunk id, source, section, metadata, and scores.
5. Limitation: local-hash is a baseline. Provider/model embeddings and retrieval evals are still needed.

## 发布计划

- 首发：公众号长文，解释为什么 citation trace 比口号更重要。
- 二发：X thread 和小红书短帖，强调限制和下一步。
- 复核：检查是否误写成外部语义 embedding 已上线。

## 候选记忆摘要

本次可生成候选记忆：用户偏好“先给具体判断，再给工程例子；避免夸张标题和万能三段式”。该记忆仍需用户审查后才能成为 active。
