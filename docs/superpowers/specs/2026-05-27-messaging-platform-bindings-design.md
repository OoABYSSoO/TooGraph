# 消息平台绑定与 Buddy 会话接入设计

设计日期：2026-05-27。

本文阐述在 TooGraph 左侧栏新增“消息平台”页面，用于绑定和管理 Telegram、Feishu/Lark 等外部消息平台，并让外部平台收到的消息进入 Buddy 会话历史的目标设计。本文只讨论目标架构和边界，不是实现计划。

## 目标

用户希望在 TooGraph 左侧栏进入一个独立页面，看到当前 Hermes 风格 gateway 已支持的消息平台列表，了解每个平台的配置和连接状态，并能在页面里完成绑定、启停、测试连接和查看运行诊断。

当 Telegram、Feishu/Lark 等平台收到用户消息时，TooGraph 应把它当成一次 Buddy 输入处理：

- 外部消息保存为 Buddy 会话中的 `user` 消息。
- Buddy 主循环仍通过 `buddy_autonomous_loop` 图模板运行。
- 运行产生的最终回复保存为同一 Buddy 会话中的 `assistant` 消息，并关联 `run_id`。
- 如果平台允许回复，gateway 再把最终回复发回原始平台会话。
- 用户之后在 Buddy 的历史会话、搜索、运行详情和消息 run 引用中都能找到这次外部平台对话。

这个方向可以做到，但不应该复制 Hermes 的单体 Agent loop。TooGraph 应借鉴 Hermes 的 adapter、normalized event、session routing、状态和安全设计，再把消息处理翻译成 TooGraph 的图运行、Action/Tool/Subgraph、run record、Buddy history、artifact 和权限模型。

## 当前参考

Hermes 参考路径：

- `demo/hermes-agent/gateway/platforms/base.py`
- `demo/hermes-agent/gateway/run.py`
- `demo/hermes-agent/gateway/config.py`
- `demo/hermes-agent/hermes_cli/commands.py`
- `demo/hermes-agent/gateway/slash_access.py`
- `demo/hermes-agent/gateway/platforms/telegram.py`
- `demo/hermes-agent/gateway/platforms/feishu.py`
- `demo/hermes-agent/website/docs/user-guide/messaging/index.md`

Hermes 中值得借鉴的设计：

- `BasePlatformAdapter` 作为平台 adapter 合同，负责连接、断开、接收消息、发送回复、媒体处理、平台状态和 fatal error。
- `MessageEvent` 把不同平台消息归一化为 `text`、`message_type`、`source`、`message_id`、`media_urls`、`media_types`、`reply_to_message_id`、`thread_id` 等统一形态。
- `GatewayRunner` 把 adapter 接入统一消息处理管线，完成授权、命令处理、session 查找、agent 运行和回复发送。
- `hermes_cli.commands.COMMAND_REGISTRY` 和 `gateway/slash_access.py` 可以参考命令注册、平台端可用命令、alias、Telegram command menu 和命令权限分层，但 TooGraph 第一版只吸收保守命令子集。
- Telegram / Feishu adapter 已覆盖长轮询、webhook/websocket、thread/topic、媒体缓存、dedup、typing、streaming、allowlist 等真实平台问题。
- Hermes 文档列出的平台能力矩阵可以作为 TooGraph “可发现平台目录”的起点。

TooGraph 当前相关路径：

- `backend/app/buddy/store.py`
- `backend/app/api/routes_buddy.py`
- `backend/app/api/routes_graphs.py`
- `frontend/src/buddy/useBuddyBoundRunTemplate.ts`
- `frontend/src/buddy/buddyChatGraph.ts`
- `frontend/src/buddy/useBuddyMessages.ts`
- `frontend/src/buddy/useBuddyChatSessions.ts`
- `frontend/src/layouts/AppShell.vue`
- `frontend/src/router/index.ts`
- `frontend/src/lib/layout-mode.ts`

TooGraph 当前已经具备的基础：

- `buddy_sessions` 有 `source` 字段，当前只有 `tool` 被视为隐藏来源，其他来源默认能进入会话列表和召回搜索。
- `buddy_messages` 保存原子消息、`metadata_json`、`run_id` 和 `buddy_message_run_refs`，适合保存外部平台消息和 graph run 引用。
- Buddy 前端已经通过 `useBuddyBoundRunTemplate.ts` 把当前用户消息绑定到 Buddy 主循环模板。
- Buddy 历史和运行详情已经有消息到 run 的回链，外部消息只要进入同一事实源，就能被搜索和审计。

## 产品范围

第一阶段建议只真正接通 Telegram 和 Feishu/Lark。

原因：

- 用户明确提到的消息平台是 Telegram、Feishu 这一类。
- Hermes 的 Telegram 和 Feishu adapter 已经暴露出最关键的平台差异：Telegram 以 bot token、polling/webhook、chat/thread/topic 为核心；Feishu 以 app id/secret、event subscription、websocket/webhook、tenant/user/open id、签名校验为核心。
- 这两个平台覆盖了“个人聊天、群聊、线程、媒体、企业应用事件、外网回调或长连接”这几个后续平台都会遇到的问题。

页面上可以先展示 Hermes 支持的完整平台目录，但只有 Telegram 和 Feishu/Lark 标为 `可配置`。其他平台标为 `计划支持` 或 `参考能力`，避免 UI 上暗示已经可用。

Hermes 当前消息平台目录可作为初始 catalog：

- Telegram
- Discord
- Slack
- Google Chat
- WhatsApp
- Signal
- SMS
- Email
- Home Assistant
- Mattermost
- Matrix
- DingTalk
- Feishu/Lark
- WeCom
- WeCom Callback
- Weixin
- BlueBubbles/iMessage
- QQ
- Yuanbao
- Microsoft Teams
- LINE
- ntfy
- API server / webhook

## 核心设计

新增一个 TooGraph-native messaging gateway，而不是把 Hermes gateway 直接嵌进 TooGraph。

目标分层：

```text
Platform adapter
-> MessagingGateway runtime
-> normalized inbound event
-> platform authorization and dedup
-> external thread to Buddy session resolver
-> Buddy user message persistence
-> buddy_autonomous_loop graph run
-> Buddy assistant message persistence
-> outbound platform delivery
```

关键原则：

- 平台连接、长轮询、webhook、签名校验和 token refresh 是 runtime primitive。
- 消息进入 Buddy 后的智能处理必须走图模板，不新增隐藏 Buddy 专用 agent loop。
- 外部平台消息不走后端直接调用 LLM 的旁路。
- 每次外部消息处理都要留下 Buddy message、run id、platform event metadata、adapter delivery result 和错误状态。
- 所有本地配置、secret、状态、日志和媒体缓存都属于运行时数据，不应进入 git。

会话路由是这套设计的核心不变量。系统必须区分三层对象：

- 平台连接：一个 Telegram bot、Feishu/Lark app、webhook 或长连接配置，回答“平台是否连上”。
- 外部会话：Telegram DM、group、forum topic，或 Feishu/Lark 单聊、群聊、thread，回答“这条平台消息来自哪个对话空间”。
- Buddy 会话：TooGraph 的历史会话和图运行上下文，回答“这条消息应该进入哪条 Buddy history”。

每次入站消息都必须先解析外部会话，再通过稳定映射找到 Buddy session。不能只按平台连接归档消息，也不能把同一平台的所有消息塞进一条 Buddy session。默认策略是“一个外部 conversation/thread 对应一个 Buddy session”。这样 Telegram 群内不同 topic、Feishu 群内不同 thread、私聊和群聊不会串历史，`/model`、`/new`、`/status` 等命令也有明确作用域。

## 后端模块边界

建议新增后端包：

```text
backend/app/messaging/
  adapters/
    base.py
    telegram.py
    feishu.py
  catalog.py
  config_store.py
  event_model.py
  gateway.py
  session_resolver.py
  buddy_ingress.py
  delivery.py
  audit.py
```

职责划分：

`adapters/base.py`：

- 定义 `PlatformAdapter` 抽象类。
- 定义 `connect()`、`disconnect()`、`send()`、`healthcheck()`、`validate_config()`。
- 定义平台能力声明，例如 `supports_threads`、`supports_files`、`supports_typing`、`supports_streaming`、`supports_webhook`。

`event_model.py`：

- 定义 `MessagingInboundEvent`。
- 字段包括 `platform_id`、`connection_id`、`external_message_id`、`chat_id`、`thread_id`、`sender_id`、`sender_name`、`chat_type`、`text`、`attachments`、`raw_event_ref`、`received_at`。
- 附件使用 artifact ref 或本地缓存路径，不把 base64 嵌进消息或 state。

`config_store.py`：

- 保存平台绑定配置、启用状态和脱敏摘要。
- secret 只允许写入本地 settings/secret store，不通过普通 API 回显原文。
- API 返回 `configured=true/false`、`secret_last4`、`updated_at`、`status` 等摘要。

`gateway.py`：

- 管理 adapter 生命周期。
- 根据 enabled bindings 启动或停止对应 adapter。
- 维护 runtime status：`disabled`、`not_configured`、`connecting`、`connected`、`retrying`、`error`。
- 负责去重、排队、并发控制和 graceful shutdown。

`session_resolver.py`：

- 将外部平台会话映射到 Buddy session。
- 生成稳定 `external_conversation_key`，例如 `telegram:group:<chat_id>:topic:<message_thread_id>` 或 `feishu:chat:<chat_id>:thread:<thread_id>`。
- 默认每个外部 conversation/thread 对应一个 Buddy session。
- 对 DM 可以按 `(platform, binding_id, sender_id)`；对群聊和企业群建议按 `(platform, binding_id, chat_id, thread_id)`，并把 sender 信息写到消息 metadata。
- 支持把当前外部 conversation 重新绑定到另一个 Buddy session，或通过 `/new` 创建新 Buddy session 后更新映射。

`buddy_ingress.py`：

- 把归一化事件写入 `buddy_messages`。
- 触发 Buddy 主循环图运行。
- 将图运行最终回复写回 `buddy_messages`，并把 `run_id` 关联到 assistant message。
- 把最终回复和必要的 delivery metadata 交给 `delivery.py` 发回平台。

`audit.py`：

- 记录平台连接事件、授权拒绝、dedup 命中、run 触发、发送失败、重试和人工配置变更。
- UI 的“最近事件”和“连接诊断”从这里读取，不从日志文本解析。

## 数据模型建议

优先扩展统一数据库，不创建新的长期事实源。

### 平台目录

平台目录可以先由代码静态声明，后续再允许插件贡献：

```json
{
  "platform_id": "telegram",
  "display_name": "Telegram",
  "support_level": "supported",
  "capabilities": {
    "text": true,
    "files": true,
    "images": true,
    "threads": true,
    "typing": true,
    "streaming": true
  },
  "config_schema": "telegram_bot_v1"
}
```

`support_level` 建议取值：

- `supported`：当前版本可配置和启用。
- `planned`：页面展示，但暂不允许绑定。
- `reference_only`：Hermes 有参考，TooGraph 未规划近期接入。

### 平台绑定

建议表名：`message_platform_bindings`。

核心字段：

- `binding_id`
- `platform_id`
- `display_name`
- `enabled`
- `configured`
- `config_json`
- `secret_ref_json`
- `created_at`
- `updated_at`

`config_json` 只保存非敏感配置，例如 webhook path、connection mode、allowed users、allowed chats、home chat、reply mode。token、app secret、encrypt key 等敏感字段只保存引用或加密密文，不在普通 API 中返回。

### 连接状态

建议表名：`message_platform_connection_status`。

核心字段：

- `binding_id`
- `status`
- `last_connected_at`
- `last_disconnected_at`
- `last_event_at`
- `last_delivery_at`
- `last_error_code`
- `last_error_message`
- `retry_count`
- `updated_at`

状态是 runtime 投影，不是用户配置事实。它可以由 gateway 启动后重建。

### 外部会话映射

建议表名：`message_platform_sessions`。

核心字段：

- `platform_session_id`
- `platform_id`
- `binding_id`
- `external_conversation_key`
- `external_chat_id`
- `external_thread_id`
- `external_user_id`
- `external_chat_type`
- `external_display_name`
- `buddy_session_id`
- `title`
- `routing_mode`
- `buddy_model_ref`
- `status`
- `last_inbound_at`
- `last_outbound_at`
- `last_run_id`
- `created_at`
- `updated_at`

Buddy session 的 `source` 建议设置为平台 id，例如 `telegram` 或 `feishu`。这样现有 Buddy 列表和召回搜索会把它视为可见会话，不会被 `HIDDEN_SESSION_SOURCES={"tool"}` 过滤。

`external_conversation_key` 必须稳定、可比较、可审计。推荐形态：

- Telegram 私聊：`telegram:dm:<chat_id>`。
- Telegram 普通群：`telegram:group:<chat_id>`。
- Telegram forum topic：`telegram:group:<chat_id>:topic:<message_thread_id>`。
- Feishu/Lark 单聊：`feishu:dm:<open_id>` 或平台稳定 chat id。
- Feishu/Lark 群聊：`feishu:chat:<chat_id>`。
- Feishu/Lark thread：`feishu:chat:<chat_id>:thread:<thread_id_or_root_message_id>`。

`routing_mode` 第一阶段可以只支持 `one_external_conversation_one_buddy_session`。后续如果需要，可以增加“一个平台绑定固定到一条 Buddy session”或“按外部用户拆分群聊会话”等高级模式，但默认不启用。

### 外部消息 metadata

写入 `buddy_messages.metadata_json` 的建议形态：

```json
{
  "source_kind": "message_platform",
  "platform_id": "telegram",
  "binding_id": "mpb_...",
  "platform_session_id": "mps_...",
  "external_message_id": "12345",
  "external_update_id": "67890",
  "external_chat_id": "-100...",
  "external_thread_id": "42",
  "external_sender_id": "123456",
  "external_sender_name": "Abyss",
  "external_chat_type": "group",
  "attachments": [
    {
      "artifact_id": "artifact_...",
      "mime_type": "image/jpeg",
      "file_name": "photo.jpg"
    }
  ]
}
```

不要把平台原始 event 全量塞进 `metadata_json`。原始 event 如需审计，应写入独立 raw event artifact，并在 metadata 中保存 `raw_event_ref`。

## 入站流程

1. Adapter 收到平台事件。
2. Adapter 校验签名、token、message type、平台去重字段和权限边界。
3. Adapter 产出 `MessagingInboundEvent`。
4. Gateway 做跨重启 dedup。dedup key 建议是 `(platform_id, binding_id, external_message_id)`，没有 message id 时降级到 hash。
5. Session resolver 生成 `external_conversation_key`，查找或创建 `message_platform_sessions`。
6. Buddy ingress 查找或创建 Buddy session，`source` 写平台 id。
7. 如果消息是已支持的斜杠命令，command router 在当前 `message_platform_sessions` 作用域内处理，写 audit/status message，不作为普通用户消息进入 LLM 上下文。
8. 普通消息由 Buddy ingress 调用 Buddy store 追加 `user` 消息，metadata 写平台来源。
9. Buddy ingress 按现有 Buddy 绑定启动 `buddy_autonomous_loop`，输入仍是当前消息、会话历史、Buddy Home context 等正式 state。
10. 运行过程中，消息平台 runtime 订阅该 run 的 `state.updated` / `node.completed` 事件，用与 Buddy 窗口一致的 public output 投影逻辑识别可见输出边界。
11. 每出现一条新的 Buddy 可见输出，Delivery 立即把当前占位消息编辑为该输出；后续可见输出先发送新的占位消息再编辑。
12. 图运行完成后，Buddy ingress 追加 `assistant` 消息，保存 `run_id`，并返回 `visible_reply_parts` 作为最终补漏和历史持久化依据。

这里最重要的边界是第 9 步：外部平台只是 Buddy 的另一个入口，真正的推理、能力选择、Action 调用、记忆召回和最终回复仍由图模板表达。

## 出站流程

出站回复分两类。

第一类是“对入站消息的 Buddy 可见输出回复”：

- 普通运行优先从 run-event bridge 的 output-boundary 可见输出事件实时读取文本；run 完成后的 `visible_reply_parts` 只作为补漏。
- 命令回复直接发送；普通 Buddy 运行采用 placeholder-replace 模式。
- 根据 adapter 能力决定是否 markdown 转义、分段、编辑消息、发送附件、typing 或 streaming。
- 发送结果写入 `message_platform_delivery_events` 或 audit event。

### Placeholder-replace 输出模式

消息平台最终可见消息数应与 Buddy 窗口的可见输出消息数一致。对每条普通用户消息：

```text
用户消息 -> 兼容层收到
发送占位消息：正在思考...
Buddy 产生第 1 条可见输出
编辑占位消息为第 1 条输出
如果后续进入新的 output-boundary 上游节点：
  再发送新的占位消息：正在思考...
  等该边界产生可见输出后，编辑该占位消息为下一条输出
重复直到 run 完成
```

这样平台侧最终不会残留额外“正在思考”消息；占位消息只用于等待体验。若运行失败且当前存在占位消息，应把占位消息编辑为失败提示。若编辑失败，delivery 层可以降级为发送最终文本并记录 audit event。

当前实现通过 run-event listener 在图运行过程中消费 `node.started`、`state.updated` 和 `node.completed`。`node.started` 用于在 output-boundary 的直接上游节点开始运行时提前发送占位；`state.updated` / `node.completed` 用于实时投影 Buddy public output 并编辑占位。`visible_reply_parts` 仍保留为运行完成后的兜底，避免 listener 缺失或平台发送失败时丢失最终回复。

第二类是“主动发消息到平台”：

- 不建议第一阶段开放任意主动发送。
- 未来应作为显式 Action 或 scheduled graph job，带目标平台、chat/thread、权限说明和 approval 路径。
- 主动发送结果也必须回写 artifact / run record，不能变成隐藏 side effect。

## 斜杠命令与会话作用域

外部消息平台第一版只支持一组保守命令。命令作用域一律是“当前外部会话映射”，也就是当前 Telegram chat/topic 或 Feishu/Lark chat/thread 对应的 `message_platform_sessions` 记录。命令本身不作为普通用户消息进入 LLM 上下文；可以写结构化 audit event，必要时在 Buddy history 中追加 `include_in_context=false` 的状态消息。

第一版建议支持：

- `/help`：显示当前平台会话可用命令。
- `/commands`：分页列出命令和简短说明。
- `/session`：显示当前外部 conversation 绑定的 Buddy session、模型覆盖、最近 run、平台会话状态和 TooGraph 跳转入口。
- `/status`：显示平台连接状态、当前会话状态、最近入站/出站时间和最近错误。
- `/new` 或 `/reset`：为当前外部 conversation 创建新的 Buddy session，并把后续消息路由到新 session。旧 session 保留在 Buddy history。
- `/model` 或 `/provider`：查看或修改当前平台会话专属模型覆盖。
- `/stop`：停止当前平台会话正在运行的 Buddy run，不能影响其他平台会话。
- `/retry`：重跑当前平台会话上一条普通用户消息。
- `/undo`：移除当前平台会话上一轮用户/助手交换，需要确认或高权限。
- `/title`：修改当前 Buddy session 标题。
- `/resume`：把当前外部 conversation 重新绑定到已有 Buddy session。
- `/whoami`：显示当前平台用户 id、权限角色和可用命令。

第一版明确暂缓：`/approve`、`/deny`、`/yolo`、`/background`、`/goal`、`/subgoal`、`/kanban`、`/rollback`、`/compress`、`/reload-mcp`、`/reload-skills`、`/update`、`/restart`、`/debug`。这些命令涉及权限、副作用、后台任务、Hermes 专用 runtime 或更复杂的审批语义，后续必须逐个翻译成 TooGraph 的图运行、Action、permission、revision 和 audit 模型。

### `/model` 语义

`/model` 链路必须复用 TooGraph 现有 Model Providers 和 Buddy 模型覆盖语义。

建议命令形态：

- `/model`：显示当前外部会话使用的模型、全局默认模型、可选模型列表，并给出下一步切换命令。
- `/model list`：只列出当前 Model Providers catalog 中可用于文本运行的模型。
- `/model global`：清除当前外部会话模型覆盖，回到 Model Providers 的默认文本模型。
- `/model <provider>/<model>`：将当前外部平台 conversation 对应的 Buddy session 模型覆盖为指定 model ref，例如 `openai/gpt-4.1`。

`/model` 在消息平台中应采用“先列表，后执行”的移动端友好交互：

```text
当前模型：global (local/gemma-4-26B)
可用模型：
1. local/gemma-4-26B
2. openai/gpt-4.1

切换模型：
/model local/gemma-4-26B

切回全局默认：
/model global
```

如果用户输入不可用模型，兼容层也应先说明错误，再返回同样的可用列表和切换命令格式。这样用户不需要记住完整 model ref，也不会把错误参数交给 Buddy 图运行。

关键边界：

- `/model` 只影响当前 `message_platform_sessions`，不修改 Model Providers 的全局默认文本模型。
- 可选模型来自 `backend/app/core/model_catalog.py` 的同一套 catalog 和默认模型解析逻辑。
- 命令参数必须校验为已配置、已启用、可用的 text model ref。
- 未授权用户不能通过 `/model` 探测模型列表或修改会话模型。

建议在 `message_platform_sessions` 中保存：

- `buddy_model_ref`
- `model_updated_at`
- `model_updated_by_external_sender_id`

当外部消息触发 Buddy run 时，`buddy_ingress` 读取当前平台会话的 `buddy_model_ref`：

- 为空或 `global` 时，保持图中 agent 节点 `modelSource=global`、`model=""`。
- 非空时，复用 Buddy 图构建中的模型覆盖语义，将 agent 节点设置为 `modelSource=override`、`model=<model_ref>`，并在 graph metadata 中写入 `buddy_model_ref`。

这样 Telegram、Feishu/Lark 的 `/model` 与 Buddy 窗口中的模型选择使用同一套模型来源、同一套图运行覆盖方式和同一套 run record 审计字段，但不会让一个外部群聊命令意外改变本地 Buddy 窗口或全局默认模型。

### 第一版落地约定

第一版按“能稳定接入真实外部会话，但不开放高风险自治操作”的边界实现。命令处理顺序固定为：adapter 归一化事件 -> gateway 去重 -> session resolver 得到 `message_platform_sessions` -> slash command router 在当前 platform session 上执行。命令不会绕过 Buddy store，也不会直接修改全局 provider、Buddy Home、图模板或本地文件。

| 命令 | 第一版行为 | 写入位置 |
| --- | --- | --- |
| `/help`、`/commands` | 返回当前用户可用命令清单和简短说明。 | audit event，可选 `include_in_context=false` 状态消息。 |
| `/session` | 返回当前外部会话、Buddy session、模型覆盖、trace mode、最近 run 和 TooGraph 跳转信息。 | audit event。 |
| `/status` | 返回平台绑定状态、当前 platform session 状态、最近入站/出站、最近错误。 | audit event。 |
| `/new`、`/reset` | 为当前外部 conversation 创建新的 Buddy session，并把当前 `message_platform_sessions.buddy_session_id` 指向新 session。旧 session 只保留历史，不被删除。 | `message_platform_sessions`、`buddy_sessions`、audit event。 |
| `/model`、`/provider` | 读取或更新当前 platform session 的 `buddy_model_ref`。可选模型必须来自现有 Model Providers catalog，语义与 Buddy 窗口模型选择一致。 | `message_platform_sessions.buddy_model_ref`、audit event。 |
| `/model global` | 清除当前 platform session 的模型覆盖，回到 Model Providers 默认文本模型。 | `message_platform_sessions.buddy_model_ref=""`、audit event。 |
| `/resume <buddy_session_id>` | 将当前外部 conversation 重新绑定到已有 Buddy session。目标 session 必须存在且不能是隐藏 `tool` 来源。 | `message_platform_sessions.buddy_session_id`、audit event。 |
| `/title <text>` | 修改当前 Buddy session 标题。 | `buddy_sessions.title`、audit event。 |
| `/whoami` | 返回平台 sender id、角色、绑定范围和可用命令。 | audit event。 |
| `/stop`、`/retry`、`/undo` | 第一版可以先返回明确的“已识别但暂未启用”状态，接口和权限边界预留；真正执行前必须接入 run cancel、rerun、revision/undo 路径。 | audit event。 |

`/stop`、`/retry`、`/undo` 之所以先占位，是为了让用户在平台端看到一致命令面，同时避免第一版在没有完整 run 控制和可恢复 revision 前引入不可审计副作用。它们不能静默失败，也不能伪装成已执行。

`/resume` 也采用“先列表，后执行”的交互。用户只发送 `/resume` 或 `/resume list` 时，兼容层返回最近可恢复的 Buddy session，并给出切换命令：

```text
可恢复的 Buddy 会话：
1. session_xxx 图图
2. session_yyy 北京天气查询

切换会话：
/resume session_xxx
```

用户发送 `/resume session_xxx` 时才执行重新绑定。目标 session 必须存在、未删除，且不是隐藏 `tool` 来源。重新绑定后，模型覆盖清空，后续消息使用新 Buddy session 的历史上下文和全局默认模型，除非用户再用 `/model <ref>` 为该平台会话设置覆盖。

## Buddy 胶囊在消息平台中的展现

Buddy 窗口里的胶囊是运行过程审计视图，不应逐条完整复制到外部聊天里。消息平台更适合接收“可读进度投影”，完整事实仍留在 TooGraph 的 Buddy history 和 RunDetail。

建议新增一个 `capsule_projection` 层，把 Buddy output-boundary 胶囊转换为平台适配显示：

```text
run events / Buddy capsule facts
-> capsule_projection summary
-> platform renderer
-> Telegram edited progress message or Feishu card update
```

默认投影等级：

- `quiet`：只发送 typing / 生成中状态，最终只发答案。答案尾部附一行短元信息，例如 `Run run_... · 3 steps · 2 capability calls`。
- `summary`：发送一条可更新的进度消息或卡片，显示当前阶段、已完成步骤数、能力调用摘要和最终状态。
- `debug`：用户通过 `/trace on`、按钮或管理页打开后，才展示更详细的胶囊摘要和 RunDetail 链接。

Telegram 推荐展现：

- 默认使用 `sendChatAction` 显示 typing，避免每个节点都刷一条消息。
- 对耗时较长的 run，发送一条“Buddy 正在处理...”进度消息，并用 `editMessageText` 更新同一条消息，减少聊天噪音。
- 进度消息附 inline keyboard，例如“查看步骤 / 隐藏 / 打开 TooGraph”。按钮回调必须调用 `answerCallbackQuery`。
- 私聊里如果 adapter 支持 Bot API 的 `sendMessageDraft`，可用 ephemeral draft 做轻量流式预览；最终仍必须发送持久化答案。
- Telegram 文本消息和编辑消息都有 4096 字符限制，因此只放摘要，不放完整 trace。

Feishu/Lark 推荐展现：

- 优先使用 interactive message card 表达胶囊摘要。
- 卡片结构：标题区显示 Buddy 状态，正文区显示当前阶段和 3-5 条关键步骤，操作区提供“查看运行详情 / 展开步骤 / 隐藏进度”。
- 处理过程中使用卡片更新能力，把“思考中卡片”更新为“已完成卡片”；AI 答案流式输出场景可以后续接入 Feishu 的文本流式更新能力。
- 回复用户消息时优先使用 `reply_in_thread=true`，让进度和最终答案留在原始消息线程内。
- 群聊中如果进度只对触发用户有意义，可以使用只对特定用户可见的卡片，避免打扰全群。

推荐默认策略：

- Telegram：`quiet` 为默认，`summary` 作为 `/trace on` 或按钮展开后的模式。
- Feishu/Lark：`summary` 可以作为默认，因为卡片天然适合承载结构化状态；详细 debug 仍跳转 TooGraph。
- 两个平台都不默认发送完整胶囊 trace。完整运行事实只保存在 TooGraph，平台消息只展示可读摘要和跳转入口。

## UI 设计

新增路由建议：

```text
/message-platforms
```

左侧栏新增导航项：

```text
消息平台
```

页面结构：

- 顶部 summary band：显示 gateway 状态、已连接平台数、最近入站消息、最近错误和“启动/重载 gateway”操作。
- 平台列表大面板：展示所有平台 card 或 table row。
- 平台详情抽屉或右侧面板：配置、权限、连接方式、测试连接、最近事件。
- 会话映射区：展示该平台最近关联的 Buddy sessions，可跳转到 Buddy 历史。

平台卡片核心信息：

- 平台名称和图标。
- 支持级别：可配置、计划支持、参考能力。
- 配置状态：未配置、已配置、配置缺失。
- 运行状态：未启用、连接中、已连接、重试中、错误。
- 最近消息时间。
- 最近错误摘要。
- 操作：配置、启用/停用、测试连接、查看事件。

配置体验：

- Telegram：bot token、连接模式、allowed users/chats/topics、默认 reply mode、webhook URL 或 polling。
- Feishu/Lark 默认提供“扫码自动绑定”：TooGraph 调用飞书/Lark 一键创建应用能力，生成授权链接，用户确认后自动获取 App ID 和 App Secret，并保存为 `mpb_feishu` 绑定。默认连接模式为 WebSocket/Channel，因为它不要求本地 TooGraph 暴露公网 webhook。
- Feishu/Lark 手动 fallback 只要求 App ID、App Secret 和 connection mode。`encrypt key`、`verification token`、event subscription URL 仅在用户选择 webhook 模式时作为高级配置出现，第一屏不展示。
- 所有 secret 输入都应有保存反馈，但保存后不回显原值。
- 自动或手动写入的 raw secret 只进入本地运行时 secret store；普通 binding API 只返回 `secret_summary`。
- 测试连接应返回结构化诊断：凭据是否可用、webhook 是否可达、权限是否缺失、最后一次平台 API 错误。

视觉和交互应复用现有组件库和 AppShell 风格。这个页面是运维管理面板，不做营销式 hero。信息密度应偏高但清晰，状态 badge、操作按钮、错误提示和最近事件要易扫读。

## Buddy 历史呈现

外部平台会话在 Buddy 历史中应有明确来源，而不是混在普通 Buddy 对话里无法区分。

建议：

- Buddy session title 初始从平台 chat title 或 sender name 派生，例如 `Telegram / Abyss`、`Feishu / 产品群 / 需求讨论`。
- Buddy session `source` 使用 `telegram`、`feishu` 等平台 id。
- Buddy 会话列表显示来源 badge。
- Buddy 消息行可以在 metadata 中显示“来自 Telegram”或“来自 Feishu/Lark”，但不要让这个标签进入 LLM 用户文本。
- Buddy 搜索结果保留 source filter，支持按平台过滤。
- RunDetail 能看到这次 run 是由 message platform ingress 触发，并展示 external event id、chat/thread、sender 和 delivery 状态。

如果用户在 Buddy 页面手动打开同一外部平台 session 并继续输入，默认应继续作为同一 Buddy session。消息来源仍可区分为 `buddy_ui` 或 `message_platform`。

## 权限与安全

默认安全策略应保守：

- 未配置 allowlist 时，不允许群聊中的任意用户触发 Buddy。
- DM 可以支持 pairing，但第一阶段可以先只做显式 allowlist。
- Telegram 群聊需要 allowed chats/topics 或 require mention 策略。
- Feishu webhook 必须校验 verification token、encrypt key 或签名。
- 外部消息内容是低信任上下文，不是系统指令。
- 外部平台不能绕过 TooGraph 的 Action 权限、文件写入审批、网络访问限制和图编辑审批。
- 平台配置中的 secret 不进入 run state、Buddy memory、artifact 正文或前端普通响应。
- 高风险回复发送，例如主动发群消息、批量通知、定时任务发消息，应走显式 Action 或 scheduled graph job approval。

需要防护的失败模式：

- webhook 重放导致重复 Buddy run。
- 平台重试导致重复回复。
- 长消息或媒体导致 prompt 过大。
- 群聊用户伪造指令让 Buddy 执行本地副作用。
- 平台 API 错误把 token 或 raw provider error 发回聊天。
- Feishu 或 Telegram webhook 暴露在公网时缺少签名和速率限制。

## 记忆与会话边界

建议默认策略：

- 所有入口共享同一个 Buddy persona、长期记忆和行为边界。
- 每个外部平台 chat/thread 有独立 Buddy session。
- 会话历史上下文只从该 Buddy session lineage 裁剪，不自动混入其他平台的普通聊天。
- 长期记忆召回仍可跨入口，但必须按现有 memory/context package 权限边界进入 prompt。

后续可加高级选项：

- 每个平台独立记忆边界。
- 每个绑定独立 Buddy profile。
- 企业平台只允许使用 workspace-scoped memory。
- 特定群聊禁用长期记忆写入，只保留短期 session summary。

当前建议先保持“共享 Buddy 身份，隔离会话历史”。这能满足“外部消息像 Buddy 窗口输出一样进入历史”的目标，同时避免一开始把 persona/memory 设计拆得过碎。

## 可审计性

每次外部平台消息至少应可追溯到：

- platform binding。
- external message id / update id。
- external chat/thread/sender。
- Buddy session id。
- Buddy user message id。
- graph run id。
- Buddy assistant message id。
- outbound delivery result。

UI 上的诊断入口：

- 消息平台页面：平台级最近事件和连接错误。
- Buddy 会话：来源 badge、消息 metadata、run link。
- RunDetail：入口来源、外部事件摘要、delivery artifact、错误和 retry。

事件不应只写进文本日志。日志可以用于开发诊断，但产品 UI 应读取结构化 audit/event 表。

## 测试策略

后端测试：

- platform catalog 返回 Hermes 参考平台目录和 TooGraph support level。
- config store 保存配置时脱敏 secret。
- status store 能表示 disabled、not configured、connected、error。
- fake adapter 产出 inbound event 后，能创建或复用 Buddy session。
- inbound event 会追加 user message，metadata 正确写入。
- graph run 完成后能追加 assistant message 并写 `run_id`。
- dedup 命中不会重复触发 Buddy run。
- unauthorized sender 不会创建 Buddy message。

前端测试：

- 左侧栏出现“消息平台”导航项。
- `/message-platforms` 页面能展示 supported/planned/reference 平台。
- Telegram/Feishu 卡片能展示配置状态、连接状态和错误状态。
- secret 字段保存后不回显原文。
- 最近会话链接能跳到 Buddy history。

集成测试：

- 使用 fake Telegram adapter 模拟 DM 入站消息，验证 Buddy history 能搜索到消息，assistant message 关联 run id。
- 使用 fake Feishu adapter 模拟 group/thread 入站消息，验证平台会话映射和 metadata。
- 模拟平台重试同一 external message id，验证只产生一个 Buddy run。

文档-only 阶段不需要启动 TooGraph。实现阶段改动 UI 或 runtime 后，应按仓库规则使用 `npm start` 做本地验证，并尽量补浏览器截图。

## 分阶段落地

第一阶段：设计和 UI 壳

- 新增平台 catalog。
- 新增 `/message-platforms` 页面和左侧栏入口。
- 展示平台目录、状态空值、Telegram/Feishu 配置表单占位。

第二阶段：后端 gateway primitive

- 新增 adapter 合同、config store、status store、fake adapter。
- 新增 API：list catalog、get/update binding、start/stop/reload binding、list events。

第三阶段：Buddy ingress

- 新增 external thread 到 Buddy session mapping。
- 接入 Buddy store 和 Buddy run template binding。
- fake adapter 端到端写入 Buddy history。

第四阶段：Telegram + Feishu

- 先接 Telegram polling 或 webhook 的一种稳定模式。
- 再接 Feishu WebSocket/Channel 作为默认稳定模式；webhook 作为需要公网地址和签名/解密配置的高级模式。
- Feishu 绑定优先实现自动扫码创建应用；用户手动复制 App ID/App Secret 只作为 fallback。
- 媒体先作为附件 artifact 进入 metadata，复杂语音/文件解析后续补。

第五阶段：诊断和运维

- 结构化事件页。
- 测试连接和 webhook health。
- delivery retry 和错误展示。
- 平台会话列表和 Buddy 跳转。

第六阶段：扩展平台

- 根据 Hermes adapter 成熟度逐个翻译。
- 每新增一个平台都要先补 catalog、配置 schema、fake adapter 测试和安全策略。

## 风险与待决问题

需要产品确认的问题：

- 外部平台消息是否默认共享 Buddy 的长期记忆，还是每个平台独立记忆边界。本文建议先共享 persona/memory，但隔离 session history。
- 群聊里 Buddy 应该何时响应：所有消息、仅 mention、仅 allowlisted topic、还是命令触发。
- 外部平台回复是否需要 streaming。Telegram/Feishu 都支持某种渐进更新，但第一阶段可以只发送最终回复。
- 是否允许从 Buddy 页面向外部平台主动发送消息。本文建议先不开放，后续作为显式 Action 或 scheduled graph job。

技术风险：

- Feishu webhook 需要公网可达地址，本地开发可能依赖 tunnel；websocket 模式更适合本地但依赖平台 app 权限。
- Telegram polling 和 webhook 不应同时启用同一个 bot token，否则容易冲突。
- TooGraph 当前启动是单端口模型，gateway 长连接生命周期要和 `npm start` 统一，不能额外要求用户手动启动一个长期后台进程。
- secret store、runtime status、media cache、webhook raw event 都必须明确放在运行时数据目录，避免进入 git。
- 多平台消息高并发时需要队列和 per-session serialization，避免同一 Buddy session 同时跑多个主循环导致历史顺序错乱。

## 推荐结论

这个能力应作为 TooGraph 的“多入口 Buddy”来做，而不是作为独立 Hermes clone。

最小可接受目标是：

- 左侧栏有“消息平台”页面。
- 页面展示完整平台目录，Telegram 和 Feishu/Lark 可配置。
- 平台状态和最近事件可见。
- 外部入站消息写入 Buddy history。
- Buddy 主循环通过图模板运行。
- 回复保存到 Buddy history 并发回平台。
- Buddy 搜索和 RunDetail 能追溯这次外部平台对话。

这样既能满足用户从 Telegram、Feishu 等平台和 Buddy 对话的体验，也保持 TooGraph 的图优先、可审计、可恢复和权限清晰的产品架构。
