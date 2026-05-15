# Buddy 记忆系统设计

## 目标

TooGraph Buddy 的记忆系统采用 Hermes 风格的两层模型：

1. `buddy_home/MEMORY.md` 是 Buddy 长期记忆的唯一权威来源。
2. `buddy.db` 保存会话历史、会话召回索引、写入命令和可恢复版本。

这个设计的核心目标是删除重复记忆体系，而不是把它们隐藏起来。用户不应该判断多套记忆库谁是对的，也不应该审批候选记忆。后台可以自动整理记忆，但每次自动变更都必须留下变更历史，用户可以从历史恢复到之前的设定。

## 核心决定

- `MEMORY.md` 是唯一长期记忆权威。
- `SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json` 是 Buddy Home 的人类可读设定面。
- `buddy.db` 不是另一套长期记忆。它只保存会话历史、索引、命令、版本和少量运行状态。
- `buddy_memories` 不再作为目标架构的一部分。
- 平台 `memories` 体系从产品中删除，不做隐藏入口，不作为备用记忆库。
- 用户不再看到候选记忆、应用、拒绝、替代、归档这类判断流程。
- 后台整理记忆由图模板完成。
- 单元能力继续封装成 Skill，图模板负责流程编排。
- 自动写入不需要用户逐条确认，但必须有 command、revision、diff 或等价历史。

## 不做的事

- 不接入 Honcho、Mem0、Holographic 或其他外部记忆 provider。
- 不保留平台 memory 作为隐藏 fallback。
- 不维护两个可编辑长期记忆源。
- 不让 Skill 承担多步自治、记忆策略或后台整理循环。
- 不把候选记忆审批作为用户体验的一部分。

## 当前问题

当前 TooGraph 存在多套容易混淆的记忆概念：

- `buddy_home/MEMORY.md`
- `buddy.db` 里的 `buddy_memories`
- `buddy.db` 里的 `buddy_kv.session_summary`
- 平台 `memories`、`memory_revisions`、`memory_events`、`memories_fts`
- `memory_recall` 和 `memory_candidate_writer`
- Buddy 页面里的 Buddy memory 列表和 platform candidate memory 面板

这些东西都在表达“记忆”，但权威关系不清楚。整理后，长期记忆只看 `MEMORY.md`；历史召回只查 `buddy_messages`；恢复能力只看 revision/command 历史。

## 目标架构

### 1. Buddy Home 文件

Buddy Home 是长期设定和长期记忆的人类可读来源。

保留文件：

- `AGENTS.md`：Buddy Home 本地工作规则。
- `SOUL.md`：Buddy 身份、语气、回应风格。
- `USER.md`：用户画像和稳定协作偏好。
- `MEMORY.md`：唯一长期记忆。
- `policy.json`：行为边界和权限策略。
- `reports/`：后台整理或复盘产生的可审阅报告。

`MEMORY.md` 只保存稳定、压缩、长期有用的信息。不要保存 raw log、完整错误、完整对话、临时路径、密钥、base64、大型 artifact，或可以从项目文件重新读取的信息。

### 2. Buddy DB

Buddy DB 是运行状态和审计存储，不是长期记忆权威。

保留：

- `buddy_sessions`：Buddy 聊天会话元信息。
- `buddy_messages`：Buddy 聊天消息、运行关联消息和输出 trace。
- `buddy_revisions`：Buddy Home 和 Buddy 设置的可恢复版本。
- `buddy_commands`：写入、恢复和自动整理的命令记录。
- `buddy_kv`：有限的 Buddy 内部状态，例如当前绑定模板、能力使用统计。`session_summary` 是否保留要单独评估。

新增或保留索引：

- `idx_buddy_messages_session`
- `idx_buddy_messages_client_order`
- `buddy_messages_fts`
- `buddy_messages_fts_trigram`

删除：

- `buddy_memories`
- 与 `buddy_memories` 绑定的创建、更新、删除接口和 UI。
- `MEMORY.md` 从 `buddy_memories` 渲染出来的投影模式。

调整后，编辑长期记忆就是编辑 `MEMORY.md`。如果 UI 需要更友好的分段编辑，它应该读写 `MEMORY.md` 的章节或条目，并通过 revision 保存整个文件或结构化 diff，而不是再建一张记忆表。

### 3. 会话召回

会话召回用于找回历史对话，不等于长期记忆。

它回答的问题是：

- 之前我们讨论过什么？
- 哪次对话里处理过这个问题？
- 某个图运行或页面操作当时发生了什么？

会话召回应搜索 `buddy_messages`，不搜索 `MEMORY.md`。

目标能力参考 Hermes `session_search`：

- `browse`：列出最近 Buddy 会话，包含标题、预览、时间和消息数。
- `discover`：根据查询词搜索历史消息，返回命中会话和命中消息附近窗口。
- `scroll`：根据 `session_id` 和消息锚点继续向前或向后展开窗口。

召回结果必须来自真实 DB 消息，不能由 LLM 生成历史摘要。LLM 可以在后续节点理解召回结果，但召回 Skill 本身只做检索和裁剪。

中文和混合语言检索需要 `buddy_messages_fts_trigram`，避免普通 FTS 对中文短语和子串检索效果差。

### 4. 后台整理记忆图模板

后台整理记忆是一个图模板，不是隐藏后端逻辑。

输入：

- 最近 Buddy 对话。
- 会话召回结果。
- 当前 `SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json`。
- 相关 run 输出、activity events、operation journal 或报告。

图模板判断：

- 是否需要更新长期记忆。
- 应更新哪个 Buddy Home 文件。
- 新内容和旧内容的差异是什么。
- 为什么这次自动整理合理。
- 是否应该只写报告而不改长期记忆。

输出和副作用：

- 通过受控 Skill 更新 `MEMORY.md`、`USER.md` 或其他允许的 Buddy Home 文件。
- 写入 `buddy_commands`。
- 写入 `buddy_revisions`。
- 必要时生成 `buddy_home/reports/*.md`。

默认第一阶段只允许自动更新 `MEMORY.md`。`SOUL.md`、`policy.json` 这类高影响设定不应由后台整理自动修改，除非后续单独设计权限规则。

### 5. Skill 边界

Skill 只做单次受控能力调用。

目标 Skill：

- `buddy_home_reader`：读取 Buddy Home 文件，返回结构化上下文。
- `buddy_home_writer`：通过 command/revision 路径写 Buddy Home 文件。
- `buddy_session_recall`：基于 `buddy_messages` 和 FTS 做 browse/discover/scroll。
- `buddy_report_writer`：写简洁复盘报告。如果 `buddy_home_writer` 已覆盖 report 写入，可以不单独拆。
- `buddy_revision_restore`：恢复历史版本。如果 command path 已覆盖，可以不单独拆。

删除或替换：

- `memory_recall`：删除；用 `buddy_session_recall` 或 `buddy_home_reader` 替代。
- `memory_candidate_writer`：删除。
- 所有平台 memory 专属生命周期能力：删除。

### 6. 用户体验

用户应该看到：

- 当前 Buddy Home 文件内容。
- 当前 `MEMORY.md`。
- Buddy 聊天历史。
- 后台整理记忆的运行记录。
- 每次自动变更的摘要、原因和 diff。
- 变更历史和恢复按钮。

用户不应该看到：

- 平台 memory 列表。
- 候选记忆列表。
- 应用、拒绝、替代、归档候选记忆按钮。
- 与 `MEMORY.md` 不一致的另一套长期记忆。
- 会影响 Buddy 回复但没有对应 Buddy Home 或 revision 记录的隐藏记忆。

## 写入规则

### 用户直接编辑 Buddy Home

流程：

1. UI 发起 Buddy command。
2. 后端读取目标文件当前内容。
3. 后端写入目标 Buddy Home 文件。
4. 后端记录 `buddy_revisions`，包含 previous 和 next。
5. 后端记录 `buddy_commands`，包含 action、reason、target、run_id 或 actor。

长期记忆编辑必须落到 `MEMORY.md`。

### Buddy 聊天写入

流程：

1. UI 创建或更新 `buddy_sessions`。
2. 用户消息写入 `buddy_messages`。
3. Buddy 回复写入 `buddy_messages`。
4. 与 run 相关的输出 trace 可写入 `buddy_messages.metadata_json`。
5. FTS 索引自动更新。

这些消息是历史材料，不是长期记忆。只有后台整理图模板更新 `MEMORY.md` 后，它们才变成长期记忆的一部分。

### 后台自动整理写入

流程：

1. 后台整理图读取 Buddy Home 和会话召回上下文。
2. LLM 节点生成结构化写入计划。
3. 写入 Skill 校验目标文件、写入范围和风险。
4. 写入 Skill 通过 command/revision 路径更新 `MEMORY.md`。
5. 运行详情展示本次整理活动。
6. Buddy 页面变更历史可恢复到整理前版本。

不需要用户确认自动整理写入，但必须可见、可追踪、可恢复。

## 删除范围

目标是删除不需要的系统，而不是隐藏入口。

后端删除候选：

- `backend/app/memory/`
- `backend/app/api/routes_memories.py`
- `memories`、`memory_revisions`、`memory_events`、`memories_fts` 的 schema 初始化和迁移路径
- 平台 memory 相关测试

Skill 删除候选：

- `skill/official/memory_recall/`
- `skill/official/memory_candidate_writer/`

前端删除候选：

- `frontend/src/api/memories.ts`
- `frontend/src/types/memory.ts`
- Buddy 页面 platform memory candidate 面板
- Run Detail 中专门展示 platform `memory_context` 的视图

模板更新候选：

- 所有声明或调用 `memory_recall` 的官方模板。
- 所有声明或调用 `memory_candidate_writer` 的官方模板。
- `buddy_autonomous_review` 应改为后台整理 Buddy Home，而不是写 platform memory candidate。

文档更新候选：

- `README.md`
- `docs/future/buddy-autonomous-agent-roadmap.md`
- `skill/SKILL_AUTHORING_GUIDE.md`
- 任何把 platform memory candidate 描述为产品能力的文档。

## 迁移策略

1. 检查现有 platform `memories` 中是否有需要保留的内容。
2. 如有必要，生成一次迁移报告。
3. 把确实有价值的内容人工或一次性脚本合并进 `buddy_home/MEMORY.md`。
4. 删除 platform memory UI、API、Skill 和模板依赖。
5. 删除 `buddy_memories` 长期记忆表及其 UI/command 路径。
6. 增加 `buddy_messages` FTS 和 `buddy_session_recall`。
7. 改造后台整理模板，让它直接写 `MEMORY.md` 并记录 revision。
8. 保持 revision restore 能恢复自动整理前的版本。

如果现有 platform memory 没有保留价值，可以跳过迁移报告，直接删除。

## 推荐第一阶段

第一阶段只做最小闭环：

1. 明确 `MEMORY.md` 是唯一长期记忆权威。
2. 删除 platform memory 的 UI、API、Skill 和模板依赖。
3. 删除 `buddy_memories` 作为长期记忆源。
4. 给 `buddy_messages` 增加 FTS 和 trigram FTS。
5. 新增 `buddy_session_recall` Skill。
6. 后台整理图模板只允许自动更新 `MEMORY.md`。
7. 所有自动更新都走 `buddy_commands` 和 `buddy_revisions`。

这样 TooGraph 的 Buddy 记忆模型会变成：

- 长期记忆：`MEMORY.md`
- 会话召回：`buddy_messages` + FTS
- 自动整理：图模板
- 原子能力：Skill
- 用户恢复：revision history
