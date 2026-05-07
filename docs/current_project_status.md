# Current Project Status

本文是 GraphiteUI 当前项目状态的正式快照。它只记录当前仍然成立的能力、约束和近期方向；已经删除、废弃或需要重新手工搭建的旧模板与旧技能不再作为当前能力描述。

## 结论

- Vue + Element Plus 前端主链已经落地，首页、编辑器、运行记录、设置、技能管理和桌宠浮窗都在当前产品中。
- `node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一正式数据来源。
- 桌宠不是独立运行时。桌宠本质也是按图模板发起一次 graph run，并通过运行来源、状态和技能目录表达上下文。
- 旧的 `companion_agentic_tool_loop`、`companion_chat_loop`、`web_research_loop` 等模板不再随仓库提供，也不再通过后端兼容逻辑修补。
- 新版桌宠自主循环模板 `companion_autonomous_loop` 尚未创建和注册。当前桌宠浮窗仍会尝试读取这个模板，因此桌宠对话入口的 UI 已存在，但完整对话循环还不能作为当前可用能力描述。
- 当前仓库提供一个新的内置图模板：`advanced_web_research_loop`（高级联网搜索）。它是通用研究模板，不是桌宠专用自主循环模板。
- 技能系统已收束为统一技能库，不再区分“桌宠技能”和“Agent 节点技能”，也不再使用 `targets` / `executionTargets` 这类旧分流字段。
- 当前只保留一个内置技能包：`web_search`。其余旧技能包已经删除，后续需要按新结构逐个专门编写。
- `subgraph` 已是正式节点类型：可从已保存整张图创建实例，运行时隔离内部 state，公开 input/output 映射为父图端口，并可双击打开当前实例的工作区页签。

## 当前协议

- skill manifest 顶层和 `inputSchema` / `outputSchema` 字段都使用 `name` 表示显示名称，不再使用 `label`。
- “什么时候选择这个技能”写进 `description`。
- “绑定到 Agent 后应该如何使用这个技能”写进 `agentInstruction`。
- Agent 节点卡片上手动添加的 skill，与通过 `skill` 类型 state 输入传入的 skill 按并集合并，一视同仁。
- 添加到 Agent 节点的 skill 会在节点提示词编辑区生成可编辑的技能说明胶囊；移除 skill 时对应胶囊会移除。
- 胶囊内容是节点级覆盖，不会反向写回技能包原始文档。
- `skillBindings` 只保存技能身份和 `outputMapping`。它不保存 `inputMapping`、静态参数 `config` 或无意义的 `trigger`。
- 技能输入由 Agent 节点的 LLM 在运行时根据当前输入 state、技能 `description`、`agentInstruction` 和 `inputSchema` 生成。上游 `skill` state 只传“选择了哪些技能”，不传具体技能参数。
- 在 Agent 节点卡片添加带 `outputSchema` 的 skill 时，前端会自动创建 managed skill output state、添加到该节点输出端口，并写入 `skillBindings.outputMapping`，让运行时能把技能结果透传给下游节点。
- 图运行前不再做旧草稿兼容补齐。提交到运行时的图必须已经符合当前协议。
- `state_schema` 支持 `promptVisible=false`。这类 state 可以参与图运行和技能输出透传，但不会进入 Agent 的模型提示词上下文。
- `state_schema` 支持 `binding` 元数据，用来标记某个 state 是否由技能输出自动绑定。
- `file` / `image` / `audio` / `video` 类型 state 的值是本地 artifact 路径或路径列表，不再有单独的 `file_list`、`array` 或 `object` state 类型。Agent 节点接收 `file` state 时，会读取文本类文件并只把“文件名 + 原文全文”拼入模型上下文；图片、音频和视频路径会走多模态附件处理，不作为文本读取。
- Input 节点输出文件、图片、音频或视频时都写入本地路径；Output 节点可通过 documents 预览展示这些 artifact。
- 目标运行来源语义是 `origin=companion`。当前前端桌宠构图代码仍残留 `companion_run`、`companion_permission_tier`、`companion_graph_patch_drafts_enabled` 等旧元数据；这些字段是待迁移标记，不应作为新一轮桌宠架构的设计依据。

## 当前技能

### `web_search`

- 位置：`skill/web_search/`
- 显示名称：`联网搜索`
- 作用：执行联网搜索、返回来源链接、本地原文文件路径和结构化错误信息。
- 桌宠来源默认可自主使用且无需确认，前提仍是它被图模板显式绑定或由图状态传入，并通过 registry、运行策略和运行时就绪检查。
- 它只负责搜索和资料获取，不负责最终总结。搜索词由绑定它的 Agent 节点根据任务决定；整理和总结应交给后续 Agent 节点。
- 搜索源请求默认最多尝试 5 次，用于缓解 DuckDuckGo fallback 或外部搜索 API 的瞬时 TLS、连接中断和网关抖动。

主要输出语义：

- `query`：本次实际用于搜索的查询词。
- `source_urls`：搜索到的网址列表。
- `artifact_paths`：成功保存到本地的来源原文文件路径，类型应绑定为 `file`，值可以是路径字符串或路径数组。
- `errors`：结构化错误列表。

## 当前内置图模板

### `advanced_web_research_loop`

- 位置：`backend/app/templates/official/advanced_web_research_loop.json`
- 显示名称：`高级联网搜索`
- 作用：围绕 `web_search` 搭建多轮联网研究流程，适合“总结最新新闻、版本内容、公开资料依据”等需要先搜索再整理的任务。
- 主要流程：输入问题 -> 制定研究计划与首轮搜索词 -> 运行 `web_search` -> 阅读本地原文并评估证据 -> 需要补搜时由 condition 分支直接回到搜索节点 -> 证据足够或达到上限后筛选依据 -> 生成 `final_reply`。
- 循环语义：补搜回边是 `should_continue_search` condition 的原生分支。condition 节点协议固定为 `true / false / exhausted` 三个分支，`loopLimit` 默认 5 且可在节点上设置，达到上限时走 `exhausted` 分支并用已有资料收束，而不是撞 LangGraph 递归限制。
- 技能语义：搜索节点绑定 `web_search`，技能输入仍由该 Agent 节点运行时 LLM 生成；模板不使用 `inputMapping` 或静态技能参数。
- 输出语义：`query`、`source_urls`、`artifact_paths`、`errors` 通过 managed binding state 透传；后续 Agent 读取 `artifact_paths` 对应的本地原文，负责证据筛选和最终总结。
- 模型语义：模板默认使用全局模型配置，不写死某个 provider。Agent 节点和桌宠模型下拉的第一项是“全局（实时读取当前全局设定的模型）”，后面才是具体模型 override。若全局本地网关未启动，运行该模板前需要在 Model Providers 页面选择可用模型，或在图中为 Agent 节点设置 override。

## 当前前端能力

- 编辑器支持 `input / agent / condition / output / subgraph` 五类核心节点。
- Agent 节点支持模型选择、thinking、temperature、输入输出绑定、skill 添加和技能说明胶囊编辑。
- condition 节点作为条件边的可视化代理，只允许编辑条件表达式、最大循环次数、节点名称和节点介绍；分支协议固定为 `true / false / exhausted`，JSON 载荷也不能定义其他分支形状。运行时原生支持 `condition -> condition` 的多级路由。
- subgraph 节点把一个 graph 模板复制为当前父图内的独立实例。模板分为 Git 管理的官方模板和 `backend/data/templates/user/` 下的用户自定义模板；前端“保存为模板”只会创建用户自定义模板。节点卡片先展示公开输入/输出胶囊，再展示紧凑的内部 DAG 缩略图、内部能力摘要和子图内部运行状态；DAG 缩略图按行优先顺序展示实际内部执行/判断节点，隐藏 `input` / `output` 边界节点，宽度未知时默认三列，并会根据节点卡片当前宽度在 `1` 到可见节点总数之间自适应列数。缩略图会展示普通连线和条件分支连线，连线路径复用主图 sequence-flow 回流线逻辑并使用缩略图尺寸参数；只有目标节点明确落到下一行时才走下方换行路径，轻微纵向偏移仍保持回流路径。节点位置和连线路径来自同一个响应式布局计算，不再照搬大画布坐标导致横向裁切或因卡片尺寸变化造成连线错位。运行时会把子图内部节点状态投射到缩略图颜色、闪烁高亮与当前节点提示上；主图和缩略图的已完成节点都使用绿色包框。双击节点会打开当前实例的工作区页签，页签内复用正式画布编辑器。子图页签的保存会回写父图中该节点的 `config.graph`，并按内部 `input` / `output` 边界重新同步父图公开 state 端口；也可以另存为普通图。画布左上工具区会显示来源胶囊，例如“来自：Untitled Graph / 节点：高级联网搜索 Subgraph”。
- output 节点负责展示、预览、导出或链接图运行产物，不拥有隐藏持久化策略；Markdown 预览支持安全渲染标题、列表、引用、分割线、表格、链接、inline code 和带语言标签的代码围栏，并保留代码块缩进与横向滚动。
- Skills 页面围绕统一 skill catalog 展示、导入、启用、禁用和删除技能。
- 桌宠浮窗支持模型选择和对话入口，但当前没有可运行的内置桌宠自主循环模板；需要先用新协议创建并注册 `companion_autonomous_loop`，再接入完整自主循环。

## 当前后端能力

- FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- validator 负责 `node_system` graph 结构校验。必填技能输入不再做静态绑定校验，而是在 Agent LLM 生成技能输入后由运行时检查。
- LangGraph runtime 是当前运行主链。
- 后端不再在 graph run 入口修补旧模板结构；提交什么图，就按当前协议校验和执行什么图。
- graph run、run detail、SSE 事件、状态快照和 artifact 输出仍是审计与回放的基础。
- `backend/app/companion/commands.py` 仍保留 `graph_patch.draft` 草案记录 stub。这是历史遗留入口，只记录待审批草案，不能应用图补丁，也没有接入 GraphCommandBus、图 revision、undo 或完整审计闭环。

## 当前仍在路线图中

- 继续收束 `subgraph` 子图体验：补齐父子图运行详情页的审计聚合、事件定位和从缩略图点击跳转到内部节点。
- 用新结构手工重建桌宠自主循环模板。
- 设计并实现真正的 `autonomous_decision` 技能，用于根据技能目录、用户意图和运行策略选择技能，但不直接执行技能。
- 设计并实现 `graphite_skill_builder`，用于在用户确认后生成符合 GraphiteUI 项目结构的 skill 草案。
- 完成更完整的图运行展示。
- 清理或按新命令流重建历史 `graph_patch.draft` stub，并完成图补丁预览、GraphCommandBus、graph revision、undo 和审计闭环。
- 将人设、记忆、会话摘要等长期状态更新表达为可审计的图模板流程，而不是隐藏产品逻辑。
