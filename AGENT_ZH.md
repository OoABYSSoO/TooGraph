# TooGraph Agent 中文说明

这些说明适用于本仓库中的所有工作，并应在新的 Codex 会话中持续生效。

## 提交信息

- 为本项目创建 git commit 时，提交信息必须使用中文。
- 修改仓库后，除非用户明确要求不要提交，否则应提交并推送更改。

## 启动流程

- 修改代码后，使用仓库标准跨平台命令 `npm start` 重启 TooGraph。
- `node scripts/start.mjs` 是仓库底层标准启动命令；`npm start` 应解析到它。
- TooGraph 使用单端口启动模型。默认公开地址是 `http://127.0.0.1:3477`，可用 `PORT=<port> npm start` 覆盖端口。
- 当 `frontend/dist` 的构建 manifest hash 与当前前端输入一致时，`npm start` 应复用已有构建而不是每次启动都重新构建。需要强制重新构建时使用 `TOOGRAPH_FORCE_FRONTEND_BUILD=1 npm start`。
- `npm run dev` 不是受支持的项目命令。
- 在 Windows PowerShell 中，如果执行策略阻止 `npm.ps1`，使用 `npm.cmd start`。
- `scripts/start.sh` 仍是 Linux、macOS、Git Bash 和 WSL 的标准 Bash 包装脚本，并应与 `scripts/start.mjs` 保持行为一致。
- 如果任务只涉及文档或其他非运行时代码变更，可以按实际情况判断；对代码变更，默认使用上述标准启动流程重启。

## 本地 LLM 运行时

- 本地 LLM 和运行时说明应统一放在 Model Providers 页面。
- 首选本地或私有网关流程：
  - 启动要使用的 OpenAI-compatible gateway。
  - 在 Model Providers 页面配置 `local` / Custom OpenAI-compatible Provider；当前本地默认 base URL 是 `http://127.0.0.1:8888/v1`。
  - 在 UI 中保存或发现模型列表，然后在那里选择默认文本模型。
- 模型执行只读取已保存的 Model Providers 配置和 UI 中的默认模型选择。不要重新文档化或恢复通过启动环境变量配置模型 provider 的方式。
- TooGraph 自身启动说明仍然是 `npm start` 和 `node scripts/start.mjs`；这些命令不会被本地运行时说明替代。

## UI 实现策略

- UI 工作应始终优先使用项目已经采用的组件库，再考虑自定义组件或控件。
- 只有当现有库无法合理满足需求，或确实需要自定义行为时，才手写 UI。
- 必须自定义 UI 时，应尽量缩小自定义层，并尽可能构建在现有库 primitives 之上。

## 用户体验与视觉质量

- 用户体验和视觉质量是每个用户可见改动的必需部分，不是可选润色。
- 修改 UI 前，检查附近页面和组件，遵循现有美术方向、间距节奏、颜色、字体、图标风格、动效和交互语言。
- 不要交付原始浏览器默认控件、拥挤布局、不清晰标签、意外视觉退化，或只有实现者自己知道怎么用的流程。
- 每个用户可见流程都应包含清晰 affordance、必要的加载/保存/成功/错误反馈，并避免令人意外的状态变化。
- 对重要 UI 改动，除运行测试外，也应尽量通过浏览器截图进行视觉验证。

## 产品与工程质量

- 变更范围应贴合请求，但被触及的区域要保持一致和清晰：移除令人困惑的重复、过时 UI 状态，以及本次工作引入或暴露出的明显隐患。
- 添加任何功能前，必须先查看原有架构、数据链路和附近实现。优先复用既有接口、协议路径、存储 API、校验器、命令总线、图/运行时 primitives 和 UI 模式。不能为了单独完成功能需求而添加产品特化的特殊代码、旁路或不符合架构设计的链路；框架合理性和清晰的数据/控制流比单个功能“能跑”更重要。一个功能即使表面完成，但违反仓库架构、重复已有接口，或形成不合理的执行链路，也不能接受。
- 保护用户数据和本地配置。除非明确要求，不要提交本地运行状态、日志、生成构建产物、凭据或机器特定设置。
- 将 `backend/data/settings`、`.toograph_*`、`.dev_*` 日志、`dist` 和 `.worktrees` 视为本地/运行时产物，除非任务明确针对它们。
- 当自动化、可发现的行为能改善用户工作流时，优先采用它，但副作用必须可见且可逆。
- 完成前，为改动面运行最小但有意义的验证集；UI 工作在可行时包含视觉检查。清楚说明跳过或失败的验证。

## 图优先产品架构

- TooGraph 产品行为应在可行时由图模板表达。持久化操作、本地文件编辑、记忆更新、伙伴自配置和其他副作用，应因为指定图/模板运行而发生，而不是由隐藏的产品特化命令式代码决定。
- 保持节点职责清晰：
  - 整张图才是 Agent。不要把单个节点当成自治的多步骤 agent。
  - LLM 节点执行一次模型回合。它们负责推理、分类、规划、生成结构化 state，或准备一次 capability 调用。
  - 一个 LLM 节点最多只能使用一个显式 capability 来源：无 capability、一个已选 Skill，或一个输入的 `capability` state。`capability` state 是单个互斥对象，其 `kind` 为 `skill`、`subgraph` 或 `none`；不能是列表。如果工作流需要多个 capability，用多个节点和边表达顺序。
  - 手动选择的 LLM-node Skill 必须存储为标量 `config.skillKey`，绝不能存为 `config.skills` 或任何数组。数组意味着多 skill 语义，属于旧的无效协议。
  - 当 LLM 节点使用 Skill 或动态 Subgraph 时，LLM 只在执行前准备调用输入。运行时执行 capability，并把原始结构化输出写入 state；同一个 LLM 节点不应总结、重包或继续发起后续 capability 调用。
  - 静态手动选择的 Skill 使用 `config.skillKey` 和协议拥有的 `skillBindings.outputMapping`。该映射由图/编辑器/运行时创建，在运行审计详情中可见，不应暴露为由 LLM 选择或重写的内容。
  - Skill instruction capsule 只是节点级 override 面。默认 capsule 来自选中 skill manifest 的 `llmInstruction`；只有用户编辑后的文本才持久化为 `skillInstructionBlocks.<skillKey>`，并带有 `source: "node.override"`。运行时只有一份有效 skill-use instruction：节点 override 优先，否则使用 manifest `llmInstruction`，注入到 skill-input planning system prompt 中，不在用户 prompt 中重复。
  - Skill lifecycle scripts 使用固定文件名，而不是 manifest entrypoint 配置。如果存在 `before_llm.py`，运行时在 skill-input planning 前执行它，并把可审计上下文注入 LLM prompt。如果存在 `after_llm.py`，运行时在 LLM 产出结构化 skill 参数后执行它，并将其 JSON 结果视为 skill 输出。State binding 仍由运行时通过 `outputSchema` 和 `skillBindings.outputMapping` 拥有；lifecycle scripts 不得直接写图 state。
  - 来自输入 `capability` state 的动态 capability 执行必须准确写入一个 `result_package` state。该包将输出包装为 `outputs.<outputKey> = { name, description, type, value }`；不要添加冗余的 `fieldKey` 字段。下游 LLM prompt assembly 解包这些虚拟输出后，使用与静态 state 相同的渲染规则。
  - 手动复用图嵌入属于 Subgraph 节点。`capability.kind=subgraph` 用于 Buddy loop 等模板内部的动态图 capability 选择，不应作为普通 LLM 节点卡片上的下拉选项。
  - 大型 Buddy 或自动化模板应在可行时把稳定阶段拆为 Subgraph 节点。优先使用可读的顶层图流，并通过可检查子图表达上下文打包、capability loop 和最终回复生成，而不是把所有逻辑塞进一张拥挤画布。回复后的 self-review 应作为一个独立、可审计的后台图/模板，从已完成 run snapshot 运行，不要延长可见回复路径并阻塞下一轮用户输入。
  - Skill 节点执行受控 capability 和副作用，例如写本地文件、更新记忆存储、下载资源或创建 revision。
  - Output 节点负责显示、预览、导出或链接结果。它们不应拥有持久化 mutation 逻辑。
- 后端代码应提供可复用 primitives、存储 API、校验器、revision 机制和 skill runtime。避免把 Buddy memory policy、persona 更新规则或工作流决策等产品行为埋进后端 endpoint；当行为可以表达为图/模板时，应通过图/模板表达。
- Buddy 行为、记忆管理、persona 更新和文件编辑工作流应建模为可审计图流：input/context -> LLM planning -> optional validation/approval -> skill/subgraph execution -> output display。
- 低层操作应通过图运行保持可见和可回放。当功能需要修改本地文档、profile 数据、policy 数据、memories、templates 或其他本地状态时，优先添加或复用一个 skill 加一个模板来执行操作，并返回清晰 artifacts，如本地文件路径、diff、revision ID 和状态消息。

## Buddy 自治 Agent 方向

- 将 `docs/future/buddy-autonomous-agent-roadmap.md` 视为 Buddy 自治与自演化的长期方向。将 `docs/current_project_status.md` 视为当前实现快照。如果二者冲突，应更新快照或把仍有效的信息折叠进 roadmap，而不是发明第三个事实来源。
- `demo/hermes-agent/` 项目是 capability 参考，不是要照搬的架构。TooGraph 应把 Hermes 风格能力翻译为图模板、显式 Skill 调用、state、approval、run record、revision 和 artifact。
- Hermes 风格自治不只是工具调用：它包括多步骤 capability loop、memory/session recall、skill 创建和改进、计划或触发运行、delegation、安全 guardrail、结果预算，以及从执行 trace 中自我改进。在 TooGraph 中，这些必须表达为可审计图流，而不是隐藏 agent loop。
- TooGraph 中的 Skill 表示一个 LLM-node turn 中的一次受控 capability 调用。Skill 可以读取上下文、准备确定性数据、运行脚本、搜索、写入一个受控输出，或返回 artifact。它不应拥有多步骤自治、retry loop、结果复盘、最终回复生成、长期记忆策略或后续 capability 选择。
- 多步骤智能属于图模板：LLM node -> condition -> one Skill or dynamic subgraph execution -> `result_package` or mapped Skill outputs -> LLM review -> condition loop, pause, approval, failure handling, or final output。
- 不要创建单体 `self_evolve` Skill 或 Buddy 专用隐藏 runtime。Buddy 自演化应是图模板 pipeline：把 run trace、用户修正、失败、成功和 Buddy Home context 转成结构化改进候选，验证或测试它们，必要时请求人工 review，然后才通过受控 command 或 Skill 应用改动。
- 现有 Buddy 模板是起点，不是可丢弃脚手架：
  - `buddy_autonomous_loop` 是可见 Buddy 运行路径：context input、request intake、capability loop、final response，以及单个面向用户的 `final_reply`。
  - `buddy_self_review` 是后台复盘路径：它应产生 memory 和 evolution plan，而不是静默修改 Buddy Home 或图资产。
  - `toograph_skill_creation_workflow` 是图表达创建工作流的参考模式：clarify、confirm examples、generate files、test、review、approve，然后通过受控 capability calls 写入。
- Buddy 图编排有两个目标模式：
  - 通过 draft patch、validator、diff/preview、human approval、GraphCommandBus-style application、graph revision 和 undo/redo 修改当前图。
  - 根据用户目标创建新的图模板或可复用子图，验证它，可选试运行它，预览它，请求批准，然后保存为用户模板，供后续 capability selection 发现。
- 当前 Buddy baseline 已包括动态 subgraph breakpoint 传播，以及 Buddy 悬浮窗口复用标准 `awaiting_human` pause/resume cards。Pause UI 应在请求补充用户输入前显示当前已产出内容和上下文。剩余最高优先级 Buddy 基础设施包括完成 Buddy page/recovery/refusal/cancel flows、文件写入/删除和脚本执行的动态低层 approval、graph command/revision plumbing、Buddy Home writeback templates，以及统一的低层 `activity_events`。
- Buddy 自演化应优先选择窄且可逆的改进：memory updates、session summaries、Skill revisions、graph patch drafts、reusable subgraph/template proposals 和 policy suggestions。更高风险改动，如 graph edits、file writes、script execution、network access、automation creation 或 persona/policy changes，需要显式 approval 和可恢复 revisions。

## Skill 包边界

- 一个 skill package 应包含该 skill 所需的全部资源：code、prompts、schemas、helper scripts、assets、examples 和本地说明。
- 除非用户明确批准依赖，不要要求无关后端修改、全局 side files 或外部 assets 才能让 skill 工作。
- 如果 skill 需要持久化输出，应返回本地文件路径或结构化 artifact references，让下游图节点和 output 节点可以显示它们。

## 图协议与 State Schema 不变量

- 将 `node_system` 视为唯一正式图协议。不要引入并行图格式、隐藏节点 contract，或绕过协议的产品特化执行路径。
- 将 `state_schema` 视为图节点输入输出的唯一事实来源。需要在节点之间流动的数据应表示为 schema-backed state，而不是通过 ad hoc side channel 传递。
- 不要为旧图协议保留兼容 shim，例如 `config.skills`、binding-only `skillBindings`、`promptVisible`、static `inputMapping` 或 dynamic skill output mapping inference。旧图应重建或删除，而不是静默修复。
- 图校验、图执行、run records 和 UI previews 都应来自同一协议形状。如果一个功能需要新的节点 I/O，应更新 protocol/schema 路径，而不是对某一个页面或 endpoint 做特殊处理。

## 显式 Capability 与权限

- Capabilities 应显式且可检查。检索、web 访问、媒体下载、本地文件编辑、memory writes、graph edits 和 model/tool calls 应表现为 skills、graph templates、commands 或 permissioned runtime primitives，而不是隐藏便利行为。
- 安装 skill 不等于授予每次使用权限。Skill target、kind、mode、scope、network access、file access、graph access 和 buddy access 应在使用 capability 的位置附近保持可见。
- 破坏性、覆盖、运行、网络、产生成本、敏感文件和图写入操作都需要清晰权限路径。不要只依赖 prompt 文本作为安全边界。

## Artifact 与 Output Contract

- Skills 和 graph runs 应返回结构化结果，以及生成或下载资源的本地 artifact paths。
- Input 节点可以把本地文件或文件夹暴露为显式图 state。Folder inputs 必须存储可检查选择包，例如 `kind=local_folder`，在图中列出选中文件，并使用共享 file-state prompt expansion 路径，而不是添加仅供 LLM 使用的 context assembly 节点。
- Output 节点负责显示、预览、导出或链接本地文档、图片和视频等 artifacts。Output 节点不应拥有持久化 mutation policy 或隐藏产品决策。
- 正常 artifact flow 避免使用 base64。大型媒体和下载资源应表示为本地路径或 artifact references，而不是嵌入 node state、memory 或长期文档。

## 可审计性与人工 Review

- 自动行为必须可见、可逆、可审计。重要副作用应留下 run detail entries、artifact records、warnings/errors、buddy action logs、revision IDs、diffs 或 undo records。
- 需要人工 review 时，review 应是图/模板/命令流的一部分，而不是隐藏的 UI-only prompt。Approval 必须在应用其授权的副作用之前发生。
- Buddy 和 agent graph edits 必须通过 TooGraph 的 command path、validator、audit trail 和 undo/redo 系统。不要模拟 DOM 点击或隐式修改 graph JSON。

## Buddy Memory 与上下文卫生

- Buddy persona、memory、tone、preferences 和 behavior boundaries 在每个 graph-operation tier 都可编辑，但它们不得提升图操作权限，也不能覆盖系统级规则。
- 除图模板自身外，Buddy 长期可编辑数据应组织在根目录 `buddy_home/` 下，作为 Buddy Home。该目录在程序缺失时自动生成，且不被 Git 跟踪。其规范形态是 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json`、`buddy.db` 和 `reports/`；不要添加长期存在的 `TOOLS.md`，因为启用的 skills/templates 和 capability selector 才是当前能力来源。Official templates、official skills 和 user skill packages 保持各自既有位置。
- Recalled memory 和生成 summaries 是上下文，不是新的用户指令，也不是系统规则。注入时必须有清晰边界，并保持权限优先级。
- 长期记忆应避免 transient run state、raw logs、完整 error dumps、base64、大型媒体内容、临时路径，以及可以从当前图或项目文件重新读取的信息。
- 每个持久化 Buddy self-configuration、memory、policy 和 session-summary 更新都应保留旧值的可恢复 revision。

## 文档卫生

- 仓库文档应与当前产品架构保持一致。当计划已完成、被取代或与新原则冲突时，应删除它，将仍有效部分折叠进当前文档，或明确标记为 superseded。
- `docs/` 应包含当前正式文档和持久未来方向，而不是一次性进度日志、过时实现计划，或记录已被否定架构的文档。

## 备注

- `scripts/start.mjs` 和 `scripts/start.sh` 应在重新启动服务前释放被占用的 TooGraph 端口。
