# Current Project Status

本文是 TooGraph 当前项目状态的正式快照。它只记录当前仍然成立的能力、约束和近期方向；已经删除、废弃或需要重新手工搭建的旧模板与旧技能不再作为当前能力描述。

## 结论

- Vue + Element Plus 前端主链已经落地，首页、编辑器、运行记录、设置、技能管理和伙伴浮窗都在当前产品中。
- `node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一正式数据来源。
- 伙伴不是独立运行时。伙伴本质也是按图模板发起一次 graph run，并通过运行来源、状态和技能目录表达上下文。
- 产品心智已收束为“图才是 Agent，单个节点是 LLM 节点”。当前协议中仍存在 `agent` kind 命名，这是待迁移的内部命名；新设计不应继续把单节点描述为多轮 Agent。
- 旧的 `buddy_agentic_tool_loop`、`buddy_chat_loop`、`web_research_loop` 等模板不再随仓库提供，也不再通过后端兼容逻辑修补。
- 新版伙伴自主循环模板 `buddy_autonomous_loop` 已创建为官方图模板。伙伴可见运行不再硬编码单一模板，而是读取 Buddy Home 中保存的运行模板绑定；默认绑定仍指向 `buddy_autonomous_loop`，用户可在伙伴页面把当前消息、对话历史、页面上下文和 Buddy Home 上下文绑定到任意可见模板的 input 节点。`buddy_autonomous_loop` 内部通过子图串联请求理解、按需能力选择与动态执行、最终回复；请求理解阶段会写 `visible_reply` 作为运行过程和暂停上下文中的早期回应，简单闲聊或可直接回答的请求会绕过能力循环，聊天窗口最终只消费父图 root output 节点，默认模板只公开 `final_reply`。回复完成后，伙伴前端会另起内部 `buddy_autonomous_review` 后台模板进行“自主复盘”，模型自行判断是否需要低风险写回 Buddy Home，并通过 `buddy_home_writer` 走 command / revision 路径，不阻塞下一轮对话。
- 动态 `capability.kind=subgraph` 已支持内部断点向父级 run 传播。动态子图遇到 `interrupt_after` 时，父级 run 会进入标准 `awaiting_human`，恢复仍走父级 run 的 resume API。
- 伙伴浮窗已复用标准 `awaiting_human` 暂停卡片：能展示子图 scope、必填 state、当前已产出的内容和上下文，并在卡片内通过“执行当前方案 / 补充内容”的单一操作区恢复原 run；暂停时不会把本轮当作最终完成，底部聊天输入不会续跑旧断点。
- 伙伴运行过程胶囊已经进入会话持久化路径：它作为不进入模型上下文的助手消息显示元数据保存到 `buddy_messages.metadata_json`，`metadata.kind=output_trace` 表示该消息只负责展示 run capsule；刷新页面、切换历史会话或恢复运行记录后仍能还原胶囊。
- 当前普通模板列表提供三个可见官方图模板：`advanced_web_research_loop`（高级联网搜索）、`buddy_autonomous_loop`（伙伴自主循环）和 `toograph_skill_creation_workflow`（创建自定义 Skill），并会合并 `graph_template/user/` 下的用户模板。仓库还包含内部后台模板 `buddy_autonomous_review`（自主复盘），它不进入普通模板列表和能力选择候选。
- 技能系统已收束为统一技能库，不再区分“伙伴技能”和“LLM 节点技能”，也不再使用 `targets` / `executionTargets` 这类旧分流字段。
- 当前官方技能包包括 `web_search`、`toograph_capability_selector`、`toograph_skill_builder`、`toograph_script_tester`、`local_workspace_executor` 和内部 `buddy_home_writer`。后续新能力应按当前统一 Skill 结构专门编写。
- `subgraph` 已是正式节点类型：可从官方或用户自定义 graph 模板创建实例，运行时隔离内部 state，公开 input/output 映射为父图端口，并可双击打开当前实例的工作区页签；主图节点、子图缩略图和右下角画布缩略图共享克制的节点类型强调色。
- 根目录 `buddy_home/` 是伙伴长期资料的目标收束目录。它由程序在启动或读取时按默认内容自动补齐，属于本地用户数据，不进入 Git 管理。正式结构收束为 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json`、`buddy.db` 和 `reports/`；不维护长期 `TOOLS.md`，当前能力来自启用的 Skill、启用的图模板和能力选择 Skill。
- 伙伴启动侧已收束到 `metadata.origin=buddy`，并使用明确的 `buddy_mode`、`buddy_can_execute_actions`、`buddy_requires_approval` 等策略字段表达来源与权限语义；`buddy_mode` 只作为运行时权限 metadata，不再作为图输入 state 注入给 LLM；旧的 `buddy_run`、`buddy_permission_tier`、`buddy_graph_patch_drafts_enabled` 不再写入新 Buddy 图。

## 当前协议

- skill manifest 顶层和 `inputSchema` / `outputSchema` 字段都使用 `name` 表示显示名称，不再使用 `label`。
- “什么时候选择这个技能”写进 `description`。
- “绑定到 LLM 节点后应该如何生成调用输入”写进 `llmInstruction`。
- 一个 LLM 节点最多使用一个显式能力来源：无能力、一个手动选择的 Skill，或一个输入 `capability` state。`capability` 是单个互斥对象，`kind` 可为 `skill`、`subgraph` 或 `none`，不能是列表。多个能力调用必须拆成多个节点和边。
- 手动复用图仍通过 Subgraph 节点完成；`capability.kind=subgraph` 主要用于伙伴主循环等模板在运行时动态选择可运行子图能力，不作为普通 LLM 节点卡片下拉项。
- 复杂模板应优先用子图提升可读性。伙伴自主循环尤其应把上下文装配、需求理解、能力循环和最终回复拆为可审计子图；回复后的自我复盘应作为独立后台图模板运行，而不是继续占用可见回复链路。
- LLM 节点卡片上的 Skill 选择是单选控件；它使用蓝色视觉强调，以区别模型、思考强度和断点等普通运行控件。
- 手动选择的 LLM 节点 Skill 在协议里存为单值 `config.skillKey`。不要使用 `config.skills` 数组；数组会暗示单节点多技能语义，属于旧协议残留。
- 添加到 LLM 节点的 skill 会在节点提示词编辑区显示可编辑的技能说明胶囊；默认胶囊由 skill `llmInstruction` 动态展示，不写入图 JSON。
- 用户编辑胶囊后才会把该节点的覆盖说明写入 `skillInstructionBlocks`，并标记为 `node.override`；移除 skill 时对应覆盖会移除，且不会反向写回技能包原始文档。
- 静态手动选择的 Skill 使用 `config.skillKey` 和协议拥有的 `skillBindings.outputMapping`。`outputMapping` 由图协议、前端和运行时维护，只用于确定 skill 输出写入哪个 state 与运行审计；LLM 不看也不修改它。
- 技能输入由 LLM 节点在运行前根据当前输入 state、技能 `description`、有效 `llmInstruction` 和 `inputSchema` 生成。有效 `llmInstruction` 默认来自 skill manifest；如果当前节点存在 `node.override` 胶囊覆盖，则使用覆盖内容。这个说明只进入技能入参生成阶段的 system prompt，不会再追加到 user prompt。
- Skill 生命周期脚本使用固定文件名而不是在 manifest 中配置入口。存在 `before_llm.py` 时，运行时会在技能入参规划前执行它，并把返回的上下文注入 LLM 提示词；存在 `after_llm.py` 时，运行时会在 LLM 生成结构化技能参数后执行它，并把它返回的 JSON 当作技能结果。写入 state 仍由 TooGraph runtime 根据 `outputSchema` 和 `skillBindings.outputMapping` 完成，脚本不直接绑定 state。
- 在 LLM 节点卡片选择带 `outputSchema` 的静态 skill 时，前端会自动创建 managed skill output state、添加到该节点输出端口，并写入 `skillBindings.outputMapping`，让运行时能把技能结果透传给下游节点。
- 动态能力执行来自输入 `capability` state，不复用 `skillBindings.outputMapping`，也不会推断普通输出映射。这类节点必须只写一个 `result_package` state。包内 `outputs.<outputKey>` 保存 `{ name, description, type, value }`，不额外捏造 `fieldKey`；下游 LLM 节点会把这些虚拟输出拆开并复用普通 state/file 展开逻辑。
- 当 `capability.kind=subgraph` 进入 LLM 节点时，该节点只负责根据当前 state 和目标模板公开输入 schema 生成子图输入；运行时负责执行对应图模板，并把公开 output 边界封装为同一套 `result_package`。这条路径不经过静态 Subgraph 节点端口 mapping，也不让 LLM 二次总结子图结果。若动态子图内部触发 `interrupt_after`，父级 run 会进入标准 `awaiting_human`，并通过 `pending_subgraph_breakpoint` 与父级 resume API 恢复。
- 图运行前不再做旧草稿兼容补齐。提交到运行时的图必须已经符合当前协议。
- `promptVisible` 已移除。上下文边界由节点 `reads` 决定：LLM 节点只接收自己显式读取的 state。
- `state_schema` 支持 `binding` 元数据，用来标记某个 state 是否由技能输出自动绑定。
- `file` / `image` / `audio` / `video` 类型 state 的值是本地 artifact 路径、路径列表，或 `kind=local_folder` 的本地文件夹选择包；不再有单独的 `file_list`、`array` 或 `object` state 类型。LLM 节点接收 `file` state 时，会读取文本类文件并只把“文件名 + 原文全文”拼入模型上下文；图片、音频和视频路径会走多模态附件处理，不作为文本读取。
- Input 节点输出文件、图片、音频或视频时都写入本地路径；文件输入还可以切到“文件夹”模式，通过后端只读策略列出文件树，并在节点面板中勾选要注入的文件。Output 节点可通过 documents 预览展示这些 artifact。
- 伙伴运行来源语义是 `metadata.origin=buddy`。新 Buddy 图不再写入 `buddy_run`、`buddy_permission_tier`、`buddy_graph_patch_drafts_enabled` 这类旧元数据；伙伴权限模式只写入运行 metadata，不作为 graph input state 注入；运行模板绑定会保存在 `metadata.buddy_template_binding` 供审计回看。后续新增策略字段必须保持显式、可审计，并避免重新创造第二套运行协议。

## 当前技能

官方 Skill 位于 `skill/official/<skill_key>/`，会进入 Git 管理；用户自定义 Skill 位于 `skill/user/<skill_key>/`，也可以进入 Git 管理。Skill catalog 会同时返回官方和用户 Skill，并通过 `sourceScope` / `canManage` 区分来源与可管理性；当前环境的启用状态只写入被忽略的 `skill/settings.json`。Python Skill 只要依赖标准库以外的包，就应该在包内提供 `requirements.txt`；运行时会先检查当前 Python，缺依赖时在 `backend/data/skills/envs/` 下优先用 `uv` 创建或复用托管虚拟环境。

### `web_search`

- 位置：`skill/official/web_search/`
- 显示名称：`联网搜索`
- 作用：执行联网搜索、返回来源链接、本地原文文件路径和结构化错误信息。
- 生命周期：`before_llm.py` 只补充当前日期；`after_llm.py` 接收 LLM 生成的 `query`，执行搜索和原文下载。旧的程序侧“识别时效查询并自动给 query 拼日期”逻辑已移除，是否把日期写入 query 由 LLM 根据上下文判断。
- 启用的 Skill 默认可被图模板或能力选择器调用；运行 Skill 本身不需要确认。当前运行时会在 `graph_permission_mode=ask_first`、`buddy_mode=ask_first` 或 `buddy_requires_approval=true` 时，对声明 `file_write`、删除类权限或 `subprocess` 的 Skill 在真正执行前进入标准 `awaiting_human`；`full_access` 模式会直接放行。不应再回到 per-skill 审批开关。
- 它只负责搜索和资料获取，不负责最终总结。搜索词由绑定它的 LLM 节点根据任务决定；整理和总结应交给后续 LLM 节点。
- 搜索源请求默认最多尝试 5 次，用于缓解 DuckDuckGo fallback 或外部搜索 API 的瞬时 TLS、连接中断和网关抖动。

主要输出语义：

- `query`：本次实际用于搜索的查询词。
- `source_urls`：搜索到的网址列表。
- `artifact_paths`：成功保存到本地的来源原文文件路径，类型应绑定为 `file`，值可以是路径字符串或路径数组。
- `errors`：结构化错误列表。

### `toograph_capability_selector`

- 位置：`skill/official/toograph_capability_selector/`
- 显示名称：`TooGraph Capability Selector`
- 作用：根据 LLM 节点技能入参规划阶段看到的本地可用能力清单，让模型选择并校验规范化单个 `capability`。
- 生命周期：`before_llm.py` 读取当前启用的图模板和启用的 Skill，生成候选能力清单；`after_llm.py` 接收模型选择的 `capability`、`selection_reason` 和 `rejected_candidates`，按同一清单做真实性与启用状态校验，并保留 `permissions` 供候选描述、审计和后续运行时策略使用。它不输出 `requiresApproval`，也不恢复 per-skill 审批协议。
- 审计输出：除 `capability` 和 `found` 外，选择器返回 `audit`，记录候选数量、按类型计数、选中能力、选择原因、选中权限摘要、被拒绝候选原因、缺口说明和 catalog 读取错误；同时返回 `capability_selection` 低层 `activity_events`，Buddy 主模板会把 `audit` 映射到 `capability_selection_audit` state。
- 选择对象包括当前启用的图模板和启用的 Skill；图模板优先于 Skill。
- 它不执行被选能力，不生成被选能力的运行入参，也不做程序字段匹配；模型基于候选项的名称和描述判断，脚本只做真实性与启用状态校验。

### `toograph_script_tester`

- 位置：`skill/official/toograph_script_tester/`
- 显示名称：`TooGraph Script Tester`
- 作用：接收脚本内容和用户测试目标，由 LLM 根据当前系统环境编写测试工作区，然后在临时目录运行一次允许的测试命令。
- 生命周期：`before_llm.py` 注入当前系统上下文，包括 OS、Python executable/version 和可用 allowlist 命令；如果输入 state 的字符串值是可读取的本地文件路径，还会把该文件文本追加到上下文；LLM 只生成 `files` 与 `command`；`after_llm.py` 写入临时文件、运行命令，并只返回 `success` 与 `result`。
- 通用性：不再限定 Python/pytest。Python 脚本可使用 `python -m pytest`，JavaScript 脚本可在系统有 Node 时使用 `node --test`，其他脚本只要命令在 allowlist 且当前系统可执行即可。
- 权限和依赖：声明 `file_write` 与 `subprocess` 权限，并在 `requirements.txt` 中声明 `pytest` 作为 Python 测试常用依赖。该 Skill 会执行用户提供的脚本和测试代码；当前运行时会按图或 Buddy 的 `需确认` / `完全访问` 模式在执行前暂停或放行。

### `local_workspace_executor`

- 位置：`skill/official/local_workspace_executor/`
- 显示名称：`Local Workspace Executor`
- 作用：提供受控的单路径本地工作区操作能力，支持预读上下文、读取、列出、搜索、写入一个文件或执行一个脚本。
- 生命周期：`before_llm.py` 会从图 state 和节点任务描述中提取仓库路径并预读已有文件，供 LLM 生成写入内容或执行参数；`after_llm.py` 执行 `read`、`list`、`search`、`write` 或 `execute`，并只返回 `success` 与 `result`。
- 默认权限：预读可读取仓库内普通文件，但 `.git`、`.env`、`backend/data/settings` 永远拒绝；写入只允许 `backend/data`、`skill/user`、`graph_template/user` 和 `node_preset/user`；执行只允许 `backend/data/tmp` 和 `skill/user`。
- 边界：该 Skill 会写本地文件并启动本地进程。当前已有路径白名单和拒绝规则，但它们只是启动前检查，不是 OS 沙箱；运行时会按 `需确认` / `完全访问` 自动暂停或放行。

## 当前内置图模板

### `advanced_web_research_loop`

- 位置：`graph_template/official/advanced_web_research_loop/template.json`
- 显示名称：`高级联网搜索`
- 作用：围绕 `web_search` 搭建多轮联网研究流程，适合“总结最新新闻、版本内容、公开资料依据”等需要先搜索再整理的任务。
- 主要流程：输入问题 -> 制定研究计划与首轮搜索词 -> 运行 `web_search` -> 阅读本地原文并评估证据 -> 需要补搜时由 condition 分支直接回到搜索节点 -> 证据足够或达到上限后筛选依据 -> 生成 `final_reply`。
- 循环语义：补搜回边是 `should_continue_search` condition 的原生分支。condition 节点协议固定为 `true / false / exhausted` 三个分支，`loopLimit` 默认 5 且可在节点上设置，达到上限时走 `exhausted` 分支并用已有资料收束，而不是撞 LangGraph 递归限制。
- 技能语义：搜索节点绑定 `web_search`，技能输入仍由该 LLM 节点运行时生成；模板不使用 `inputMapping` 或静态技能参数。
- 输出语义：`query`、`source_urls`、`artifact_paths`、`errors` 通过 managed binding state 透传；后续 LLM 节点读取 `artifact_paths` 对应的本地原文，负责证据筛选和最终总结。模板只公开 `final_reply` 这一个 output 节点，关键依据笔记和原文路径属于内部中间 state，不直接连接 output 节点。
- 模型语义：模板默认使用全局模型配置，不写死某个 provider。LLM 节点和伙伴模型下拉的第一项是“全局（实时读取当前全局设定的模型）”，后面才是具体模型 override。若全局本地网关未启动，运行该模板前需要在 Model Providers 页面选择可用模型，或在图中为 LLM 节点设置 override。

### `buddy_autonomous_loop`

- 位置：`graph_template/official/buddy_autonomous_loop/template.json`
- 显示名称：`伙伴自主循环`
- 作用：作为伙伴浮窗和伙伴页面的默认图循环，把本轮用户消息、对话历史、页面上下文和 Buddy Home 长期资料转成一次可审计 graph run。
- 主要流程：通过伙伴运行绑定把当前消息、对话历史、页面上下文和 Buddy Home 上下文注入模板 input 节点 -> `intake_request` 子图理解请求并写 `visible_reply` 作为运行过程/暂停上下文中的早期回应，必要时在 `ask_clarification` 断点等待用户澄清 -> `needs_capability` 判断是否需要启用能力；不需要时直接进入 `draft_final_response`，需要时进入 `run_capability_cycle` 调用 `toograph_capability_selector`，并把能力选择审计写入 `capability_selection_audit`；找到能力后由动态能力执行节点写唯一 `capability_result` 结果包，找不到能力时写 `capability_gap` 并在最终回复中询问是否构建该能力；多轮能力调用摘要写入 `capability_trace` -> `draft_final_response` 子图只写 `final_reply` -> `output_final` 展示 `final_reply` 并结束可见主运行。写文件、删改文件或执行脚本的确认不在模板内由 LLM 判断，而由运行时根据 `需确认` / `完全访问` 模式处理。
- 动态能力语义：只有 `execute_capability` 读取 `selected_capability` 这个 `capability` state，并且它只写一个 `result_package` state。其他复盘节点不能读取 `capability` state，否则会被运行协议视为动态能力执行节点。
- 断点语义：澄清和人工确认类断点使用子图内部 `interrupt_after`。静态 Subgraph 节点和动态 `capability.kind=subgraph` 的内部断点都会通过父级 Buddy run 的标准暂停/恢复路径展示子图 scope，而不是由伙伴前端额外发明确认协议。写文件、删改文件或执行脚本这类低层操作审批由运行时权限原语转换为标准 `awaiting_human`。
- 边界：当前模板已经表达完整可见回复主干；低风险 Buddy Home 写回已由后台自主复盘模板和受控 writer Skill 接管。图补丁应用和更完整的伙伴页面暂停交互仍应作为后续显式模板/命令流补齐，不能隐藏在 output 节点或前端逻辑里。

### `buddy_autonomous_review`

- 位置：`graph_template/official/buddy_autonomous_review/template.json`
- 显示名称：`自主复盘`
- 作用：作为伙伴浮窗在主回复完成后启动的内部后台模板，读取主运行留下的用户消息、历史、页面上下文、Buddy Home 上下文、请求理解、能力结果、能力复盘和最终回复，产出 `autonomous_review` 与 `writeback_commands`，并在模型判断需要低风险写回时调用 `buddy_home_writer`。
- 可见性：该模板标记为 `metadata.internal=true`，不会进入普通模板列表和 `toograph_capability_selector` 候选清单，但可以通过明确模板 ID 读取并发起 graph run。
- 边界：用户不确认每次 Buddy Home 是否应该更新；是否更新由模型在本后台图中判断。正常低风险 memory、session summary、profile、非权限沟通偏好、精炼复盘报告和能力使用统计写回自动应用并留下 command、revision 与 activity event；涉及权限升级、行为边界扩大、任意文件写入、脚本执行、图补丁或 revision restore 的变化会被 writer 拒绝，不静默提权。

### `toograph_skill_creation_workflow`

- 位置：`graph_template/official/toograph_skill_creation_workflow/template.json`
- 显示名称：`创建自定义 Skill`
- 作用：把“用户想创建一个 Skill”的需求拆成可暂停、可审查的图流程：检查已有能力、澄清需求、确认示例输入输出、生成 Skill 文件、测试脚本或生命周期入口、失败后回到构建节点修复，最后在用户批准后写入用户 Skill 目录。
- 主要流程：输入需求 -> 调用 `toograph_capability_selector` 检查已有能力候选 -> 评估需求 -> 必要时断点询问用户 -> 确认是否继续创建 -> 断点确认示例输入输出 -> 调用 `toograph_skill_builder` 生成 `skill_key`、`skill.json`、`SKILL.md`、`before_llm.py`、`after_llm.py`、`requirements.txt` -> 判断是否需要脚本测试 -> 调用 `toograph_script_tester` -> 测试失败时经 `script_test_passed` 条件分支回到构建节点，最多三轮 -> 写入前断点审查 -> 用户明确批准后调用 `local_workspace_executor` 写入 `skill/user/<skill_key>/`。
- 断点语义：`ask_clarification`、`draft_example_io`、`review_generated_skill` 使用 `interrupt_after` 暂停，分别等待用户补充澄清回答、样例反馈和写入批准。
- 能力候选语义：模板会把 `toograph_capability_selector` 返回的候选能力保存为普通 `json` state 供需求评估读取，而不是保存为 `capability` state。原因是当前协议规定 LLM 节点读取 `capability` state 等价于动态执行该能力；这里只是做“是否已有能力可满足需求”的审查，不应触发执行。
- 写入语义：模板只写用户自定义 Skill 目录，不写官方 `skill/` 目录；写入动作由 `local_workspace_executor` 完成。`review_generated_skill` 只做生成方案审查，不再承担低层文件写入审批；低层文件写入由统一运行时审批拦截按 `需确认` / `完全访问` 模式处理。`toograph_skill_builder` 仍然只负责生成文件内容，不负责写入、测试、启用或修改官方 Skill。
- 视觉和协议约束：该模板只使用编辑器可创建的 `input / LLM / condition / output` 节点，LLM 节点最多绑定一个 Skill，condition 节点只使用固定 `true / false / exhausted` 分支，模板不手写节点尺寸，交给前端默认尺寸和用户后续拖拽调整。

### `toograph_skill_builder`

- 位置：`skill/official/toograph_skill_builder/`
- 作用：根据用户需求和已确认设计生成一个 TooGraph Skill 包的身份和文件内容。
- 生命周期：`before_llm.py` 注入当前 `skill/SKILL_AUTHORING_GUIDE.md`；`after_llm.py` 只规范化 `skill_key`、`skill_json`、`skill_md`、`before_llm_py`、`after_llm_py`、`requirements_txt` 六个输出字段。
- 边界：不写入 `skill/user/`，不安装、不启用、不运行测试、不修复生成文件，也不修改官方 Skill 目录。

## 当前前端能力

- 编辑器当前协议支持 `input / agent / condition / output / subgraph` 五类核心节点，其中 `agent` 是待迁移的内部 kind，用户心智应按 LLM 节点理解。
- LLM 节点支持模型选择、thinking、temperature、输入输出绑定、单个 Skill 选择、断点设置和技能说明胶囊编辑。
- condition 节点作为条件边的可视化代理，只允许编辑条件表达式、最大循环次数、节点名称和节点介绍；分支协议固定为 `true / false / exhausted`，JSON 载荷也不能定义其他分支形状。运行时原生支持 `condition -> condition` 的多级路由。
- subgraph 节点把一个 graph 模板复制为当前父图内的独立实例。模板分为 Git 管理的官方模板和 `graph_template/user/` 下的用户自定义模板；前端“保存为模板”只会创建用户自定义模板。节点卡片先展示公开输入/输出胶囊，再展示紧凑的内部 DAG 缩略图、内部能力摘要和子图内部运行状态；DAG 缩略图按行优先顺序展示实际内部执行/判断节点，隐藏 `input` / `output` 边界节点，宽度未知时默认三列，并会根据节点卡片当前宽度在 `1` 到可见节点总数之间自适应列数。缩略图会展示普通连线和条件分支连线，连线路径复用主图 sequence-flow 回流线逻辑并使用缩略图尺寸参数；只有目标节点明确落到下一行时才走下方换行路径，轻微纵向偏移仍保持回流路径。节点位置和连线路径来自同一个响应式布局计算，不再照搬大画布坐标导致横向裁切或因卡片尺寸变化造成连线错位。运行时会把子图内部节点状态投射到缩略图颜色、闪烁高亮与当前节点提示上；主图和缩略图的已完成节点都使用绿色包框。双击节点会打开当前实例的工作区页签，页签内复用正式画布编辑器。子图页签的保存会回写父图中该节点的 `config.graph`，并按内部 `input` / `output` 边界重新同步父图公开 state 端口；也可以另存为普通图。画布左上工具区会显示来源胶囊，例如“来自：Untitled Graph / 节点：高级联网搜索 Subgraph”。
- output 节点负责展示、预览、导出或链接图运行产物，不拥有隐藏持久化策略；Markdown 预览支持安全渲染标题、列表、引用、分割线、表格、链接、inline code 和带语言标签的浅色代码围栏，并保留代码块缩进与横向滚动。
- Skills 页面围绕统一 skill catalog 展示、导入、启用、禁用和删除技能。
- 伙伴浮窗支持模型选择、对话入口、后端持久化历史会话、新建会话、历史下拉、删除确认、全屏展开、markdown 回复、每组父图公开输出前的运行过程胶囊、节点级流式输出预览、每步耗时和可用时的模型 token 用量。可见运行会读取伙伴页面保存的运行模板绑定，按 input 节点注入当前消息、对话历史、页面上下文和 Buddy Home 上下文。聊天窗口只展示父图 root-level output 节点导出的 state，子图 output 和中间 state 不直接生成聊天消息；每个公开 output 有独立流式状态和耗时，output 计时从上游节点开始运行时启动，并在对应 state 完整到达时停止。运行过程胶囊作为 `metadata.kind=output_trace` 的助手消息持久化，`include_in_context=false`，用于刷新、历史会话和运行恢复后的 UI 还原，不作为 LLM 上下文。前端不再设置固定整轮运行超时，只等终态、断点或显式中止。主运行完成回复后，前端会把同一次运行的 state 快照灌入内部 `buddy_autonomous_review` 模板并作为后台 run 启动；后台复盘不占用 `activeRunId`，不锁定下一轮输入，低风险 Buddy Home 写回由 `buddy_home_writer` 生成 revision，写回 activity 会在运行过程和运行详情中展示 applied/skipped/revision 明细。浮窗已把 `awaiting_human` 展示为暂停卡片，支持必填 state 草稿、卡片内单一续跑操作区、拒绝待审批能力、取消暂停中的整轮 run、刷新或重新打开会话后找回仍在 `awaiting_human` 的暂停 run，并在卡片中先展示当前产物/上下文再展示需要补充的信息；底部输入在暂停时只提示回到卡片。伙伴页面已包含资料、策略、记忆、摘要、运行模板绑定、确认、历史和桌宠调试页签；确认页签复用标准暂停卡片，历史页签支持目标筛选、字段级 diff、来源 run / command 展示和 revision 恢复。

## 当前后端能力

- FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- 后端 Skill catalog 合并官方 Skill 和用户自定义 Skill。官方 Skill 只读，用户 Skill 可在 Skills 页面启用、停用和删除。
- validator 负责 `node_system` graph 结构校验。必填技能输入不再做静态绑定校验，而是在 LLM 节点生成技能输入后由运行时检查。
- 动态读取 `capability` state 的 LLM 节点必须写唯一 `result_package` state；静态 `skillKey` 与动态 `capability` state 不能混用；没有静态 `skillKey` 的 `skillBindings` 会被视为旧协议并拒绝。
- LangGraph runtime 是当前运行主链。
- 后端不再在 graph run 入口修补旧模板结构；提交什么图，就按当前协议校验和执行什么图。
- graph run、run detail、SSE 事件、状态快照、节点级 Run Activity 和 artifact 输出仍是审计与回放的基础。
- 运行时已持久化节点执行记录 `node_executions`，包含节点开始/结束/失败/暂停时间、耗时和运行配置。前端通过共享 `runTelemetryProjection` 同时驱动画布节点计时胶囊、运行恢复后的计时还原、公开 output 计时和可用模型 token 用量显示。
- 低层 `activity_events` 已有第一阶段统一形状：运行时会记录通用 Skill 调用、动态子图调用、权限暂停，以及本地文件夹输入展开为 LLM 上下文时的选中文件读取事件；Skill 可以返回确定性的细粒度事件并由运行时补齐节点/子图上下文；`local_workspace_executor` 已返回文件读取、文件列表、文件搜索、文件写入和脚本执行事件；`toograph_script_tester` 已返回临时测试工作区和测试命令事件；`web_search` 已返回搜索与资料下载摘要事件；`graph_patch.draft` 命令记录已带图补丁草案事件形状；`buddy_home_writer` 已返回 `buddy_home_write` 事件，包含 applied/skipped/revision 明细。
- 静态 Subgraph 节点和动态 `capability.kind=subgraph` 的内部 `interrupt_after` 都会通过父级 run 的 `pending_subgraph_breakpoint` 暂停，并在父级 resume 后继续内部 checkpoint。
- 本地文件夹输入已能在普通仓库和 `.worktrees/<branch>` 工作区下读取根目录 `buddy_home/`，避免伙伴模板在分支工作区中丢失 Buddy Home 上下文。
- `backend/app/buddy/home.py` 负责根目录 `buddy_home/` 的默认文件生成；`backend/app/buddy/store.py` 已提供基于 `SOUL.md`、`policy.json` 和 `buddy.db` 的 profile、policy、memories、session summary、reports、capability usage stats、revisions、command 记录、`buddy_sessions`、`buddy_messages` 和运行模板绑定存取；`buddy_messages` 已支持 `metadata_json`，用于持久化运行过程胶囊这类显示元数据，空正文消息只允许用于 `metadata.kind=output_trace`。`backend/app/buddy/commands.py` 已有命令记录入口。低风险 Buddy Home 写回已通过 `buddy_autonomous_review` 和 `buddy_home_writer` 接入该命令/revision 路径，覆盖 memory、session summary、profile、`policy.communication_preferences`、`reports/` 精炼复盘报告和 `capability_usage_stats` 聚合统计；运行模板绑定也通过 command / revision 路径更新和恢复。
- `backend/app/buddy/commands.py` 仍保留 `graph_patch.draft` 草案记录 stub。这是历史遗留入口，只记录待审批草案，不能应用图补丁，也没有接入 GraphCommandBus、图 revision、undo 或完整审计闭环。

## 当前仍在路线图中

- 近期顺序：唯一方针阶段 2 已完成；下一步进入阶段 3，从替代 `graph_patch.draft` stub 的图补丁草案协议开始。
- 伙伴运行来源巩固：保持 Buddy 图统一使用 `metadata.origin=buddy`、模板绑定和明确策略字段，继续补充运行详情、伙伴页面和测试中的来源/权限展示，避免重新引入旧 metadata 或第二套运行协议。
- 继续收束 `subgraph` 子图体验：父子图运行详情审计聚合已有基础，仍需补齐从缩略图点击跳转到内部节点，以及动态子图断点在运行详情中的更完整定位。
- 完善伙伴断点交互：浮窗和伙伴页面确认页签都已复用标准暂停卡；仍需继续打磨多暂停 run 的优先级、跨会话定位、失败恢复提示和低层操作摘要。
- 完善动态能力审批体验：当前已能在 `需确认` 模式下对写文件、删除类权限和 `subprocess` Skill 进入标准 `awaiting_human`，并能在 Buddy 浮窗和伙伴页面内恢复、拒绝或取消；仍需补齐更细的低层操作摘要和审批后的结果归因。
- 扩展低层 `activity_events` 覆盖面：第一阶段已覆盖 Skill 调用、权限暂停、动态子图调用、本地文件读取/列表/搜索/写入/脚本、本地文件夹输入上下文读取、脚本测试、`web_search` 下载、图补丁草案和 Buddy Home 写回；仍需补齐图补丁应用/revision。
- 清理或按新命令流重建历史 `graph_patch.draft` stub，并完成图补丁预览、GraphCommandBus、graph revision、undo 和审计闭环。
- 继续完善上下文预算和性能策略：已有节点耗时、公开 output 耗时和可用 token 用量显示；仍需为历史、Buddy Home、`result_package`、大日志和大 artifact 建立预算、摘要和按需展开规则。
- 将内部 `agent` kind 迁移为面向用户和协议一致的 LLM 节点语义。
