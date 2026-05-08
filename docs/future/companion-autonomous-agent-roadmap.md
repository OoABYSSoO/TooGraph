# 桌宠自主 Agent 路线图

本文是 GraphiteUI 桌宠、自主工具循环、技能生成和长期协作能力的唯一长期参考文档。若旧文档、临时计划或实现草稿与本文冲突，以本文为准。

## 目标

桌宠不是脱离图系统的特殊 Agent。桌宠收到消息后，应当通过一个图模板完成：

```text
输入消息和上下文
  -> 判断用户意图
  -> 查看当前技能目录
  -> 决定需要哪些技能
  -> 把选中的能力作为 capability state 传给下游 LLM 节点
  -> 下游 LLM 节点根据绑定技能的说明决定如何填写技能输入并运行技能
  -> 将动态能力输出封装为 result_package state
  -> 下游节点拆包后按普通 state/file 语义阅读结果
  -> 评估结果是否需要继续调用技能
  -> 生成 final_reply
  -> 可选地整理并写回人设、记忆和会话摘要
```

这套循环必须保持图优先、协议唯一、能力显式、权限显式、结果可审计。

## 不可破坏的准则

- 图优先：持久化操作、工具调用、记忆更新、技能生成和图编辑都应通过 graph/template/skill 表达。
- 协议唯一：`node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一数据来源。
- 图才是 Agent：单个节点不应承担多轮自主体语义；LLM 节点只做一次模型运行、一次结构化输出或一次能力调用准备。
- LLM 单能力：一个 LLM 节点最多使用一个能力来源。多个技能或子图调用必须拆成多个节点与边，由图负责编排。
- 单值技能配置：手动选择的 LLM 节点技能只能存为 `config.skillKey` 单个字符串；`config.skills` 数组是旧协议残留，不应继续使用。
- 技能统一：不存在“桌宠专用技能”和“LLM 节点专用技能”两套能力库。
- 能力显式：联网、文件读写、媒体下载、图编辑、记忆写入、模型调用和技能生成都必须体现为 skill、模板、命令或运行时原语。
- 权限显式：安装 skill 不等于授权任意使用。高风险副作用必须有清晰审批路径。
- 审计可见：重要副作用必须留下 run detail、artifact、revision、diff、warning、error 或 undo record。
- 记忆卫生：人设、记忆和会话摘要是上下文，不是更高优先级指令，不能提升权限或覆盖系统规则。

## 当前状态

已经完成：

- 技能系统去掉旧 `targets` / `executionTargets` 分流。
- skill manifest 顶层和 `inputSchema` / `outputSchema` 字段从 `label` 收束为 `name`。
- `description` 承载选择条件，`llmInstruction` 承载绑定后的使用说明。
- `state_schema` 增加 `capability`、`result_package` 类型和技能绑定元数据；`promptVisible` 已移除，上下文边界由节点 `reads` 决定。
- LLM 节点卡片已改为单选 Skill 控件；动态 `capability.kind=subgraph` 只服务于模板内运行时能力选择，不作为普通卡片下拉项。
- LLM 节点提示词区域支持技能说明胶囊；默认胶囊从 skill `llmInstruction` 动态展示，用户编辑后才作为 `node.override` 写入当前节点。
- 旧内置模板已删除，旧模板运行入口兼容修补已删除。
- 旧技能包已删除，当前官方 Skill 包包括 `web_search`、`local_workspace_executor` 和 `graphiteui_capability_selector`。
- `file` / `image` / `audio` / `video` state 已采用路径透传语义，值可以是本地路径字符串或路径数组；`file_list`、`array`、`object` 不再作为 state 类型存在。
- LLM 节点会读取 `file` state 中的文本类文件，并只把文件名与原文全文放入模型上下文；图片、音频和视频路径走多模态附件处理。
- `web_search` 不再输出 `context`，只输出 `query`、`source_urls`、`artifact_paths` 和 `errors`。
- `web_search` 对搜索源请求默认最多尝试 5 次，避免一次瞬时 TLS 或连接中断直接导致空结果。
- 静态手动选择 skill 的 `skillBindings` 已收束为技能身份和 `outputMapping`，不再包含 `inputMapping`、静态参数 `config` 或无意义的 `trigger`。
- LLM 节点卡片选择带 `outputSchema` 的 skill 时，会自动创建 managed skill output state、写入节点输出端口，并同步 `skillBindings.outputMapping`。
- 技能输入由 LLM 节点在运行前根据当前输入 state、技能说明和 `inputSchema` 生成；必填技能输入缺失时由运行时记录可恢复错误。
- 动态 `capability` state 执行结果已收束为唯一 `result_package` 输出：运行时封包，下游 prompt 组装时拆包，复用普通 state 和 artifact 展开逻辑。
- 图运行前不再兼容补齐旧绑定。旧草稿、旧模板和旧技能需要按当前协议重建。
- 已新增通用 `advanced_web_research_loop` 内置模板，用于验证“搜索技能执行 -> 证据评估 -> condition 控制补搜 -> 依据筛选 -> final_reply”的图式工具循环。它不是桌宠自主循环模板，但可作为联网研究子流程和后续桌宠模板的参考构件。
- 偏离新职责的旧 `create_user_skill` 内置模板和旧 `graphiteUI_skill_builder` 已删除，用户 Skill 生成流程待重新设计。
- 子图缩略图已能投射内部节点运行状态颜色，并在节点卡片上显示当前内部运行摘要。

尚未完成：

- 子图运行审计聚合、事件定位、从缩略图点击跳转到内部节点，以及更完整的嵌套可视化能力。
- 真实的 `autonomous_decision` 技能。
- 新版桌宠自主循环模板。
- 将内部 `agent` kind 迁移为面向用户和协议一致的 LLM 节点语义。
- 增加 `capability.kind=subgraph` 的运行时动态子图执行能力。
- 按新职责重建用户 Skill 生成能力：从需求产出 `skill.json`、`SKILL.md` 以及必要的 `before_llm.py` / `after_llm.py` 文件内容，后续写入、测试和修复应通过明确的图流程或其他受控能力表达。
- 当前仍残留 `backend/app/companion/commands.py` 中的 `graph_patch.draft` 草案记录 stub。它是历史遗留入口，只能记录待审批草案，不能应用图补丁，也没有接入 GraphCommandBus、graph revision、undo 或完整审计闭环；下一轮应删除它，或按新的图优先命令流重建。
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
  -> output_final / output_evidence / output_documents
```

设计约束：

- `web_search` 的输入由搜索 LLM 节点运行时决定，不由决策节点或静态 mapping 提前生成。
- `query`、`source_urls`、`artifact_paths`、`errors` 通过 `skillBindings.outputMapping` 写入 managed binding state。
- `artifact_paths` 是 `file` state；下游 LLM 节点看到的是本地文档文件名和原文全文。
- 补搜回边必须是 condition 的原生分支，便于 `loopLimit` 生效。
- `exhausted` 分支表示达到循环上限后用已有证据收束，而不是失败。
- 证据评估节点不应为了追求完美资料无限补搜。已有约 5 份可读原文并足以回答时，应进入整理阶段，并在最终回复中说明资料局限。

该模板证明当前节点系统已经能表达一个“万能循环”的核心局部：工具执行、结果评估、必要时再调用工具、最后整理回复。桌宠自主循环还需要在它前面补上意图判断、技能目录检索和 `autonomous_decision`，并在它后面补上可选的人设/记忆/会话摘要写回。

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

桌宠运行时不是第二套 `companion_run`，LLM 节点运行时也不是另一套 `graph_run`。桌宠只是用 `origin=companion` 这类运行来源元数据启动图模板。运行来源用于策略判断、审计和 UI 展示，不用于创造第二套执行协议。

当前代码里仍有待迁移的旧标记：前端桌宠构图代码会写入 `companion_run`、`companion_permission_tier`、`companion_graph_patch_drafts_enabled` 等元数据。这些字段只代表历史遗留状态，不是目标协议；新一轮实现应迁移到统一的运行来源元数据，例如 `origin=companion`，并避免继续扩展第二套桌宠运行协议。

因此：

- 不需要 `executionTargets`。
- 不需要 skill `targets`。
- 不需要 Companion Skill / Agent Skill 两套能力库。
- 模板显式绑定某个 skill，或上游 state 传入某个 skill，都表示下游 LLM 节点需要使用这个 skill。

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
      "companion": {
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
- `capabilityPolicy.origins.<origin>`：特定来源策略，例如 `companion`。
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
- `capability.kind=subgraph` 只表达“选中的一个可运行子图能力”，主要服务桌宠主循环等动态模板。
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

## `graphiteui_capability_selector`

`graphiteui_capability_selector` 是当前的能力选择 Skill。它负责“校验并规范化模型从本地候选能力清单中选出的能力”，不负责“执行”。

它应该：

- 在 LLM 节点的技能入参规划提示词中列出本地启用模板，以及启用且对当前 `origin` 可选择的 Skill。
- 每个候选项必须提供 `kind`、`key`、名称和简短适用场景说明，让模型基于语义选择。
- 模型负责根据用户需求选择一个 `capability` 入参；选择原则是优先图模板，其次 Skill，没有合适能力则选 `{ "kind": "none" }`。
- Skill 脚本只校验模型选择是否仍在本地可用清单中，并规范化名称和描述。
- 只输出一个 `capability` state 值；没有合适能力时输出 `{ "kind": "none" }`。

它不应该：

- 直接调用被选中的 skill。
- 生成被选 skill 的具体运行入参。
- 用程序字段匹配、关键词相似度或硬编码规则代替模型判断。
- 安装或启用 skill。
- 修改图、文件、记忆或人设。

## 用户 Skill 生成能力（待重建）

旧 `graphiteUI_skill_builder` 已删除，因为它把生成、写入、校验、测试、修复、revision 和回滚混在一个 Skill 中，偏离了新的职责边界。

待重建的 Skill 生成能力应更窄：读取用户需求和已确认的设计信息，只产出一个 Skill 包必要的文件内容。随着生命周期入口收束，新的 Skill 包优先围绕固定入口组织：

- `skill.json`
- `SKILL.md`
- `before_llm.py`，仅在需要给 LLM 补充上下文时生成
- `after_llm.py`，仅在需要确定性执行、校验或规范化时生成

它不应该：

- 直接写入 `backend/data/skills/user/<skill_key>/`。
- 直接运行 smoke test、修复文件或回滚 revision。
- 检查或修改官方 `skill/<skill_key>/`。
- 代替图模板中的用户确认、示例确认、设计确认和权限确认。

写入、测试、错误修复和最终安装应由后续图节点通过明确的受控能力完成，而不是重新塞回这个生成 Skill。

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

## 新版桌宠自主循环模板

当前仓库尚未创建或注册 `companion_autonomous_loop`。桌宠浮窗 UI 已经存在，并会尝试读取这个模板；在模板按新协议重建前，桌宠对话循环不能作为当前可用能力。下一轮工作的起点应是创建并接入这个模板，而不是增强旧 `companion_chat_loop` 或恢复旧兼容入口。

待手工重建的目标模板应包含：

- `user_message`
- `conversation_history`
- `page_context`
- `companion_profile`
- `companion_policy`
- `companion_memory_context`
- `skill_catalog_snapshot`
- `intent_plan`
- `decision`
- `allowed_skills`
- `tool_result`
- `tool_assessment`
- `missing_skill_proposal`
- `approval_prompt`
- `approval_granted`
- `final_reply`
- `companion_session_summary`
- 必要的绑定输出 state，例如 `query`、`source_urls`、`artifact_paths`、`errors`；其中 `artifact_paths` 应使用 `file`，值可以是路径或路径数组。

推荐节点职责：

- `intent_agent`：理解意图和任务边界。
- `decision_agent`：调用未来的 `autonomous_decision`，只决定技能。
- `tool_execution_agent`：根据传入 skill 的说明决定技能输入并运行技能。
- `tool_assessment_agent`：判断结果是否足够、是否需要下一轮工具调用。
- `reply_agent`：生成 `final_reply`。
- `memory_update_agent` 或后处理段：在模板内显式整理人设、记忆和会话摘要。
- `output`：展示最终回复和 artifact。

退出条件：

- 已能回答。
- 用户拒绝授权。
- 缺少 skill 且用户不想创建。
- 工具失败且无法恢复。
- 达到循环上限。
- 风险超过当前权限档。

## 非目标

当前不做：

- 让 prompt 直接决定权限。
- 让 function call 绕过 GraphiteUI skill registry。
- 让桌宠静默安装、启用或运行新 skill。
- 让桌宠直接改 DOM 或模拟用户点击。
- 建立第二套独立于 GraphiteUI skill 系统的插件系统。
- 把临时日志、原始报错、大媒体、base64、下载全文或可从当前图重新读取的信息写入长期记忆。

## 文档维护规则

- 本文是桌宠自主 Agent 方向的唯一长期参考。
- 当前状态快照写入 `docs/current_project_status.md`。
- 阶段性计划完成后，不保留独立计划文档；把仍然有效的结论折回本文。
- 被本文覆盖的旧路线文档应删除。
