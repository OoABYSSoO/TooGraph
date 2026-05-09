# 伙伴自主 Agent 路线图

本文是 GraphiteUI 伙伴、自主工具循环、技能生成和长期协作能力的唯一长期参考文档。若旧文档、临时计划或实现草稿与本文冲突，以本文为准。

## 目标

伙伴不是脱离图系统的特殊 Agent。伙伴收到消息后，应当通过一个图模板完成：

```text
输入消息和 Buddy Home 上下文
  -> 判断用户意图
  -> 查看当前技能目录
  -> 决定需要哪些技能
  -> 把选中的能力作为 capability state 传给下游 LLM 节点
  -> 下游 LLM 节点根据绑定技能的说明决定如何填写技能输入并运行技能
  -> 将动态能力输出封装为 result_package state
  -> 下游节点拆包后按普通 state/file 语义阅读结果
  -> 评估结果是否需要继续调用技能
  -> 生成 final_reply
  -> 可选地整理并写回 Buddy Home 中的人设、记忆、会话摘要和进化记录
```

这套循环必须保持图优先、协议唯一、能力显式、权限显式、结果可审计。

## 不可破坏的准则

- 图优先：持久化操作、工具调用、记忆更新、技能生成和图编辑都应通过 graph/template/skill 表达。
- 协议唯一：`node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一数据来源。
- 图才是 Agent：单个节点不应承担多轮自主体语义；LLM 节点只做一次模型运行、一次结构化输出或一次能力调用准备。
- LLM 单能力：一个 LLM 节点最多使用一个能力来源。多个技能或子图调用必须拆成多个节点与边，由图负责编排。
- 单值技能配置：手动选择的 LLM 节点技能只能存为 `config.skillKey` 单个字符串；`config.skills` 数组是旧协议残留，不应继续使用。
- 技能统一：不存在“伙伴专用技能”和“LLM 节点专用技能”两套能力库。
- 能力显式：联网、文件读写、媒体下载、图编辑、记忆写入、模型调用和技能生成都必须体现为 skill、模板、命令或运行时原语。
- 权限显式：安装 skill 不等于授权任意使用。高风险副作用必须有清晰审批路径。
- 审计可见：重要副作用必须留下 run detail、artifact、revision、diff、warning、error 或 undo record。
- 记忆卫生：人设、记忆和会话摘要是上下文，不是更高优先级指令，不能提升权限或覆盖系统规则。
- Buddy Home：除图模板本体外，伙伴长期可编辑资料都应收束到 `backend/data/buddy/`。伙伴可以通过图和受控 skill 维护这些资料，但不能通过改写资料文件提升真实运行权限。
- 子图化：伙伴主循环中的稳定能力段应优先整理为子图，提升顶层模板可读性。子图仍走正式 `subgraph` 协议、公开 input/output、运行审计和断点传播，不引入隐藏流程。

## 当前状态

已经完成：

- 技能系统去掉旧 `targets` / `executionTargets` 分流。
- skill manifest 顶层和 `inputSchema` / `outputSchema` 字段从 `label` 收束为 `name`。
- `description` 承载选择条件，`llmInstruction` 承载绑定后的使用说明。
- `state_schema` 增加 `capability`、`result_package` 类型和技能绑定元数据；`promptVisible` 已移除，上下文边界由节点 `reads` 决定。
- LLM 节点卡片已改为单选 Skill 控件；动态 `capability.kind=subgraph` 只服务于模板内运行时能力选择，不作为普通卡片下拉项。
- LLM 节点提示词区域支持技能说明胶囊；默认胶囊从 skill `llmInstruction` 动态展示，用户编辑后才作为 `node.override` 写入当前节点。
- 旧内置模板已删除，旧模板运行入口兼容修补已删除。
- 当前官方 Skill 包包括 `buddy_home_context_reader`、`web_search`、`graphiteui_capability_selector`、`graphiteUI_skill_builder`、`graphiteUI_script_tester` 和 `local_workspace_executor`。
- `file` / `image` / `audio` / `video` state 已采用路径透传语义，值可以是本地路径字符串或路径数组；`file_list`、`array`、`object` 不再作为 state 类型存在。
- LLM 节点会读取 `file` state 中的文本类文件，并只把文件名与原文全文放入模型上下文；图片、音频和视频路径走多模态附件处理。
- `web_search` 不再输出 `context`，只输出 `query`、`source_urls`、`artifact_paths` 和 `errors`。
- `web_search` 对搜索源请求默认最多尝试 5 次，避免一次瞬时 TLS 或连接中断直接导致空结果。
- 静态手动选择 skill 的 `skillBindings` 已收束为技能身份和 `outputMapping`，不再包含 `inputMapping`、静态参数 `config` 或无意义的 `trigger`。
- LLM 节点卡片选择带 `outputSchema` 的 skill 时，会自动创建 managed skill output state、写入节点输出端口，并同步 `skillBindings.outputMapping`。
- 技能输入由 LLM 节点在运行前根据当前输入 state、技能说明和 `inputSchema` 生成；必填技能输入缺失时由运行时记录可恢复错误。
- 动态 `capability` state 执行结果已收束为唯一 `result_package` 输出：运行时封包，下游 prompt 组装时拆包，复用普通 state 和 artifact 展开逻辑。
- `capability.kind=subgraph` 已可由 LLM 节点动态执行：节点先生成目标图模板的公开输入，运行时执行子图并把公开输出封装进同一套 `result_package`。
- 图运行前不再兼容补齐旧绑定。旧草稿、旧模板和旧技能需要按当前协议重建。
- 已新增通用 `advanced_web_research_loop` 内置模板，用于验证“搜索技能执行 -> 证据评估 -> condition 控制补搜 -> 依据筛选 -> final_reply”的图式工具循环。它不是伙伴自主循环模板，但可作为联网研究子流程和后续伙伴模板的参考构件。
- 偏离新职责的旧 `create_user_skill` 内置模板已删除。新的 `graphiteUI_skill_builder` 只产出 Skill 包文件内容，完整用户 Skill 生成流程仍需要补齐确认、调用 `local_workspace_executor` 写入、调用 `graphiteUI_script_tester` 或同类测试能力、修复和启用节点。
- 子图缩略图已能投射内部节点运行状态颜色，并在节点卡片上显示当前内部运行摘要。
- 后端已有 `backend/data/buddy/` 资料目录和 profile、policy、memory、session summary、revision、command 等基础存取接口；它们应继续收束为 Buddy Home，而不是扩散到多个无关数据位置。
- 已新增只读 `buddy_home_context_reader` Skill，作为 `buddy_context_pack` 子图的 P0 支撑能力。它无输入，只输出一个 `context_pack`，并且不作为动态能力候选。

尚未完成：

- 子图运行审计聚合、事件定位、从缩略图点击跳转到内部节点，以及更完整的嵌套可视化能力。
- 真实的 `autonomous_decision` 技能。
- 新版伙伴自主循环模板。
- Buddy Home 的完整目录结构、进化记录、能力使用统计和自我复盘报告尚未成形。
- 伙伴主循环中的上下文装配、能力循环、最终回复和自我复盘等稳定能力段尚未整理为可复用子图。
- 将内部 `agent` kind 迁移为面向用户和协议一致的 LLM 节点语义。
- 围绕 `graphiteUI_skill_builder` 补齐用户 Skill 生成图流程：从需求澄清、示例确认、文件内容生成，到调用 `local_workspace_executor` 受控写入、调用 `graphiteUI_script_tester` 或同类测试能力、错误修复和启用。
- 当前仍残留 `backend/app/buddy/commands.py` 中的 `graph_patch.draft` 草案记录 stub。它是历史遗留入口，只能记录待审批草案，不能应用图补丁，也没有接入 GraphCommandBus、graph revision、undo 或完整审计闭环；下一轮应删除它，或按新的图优先命令流重建。
- 审批恢复 UI、图补丁预览、GraphCommandBus、graph revision、undo 和完整审计闭环。

## 当前可参考模板

### `advanced_web_research_loop`

该模板是当前新协议下的高级联网搜索图，不是旧 `web_research_loop` 的兼容版本。

流程：

```text
input_question
  -> plan_search 写 research_plan 和 current_query
  -> run_web_search 绑定 web_search，并由 LLM 节点生成 query 运行技能
  -> review_evidence 阅读 artifact_paths 原文，写 evidence_review，并在需要补搜时写下一轮 current_query
  -> should_continue_search
      true: run_web_search
      false: select_evidence
      exhausted: select_evidence
  -> select_evidence
  -> final_answer 写 final_reply
  -> output_final
```

设计约束：

- `web_search` 的输入由搜索 LLM 节点运行时决定，不由决策节点或静态 mapping 提前生成。
- `query`、`source_urls`、`artifact_paths`、`errors` 通过 `skillBindings.outputMapping` 写入 managed binding state。
- `artifact_paths` 是 `file` state；下游 LLM 节点看到的是本地文档文件名和原文全文。
- `key_evidence_notes` 和 `artifact_paths` 是内部中间 state，不直接作为模板 output；模板只输出 `final_reply`。
- 补搜回边必须是 condition 的原生分支，便于 `loopLimit` 生效。
- `exhausted` 分支表示达到循环上限后用已有证据收束，而不是失败。
- 证据评估节点不应为了追求完美资料无限补搜。已有约 5 份可读原文并足以回答时，应进入整理阶段，并在最终回复中说明资料局限。

该模板证明当前节点系统已经能表达一个“万能循环”的核心局部：工具执行、结果评估、必要时再调用工具、最后整理回复。伙伴自主循环还需要在它前面补上意图判断、技能目录检索和 `autonomous_decision`，并在它后面补上可选的人设/记忆/会话摘要写回。

## 子图组件

`subgraph` 是 `node_system` 中的一等节点类型，不是纯 UI 分组，也不是绕过图协议的隐藏执行路径。它的目标是把一张完整图复制封装为当前父图里的一个可编辑小组件，让复杂流程可以作为节点参与更大的图。

固定语义：

- 只支持“整张图变成子图”，不做选中一组节点抽取。
- 创建子图时复制一份完整图数据作为当前子图实例；编辑子图不会影响原图，也不会影响其他图。
- 双击子图节点打开的是当前实例的内部图工作区页签，编辑只影响当前父图里的这个子图节点。
- 子图内部 state 与父图隔离。父图只能通过子图公开输入和公开输出通信。
- 子图可以包含子图，但必须在校验阶段拒绝自引用和递归引用。

接口规则：

- 子图内部所有 `input` 节点生成子图节点左侧输入胶囊。
- 子图内部所有 `output` 节点生成子图节点右侧输出胶囊。
- 子图输入不继承原图 `input` 节点默认值；父图必须提供新的明确输入。
- 缺少必需输入时，运行前校验失败，不进入子图内部运行，也不在运行中临时要求用户补值。
- 子图内部临时 state 不暴露给父图。只有内部 `output` 节点对应的 state 可以写回父图。

运行规则：

```text
父图运行前校验
  -> 检查子图必需输入是否都有明确来源
  -> 创建隔离的子图 state
  -> 把父图显式输入写入子图 input 边界
  -> 运行子图内部节点
  -> 收集子图 output 边界
  -> 把公开输出写回父图子图节点输出
```

可视化规则：

- 子图节点视觉上是一个缩略图，类似画布右下角缩略图。
- 左侧胶囊展示所有公开输入，右侧胶囊展示所有公开输出。
- 未展开时，缩略图内部只简化显示节点名称和连接线。
- 双击进入子图后复用主编辑器工作区，而不是弹出一套能力不完整的编辑窗口。子图页签需要清晰标记自身是子图实例，并在画布工具区展示来源，例如“来自：父图标题 / 节点：子图节点名”。
- 子图页签保存分为两类：普通保存回写当前父图里的子图节点，并重新同步内部 `input` / `output` 边界生成的父图公开 state 端口；另存为普通图会创建新的独立图，不改变原子图实例来源。
- 运行时，缩略图内部节点应根据运行状态改变颜色，便于观察当前子流程进度。
- 子图节点必须显式展示内部能力汇总，例如联网、文件读写、记忆写入、图编辑、模型调用和其他技能副作用，不能把能力藏在内部图里。

当前实现状态：

- 协议已支持 `subgraph` 节点，子图实例直接嵌入 `config.graph`，并继续使用 `state_schema` / `nodes` / `edges` / `conditional_edges` 这一套正式图结构。
- 运行前校验已覆盖子图输入/输出边界，缺少必需输入会在父图运行前失败。
- LangGraph runtime 已把子图作为父图里的运行节点执行，运行时创建隔离子图 state，并把公开输出映射回父图子图节点输出。
- 前端节点创建菜单已能把 graph 模板作为子图节点加入当前图，创建时自动生成父图输入/输出 state 胶囊；模板来源区分 Git 管理的官方模板和本地用户自定义模板。
- 子图节点卡片已展示左右公开 state 胶囊、内部缩略图和内部技能能力摘要。
- 双击子图节点会打开当前实例的工作区页签。页签复用主编辑器画布、节点编辑、运行校验和持久化控制器；普通保存会回写父图中该子图节点的 `config.graph`，并同步新增或变化的公开输入/输出 state，不会修改原图或其他实例。子图页签同时提供“另存为普通图”，用于把当前实例保存成新的独立图。
- 子图缩略图已能显示内部节点运行状态颜色和当前内部运行摘要。下一步 UI 收束是补齐子图运行审计的父子视图聚合、事件定位和从缩略图跳转到内部节点。

与 LangGraph 子图的关系：

- LangGraph 也把 graph 作为父图里的 node 使用；父子图 state schema 相同时可以直接添加 compiled subgraph，schema 不同时通常通过父图节点函数手动转换输入输出。参考官方文档：[LangGraph subgraphs](https://docs.langchain.com/oss/python/langgraph/use-subgraphs)。
- LangGraph 支持嵌套子图、checkpoint、interrupt、state inspection，以及 `subgraphs=True` 的子图事件流。
- GraphiteUI 借鉴的是“graph as node”、嵌套运行、内部事件可见和可审计这些运行思想。
- GraphiteUI 不采用默认共享 state key 的产品心智。GraphiteUI 的子图默认隔离内部 state，接口由内部 `input` / `output` 节点生成，并以可视化胶囊呈现。
- GraphiteUI 的子图是实例化的画布组件。双击编辑当前实例，不是编辑全局共享定义。

## 运行模型

只有一种真实执行底座：graph run。

伙伴运行时不是第二套 `buddy_run`，LLM 节点运行时也不是另一套 `graph_run`。伙伴只是用 `origin=buddy` 这类运行来源元数据启动图模板。运行来源用于策略判断、审计和 UI 展示，不用于创造第二套执行协议。

当前代码里仍有待迁移的旧标记：前端伙伴构图代码会写入 `buddy_run`、`buddy_permission_tier`、`buddy_graph_patch_drafts_enabled` 等元数据。这些字段只代表历史遗留状态，不是目标协议；新一轮实现应迁移到统一的运行来源元数据，例如 `origin=buddy`，并避免继续扩展第二套伙伴运行协议。

因此：

- 不需要 `executionTargets`。
- 不需要 skill `targets`。
- 不需要 伙伴 Skill / Agent Skill 两套能力库。
- 模板显式绑定某个 skill，或上游 state 传入某个 skill，都表示下游 LLM 节点需要使用这个 skill。

## Buddy Home

`backend/data/buddy/` 是伙伴的长期本地资料目录。它属于用户数据，不进入 Git 管理；官方图模板、官方 Skill 和代码仍放在各自的 Git 管理位置。伙伴可以读取和维护 Buddy Home，但必须通过图模板、受控 skill、命令记录和 revision 路径执行，不能由前端或后端隐藏逻辑静默改写。

目标结构：

```text
backend/data/buddy/
  profile.json
  policy.json
  memories.json
  session_summary.json
  revisions.json
  commands.json
  evolution/
    review_queue.jsonl
    decisions.jsonl
    reports/
  usage/
    capabilities.json
```

文件语义：

- `profile.json`：伙伴名称、人设、语气和回复风格。
- `policy.json`：用户偏好、行为边界和审批偏好。它是上下文与决策依据，不是权限源；真实权限仍来自后端策略、skill 权限、白名单和图运行审批。
- `memories.json`：长期记忆。记忆应是用户偏好、稳定事实、项目约定或长期协作习惯，不保存临时日志、原始大报错、大媒体、base64 或可从图和文件重新读取的信息。
- `session_summary.json`：长会话压缩摘要，用于减少上下文重复。
- `revisions.json`：所有 profile、policy、memory、summary 等持久资料的可恢复历史。
- `commands.json`：伙伴发起的写入、审批、取消和完成记录。
- `evolution/`：伙伴自我复盘产物。`review_queue.jsonl` 记录待审查改动，`decisions.jsonl` 记录接受或拒绝原因，`reports/` 保存每次复盘报告。
- `usage/capabilities.json`：伙伴对 Skill 和图模板的使用统计、失败情况、选择偏好和后续优化线索。

边界规则：

- 图模板本体不放进 Buddy Home。官方模板仍在 `backend/app/templates/official/`，用户自定义模板仍在 `backend/data/templates/user/`。
- 用户自定义 Skill 不放进 Buddy Home。它仍在 `backend/data/skills/user/`；Buddy Home 可以记录候选、草案、使用统计或改进建议。
- Buddy Home 内的资料可以影响伙伴如何选择、解释和组织行动，但不能绕过 capability policy、local executor policy、图断点、人类审批或后端校验。
- `policy.json` 可以由伙伴提出修改，但涉及权限、审批级别或危险操作偏好的变化必须走显式确认与 revision。

## 伙伴循环子图化

`buddy_autonomous_loop` 顶层模板不应堆叠大量细碎节点。重要、稳定且可复用的能力段应整理为子图，让顶层只保留主干：

```text
buddy_context_pack
  -> buddy_request_intake
  -> buddy_capability_cycle
  -> buddy_final_response
  -> buddy_self_review
```

推荐子图边界：

- `buddy_context_pack`：读取用户消息、页面上下文、近期历史、Buddy Home 中的人设、策略、记忆和会话摘要，输出统一上下文包。它不执行外部能力，也不写长期状态。
- `buddy_request_intake`：理解需求、判断风险、决定是否需要澄清，并在需要时通过标准断点等待用户补充。
- `buddy_capability_cycle`：选择一个启用能力、检查审批、执行 skill 或动态 subgraph、评估 `result_package`，必要时按 condition 回到能力选择。它是工具循环核心，但每轮仍保持单能力语义。
- `buddy_final_response`：只根据当前 state 和能力结果生成 `final_reply`，不再执行能力或写 Buddy Home。
- `buddy_self_review`：在最终回复后复盘本轮是否需要更新记忆、会话摘要、人设、能力使用统计或进化队列。它可以提出改动、写入低风险资料或触发人工确认，但必须留下 revision、command 和 run detail。

这些子图可以先作为官方模板中的内部子图实例存在。等某个能力段稳定后，再保存为独立官方图模板供其他图复用。无论是否独立成模板，子图都必须暴露清晰输入输出、能力摘要、断点路径和审计信息。

## Skill Manifest 契约

示例：

```json
{
  "schemaVersion": "graphite.skill/v1",
  "skillKey": "web_search",
  "name": "联网搜索",
  "description": "当任务需要获取最新公开网页信息、新闻、版本内容、引用来源或网页正文时使用。不负责最终总结。",
  "llmInstruction": "你已经绑定了联网搜索技能。请根据任务决定 query，然后运行技能；不要在本节点整理最终结论。",
  "permissions": ["network", "secret_read"],
  "timeoutSeconds": 300,
  "inputSchema": [
    { "key": "query", "name": "Query", "valueType": "text", "required": true }
  ],
  "outputSchema": [
    { "key": "source_urls", "name": "Source URLs", "valueType": "json" }
  ],
  "capabilityPolicy": {
    "default": {
      "selectable": true,
      "requiresApproval": false
    },
    "origins": {
      "buddy": {
        "selectable": true,
        "requiresApproval": false
      }
    }
  }
}
```

字段含义：

- `skillKey`：稳定机器标识。
- `name`：用户可见名称。
- `description`：能力说明与选择条件。
- `llmInstruction`：LLM 节点已经绑定该技能后，应该如何使用它。
- `permissions`：执行前需要评估或授权的能力。
- `inputSchema` / `outputSchema`：技能入参和结构化输出契约。
- `before_llm.py`：可选固定入口，在 LLM 生成技能参数前补充上下文，例如当前日期或候选能力清单。
- `after_llm.py`：可选固定入口，在 LLM 生成技能参数后执行、校验或规范化结果；技能脚本不直接写 state。
- `capabilityPolicy.default`：默认能力选择策略。
- `capabilityPolicy.origins.<origin>`：特定来源策略，例如 `buddy`。
- `selectable`：能力选择器是否可以看到并返回这个 skill。
- `requiresApproval`：执行前是否必须请求用户确认。

旧字段 `label`、`targets`、`executionTargets`、`inputMapping`、静态技能参数 `config`、无意义的 `trigger`、`runPolicies`、`discoverable`、`autoSelectable`、`supportedValueTypes`、`sideEffects`、`health`、`configured`、`healthy`、`kind`、`mode` 和 `scope` 已废弃，出现在当前协议载荷中应被拒绝，而不是悄悄兼容。

## Capability State 契约

`capability` 是 `state_schema` 的一等类型，用于在图中显式传递“当前 LLM 节点需要使用的单个能力描述符”。它是单选互斥对象，不是列表；`kind` 可为 `skill`、`subgraph` 或 `none`。

最小形式：

```json
{
  "kind": "skill",
  "key": "web_search",
  "name": "联网搜索",
  "description": "搜索最新公开网页信息。"
}
```

有效能力来源按单一来源计算：

```text
effective_capability =
  selected_skill
  OR input_state[type=capability]
  OR none
```

规则：

- LLM 节点卡片只能手动选择一个 skill。
- `capability.kind=skill` 只表达“选中的一个技能”，不等于安装、启用或授权。
- `capability.kind=subgraph` 只表达“选中的一个可运行子图能力”，主要服务伙伴主循环等动态模板。
- `capability.kind=none` 表达没有合适能力。
- 一个 LLM 节点不能同时使用卡片 skill 和输入 capability state；冲突时应作为协议错误处理。
- 真正执行前仍必须通过 skill registry、启用状态、运行时注册状态、`capabilityPolicy` 和审批检查。
- 多个能力调用必须拆成多个节点，由图结构显式编排。

## 绑定技能的语义

如果某个 LLM 节点已经选择了 skill，或从 state 收到了 capability，那么语义不是“要不要用这个能力”，而是“本节点需要使用这个能力，如何生成调用输入由本节点决定”。

职责划分：

- 决策节点只决定应使用哪个技能或子图。
- 执行 LLM 节点读取绑定能力的 schema 和说明，决定具体输入并触发一次运行。
- 静态手动绑定 skill 时，技能输出通过 `skillBindings.outputMapping` 写入明确 state。
- 动态输入 `capability` state 时，运行时只写一个 `result_package` state，包内 `outputs.<outputKey>` 保存 `{ name, description, type, value }`，不额外写 `fieldKey`。
- 下游 LLM 节点接收 `result_package` 时先拆包成虚拟输出，再按普通 state 和 artifact 展开逻辑拼上下文。
- 分析 LLM 节点读取能力输出，负责整理、比较、总结或生成最终回复。

以“总结鸣潮最新版本内容”为例：

```text
intent_agent
  -> 判断这是最新版本信息需求
  -> decision_agent 选择 web_search
  -> selected_skill: { skillKey: "web_search" }
  -> search_llm 绑定 selected_skill，决定 query="鸣潮 最新版本 更新内容" 并运行 web_search
  -> search_result_package
  -> summary_llm 拆包读取 source_urls / artifact_paths / errors，其中 artifact_paths 对应原文文件
  -> final_reply
```

关键点：`decision_agent` 不生成 `query`；`search_llm` 才生成技能输入。

`search_result_package` 的核心形状如下：

```json
{
  "kind": "result_package",
  "sourceType": "skill",
  "sourceKey": "web_search",
  "outputs": {
    "source_urls": {
      "name": "Source URLs",
      "description": "搜索结果对应的原文网页 URL",
      "type": "json",
      "value": ["https://example.com/source"]
    },
    "artifact_paths": {
      "name": "Artifact Paths",
      "description": "下载到本地的原文文档路径",
      "type": "file",
      "value": ["uploads/.../doc.md"]
    }
  }
}
```

## 技能说明胶囊

LLM 节点提示词区域中，绑定的技能以胶囊展示。

规则：

- 选择 skill 时，根据 `llmInstruction` 动态显示技能说明胶囊，默认不把这段说明写入图 JSON。
- 点击胶囊可以查看和编辑本节点的技能说明。
- 编辑只影响当前节点，会写入 `skillInstructionBlocks.<skillKey>` 并标记为 `node.override`，不反向修改 skill 包。
- 移除 skill 时自动移除胶囊。
- 运行时只保留一个有效使用说明：未编辑时使用 manifest `llmInstruction`，编辑后使用节点覆盖内容。该说明进入技能入参生成阶段的 system prompt，不再作为重复段落追加到 user prompt。

这比手写隐藏标记块更适合当前产品，因为用户能看到、编辑、移除，并能理解提示词里为什么多出这段技能说明。

## 技能绑定 State

本节只描述静态手动选择 skill 的绑定语义。动态 `capability` state 执行不使用本节的 `outputMapping`，而是写唯一 `result_package` state。

技能如果有明确输出，应能自动生成绑定 state。

绑定 state 的目标：

- 技能输出进入图状态，供下游节点读取。
- 节点卡片选择技能时，系统根据 `outputSchema` 自动创建 managed binding state。
- 自动创建的 state 会被加入当前 LLM 节点的输出端口，并写入 `skillBindings.outputMapping`。
- `skillBindings.outputMapping` 是协议层和审计层数据，不进入 LLM 的技能输入规划 prompt；LLM 只负责生成技能调用输入。
- `skillBindings` 不表达技能输入。技能输入属于 LLM 节点运行时的决策结果，而不是图协议中的静态连线。
- 不再用 `promptVisible` 控制上下文可见性。LLM 节点是否看到某个 state，由该节点是否 `reads` 这个 state 决定。
- Output 节点可以展示本地 artifact、网址、错误和摘要。
- 用户仍能像普通 state 一样查看和编辑这些 state。
- 如果输出是下游 LLM 节点需要阅读的正文材料，应绑定为 `file`；它的值可以是单个本地路径，也可以是本地路径数组。
- `file` 进入 LLM prompt 时只包含文件名和原文全文；本地路径、来源网址、抓取时间、provider 和运行元数据不进入模型上下文。
- `image` / `audio` / `video` 也使用本地路径或路径数组，但进入 LLM 节点时应作为多模态附件处理，不作为文本文件读取。

示例：

```json
{
  "name": "web_search_source_urls",
  "type": "json",
  "binding": {
    "kind": "skill_output",
    "skillKey": "web_search",
    "outputKey": "source_urls"
  }
}
```

`web_search` 的推荐绑定：

```json
[
  {
    "name": "web_search_query",
    "type": "text",
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "query"
    }
  },
  {
    "name": "web_search_source_urls",
    "type": "json",
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "source_urls"
    }
  },
  {
    "name": "web_search_artifact_paths",
    "type": "file",
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "artifact_paths"
    }
  },
  {
    "name": "web_search_errors",
    "type": "json",
    "binding": {
      "kind": "skill_output",
      "skillKey": "web_search",
      "outputKey": "errors"
    }
  }
]
```

## 动态结果包 State

动态执行节点的输入来自上游 `capability` state。这意味着上游只决定“用哪个能力”，执行节点负责为该能力生成一次调用输入并运行它。

固定规则：

- 动态执行节点不能同时有静态 `config.skillKey`。
- 动态执行节点不能依赖 `skillBindings.outputMapping`，也不能从写入端口推断普通技能输出映射。
- 动态执行节点必须只写一个 `result_package` state。
- `result_package.outputs` 的对象键就是能力输出字段 key。每个值包含 `name`、`description`、`type`、`value`；不要额外增加 `fieldKey`。
- 下游节点读取 `result_package` 时，prompt 组装器会把 `outputs` 拆成虚拟 state。`type=file` 的值继续走本地 artifact 展开逻辑，所以联网搜索下载的原文可以和静态绑定时一样进入上下文。

这种封包/拆包方式让动态能力和静态绑定在下游拥有同一套阅读逻辑：差别只在于动态结果缺少静态 state key，但不缺少输出名称、描述、类型和值。

## `buddy_home_context_reader`

`buddy_home_context_reader` 是伙伴主循环的只读上下文装配 Skill。它读取 `backend/data/buddy/` 中的 profile、policy、memories 和 session summary，并输出一个克制的 `context_pack`。

契约：

- 输入：无。
- 输出：`context_pack` 一个 JSON 字段。
- 权限：`file_read`。
- 动态选择：`capabilityPolicy.default.selectable=false`，不进入 `graphiteui_capability_selector` 候选清单。
- 边界：不写 Buddy Home，不修改 revision，不记录 command，不提升权限。

该 Skill 应由 `buddy_context_pack` 子图显式绑定。后续 Buddy Home 写回应由单独的写入 Skill 完成，不能扩展这个只读 Skill。

## `graphiteui_capability_selector`

`graphiteui_capability_selector` 是当前的能力选择 Skill。它负责“校验并规范化模型从本地候选能力清单中选出的能力”，不负责“执行”。

它应该：

- 通过 `before_llm.py` 在 LLM 节点的技能入参规划提示词中列出本地启用模板，以及启用且对当前 `origin` 可选择的 Skill。
- 每个候选项必须提供 `kind`、`key`、名称和简短适用场景说明，让模型基于语义选择。
- 模型负责根据用户需求选择一个 `capability` 入参；选择原则是优先图模板，其次 Skill，没有合适能力则选 `{ "kind": "none" }`。
- `after_llm.py` 只校验模型选择是否仍在本地可用清单中，并规范化名称和描述。
- 只输出一个 `capability` state 值；没有合适能力时输出 `{ "kind": "none" }`。

它不应该：

- 直接调用被选中的 skill。
- 生成被选 skill 的具体运行入参。
- 用程序字段匹配、关键词相似度或硬编码规则代替模型判断。
- 安装或启用 skill。
- 修改图、文件、记忆或人设。

## 用户 Skill 生成能力

旧 `graphiteUI_skill_builder` 曾被删除，因为它把生成、写入、校验、测试、修复、revision 和回滚混在一个 Skill 中，偏离了新的职责边界。

当前新的 `graphiteUI_skill_builder` 已按窄职责重建：读取用户需求和已确认的设计信息，只产出一个 Skill 包必要的身份和文件内容。随着生命周期入口收束，新的 Skill 包优先围绕固定入口组织：

- `skill_key`
- `skill.json`
- `SKILL.md`
- `before_llm.py`，仅在需要给 LLM 补充上下文时生成
- `after_llm.py`，仅在需要确定性执行、校验或规范化时生成
- `requirements.txt`，仅在需要第三方 Python 依赖时生成

它不应该：

- 直接写入 `backend/data/skills/user/<skill_key>/`。
- 直接运行 smoke test、修复文件或回滚 revision。
- 检查或修改官方 `skill/<skill_key>/`。
- 代替图模板中的用户确认、示例确认、设计确认和权限确认。

写入、测试、错误修复和最终安装应由后续图节点通过明确的受控能力完成，而不是重新塞回这个生成 Skill。仍待补齐的是围绕该 Skill 的完整图流程，而不是把职责重新扩大到单个 Skill 内部。

## Function Call 的位置

当前 GraphiteUI 不依赖 OpenAI 语义上的 function call / tool calls 作为主干。

当前主干是：

- 图节点声明 skill。
- runtime 合并有效 skill。
- LLM 节点根据 skill 有效 `llmInstruction` 和 `inputSchema` 生成入参。
- runtime 调用 skill。
- skill 输出进入 state 和 run detail。
- 后续节点根据结构化结果继续运行。

function call 未来可以作为某些模型的适配层，但不能绕过 GraphiteUI 的 skill registry、权限检查、审批路径和审计记录。不支持 function call 的本地模型也必须能通过结构化 JSON 输出参与同一套图循环。

## 新版伙伴自主循环模板

当前仓库尚未创建或注册 `buddy_autonomous_loop`。伙伴浮窗 UI 已经存在，并会尝试读取这个模板；在模板按新协议重建前，伙伴对话循环不能作为当前可用能力。下一轮工作的起点应是按完整目标创建并接入这个模板，而不是增强旧 `buddy_chat_loop`、恢复旧兼容入口，或先做一套之后还需要迁移的临时简化版。

`buddy_autonomous_loop` 的目标不是复刻 Claude Code 或 Hermes Agent 代码里的多工具循环，而是把它们已经验证有效的循环能力翻译为 GraphiteUI 的图协议：

- Claude Code 的可取之处是清晰的“模型判断 -> 工具执行 -> 工具结果进入下一轮 -> 再判断”循环、工具结果预算、stop hook、上下文压缩、只读工具并发和动态工具刷新。
- Hermes Agent 的可取之处是迭代预算、provider fallback、无效工具名修复、无效 JSON 自我纠错、危险操作审批、tool guardrail、会话持久化和结束原因诊断。
- GraphiteUI 不应把这些能力做成隐藏在伙伴代码里的第二套 agent loop。图负责循环，LLM 节点只做一次模型运行、一次结构化判断或一次能力调用准备。
- 每轮能力调用仍保持单能力语义：选择一个 `capability`，执行一个 skill 或 subgraph，得到一个 `result_package`，再由后续节点评估是否继续。
- 顶层模板应优先用子图表达稳定能力段，例如上下文装配、需求理解、能力循环、最终回复和自我复盘。这样顶层图保留可读主干，细节仍可双击进入子图审查和编辑。

完整目标流程：

```text
用户消息、页面上下文、历史、Buddy Home
  -> buddy_context_pack
  -> buddy_request_intake
  -> buddy_capability_cycle
  -> buddy_final_response
  -> buddy_self_review
  -> output 只展示最终回复
```

目标模板应包含的公开输入 state：

- `user_message`：当前用户消息。
- `conversation_history`：进入上下文的近期对话。
- `page_context`：当前页面或编辑器上下文。
- `buddy_profile`：来自 Buddy Home 的伙伴名称、语气、响应风格和人设资料。
- `buddy_policy`：来自 Buddy Home 的边界、偏好和审批策略，只作为上下文与决策依据，不能提升运行权限。
- `buddy_memory_context`：从 Buddy Home 召回的长期记忆摘要。
- `buddy_session_summary`：Buddy Home 中的当前会话摘要。

目标模板应包含的核心内部 state：

- `request_understanding`：需求理解、任务类型、是否需要能力、是否需要澄清、风险等级和原因。
- `clarification_prompt`：需要向用户补充询问的问题。
- `clarification_answer`：用户在断点恢复时写入的澄清回答。
- `selected_capability`：`capability` 类型，来自 `graphiteui_capability_selector`。
- `capability_found`：是否找到了启用且可选择的能力。
- `capability_approval_request`：能力执行前需要用户确认的摘要。
- `capability_approval_decision`：用户审批结果。
- `capability_result`：`result_package` 类型，动态能力执行唯一输出。
- `capability_review`：对结果包的评估，包括是否足够、是否继续、失败是否可恢复、下一轮需求。
- `loop_state`：循环轮次、退出原因和已用能力摘要。
- `memory_update_plan`：是否需要写回记忆、会话摘要或用户资料。
- `buddy_evolution_plan`：是否需要写入自我复盘、能力使用统计、改进建议或待审查队列。
- `final_reply`：唯一用户可见最终回复。

推荐节点职责：

- `understand_request`：读取用户消息、历史、页面上下文、伙伴资料、策略、记忆和会话摘要，写 `request_understanding`。它不执行能力。
- `need_clarification`：condition。需要澄清时进入 `ask_clarification`，否则进入能力选择。
- `ask_clarification`：写 `clarification_prompt` 并设置 `interrupt_after`。伙伴页面应把用户下一条输入作为 `clarification_answer` 恢复运行，而不是开启新一轮。
- `merge_clarification`：把澄清回答合入 `request_understanding` 或写新的确认需求摘要。
- `select_capability`：静态绑定 `graphiteui_capability_selector`，根据需求选择一个启用的图模板或 Skill。图模板优先，找不到则输出 `{ "kind": "none" }` 和 `capability_found=false`。
- `capability_found`：condition。未找到能力时进入直接回复或缺失能力说明；找到能力时进入审批检查。
- `review_capability_permission`：根据 `selected_capability`、`buddy_policy`、skill/template 的 capability policy 与 permissions 写审批请求或免审批结论。prompt 不能直接授予权限，只能生成审查说明。
- `request_capability_approval`：需要人工确认时写 `capability_approval_request` 并设置 `interrupt_after`。恢复 payload 写入 `capability_approval_decision`。
- `execute_capability`：读取 `selected_capability`。该节点只负责生成目标能力的公开输入；runtime 执行 skill 或动态 subgraph，并只写一个 `capability_result`。
- `review_capability_result`：读取拆包后的 `capability_result`，判断是否已经足够、是否需要继续另一个能力、是否需要向用户解释失败或请求更多信息。
- `continue_capability_loop`：condition。需要继续时回到 `select_capability`，达到 `loopLimit` 时进入最终回复。循环上限是正式行为，不是错误；达到上限时必须用已有信息收束。
- `draft_final_reply`：只生成 `final_reply`，不再执行能力或写长期状态。
- `decide_memory_update`：判断是否需要写回伙伴记忆、资料或会话摘要。这个判断必须显式可见。
- `review_memory_update`：需要写入长期数据时设置断点，展示拟写入内容和理由。
- `write_memory_update`：通过受控 Skill 或后续正式命令流执行写回。不能由 output 节点或伙伴前端直接静默写。
- `review_buddy_evolution`：作为 `buddy_self_review` 子图的一部分，判断是否需要记录能力使用统计、失败模式、模板选择偏好或未来改进建议。它不应静默修改官方模板或官方 Skill。
- `output_final`：只展示 `final_reply`，不连接中间能力结果、审查 JSON 或内部草稿。

退出条件：

- 已能回答，进入 `draft_final_reply`。
- 用户拒绝澄清、拒绝授权或取消本轮运行。
- `capability_found=false` 且当前需求可以直接解释或建议下一步。
- 工具或子图失败，且 `review_capability_result` 判断不可恢复。
- 达到 `continue_capability_loop.loopLimit`，用已有信息收束并说明限制。
- 风险超过当前策略或权限边界，生成拒绝或降级回复。

## 伙伴页面断点交互

伙伴页面和伙伴浮窗不应发明第二套断点协议。标准状态仍是 graph run 的 `awaiting_human`，恢复仍走 `/api/runs/{run_id}/resume`，展示模型应复用编辑器 Human Review 的 state 分组、必填校验、子图 scope path 和 resume payload 构造逻辑。

伙伴浮窗运行到 `awaiting_human` 时：

- 不能把本轮当作完成，也不能继续消费后续队列消息。
- 当前 assistant 消息应变成“等待你确认/补充”的暂停卡片，而不是普通最终回复。
- 输入框默认切换为“回复当前断点”。用户输入会作为 resume payload 写入断点所需 state。
- 如果用户确实要开始新问题，必须有明确操作，例如“取消本次运行并作为新问题发送”，避免把新问题误塞进旧断点。
- 面板应显示暂停节点名称、暂停原因、需要补充的字段、当前产生的内容和相关上下文。
- 对权限、写文件、执行脚本、联网、图编辑、记忆写入等操作，卡片必须展示能力名称、权限类型、拟执行摘要、影响路径或目标对象，并提供继续、拒绝和查看详情。
- 对澄清类断点，卡片展示问题和可编辑回答；恢复后图继续运行，而不是让伙伴前端自己总结。
- 对子图内部断点，卡片显示路径，例如 `伙伴主循环 / 创建自定义 Skill / review_generated_skill`，并展示内部节点需要的 state。

伙伴页面应增加“运行与确认”视图：

- 展示当前 `origin=buddy` 且状态为 `awaiting_human`、`running`、`failed` 的最近 run。
- 允许恢复暂停 run、拒绝或取消当前 run、打开完整运行详情。
- 页面刷新后可以找回未处理的暂停 run。
- 断点详情使用与编辑器 Human Review 一致的数据模型，但布局应更适合聊天场景：默认只展示必填与当前节点产物，其他 state 折叠。

动态子图断点是完整伙伴循环的前置要求。静态 Subgraph 节点已经有 `pending_subgraph_breakpoint` 暂停/恢复路径；动态 `capability.kind=subgraph` 也必须具备同等语义：

- 动态子图内部遇到 `interrupt_after` 时，父级 Buddy run 必须进入 `awaiting_human`。
- 父 run 元数据必须记录子图节点、内部节点、scope path、内部 state、内部 node executions 和 checkpoint metadata。
- 恢复时仍通过父 run 的 resume API，把 resume payload 转交给内部子图 checkpoint。
- 动态子图完成后，仍按现有 `result_package.outputs.<outputKey> = { name, description, type, value }` 封包，不额外添加 `fieldKey`。

## 完整实现顺序

实现顺序应按依赖推进，避免先做简化版后迁移：

1. 将伙伴运行来源收束为统一 `origin=buddy`，停止扩展 `buddy_run`、`buddy_permission_tier`、`buddy_graph_patch_drafts_enabled` 等旧标记。
2. 补齐动态 `capability.kind=subgraph` 的断点传播、父级暂停和恢复。
3. 补齐动态能力审批路径：需要确认的能力必须进入标准 `awaiting_human`，不能只靠 prompt 文字提醒。
4. 将 `backend/data/buddy/` 收束为正式 Buddy Home，补齐 evolution、usage、reports 等资料结构和 revision/command 审计路径。
5. 创建官方 `buddy_autonomous_loop` 模板，按本文完整节点职责和 state 契约搭建，并把上下文装配、需求理解、能力循环、最终回复和自我复盘整理为子图。
6. 改造伙伴浮窗，使它能展示暂停卡片、恢复断点、拒绝或取消运行，并在暂停期间阻塞队列。
7. 改造伙伴页面，增加“运行与确认”和 Buddy Home 管理视图，复用 Human Review 与 revision 数据模型。
8. 将记忆、资料、会话摘要、进化记录和能力使用统计写回做成模板中的显式分支和受控能力，移除隐藏产品逻辑。
9. 完善审计展示：记录每次能力选择、选择原因、审批状态、执行结果包、循环继续原因、退出原因、Buddy Home 写入和自我复盘结论。
10. 补充测试覆盖：模板校验、动态子图断点、伙伴暂停恢复、权限拒绝、循环上限、刷新后恢复、Buddy Home 写回和 output 只展示最终回复。

## 非目标

当前不做：

- 让 prompt 直接决定权限。
- 让 function call 绕过 GraphiteUI skill registry。
- 让伙伴静默安装、启用或运行新 skill。
- 让伙伴直接改 DOM 或模拟用户点击。
- 建立第二套独立于 GraphiteUI skill 系统的插件系统。
- 把临时日志、原始报错、大媒体、base64、下载全文或可从当前图重新读取的信息写入长期记忆。
- 把官方图模板、官方 Skill 或用户自定义 Skill 本体复制进 Buddy Home。

## 文档维护规则

- 本文是伙伴自主 Agent 方向的唯一长期参考。
- 当前状态快照写入 `docs/current_project_status.md`。
- 阶段性计划完成后，不保留独立计划文档；把仍然有效的结论折回本文。
- 被本文覆盖的旧路线文档应删除。
