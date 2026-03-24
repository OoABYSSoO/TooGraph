# 桌宠自我设定、自动记忆与版本备份设计

## 设计结论

桌宠的人设、记忆、语气、行为边界和会话摘要属于 GraphiteUI 的产品状态，不属于桌宠对话面板的临时 UI 状态，也不是某个 skill 包内的资源。

第一阶段应直接采用后端数据层：

- 在侧边栏新增独立的 Companion 页面，用于管理桌宠自我设定和记忆。
- 桌宠对话面板只负责对话、展示队列和轻量状态，不承载配置管理。
- 后端提供 Companion API，第一版可以用 JSON 文件持久化，但必须通过后端读写。
- 自动记忆是桌宠核心能力，不提供关闭开关，也不在每次记忆前询问确认。
- 用户通过 Companion 页面查看、编辑、删除和恢复设定与记忆。
- 每一次更新都必须先备份旧值，形成可追溯、可恢复的 revision。

## 范围边界

本文只设计桌宠自我设定和记忆系统，不开放桌宠图写入能力。

图操作档位仍按 `2026-05-05-agent-companion-graph-orchestration.md` 执行：

- 建议档：只读图，只给解释和建议。
- 审批档：未来生成图草案或补丁，用户确认后应用。
- 全权限档：未来通过命令系统直接操作图。

自我设定和记忆不受这三档限制。用户在任何档位都可以编辑桌宠人设、记忆、语气和行为边界。

## 侧边栏 Companion 页面

侧边栏新增一个一级入口，建议命名为 `Companion` 或 `桌宠`。页面职责：

- 编辑 `companion_profile`：名字、人设、语气、默认回复风格、展示偏好。
- 编辑 `companion_policy`：行为边界、沟通偏好、允许主动提醒的场景。
- 查看和管理 `companion_memory`：长期记忆、用户偏好、项目背景、设计原则。
- 查看 `companion_session_summary`：当前对话摘要和最近更新时间。
- 查看每条设定和记忆的历史版本。
- 从历史版本恢复当前值。

宠物浮窗不放这些管理入口。它只保留对话、发送队列、当前档位显示和必要错误提示。

## 后端数据模型

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

## API 设计

第一阶段 API：

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

所有写接口都必须通过同一套 revision 写入路径。

## 自动记忆规则

自动记忆是默认能力，不提供开关。

每轮桌宠对话结束后，后台运行一个 `memory curator`。它不是回复 Agent 本身，而是独立整理器：

1. 读取本轮用户消息、桌宠回复、当前摘要和已有记忆索引。
2. 判断是否出现长期有价值的信息。
3. 如果是新信息，创建记忆。
4. 如果与已有记忆重复或冲突，更新已有记忆。
5. 如果用户删除过类似记忆，把删除记录作为强负反馈。
6. 如果没有长期价值，不写入。

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
- 大文件内容、base64、图片原文、视频帧原文。
- 当前图里可以重新读取到的节点结构。
- 没有长期用途的路径、URL、临时下载结果。

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
  "changed_by": "user | companion | memory_curator",
  "change_reason": "用户在 Companion 页面更新。| 自动记忆整理。| 用户恢复历史版本。",
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

桌宠发送队列处理每条消息时，应在构建 `companion_chat_loop` 图之前读取后端 Companion 上下文：

1. 读取 profile。
2. 读取 policy。
3. 基于当前用户消息召回少量相关 memory。
4. 读取 session summary。
5. 把这些上下文用明确边界注入模板，例如 `<companion-profile>`、`<memory-context>`。
6. 继续保留程序级建议档限制，不让 prompt 覆盖权限门禁。

召回记忆只作为只读背景，不写入用户可见消息，不伪装成用户输入。

## 测试要求

后端测试：

- 默认 profile/policy/memory/summary 文件不存在时能返回默认值。
- 每次 PUT/PATCH/DELETE 都创建 revision。
- 删除 memory 后不出现在默认召回结果里。
- restore 会创建新的 revision。
- memory curator 不保存 base64、大媒体、一次性运行日志。

前端测试：

- 侧边栏出现 Companion 入口。
- Companion 页面能加载 profile、policy、memory 和 session summary。
- 编辑 profile 会调用后端 API，并展示保存状态。
- 删除 memory 后 UI 中不再作为启用记忆显示。
- 历史版本面板能列出 revisions，并触发 restore。

桌宠对话测试：

- 构建对话图时注入 profile、policy、memory context 和 session summary。
- 被删除的 memory 不进入注入内容。
- 建议档下仍不注册图写入能力。

## 第一阶段交付

第一阶段只交付自我设定和记忆闭环：

- 后端 JSON 数据层和 API。
- 侧边栏 Companion 页面。
- 自动 memory curator 的保守规则版本。
- 每次更新备份旧值的 revision 机制。
- 桌宠对话图读取并注入后端 Companion 上下文。

不在第一阶段交付：

- 向量检索。
- 多用户同步。
- 审批档或全权限档图写入。
- 图草案预览和 GraphCommandBus。
