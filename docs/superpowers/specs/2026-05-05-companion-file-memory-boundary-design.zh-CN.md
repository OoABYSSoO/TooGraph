# 桌宠文件记忆边界设计

## 背景

GraphiteUI 目前有一个 `companion_state` 技能。它会读取桌宠的 profile、policy、memories 和 session summary，也会整理并写入记忆更新。这个方案能工作，但它把桌宠专属产品策略、文件路径、记忆路由和底层文件修改都放进了同一个技能包里。

更合适的方向是：把文件访问做成可复用的基础能力，把桌宠记忆的位置和编排逻辑放回桌宠对话循环模板。技能只暴露明确的文件读写能力；图模板负责决定哪些文件参与本轮运行、路径如何进入 state、什么时候允许写入长期记忆。

## 目标

- 桌宠运行期数据继续放在 `backend/data/companion/`。
- 用可复用的本地文件技能替代桌宠专用的读写边界。
- 让桌宠对话循环模板显式声明记忆文件路径，并通过 `state_schema` 路由数据。
- 写操作必须通过结构化结果、必要的 revision 记录和图运行详情保持可审计。
- 白名单范围可以比桌宠数据更大，但不能变成不受限制的仓库写入能力。

## 非目标

- 不把桌宠记忆迁移到前端 localStorage。
- 不把运行期记忆存进 `skill/` 包或模板 JSON 文件。
- 不允许任意绝对路径或隐藏文件系统访问。
- 本次变更不实现图写入权限、审批档或完整桌宠图操作能力。

## 备选方案

### 推荐方案：通用文件技能 + 模板声明路径

新增一个可复用的本地文件技能，例如 `local_file`，支持在白名单路径内读取和写入文件。桌宠对话循环模板拥有 profile、policy、memories、session summary 和 revisions 的路径常量。Agent 节点产出结构化计划；技能节点执行明确的文件操作。

这个边界最干净：技能是能力，模板是产品行为，数据是运行期存储。

### 窄化方案：桌宠专用文件技能

新增一个只能访问 `backend/data/companion/` 的小技能，但把记忆路由逻辑从技能中移走。这个方案第一步更安全，不过它很快会变成另一个桌宠专用原语，也无法帮助其他需要受控本地文件访问的模板。

### 拒绝方案：继续让 `companion_state` 负责一切

保留当前包，只逐步增加配置。这样短期改动最少，但会保留混乱边界：一个技能仍然知道桌宠存储位置、prompt 格式、路由规则和修改行为。

## 存储位置

桌宠记忆和自我设定数据应继续放在：

```text
backend/data/companion/
```

第一版稳定文件布局：

```text
backend/data/companion/profile.json
backend/data/companion/policy.json
backend/data/companion/memories.json
backend/data/companion/session_summary.json
backend/data/companion/revisions.json
```

这些文件是运行期用户数据，不是技能源码，不是图模板定义，也不是前端状态。这个位置便于备份、检查、迁移，也便于从普通源码提交中排除。

## 白名单模型

基础文件技能应把所有路径解析为相对仓库根目录的路径，并在触碰文件系统前拒绝不安全路径。

默认允许：

```text
backend/data/companion/
```

模板显式声明后允许：

```text
backend/data/memories/
backend/data/kb/
backend/data/skill_artifacts/
```

受限允许，需要更强权限标记或不同技能模式：

```text
docs/
skill/
backend/app/templates/
```

始终禁止：

```text
.git/
.env
node_modules/
dist/
.worktrees/
backend/data/settings/
logs and .dev_* logs
absolute paths outside the repository
paths containing .. after normalization
```

这个模型让白名单比桌宠记忆目录更大，但仍然保留可见的权限边界。模板可以请求更宽的允许根目录，但运行时仍然必须校验解析后的真实路径。

## 技能契约

可复用技能应该是一个小型文件系统原语。建议 manifest 形状如下：

- `skillKey`: `local_file`
- `permissions`: `file_read`, `file_write`
- `targets`: `agent_node`, `companion`
- `sideEffects`: `file_read`, `file_write`

建议输入：

- `operation`: `read_json`、`write_json`、`append_json_array` 或 `write_text`
- `path`: 仓库相对路径
- `content`: 写操作使用的文本或 JSON 内容
- `allowed_roots`: 可选的仓库相对根目录列表，由模板或节点配置传入
- `write_mode`: `create`、`replace`、`merge_object` 或 `append_array`
- `revision`: 是否为写操作创建 revision
- `revision_path`: 启用 revision 时使用的仓库相对 revision 存储路径
- `change_reason`: 用于审计输出的人类可读修改原因
- `changed_by`: 操作者标签，例如 `companion_chat_loop`

建议输出：

- `status`
- `path`
- `operation`
- `content`，用于读取结果
- `previous_content` 或紧凑 hash，用于写入结果
- `revision_id`，当创建 revision 时返回
- `warnings`
- `error`

这个技能不应该知道“桌宠记忆”是什么意思。它只负责校验路径、读写数据，并返回结构化结果。

## 桌宠对话循环模板

桌宠对话循环模板应在 state 或节点配置中声明记忆路径，而不是依赖桌宠专用技能里的隐藏默认值。

建议新增 state：

- `companion_profile_path`
- `companion_policy_path`
- `companion_memories_path`
- `companion_session_summary_path`
- `companion_revisions_path`

循环可以表达为：

1. Input 节点接收用户消息、对话历史、页面上下文和桌宠档位。
2. 文件技能节点从模板声明的路径读取 profile、policy、memories 和 session summary。
3. 格式化节点或 agent 节点把原始 JSON 转成带边界的 prompt context。
4. 回复 agent 只产出 `companion_reply`。
5. 整理 agent 产出 profile、policy、memory 和 session summary 的结构化更新计划。
6. 文件技能节点把自动允许的自我设定写入声明的文件路径。
7. Output 节点展示回复，并暴露写入结果、revision ID、warning 和 error。

这样，记忆行为会在图运行中可见。产品规则由模板编码，技能保持可复用。

## 错误处理

- 缺失的桌宠文件应按文档默认值读取，并可在第一次写入时创建。
- JSON 无效时默认失败关闭并返回错误，除非操作显式允许修复。
- 被拒绝的路径应返回结构化权限错误，且不能创建部分文件。
- 写操作应是原子的：先写入同级临时文件，再替换目标文件。
- revision 写入应发生在替换当前值之前。
- 如果整理 agent 没有产出长期有效更新，不应调用文件技能进行写入。

## 测试

后端重点测试应覆盖：

- 路径规范化会拒绝绝对路径和目录穿越。
- 默认白名单允许 `backend/data/companion/`。
- 模板声明白名单允许预期的数据目录。
- denylist 会阻止 `.git/`、`.env`、`backend/data/settings/`、`dist/` 和日志。
- JSON 读写能保留 UTF-8 内容。
- 启用 revision 的写操作会记录 previous 和 next value。
- 桌宠对话循环模板不再为了文件修改绑定 `companion_state`。
- 模板会在 `state_schema` 或节点配置中显式声明桌宠文件路径。

文档检查应确保旧的 `companion_state` 方向在实现落地后被标记为 superseded，或折叠进这个新设计。

## 迁移计划

1. 新增通用 `local_file` 技能和测试。
2. 更新桌宠对话循环模板，让它显式声明桌宠文件路径。
3. 用文件技能读取、整理 agent 规划、文件技能写入替换 `companion_state` 的 load 和 curate 调用。
4. 保留现有桌宠数据文件形状的兼容测试。
5. 当模板不再依赖 `companion_state` 后，移除或废弃 `skill/companion_state`。
6. 更新 future docs，把桌宠记忆策略描述为模板编排加可复用文件原语。

## 待定设计点

第一版实现可以让 `local_file` 成为带保守白名单的完整通用技能，也可以只开放默认目录和模板声明的数据目录。推荐的第一版是保守通用版本：默认允许 companion 数据，额外允许模板显式声明的数据根目录；源码和文档目录先保持受限，等有更强权限路径后再开放。
