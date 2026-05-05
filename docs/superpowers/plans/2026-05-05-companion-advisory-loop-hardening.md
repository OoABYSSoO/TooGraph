# 桌宠建议档闭环加固计划

目标：补齐桌宠“建议档”闭环里最容易造成噪声和误召回的基础能力，让记忆注入更干净、文件写回更克制，并为后续审批档和全权限档留下清晰边界。

架构原则：继续遵守 GraphiteUI 的图优先路线。桌宠对话循环由 `companion_chat_loop` 模板声明，基础文件能力由 `local_file` 技能执行；后端只提供通用能力、校验、修订记录和技能运行时，不把桌宠产品策略藏进接口逻辑。

## 路线

1. Phase 1：加固建议档闭环。
   - 过滤禁用或删除的记忆，不注入回复 Agent。
   - 限制单轮注入的记忆数量，避免把整库长期记忆塞进 prompt。
   - 写回内容没有变化时跳过文件写入和 revision 创建。
   - 放宽前端 revision actor 类型，让模板和技能写入的记录能被 UI 正常理解。
2. Phase 2：把 Companion 页面手动写操作也纳入图流程或命令流程。
3. Phase 3：实现审批档，通过 graph draft 或 patch 预览再应用。
4. Phase 4：实现全权限档，所有图修改走命令总线、校验、审计、撤销和停止接管路径。

## Task 1：基础文件技能读写守卫

涉及文件：

- `backend/tests/test_local_file_skill.py`
- `skill/local_file/run.py`
- `skill/local_file/skill.json`

- [x] 先写失败测试：验证 `read_json` 可生成过滤后的 `prompt_json_content`，同时保持原始 `json_content` 不变。
- [x] 先写失败测试：验证 `write_json` 在 `skip_if_unchanged` 开启且内容无变化时不创建 revision。
- [x] 实现 `prompt_array_filter`：只影响 prompt-facing JSON 数组内容，按字段精确匹配过滤。
- [x] 实现 `max_prompt_items`：只截断 prompt-facing 数组，不改变原始读取结果。
- [x] 实现 `skip_if_unchanged`：无变化时返回 `changed: false`、`skipped: true`、`revision_id: null`。
- [x] 更新技能 manifest，暴露新增输入和输出字段。

## Task 2：桌宠模板显式接入

涉及文件：

- `backend/tests/test_template_layouts.py`
- `backend/app/templates/companion_chat_loop.json`

- [x] 先写失败测试：要求 `read_companion_memories` 配置 `prompt_array_filter` 和 `max_prompt_items`。
- [x] 先写失败测试：要求所有桌宠写回节点配置 `skip_if_unchanged`。
- [x] 更新模板：记忆读取过滤 `enabled: true`、`deleted: false`，最多注入 20 条。
- [x] 更新模板：profile、policy、memories、session_summary 写回都开启无变化跳过。

## Task 3：类型与文档

涉及文件：

- `frontend/src/types/companion.ts`
- `docs/future/2026-05-05-companion-self-config-memory-design.md`

- [x] 将 `CompanionRevision.changed_by` 放宽为 `string`，兼容模板、技能和后续命令系统写入者。
- [x] 在设计文档中补充建议档第一版加固规则。
- [x] 在设计文档测试要求中加入 prompt-only 过滤和无变化跳过 revision。

## Task 4：验证、重启、提交

- [x] 运行 TDD 红灯验证，确认新增测试在实现前失败。
- [x] 运行后端相关测试：`python -m unittest backend.tests.test_local_file_skill backend.tests.test_template_layouts backend.tests.test_skill_upload_import_routes`。
- [x] 对前端改动运行窄类型检查：`tsc --noEmit ... src/types/companion.ts`。
- [x] 运行 diff hygiene 检查。
- [x] 重启 dev 环境并确认前后端健康。
- [x] 按仓库规则提交中文 commit 并 push。

## 验收标准

- `local_file` 仍是通用基础技能，不包含桌宠专用策略。
- 桌宠记忆是否过滤、过滤到多少条，由 `companion_chat_loop` 模板显式声明。
- 原始 memories 仍可供整理 Agent 读取，prompt-facing memory context 只包含启用且未删除的记录。
- 自动写回没有变化时不会制造空 revision，但运行结果保留可审计状态。
- 当前 Phase 1 不假装完成审批档或全权限档，只留下后续实施入口。
