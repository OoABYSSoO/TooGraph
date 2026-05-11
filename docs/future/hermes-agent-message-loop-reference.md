# Hermes Agent 消息循环拆解

本文基于 `demo/hermes-agent/` 源码，梳理 Hermes Agent 从接收到一条用户消息开始，到最终回复、会话持久化、后台记忆/技能复盘为止的完整循环。它是 TooGraph Buddy 设计的能力参考，不是要复制的架构。TooGraph 仍应把这些能力翻译为图模板、状态、Skill/子图调用、运行事件、审批和可恢复 artifact。

## 结论摘要

Hermes 的核心循环不是“一个模型直接回复一次”，而是：

1. 入口层先把平台消息转成标准会话消息，处理鉴权、命令、附件、`@` 引用、会话键和历史。
2. Gateway/CLI 用流式 consumer、进度回调、打断队列和后台线程把用户界面与 Agent 主循环解耦。
3. `AIAgent.run_conversation()` 在一个用户 turn 内反复执行“组装上下文 -> 调模型 -> 校验工具调用 -> 执行工具 -> 把工具结果写回消息 -> 再调模型”，直到没有工具调用并生成最终文本。
4. 工具调用不是直接裸跑：有工具名修复、JSON 参数校验、插件拦截、guardrail、危险操作审批、checkpoint、顺序/并发调度、进度回调、结果预算和持久化。
5. 用户可见体验依靠 streaming、segment boundary、tool progress、interim assistant message 和 final-send suppression 组合出来；它能先让用户看到模型正在说/做，再继续工具循环。
6. 记忆、技能更新和自改进不是阻塞当前回复的主路径。主回复完成后，Hermes 可派生一个后台 review agent 复盘本轮，对 memory/skills 做 best-effort 更新。
7. Gateway 的超时是“无活动超时”，不是总运行时长上限；`HERMES_AGENT_TIMEOUT=0` 表示无限等待，但仍轮询打断。

## 关键源码地图

- `demo/hermes-agent/gateway/run.py`
  - 平台消息入口、鉴权、命令、运行中打断、会话装配、流式 consumer、线程池运行 Agent、超时和 pending message 处理。
- `demo/hermes-agent/gateway/session.py`
  - `session_key` 生成、会话创建/恢复/重置、SQLite 与 JSONL transcript。
- `demo/hermes-agent/gateway/stream_consumer.py`
  - 从 Agent worker 线程接收 token delta，异步编辑平台消息，处理工具边界和最终发送确认。
- `demo/hermes-agent/cli.py`
  - 终端 TUI 输入队列、运行中输入的 queue/steer/interrupt 模式、CLI 流式输出和单 turn 后处理。
- `demo/hermes-agent/run_agent.py`
  - `AIAgent` 和 `run_conversation()` 主循环。
- `demo/hermes-agent/model_tools.py`
  - 工具定义解析、toolset 过滤、工具参数类型修正、registry dispatch。
- `demo/hermes-agent/agent/context_compressor.py`
  - 长会话压缩算法。
- `demo/hermes-agent/agent/memory_manager.py`
  - 内置记忆与外部记忆 provider 的统一编排。
- `demo/hermes-agent/tools/delegate_tool.py`
  - `delegate_task` 子 agent 构建、并行执行、进度回传和结果汇总。

## 总体流程图

```mermaid
flowchart TD
  A[平台或 CLI 收到用户消息] --> B{入口层}
  B -->|Gateway| C[gateway/run.py _handle_message]
  B -->|CLI| D[cli.py process_loop/chat]
  C --> E[鉴权/命令/运行中打断/队列]
  E --> F[准备消息文本: 附件、语音、@引用、reply-to]
  F --> G[创建或加载 session + transcript]
  G --> H[构建 context_prompt、agent_history、callbacks]
  D --> H2[本地图片、@引用、TTS/stream callback、interrupt queue]
  H --> I[AIAgent.run_conversation]
  H2 --> I
  I --> J[turn 初始化: system prompt、memory prefetch、preflight compression]
  J --> K{主循环}
  K --> L[组装 API messages + tools + ephemeral context]
  L --> M[流式/非流式调用模型]
  M --> N{assistant 有 tool_calls?}
  N -->|是| O[校验/修复 tool name 和 JSON args]
  O --> P[顺序或并发执行工具]
  P --> Q[工具结果追加为 role=tool]
  Q --> R[必要时压缩上下文/保存 session log]
  R --> K
  N -->|否| S[整理最终文本/空回复恢复/fallback]
  S --> T[持久化、post hooks、memory sync]
  T --> U[可选后台 memory/skill review]
  T --> V[Gateway/CLI 发送或确认最终回复]
```

## 入口一：Gateway 收到平台消息

Gateway 的核心入口是 `GatewayRunner._handle_message()`，代码注释直接把它定义为七步 pipeline：鉴权、命令、运行中 Agent 打断、会话获取、上下文构建、运行 Agent、返回响应（`demo/hermes-agent/gateway/run.py:4590`）。

### 1. 先处理非 Agent 逻辑

收到 `MessageEvent` 后，Gateway 先做这些事情：

- 检测 gateway 代码是否已后台更新，必要时要求重启并让用户重试（`gateway/run.py:4605`）。
- 内部事件跳过鉴权；用户事件触发 `pre_gateway_dispatch` 插件钩子，插件可 skip/rewrite/allow（`gateway/run.py:4630`）。
- 如果没有用户身份，静默丢弃；如果未授权，DM 场景发配对码，群聊场景通常忽略（`gateway/run.py:4671`）。
- 如果有 pending `/update` 或其他确认提示，优先把用户输入路由给对应流程，避免误送给 Agent（`gateway/run.py:4715`）。
- 如果同一 session 已经有 Agent 在跑，命令会被特殊处理；普通新消息按配置进入 queue、steer 或 interrupt 逻辑。运行中消息不会简单丢掉。

这层的目标是保证真正送进 `AIAgent` 的内容已经是“应该由模型处理”的用户请求，而不是控制命令、平台授权噪音或 UI 确认文本。

### 2. 标准化 inbound message

`_prepare_inbound_message_text()` 负责把平台事件整理成 Agent 可读文本（`gateway/run.py:5582`）：

- 多人共享会话中，把发送者名写进消息前缀，例如 `[Alice] ...`（`gateway/run.py:5614`）。
- 图片按模型能力选择 native vision 或先用视觉工具转文字描述（`gateway/run.py:5622`）。
- 语音/音频走 STT enrichment；STT 未配置时先给用户发可见提示（`gateway/run.py:5657`）。
- 文档消息注入“用户发送了文档/文本文件，路径是...”的上下文说明（`gateway/run.py:5691`）。
- reply-to 消息会注入被回复片段，帮助模型知道用户指向哪条历史消息（`gateway/run.py:5727`）。
- `@file`、`@folder` 等引用通过 context reference 预处理，并限制在允许 root 内（`gateway/run.py:5737`）。

注意：这些都是入口层上下文装配，不是 Agent 主循环的一部分。

### 3. 会话键与 transcript

Gateway 使用 `build_session_key()` 生成稳定 session key（`gateway/session.py:594`）。DM、群聊、线程和用户隔离规则都在这里统一处理。`SessionStore.get_or_create_session()` 再根据 key 找旧会话或创建新会话（`gateway/session.py:850`）：

- 支持 idle/daily reset。
- 支持 `resume_pending`：gateway 重启或中断后，下次消息沿用原 session 和 transcript，而不是硬重置（`gateway/session.py:982`）。
- 新会话会在 SQLite 中创建 session 记录，同时保留 JSONL legacy transcript 写入路径。
- `append_to_transcript()` 和 `load_transcript()` 同时兼容 SQLite 与 JSONL，尽量避免历史丢失（`gateway/session.py:1249`）。

### 4. 运行 Agent 前的 Gateway 包装

`_handle_message_with_agent()` 是真正进入 Agent 之前的包装层（`gateway/run.py:5787`）：

- 读取或创建 `SessionEntry`，新会话触发 `session:start` hook。
- `build_session_context()` 和 `build_session_context_prompt()` 生成平台、用户、会话相关上下文（`gateway/run.py:5829`）。
- 设置工具可读取的 session 环境变量。
- 将 transcript 转为 `agent_history`，保留 tool calls、tool messages、reasoning 字段，跳过 gateway 自己的 metadata（`gateway/run.py:12907`）。
- 注册危险命令审批回调；需要审批时，Agent worker 线程可以同步阻塞等待用户 `/approve` 或按钮操作（`gateway/run.py:12973`）。
- 如果上一轮因 gateway 中断停在 tool result 尾部，会给模型 prepend auto-continue system note，让它先处理未消费的工具结果（`gateway/run.py:13057`）。
- 如果当前消息带 native images，会把文本包装为 OpenAI-style multimodal content parts（`gateway/run.py:13144`）。

## 入口二：CLI 收到终端输入

CLI 的最终入口也是 `AIAgent.run_conversation()`，但它自己负责本地 TUI 行为。

`HermesCLI.run()` 初始化底部输入 UI、pending queue、interrupt queue、clarify/approval/sudo/secret 等交互状态（`cli.py:9882`）。Enter 的路由逻辑是关键：

- Agent 空闲：输入进入 `_pending_input`。
- Agent 运行中：普通输入按 `busy_input_mode` 进入 `queue`、`steer` 或 `interrupt`。
- Slash command 总是走 command path，避免变成打断文本。
- `/steer` 在 UI 线程直接调用 `agent.steer()`，不等 `process_loop`，否则会错过 mid-run 注入时机（`cli.py:10054`）。

后台 `process_loop()` 从 `_pending_input` 取消息，处理命令、文件拖拽、图片附件，然后调用 `self.chat()`（`cli.py:11507`）。

`HermesCLI.chat()` 做的事情包括（`cli.py:9069`）：

- 初始化或复用 `AIAgent`。
- 图片按 native/text vision 路由。
- 展开 `@` 上下文引用。
- 把原始 user message 加入 CLI 历史。
- 设置流式 TTS 或文本 stream callback。
- 在线程中调用 `agent.run_conversation(...)`。
- 主线程监听 `_interrupt_queue`，运行中有新消息时调用 `agent.interrupt()`（`cli.py:9347`）。
- Agent 结束后刷新流式输出，更新 `conversation_history`，同步压缩后可能变化的 `session_id`，并触发标题生成（`cli.py:9452`）。

CLI 路径相比 Gateway 少了平台鉴权和 transcript dispatch，但“用户输入 -> Agent 主循环 -> 历史更新”的结构一致。

## AIAgent turn 初始化

`AIAgent.run_conversation()` 是完整的单 turn 执行函数（`run_agent.py:10431`）。它接收当前用户消息、可选系统消息、历史消息、task id、stream callback 和持久化用的 clean user message。

### 1. 基础状态准备

进入函数后，Hermes 会先：

- 安装 safe stdio，避免 daemon/headless 输出错误导致崩溃（`run_agent.py:10459`）。
- 确保 SQLite session 存在（`run_agent.py:10463`）。
- 绑定当前线程的 session log context 和 skill write origin（`run_agent.py:10465`）。
- 如果上一轮启用了 fallback provider，本轮先恢复 primary runtime 再试（`run_agent.py:10479`）。
- 清理 surrogate 字符，防止 JSON 序列化失败。
- 生成 `effective_task_id`，给终端、浏览器、delegate 子任务隔离资源（`run_agent.py:10496`）。
- 重置本 turn 的无效工具名、无效 JSON、空回复、thinking prefill、tool guardrail 等计数器（`run_agent.py:10504`）。
- 做连接健康检查，清理 stale TCP 连接（`run_agent.py:10520`）。

### 2. 构建 messages

Hermes 不直接修改调用方传入的历史，而是 `messages = list(conversation_history)`（`run_agent.py:10555`）。随后：

- 从历史中恢复 todo store，避免 gateway 每条消息新建 Agent 时丢 todo（`run_agent.py:10558`）。
- 增加 user turn 计数。
- 保存原始用户消息，用于记忆和插件查询，避免查询里混入 voice prefix 或技能注入。
- 根据 `memory_nudge_interval` 判断本轮结束后是否需要后台 memory review（`run_agent.py:10582`）。
- 把当前用户消息追加为 `role=user`，并记录当前 user message index（`run_agent.py:10594`）。

### 3. 系统提示是稳定缓存层

`_build_system_prompt()` 只在新 session 第一次调用或压缩后重建（`run_agent.py:4869`）。它按层组装：

1. `SOUL.md` 或默认身份。
2. Hermes 自身帮助指针。
3. memory/session_search/skills/kanban 等工具行为指导。
4. tool-use enforcement 和模型特定操作指导。
5. 调用方传入的 system message。
6. 内置 memory 和 user profile。
7. 外部 memory provider system prompt block。
8. skills system prompt。
9. 项目上下文文件，例如 `AGENTS.md`。
10. 会话开始时间、session id、model、provider。
11. 环境提示和平台格式提示。

继续会话时，Gateway 通常会从 session DB 读取上一轮存储的 system prompt，避免重新读取 memory 后导致 Anthropic prompt cache 前缀变化（`run_agent.py:10615`）。

### 4. Preflight 压缩和 ephemeral context

主循环开始前，Hermes 先估算“system prompt + messages + tool schemas”的请求 token。如果超过压缩阈值，最多压缩三轮再开始模型调用（`run_agent.py:10656`）。

然后触发 `pre_llm_call` 插件。插件返回的上下文不会写入 system prompt，而是临时追加到当前 user message 的 API copy 上，这样系统提示前缀保持稳定（`run_agent.py:10724`）。

外部 memory provider 也在主循环前执行一次 `on_turn_start()` 和 `prefetch_all()`，结果缓存起来，后续每个 tool iteration 复用同一份 recall context，避免 10 次工具循环触发 10 次外部记忆查询（`run_agent.py:10787`）。

## AIAgent 主循环

Hermes 的核心 while 条件是：

```python
while (api_call_count < self.max_iterations and self.iteration_budget.remaining > 0) or self._budget_grace_call:
```

也就是说，它同时受 `max_iterations` 和 `IterationBudget` 控制，特殊情况下有一次 grace call（`run_agent.py:10810`）。

每次 iteration 做以下事情：

1. 检查 `self._interrupt_requested`，如果用户中途发新消息或 `/stop`，本轮退出（`run_agent.py:10814`）。
2. 消耗一次 iteration budget。
3. 触发 `step_callback`，Gateway 可用它发运行步进事件（`run_agent.py:10837`）。
4. 累加 skill nudge 计数，用于后续后台技能 review（`run_agent.py:10865`）。
5. 把 pending `/steer` 注入最近的 tool result，使下一次 API call 能看到用户中途指导（`run_agent.py:10871`）。
6. 组装 API messages。

### API messages 组装规则

Hermes 会从内部 `messages` 复制出一份 `api_messages`，只在这份 copy 上做 API 专用变换（`run_agent.py:10939`）：

- 把外部 memory prefetch 和插件 context 注入当前 user message；原始 `messages` 不变（`run_agent.py:10943`）。
- 保留 assistant reasoning 给支持的 provider，移除内部-only 字段。
- 清理 strict API 不接受的工具字段。
- 加入稳定 system prompt，再加入 ephemeral system prompt。
- 插入 prefill messages，但不持久化。
- 对 Anthropic 兼容路径应用 prompt cache control。
- 修复 orphan tool result，丢弃 thinking-only assistant API turn，规范工具 JSON 字符串和 whitespace，清理 surrogate。
- 粗估请求 token，用于日志、压缩和活动状态。

### 模型调用路径

Hermes 默认优先走 streaming API call，即使当前没有 UI stream consumer，也因为 streaming path 有更细的健康检查和 stale-stream 检测（`run_agent.py:11206`）。不支持 streaming 的 provider 或特殊 transport 会回退非流式。

模型调用外面包了多层恢复逻辑：

- provider rate-limit guard。
- API shape validation。
- auth retry。
- 429/timeout/network retry。
- context overflow 时触发 compression 并重试。
- fallback provider/model 激活。
- 针对 Codex Responses、Anthropic Messages、OpenAI-compatible 等不同 transport 的 response normalization。

这些恢复逻辑很多，但它们都服务于同一个循环：拿到一个规范的 `assistant_message` 后，再判断是工具调用还是最终文本。

## 工具调用循环

如果 `assistant_message.tool_calls` 非空，Hermes 不会结束，而是进入工具分支（`run_agent.py:13084`）。

### 1. 工具调用校验与自修复

Hermes 会先校验工具名：

- 尝试把模型幻觉出的近似工具名自动修复为真实工具名（`run_agent.py:13093`）。
- 仍然无效时，把 assistant tool call 和对应 tool error message 写入 `messages`，让模型下一轮自我修正；超过 3 次返回 partial（`run_agent.py:13105`）。

再校验工具参数 JSON：

- 空字符串当 `{}` 处理。
- 非字符串参数序列化为 JSON。
- JSON 解析失败时，先判断是否是响应被截断；截断直接 partial，避免执行半截危险参数（`run_agent.py:13165`）。
- 普通 JSON 错误先重试，超过阈值后注入 tool error result，让模型下一轮修正（`run_agent.py:13201`）。

通过校验后，还会限制 `delegate_task` 数量、去重重复工具调用（`run_agent.py:13238`）。

### 2. 追加 assistant tool-call message

Hermes 会把带 `tool_calls` 的 assistant message 追加到历史，再执行工具（`run_agent.py:13301`）。如果 assistant 同时输出了可见文字和 housekeeping 工具，例如 memory/todo/skill_manage，Hermes 会缓存这段文字作为 fallback final response，避免工具后模型返回空白时用户看不到刚才已经生成的答案（`run_agent.py:13248`）。

随后：

- 调用 `interim_assistant_callback`，让 Gateway 可以把“我先查一下...”这类中间文本展示出来。
- 给 `stream_delta_callback(None)`，表示当前流式段结束，后面工具进度应出现在独立段落/消息下方（`run_agent.py:13304`）。
- 调用 `_execute_tool_calls()`。

### 3. 顺序或并发执行工具

`_execute_tool_calls()` 会判断当前 batch 是否能并发：只对独立工具 batch 走线程池；交互型或路径冲突工具走顺序路径（`run_agent.py:9289`）。

直接由 Agent 循环处理的工具包括：

- `todo`
- `session_search`
- `memory`
- 外部 memory provider 工具
- `clarify`
- `delegate_task`

其他工具通过 `model_tools.handle_function_call()` 进入 registry（`run_agent.py:9331`）。

并发路径会：

- 解析参数并做 checkpoint。`write_file`、`patch` 和危险 `terminal` 命令前会保存快照（`run_agent.py:9480`）。
- 调用插件 `pre_tool_call` 和 tool guardrail，可能阻断执行并生成 synthetic result（`run_agent.py:9502`）。
- 发 `tool.started`、`tool_start_callback`，Gateway 用它发进度事件（`run_agent.py:9535`）。
- 在 worker 线程注册审批、sudo、activity callback 和 interrupt signal（`run_agent.py:9574`）。
- 线程池等待时每 30 秒 touch activity，避免 Gateway 把长工具误判为卡死（`run_agent.py:9672`）。
- 按原始 tool call 顺序把结果 append 回 `messages`，保证 API 角色序列稳定（`run_agent.py:9725`）。

顺序路径做同样的 guardrail、checkpoint、callback、执行和结果追加，只是一个工具一个工具跑，并在工具之间允许 `/steer` 早点注入（`run_agent.py:9822`）。

`handle_function_call()` 负责 registry 工具派发（`model_tools.py:679`）：

- 根据工具 schema 修正字符串参数类型，例如 `"42"` 转成整数。
- 拒绝本应由 Agent loop 处理的特殊工具。
- 触发 `pre_tool_call` block hook。
- 非 read/search 工具会重置 read-loop tracker。
- `execute_code` 会拿当前启用工具列表生成 sandbox 能力。
- registry dispatch 后触发 `post_tool_call` 和 `transform_tool_result` hook。
- 异常统一包装成 JSON error 字符串。

### 4. 工具后回到模型

工具执行完成后，Hermes 会：

- 如果 guardrail 要求 halt，生成受控停止回复并跳出循环（`run_agent.py:13318`）。
- 根据真实 prompt token 或粗估 token 判断是否需要 context compression（`run_agent.py:13348`）。
- 保存 session log，让中断/崩溃后还能看到进度（`run_agent.py:13391`）。
- `continue` 回到 while 顶部，再调一次模型处理工具结果。

这就是 Hermes 的核心“能力循环”：模型不是一次性做完所有事情，而是在每轮工具结果后再推理下一步。

## 最终回复路径

如果 assistant 没有 tool calls，就进入 final response 分支（`run_agent.py:13398`）。

Hermes 对空回复和 thinking-only 回复做了多级恢复：

- 如果已有部分内容通过 streaming 送达，就把已送达内容作为最终回复（`run_agent.py:13411`）。
- 如果上一轮是“可见文本 + housekeeping 工具”，工具后空白，则用上一轮可见文本作为最终回复（`run_agent.py:13435`）。
- 如果最近有工具结果但模型空白，追加一个 user-level nudge，让模型继续处理工具结果（`run_agent.py:13461`）。
- 如果模型只有 reasoning/thinking 没有可见文本，最多 prefill continuation 两次（`run_agent.py:13526`）。
- 真空回复最多重试 3 次，之后尝试 fallback provider；仍失败则返回 `(empty)`（`run_agent.py:13561`）。
- Codex Responses 若像“中间 ack”而不是完成任务，会追加继续执行提示再循环（`run_agent.py:13661`）。

拿到有效最终文本后，Hermes 会 strip think blocks，追加最终 assistant message，记录退出原因，然后跳出主循环（`run_agent.py:13695`）。

如果循环耗尽 iteration budget，`_handle_max_iterations()` 会再发一次无工具 summary 请求，尽量给用户一个收束说明，而不是静默停在最后一个 tool result（`run_agent.py:13768`）。

## turn 结束与后台复盘

主循环结束后，`run_conversation()` 会：

- 保存 trajectory。
- 清理本 task 的 VM/browser 资源。
- 持久化 session 到 JSON log 和 SQLite。
- 记录 `turn_exit_reason`、api call 数、budget、工具轮数、最后消息角色、响应长度等诊断信息（`run_agent.py:13800`）。
- 触发 `post_llm_call` 插件。
- 返回包含 `final_response`、`messages`、token/cost、`interrupted`、`response_previewed`、guardrail metadata 等字段的 result dict（`run_agent.py:13870`）。
- 清理 interrupt 和 stream callback。
- 同步外部 memory provider，并 queue 下一轮 prefetch（`run_agent.py:13925`）。
- 如果 memory 或 skill nudge 触发，启动后台 review（`run_agent.py:13932`）。

后台 review 由 `_spawn_background_review()` 创建 daemon thread（`run_agent.py:3558`）：

- 根据触发条件选择 memory prompt、skill prompt 或 combined prompt。
- fork 一个新的 `AIAgent`，启用 `memory` 和 `skills` toolsets，最大 16 iteration，quiet mode。
- 继承父 Agent 当前 runtime，避免 OAuth/session-scoped credentials 丢失。
- 设置 `background_review` 写入来源。
- 自动 deny 危险命令，避免后台线程卡在审批输入。
- 调用 `review_agent.run_conversation(prompt, conversation_history=messages_snapshot)`。
- 扫描 review agent 的 tool messages，把成功 memory/skill 写入整理成简短摘要。
- 通过 `background_review_callback` 通知用户，但 Gateway 会把这类通知延后到主回复送达之后再发。

这意味着 Hermes 的自改进是“主回复之后的后台 fork”，不是把用户当前回复路径拉长。

## Streaming 为什么让用户觉得快

Hermes 的快感来自几层协同，而不是单纯模型快：

1. Agent worker 线程在模型 streaming 时同步调用 `stream_delta_callback(text)`。
2. Gateway 创建 `GatewayStreamConsumer`，它用线程安全 queue 接 token，再由 async task 定时编辑平台消息（`gateway/stream_consumer.py:1`）。
3. `on_delta(None)` 代表工具边界：当前文本段收尾，下一个文本段会开新消息，工具进度可以自然插在中间（`gateway/stream_consumer.py:178`）。
4. `run()` 内部按 edit interval、buffer threshold、message length limit 控制发送频率，并过滤 `<think>` 等 reasoning 标签（`gateway/stream_consumer.py:300`）。
5. Agent 工具分支会在执行工具前发 segment break（`run_agent.py:13304`）。
6. Gateway 最后检查 `stream_consumer.final_response_sent` 或 `response_previewed`，如果最终回复已被 streaming/interim path 送达，就抑制普通 final send，避免重复（`gateway/run.py:13899`）。

所以用户看到的顺序通常是：

1. 很快看到第一段模型文本或“正在处理”的状态。
2. 工具开始后看到独立 tool progress。
3. 工具完成后，如果模型继续输出，会在工具进度下面开新的文本段。
4. 最终回复到达后，Gateway 不重复发送已经确认送达的内容。

对 TooGraph 的启发是：Buddy 不一定要等整张图终态才显示助手消息。可以把“第一段可见回复”“每轮能力调用活动”“最终回复”作为同一个助手消息的运行胶囊逐步更新。

## Gateway 的超时与继续运行

Hermes Gateway 把 Agent 放进 executor，并用 activity tracker 做“无活动超时”（`gateway/run.py:13462`）：

- 默认 `HERMES_AGENT_TIMEOUT=1800`，含义是 30 分钟没有 stream token、API activity 或工具 activity 才认为卡死。
- `HERMES_AGENT_TIMEOUT=0` 表示不设超时，但仍每 5 秒轮询一次，用于 backup interrupt 检测（`gateway/run.py:13484`）。
- `HERMES_AGENT_TIMEOUT_WARNING` 可先发无活动警告。
- 长任务还有周期性 “Still working...” 通知，包含 iteration 和当前工具（`gateway/run.py:13419`）。
- 真超时会调用 `agent.interrupt()`，并给用户一段带诊断的失败消息（`gateway/run.py:13574`）。

这和固定“整轮运行最多 N 秒”的前端超时不同。它允许长任务一直运行，只要系统仍有可观察活动。

## Pending、queue、steer、interrupt

Hermes 对运行中新输入有三种主要语义：

- `queue`：当前 turn 完成后，把新消息作为下一 turn 处理。
- `steer`：当前 turn 不中断，把文本注入最近的 tool result，让下一次模型 iteration 看到。
- `interrupt`：通知 Agent 停止当前 loop，并把新消息作为 pending follow-up。

Gateway 结束一个 run 后会检查 adapter 里的 pending message 或 leftover `/steer`（`gateway/run.py:13655`）。如果当前 run 是正常完成且后面还有 queued follow-up，Gateway 会先确保第一条最终回复已经送达，再递归启动下一 turn（`gateway/run.py:13751`）。如果当前 run 是 interrupt，旧 run 的噪音回复会被丢弃，直接处理新消息。

这套机制对 Buddy 很有价值：暂停/继续/补充内容应该是同一个会话 lane 上的状态转换，而不是新开多个输入框或混乱地抢占当前 run。

## Context compression

Hermes 有两处触发压缩：

- turn 开始前的 preflight compression，解决“加载旧大历史 + 切到小上下文模型”场景（`run_agent.py:10656`）。
- 每轮工具执行后，根据 provider 报告 token 或粗估 token 判断是否压缩（`run_agent.py:13348`）。

`_compress_context()` 会：

- 通知外部 memory provider 即将压缩（`run_agent.py:9098`）。
- 调用 `context_compressor.compress()`。
- 把 todo snapshot 重新注入压缩后的消息，避免主动任务丢失（`run_agent.py:9138`）。
- 重建 system prompt。
- 在 SQLite 中结束旧 session，创建新的 continuation session，并把 parent_session_id 关联起来（`run_agent.py:9146`）。
- 通知 context engine 和 memory provider session id 已因 compression 轮转（`run_agent.py:9179`）。
- 更新 token 估算，清理 file read dedup cache（`run_agent.py:9221`）。

`ContextCompressor.compress()` 的算法是（`agent/context_compressor.py:1253`）：

1. 先 prune 旧 tool results，不需要 LLM。
2. 保护头部消息。
3. 按 token budget 找要保留的近期 tail。
4. 用 LLM 总结中间消息。
5. 重新组装 head + summary + tail，并清理 tool call/result 配对。
6. 记录压缩收益，连续低收益时避免 thrashing。

## Delegation 子循环

`delegate_task` 是 Hermes 的子 agent 能力。父 Agent 在工具调用中调用 `delegate_task` 后，`tools/delegate_tool.py` 会：

- 构造聚焦的 child system prompt，说明子任务 goal、context、workspace 和输出格式（`delegate_tool.py:533`）。
- 解析父 Agent 当前 workspace hint，避免子 agent 猜错路径（`delegate_tool.py:609`）。
- 继承父 Agent 的 runtime、provider、credential pool、reasoning config、fallback chain、session db 和平台身份。
- 给 child Agent 设置 progress callback，把子任务 thinking/tool started/tool completed 回传给父级 UI（`delegate_tool.py:647`）。
- 多子任务用线程池并行，单子任务直接运行，子任务内部仍调用 `child.run_conversation()`（`delegate_tool.py:1450`）。
- 用 heartbeat touch 父 Agent activity，避免 Gateway 误判 delegation 卡死。
- 汇总子 Agent 的 final response、token/cost、错误和事件给父 Agent。

这说明 Hermes 的“多 Agent”仍然是工具调用的一种结果，父 Agent 下一轮会读取 delegation tool result，再决定下一步。

## 对 TooGraph Buddy 的可借鉴点

TooGraph 不应复制 Hermes 的隐藏 Python while loop，但可以借鉴这些产品和运行时策略：

- **早期可见回复**：用户消息进入后，先产出一个 `visible_reply` 或同类状态，让用户知道 Buddy 已理解请求和下一步。
- **运行过程与最终回复成对**：每条助手消息都应绑定自己的 run capsule，包含本轮节点、能力调用、暂停、审批、耗时和最终状态，而不是只有全局当前运行过程。
- **segment boundary**：能力调用前后要有清晰边界。Buddy UI 可以把“可见回复段 -> 能力执行活动 -> 继续生成/最终回复段”放进同一个消息 capsule。
- **无活动超时，而非总时长硬上限**：前端不应因固定运行时长把仍有活动的 backend run 判为失败；应该靠 backend activity events、heartbeat、显式 cancel/refusal/terminal state 收束。
- **pending/queue/steer 语义**：运行中用户补充内容需要明确：是排队下一轮、作为当前 run 的补充 state 续跑，还是中断当前 run。
- **工具调用自修复**：无效能力名、无效结构化参数、截断参数、空回复都应进入可审计恢复路径，而不是直接静默失败。
- **低层审批与 checkpoint**：文件写入、删除、脚本执行、网络和成本操作应有图内可见审批、预览、revision/undo。
- **后台 self-review**：最终回复完成后再启动独立后台图，例如 `buddy_self_review`，复盘记忆和改进候选，不阻塞下一轮用户输入。
- **结束原因诊断**：每轮 run 应记录为什么结束：final text、awaiting_human、cancelled、guardrail halt、budget exhausted、provider fallback failed、empty response exhausted 等。

## 不应照搬的点

- 不要把 Buddy 做成一个后端隐藏 `while tool_calls` 的 monolithic agent loop。TooGraph 的可见单位应是 graph run、node run、state 和 run event。
- 不要让 Skill 自己拥有多步自治、重试循环、最终回复生成或长期记忆策略。Hermes 的工具很强，但 TooGraph 的 Skill 边界应该更窄。
- 不要让后台 review 静默修改 Buddy Home、官方模板或官方 Skill。TooGraph 应产出计划、diff、revision 和审批。
- 不要把 provider fallback、工具修复、压缩、记忆写回散落在产品专用 endpoint 里。应沉到可复用 runtime primitive、graph validator、command bus、Skill runtime 和模板协议中。
- 不要把 stream token 当作唯一体验优化。Buddy 还需要消息级 capsule、activity events、暂停卡片、审批卡片和恢复路径。

## 映射到 Buddy 主循环

Hermes 主循环可以翻译为 TooGraph 的图优先结构：

```text
用户消息
  -> context input / Buddy Home selection
  -> request intake 子图
       输出 request_understanding
       输出 visible_reply
       判断是否可直接回答
  -> capability selection 子图
       输出 capability(kind=skill|subgraph|none)
  -> capability execution
       Skill 或 Subgraph 执行
       输出 result_package 或 schema-backed outputs
       记录 activity_events / artifacts / approval / warnings
  -> LLM review
       判断继续循环、暂停补充、请求审批、失败收束或最终回复
  -> final response 子图
       输出 final_reply
  -> Output node 展示 final_reply
  -> 后台 buddy_self_review
       读取主 run snapshot
       输出记忆/成长/模板改进候选
```

Hermes 证明了一个实用事实：用户体验上，“快”不一定是整件事做得快，而是每个阶段都能被用户看见、能继续输入、能恢复、能解释为什么还在跑。TooGraph 的优势是可以把这些阶段显式建模，而不是藏在一个 Agent 类里。
