# Buddy 与平台能力剩余路线图

本文记录 TooGraph 必须长期遵守的架构约束、已经达到商业化基线的能力边界，以及后续完整模式扩展候选。当前事实以代码、官方模板 JSON、Skill manifest 和测试为准；这里不再维护逐日实现快照。

反查入口：

- 官方图模板：`graph_template/official/*/template.json`
- 官方 Skill：`skill/official/*/skill.json`
- 图协议与校验：`backend/app/core/schemas/`、`backend/app/core/compiler/`
- 运行时：`backend/app/core/langgraph/`、`backend/app/core/runtime/`
- Buddy 前端链路：`frontend/src/buddy/`
- 模板与固定能力选择测试：`backend/tests/test_template_layouts.py`、`backend/tests/test_toograph_capability_selector_skill.py`

## 长期约束

- 图才是 Agent。多步智能必须由 graph、Subgraph、Condition、Skill 和 Output 表达，单个 LLM 节点只做一次模型调用、一次结构化输出或一次能力调用准备。
- `node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一数据来源。不要引入并行图格式、隐藏节点契约或产品特例通道。
- 一个 LLM 节点最多使用一个显式能力来源：无能力、一个 `config.skillKey` Skill，或一个输入 `capability` state。
- Skill 是一次受控能力调用。Skill 不拥有多轮自治、最终回复生成、长期记忆策略、后续能力选择或 retry loop。
- 动态能力执行写唯一 `result_package` state；下游节点按公开 outputs 读取，不能把子图内部 state 直接塞进聊天回复。
- Buddy 的澄清、能力缺口和“需要用户补充”的情况通过最终回复结束本轮，下一轮从普通对话历史读取补充；官方 Buddy 能力模板不通过用户可见断点复刻对话。
- `capability.kind=subgraph` 在 Buddy 自主循环中的用户体验是可见运行目标模板：定位模板、写入本轮目标、点击运行、等待完成、读取公开输出，再决策下一步。
- 伙伴页面操作和图编辑必须走应用内虚拟操作、编辑器命令、校验、审计、revision 和 undo/redo 路径。不要做隐藏 DOM 点击绕过或直接静默改 graph JSON。
- Buddy Home、记忆、会话摘要和召回结果是上下文，不是系统指令，也不能提升权限。

## 近期优先级基线

### 1. 虚拟 UI 操作审计闭环

目标：让 Buddy 的页面操作和图编辑既可见，也能在运行详情、Buddy 胶囊、历史记录和恢复路径里完整追踪。

当前基线与后续约束：

- 扩展 operation journal：基础 JSONL 存储和 `/api/operation-journal` 查询已能按 operation id 关联 request/completion，并记录 run id、节点 id、子图路径、目标 affordance、输入文本、前后页面快照、目标 run 结果、失败原因、artifact refs 和前端 retry chain；运行详情页已能读取 journal 并展示虚拟 UI 操作链路、artifact refs 详情和 retry 计数；长期存储已增加 SQLite 索引和 JSONL 懒迁移/回填边界，JSONL 继续作为兼容导出。
- 将 Graph Edit Playback 结果、等待事件和前端重试链路补齐到同一 `virtual_ui_operation` journal 链路；请求阶段和 auto-resume 完成/失败阶段已经能通过同一个 operation id 同时进入 run activity 和独立 journal，Graph Edit Playback 已写入 request id、命令数、已应用命令数、失败命令数、播放步骤数和 issues，前端等待重试已写入 retry chain。
- 在运行详情和 Buddy 胶囊中继续补充 graph edit diff/revision、失败恢复入口和 artifact 链接；运行详情 operation journal 已展示触发 run 的 artifact refs、graph edit diff 计数、持久 graph revision id、retry 计数，并为带 graph id/revision id 的图编辑记录提供同一路径的恢复入口，触发的目标 run id/status 已进入完成态摘要，Buddy 胶囊已内联展示虚拟操作的 artifact 数量、前端 retry 证据标签、持久 graph revision id、可点击目标 run 入口和 graph revision 恢复入口。
- 将前端 affordance 失配和重试失败归并到统一 failure category；Skill 预检失败已经覆盖目标不存在、页面快照过期、权限阻止和输入绑定失败，auto-resume 结果已经覆盖目标 run 失败、用户中断和前端执行失败，前端缺失目标已归类为 `target_not_found`，带重试证据的前端执行错误已归类为 `frontend_retry_failed`。
- 为“跟随/不跟随”模式补齐端到端稳定性测试：Playwright 覆盖了后台模板证据在切换页面、查看运行记录、进入编辑器和拖动伙伴后仍保留，以及跟随开关持久化后不影响已恢复的后台证据。

### 2. 图编辑 revision、diff 和 undo/redo

目标：让 Buddy 修改现有图、新建图模板和保存用户模板都进入可验证、可撤销、可审计的图编辑链路。

当前基线与后续约束：

- 建立 graph revision 存储：保存图、新建图、状态变更和删除图已写入 revision 记录，包含 previous graph、next graph、结构化 diff、actor、run id、节点 id、原因、校验结果和创建时间，并提供 `/api/graphs/{graph_id}/revisions` 查询入口。
- 将 Graph Edit Playback 编译出的 editor commands 与 graph revision 绑定；每次应用命令前后已生成 command diff，并在回放结束后通过编辑器保存请求写入持久 graph revision；`graph_edit_summary`、operation journal 和运行详情/Buddy 虚拟操作标签已经包含 graph id、revision id、revision status 与 command diff 计数。
- 接入 undo/redo：graph revision 已提供 restore API，可把保存图恢复到指定 revision 的 previous graph 并记录恢复 revision；图与模板管理页、编辑器动作栏修订历史、运行详情 operation journal 和 Buddy trace/history 胶囊已能从图编辑记录直接恢复对应 graph revision，并在恢复后刷新本地图列表或当前编辑器文档。
- 扩展编辑已有图覆盖面：Graph Edit Playback 已支持移动节点、节点重命名/简介/Agent 任务说明、修改 input/output config、修改 state、选择 Agent Skill、流程/条件路由连线、删除节点与同计划恢复节点；Buddy 页面操作已能发现并点击编辑器“保存为模板”动作；编辑器节点选择已支持单选、多选切换、键盘选择、当前选择 affordance 和多选清除入口。
- 历史 `graph_patch.draft` stub 已从 Buddy command 与前端 API surface 移除；图修改入口必须走编辑器语义命令、校验、revision 和撤销路径，后台复盘与候选记忆提示继续显式禁止该旧 action。

### 3. 运行结果校验与自我修复

目标：Buddy 不只“发出运行请求”，还要能判断目标模板是否真正回答了本轮目标，并在失败时给出可追踪原因或继续修复。

当前基线与后续约束：

- 当前官方 selector 已收敛为固定页面操作入口，只输出 `found` 与 `capability`，其中 capability 固定为 `toograph_page_operation_workflow`；后续如恢复多能力发现，应重新通过图模板表达候选、校验和审计，而不是把复杂 catalog 逻辑塞回 selector Skill。
- 为 `result_package` 增加预算化摘要和 artifact refs：result_package state 在下游 LLM prompt 中按输入/输出预算渲染为 `inputs_summary`、`value_summary`、`value_omitted` 与紧凑 `artifact_refs`，完整 state 仍保留在运行记录中，避免把原始日志、大页面快照或长正文直接塞进外层 LLM。
- 对触发的目标 run 读取终态、root outputs、errors、warnings、activity events 和 artifacts，生成结构化 validation report；页面操作续跑报告已携带紧凑 target run validation，Buddy 可见子图适配器已把它写入 `capability_result.outputs.validation_report`，并用 output contract 判断 pass-through、missing required outputs、repair/user-reply 需求。
- 失败后支持有限修复：Buddy 可见子图适配器已在 validation report 中输出 `repair_options`，限定为重新绑定输入、重新运行、切换模板、请求用户补充或明确结束并说明缺口；能力复核节点只从这些方向中选择下一步。

### 4. Buddy 运行 UX 稳定性

目标：Buddy 胶囊、运行记录、跟随模式和后台模板运行像可重连的小窗口一样稳定。

当前基线与后续约束：

- 对 Buddy 胶囊的输出边界分段规则持续加测试：只有直接连接 output 的上游非 output 节点能形成胶囊边界。
- 运行记录中的 running run 应能回到同一播放/观察通道；重新打开页面后能恢复进度、子图树、跳转按钮和输出状态。
- 胶囊中的主图/子图树需要保持可读：主图行、子图行、内部节点、输出行、跳转按钮和错误行都要有稳定层级。
- 后台复盘 run 不应抢占当前用户输入，也不应与可见主 run 胶囊混在一起。
- 机制性 `awaiting_human` 保持标准确认界面处理；Buddy 聊天输入不作为隐藏 resume payload。

## 平台能力基线与后续扩展

### 长期记忆系统

目标：把 Buddy Home 的基础读写升级为平台级记忆系统，服务 Buddy、普通图模板、业务模板、知识库增强和评测闭环。

当前基线与后续扩展：

- 建立记忆分层：semantic facts、procedural preferences、episodic summaries、capability stats、safety/policy references。
- 建立作用域：user、project、buddy、template、graph、skill、knowledge collection。跨作用域召回必须显式且可审计。
- 建立主存储：平台 SQLite 存储已建立 `memories`、`memory_revisions`、`memory_events`、`memories_fts`，`backend/app/memory/store.py` 提供 create/update/list/recall/revision/event 基础 API；后续 Hybrid RAG 阶段再接 embedding 表。
- 每条记忆至少包含 summary、content、confidence、importance、evidence、artifact refs、source run/node/skill/template、status、scope 和 supersedes 信息；平台 store 已按这些字段归一化和持久化，Buddy Home 旧 `buddy_memories` 投影已通过启动迁移进入平台记忆 store，使用 `scope=buddy`、`source.kind=buddy_home_projection`、可恢复 revision/event，并把已删除/禁用旧记忆迁移为 archived 平台记忆。
- 支持候选记忆：`memory_candidate_writer` 已能创建带证据和来源的 `candidate` 状态平台记忆并记录 revision/event，并返回相近 active 记忆的冲突提示；平台 API 已支持候选应用、拒绝、归档、替代、降权、revision/event 查询和 revision 恢复；Buddy 记忆页已提供平台候选审查表和应用/替代/拒绝/归档入口。
- 实现预算化召回：平台 store 已支持 scope/layer/type/status 过滤、FTS 查询、importance/更新时间排序、top_k、max_chars 和 omitted 列表；候选写入 Skill 已接入 active 记忆冲突提示，Buddy 记忆页已展示候选、来源 run、替代关系和候选审查动作。
- 新增或等价实现 `memory_recall` 与 `memory_candidate_writer` 能力：官方 Skill 已提供只读预算化 `memory_context` 召回，以及仅写入 `candidate` 记录的候选记忆生成。
- 前端和运行详情展示召回命中、候选、应用/拒绝、冲突、revision 和来源 run；Buddy 记忆页已展示平台候选、来源 run、替代关系并提供应用/替代/拒绝/归档动作，运行详情时间线已汇总 `memory_recall` 与 `memory_candidate_write` 活动的命中、候选、跳过、冲突和记忆 ID；运行详情已新增 `memory_context` 展开视图，按查询、过滤条件、预算统计、纳入记忆、预算外省略项、证据、来源和原始上下文展示召回结果。
- Buddy Home 文件继续作为用户可编辑投影；底层 Store、command 和 revision 是审计与恢复来源。

### 上下文预算和大结果处理

目标：减少外层 LLM 被结果包、日志、文件和历史塞爆的风险。

当前基线与后续扩展：

- 为每个 LLM 节点建立上下文装配报告：agent 节点运行记录已在 `node_executions[].artifacts.context_assembly_report` 中记录 LLM phase、读取的 state、文件、result outputs、记忆文件、知识库 chunk、Skill result 以及对应字符数/token 估算。
- 为 `result_package` 定义默认渲染策略：公开 output 可摘要展示，原始值保存在 artifacts 或可按需展开的 state 中。
- 大 artifact 只传路径、摘要、mime、大小、来源和关键引用；`result_package` prompt 的紧凑 artifact refs 已白名单保留 summary/url/content_type/size/char_count 等元数据并丢弃 raw/html/任意大字段，context assembly report 的文件记录也包含 size_bytes；base64、完整日志、大媒体和大量网页正文不进入下游长期上下文。
- 历史对话、Buddy Home、运行记录和子图结果都要按预算裁剪，并保留 omitted list：Buddy 历史输入已按消息数和字符预算保留最近上下文并输出 `omitted_count`/预览列表，普通 file state/Buddy Home 文本和 result_package 文件输出都带 `原文省略` 标记，目标 run validation 与子图 result_package 继续使用紧凑摘要和 refs。
- 建立只读 fanout 的并行上下文装配：记忆召回、知识库检索、页面上下文压缩、能力候选读取可以并行，合并节点负责预算和冲突处理。

### Skill 与模板自我演进

目标：Buddy 能从运行轨迹、失败、用户纠正和成功经验中提出小步、可逆、可审查的改进。

已完成：

- 后台复盘模板 `buddy_autonomous_review` 已停止直接调用 Buddy Home Writer；现在输出 `autonomous_review`、`improvement_candidates` 和 `memory_candidate_plan`，并且只在存在记忆沉淀时通过 `memory_candidate_writer` 写入平台 `candidate` 状态记忆。
- 能力缺口链路已输出 `capability_builder_handoff`：当缺的是 Skill 且用户明确要补能力时，交接目标指向 `toograph_skill_creation_workflow`；当缺的是图模板创建能力时，交接目标指向 `toograph_graph_template_creation_workflow`，不绕过官方创建、校验、审查和受控写入链路。
- Skill 改进链路已接入现有创建模板：新增只读 `toograph_skill_package_reader`，`toograph_skill_creation_workflow` 可读取目标 Skill 包，把旧 `skill.json`、`SKILL.md`、生命周期脚本和 requirements 纳入 builder context，再沿用生成、脚本测试、审查和受控 `skill/user/<skillKey>/` 写入路径。
- 图模板改进链路已接入官方工作流：新增只读 `toograph_graph_template_reader`、只读 `toograph_graph_template_validator` 和受控写入 `toograph_graph_template_writer`，`toograph_graph_template_creation_workflow` 可读取已有模板、生成 graph diff 草案与预览、校验 node_system 与运行时兼容性、经运行时确认写入 `graph_template/user/<template_id>/template.json`，并记录 `backend/data/template_revisions` 下的可恢复 revision artifact；写入后可选通过页面操作工作流进行可见试运行。

长期权限约束：

- 所有文件写入、脚本执行、图修改、权限扩大、网络访问和自动化创建都必须有清晰权限和可恢复 revision。

### Hybrid RAG 知识库

目标：把当前基础检索升级成可扩展的 Hybrid RAG，让业务模板能稳定获得带 citation 的外部资料上下文。

当前基线与后续扩展：

- 增加 embedding 存储、content hash、provider/model 记录和知识库级 rebuild API：已新增 `knowledge_chunk_embeddings`、chunk `content_hash`、知识库 embedding provider/model/dimension/count 元数据和 `/api/knowledge/bases/{knowledge_base}/rebuild`；当前默认使用确定性的本地 `local-hash` 向量，后续可接入外部 embedding provider。
- 实现关键词 + 向量 + metadata filter 的混合召回，并支持 rerank：已在 `search_knowledge` 中合并 FTS/LIKE 与本地向量候选，支持 `source_path_prefix`、`source_kind`、`section` 过滤，并按关键词分数与向量相似度重排。
- 输出 `knowledge_context`，包含 citation id、chunk id、标题、section、score、source path/url 和摘要：运行时知识库上下文已在 `results` 与 `citations` 中输出 citation id、chunk id、metadata 与 retrieval 评分信息。
- 区分 `knowledge_context` 与 `memory_context`：Knowledge 是外部资料，Memory 是历史经验和偏好。
- 在业务模板中显式声明需要的知识库、召回字段和引用输出。
- 为检索质量建立评测：命中率、引用准确性、遗漏关键条件、过度引用、chunk 质量和上下文预算。

### Agent Eval 评测体系

目标：让官方模板、业务模板、Buddy 主循环和关键 Skill 可以持续回归验证。

当前基线：

- 建立 eval suite、case、run 和 case result 数据结构：已新增平台 eval 存储表、`app.evaluator.store` 和 `/api/evals` 路由，支持 suite、case、eval run、case result 与 check result 持久化。
- 每个 Eval Case 发起独立 graph run，保留 run id、状态、错误、输出、artifacts 和节点失败信息：case result 已能保存关联 graph run id、状态、错误、最终输出、artifacts、节点失败和 human review；`/api/evals/runs/{eval_run_id}/cases/{case_id}/run` 已能从 suite 目标 graph/template 启动独立 LangGraph run，把 case `input_values` 注入 input state 默认值，在 run metadata 中记录 eval/suite/case/target 关联，并在复跑时清空旧输出、artifacts、节点失败和 check results；`/api/evals/runs/{eval_run_id}/cases/{case_id}/collect` 已能从完成的 graph run 抽取 output previews、saved artifacts、errors 和 node failures，生成 final output/artifacts 并触发确定性检查。
- 支持 schema 检查、artifact 检查、引用检查、规则检查、LLM judge 和人工评审记录：check result 已支持任意 `kind`、状态、score、expected/actual/details/message/reviewer，human review 已作为 case result 的结构化记录保存；确定性的 schema/artifact/citation/rule 执行器与 `/api/evals/runs/{eval_run_id}/cases/{case_id}/evaluate` 已接入，可基于已有 final output/artifacts 生成并持久化 check results；`llm_judge` / `judge` 检查已接入显式 opt-in 的模型评审执行器，支持 check 级 `rubric`、`criteria`、`min_score`、`model_ref`，并把结构化判定、模型元数据和 reviewer=`llm_judge` 写入 check result。
- 前端或 API 展示 suite 结果、case diff、失败原因和可复跑入口：API 已能创建/列出 suite、case、eval run、case results/check results，并提供单 case run/rerun 与 completed run collection 入口；`/api/evals/runs/{eval_run_id}/cases/run` 和 `/api/evals/runs/{eval_run_id}/cases/collect` 已提供批量运行/采集入口，并返回部分成功与逐 case 错误摘要；`/api/evals/runs/{eval_run_id}/cases/{case_id}/evaluate`、单 case collect、批量 collect 均支持 `run_llm_judge=true` 显式开启 LLM judge；`/evals` 评测中心已接入 suite/run/case/check/artifact 展示、单 case 运行/复跑、批量运行/采集、结果采集、LLM Judge 开关、图运行跳转、expected/final-output/check expected-actual 紧凑对比，以及由 case error、node failure、failed/error check 汇总出的失败诊断视图。
- 覆盖 Buddy 主循环、能力循环、页面操作、Skill 创建、联网搜索和至少一个业务模板：官方 `eval_cases.json` 包已覆盖 `buddy_autonomous_loop`、`buddy_capability_loop`、`toograph_page_operation_workflow`、`toograph_skill_creation_workflow`、`advanced_web_research_loop` 和现有业务模板；启动时 `app.evaluator.official_seed` 会把这些包注册为 Eval Suite/Case，并把旧的描述性检查归一化为显式 `llm_judge`，避免不可执行规则被误当成确定性检查通过。

## 图模板计划

业务模板用于证明 TooGraph 能承载真实工作流，而不是只展示单次问答。所有模板必须有多源输入、结构化中间 state、显式 Skill/Subgraph、artifact 输出、审计和 Eval；每个模板都要支持 mock data 模式，保证无外部账号时也能演示。

### Gallery 定位和准入标准

TooGraph Workflow Gallery 的目标不是沉淀 prompt，而是沉淀可运行、可观察、可迭代、可复用的 Agent 工作流模板。

当前准入标准：

- 官方模板必须体现固定流程、结构化中间产物、证据链、artifact 文件包、Eval 和可复跑 run 记录；只有“输入一段话、输出一段话”的场景不进入官方模板计划。
- 优先选择能展示 Graph 编排、Skill 调用、Knowledge/RAG、Memory、Human review、Eval、Artifacts、Revision loop 和 Citation trace 的模板。
- 每个首批模板必须能在 3 到 5 分钟内讲清楚输入、节点流、输出、为什么比直接问网页模型更强。
- 每个模板必须有明确目标用户和传播句，例如政策解读、AI 新闻内容生产、一文多发、求职准备或游戏广告创意生产。
- 模板结论必须尽量可评测：引用是否完整、关键条件是否遗漏、是否过度承诺、是否符合用户风格、是否降低 AI 味、artifact 是否完整、schema 是否通过校验。

### 交付批次

当前交付批次与完整模式扩展：

- 首批优先完成 3 个大众模板：`policy_navigator_agent`、`ai_news_digest_to_wechat_article`、`multi_platform_content_repurposer` 已交付轻量官方模板包。
- 第二批完成 1 个求职模板和 1 个复杂业务展示模板：`job_application_interview_coach`、`game_creative_factory` 已交付轻量官方模板包。
- 后续展开 2 个商业分析模板：`product_competitor_research_agent`、`ecommerce_review_mining_agent` 已交付轻量官方模板包。
- 每个模板先交付轻量模式，再补完整模式。轻量模式使用用户粘贴文本、上传文件、示例素材或 mock data；完整模式再接入 RSS、URL 抽取、知识库、批量素材、视频理解、记忆召回和审核返修。
- 首批 5 个模板应能作为 TooGraph 的公开 Gallery 主推内容；后续模板必须先证明多源证据链和 artifact 输出质量，不做浅层 ChatGPT 包装。

### 交付形态

当前交付形态：

- 官方模板落在 `graph_template/official/<template_id>/template.json`，并在模板 manifest 中声明 `template_id`、名称、描述、类别、输入 schema、输出 contract、可发现性、所需 Skill/Subgraph 和权限说明。
- 为每个模板补齐 README、示例输入、mock data、示例输出、Eval cases 和可预览 artifact；这些资源可以随模板目录扩展，或放在与现有模板系统一致的测试 fixture/文档位置。
- 每个模板至少提供一个无需外部账号的 mock run；依赖网络、下载、视频理解或平台账号的能力必须有降级路径。
- 输出文件统一以 artifact refs 或本地文件路径表达；不要把长正文、批量评论、视频内容、base64 或原始网页全集塞进长期 state。
- 模板 README 固定包含用途、目标用户、工作流、输入、输出、Required Skills/Subgraphs、Sample run、Eval cases、Safety notes 和 Customization。
- Gallery 页面最终应展示模板说明、示例输出、mock 入口、权限需求、最近 Eval 状态和“使用模板”按钮。

### 模板建设规则

当前建设规则：

- 每个模板提供 `template.json`、README、示例输入、mock data、Eval cases 和可预览 artifact 输出。
- 每个模板声明输入 schema、Graph State、节点流程、Skill 列表、权限说明、失败边界和最终 output contract。
- 需要用户补充信息时，通过最终输出询问并结束本轮；下一轮从普通输入和历史上下文读取补充，不使用模板断点做对话。
- 输出长期经验时，只生成候选记忆、证据和作用域建议，不直接绕过 Store、command、revision 或审批。
- 涉及政策、求职、商业、合规或营销建议时，必须保留来源、限制条件、不确定项和人工确认提示。

### 首批模板

#### Policy Navigator Agent

用途：把官方通知、政策文件、补贴公告、办事指南整理成白话摘要、权益卡片、资格初判、办理清单和个人行动清单。

适用场景：政府通知、补贴政策、人才政策、落户政策、社保/医保通知、公积金政策、创业扶持政策、高校招生/就业通知、税费减免、消费券/购房/购车补贴公告、办事指南和公开征求意见稿。

工作流：

```text
官方链接 / PDF / Word / 网页文本 / 多份政策文件
  -> 来源可靠性校验
  -> 政策元信息抽取
  -> 条款切分与结构化
  -> 权益卡片生成
  -> 适用人群、限制条件、办理流程、材料和时间节点提取
  -> 白话摘要
  -> 用户画像收集
  -> 个性化匹配与资格初判
  -> 风险与不确定项检查
  -> 政策解读包
```

核心 state：`policy_sources`、`raw_policy_text`、`policy_metadata`、`policy_sections`、`policy_cards`、`eligibility_rules`、`plain_language_summary`、`user_profile`、`matched_benefits`、`eligibility_report`、`action_checklist`、`citation_map`、`uncertainty_report`、`final_policy_package`。

关键节点：`policy_source_validator` 检查来源、发布日期、发文机关、转载风险、缺页和新旧文件冲突；`policy_metadata_extractor` 抽取标题、发文机关、文号、发布日期、生效日期、区域、政策类型和目标人群；`policy_clause_structurer` 把原文拆成带引用的条款；`policy_card_builder` 生成权益卡片；`eligibility_matcher` 只能输出“可能符合 / 可能不符合 / 信息不足”；`uncertainty_and_risk_checker` 列出原文未明确和需要咨询官方的事项。

落地切片：轻量模式已落在 `graph_template/official/policy_navigator_agent/`，支持粘贴政策正文、PDF/Word 文本抽取结果、mock 政策文件、用户画像、可选知识库声明、只读 `memory_recall`、citation map、权益卡片、保守资格初判、行动清单、不确定项和持久化最终 Markdown 输出；README、mock data、示例输出和 eval case metadata 已随模板包提交。完整模式候选扩展包括 URL/PDF 解析、多文件新旧冲突识别、真实知识库检索执行器接入和评测自动运行；这些不阻塞当前 Gallery 商业化基线。资格初判只能保守表达，不能输出法律、财务或行政审批承诺。

输出物：`policy_plain_summary.md`、`policy_cards.json`、`eligibility_report.md`、`action_checklist.json`、`citation_map.json`、`uncertainty_report.md`、`final_policy_package.md`。

Eval：检查发文机关、发布时间、适用对象、政策内容、材料、截止时间和办理入口是否完整；用户信息不足时不得输出确定性承诺；原文没有户籍限制时不得编造；多文件冲突时必须识别发布时间并提示新文件可能覆盖旧文件。

#### AI News Digest to WeChat Article

用途：整理 AI 新闻，去重、聚类、排序、提炼影响，生成公众号文章和多平台分发稿。

适用人群：AI 博主、公众号作者、小红书/知乎/B站创作者、行业研究员、技术社群运营和内容运营。

工作流：

```text
关注领域 / 时间范围 / 新闻源 / 目标平台 / 文章风格
  -> 新闻源抓取或用户粘贴链接
  -> 新闻清洗、去重和事实提取
  -> 主题聚类
  -> 重要性评分
  -> Top N 新闻卡片
  -> 公众号文章大纲
  -> 正文生成
  -> 事实一致性检查
  -> 标题候选
  -> 小红书、知乎、B站、X 分发稿
  -> 内容包
```

核心 state：`topic`、`date_range`、`news_sources`、`raw_news_items`、`clean_news_items`、`clustered_topics`、`top_news_cards`、`importance_ranking`、`article_outline`、`wechat_article`、`fact_check_report`、`title_candidates`、`distribution_pack`、`final_content_package`。

能力需求：RSS/URL 内容抓取、新闻清洗、去重、主题聚类、重要性排序、公众号写作、事实一致性检查、多平台改写和 artifact 写入。首版可以先支持用户粘贴多条链接或文本，不要求完整爬虫。

落地切片：轻量模式已落在 `graph_template/official/ai_news_digest_to_wechat_article/`，支持用户粘贴多条新闻链接/正文、mock 新闻材料、可选 `web_search` 联网补充开关、只读内容偏好 `memory_recall`、清洗去重、主题聚类、Top 新闻卡片、公众号文章、事实检查、多平台分发包、artifact/output contract、README、mock data、示例输出和 eval case metadata。完整模式候选扩展包括 RSS 源、定时运行、主题订阅、真实用户选题偏好闭环、封面提示词和评测自动运行；这些不阻塞当前 Gallery 商业化基线。

输出物：`top_news_cards.json`、`ai_news_digest.md`、`wechat_article.md`、`fact_check_report.json`、`title_candidates.json`、`xiaohongshu_note.md`、`zhihu_article.md`、`bilibili_script.md`、`x_thread.md`、`cover_prompt.txt`、`final_content_package.md`。

Eval：检查是否输出 Top 新闻卡片、是否去重、是否保留来源、是否区分事实和观点、是否避免无来源编造、公众号文章结构是否完整、多平台稿件是否符合平台风格。

#### Multi-platform Content Repurposer

用途：把一篇原始内容改写成公众号、小红书、知乎、B站、抖音、X、YouTube 等多平台版本，并基于历史样本学习用户风格、降低 AI 味。

适用人群：内容创作者、技术博主、独立开发者、公众号运营、小红书/知乎/B站创作者、开源项目作者和自媒体团队。

工作流：

```text
原始文章 / README / 视频脚本 / 用户历史样本
  -> 核心观点提取
  -> 目标平台识别
  -> 历史风格样本读取
  -> 用户风格画像
  -> 各平台初稿
  -> AI 味检测
  -> 用户风格重写
  -> 用户反馈
  -> 二次修改
  -> 风格一致性和平台适配评分
  -> 多平台内容包
  -> 风格候选记忆
```

核心 state：`source_content`、`target_platforms`、`historical_samples`、`core_message`、`style_profile`、`platform_strategy`、`draft_outputs`、`ai_tone_report`、`human_feedback`、`style_rewrite_outputs`、`style_consistency_score`、`final_distribution_pack`。

关键节点：`style_profiler` 提取常用句式、段落长度、语气、举例方式、标题风格和表达偏好；`ai_tone_detector` 标记空泛总结、过度排比、总结腔、缺少具体例子和缺少个人判断；`human_like_rewriter` 按风格画像重写；`feedback_memory_candidate` 只输出风格偏好候选记忆。

落地切片：轻量模式已落在 `graph_template/official/multi_platform_content_repurposer/`，支持一篇源内容、目标平台列表、少量历史样本、传播目标、普通输入式人工反馈、只读风格 `memory_recall`、核心观点提取、风格画像、平台策略、平台初稿、AI 味检测、风格重写、平台适配评分、发布计划、`memory_candidate_writer` 候选风格记忆、artifact/output contract、README、mock data、示例输出和 eval case metadata。完整模式候选扩展包括更细的用户反馈二次修改体验、平台分发评分、封面生成提示词和评测自动运行；这些不阻塞当前 Gallery 商业化基线。用户反馈应通过普通最终回复进入下一轮，不使用模板断点。

输出物：`core_message.json`、`style_profile.json`、`ai_tone_report.json`、`wechat_article.md`、`zhihu_article.md`、`xiaohongshu_note.md`、`bilibili_script.md`、`douyin_script.md`、`x_thread.md`、`youtube_description.md`、`cover_prompts.txt`、`publishing_plan.json`、`final_distribution_pack.md`。

Eval：检查是否保留原文核心观点、目标平台风格是否准确、AI 味评分是否下降、是否符合用户历史风格、是否生成完整分发包、用户反馈后是否修改对应问题。

### 第二批模板

#### Job Application & Interview Coach

用途：根据用户长期职业画像、项目经历和目标 JD，生成岗位匹配报告、简历改写、项目故事库、面试题预测、模拟面试反馈和阶段性准备计划。

差异化目标：不要只做普通 JD 分析和简历润色；TooGraph 版本要沉淀候选人长期画像、项目故事库、多岗位对比、多轮模拟面试记录、薄弱点追踪、目标城市和薪资策略。

工作流：

```text
简历 / 项目经历 / 目标 JD / 目标城市 / 目标薪资
  -> JD 能力拆解
  -> 候选人经历匹配
  -> 差距分析
  -> 项目故事线生成
  -> 简历 bullet 改写
  -> 面试题预测
  -> 模拟面试
  -> 回答评分
  -> 薄弱点训练计划
  -> 候选人记忆候选
```

核心 state：`candidate_profile`、`resume`、`project_experiences`、`job_description`、`target_city`、`salary_expectation`、`jd_requirements`、`matching_report`、`gap_analysis`、`resume_rewrite`、`project_story_library`、`interview_questions`、`mock_interview_transcript`、`mock_interview_feedback`、`learning_plan`。

落地切片：轻量模式已落在 `graph_template/official/job_application_interview_coach/`，支持候选人画像、简历、项目经历、单个目标 JD、目标城市、薪资期望、可选模拟面试记录、只读 `memory_recall`、JD 能力矩阵、经历匹配图、岗位匹配报告、差距分析、简历 bullet 改写、STAR/CAR 项目故事库、面试题预测、模拟面试反馈或评分表、阶段准备计划、薪资策略、`memory_candidate_writer` 候选人记忆、artifact/output contract、README、mock data、示例输出和 eval case metadata。完整模式候选扩展包括多 JD 对比、模拟面试多轮记录、弱点趋势追踪、行业薪资数据和评测自动运行；这些不阻塞当前 Gallery 商业化基线。涉及职业建议时必须保留不确定项和人工判断提示。

输出物：`jd_requirement_matrix.json`、`matching_report.md`、`gap_analysis.md`、`rewritten_resume.md`、`project_story_library.json`、`interview_questions.json`、`mock_interview_feedback.md`、`learning_plan.md`、`salary_strategy.md`。

Eval：检查 JD 拆解是否完整、经历映射是否准确、简历 bullet 是否具体可验证、项目故事是否符合 STAR/CAR 结构、模拟面试反馈是否指出具体问题、学习计划是否有时间和任务安排。

#### Game Creative Factory

用途：把游戏广告创意生产拆成可观察的 Agent 工作流：游戏类型输入、新闻辅助、竞品素材分析、视频理解、模式总结、Creative Brief、多版本脚本、图片分镜、视频提示词、审核评分、返修循环和 artifacts 输出。

`game_genre` 是输入字段，SLG 只是一种示例值；同一模板应支持 RPG、策略、休闲、模拟、卡牌、塔防、解谜、射击等类型。

工作流：

```text
RSS 新闻 / 用户上传素材 / 示例素材 / 游戏类型
  -> 新闻清洗
  -> 广告素材抓取或上传素材规范化
  -> Top 视频筛选
  -> 视频理解
  -> 竞品模式总结
  -> 新闻辅助上下文
  -> Creative Brief
  -> 多版本创意脚本
  -> 图片分镜脚本
  -> 视频提示词
  -> 创意评分审核
  -> 未通过则根据反馈重写
  -> 图片生成任务清单 / 视频生成任务清单
  -> 最终创意包
```

核心 state：`game_genre`、`rss_items`、`clean_news_items`、`ad_items`、`normalized_video_items`、`selected_video_items`、`video_analysis_results`、`news_context`、`pattern_summary`、`creative_brief`、`script_variants`、`storyboard_packages`、`video_prompt_packages`、`review_results`、`best_variant`、`revision_feedback`、`image_generation_todo`、`video_generation_todo`、`final_summary`。

模式：轻量模式只需要示例素材或素材分析文本，生成 brief、脚本、分镜和提示词；完整模式再接入 RSS、广告素材抓取、视频理解和审核返修。首次模板必须包含 mock data。

落地切片：轻量模式已落在 `graph_template/official/game_creative_factory/`，支持 `game_genre`、游戏简报、目标用户、创意目标、市场/新闻材料、竞品广告素材分析、上传素材分析、平台约束、返修反馈、只读 `memory_recall`、多源输入规范化、竞品模式总结、新闻辅助上下文、Creative Brief、脚本变体、图片分镜、视频提示词、创意审核评分、最佳变体选择、图片/视频生成任务清单、`memory_candidate_writer` 创意候选记忆、artifact/output contract、README、mock data、示例输出和 eval case metadata。完整模式候选扩展包括真实 RSS、广告素材抓取、视频理解服务、审核返修循环、生成任务下游执行和评测自动运行；这些不阻塞当前 Gallery 商业化基线。广告素材和平台合规风险必须显式输出。

输出物：`creative_brief.md`、`pattern_summary.md`、`news_context.md`、`script_variants.json`、`storyboards_showcase.md`、`video_prompts_showcase.md`、`review_results.json`、`best_variant.json`、`todo_image_generation.md`、`todo_video_generation.md`、`final_summary.md`。

Eval：检查多源输入是否被使用、素材模式是否被总结、brief 是否包含目标用户和创意策略、多版本脚本是否差异化、分镜和视频提示词是否可执行、审核返修是否能收敛、不同 `game_genre` 是否影响创意策略。

### 后续模板

#### Product Competitor Research Agent

用途：输入产品方向、竞品资料、用户评论和访谈材料，生成竞品画像、功能矩阵、用户痛点、机会点排序、MVP 方案和 PRD 草稿。

工作流：

```text
产品方向 / 竞品链接 / 用户评论 / 应用商店评价 / 官网 / 截图 / 用户访谈
  -> 竞品资料整理
  -> 功能矩阵生成
  -> 评论与反馈聚类
  -> 用户痛点提取
  -> 产品机会点排序
  -> MVP 方案
  -> PRD 草稿
  -> 风险和验证计划
```

核心 state：`product_idea`、`competitor_sources`、`competitor_profiles`、`feature_matrix`、`user_review_clusters`、`pain_points`、`opportunity_report`、`mvp_plan`、`prd_draft`、`validation_plan`。

落地切片：轻量模式已落在 `graph_template/official/product_competitor_research_agent/`，支持产品方向、竞品资料、用户评论、访谈材料、目标市场、研究目标、已有知识、只读 `memory_recall`、证据索引、竞品画像、带证据的功能矩阵、反馈清洗和聚类、痛点提炼、机会点排序、MVP 方案、PRD 草稿、验证计划、`memory_candidate_writer` 产品候选记忆、artifact/output contract、README、mock data、示例输出和 eval case metadata。完整模式候选扩展包括 URL/截图/应用商店评论导入、知识库检索、真实批量证据导入和评测自动运行；这些不阻塞当前 Gallery 商业化基线。做浅了会退化成普通竞品分析，所以必须优先保证证据链和引用。

输出物：`competitor_profiles.json`、`feature_matrix.csv`、`review_clusters.json`、`pain_points.md`、`opportunity_report.md`、`mvp_plan.md`、`prd_draft.md`、`validation_plan.md`。

Eval：检查多源材料是否进入证据链、功能矩阵是否可追溯、评论聚类是否稳定、机会点排序是否有依据、MVP 和 PRD 是否保留假设与验证计划。

#### E-commerce Review Mining Agent

用途：批量分析商品评论和竞品评论，提炼好评点、差评点、用户画像、购买动机、卖点、风险点，并生成详情页文案、短视频脚本和小红书种草笔记。

工作流：

```text
商品评论 / 竞品评论 / 店铺评价 / 用户反馈
  -> 评论清洗
  -> 好评点聚类
  -> 差评点聚类
  -> 用户画像推断
  -> 购买动机分析
  -> 卖点提炼
  -> 风险点提炼
  -> 详情页文案
  -> 短视频脚本
  -> 小红书种草笔记
```

核心 state：`raw_reviews`、`clean_reviews`、`positive_review_clusters`、`negative_review_clusters`、`user_persona`、`purchase_motivation`、`selling_points`、`risk_points`、`product_copy`、`short_video_scripts`、`xiaohongshu_notes`。

落地切片：轻量模式已落在 `graph_template/official/ecommerce_review_mining_agent/`，支持商品背景、自家评论、竞品评论、店铺反馈、目标平台、营销目标、合规说明、只读 `memory_recall`、评论证据索引、去噪去重、自家/竞品/店铺反馈区分、好评点聚类、差评点聚类、用户画像、购买动机、证据支持的卖点和风险点、详情页文案、短视频脚本、小红书笔记、`memory_candidate_writer` 评论洞察候选记忆、artifact/output contract、README、mock data、示例输出和 eval case metadata。完整模式候选扩展包括真实 CSV/JSON 批量导入、平台合规词库、评论来源统计、生成素材下游执行和评测自动运行；这些不阻塞当前 Gallery 商业化基线。

输出物：`positive_review_clusters.json`、`negative_review_clusters.json`、`user_persona.md`、`purchase_motivation.md`、`selling_points.md`、`risk_points.md`、`product_copy.md`、`short_video_scripts.md`、`xiaohongshu_notes.md`。

Eval：检查评论清洗是否去噪、聚类是否覆盖主要观点、每个卖点是否关联真实评论证据、是否区分自家商品和竞品、风险点是否保守表达、营销素材是否符合平台合规边界。

### 暂不纳入官方重点模板

这些方向不作为当前官方 Gallery 重点，除非后续重新定义出明显强于网页模型或垂直工具的图工作流价值。

暂缓清单：

- `paper_to_insight_report` 暂缓。普通论文摘要和问答已被网页模型覆盖；只有升级为论文到可复现实验计划、代码实现任务、相关论文图谱和项目落地方案，才值得重评。
- `meeting_to_prd_action_plan` 暂缓。飞书、钉钉、腾讯会议等办公软件拥有原生会议上下文，普通纪要和待办没有 TooGraph 优势。
- `codebase_onboarding_agent` 暂缓。Cursor、Codex、Claude Code 和 GitHub Copilot 更接近代码环境；TooGraph 不把普通代码理解作为官方重点模板。
- `personal_knowledge_weekly_report` 存疑。场景偏向 Obsidian/Notion 用户，需证明稳定刚需。
- `long_video_to_article_agent` 暂缓。已有垂直产品较多，除非能接入证据链、剪辑 artifact 和多平台分发闭环。
- `course_builder_agent` 存疑。真正难点是教学质量、交付和反馈闭环，不是课程内容生成。
- `finance_news_briefing_agent` 存疑。容易触及投资建议边界，需要合规设计后再评估。
- `customer_feedback_analysis_agent` 暂不单独立项。它与 Product Competitor Research 和 E-commerce Review Mining 重叠，优先作为二者子模块复用。
- `open_source_project_launch_agent` 不作为官方重点模板。使用人群过窄，可内部自用但不进入主 Gallery。

## 部署和项目可用性

当前基线与后续约束：

- 桌面端、Docker 和单机源码部署路径已统一到 `npm start` / `node scripts/start.mjs`；`docs/deployment.md` 记录源码运行、Docker、数据卷、端口绑定、健康检查和更新流程，Docker 镜像通过 `TOOGRAPH_HOST=0.0.0.0` 暴露单端口服务。
- 关键 UI 流程已有 Playwright 覆盖：Buddy 虚拟操作跟随/后台证据、知识库管理、Gallery 多语言与模板打开、运行记录恢复、权限确认恢复，以及真实编辑器模板运行。
- 知识库管理已覆盖官方导入、检索、引用展示、重建索引、删除确认、删除清理和检索质量评测。
- 内部 `agent` kind 的用户心智迁移为 LLM 节点语义是长期命名清理方向；不能引入第二套协议。

## 不再维护的方向

- 不恢复 `docs/current_project_status.md` 这类当前实现快照。
- 不恢复 `docs/future/toograph_p0_p1_development_goals.md` 或平行的模板库长期规划。
- 不创建单体 `self_evolve` Skill 或 Buddy 专用隐藏 runtime。
- 不把 SLG 做成固定模板身份；游戏模板应以通用 `game_genre` 输入表达类型。
- 不把用户聊天输入当作隐藏断点 resume payload。
- 不让 Buddy 绕过 TooGraph 编辑器命令、校验、审计、revision 和 undo/redo 直接改图。
