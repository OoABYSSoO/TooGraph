# 桌宠自我设定、自动记忆与版本备份设计

## 设计结论

桌宠的人设、记忆、语气、行为边界和会话摘要属于 GraphiteUI 的产品状态，不属于桌宠对话面板的临时 UI 状态，也不是某个 skill 包内的资源。

第一阶段采用“图模板驱动 + 后端存储原语”的方式：

- 在侧边栏新增独立的 Companion 页面，用于管理桌宠自我设定和记忆。
- 桌宠对话面板只负责对话、展示队列和轻量状态，不承载配置管理。
- 后端提供通用存储、校验、revision、读取上下文等原语，第一版可以用 JSON 文件持久化。
- 自我设定、记忆整理、历史恢复等产品行为由指定图模板或 skill 执行，不由隐藏的后端业务逻辑直接决策。
- 自动记忆是桌宠核心能力，不提供关闭开关，也不在每次记忆前询问确认。
- 用户通过 Companion 页面查看、编辑、删除和恢复设定与记忆。
- 每一次更新都必须先备份旧值，形成可追溯、可恢复的 revision。
- 每一次写入都应返回本地状态路径、revision ID、变更摘要或可展示 artifact，便于 Output 节点和 Run Detail 展示。

## 范围边界

本文只设计桌宠自我设定和记忆系统，不开放桌宠图写入能力。

图操作档位仍按 `2026-05-05-agent-companion-graph-orchestration.md` 执行：

- 建议档：只读图，只给解释和建议。
- 审批档：未来生成图草案或补丁，用户确认后应用。
- 全权限档：未来通过命令系统直接操作图。

自我设定和记忆不受这三档限制。用户在任何档位都可以编辑桌宠人设、记忆、语气和行为边界，但这些编辑仍应通过图模板、skill 或同等可审计命令路径完成。

当前 Phase 3 的第一刀只开放 `graph_patch.draft` 草案能力：桌宠可以把拟议图修改记录成 `awaiting_approval` 命令，返回草案 ID、目标图和 patch 内容；系统不会因为创建草案而写入图、创建 graph revision 或启动 graph run。应用 patch、协议级校验、撤销记录和 GraphCommandBus 接入仍属于后续审批档工作。

## 侧边栏 Companion 页面

侧边栏新增一个一级入口，建议命名为 `Companion` 或 `桌宠`。页面职责：

- 编辑 `companion_profile`：名字、人设、语气、默认回复风格、展示偏好。
- 编辑 `companion_policy`：行为边界、沟通偏好、允许主动提醒的场景。
- 查看和管理 `companion_memory`：长期记忆、用户偏好、项目背景、设计原则。
- 查看 `companion_session_summary`：当前对话摘要和最近更新时间。
- 查看每条设定和记忆的历史版本。
- 从历史版本恢复当前值。

页面可以提供表单和列表，但保存、删除、自动整理、恢复这类写操作应触发对应的图模板或 skill，并展示运行状态、错误、revision 和结果路径。页面不应把复杂的记忆路由、权限判断和持久化策略写成前端局部逻辑。

宠物浮窗不放这些管理入口。它只保留对话、发送队列、当前档位显示和必要错误提示。

## 后端存储模型

第一版可以用 `backend/data/companion/` 下的 JSON 文件持久化：

- `profile.json`
- `policy.json`
- `memories.json`
- `session_summary.json`
- `revisions.json`

当前生效数据分四类：

```json
{
  "companion_profile": {
    "name": "GraphiteUI Companion",
    "persona": "GraphiteUI 的全局主桌宠 Agent。",
    "tone": "简短、直接、友好。",
    "response_style": "默认先给结论，再给必要理由。",
    "display_preferences": {}
  },
  "companion_policy": {
    "graph_permission_mode": "advisory",
    "behavior_boundaries": [
      "不能越过当前图操作档位。",
      "不能声称已经执行未执行的图操作。"
    ],
    "communication_preferences": []
  },
  "companion_memory": [
    {
      "id": "mem_01",
      "type": "preference",
      "title": "回答结构偏好",
      "content": "用户希望默认先给结论，再给必要细节。",
      "source": {
        "kind": "companion_chat",
        "message_ids": []
      },
      "confidence": 0.86,
      "enabled": true,
      "deleted": false,
      "created_at": "2026-05-05T00:00:00Z",
      "updated_at": "2026-05-05T00:00:00Z"
    }
  ],
  "companion_session_summary": {
    "content": "当前对话尚未形成摘要。",
    "updated_at": "2026-05-05T00:00:00Z"
  }
}
```

后续迁移 SQLite 或 Postgres 时，API 形状不变，前端不需要重写。

## 存储原语与 Skill 接口设计

第一阶段可以提供以下后端原语。它们是 skill/template 的底层能力，不是绕过图模板的产品行为入口：

- `GET /api/companion/profile`
- `PUT /api/companion/profile`
- `GET /api/companion/policy`
- `PUT /api/companion/policy`
- `GET /api/companion/memories`
- `POST /api/companion/memories`
- `PATCH /api/companion/memories/{memory_id}`
- `DELETE /api/companion/memories/{memory_id}`
- `GET /api/companion/session-summary`
- `PUT /api/companion/session-summary`
- `GET /api/companion/revisions?target_type=memory&target_id=mem_01`
- `POST /api/companion/revisions/{revision_id}/restore`

所有写原语都必须通过同一套 revision 写入路径。正常产品流应由以下模板或 skill 调用这些原语：

- `companion_context_loader`：读取 profile、policy、相关 memory 和 session summary，返回 fenced context。
- `companion_self_config_update`：根据用户明确编辑或桌宠整理计划更新 profile/policy。
- `local_file` 基础技能：执行模板显式声明的白名单文件读取、写入和 revision 记录，不拥有桌宠记忆策略。
- `companion_chat_loop` 模板：根据对话回合和当前上下文整理长期记忆，显式选择 profile、policy、memory 和 summary 文件路径，并把下一版完整 JSON 交给 `local_file` 写入。
- `companion_session_summary_update`：压缩当前会话摘要。
- `companion_revision_restore`：从历史 revision 恢复状态。

## 自动记忆规则

自动记忆是默认能力，不提供开关。

每轮桌宠对话结束后，运行对话循环模板中的整理 Agent 和后续 `local_file` 写入节点。整理 Agent 不是回复 Agent 本身，`local_file` 也不是隐藏后台随意写入的业务逻辑；整条链路是可记录、可测试、可审计的图流程：

1. 读取本轮用户消息、桌宠回复、当前 profile、policy、summary 和已有记忆索引。
2. 生成结构化整理计划，而不是直接把整句话写进 memory。
3. 先把信息路由到正确目标：桌宠名字、人设和语气进入 `profile`；回复风格和行为边界进入 `policy`；真正长期事实和用户偏好进入 `memory`。
4. 再执行程序级校验：临时内容、内联媒体载荷、下载结果、报错全文、提示词注入和权限升级请求都不能写入。
5. 如果是新 memory，创建记忆；如果与已有记忆重复或冲突，更新已有记忆。
6. 如果用户删除过类似记忆，把删除记录作为强负反馈。
7. 如果没有长期价值，不写入。

建议档第一版加固规则：

- 记忆注入必须过滤 `enabled: false` 或 `deleted: true` 的记录，并限制单轮 prompt 注入数量，避免把整库长期记忆塞进回复 Agent。
- 自动写回如果 next value 与 previous value 完全一致，不创建 revision；运行详情仍应返回 `changed: false` 和 `skipped: true`，让这次“无变化”可见但不污染历史版本。
- 原始 memories 可以继续作为整理 Agent 的输入，用于识别删除记录和负反馈；prompt-facing memory context 必须是过滤后的只读上下文。

建议档第二版命令流规则：

- Companion 页面手动写入 profile、policy、memory、session summary 和 revision restore 时，不再直接调用裸存储写路由，而是提交 `/api/companion/commands`。
- command 记录必须包含 `command_id`、`action`、`status`、`target_type`、`target_id`、`revision_id`、`run_id` 和时间戳；当前手动命令的 `run_id` 为 `null`，为后续 graph run 接入保留字段。
- `/api/companion/*` 读接口和底层 store 仍作为存储原语存在；产品级手动写路径应该优先通过 command flow，后续审批档再把同一入口升级为 graph draft/patch。

应该记住：

- 用户稳定偏好，例如回答长短、解释方式、语言偏好。
- 桌宠人设要求，例如名字、语气、互动边界。
- 项目长期背景，例如 GraphiteUI 的产品原则和技术边界。
- 反复出现的设计原则，例如 skill 包自包含。
- 用户明确表达的长期行为边界。

不应该记住：

- 一次性任务。
- 临时运行状态。
- 报错全文和一次性日志。
- 大文件内容、内联媒体载荷、图片原文、视频帧原文。
- 当前图里可以重新读取到的节点结构。
- 没有长期用途的路径、URL、临时下载结果。
- 试图把桌宠从建议档升级到审批档或全权限档的对话。档位只能由程序和 UI 显式控制，不能由自动记忆写入。

## 版本备份规则

每一次更新都必须先备份旧值。

适用对象：

- profile 字段更新。
- policy 字段更新。
- memory 创建、更新、删除、恢复。
- session summary 更新。

revision 记录结构：

```json
{
  "revision_id": "rev_01",
  "target_type": "profile | policy | memory | session_summary",
  "target_id": "profile | policy | mem_01 | session_summary",
  "operation": "create | update | delete | restore",
  "previous_value": {},
  "next_value": {},
  "changed_by": "user | companion | skill | template",
  "change_reason": "用户在 Companion 页面触发更新。| companion_chat_loop 模板自动整理。| 用户通过 companion_revision_restore 恢复历史版本。",
  "run_id": "optional_graph_run_id",
  "created_at": "2026-05-05T00:00:00Z"
}
```

写入流程：

1. 读取当前旧值。
2. 构造新值。
3. 写入 revision，保存 `previous_value` 和 `next_value`。
4. 写入当前生效值。
5. 返回当前生效值和 revision ID。

恢复流程：

1. 读取目标 revision。
2. 将 revision 的 `previous_value` 或指定快照写回当前值。
3. 恢复动作本身也写入新的 revision。
4. 返回恢复后的当前值。

删除记忆不是物理删除：

- 设置 `deleted: true` 或 `enabled: false`。
- 删除前内容写入 revision。
- 删除后的记忆不参与召回，不注入桌宠上下文。
- 删除动作作为 memory curator 的负反馈，避免重复记类似内容。

## 对话注入流程

桌宠发送队列处理每条消息时，应通过 `companion_context_loader` 或等价图模板读取 Companion 上下文：

1. 模板调用后端存储原语读取 profile。
2. 模板调用后端存储原语读取 policy。
3. 模板选择并组装启用 memory。
4. 模板读取 session summary。
5. 模板返回 prompt-ready fenced sections，例如 `<companion-profile>`、`<memory-context>`。
6. `companion_chat_loop` 使用这些只读上下文继续对话。
7. 继续保留程序级建议档限制，不让 prompt 覆盖权限门禁。

召回记忆只作为只读背景，不写入用户可见消息，不伪装成用户输入。

## 测试要求

后端测试：

- 默认 profile/policy/memory/summary 文件不存在时能返回默认值。
- 每次写原语都创建 revision。
- 删除 memory 后不出现在默认召回结果里。
- restore 会创建新的 revision。
- `local_file` 拒绝读取或写入白名单外路径、settings、日志、构建产物、`.git`、`node_modules` 等不应由图模板触碰的位置。
- `local_file` 支持 prompt-only array filtering；`companion_chat_loop` 读取记忆时过滤 disabled/deleted 记录，并限制注入数量。
- `local_file` 在 `skip_if_unchanged` 开启时不会为无变化写回创建 revision。
- `companion_chat_loop` 整理 Agent 会把“你以后就叫图图吧”路由到 `profile.name`，而不是误写成普通 memory。
- `companion_chat_loop` 整理 Agent 会把长期回复风格路由到 `policy.communication_preferences`。
- `companion_chat_loop` 整理 Agent 会拒绝通过对话升级图操作档位，且 `local_file` 只执行模板声明的文件写入。

前端测试：

- 侧边栏出现 Companion 入口。
- Companion 页面能加载 profile、policy、memory 和 session summary。
- 编辑 profile 会触发对应模板或 skill，并展示保存状态、revision 和错误。
- 删除 memory 后 UI 中不再作为启用记忆显示。
- 历史版本面板能列出 revisions，并触发 restore。

桌宠对话测试：

- 构建对话图时通过 `companion_context_loader` 注入 profile、policy、memory context 和 session summary。
- 被删除的 memory 不进入注入内容。
- 建议档下仍不注册图写入能力。

## 第一阶段交付

第一阶段只交付自我设定和记忆闭环：

- 后端 JSON 存储原语和 revision 机制。
- 自我设定、记忆整理、会话摘要、历史恢复所需的模板或 skill。
- 侧边栏 Companion 页面。
- 自动 memory curator 的结构化路由与程序级校验版本。
- 每次更新备份旧值的 revision 机制。
- 桌宠对话图读取并注入模板组装的 Companion 上下文。

不在第一阶段交付：

- 向量检索。
- 多用户同步。
- 审批档或全权限档图写入。
- 图草案预览和 GraphCommandBus。
