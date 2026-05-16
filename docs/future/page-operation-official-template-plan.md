# 页面操作官方模板长期实现计划

> **给后续执行代理的要求：** 实施本计划时，必须使用 `subagent-driven-development` 或 `executing-plans`，并按阶段推进。每个阶段都必须完成有针对性的测试；只要改动影响运行时行为，就要做真实 TooGraph 重启或冒烟验证；每个阶段结束后使用中文提交信息提交。

**目标：** 构建一个完整的官方页面操作图模板。它接收用户意图，操作当前 TooGraph 页面，并且只有在用户的具体目标真正完成后才结束。

**架构：** 继续使用现有 `node_system` 图协议和现有节点类型：`input`、`agent`、`condition`、`subgraph`、`output`。实现方式是扩展当前应用内虚拟操作链路、页面操作书、活动事件和 run 恢复流程，让图模板可以请求一次可见 UI 操作，等待真实 UI 结果，刷新页面上下文，验证目标是否完成，并在必要时循环。

**技术栈：** Vue 3、Pinia、Element Plus、FastAPI、LangGraph runtime、官方 Skill 包、官方图模板、现有 run 与 activity event 存储。

---

## 不可破坏的约束

- 不新增图节点类型。现有节点类型已经足够。
- 不用隐藏的 Buddy 专属命令绕过 TooGraph 图协议。
- 不把 DOM selector、屏幕坐标、截图或外部浏览器自动化暴露给 LLM 作为规划依据。
- 每个 LLM 节点最多只能使用一个显式能力来源。
- 受控 UI 操作请求必须通过 `toograph_page_operator`。
- 多步智能必须用图模板和子图表达。
- 每一次页面操作都必须留下可审计 activity event。
- 官方模板只能在 verifier 判断用户目标已完成时结束；否则必须进入清晰的失败、澄清或继续操作状态。
- 每个开发阶段必须可测试、可提交、可推送，然后再进入下一阶段。

## 当前代码基线

- `skill/official/toograph_page_operator/` 已存在，并且会发出 `virtual_ui_operation` activity event。
- `frontend/src/buddy/pageOperationAffordances.ts` 已能从带有 `data-virtual-affordance-id` 的元素生成结构化页面操作书。
- `frontend/src/buddy/virtualOperationProtocol.ts` 已能解析 `click`、`focus`、`clear`、`type`、`press`、`wait` 和 `graph_edit` 操作。
- `frontend/src/buddy/BuddyWidget.vue` 与 `frontend/src/editor/workspace/EditorWorkspaceShell.vue` 已能消费虚拟操作 activity event，并交给可见虚拟光标回放。
- `frontend/src/editor/workspace/graphEditPlaybackModel.ts` 已支持语义化图编辑意图，包括 `subgraph` 节点。
- `GraphLibraryPage`、`RunsPage`、编辑器页签和编辑器操作按钮还没有完整暴露为语义页面操作目标。
- `toograph_page_operator` 当前每次只接受一个 `click` 或 `graph_edit` 操作，而且不会返回真实 UI 完成状态。
- run resume 和 `awaiting_human` 已存在，应复用它们表达操作后的等待与继续，而不是新增节点类型。

## 目标用户意图范围

官方模板必须支持这些目标类别：

- 查看记录：打开运行历史；按需打开某个运行详情；当用户明确要求时，恢复可编辑的运行快照。
- 打开页面或页签：导航到顶层页面；切换编辑器页签；打开图/模板选择面板；聚焦已知编辑器面板。
- 运行某个图：找到并打开目标图，启动运行，等待运行进入终态，并输出简洁结果摘要。
- 编辑某个图：找到、打开或创建目标图，执行语义图编辑回放；当目标意味着持久保存时保存，并验证图确实发生变化。
- 新建某个图：创建空白图或基于模板创建图；按需应用用户要求的编辑；按需保存；验证目标画布已经存在。

## 完成语义

只有同时满足以下条件，模板才算完成：

- 最新页面快照或运行结果与解析出的用户目标匹配。
- verifier 写入 `goal_completed=true`。
- 最终输出说明完成了什么，并在可用时包含关键标识，例如路由、图名称/ID、run id、保存后的图或模板 id。

以下情况不算完成：

- 只是发出了虚拟操作请求。
- 点击已经发生，但路由或选中对象没有按预期变化。
- 图运行已经启动，但还没有进入 `completed`、`failed` 或 `cancelled`。
- 图编辑已经可视化回放，但校验失败、应用失败，或在目标要求保存时没有保存。

## 目标官方模板

模板 ID：`toograph_page_operation_workflow`

显示名称：`操作 TooGraph 页面`

默认图名称：`操作 TooGraph 页面`

输入：

- `user_goal`（`text`）：用户意图。
- `page_context`（`markdown`）：人类可读的当前页面上下文。
- `page_operation_context`（`json`）：最新结构化页面操作书和页面快照。它由前端 resume payload 更新。
- `conversation_history`（`markdown`，可选）：最近指令上下文，只用于解析“刚才那个图”这类指代。

输出：

- `final_reply`（`markdown`）：用户可见结果。
- `operation_report`（`json`，可选但对 run detail 有帮助）：结构化路由、运行、图和操作结果。

核心 state：

- `goal_plan`（`json`）：目标分类、目标对象线索、所需副作用和成功标准。
- `operation_request`（`json`）：下一步要尝试的操作。
- `operation_result`（`json`）：最新前端执行确认，包括状态、操作前后路由、目标 id、错误、触发的 run id 和图编辑摘要。
- `page_snapshot`（`json`）：操作后的最新页面快照。
- `goal_review`（`json`）：verifier 结果，包括 `goal_completed`、`needs_more_operations`、`needs_clarification`、`failure_reason`、`next_requirement`。
- `loop_trace`（`json`）：已尝试操作的紧凑摘要列表。

顶层流程：

```text
input_user_goal
  -> classify_goal
  -> operation_loop_subgraph
  -> draft_final_reply
  -> output_final_reply
```

`operation_loop_subgraph` 只使用现有节点类型：

```text
plan_next_operation
  -> execute_page_operation_with_toograph_page_operator
  -> pause_for_frontend_virtual_operation
  -> verify_goal_against_refreshed_context
  -> continue_condition
```

暂停必须用现有图运行暂停/恢复机制表达。只有来自 `toograph_page_operator` 的安全虚拟操作 continuation，前端才可以自动恢复。

## 阶段 1：正式化虚拟操作结果协议

**目的：** 让页面操作请求可以从 Skill 输出追踪到前端真实执行，再回写到图 state。

需要修改的文件：

- `skill/official/toograph_page_operator/after_llm.py`
- `skill/official/toograph_page_operator/skill.json`
- `skill/official/toograph_page_operator/SKILL.md`
- `frontend/src/buddy/virtualOperationProtocol.ts`
- `frontend/src/buddy/virtualOperationProtocol.test.ts`
- `frontend/src/types/run.ts`
- `backend/app/core/runtime/activity_events.py`
- `backend/tests/test_toograph_page_operator_skill.py`

实现要求：

- 为每个成功的 `virtual_ui_operation` event 增加稳定的 `operation_request_id`。
- 增加 `expected_continuation` 详情：
  - `mode: "auto_resume_after_ui_operation"`
  - `resume_state_keys: ["page_operation_context", "page_context", "operation_result"]`
- 不改变 LLM 输出字段；id 和 continuation metadata 由 Skill/runtime 确定性生成。
- 仍然保持每次 Skill 调用只请求一个操作。
- activity event 必须包含足够的节点和 run 上下文，以便前端恢复正确的 run。

测试：

- 后端：`py -3 -m pytest backend/tests/test_toograph_page_operator_skill.py -q`
- 前端：`node --test frontend/src/buddy/virtualOperationProtocol.test.ts`
- 构建：`cd frontend; npm run build`

提交信息：

```text
建立页面操作结果协议
```

## 阶段 2：增加前端操作确认与自动恢复

**目的：** 让暂停中的图在真实 UI 操作完成后，带着新 UI 状态继续运行。

需要修改的文件：

- `frontend/src/stores/buddyMascotDebug.ts`
- `frontend/src/buddy/BuddyWidget.vue`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`
- `frontend/src/api/runs.ts`
- `backend/app/api/routes_runs.py`
- `backend/app/core/langgraph/runtime.py`
- `backend/tests/test_langgraph_runtime_setup.py`
- `backend/tests/test_langgraph_runtime_progress_events.py`
- `frontend/src/buddy/BuddyWidget.structure.test.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.structure.test.ts`

实现要求：

- 当 `virtual_ui_operation` event 包含 `expected_continuation` 时，前端像现在一样可视化执行操作。
- 捕获 `operation_result` 对象：
  - `operation_request_id`
  - `status: "succeeded" | "failed" | "interrupted"`
  - `target_id`
  - `commands`
  - `route_before`
  - `route_after`
  - `page_snapshot_before`
  - `page_snapshot_after`
  - `triggered_run_id`
  - `graph_edit_summary`
  - `error`
- 操作执行后，用 `buildPageOperationRuntimeContext` 重新生成页面操作上下文。
- 用以下内容 resume 暂停中的 run：
  - `operation_result`
  - 刷新的 `page_context`
  - 刷新的 `page_operation_context`
- 只有当暂停 run metadata 确认 pending continuation 属于同一个 `operation_request_id` 时，才允许自动恢复。
- 如果用户通过停止按钮中断操作，只有当图明确期望失败处理时才恢复；否则保持 run 暂停，并显示清楚原因。

测试：

- 后端恢复链路：`py -3 -m pytest backend/tests/test_langgraph_runtime_setup.py backend/tests/test_langgraph_runtime_progress_events.py -q`
- 前端结构和模型测试：覆盖 event 到 resume 的连线。
- 构建：`cd frontend; npm run build`
- 运行时冒烟：`npm.cmd start`，运行一个导航到 `/runs` 的简单页面操作图，确认图恢复后拿到 `/runs` 路由。

提交信息：

```text
接通页面操作自动恢复
```

## 阶段 3：扩展语义操作目标覆盖

**目的：** 给操作模板足够稳定的 UI 目标，真正完成页面目标。

需要修改的文件：

- `frontend/src/layouts/AppShell.vue`
- `frontend/src/pages/GraphLibraryPage.vue`
- `frontend/src/pages/RunsPage.vue`
- `frontend/src/pages/RunDetailPage.vue`
- `frontend/src/editor/workspace/EditorTabBar.vue`
- `frontend/src/editor/workspace/EditorTabLauncherPanel.vue`
- `frontend/src/editor/workspace/EditorActionCapsule.vue`
- `frontend/src/editor/canvas/EditorCanvas.vue`
- 以上文件附近对应的结构测试。

需要增加的 affordance id：

- `library.action.newBlankGraph`
- `library.action.importPython`
- `library.template.<templateId>.open`
- `library.graph.<graphId>.open`
- `library.search.query`
- `library.filter.status.<status>`
- `runs.run.<runId>.openDetail`
- `runs.run.<runId>.restoreEdit`
- `runs.run.<runId>.restoreTarget.<targetKey>`
- `runs.filter.status.<status>`
- `runs.search.graphName`
- `runs.action.refresh`
- `runDetail.action.restoreEdit`
- `editor.tab.<tabId>.activate`
- `editor.tab.<tabId>.close`
- `editor.launcher.open`
- `editor.launcher.createNew`
- `editor.launcher.openGraph.<graphId>`
- `editor.launcher.createFromTemplate.<templateId>`
- `editor.action.runActiveGraph`
- `editor.action.saveActiveGraph`
- `editor.action.validateActiveGraph`
- `editor.action.toggleRunActivity`
- `editor.action.toggleStatePanel`

安全要求：

- 破坏性或不可逆操作必须标记 `data-virtual-affordance-requires-confirmation="true"` 或 `data-virtual-affordance-destructive="true"`。
- Buddy 自身表面继续保持 forbidden。
- 隐藏或禁用控件不能作为 allowed operation 暴露。

测试：

- `node --test frontend/src/layouts/AppShell.structure.test.ts`
- `node --test frontend/src/pages/GraphLibraryPage.structure.test.ts`
- `node --test frontend/src/pages/RunsPage.structure.test.ts`
- `node --test frontend/src/editor/workspace/EditorTabBar.structure.test.ts`
- `node --test frontend/src/editor/workspace/EditorActionCapsule.structure.test.ts`
- 构建：`cd frontend; npm run build`
- 运行时冒烟：检查 `/library`、`/runs`、`/editor` 的页面操作书中出现卡片和操作目标。

提交信息：

```text
补齐页面操作语义目标
```

## 阶段 4：扩展 `toograph_page_operator`

**目的：** 让 Skill 能执行前端已经理解的操作。

需要修改的文件：

- `skill/official/toograph_page_operator/before_llm.py`
- `skill/official/toograph_page_operator/after_llm.py`
- `skill/official/toograph_page_operator/skill.json`
- `skill/official/toograph_page_operator/SKILL.md`
- `backend/tests/test_toograph_page_operator_skill.py`
- `frontend/src/buddy/virtualOperationProtocol.ts`
- `frontend/src/buddy/virtualOperationProtocol.test.ts`

实现要求：

- 当命令来自当前页面操作书时，接受 `click`、`focus`、`clear`、`type`、`press`、`wait` 和 `graph_edit`。
- 每次 Skill 调用仍然只执行一个操作。
- 根据操作书中的 `inputs` 做文本输入校验。
- 支持 `nodeType: "subgraph"` 的 `graph_edit` intent，与编辑器回放模型保持一致。
- 除内置安全等待命令外，拒绝不在最新操作书里的命令。
- 对过期 affordance、缺少输入、unsupported graph edit intent 返回清晰的 recoverable error。

测试：

- 后端：`py -3 -m pytest backend/tests/test_toograph_page_operator_skill.py -q`
- 前端：`node --test frontend/src/buddy/virtualOperationProtocol.test.ts`
- 构建：`cd frontend; npm run build`

提交信息：

```text
扩展页面操作器命令范围
```

## 阶段 5：增加页面目标观察和验证输入

**目的：** 给图足够的结构化证据，让它判断用户目标是否完成。

需要修改的文件：

- `frontend/src/buddy/pageOperationAffordances.ts`
- `frontend/src/buddy/buddyPageContext.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- `frontend/src/buddy/BuddyWidget.vue`
- `frontend/src/pages/runDetailModel.ts`
- `frontend/src/editor/workspace/runActivityModel.ts`
- 相关测试。

实现要求：

- 扩展页面操作 runtime context，加入结构化页面事实：
  - 当前路由
  - 当前页面标题
  - 活跃编辑器页签 id、标题和类型
  - 活跃图 id、名称和 dirty 状态
  - 可见图、模板、run 卡片的 id 和标签
  - 可用时的最新前台 run id、状态和结果摘要
  - 最新 operation result
- `page_context` 保持为 LLM 友好的可读 markdown；机器可检查数据放在 `page_operation_context`。
- 增加一个紧凑的 `operation_report` 投影，供 run detail 展示。

测试：

- `node --test frontend/src/buddy/pageOperationAffordances.test.ts`
- `node --test frontend/src/buddy/buddyPageContext.test.ts`
- `node --test frontend/src/editor/workspace/runActivityModel.test.ts`
- 构建：`cd frontend; npm run build`

提交信息：

```text
增加页面目标验证上下文
```

## 阶段 6：归因虚拟操作触发的图运行

**目的：** 让“运行这个图”可以被验证，而不是只点击运行按钮。

需要修改的文件：

- `frontend/src/editor/workspace/useWorkspaceRunController.ts`
- `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- `frontend/src/buddy/BuddyWidget.vue`
- `frontend/src/stores/buddyMascotDebug.ts`
- `frontend/src/types/run.ts`
- 相关测试。

实现要求：

- 当虚拟操作点击 `editor.action.runActiveGraph` 时，把这个编辑器页签创建的下一个 run 关联到该 operation result。
- 在 `operation_result` 中记录 `triggered_run_id`、`triggered_graph_id` 和初始 run 状态。
- 当操作模板的目标要求运行完成时，持续观察这个 run，直到进入终态。
- 增加一个小型前端等待/观察循环，等待 run 完成后用更新后的 run detail 摘要自动恢复页面操作工作流。

测试：

- `node --test frontend/src/editor/workspace/useWorkspaceRunController.test.ts`
- `node --test frontend/src/editor/workspace/useWorkspaceRunLifecycleController.test.ts`
- 构建：`cd frontend; npm run build`
- 运行时冒烟：打开一个已知小图，让工作流运行它，确认最终回复包含 run id 和终态状态。

提交信息：

```text
归因虚拟操作触发的图运行
```

## 阶段 7：构建官方图模板

**目的：** 新增用户和 Buddy 都能运行的官方图模板。

需要创建的文件：

- `graph_template/official/toograph_page_operation_workflow/template.json`

需要修改的文件：

- `backend/tests/test_template_layouts.py`
- `backend/tests/test_run_graph_snapshot.py`
- `docs/current_project_status.md`
- `docs/future/buddy-autonomous-agent-roadmap.md`

模板结构：

- `input_user_goal` 写入 `user_goal`。
- `input_page_context` 写入 `page_context`。
- `input_page_operation_context` 写入 `page_operation_context`。
- `classify_goal` 写入 `goal_plan`。
- `operation_loop` 是 `subgraph` 节点，内部负责：
  - 根据 `goal_plan`、`page_operation_context`、`operation_result` 和 `loop_trace` 规划下一步操作；
  - 调用 `toograph_page_operator`；
  - 暂停等待前端虚拟操作 continuation；
  - resume 后验证目标完成情况；
  - 通过 condition 节点循环，并设置保守 loop limit。
- `draft_final_reply` 写入 `final_reply`。
- `output_final_reply` 展示 `final_reply`。
- 可选 `output_operation_report` 展示 `operation_report`。

Verifier 行为：

- 查看记录：当路由和选中的 run detail 匹配目标时完成。
- 打开页签：当 active tab 或 route 匹配目标时完成。
- 新建图：当活跃编辑器画布是空白图或指定模板草稿时完成。
- 编辑图：当 graph edit playback 已应用，并且预期图事实发生变化时完成。
- 运行图：当触发的 run 进入终态并且结果摘要可用时完成。

测试：

- `py -3 -m pytest backend/tests/test_template_layouts.py::TemplateLayoutTests -q`
- `py -3 -m pytest backend/tests/test_run_graph_snapshot.py -q`
- `py -3 -m pytest backend/tests/test_node_system_validator_skills.py -q`
- 构建：`cd frontend; npm run build`

提交信息：

```text
新增页面操作官方模板
```

## 阶段 8：端到端目标流程

**目的：** 让功能真实可用，而不只是结构合法。

需要新增或更新测试与冒烟脚本，覆盖：

- “打开运行记录”
- “打开某个运行详情”
- “打开图与模板页面”
- “新建一个空白图”
- “打开名为 X 的图”
- “运行当前图并告诉我结果”
- “新建一个包含输入、LLM、输出的图”
- “编辑当前图，给某个节点改名”

可能需要修改的文件：

- `frontend/src/buddy/BuddyWidget.structure.test.ts`
- `frontend/src/editor/workspace/EditorWorkspaceShell.structure.test.ts`
- `frontend/src/buddy/pageOperationAffordances.test.ts`
- `backend/tests/test_template_layouts.py`
- 如果引入新的纯函数 helper，则在对应 model test 中增加覆盖。

手动验证：

1. 运行 `npm.cmd start`。
2. 打开 `http://127.0.0.1:3477`。
3. 先从编辑器直接运行官方模板，输入明确目标。
4. 只有当直接编辑器运行通过后，再把它作为 Buddy 可发现能力或模板候选。
5. 确认虚拟光标可见地执行操作。
6. 确认图运行不会在目标未完成时提前结束。
7. 确认停止按钮中断被尊重，并且不会被自动恢复成成功。

提交信息：

```text
验证页面操作模板端到端流程
```

## 阶段 9：文档、能力发现和产品打磨

**目的：** 让功能可发现、可理解、安全可用。

需要修改的文件：

- `docs/current_project_status.md`
- `docs/future/buddy-autonomous-agent-roadmap.md`
- `skill/official/toograph_page_operator/SKILL.md`
- `graph_template/official/toograph_page_operation_workflow/template.json`
- 如果候选评分需要调整，则修改 capability selector 相关测试。

实现要求：

- 文档明确 `toograph_page_operation_workflow` 是官方页面操作模板。
- 确保 capability selector 能在页面操作目标中发现它。
- 保持 Buddy 自身表面限制明确。
- 为无法完成的目标提供简洁失败说明：
  - 找不到目标图
  - 找不到匹配运行记录
  - 页面快照过期
  - 破坏性操作被阻止
  - run 失败
  - 操作被中断

测试：

- `py -3 -m pytest backend/tests/test_toograph_capability_selector_skill.py -q`
- `py -3 -m pytest backend/tests/test_template_layouts.py -q`
- 构建：`cd frontend; npm run build`
- Buddy 运行时冒烟：让 Buddy 打开页面、运行图、创建简单图。

提交信息：

```text
完善页面操作模板文档和发现能力
```

## 阶段 10：最终硬化

**目的：** 在宣布计划完成前关闭可靠性缺口。

检查清单：

- 完整后端测试：`py -3 -m pytest backend/tests -q`
- 完整前端结构/模型测试：
  - PowerShell：`Get-ChildItem frontend/src -Recurse -Filter *.test.ts | ForEach-Object { $_.FullName } | node --test`
  - Bash：`node --test $(find frontend/src -name '*.test.ts' -print)`
- 前端构建：`cd frontend; npm run build`
- 重启：`npm.cmd start`
- 页面视觉冒烟：
  - `/library`
  - `/runs`
  - `/editor`
  - Buddy 浮窗操作流程
- 确认没有本地 artifact 被 stage：
  - `backend/data/settings`
  - `.toograph_*`
  - `.dev_*`
  - `frontend/dist`
  - `.worktrees`
  - `buddy_home`
  - 根目录 `package-lock.json`，除非明确决定提交它。

提交信息：

```text
完成页面操作模板硬化验证
```

## 推荐开发顺序

1. 先完成阶段 1 和阶段 2，再继续增加 affordance。没有 ack/resume，模板无法知道目标是否完成。
2. 再完成阶段 3。没有稳定 affordance，LLM 就没有可信目标。
3. 阶段 4 必须在创建模板前完成。模板依赖 `toograph_page_operator` 正确使用操作书。
4. 阶段 5 和阶段 6 必须在声明支持图运行前完成。
5. 只有当直接的小型测试图能跑通操作循环后，才新增官方模板。
6. 只有当官方模板能在编辑器直接运行后，才让 Buddy 绑定或推荐它。

## 风险与缓解

- **页面快照过期：** 每次 operation continuation 都必须刷新 `page_operation_context`，然后再验证。
- **点击了错误目标：** 使用稳定语义 affordance id 和 label；点击后由 verifier 检查路由和对象身份。
- **运行异步启动：** 将下一个编辑器 run 归因到虚拟操作请求 id，并等待终态。
- **图编辑可视回放成功但结构失败：** 图编辑命令必须通过现有图 mutation 路径应用，并在应用后验证 document facts。
- **用户中断操作：** 写入 `operation_result.status="interrupted"`，由图输出清楚的非成功最终回复。
- **能力选择器递归选择自身：** 模板 metadata 和 selector 指令必须避免把当前运行中的页面操作 workflow 作为嵌套能力，除非用户明确要求。
- **权限过宽：** 破坏性操作继续阻止，除非现有审批路径明确处理。

## 完成定义

- `toograph_page_operation_workflow` 作为官方可见模板存在。
- 模板只使用现有节点类型。
- 模板可以从用户意图打开页面、打开页签、查看运行记录、新建图、编辑图和运行图。
- 每个操作都通过虚拟光标或图编辑回放可见执行。
- 图运行会等待真实 UI 完成，并带着刷新后的页面上下文恢复。
- 只有 verifier 成功或明确终态失败后，才输出最终回复。
- activity events 展示请求、执行、结果、重试/失败和触发 run 归因。
- 每个阶段的针对性测试和运行时冒烟通过。
- 最终完整后端/前端验证通过。

## 计划自检

- 不需要新增图节点类型。
- 计划复用现有 Skill、Subgraph、Condition、Output 和 run resume 机制。
- 每个阶段都有测试命令和提交边界。
- 只有当操作循环可以真正闭环后，才创建官方模板。
- 当前代码中的已知缺口已经映射到明确阶段。
