# Current Project Status

本文是 GraphiteUI 当前项目状态的正式快照。它只记录当前仍然成立的能力、约束和近期方向；已经删除、废弃或需要重新手工搭建的旧模板与旧技能不再作为当前能力描述。

## 结论

- Vue + Element Plus 前端主链已经落地，首页、编辑器、运行记录、设置、技能管理和桌宠浮窗都在当前产品中。
- `node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一正式数据来源。
- 桌宠不是独立运行时。桌宠本质也是按图模板发起一次 graph run，并通过运行来源、状态和技能目录表达上下文。
- 产品心智已收束为“图才是 Agent，单个节点是 LLM 节点”。当前协议中仍存在 `agent` kind 命名，这是待迁移的内部命名；新设计不应继续把单节点描述为多轮 Agent。
- 旧的 `companion_agentic_tool_loop`、`companion_chat_loop`、`web_research_loop` 等模板不再随仓库提供，也不再通过后端兼容逻辑修补。
- 新版桌宠自主循环模板 `companion_autonomous_loop` 尚未创建和注册。当前桌宠浮窗仍会尝试读取这个模板，因此桌宠对话入口的 UI 已存在，但完整对话循环还不能作为当前可用能力描述。
- 当前仓库提供两个官方图模板：`advanced_web_research_loop`（高级联网搜索）和 `graphiteui_skill_creation_workflow`（创建自定义 Skill）。它们都是通用模板，不是桌宠专用自主循环模板。
- 技能系统已收束为统一技能库，不再区分“桌宠技能”和“LLM 节点技能”，也不再使用 `targets` / `executionTargets` 这类旧分流字段。
- 当前官方技能包包括 `web_search`、`graphiteui_capability_selector`、`graphiteUI_skill_builder`、`graphiteUI_script_tester` 和 `local_workspace_executor`。后续新能力应按当前统一 Skill 结构专门编写。
- `subgraph` 已是正式节点类型：可从官方或用户自定义 graph 模板创建实例，运行时隔离内部 state，公开 input/output 映射为父图端口，并可双击打开当前实例的工作区页签；主图节点、子图缩略图和右下角画布缩略图共享克制的节点类型强调色。

## 当前协议

- skill manifest 顶层和 `inputSchema` / `outputSchema` 字段都使用 `name` 表示显示名称，不再使用 `label`。
- “什么时候选择这个技能”写进 `description`。
- “绑定到 LLM 节点后应该如何生成调用输入”写进 `llmInstruction`。
- 一个 LLM 节点最多使用一个显式能力来源：无能力、一个手动选择的 Skill，或一个输入 `capability` state。`capability` 是单个互斥对象，`kind` 可为 `skill`、`subgraph` 或 `none`，不能是列表。多个能力调用必须拆成多个节点和边。
- 手动复用图仍通过 Subgraph 节点完成；`capability.kind=subgraph` 主要用于桌宠主循环等模板在运行时动态选择可运行子图能力，不作为普通 LLM 节点卡片下拉项。
- LLM 节点卡片上的 Skill 选择是单选控件；它使用蓝色视觉强调，以区别模型、思考强度和断点等普通运行控件。
- 手动选择的 LLM 节点 Skill 在协议里存为单值 `config.skillKey`。不要使用 `config.skills` 数组；数组会暗示单节点多技能语义，属于旧协议残留。
- 添加到 LLM 节点的 skill 会在节点提示词编辑区显示可编辑的技能说明胶囊；默认胶囊由 skill `llmInstruction` 动态展示，不写入图 JSON。
- 用户编辑胶囊后才会把该节点的覆盖说明写入 `skillInstructionBlocks`，并标记为 `node.override`；移除 skill 时对应覆盖会移除，且不会反向写回技能包原始文档。
- 静态手动选择的 Skill 使用 `config.skillKey` 和协议拥有的 `skillBindings.outputMapping`。`outputMapping` 由图协议、前端和运行时维护，只用于确定 skill 输出写入哪个 state 与运行审计；LLM 不看也不修改它。
- 技能输入由 LLM 节点在运行前根据当前输入 state、技能 `description`、有效 `llmInstruction` 和 `inputSchema` 生成。有效 `llmInstruction` 默认来自 skill manifest；如果当前节点存在 `node.override` 胶囊覆盖，则使用覆盖内容。这个说明只进入技能入参生成阶段的 system prompt，不会再追加到 user prompt。
- Skill 生命周期脚本使用固定文件名而不是在 manifest 中配置入口。存在 `before_llm.py` 时，运行时会在技能入参规划前执行它，并把返回的上下文注入 LLM 提示词；存在 `after_llm.py` 时，运行时会在 LLM 生成结构化技能参数后执行它，并把它返回的 JSON 当作技能结果。写入 state 仍由 GraphiteUI runtime 根据 `outputSchema` 和 `skillBindings.outputMapping` 完成，脚本不直接绑定 state。
- 在 LLM 节点卡片选择带 `outputSchema` 的静态 skill 时，前端会自动创建 managed skill output state、添加到该节点输出端口，并写入 `skillBindings.outputMapping`，让运行时能把技能结果透传给下游节点。
- 动态能力执行来自输入 `capability` state，不复用 `skillBindings.outputMapping`，也不会推断普通输出映射。这类节点必须只写一个 `result_package` state。包内 `outputs.<outputKey>` 保存 `{ name, description, type, value }`，不额外捏造 `fieldKey`；下游 LLM 节点会把这些虚拟输出拆开并复用普通 state/file 展开逻辑。
- 当 `capability.kind=subgraph` 进入 LLM 节点时，该节点只负责根据当前 state 和目标模板公开输入 schema 生成子图输入；运行时负责执行对应图模板，并把公开 output 边界封装为同一套 `result_package`。这条路径不经过静态 Subgraph 节点端口 mapping，也不让 LLM 二次总结子图结果。
- 图运行前不再做旧草稿兼容补齐。提交到运行时的图必须已经符合当前协议。
- `promptVisible` 已移除。上下文边界由节点 `reads` 决定：LLM 节点只接收自己显式读取的 state。
- `state_schema` 支持 `binding` 元数据，用来标记某个 state 是否由技能输出自动绑定。
- `file` / `image` / `audio` / `video` 类型 state 的值是本地 artifact 路径或路径列表，不再有单独的 `file_list`、`array` 或 `object` state 类型。LLM 节点接收 `file` state 时，会读取文本类文件并只把“文件名 + 原文全文”拼入模型上下文；图片、音频和视频路径会走多模态附件处理，不作为文本读取。
- Input 节点输出文件、图片、音频或视频时都写入本地路径；Output 节点可通过 documents 预览展示这些 artifact。
- 目标运行来源语义是 `origin=companion`。当前前端桌宠构图代码仍残留 `companion_run`、`companion_permission_tier`、`companion_graph_patch_drafts_enabled` 等旧元数据；这些字段是待迁移标记，不应作为新一轮桌宠架构的设计依据。

## 当前技能

官方 Skill 位于 `skill/<skill_key>/`，会进入 Git 管理；用户自定义 Skill 位于 `backend/data/skills/user/<skill_key>/`，属于本地用户数据，不进入 Git 管理。Skill catalog 会同时返回官方和用户 Skill，并通过 `sourceScope` / `canManage` 区分来源与可管理性。Python Skill 只要依赖标准库以外的包，就应该在包内提供 `requirements.txt`；运行时会先检查当前 Python，缺依赖时在 `backend/data/skills/envs/` 下优先用 `uv` 创建或复用托管虚拟环境。

### `web_search`

- 位置：`skill/web_search/`
- 显示名称：`联网搜索`
- 作用：执行联网搜索、返回来源链接、本地原文文件路径和结构化错误信息。
- 生命周期：`before_llm.py` 只补充当前日期；`after_llm.py` 接收 LLM 生成的 `query`，执行搜索和原文下载。旧的程序侧“识别时效查询并自动给 query 拼日期”逻辑已移除，是否把日期写入 query 由 LLM 根据上下文判断。
- 桌宠来源默认可自主使用且无需确认，前提仍是它被图模板显式绑定或由图状态传入，并通过 registry、运行策略和运行时就绪检查。
- 它只负责搜索和资料获取，不负责最终总结。搜索词由绑定它的 LLM 节点根据任务决定；整理和总结应交给后续 LLM 节点。
- 搜索源请求默认最多尝试 5 次，用于缓解 DuckDuckGo fallback 或外部搜索 API 的瞬时 TLS、连接中断和网关抖动。

主要输出语义：

- `query`：本次实际用于搜索的查询词。
- `source_urls`：搜索到的网址列表。
- `artifact_paths`：成功保存到本地的来源原文文件路径，类型应绑定为 `file`，值可以是路径字符串或路径数组。
- `errors`：结构化错误列表。

### `graphiteui_capability_selector`

- 位置：`skill/graphiteui_capability_selector/`
- 显示名称：`GraphiteUI Capability Selector`
- 作用：根据 LLM 节点技能入参规划阶段看到的本地可用能力清单，让模型选择并校验规范化单个 `capability`。
- 生命周期：`before_llm.py` 读取当前启用的图模板和可选择 Skill，生成候选能力清单；`after_llm.py` 接收模型选择的 `capability`，按同一清单做真实性与启用状态校验。
- 选择对象包括当前启用的图模板和对当前 `origin` 可选择的 Skill；图模板优先于 Skill。
- 它不执行被选能力，不生成被选能力的运行入参，也不做程序字段匹配；模型基于候选项的名称和描述判断，脚本只做真实性与启用状态校验。

### `graphiteUI_script_tester`

- 位置：`skill/graphiteUI_script_tester/`
- 显示名称：`GraphiteUI Script Tester`
- 作用：接收脚本内容和用户测试目标，由 LLM 根据当前系统环境编写测试工作区，然后在临时目录运行一次允许的测试命令。
- 生命周期：`before_llm.py` 注入当前系统上下文，包括 OS、Python executable/version 和可用 allowlist 命令；LLM 只生成 `files` 与 `command`；`after_llm.py` 写入临时文件、运行命令，并只返回 `success` 与 `result`。
- 通用性：不再限定 Python/pytest。Python 脚本可使用 `python -m pytest`，JavaScript 脚本可在系统有 Node 时使用 `node --test`，其他脚本只要命令在 allowlist 且当前系统可执行即可。
- 权限和依赖：声明 `file_write` 与 `subprocess` 权限，并在 `requirements.txt` 中声明 `pytest` 作为 Python 测试常用依赖。该 Skill 会执行用户提供的脚本和测试代码，应通过显式确认使用。

### `local_workspace_executor`

- 位置：`skill/local_workspace_executor/`
- 显示名称：`Local Workspace Executor`
- 作用：提供受控的单路径本地工作区操作能力，支持预读上下文、写入一个文件或执行一个脚本。
- 生命周期：`before_llm.py` 会从图 state 和节点任务描述中提取仓库路径并预读已有文件，供 LLM 生成写入内容或执行参数；`after_llm.py` 执行 `read`、`write` 或 `execute`，并只返回 `success` 与 `result`。
- 默认权限：预读可读取仓库内普通文件，但 `.git`、`.env`、`backend/data/settings` 永远拒绝；写入只允许 `backend/data`；执行只允许 `backend/data/tmp` 和 `backend/data/skills/user`。
- 边界：该 Skill 会写本地文件并启动本地进程，必须显式确认。路径白名单只是启动前检查，不是 OS 沙箱。

## 当前内置图模板

### `advanced_web_research_loop`

- 位置：`backend/app/templates/official/advanced_web_research_loop.json`
- 显示名称：`高级联网搜索`
- 作用：围绕 `web_search` 搭建多轮联网研究流程，适合“总结最新新闻、版本内容、公开资料依据”等需要先搜索再整理的任务。
- 主要流程：输入问题 -> 制定研究计划与首轮搜索词 -> 运行 `web_search` -> 阅读本地原文并评估证据 -> 需要补搜时由 condition 分支直接回到搜索节点 -> 证据足够或达到上限后筛选依据 -> 生成 `final_reply`。
- 循环语义：补搜回边是 `should_continue_search` condition 的原生分支。condition 节点协议固定为 `true / false / exhausted` 三个分支，`loopLimit` 默认 5 且可在节点上设置，达到上限时走 `exhausted` 分支并用已有资料收束，而不是撞 LangGraph 递归限制。
- 技能语义：搜索节点绑定 `web_search`，技能输入仍由该 LLM 节点运行时生成；模板不使用 `inputMapping` 或静态技能参数。
- 输出语义：`query`、`source_urls`、`artifact_paths`、`errors` 通过 managed binding state 透传；后续 LLM 节点读取 `artifact_paths` 对应的本地原文，负责证据筛选和最终总结。模板只公开 `final_reply` 这一个 output 节点，关键依据笔记和原文路径属于内部中间 state，不直接连接 output 节点。
- 模型语义：模板默认使用全局模型配置，不写死某个 provider。LLM 节点和桌宠模型下拉的第一项是“全局（实时读取当前全局设定的模型）”，后面才是具体模型 override。若全局本地网关未启动，运行该模板前需要在 Model Providers 页面选择可用模型，或在图中为 LLM 节点设置 override。

### `graphiteui_skill_creation_workflow`

- 位置：`backend/app/templates/official/graphiteui_skill_creation_workflow.json`
- 显示名称：`创建自定义 Skill`
- 作用：把“用户想创建一个 Skill”的需求拆成可暂停、可审查的图流程：检查已有能力、澄清需求、确认示例输入输出、生成 Skill 文件、测试 Python 生命周期脚本、失败后回到构建节点修复，最后在用户批准后写入用户 Skill 目录。
- 主要流程：输入需求 -> 调用 `graphiteui_capability_selector` 检查已有能力候选 -> 评估需求 -> 必要时断点询问用户 -> 确认是否继续创建 -> 断点确认示例输入输出 -> 调用 `graphiteUI_skill_builder` 生成 `skill_key`、`skill.json`、`SKILL.md`、`before_llm.py`、`after_llm.py`、`requirements.txt` -> 判断是否需要脚本测试 -> 调用 `graphiteUI_script_tester` -> 测试失败时经 `script_test_passed` 条件分支回到构建节点，最多三轮 -> 写入前断点审查 -> 用户明确批准后调用 `local_workspace_executor` 写入 `backend/data/skills/user/<skill_key>/`。
- 断点语义：`ask_clarification`、`draft_example_io`、`review_generated_skill` 使用 `interrupt_after` 暂停，分别等待用户补充澄清回答、样例反馈和写入批准。
- 能力候选语义：模板会把 `graphiteui_capability_selector` 返回的候选能力保存为普通 `json` state 供需求评估读取，而不是保存为 `capability` state。原因是当前协议规定 LLM 节点读取 `capability` state 等价于动态执行该能力；这里只是做“是否已有能力可满足需求”的审查，不应触发执行。
- 写入语义：模板只写用户自定义 Skill 目录，不写官方 `skill/` 目录；写入动作由 `local_workspace_executor` 完成并需要显式确认。`graphiteUI_skill_builder` 仍然只负责生成文件内容，不负责写入、测试、启用或修改官方 Skill。

### `graphiteUI_skill_builder`

- 位置：`skill/graphiteUI_skill_builder/`
- 作用：根据用户需求和已确认设计生成一个 GraphiteUI Skill 包的身份和文件内容。
- 生命周期：`before_llm.py` 注入当前 `skill/SKILL_AUTHORING_GUIDE.md`；`after_llm.py` 只规范化 `skill_key`、`skill_json`、`skill_md`、`before_llm_py`、`after_llm_py`、`requirements_txt` 六个输出字段。
- 边界：不写入 `backend/data/skills/user/`，不安装、不启用、不运行测试、不修复生成文件，也不修改官方 Skill 目录。

## 当前前端能力

- 编辑器当前协议支持 `input / agent / condition / output / subgraph` 五类核心节点，其中 `agent` 是待迁移的内部 kind，用户心智应按 LLM 节点理解。
- LLM 节点支持模型选择、thinking、temperature、输入输出绑定、单个 Skill 选择、断点设置和技能说明胶囊编辑。
- condition 节点作为条件边的可视化代理，只允许编辑条件表达式、最大循环次数、节点名称和节点介绍；分支协议固定为 `true / false / exhausted`，JSON 载荷也不能定义其他分支形状。运行时原生支持 `condition -> condition` 的多级路由。
- subgraph 节点把一个 graph 模板复制为当前父图内的独立实例。模板分为 Git 管理的官方模板和 `backend/data/templates/user/` 下的用户自定义模板；前端“保存为模板”只会创建用户自定义模板。节点卡片先展示公开输入/输出胶囊，再展示紧凑的内部 DAG 缩略图、内部能力摘要和子图内部运行状态；DAG 缩略图按行优先顺序展示实际内部执行/判断节点，隐藏 `input` / `output` 边界节点，宽度未知时默认三列，并会根据节点卡片当前宽度在 `1` 到可见节点总数之间自适应列数。缩略图会展示普通连线和条件分支连线，连线路径复用主图 sequence-flow 回流线逻辑并使用缩略图尺寸参数；只有目标节点明确落到下一行时才走下方换行路径，轻微纵向偏移仍保持回流路径。节点位置和连线路径来自同一个响应式布局计算，不再照搬大画布坐标导致横向裁切或因卡片尺寸变化造成连线错位。运行时会把子图内部节点状态投射到缩略图颜色、闪烁高亮与当前节点提示上；主图和缩略图的已完成节点都使用绿色包框。双击节点会打开当前实例的工作区页签，页签内复用正式画布编辑器。子图页签的保存会回写父图中该节点的 `config.graph`，并按内部 `input` / `output` 边界重新同步父图公开 state 端口；也可以另存为普通图。画布左上工具区会显示来源胶囊，例如“来自：Untitled Graph / 节点：高级联网搜索 Subgraph”。
- output 节点负责展示、预览、导出或链接图运行产物，不拥有隐藏持久化策略；Markdown 预览支持安全渲染标题、列表、引用、分割线、表格、链接、inline code 和带语言标签的浅色代码围栏，并保留代码块缩进与横向滚动。
- Skills 页面围绕统一 skill catalog 展示、导入、启用、禁用和删除技能。
- 桌宠浮窗支持模型选择和对话入口，但当前没有可运行的内置桌宠自主循环模板；需要先用新协议创建并注册 `companion_autonomous_loop`，再接入完整自主循环。

## 当前后端能力

- FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- 后端 Skill catalog 合并官方 Skill 和用户自定义 Skill。官方 Skill 只读，用户 Skill 可在 Skills 页面启用、停用和删除。
- validator 负责 `node_system` graph 结构校验。必填技能输入不再做静态绑定校验，而是在 LLM 节点生成技能输入后由运行时检查。
- 动态读取 `capability` state 的 LLM 节点必须写唯一 `result_package` state；静态 `skillKey` 与动态 `capability` state 不能混用；没有静态 `skillKey` 的 `skillBindings` 会被视为旧协议并拒绝。
- LangGraph runtime 是当前运行主链。
- 后端不再在 graph run 入口修补旧模板结构；提交什么图，就按当前协议校验和执行什么图。
- graph run、run detail、SSE 事件、状态快照和 artifact 输出仍是审计与回放的基础。
- `backend/app/companion/commands.py` 仍保留 `graph_patch.draft` 草案记录 stub。这是历史遗留入口，只记录待审批草案，不能应用图补丁，也没有接入 GraphCommandBus、图 revision、undo 或完整审计闭环。

## 当前仍在路线图中

- 继续收束 `subgraph` 子图体验：补齐父子图运行详情页的审计聚合、事件定位和从缩略图点击跳转到内部节点。
- 用新结构手工重建桌宠自主循环模板。
- 在桌宠自主循环模板中复用 `graphiteui_capability_selector`，把“选择能力”和“执行能力”明确拆成两个图节点。
- 完成更完整的图运行展示。
- 清理或按新命令流重建历史 `graph_patch.draft` stub，并完成图补丁预览、GraphCommandBus、graph revision、undo 和审计闭环。
- 将人设、记忆、会话摘要等长期状态更新表达为可审计的图模板流程，而不是隐藏产品逻辑。
