# 桌宠自主 Agent 路线图

本文是 GraphiteUI 桌宠、自主工具循环、技能生成和长期协作能力的唯一参考文档。旧的桌宠权限、桌宠记忆、Skill 分类和阶段性实施计划都以本文为准；如果本文和旧文档、临时计划或实现草稿冲突，以本文为准。

## 目标

桌宠不是装饰物，也不是普通图内 Agent 节点。它是 GraphiteUI 工作台的全局协作入口，最终目标是帮助用户理解当前工作台状态、判断任务意图、选择合适技能、调用工具、评估结果、在缺少能力时提出补齐方案，并把重要经验沉淀成可审查、可复用的 Skill。

这条路线必须保持 GraphiteUI 的核心原则：

- 图优先：持久化操作、工具调用、记忆更新、技能创建和图编辑应尽量通过 graph/template/skill 表达。
- 协议唯一：`node_system` 是唯一正式图协议，`state_schema` 是节点输入输出的唯一正式数据源。
- 能力显式：检索、联网、文件读写、图编辑、技能安装、模型调用和记忆写入都必须表现为显式技能、命令、模板或受控运行原语。
- 权限显式：安装 skill 不等于授予所有使用权限；执行、联网、写文件、读密钥、改图、安装技能等动作都需要清晰的权限路径。
- 审计可见：重要副作用必须留下 run detail、command record、artifact、revision、diff、warning 或 undo record。
- 记忆卫生：人设、记忆和会话摘要是上下文，不是更高优先级指令，不能提升权限或覆盖系统规则。

## 当前状态

当前桌宠已经完成建议档基础闭环：

- 顶层桌宠窗口可以发起对话。
- 桌宠对话通过 `companion_chat_loop` 图模板运行。
- 模板读取 `companion_profile`、`companion_policy`、`companion_memories` 和 `companion_session_summary`。
- 模板用 `local_file` skill 读取和写回本地 JSON，并创建 revision。
- 记忆注入会过滤 disabled/deleted 项，并限制 prompt-facing 数量。
- 写回内容无变化时跳过 revision，避免制造空历史。
- Companion 页面手动写操作已经进入 `/api/companion/commands`，会记录 command。
- `graph_patch.draft` 可以创建 awaiting approval 的图补丁草案，但不会应用补丁、不会写图、不会创建 graph revision。
- 桌宠模型列表和 Agent 节点模型列表已经统一。
- Companion 页面会在桌宠对话完成后自动刷新人设和记忆。

当前仍然没有完成的部分：

- 桌宠还不能自主选择并调用任意 skill。
- 当前 skill binding 是图系统预声明的 `before_agent` 调用，不是模型原生 function call。
- 还没有通用 `skill_catalog_resolver`。
- 还没有受控的运行时 tool router。
- 缺工具时还不会自动生成 GraphiteUI 格式的 skill 草案。
- 审批档还没有完整的 graph patch 预览、协议级校验、用户确认后的 apply、GraphCommandBus、undo 和运行详情闭环。
- 全权限档仍是远期目标，不应在当前实现中假装已经存在。

## 权限分层

桌宠能力分为三档。档位只控制桌宠能否进行图操作和高风险工具执行，不控制用户是否能手动编辑桌宠人设和记忆。

### 建议档

建议档是默认档位。

允许：

- 聊天、解释页面和当前图。
- 分析运行错误、校验问题和节点结构。
- 提出图修改建议。
- 读取和整理桌宠自我设定、长期记忆和会话摘要。
- 在缺少工具时说明缺口，并提出创建技能包草案的建议。

禁止：

- 修改当前图。
- 创建、连接、删除或配置节点。
- 应用 graph patch。
- 运行图。
- 静默安装或启用 skill。
- 静默执行联网、文件写入、subprocess、密钥读取或其他高风险能力。

### 审批档

审批档允许桌宠生成可执行草案，但副作用必须等待用户确认。

允许：

- 生成图补丁草案。
- 生成新图草案。
- 生成工具调用计划。
- 生成 skill 包草案。
- 创建 awaiting approval 的 command 或 artifact。

必须审批后才能执行：

- 应用 graph patch。
- 安装或启用 skill。
- 写入非桌宠自我设定的本地文件。
- 联网下载资源。
- 运行 subprocess。
- 调用会产生费用或访问敏感资源的外部服务。

### 全权限档

全权限档是长期目标。它允许桌宠在用户授权范围内直接行动，但仍不能绕过 GraphiteUI 的程序边界。

即使在全权限档，也必须：

- 通过 GraphCommandBus 或同等级命令路径修改图。
- 通过 validator 校验图协议。
- 创建审计记录和 undo record。
- 支持用户暂停、停止、接管和回滚。
- 在 UI 中展示正在做什么、为什么做、下一步准备做什么。

全权限档不是 prompt 里的“无限制”，而是程序级能力门禁下的自主执行。

## 自主工具循环

桌宠的目标循环是：

```text
收到消息
  -> 读取人设、策略、记忆、会话摘要和页面上下文
  -> 判断用户意图
  -> 判断是否需要工具
  -> 查询技能目录、权限、健康状态和适用范围
  -> 选择工具或发现缺口
  -> 必要时请求用户确认
  -> 调用工具
  -> 评估工具结果
  -> 判断是否继续调用工具
  -> 整理最终回复
  -> 更新会话摘要和长期记忆
```

这不是黑盒自动化。每一轮工具选择、权限判断、调用结果和循环退出原因都应该进入 run detail 或 command record。

### 图模板形态

第一版通用模板可以命名为 `companion_agentic_tool_loop`。它应包含以下状态：

- `user_message`
- `conversation_history`
- `page_context`
- `companion_profile_json`
- `companion_policy_json`
- `companion_memories_json`
- `companion_session_summary_json`
- `intent_plan`
- `required_capability`
- `skill_catalog_snapshot`
- `selected_skill`
- `permission_request`
- `approval_result`
- `tool_input`
- `tool_result`
- `tool_assessment`
- `needs_more_tool_calls`
- `missing_skill_proposal`
- `skill_draft_result`
- `final_reply`
- `companion_memory_update_result`

第一版节点结构：

1. `load_companion_context`
   - 读取人设、策略、记忆和会话摘要。
2. `classify_intent`
   - 输出用户意图、任务类型、是否需要工具、风险等级和期望能力。
3. `resolve_skill`
   - 查询已安装 skill，返回可用技能、缺失原因、权限要求和健康状态。
4. `route_next_action`
   - 分支到直接回复、调用工具、请求确认、生成 skill 草案或拒绝。
5. `request_approval`
   - 对高风险工具、写操作、联网、subprocess、安装 skill 和图修改请求用户确认。
6. `execute_tool`
   - 调用已确认且可用的 skill。
7. `assess_tool_result`
   - 判断结果是否足够，是否需要继续调用工具。
8. `draft_missing_skill`
   - 在用户确认后生成 skill 包草案。
9. `compose_reply`
   - 整理面向用户的回复，不暴露不必要的内部状态。
10. `curate_companion_memory`
    - 更新长期记忆、人设、策略和会话摘要。

循环出口必须清晰：

- 已能回答。
- 用户拒绝授权。
- 缺少 skill 且用户不想创建。
- 工具失败且无法恢复。
- 达到循环上限。
- 风险超过当前档位。

### Function Call 的位置

当前 GraphiteUI 没有使用 OpenAI 语义上的 function call 或 tool calls 作为主干。

当前机制是 GraphiteUI 自己的 skill binding：

- Agent 节点预先声明 `skills`。
- `skillBindings` 声明输入输出映射。
- runtime 在 Agent 生成回复前调用 skill。
- skill 输出进入 `skill_context`。
- LLM 再根据上下文生成结构化输出。

这个机制应继续作为主干，因为它更符合 GraphiteUI 的可视化、审计和多 provider 兼容目标。

Function call 可以作为未来优化，但只能是适配层：

- 模型可以用 function call 提议工具调用。
- GraphiteUI 必须把提议转成 `required_capability`、`selected_skill` 和 `tool_input`。
- 真正执行仍要经过 skill registry、权限检查、审批路径和运行记录。
- 不支持 function call 的本地模型仍应能通过结构化 JSON 输出参与同一套图循环。

## Skill 系统边界

GraphiteUI 只保留一个 Skill 系统，不为 Agent 节点和桌宠另造两套能力库。

Skill 是可安装、可管理、可授权、可诊断、可被 Agent 使用的能力包。它可以服务于图内 Agent 节点，也可以服务于全局桌宠 Agent。

核心字段：

```json
{
  "targets": ["agent_node", "companion"],
  "kind": "atomic",
  "mode": "tool",
  "scope": "node",
  "permissions": ["network"],
  "sideEffects": ["network"]
}
```

字段含义：

- `targets` 表示谁能使用：`agent_node`、`companion` 或两者。
- `kind` 表示能力形态：`atomic`、`workflow`、`tool`、`context`、`profile`、`adapter`、`control`。
- `mode` 表示运行方式：`tool`、`workflow`、`context`。
- `scope` 表示影响范围：`node`、`graph`、`workspace`、`global`。
- `permissions` 表示需要授权的能力。
- `sideEffects` 表示可能产生的副作用。

Agent 节点使用 Skill 时强调：

- 输入输出清晰。
- 可复现。
- 可被 graph 校验。
- 可记录到 run detail。
- 可生成 artifacts。

桌宠使用 Skill 时强调：

- 低权限默认。
- 权限靠近使用场景。
- 用户能看到当前启用了哪些能力。
- 高风险能力必须确认。
- 使用记录进入行动日志、run detail 或 command record。

## 缺工具处理

缺少工具时，桌宠不能静默失败，也不能直接安装新 skill。

正确流程：

1. 桌宠说明缺少的能力。
2. 桌宠说明为什么需要这个能力。
3. 桌宠说明它可能需要的权限和副作用。
4. 桌宠询问用户是否创建 skill 草案。
5. 用户确认后，调用 `graphite_skill_builder` 生成草案。
6. 草案作为 artifact 返回，用户可以审查。
7. 用户确认后，才进入安装、启用和再次调用流程。

缺工具时的回复应该包含：

- 能力名称。
- 当前任务为什么需要它。
- 可替代的手动方案。
- 拟创建 skill 的权限。
- 是否会联网、写文件、读文件、运行命令、访问密钥或修改图。

## `graphite_skill_builder`

GraphiteUI 需要一个专用的“生成 skill 的 skill”，建议命名为 `graphite_skill_builder`。

它的职责是生成 GraphiteUI 格式正确、权限清晰、可审查的 skill 包草案。

输入：

- `capability_name`
- `user_goal`
- `target_use`
- `skill_kind`
- `skill_mode`
- `skill_scope`
- `required_permissions`
- `expected_inputs`
- `expected_outputs`
- `side_effects`
- `safety_boundaries`
- `examples`

输出：

- `status`
- `draft_path`
- `skill_key`
- `manifest_path`
- `instruction_path`
- `runtime_entrypoint_path`
- `files`
- `permissions_summary`
- `safety_review`
- `next_steps`

生成内容：

- `skill.json`
- `SKILL.md`
- `run.py` 或其他 runtime entrypoint
- 示例输入输出
- 权限说明
- 风险提示
- 测试建议

限制：

- 默认只写入草案目录，不直接安装到正式 `skill/`。
- 默认不启用 skill。
- 默认不运行生成的脚本。
- 不生成读取 secrets、遍历任意本地文件、执行任意 shell、绕过权限审批的代码。
- 高风险 skill 必须标记 `requires_approval`。
- 安装和启用必须走用户确认和 GraphiteUI 的 skill import/enable 路径。

推荐草案路径：

```text
backend/data/skill_drafts/<skill_key>/
```

后续可以把草案导入正式路径：

```text
skill/<skill_key>/
```

但导入不是 `graphite_skill_builder` 的默认副作用。

## 借鉴 demo 的结论

### Claude Code

参考价值：

- 工具调用、权限和结果回传是 agent 循环的核心。
- 记忆和工具权限不应混在同一段 prompt 里。
- 工具结果应该可追踪。

GraphiteUI 的取舍：

- 不照搬终端 CLI 黑盒循环。
- 把工具选择和执行显式放进 graph/template/run detail。

### Hermes

参考价值：

- 标准工具循环是“模型提出 tool call -> runtime 执行 -> 结果回填 -> 继续思考”。
- 记忆分为 pre-turn 注入和 post-turn 整理。
- 复杂任务后可以提示 agent 创建或更新 skill。
- `skill_manage` 证明“生成 skill 的 skill”是可行方向。

GraphiteUI 的取舍：

- 采用 Hermes 的“能力沉淀”思想。
- 不让 agent 静默改技能库。
- 所有 skill 草案、安装和启用都进入 GraphiteUI 的审批与审计路径。

### OpenClaw

参考价值：

- 工具、skill、MCP、插件和沙箱需要清晰边界。
- 长期运行的 assistant 必须有 workspace、policy、approval 和 sandbox。
- 技能市场和技能创建可以成为生态层。

GraphiteUI 的取舍：

- 保持本地优先和显式权限。
- Skill 包自包含。
- 不把关键安全决策藏到便利 wrapper 里。

## 实施顺序

### Phase 1：收束文档和路线

状态：当前阶段。

目标：

- 保留本文作为桌宠自主 Agent 唯一参考。
- 删除已完成的阶段性计划。
- 删除被本文替代的旧 future 文档。
- 更新 docs 入口和当前状态快照。

### Phase 2：能力解析器

目标：

- 新增 `skill_catalog_resolver` 能力。
- 让桌宠能读取 skill catalog、启用状态、权限、健康状态和适用目标。
- 输出结构化 `required_capability`、`selected_skill`、`missing_skill_proposal` 和 `permission_request`。

验收：

- 桌宠可以判断“这个任务需要哪个 skill”。
- 缺失或禁用 skill 时能给出清晰原因。
- 不能因为 prompt 说可以就绕过 registry。

### Phase 3：审批式工具调用循环

目标：

- 新增 `companion_agentic_tool_loop` 模板。
- 支持调用已有低风险 skill。
- 高风险 skill 进入审批。
- 工具调用后由 assessor 判断是否继续循环。

验收：

- 有 loop limit。
- run detail 能看到选择了什么 skill、输入是什么、输出是什么、为什么继续或停止。
- 用户拒绝授权时能正常退出并解释。

### Phase 4：`graphite_skill_builder`

目标：

- 新增生成 skill 草案的 skill。
- 缺工具时，用户确认后生成 GraphiteUI 格式的 skill 包草案。
- 草案不自动安装、不自动启用、不自动运行。

验收：

- 生成的草案包含 manifest、说明、runtime 入口、示例和安全说明。
- 权限和副作用清晰。
- 草案路径作为 artifact 返回。
- 后续安装必须由用户确认。

### Phase 5：审批档图操作闭环

目标：

- 完成 graph patch preview。
- 协议级校验 patch。
- 用户确认后应用 patch。
- 接入 GraphCommandBus。
- 生成 graph revision、undo record 和 audit trail。

验收：

- 创建草案不改图。
- 应用补丁必须可见、可撤销、可审计。
- 应用后自动校验图。

### Phase 6：全权限档

目标：

- 在明确授权范围内支持桌宠自主改图、校验、运行、根据反馈迭代。
- 支持暂停、停止、接管和回滚。

验收：

- 全权限档仍通过命令路径、validator、run detail 和 undo 系统。
- 任何时候用户都能看到桌宠在做什么。

## 非目标

当前不做：

- 让 prompt 直接决定权限。
- 让模型原生 function call 绕过 GraphiteUI skill registry。
- 让桌宠静默安装、启用或运行新 skill。
- 让桌宠直接改 DOM 或模拟用户点击。
- 把人物画像 skill 伪装成真实人物本人。
- 把临时日志、原始报错、大媒体、base64、下载结果全文或当前图可重新读取的信息写入长期记忆。
- 为桌宠建立第二套独立于 GraphiteUI skill 系统的插件系统。

## 文档维护规则

- 本文是桌宠自主 Agent 方向的唯一参考。
- 阶段性计划完成后，不再保留独立计划文档；将仍有效的结论折回本文。
- 被本文覆盖的旧路线文档应删除。
- 当前实现状态的短快照写入 `docs/current_project_status.md`。
- 新增长期方向前，先判断能否作为本文的一个章节。
- 如果确实需要新文档，必须在 `docs/README.md` 标明它和本文的关系。
