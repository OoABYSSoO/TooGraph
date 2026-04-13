# Knowledge Base Strategy

这份文档记录当前关于知识库能力的讨论结论和已落地结果，目标是把已经确定的产品心智、当前实现边界和下一阶段增强项放在同一个地方。

## 当前状态

截至当前仓库状态，知识库第一阶段已经落地：

- graph 内保存稳定 `kb_id`
- editor 仍然通过 `input` 节点把 knowledge base 传给 `agent`
- 当 `agent` 接入 knowledge base 时，编辑器会自动显式挂载 `search_knowledge_base`
- `search_knowledge_base` 已经接到正式本地索引与检索链路
- run detail 已经返回知识库检索摘要与来源
- 当前已导入两个正式样板库：
  - `python-official-3.14`
  - `langgraph-official-v1`

## 1. 用户操作模型保持不变

当前结论：

- 用户仍然通过 `input` 节点选择知识库
- 知识库仍然通过连线传给 `agent` 节点
- 不引入额外的独立“知识库检索节点”来替代当前主操作链路

也就是说，用户侧的交互心智保持为：

- 选择一个知识库
- 把它挂到 agent
- agent 基于当前问题使用这个知识库回答

## 2. 企业里通常怎么使用知识库

在企业开发和生产环境里，用户看到的操作通常很简单，但系统内部会把“选择知识库”和“真正检索知识库”分开。

常见做法：

1. 文档先离线导入、清洗、切块、建索引
2. 图里传递的是知识库引用，而不是全文内容
3. agent 运行时根据当前问题对知识库做检索
4. 只有命中的片段会被注入 prompt
5. 回答和运行记录会保留来源信息

所以企业里真正稳定的模式不是“把知识库名字当字符串传给模型”，而是：

- 图里挂载 `knowledge reference`
- runtime 执行 `retrieval`
- agent 消费 `retrieved context`

## 3. 对 GraphiteUI 的适配结论

当前产品应当保留现有用户操作逻辑，但升级内部语义。

保留：

- `Knowledge Base Input` 节点
- 通过 edge 传给 `Agent` 节点

升级：

- `input` 节点输出的不再只是“目录名字符串”的弱语义
- 它在正式设计里代表一个稳定的知识库引用
- `agent` 在运行时基于问题做检索，而不是把知识库名直接塞进 prompt

推荐执行心智：

- `input` 节点负责“挂载哪个库”
- `agent` 节点负责“针对当前问题使用这个库”
- runtime 负责“检索并注入上下文”
- run detail 负责“展示命中了哪些来源”

## 4. 开发环境里如何试水

当前阶段不建议一上来就做完整 RAG 平台。

更适合的试水方式是：

- 使用两个固定的官方文档库快照
- 在本地或 dev 环境中导入
- 使用同一批文档进行稳定、可复现的验证

当前已验证的两个知识库：

- Python 官方文档库
- LangGraph 官方文档库

这两个库适合验证：

- 知识库选择逻辑
- 检索质量
- 引用与来源展示
- agent 是否真的因为知识库而变得更可靠

## 5. 当前阶段的正式边界

第一阶段已经做到：

1. 知识库成为正式资源，而不是目录名字符串
2. 每个知识库有稳定的 `kb_id`
3. 文档先离线导入并建索引
4. agent 运行时按问题检索知识库
5. run detail 返回检索命中与来源

当前不急着做：

- 多知识库同时检索
- 向量检索和 rerank
- 在线增量同步
- 复杂权限模型

## 6. 当前讨论后的关键设计约束

已经明确的约束：

- 用户挂载知识库的操作逻辑不变
- 知识库依然通过 `input` 节点传给 `agent`
- 系统内部必须从“传目录名”升级为“传知识库引用”
- runtime 需要承担检索职责
- run detail 必须具备来源可追踪能力

## 7. 已经确定的关键设计点

当前已经定下来的结论：

1. graph 内部先保存纯字符串 `kb_id`
2. 检索先走显式 `search_knowledge_base` 技能链路
3. 该 skill 作为普通显式 skill 自动挂载到接入 knowledge base 的 agent
4. skill 输出同时服务于：
   - agent prompt 上下文
   - run detail
   - citation 展示

## 8. graph 中如何保存知识库引用

当前讨论结论：

- graph 第一阶段先保存纯 `kb_id`
- 不在 graph 中直接保存知识库的完整结构化快照

推荐形式：

- `python-official-3.14.4`
- `langgraph-official-v1`

不推荐把这些展示信息直接写进 graph：

- `label`
- `source`
- `version`
- `description`

这些信息更适合由知识库 registry 提供。

推荐职责边界：

- graph 保存稳定资源引用：`kb_id`
- UI 从 registry 读取展示名和说明
- runtime 根据 `kb_id` 查索引和元数据

这样更符合企业里常见的 workflow 设计习惯：

- 图里只保存外部资源引用
- 资源元数据由系统注册表统一管理

优点：

- graph payload 更稳定，diff 更干净
- 更名不会破坏旧图
- label 和 source 更新不需要改图
- runtime、缓存、权限和索引都可以围绕稳定 id 建立

## 9. 知识库技能模型

当前已落地结论：

- 知识库检索逻辑应当封装成一个正式的 skill
- 这个 skill 负责真实的知识库读取、检索和结果组织
- 当一个 `agent` 节点接入知识库时，系统自动为它挂载这个 skill

这里的“自动挂载”现在已经明确调整为：

- 直接写回用户可见的 `config.skills`
- 在 UI 上和用户手工添加的 skill 不做区分
- 自动添加只是为了减少操作步骤，不再保留“隐式系统技能”心智

当前执行心智：

- 用户把知识库 input 连给 agent
- 编辑器自动把 `search_knowledge_base` 挂到该 agent 上
- skill 作为普通显式 skill 出现在节点上
- runtime 执行真正的检索逻辑
- 检索结果再进入 agent prompt 上下文

这样做的原因：

- 用户能明确看到当前节点挂载了什么技能
- skill 链路和现有 agent 技能心智一致
- 后续 run detail 和调试信息更容易解释
- 仍然保留“连知识库线就少一步手工挂 skill”的效率收益

## 10. 当前 skill 约束

当前已经实现的约束：

- 一个 agent 一次只接一个知识库
- 一个 agent 自动获得一个显式 `search_knowledge_base` skill
- 该 skill 的 `knowledge_base` 输入来自连接进来的 `kb_id`
- 该 skill 的 `query` 输入来自 agent 的主问题输入

主问题输入的推荐优先级：

1. `question`
2. `query`
3. `input`
4. 第一个 required 的 text input

如果找不到明确问题输入，推荐直接在 validate 阶段报错，而不是运行时猜测。

当前还没有做：

- 多知识库同时检索
- 用户手工配置 query mapping
- 多轮 tool calling 检索
- 显式知识库检索节点替代当前交互

## 11. 剩余增强项

下一阶段主要聚焦这些点：

- 导入、更新、删除、重建索引和状态查看
- 检索质量增强：
  - rerank
  - 向量检索
  - 混合检索
- 多 knowledge base 支持
- 更细的 query mapping
- 更清晰的 citation 展示和引用格式
