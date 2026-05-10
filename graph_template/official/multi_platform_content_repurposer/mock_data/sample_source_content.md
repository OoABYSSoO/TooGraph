# TooGraph 本地知识库检索更新

这次更新把 TooGraph 的知识库检索从基础关键词匹配升级成混合检索。

核心变化：

- 为知识库 chunk 增加 content hash 和本地 hash embedding。
- 支持 FTS、LIKE 和向量候选合并排序。
- 检索结果保留 citation id、chunk id、source、section、metadata 和 retrieval score。
- 运行时的知识库上下文会输出 citations，方便下游模板引用。

限制：

- 当前 embedding 是 deterministic local-hash baseline，不是外部语义 embedding。
- RSS、网页抓取和业务模板自动检索质量评测还没有接入。
- 对需要高精度语义召回的场景，后续还要接 provider/model 配置和评测指标。

希望读者理解：这不是“搜索变智能了”的口号，而是 TooGraph 在为可审计业务模板补证据链。
