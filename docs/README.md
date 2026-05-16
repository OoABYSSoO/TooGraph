# TooGraph Docs

`docs/` 只保留当前仍然有效的正式文档和长期待办。实现快照、迁移计划、一次性调研、临时进度记录和被新版方针替代的设计稿都不在 `docs/` 中维护。

## 当前保留

- [future/buddy-autonomous-agent-roadmap.md](future/buddy-autonomous-agent-roadmap.md)
  - Buddy 自主循环、自我演进、页面操作、长期记忆、业务模板、Hybrid RAG 和 Eval 的剩余待办。
  - 本文只记录还没完成的方向和验收口径；当前能力以代码、官方模板 JSON、Action manifest 和测试为准。

- [structured-output-and-function-calling.md](structured-output-and-function-calling.md)
  - 结构化输出和 function/tool calling 适配层的剩余工作。
  - 只作为模型 Provider 与 LLM 输出约束的待办清单，不作为 TooGraph 产品主协议。

- [deployment.md](deployment.md)
  - 源码运行、Docker 镜像、数据卷、端口绑定、健康检查和更新流程。
  - 启动命令仍统一为 `npm start` / `node scripts/start.mjs`。

- [../action/ACTION_AUTHORING_GUIDE.md](../action/ACTION_AUTHORING_GUIDE.md)
  - Action 包结构、生命周期入口、权限边界和输出契约。
  - 手工创建 Action 与图模板生成 Action 都应遵守该协议。

## 不再维护

- `docs/current_project_status.md`：当前状态快照不再维护；实现事实以代码、模板、Action manifest 和测试为准。
- `docs/future/toograph_p0_p1_development_goals.md`：仍有效的记忆、业务模板、Hybrid RAG 和 Eval 事项归入 Buddy 路线图。
- `docs/future/toograph_workflow_gallery_templates_plan.md`：仍有效的模板库事项归入 Buddy 路线图。
- Hermes Agent、Claude Code、伙伴循环模板和页面操作的一次性调研/设计文档。
- `task_plan.md`、`findings.md`、`progress.md` 等阶段性计划和执行记录。
- `docs/superpowers/` 下的阶段性实现计划和设计稿。

## 维护原则

- README 是项目使用入口，保留启动、目录、API 和必要能力说明。
- 代码、官方模板 JSON、Action manifest 和测试是当前实现事实来源。
- `docs/future/buddy-autonomous-agent-roadmap.md` 是长期待办来源；新增长期方向先折叠到这份文档，不新建平行路线图。
- 阶段结束后，删除或改写对应待办，不保留完成流水账。
- 如果旧文档、README 或注释与 `AGENTS.md` 的图优先、协议唯一、显式能力、显式权限、artifact 输出、审计和记忆卫生准则冲突，以 `AGENTS.md` 为准，并尽快修正文档。
