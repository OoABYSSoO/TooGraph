# Current Project Status

本文是 GraphiteUI 当前项目状态的正式快照。它只记录当前仍然成立的能力、约束和近期方向；已经删除、废弃或需要重新手工搭建的旧模板与旧技能不再作为当前能力描述。

## 结论

- Vue + Element Plus 前端主链已经落地，首页、编辑器、运行记录、设置、技能管理和桌宠浮窗都在当前产品中。
- `node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一正式数据来源。
- 桌宠不是独立运行时。桌宠本质也是按图模板发起一次 graph run，并通过运行来源、状态和技能目录表达上下文。
- 旧的 `companion_agentic_tool_loop`、`companion_chat_loop`、`web_research_loop` 等模板不再随仓库提供，也不再通过后端兼容逻辑修补。
- 当前仓库提供一个新的内置图模板：`advanced_web_research_loop`（高级联网搜索）。它是通用研究模板，不是桌宠专用自主循环模板。
- 技能系统已收束为统一技能库，不再区分“桌宠技能”和“Agent 节点技能”，也不再使用 `targets` / `executionTargets` 这类旧分流字段。
- 当前只保留一个内置技能包：`web_search`。其余旧技能包已经删除，后续需要按新结构逐个专门编写。

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

- 位置：`backend/app/templates/advanced_web_research_loop.json`
- 显示名称：`高级联网搜索`
- 作用：围绕 `web_search` 搭建多轮联网研究流程，适合“总结最新新闻、版本内容、公开资料依据”等需要先搜索再整理的任务。
- 主要流程：输入问题 -> 制定研究计划与首轮搜索词 -> 运行 `web_search` -> 阅读本地原文并评估证据 -> 需要补搜时由 condition 分支直接回到搜索节点 -> 证据足够或达到上限后筛选依据 -> 生成 `final_reply`。
- 循环语义：补搜回边是 `should_continue_search` condition 的原生分支，`loopLimit=4`，并提供 `exhausted` 分支在达到上限时用已有资料收束，而不是撞 LangGraph 递归限制。
- 技能语义：搜索节点绑定 `web_search`，技能输入仍由该 Agent 节点运行时 LLM 生成；模板不使用 `inputMapping` 或静态技能参数。
- 输出语义：`query`、`source_urls`、`artifact_paths`、`errors` 通过 managed binding state 透传；后续 Agent 读取 `artifact_paths` 对应的本地原文，负责证据筛选和最终总结。
- 模型语义：模板默认使用全局模型配置，不写死某个 provider。若全局本地网关未启动，运行该模板前需要在 Model Providers 页面选择可用模型，或在图中为 Agent 节点设置 override。

## 当前前端能力

- 编辑器支持 `input / agent / condition / output` 四类核心节点。
- Agent 节点支持模型选择、thinking、temperature、输入输出绑定、skill 添加和技能说明胶囊编辑。
- condition 节点作为条件边的可视化代理，运行时原生支持 `condition -> condition` 的多级路由。
- output 节点负责展示、预览、导出或链接图运行产物，不拥有隐藏持久化策略。
- Skills 页面围绕统一 skill catalog 展示、导入、启用、禁用和删除技能。
- 桌宠浮窗支持模型选择和对话入口，但当前不再假设仓库内置默认桌宠模板；需要用新协议重建桌宠自主循环模板后再接入完整自主循环。

## 当前后端能力

- FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- validator 负责 `node_system` graph 结构校验。必填技能输入不再做静态绑定校验，而是在 Agent LLM 生成技能输入后由运行时检查。
- LangGraph runtime 是当前运行主链。
- 后端不再在 graph run 入口修补旧模板结构；提交什么图，就按当前协议校验和执行什么图。
- graph run、run detail、SSE 事件、状态快照和 artifact 输出仍是审计与回放的基础。

## 当前仍在路线图中

- 用新结构手工重建桌宠自主循环模板。
- 设计并实现真正的 `autonomous_decision` 技能，用于根据技能目录、用户意图和运行策略选择技能，但不直接执行技能。
- 设计并实现 `graphite_skill_builder`，用于在用户确认后生成符合 GraphiteUI 项目结构的 skill 草案。
- 完成更完整的图运行展示。
- 完成桌宠审批恢复 UI、图补丁预览、GraphCommandBus、revision、undo 和审计闭环。
- 将人设、记忆、会话摘要等长期状态更新表达为可审计的图模板流程，而不是隐藏产品逻辑。
