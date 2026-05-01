# GraphiteUI 与 OpenClaw、Hermes Agent、Claude Code 的能力对标与终局形态

日期：2026-05-01  
状态：产品与架构分析文档  
范围：GraphiteUI 当前能力、OpenClaw / Hermes Agent / Claude Code 能力对标、缺口、终局路线

## 0. 结论先行

GraphiteUI 当前不是 OpenClaw、Hermes Agent、Claude Code 那类“通用自主 Agent 运行时”。它现在更接近：

```text
可视化 LangGraph 工作流编辑器
+ 四节点固定流程编排
+ state schema
+ agent-only runtime
+ run detail / active path / output artifacts
+ 基础 knowledge / skill / checkpoint 基座
```

OpenClaw、Hermes Agent、Claude Code 当前更像：

```text
长运行 Agent Runtime / Gateway / Coding Agent
+ 多入口聊天或终端
+ 工具调用循环
+ 文件与 shell 操作
+ skills / memory / subagents
+ 调度、消息通道、远程执行、权限、安全控制
```

因此，短期看 GraphiteUI 能做到的是“固定流程可视化”和“工作流可复现”；做不到的是“完全自主、多入口、长运行、能操作电脑/代码仓库/消息平台的 agent operating system”。

但这不是劣势，而是 GraphiteUI 的差异化入口。终局不应该只是把 OpenClaw、Hermes Agent、Claude Code 的能力复制一遍，而应该把它们共同的 Agent 能力抽象成 GraphiteUI 的三层：

1. **可视化工作流层**：把可复现任务画成 graph，清楚表达输入、状态、节点、分支、循环、输出。
2. **自主 Agent 协作层**：桌宠 Agent 承担开放式对话、自主规划、工具循环、帮用户搭图。
3. **运行时适配层**：GraphiteUI 可以原生执行 LangGraph，也可以托管或调用 Claude Code / Hermes / OpenClaw 类运行时，把它们的运行轨迹转成可观察的 timeline、state diff、tool call、artifact 和可沉淀 workflow。

最终理想姿态：

```text
GraphiteUI = 可视化 Agent Operating System / Agent Workbench

它既能像 Claude Code 一样真正做事，
也能像 Hermes / OpenClaw 一样长期在线、多入口协作，
还比它们多一层可视化、可解释、可复现、可审计的图形化流程资产。
```

关键判断：

- **不要把普通 Agent Node 变成黑盒自主 Agent**。那会破坏可复现性。
- **把自主性放在桌宠 Agent 和特殊 AgentLoop/Subgraph 中**。它们可以多轮调用工具，但必须可见、可暂停、可审计。
- **把成功的自主探索沉淀成固定 graph / workflow skill**。这才是 GraphiteUI 相比通用 agent runtime 的长期壁垒。

## 1. 对标对象定位

### 1.1 OpenClaw：自托管多入口 Agent Gateway

根据 OpenClaw 官方 GitHub 文档，OpenClaw 的核心是一个自托管 Gateway，把 Discord、Google Chat、iMessage、Matrix、Microsoft Teams、Signal、Slack、Telegram、WhatsApp、Zalo、WebChat、移动节点等入口连接到 AI coding agents。Gateway 是 sessions、routing、channel connections 的单一事实来源。

它强调：

- 任意 OS 上运行的自托管 Gateway。
- 多聊天渠道接入。
- 浏览器 Control UI。
- per-agent / per-workspace / per-sender session 隔离。
- 多 agent routing 和 channel binding。
- AgentSkills 兼容 skill 目录。
- `~/.openclaw/openclaw.json` JSON5 配置、schema 校验、热加载、last-known-good 恢复。
- allowlist、mention gating、DM policy、sandbox、cron、hooks/webhooks。
- 移动端节点、图片/音频/文档收发、camera / voice 工作流。

OpenClaw 的优势是“入口多、常驻、能从消息平台调度 agent”。它不是以可视化工作流为核心，而是以 Gateway + sessions + channels + tools 为核心。

### 1.2 Hermes Agent：自改进、记忆、工具与远程执行 Agent

Hermes Agent 官方 README 把它定位为 Nous Research 构建的 self-improving AI agent。它强调 built-in learning loop：从经验创建 skills、使用中改进 skills、主动持久化知识、搜索过去对话、跨会话建立用户模型。

它强调：

- CLI / TUI 和 Telegram、Discord、Slack、WhatsApp、Signal、Email 等 messaging gateway。
- 多模型 provider，不绑定单一模型。
- persistent memory、session search、user modeling。
- agent-created / agent-managed skills。
- built-in cron scheduler。
- subagents / delegation / parallel workstreams。
- web、terminal、file、browser、vision、image、TTS、memory、session search、cronjob、send_message、Home Assistant、MCP、RL 等 toolsets。
- local、Docker、SSH、Singularity、Modal、Daytona 等 terminal backend。
- skills hub、多 registry 来源、security scan、direct GitHub / URL / well-known skills。
- OpenClaw migration：导入 OpenClaw settings、memories、skills、API keys 等。

Hermes 的优势是“自我学习、记忆、工具丰富、运行环境多、Agent 能把经验沉淀为技能”。它也不是可视化流程编辑器，而是一个长期生长的代理运行时。

### 1.3 Claude Code：成熟的工程执行 Agent

Claude Code 官方文档把它描述为 agentic coding tool：读取代码库、编辑文件、运行命令、集成开发工具，可在 terminal、IDE、desktop app、browser 中使用。

它强调：

- 理解整个 codebase。
- 多文件编辑、命令执行、测试修复、git commit、PR、CI/code review。
- MCP 接入外部工具和数据源。
- CLAUDE.md、auto memory、skills、custom commands、hooks。
- subagents / agent teams。
- Agent SDK，可构建自定义 agent。
- 权限系统、permission modes、allow/deny/ask、hooks 参与权限评估。
- scheduling / routines / desktop scheduled tasks / loop。
- Remote Control、Slack、GitHub Actions、IDE、Web、Desktop 等多 surface。

Claude Code 的优势是“工程任务执行成熟度”：读代码、改代码、跑测试、修复失败、提交 PR、调用 MCP、用 hooks 做确定性约束。它的视觉化能力主要集中在 IDE/desktop diff/review，不是把整个任务流程显式画成可运行 graph。

### 1.4 GraphiteUI：可视化固定流程 + LangGraph 编排基座

GraphiteUI 当前正式能力来自 `docs/current_project_status.md`：

- Vue 前端主链：首页、编辑器、运行页、设置页。
- 编辑器：多 tab 工作区、graph 保存、校验、运行、State Panel、节点创建、数据流、顺序流、条件分支、minimap、运行状态反馈、active path 高亮。
- 四类节点：input / agent / condition / output。
- `node_system` 是唯一正式图协议，`state_schema` 是唯一正式数据源。
- Agent 节点支持模型选择、thinking、skills、输入引用、输出引用、temperature、preset。
- Condition 节点默认 true / false / exhausted，loop limit 1-10。
- Output 节点支持预览、展示模式、持久化。
- Run detail 支持 runs 列表、筛选、详情、polling、cycle iterations、output artifacts。
- 后端 FastAPI 提供 graphs / runs / templates / presets / settings / skills / knowledge / memories API。
- LangGraph runtime 使用 agent-only 语义：只有 agent 注册为 LangGraph node。
- 后端支持 LangGraph Python 源码导出接口。
- 后端具备 interrupt / checkpoint / resume 基础。
- Knowledge base 和 skills catalog 有真实接口。

GraphiteUI 的优势不是“自主行动范围大”，而是“图形化、流程明确、state 明确、运行路径可视、结果可复现”。这是它对标上述项目时最应该保留和放大的部分。

## 2. 能力总览矩阵

| 能力域 | OpenClaw | Hermes Agent | Claude Code | GraphiteUI 当前 | GraphiteUI 终局目标 |
| --- | --- | --- | --- | --- | --- |
| 可视化流程编排 | 弱，主要是 dashboard/config/session | 弱，主要是 TUI/CLI/gateway | 中，IDE/desktop diff 和任务界面 | 强，画布和四节点 graph | 极强，图 + trace + subgraph + agent timeline |
| 固定 workflow 可复现 | 中，靠配置和 agent 约束 | 中，靠 skill/cron/toolsets | 中，靠 prompt/hooks/CI | 强，graph/state/node 显式 | 极强，版本化 graph、skill、state、artifact |
| 自主 tool loop | 强 | 强 | 强 | 弱，Agent Node 当前一次 skill + 一次模型 | 桌宠 Agent 和 AgentLoop/Subgraph 支持 |
| 多入口消息通道 | 强 | 强 | 强，含 web/desktop/Slack/remote/channels | 弱，主要是 Web UI | Gateway / Channel Plane |
| Coding agent 能力 | 取决于后端 coding agent | 有 terminal/file/patch/code execution | 强 | 弱 | 通过 Coding Tool Runtime / Claude Code adapter |
| Skills | 强，AgentSkills + ClawHub + allowlist | 强，agent-managed skills + hubs | 强，SKILL.md + plugins + subagents | 初步 catalog，待重构 | 原生 skill.json + SKILL.md + marketplace + adapter |
| Memory | 有 sessions/memory/workspace | 强，核心卖点 | 有 auto memory / project memory | API 有基座，产品未完整 | Graph/Workspace/Companion/Procedural memory |
| Scheduler / Cron | 强 | 强 | 强，routines/scheduled tasks | 无正式产品化 | Trigger/Scheduler/Job Queue |
| Subagents / Delegation | 有多 agent routing | 强，delegate/parallel | 强，subagents/agent teams | 固定多 agent graph 可表达，动态 delegation 无 | 固定 graph + 动态 companion subagents |
| MCP / external tools | 可通过插件/后端 agent | 支持 MCP | 强，核心扩展机制 | 暂无正式 MCP 层 | MCP Registry + Tool Adapter |
| Sandbox / Permissions | 有 sandbox、allowlist、DM policy | 多 terminal backend + container hardening | 强权限系统 + hooks | 基础 graph validation，工具权限弱 | 权限、secret、sandbox、approval 一体化 |
| Observability | Gateway/session/dashboard | TUI/tool output/session search | transcript/diff/hooks/logs | run detail / active path 初步强 | 最强项：可视化 trace、state diff、tool call、artifact |
| 可沉淀为资产 | skills/config | skills/memory | CLAUDE.md/skills/hooks/commands | graph/templates/runs | Graph + Skill + Trace + Memory 全资产化 |

## 3. 逐项对标：当前能做什么、做不到什么、要补什么

### 3.1 多入口与 Gateway

外部项目能力：

- OpenClaw 的核心是 Gateway：多聊天渠道、WebChat、移动节点、channel plugins、per-sender sessions。
- Hermes 也有 messaging gateway，可从 Telegram、Discord、Slack、WhatsApp、Signal、Email 等入口交互。
- Claude Code 支持 terminal、IDE、desktop、web、Slack、Remote Control、channels。

GraphiteUI 当前：

- 主要入口是 Web UI：编辑器、运行页、设置页。
- 没有 Telegram/Discord/Slack/WhatsApp/iMessage/Email 等消息入口。
- 没有长运行 Gateway 统一管理 channels、sessions、routing。

当前能做到：

- 用户在 Web UI 里构建和运行固定工作流。
- 后端 API 可以作为未来 Gateway 或桌宠 Agent 的调用面。

做不到：

- 用户从手机消息里唤醒 GraphiteUI Agent。
- 外部 webhook / chat message 自动触发某张 graph。
- 每个渠道、每个 sender 维护独立 session 和权限。

要补的能力：

- `ChannelGateway`：统一接收 channel events。
- `SessionRouter`：按 channel/account/sender/graph/companion 绑定 session。
- `Trigger` 系统：manual、webhook、cron、message、file watcher。
- `Delivery` 系统：把运行结果发回 chat、webhook、desktop notification。
- 入口权限：DM allowlist、group mention gating、pairing code。

GraphiteUI 的优势方向：

入口不只把消息转给 agent，而是可以把消息转成“运行某张可视化 graph”或“让桌宠 Agent 规划/修改 graph”。这比纯 Gateway 更容易解释行为。

### 3.2 自主 tool loop

外部项目能力：

- Claude Code、Hermes、OpenClaw 类系统都允许 agent 多轮调用工具：读文件、跑命令、查网页、发消息、调用子代理、修改状态。
- Hermes 的 toolsets 明确包含 web、terminal、file、browser、media、delegation、memory、cron、messaging 等。
- Claude Code 的核心就是读代码、编辑文件、运行命令、根据反馈继续。

GraphiteUI 当前：

- Agent Node 当前不是动态 tool loop。
- 当前 Agent Node 大致是：执行绑定 skills -> 一次模型生成 -> 写 state。
- 这适合固定 workflow，不适合开放式 autonomous agent。

当前能做到：

- 固定工具前置，例如知识库检索后生成答案。
- 固定步骤 graph，例如 A 生成、B 评估、condition 决定是否回到 A。

做不到：

- 模型运行时自己决定调用哪个工具。
- 工具调用次数运行时动态变化。
- 工具失败后 agent 继续选择其他工具。
- 一个 Agent Node 内部执行复杂多轮行动并完整展示。

要补的能力：

- `CompanionAgentRuntime`：桌宠 Agent 的动态 tool loop。
- `AgentLoopRuntime`：如果允许在 Editor 内使用，必须是特殊节点或 subgraph。
- `ToolCallTimeline`：每轮模型、工具、输入、输出、错误、停止原因。
- `BudgetPolicy`：max turns、max cost、timeout、allowed tools。
- `ApprovalPolicy`：高风险工具调用前确认。

GraphiteUI 的原则：

普通 Agent Node 保持固定输入输出；动态 tool loop 放在桌宠 Agent 或显式 AgentLoop/Subgraph。这样既能承载 Claude Code / Hermes 的自主性，又不破坏固定图的可复现性。

### 3.3 可视化工作流与可复现性

外部项目能力：

- OpenClaw 和 Hermes 有 dashboard/TUI/config/session，但不是以工作流图为核心。
- Claude Code 有 IDE/desktop diff review、transcript、agent teams，但不是把每个任务显式编排成 graph。

GraphiteUI 当前：

- 这是 GraphiteUI 最强项。
- 四节点 graph、state schema、flow edges、conditional routes、run detail、active path 都已经存在。
- LangGraph runtime 使用 agent-only 语义，运行记录只显示真实 agent 节点。

当前能做到：

- 把固定流程画出来。
- 让用户理解每一步读什么、写什么、走哪条边。
- 输出 artifacts。
- 后续可导出 LangGraph Python。

做不到：

- 把外部 agent runtime 的 tool loop 自动可视化成 graph。
- 从一次成功 autonomous run 自动沉淀成可复现 workflow。
- 对每个模型 prompt、skill 版本、tool schema、state diff 做完整版本化。

要补的能力：

- `TraceToGraph`：把 tool call trace 抽象为候选 workflow。
- `Run Replay`：按 checkpoint/state/artifact 回放。
- `Graph Versioning`：graph、skill、model、prompt、state schema 版本绑定。
- `State Diff Viewer`：节点前后 state 对比。
- `Determinism Report`：哪些步骤可复现，哪些步骤依赖模型随机性/外部网络/当前时间。

GraphiteUI 的优势方向：

Claude Code 和 Hermes 能完成任务；GraphiteUI 应该让用户看懂任务为什么完成、哪一步完成、下次如何稳定复用。

### 3.4 Skills / 插件 / 能力包

外部项目能力：

- Claude Code skills 使用 `SKILL.md`，支持自动加载、直接 slash command、插件 skills、subagent 执行、动态上下文。
- OpenClaw 使用 AgentSkills-compatible skill folders，支持 workspace/project/personal/managed/bundled/extra dirs 优先级、agent allowlists、ClawHub、gating、security scan、Skill Workshop。
- Hermes 使用 progressive disclosure skills，支持 agent-managed skills、Skills Hub、official/skills.sh/well-known/GitHub/ClawHub/LobeHub/direct URL 等来源。

GraphiteUI 当前：

- 有 skills definitions 和 catalog 接口。
- Agent 节点可以选择 skills。
- 但当前 skill 系统还混合了发现、安装、启停、运行注册、兼容说明等概念。
- 已有新方向：`skill.json` 做 GraphiteUI runtime 真相源，`SKILL.md` 保留为模型/人类说明。

当前能做到：

- 基础 skill 列表、启停、agent 绑定。
- 知识库 skill 的约束校验。

做不到：

- 导入 Claude Code / OpenClaw / Hermes skills 后自动分级管理。
- 根据 Agent Node input/output schema 安全运行 skill。
- Skill marketplace / hub / security scan / quarantine。
- Agent 自己创建 skill 后等待用户审核。
- per-agent / per-graph skill allowlist、权限、secret 注入。

要补的能力：

- `SkillPackage`：
  - `skill.json`：机器可读 manifest。
  - `SKILL.md`：模型说明。
  - `scripts/`、`references/`、`assets/`、`tests/`。
- `targets`：
  - `agent_node`
  - `companion`
  - `shared`
- `SkillImportPipeline`：
  - 读取外部 skill。
  - LLM 判断适配性。
  - 生成 manifest draft。
  - 用户确认。
  - schema 校验。
  - health check。
  - 安全扫描。
- `SkillRuntime`：
  - input/output mapping。
  - 权限声明。
  - secret injection。
  - sandbox。
  - artifacts。
  - run logs。
- `SkillHub`：
  - 官方源。
  - GitHub 源。
  - direct URL。
  - 本地目录。
  - 安全审计。

GraphiteUI 的优势方向：

Claude Code / Hermes / OpenClaw 的 skills 更偏 agent runtime 的“说明书和工具包”。GraphiteUI 应该在此之上增加“可视化绑定、强 schema、运行记录、graph 级依赖锁定”。

### 3.5 Memory 与自我学习

外部项目能力：

- Hermes 把 memory 和 self-improving loop 作为核心：跨会话记忆、session search、用户模型、agent-created skills。
- Claude Code 有 auto memory、CLAUDE.md、project memory。
- OpenClaw 有 sessions、workspace files、memory folder、per-agent workspace。

GraphiteUI 当前：

- 后端有 memories API 基座。
- 产品层 memory 正式写入、召回和展示仍在路线图。
- Editor graph 当前应优先保持显式输入和可复现，不应默认受隐式长期记忆影响。

当前能做到：

- 可以把 knowledge base 作为显式输入。
- 未来可以让桌宠读取当前 graph、runs、settings。

做不到：

- 桌宠跨会话记住用户偏好。
- agent 从失败和成功中创建 procedural skill。
- session search。
- memory audit、forget、scope、consent。

要补的能力：

- `MemoryStore`：
  - user。
  - workspace。
  - project。
  - graph。
  - run。
  - companion。
- `MemoryPolicy`：
  - 什么能自动写。
  - 什么必须确认。
  - 什么永不写。
  - 什么时候注入。
- `ProceduralMemory`：
  - 从成功 workflow / run trace 生成 skill draft。
  - 用户批准后进入 Skill Catalog。
- `MemoryAuditUI`：
  - 查看、搜索、删除、导出。

GraphiteUI 的原则：

桌宠 Agent 可以有记忆；固定 workflow 默认不应隐式读取长期记忆。若某张图要用记忆，必须把 memory 作为显式 state 或显式 skill 输入。

### 3.6 Scheduler、Cron、Webhook 与后台任务

外部项目能力：

- OpenClaw 有 Gateway cron：持久 job definitions、runtime state、background task records、webhook hooks。
- Hermes 有 built-in cron scheduler，可把结果投递到任意平台。
- Claude Code 有 routines、desktop scheduled tasks、`/loop`、GitHub events/API triggers。

GraphiteUI 当前：

- 可以手动运行 graph。
- 没有正式 scheduler/job queue。
- 没有 webhook trigger。
- 没有后台任务投递通道。

当前能做到：

- 手动点击运行工作流。
- run detail 查看运行结果。

做不到：

- 每天自动运行新闻分析。
- Webhook 触发某张 graph。
- 运行结束后发消息给用户。
- 长任务队列、重试、取消、恢复、通知。

要补的能力：

- `Trigger`：
  - cron。
  - interval。
  - webhook。
  - channel message。
  - file watcher。
  - GitHub event。
- `JobQueue`：
  - pending/running/succeeded/failed/canceled。
  - retry/timeout/cancel。
  - resume/checkpoint。
- `Delivery`：
  - Web UI。
  - desktop notification。
  - email。
  - webhook。
  - chat channel。
- `Run Policy`：
  - concurrency。
  - idempotency。
  - retention。
  - artifact cleanup。

GraphiteUI 的优势方向：

用户不是只写一个 cron prompt，而是把 cron 绑定到一张可视化 graph。任务每天如何运行、每步产物是什么，都能被审计和复现。

### 3.7 Coding Agent 能力

外部项目能力：

- Claude Code 强在代码任务：读代码库、编辑文件、运行命令、修复测试、git commit、PR、CI/code review。
- Hermes 有 terminal/file/patch/code execution/browser/delegation 等工具。
- OpenClaw 可连接 coding agents，且有 coding-agent skill / Claude Code plugin snapshot 等机制。

GraphiteUI 当前：

- 不具备成熟 coding agent runtime。
- 没有文件系统读写工具、patch 工具、shell sandbox、测试运行闭环。
- 当前更像 workflow builder，不是代码修改 agent。

当前能做到：

- 可以分析代码文本或 diff，生成建议。
- 可以通过未来 skill 调用固定脚本。

做不到：

- 像 Claude Code 一样自主读文件、改文件、跑测试、修复失败、提交 PR。
- 多 agent 并行修改不同模块。
- 工作树隔离、patch 审批、CI 自动修复。

要补的能力：

- `WorkspaceFileTool`：受权限控制的 read/search/write/patch。
- `ShellTool`：local/docker/ssh sandbox。
- `GitTool`：status/diff/commit/branch/PR。
- `TestRunnerTool`：测试命令白名单、失败解析。
- `PatchReviewUI`：可视化 diff 审批。
- `CodingAgentAdapter`：
  - Claude Code adapter。
  - Codex adapter。
  - Hermes terminal backend adapter。

GraphiteUI 的终局方式：

不要从零重写 Claude Code。更现实的是：

1. 原生提供基础 file/shell/git tool。
2. 支持把 Claude Code 作为一个执行 backend。
3. 把 Claude Code 的 transcript、diff、tool calls、commits 回流到 GraphiteUI run detail。
4. 把成功修复流程沉淀为可复用 workflow 或 skill。

### 3.8 MCP 与外部工具生态

外部项目能力：

- Claude Code 把 MCP 作为连接外部数据源和工具的核心机制。
- Hermes 支持 MCP server tools。
- OpenClaw 可通过插件和后端 agent 扩展工具。

GraphiteUI 当前：

- 没有正式 MCP registry。
- 没有 MCP resource / tool / prompt 的 UI。
- 只有项目内 API、skills、knowledge。

当前能做到：

- 内置知识库检索。
- 后端可扩展新的 skill。

做不到：

- 用户添加一个 MCP server 后，GraphiteUI 自动出现工具、资源、prompt。
- Agent Node 或桌宠 Agent 绑定 MCP tool。
- 对 MCP tool 做权限、schema、日志、secret 管理。

要补的能力：

- `MCPRegistry`：
  - server config。
  - health check。
  - tools/resources/prompts discovery。
- `MCPPermissionPolicy`：
  - tool allow/deny/ask。
  - per graph / per companion / per skill scope。
- `MCPResourcePicker`：
  - 在 UI 中选择 issue、doc、schema、design file。
- `MCPToolAdapter`：
  - 将 MCP tool 映射为 Agent Node Skill 或 Companion Tool。

GraphiteUI 的优势方向：

MCP 工具不应该只是藏在 agent prompt 里，而应该能被画进 graph、绑定 state、记录输入输出。

### 3.9 Subagents、Agent Teams 与多 agent 协作

外部项目能力：

- Claude Code 支持 subagents / agent teams，可配置 tools、model、permissions、maxTurns、skills、memory、background、isolation 等。
- Hermes 支持 delegate_task、isolated subagents、parallel workstreams。
- OpenClaw 支持多 agent routing、不同 workspace、channel binding。

GraphiteUI 当前：

- 固定多 agent graph 可以表达：多个 Agent Node 顺序或分支协作。
- 动态 delegation 不支持。
- 没有 agent team runtime。

当前能做到：

```text
input -> agent_planner -> agent_worker_a -> agent_reviewer -> output
```

或者：

```text
agent_router -> condition -> agent_a / agent_b / agent_c
```

做不到：

- 运行时 spawn 子代理。
- 子代理动态并行处理任务。
- 子代理隔离工作区。
- lead agent 分派任务、合并结果。

要补的能力：

- Editor 层：
  - 固定 multi-agent graph。
  - batch/map/reducer/join。
  - subgraph/workflow skill。
- Companion 层：
  - dynamic subagents。
  - delegation tool。
  - background task。
  - agent team trace。
- Runtime 层：
  - worker isolation。
  - per-agent permissions。
  - result aggregation。

GraphiteUI 的原则：

固定团队画在图上；动态团队放在桌宠 Agent 或 AgentLoop/Subgraph 里，并展示运行 trace。

### 3.10 权限、安全、沙箱与审批

外部项目能力：

- Claude Code 有 permission modes、allow/deny/ask、MCP permissions、subagent permissions、hooks 参与权限评估。
- OpenClaw 有 DM policy、allowlist、mention gating、sandboxing、strict config validation、skill security scan、last-known-good recovery。
- Hermes 有 terminal backend、Docker/SSH/Singularity/Modal/Daytona、container hardening、toolset enable/disable、安全 setup。

GraphiteUI 当前：

- 有 graph validator。
- 有 skill catalog 状态校验。
- 有知识库 skill 绑定约束。
- 但工具权限、安全沙箱、secret 管理、审批策略还不完整。

当前能做到：

- 校验 graph 结构是否合法。
- 防止不健康/未注册/非 agent_node target 的 skill 绑定到 agent。

做不到：

- 对 shell/file/network/mcp/message-send 做细粒度审批。
- 沙箱运行 tool。
- Secrets 注入和红action。
- 高风险操作审计。
- Permission hook。

要补的能力：

- `PermissionPolicy`：
  - tool/action/skill/node/graph 维度。
  - allow/deny/ask。
  - user/workspace/project scope。
- `SecretStore`：
  - provider keys。
  - skill env。
  - MCP auth。
  - redaction。
- `SandboxRuntime`：
  - local。
  - Docker。
  - SSH。
  - cloud sandbox。
- `ApprovalCenter`：
  - 待审批工具调用。
  - 待审批 graph 修改。
  - 待审批文件 patch。
  - 待审批外部发送。
- `PolicyHooks`：
  - PreToolUse。
  - PostToolUse。
  - RunStart。
  - RunEnd。

GraphiteUI 的优势方向：

权限不应该只在配置文件里，而应该在 UI 中可解释：这张图能做什么、这个 skill 能访问什么、这次运行请求了什么权限、用户批准了什么。

### 3.11 Observability、Run Detail 与可审计性

外部项目能力：

- Claude Code 有 transcript、diff、hooks、CI logs、desktop review。
- Hermes 有 TUI、streaming tool output、session search、cron run logs。
- OpenClaw 有 Gateway dashboard、sessions、config、diagnostics、cron/background task records。

GraphiteUI 当前：

- 已经有 run detail、node executions、active path、cycle iterations、output artifacts。
- 这是 GraphiteUI 对标时最有潜力超越的领域。

当前能做到：

- 看 graph 跑到哪里。
- 看真实执行过哪些 agent。
- 看 output preview / artifacts。

做不到：

- 完整 tool call trace。
- skill 内部步骤展开。
- state diff。
- prompt/model/tool/schema 版本追踪。
- token/cost/latency 汇总。
- 外部 backend transcript 回流。

要补的能力：

- `EventTimeline`：
  - node started/completed/failed。
  - model request/response。
  - tool call。
  - skill step。
  - branch selected。
  - human edit。
  - approval。
  - artifact created。
- `StateSnapshot` / `StateDiff`。
- `Trace Importer`：
  - Claude Code transcript。
  - Hermes tool logs。
  - OpenClaw session logs。
  - LangGraph checkpoints。
- `Run Report`：
  - 成本。
  - token。
  - 耗时。
  - 失败点。
  - 可复现风险。

GraphiteUI 的终局优势：

别人让 Agent 做事；GraphiteUI 让 Agent 做事的过程变成可理解、可回放、可复用的资产。

## 4. 终局产品形态：GraphiteUI 作为 Visual Agent Operating System

### 4.1 一句话定义

GraphiteUI 的终局不是“又一个 Claude Code / Hermes / OpenClaw”，而是：

```text
一个可视化 Agent Operating System：
用 graph 表达固定流程，
用桌宠 Agent 处理开放式自主任务，
用适配器承载外部 agent runtime，
用 trace 和 state 把黑盒行动变成可审计资产。
```

### 4.2 核心分层

#### A. Visual Workflow Layer

负责：

- 四节点 graph。
- state schema。
- condition / loop / output artifact。
- batch/map/reducer/join。
- subgraph/workflow skill。
- LangGraph Python export。

对标优势：

- OpenClaw/Hermes/Claude Code 缺少这种明确的可视化 workflow asset。

#### B. Companion Agent Layer

负责：

- 用户对话。
- 解释当前图。
- 规划工作流。
- 自动生成 graph draft。
- 调用 GraphCommandBus 修改图。
- 多轮工具调用。
- 动态 subagents。
- 长期记忆。

对标对象：

- Hermes 的长期记忆和自改进。
- OpenClaw 的随时可唤醒。
- Claude Code 的任务执行与 agent teams。

#### C. Runtime Adapter Layer

负责：

- LangGraph native runtime。
- Claude Code adapter。
- Hermes adapter。
- OpenClaw gateway adapter。
- Shell/Python/Node workflow skill runtime。
- MCP tool runtime。

关键目标：

GraphiteUI 不一定要重写所有 agent runtime，而是要能“承载”它们：

- 启动它们。
- 给它们输入。
- 限制它们权限。
- 读取它们 trace。
- 展示它们运行过程。
- 把结果写回 state/artifact。
- 把成功经验沉淀为 graph/skill。

#### D. Skill And Tool Registry

负责：

- Agent Node Skill。
- Companion Skill。
- Tool Skill。
- Workflow Skill。
- Adapter Skill。
- Context/Profile Skill。
- MCP tools。
- 外部 skill import。
- security scan。
- health check。

对标对象：

- Claude Code Skills。
- Hermes Skills Hub。
- OpenClaw ClawHub / AgentSkills。

GraphiteUI 增强点：

- `skill.json` 强 schema。
- `SKILL.md` 模型说明。
- 可视化 input/output mapping。
- graph 级版本锁定。
- run detail 中记录 skill step。

#### E. Memory And Learning Plane

负责：

- 用户偏好。
- workspace memory。
- graph memory。
- run lessons。
- procedural skill creation。
- memory audit。

对标对象：

- Hermes self-improving loop。
- Claude Code auto memory。
- OpenClaw workspace memory。

GraphiteUI 增强点：

- 固定 graph 默认不隐式读取长期记忆。
- 记忆写入必须可见、可审计、可删除。
- 成功 run 可以转成 skill draft 或 workflow template。

#### F. Channel And Automation Plane

负责：

- Web UI。
- Desktop。
- Telegram/Discord/Slack/Email/Webhook。
- Scheduler。
- GitHub events。
- File watcher。
- Run delivery。

对标对象：

- OpenClaw Gateway。
- Hermes messaging gateway。
- Claude Code routines/channels/remote/slack。

GraphiteUI 增强点：

- 每个 trigger 绑定的是可视化 graph 或桌宠任务。
- 外部消息触发后能看到完整运行图和 trace。

#### G. Security And Governance Plane

负责：

- permissions。
- secrets。
- sandbox。
- approval。
- policy hooks。
- audit logs。
- skill quarantine。
- external content trust boundary。

对标对象：

- Claude Code permissions/hooks。
- Hermes container backends。
- OpenClaw allowlists/sandbox/security scan。

GraphiteUI 增强点：

- 权限和审批作为 UI 一等能力，而不是只在配置文件里。
- 每次运行能解释“为什么允许这个工具调用”。

## 5. GraphiteUI 对三个项目的逐个承载方案

### 5.1 承载 OpenClaw 类能力

OpenClaw 代表的是：

```text
多入口 Gateway + 长运行 Agent + channel/session routing + skill allowlists + cron/hooks
```

GraphiteUI 当前缺：

- Gateway。
- channel plugins。
- session routing。
- DM/group allowlist。
- mobile nodes。
- cron/webhooks。
- per-agent workspace。

GraphiteUI 可承载方式：

1. 做 `ChannelGateway`，接收消息平台事件。
2. 将 incoming message route 到：
   - 某个 Companion Agent session。
   - 某张 graph run。
   - 某个 OpenClaw adapter session。
3. 支持 OpenClaw config import：
   - agents。
   - skills。
   - channels。
   - cron jobs。
   - allowlists。
4. 在 GraphiteUI UI 中展示：
   - channels。
   - sessions。
   - agents。
   - skills。
   - cron。
   - recent tasks。
5. 将 OpenClaw 的 session logs / tool calls 映射到 GraphiteUI event timeline。

GraphiteUI 的超越点：

- OpenClaw 是“消息发给 agent”；GraphiteUI 可以是“消息触发可视化 workflow”。
- 用户可以看到自动化背后的 graph，而不是只看到聊天结果。

### 5.2 承载 Hermes Agent 类能力

Hermes 代表的是：

```text
self-improving Agent + persistent memory + agent-managed skills + rich tools + remote terminal backends + scheduler
```

GraphiteUI 当前缺：

- persistent memory 产品闭环。
- agent-created skill。
- rich toolsets。
- terminal backends。
- skill hubs。
- scheduler。
- delegation。

GraphiteUI 可承载方式：

1. 做 `CompanionAgentRuntime`，支持 Hermes 类多轮工具调用。
2. 做 `MemoryStore`，区分 user/workspace/graph/run/procedural。
3. 做 `SkillLearningPipeline`：
   - 从 run trace 提取经验。
   - 生成 skill draft。
   - 用户审查。
   - 通过 health check 后入库。
4. 做 terminal backend adapters：
   - local。
   - docker。
   - ssh。
   - cloud sandbox。
5. 做 Hermes adapter：
   - 调用 Hermes CLI/gateway。
   - 导入 Hermes skills/memory。
   - 接收 Hermes tool logs。
   - 将 Hermes cron 映射成 GraphiteUI trigger。

GraphiteUI 的超越点：

- Hermes 的自改进主要沉淀为 memory/skill；GraphiteUI 可以进一步沉淀为可视化 graph/template/subgraph。
- 用户不只是让 agent 学会做某件事，还能看到它学到的流程长什么样。

### 5.3 承载 Claude Code 类能力

Claude Code 代表的是：

```text
工程代码 Agent + 文件编辑 + shell + git + MCP + hooks + permissions + subagents + scheduling
```

GraphiteUI 当前缺：

- 文件工具。
- shell 工具。
- patch/diff review。
- git/PR/CI 集成。
- MCP registry。
- hooks。
- subagents。
- coding-specific permissions。

GraphiteUI 可承载方式：

1. 做 `CodingWorkspace`：
   - 绑定 repo。
   - 读取文件树。
   - 搜索代码。
   - 展示 diff。
2. 做 `ClaudeCodeAdapter`：
   - 从 GraphiteUI 发起 Claude Code task。
   - 限制 workdir、tools、permissions。
   - 接收 transcript、tool calls、diff。
   - 用户在 GraphiteUI 中审批 patch。
3. 做 `MCPRegistry`：
   - 管理 MCP servers。
   - 把 MCP tools 转成 GraphiteUI tool/skill。
4. 做 `HookPolicy`：
   - PreToolUse。
   - PostToolUse。
   - Stop。
   - SessionStart。
5. 做 coding workflow templates：
   - issue triage。
   - test failure analysis。
   - PR review。
   - dependency audit。
   - docs sync。

GraphiteUI 的超越点：

- Claude Code 很强，但用户看到的是 transcript/diff；GraphiteUI 可以把“修 bug 的流程”沉淀成 graph：

```text
input issue
-> inspect related files
-> propose plan
-> edit patch
-> run tests
-> if failed, fix
-> human review
-> commit/PR
```

即使底层执行由 Claude Code 完成，上层仍然可以由 GraphiteUI 管理、可视化、复用。

## 6. 终局路线图

### P0：明确产品边界

目标：

- Editor：固定流程、可复现、可审计。
- Companion：自主决策、多轮工具、帮用户搭图。
- Adapter：承载外部 agent runtime。

产物：

- 本文档。
- LangGraph 能力分析文档。
- Skill taxonomy。
- Companion graph orchestration 设计。

### P1：Permission / Secret / Tool 基座

先不要急着接几十个工具。先把治理层做对：

- `ToolRegistry`
- `PermissionPolicy`
- `SecretStore`
- `ApprovalCenter`
- `AuditLog`
- `ToolCallTimeline`

原因：

OpenClaw/Hermes/Claude Code 的共同风险都是工具权限过大。GraphiteUI 如果要承载它们，必须先有统一权限底座。

### P2：原生 Skill Runtime

目标：

- `skill.json` 机器可读。
- `SKILL.md` 保留。
- Agent Node Skill 强 schema。
- Companion Skill 宽 schema 但低权限。
- Skill import / health check / security scan。

对标：

- Claude Code Skills。
- Hermes Skills Hub。
- OpenClaw AgentSkills / ClawHub。

GraphiteUI 增强：

- input/output mapping。
- graph dependency lock。
- run detail。

### P3：Companion Agent Runtime

目标：

- 桌宠 Agent 能读取当前 graph。
- 能解释、规划、生成 graph draft。
- 能调用 GraphCommandBus。
- 能多轮调用工具。
- 能在审批后修改图。

对标：

- Hermes long-running agent。
- OpenClaw personal assistant。
- Claude Code lead agent。

GraphiteUI 增强：

- 自主行动会落到画布和 command history 中。

### P4：Scheduler / Trigger / Job Queue

目标：

- cron。
- webhook。
- channel message。
- GitHub event。
- file watcher。
- background job。
- retry/resume/cancel。
- delivery。

对标：

- OpenClaw cron/hooks。
- Hermes cron。
- Claude Code routines/scheduled tasks。

GraphiteUI 增强：

- Trigger 绑定可视化 graph。

### P5：MCP / External Tool / Adapter

目标：

- MCP server registry。
- MCP tool/resource/prompt discovery。
- Tool permission。
- Agent Node Skill 映射。
- Companion Tool 映射。

对标：

- Claude Code MCP。
- Hermes MCP。

GraphiteUI 增强：

- MCP tools 可被画入 graph。

### P6：Coding Agent 承载

目标：

- 文件树。
- read/search/patch。
- shell sandbox。
- git/PR/CI。
- diff review。
- Claude Code adapter。

对标：

- Claude Code。
- Hermes terminal/file/patch。
- OpenClaw coding agent backend。

GraphiteUI 增强：

- coding task 可视化 workflow 和 run detail。

### P7：Memory / Self-improvement

目标：

- memory store。
- memory policy。
- session search。
- procedural skill draft。
- trace-to-skill。
- trace-to-graph。

对标：

- Hermes self-improving loop。
- Claude Code auto memory。

GraphiteUI 增强：

- 经验不只变成 skill，也能变成 graph/template。

### P8：Agent Runtime Adapters

目标：

- Claude Code adapter。
- Hermes adapter。
- OpenClaw adapter。
- Generic CLI agent adapter。
- LangGraph native runtime。

每个 adapter 需要统一协议：

```text
start_task(input, policy)
stream_events()
request_approval()
collect_artifacts()
cancel()
resume()
summarize_trace()
```

GraphiteUI 不需要每次都重写底层能力。它可以让外部 agent 做事，同时拥有统一的可视化和治理层。

### P9：Visual Agent OS

最终形态：

- 用户从 Web、桌面、手机、Slack/Telegram 等入口发起任务。
- 桌宠 Agent 判断是：
  - 直接回答。
  - 运行某张 graph。
  - 修改某张 graph。
  - 调用 Claude Code/Hermes/OpenClaw adapter。
  - 创建一个新的 workflow。
- 所有行为都有：
  - 权限。
  - trace。
  - state。
  - artifact。
  - replay。
  - audit。
  - 可沉淀资产。

## 7. 风险与取舍

### 7.1 不要过早追求全能

OpenClaw/Hermes/Claude Code 的能力面都很宽。如果 GraphiteUI 同时追多入口、工具、memory、coding、MCP、scheduler、marketplace，容易失焦。

优先级应该是：

1. 可视化 workflow 继续变强。
2. Skill runtime 和权限治理先打稳。
3. Companion Agent 作为自主能力入口。
4. 再接外部 runtime 和 channels。

### 7.2 不要牺牲可复现性

如果 Agent Node 默认拥有无限 tool loop，GraphiteUI 就会变成另一个黑盒 agent UI。

必须坚持：

- 固定 workflow 显式化。
- 动态自主行为 trace 化。
- 成功探索资产化。

### 7.3 不要默认开放本地系统权限

OpenClaw、Hermes、Claude Code 都说明了一个事实：Agent 越能做事，越需要权限治理。

GraphiteUI 要承载这些能力，必须先做：

- 沙箱。
- 审批。
- allow/deny/ask。
- secrets。
- audit。
- skill scan。
- external content trust boundary。

### 7.4 不要把所有外部 skill 直接变成 Agent Node Skill

通用 skill 适合 Companion，不一定适合固定 workflow。要加入 Agent Node，必须补：

- manifest。
- inputs。
- outputs。
- permissions。
- runtime。
- health check。
- failure mode。

## 8. 最终判断

GraphiteUI 当前和 OpenClaw、Hermes Agent、Claude Code 的差距主要在“自主运行时”和“工具生态”：

- 缺多入口 Gateway。
- 缺动态 tool loop。
- 缺 coding/file/shell/MCP。
- 缺 scheduler/job queue。
- 缺 memory/self-improvement。
- 缺 subagents/delegation。
- 缺强权限/沙箱/secret。

但 GraphiteUI 已经拥有这些项目不以其为核心的能力：

- 可视化 graph。
- 显式 state schema。
- 固定 workflow。
- 条件分支和有界循环。
- LangGraph agent-only runtime。
- run detail 和 active path。
- output artifacts。
- 未来可导出 LangGraph 源码。

所以终局路线不是“GraphiteUI 追着它们补一个个功能”，而是：

```text
用 GraphiteUI 的可视化与可复现性，
包住 OpenClaw/Hermes/Claude Code 类 agent runtime 的自主执行力。
```

当 GraphiteUI 能做到下面这件事，就真正形成了差异化：

1. 用户用自然语言告诉桌宠一个目标。
2. 桌宠决定是运行已有 graph、创建新 graph、还是调用外部 agent runtime。
3. 如果调用外部 runtime，GraphiteUI 记录它的工具调用、文件修改、消息发送、模型输出。
4. 用户能在画布和 timeline 中看懂整个过程。
5. 成功的过程能一键转成 workflow / skill / template。
6. 下次运行可以更固定、更少自主、更可复现。

这就是 GraphiteUI 相比 OpenClaw、Hermes Agent、Claude Code 的终极价值：不仅能让 Agent 做事，还能把 Agent 做事的方法变成用户看得懂、改得动、跑得稳的可视化资产。

## 9. 资料来源

- OpenClaw GitHub docs index：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/index.md`
- OpenClaw Agents CLI：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/cli/agents.md`
- OpenClaw Configuration：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/gateway/configuration.md`
- OpenClaw Skills：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/tools/skills.md`
- OpenClaw Skills Config：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/tools/skills-config.md`
- OpenClaw Cron Jobs：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/automation/cron-jobs.md`
- OpenClaw Sandboxing：`https://raw.githubusercontent.com/openclaw/openclaw/main/docs/gateway/sandboxing.md`
- Hermes Agent README：`https://raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md`
- Hermes Installation：`https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/getting-started/installation.md`
- Hermes Tools & Toolsets：`https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/tools.md`
- Hermes Skills System：`https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/skills.md`
- Hermes Memory：`https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/features/memory.md`
- Hermes Security：`https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/user-guide/security.md`
- Claude Code Overview：`https://code.claude.com/docs/en/overview`
- Claude Code Skills：`https://code.claude.com/docs/en/skills`
- Claude Code Subagents：`https://code.claude.com/docs/en/sub-agents`
- Claude Code Permissions：`https://code.claude.com/docs/en/permissions`
- Claude Code Tools Reference：`https://code.claude.com/docs/en/tools-reference`
- Claude Code Hooks：`https://docs.claude.com/en/docs/claude-code/hooks`
- Claude Code MCP：`https://docs.claude.com/en/docs/claude-code/mcp`
- GraphiteUI 当前状态：`docs/current_project_status.md`
- GraphiteUI LangGraph 能力分析：`docs/future/2026-05-01-langgraph-advanced-capability-baseline-analysis.md`
- GraphiteUI 原生 Skill 系统重构设想：`docs/future/2026-04-27-native-skill-system.md`
- GraphiteUI Skill 产品分类：`docs/future/2026-04-27-skill-product-taxonomy.md`
- GraphiteUI 桌宠 Agent 与自动编排图设想：`docs/future/2026-04-21-agent-companion-graph-orchestration.md`
