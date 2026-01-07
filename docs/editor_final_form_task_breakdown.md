# GraphiteUI Editor Final-Form Task Breakdown

## 1. 文档目的

本文档是 [editor_final_form_development_plan.md](/home/abyss/GraphiteUI/docs/editor_final_form_development_plan.md) 的执行版拆解。

目标：

- 把最终形态方案拆成可以直接落地的工程任务
- 明确先后顺序、依赖关系、产出文件和完成标准
- 让后续开发不再停留在概念讨论层

本文档默认以 **“让编辑器通过编排完成 demo 任务，并支持主题切换与顺序调整”** 为主线。

---

## 2. 总体实施策略

本次升级建议分成 5 个主阶段：

1. 新协议与兼容层
2. 编译器与运行时重构
3. 编辑器交互升级
4. 模板与主题系统
5. Demo 对齐与验收

执行原则：

- 先改协议，再改编译器，再改前端
- 不再以旧图兼容为前提，优先推进标准模型
- 先让 Creative Factory 标准模板跑通，再扩到更多主题

---

## 2.1 当前进度快照

截至当前版本，以下任务已经完成或基本完成：

- `Task 1.1` 新版 Graph Schema：`已完成`
- `Task 2.1` Graph Parser：`已完成`
- `Task 2.2` Validator：`已完成`
- `Task 2.3` Node Handler Registry：`已完成`
- `Task 2.4` Tool Registry 下沉：`已完成基础版本`
- `Task 2.5` Condition Node 编译与执行：`已完成`
- `Task 3.1` 前端类型系统升级：`已完成`
- `Task 3.2` State Panel：`已完成`
- `Task 3.3` 左入右出节点与输入输出绑定：`已完成`
- `Task 4.2` 主题模板系统抽象：`已完成基础版本`
- `Task 4.3` 主题策略画像与参数策略：`已完成基础版本`
- `Task 4.x` Creative Factory 模板主链：`已完成`

当前最值得继续推进的任务：

- `Task 3.4` Edge bus / flow 可视化增强
- `Task 3.5` Start / End 特殊节点语义强化
- `Task 4.4` 主题策略字段编辑器与更细粒度 preset 可视化

---

## 3. 优先级定义

- `P0`：主路径阻塞项，不做无法进入下一阶段
- `P1`：重要能力，影响最终形态闭环
- `P2`：增强项，可以后置

---

## 4. Phase 1：新版图协议与兼容层

## Task 1.1 定义新版 Graph Schema

优先级：`P0`

目标：

为最终形态引入 `state_schema`、`theme_config`、`reads/writes/params`、`flow_keys`。

后端目标文件：

- [graph.py](/home/abyss/GraphiteUI/backend/app/schemas/graph.py)

需要新增的核心模型：

- `StateField`
- `ThemeConfig`
- `GraphNodeV2`
- `GraphEdgeV2`
- `GraphDocumentV2`

字段要求：

- `GraphDocument`
  - `template_id`
  - `theme_config`
  - `state_schema`
- `GraphNode`
  - `reads`
  - `writes`
  - `params`
  - `implementation`
- `GraphEdge`
  - `flow_keys`
  - `edge_kind`
  - `branch_label`

完成标准：

- 新版 graph json 可通过 Pydantic 校验
- 旧版 graph json 仍然可被接收

验收方式：

- 准备 2 个新版 graph 样例
- 准备 2 个旧版 graph 样例
- 四者都能成功解析

---

## Task 1.2 建立旧协议到新协议的兼容转换

优先级：`P0`

目标：

避免一次性打断当前 editor 和已有 graph。

后端目标文件：

- 新增 [graph_adapter.py](/home/abyss/GraphiteUI/backend/app/compiler/graph_adapter.py)

职责：

- 将旧版节点转换为 `reads/writes/params`
- 将旧版 conditional edge 转为 `branch_label`
- 自动生成缺省 `state_schema`

完成标准：

- 旧版 `demo-graph`、`slg-creative-factory` 都能被升级到内部统一模型

验收方式：

- 对旧 graph 执行 adapter
- 输出结构中必须包含 `state_schema` 和 `reads/writes`

---

## Task 1.3 定义系统保留 state 字段

优先级：`P1`

目标：

明确哪些字段是 runtime 系统保留，避免用户自定义字段冲突。

建议保留字段：

- `run_id`
- `graph_id`
- `graph_name`
- `status`
- `current_node_id`
- `revision_round`
- `max_revision_round`
- `errors`
- `warnings`
- `started_at`
- `completed_at`

产出文件：

- 新增 [state_schema.py](/home/abyss/GraphiteUI/backend/app/runtime/state_schema.py)

完成标准：

- 编译器校验时能检测字段冲突

---

## 5. Phase 2：编译器与运行时重构

## Task 2.1 重写 Graph Parser

优先级：`P0`

目标：

解析新版 graph 协议，而不再只关心旧版 `input/planner/evaluator/finalizer`。

后端目标文件：

- [graph_parser.py](/home/abyss/GraphiteUI/backend/app/compiler/graph_parser.py)

需要支持：

- `start`
- `end`
- `condition`
- 工作流节点的 `reads/writes/params`
- 边的 `flow_keys`

完成标准：

- parser 输出统一 `WorkflowConfigV2`
- 其中包含：
  - `nodes_by_id`
  - `edges_by_id`
  - `execution_order`
  - `state_schema`
  - `theme_config`

---

## Task 2.2 重写 Validator

优先级：`P0`

目标：

从“结构合法”升级到“结构 + 状态依赖 + 业务顺序合法”。

后端目标文件：

- [validator.py](/home/abyss/GraphiteUI/backend/app/compiler/validator.py)

必须新增的校验：

- 必须存在 `start` 和 `end`
- `condition` 节点必须至少两个输出
- 节点读取字段必须可追溯
- 边上的 `flow_keys` 必须存在于 source 节点输出中
- `review_variants` 之前必须存在 `generate_variants`
- `prepare_video_todo` 之前必须存在 `generate_video_prompts`

完成标准：

- validator 返回的 issue 能精确指出节点、边、字段问题

---

## Task 2.3 引入正式 Node Handler Registry

优先级：`P0`

目标：

将当前 runtime 从“按旧节点类型 if/else”升级为“按 handler 注册表派发”。

后端目标文件：

- 新增 [registry.py](/home/abyss/GraphiteUI/backend/app/runtime/registry.py)
- 拆分 [nodes.py](/home/abyss/GraphiteUI/backend/app/runtime/nodes.py)

建议拆分的 handler 文件：

- `handlers/research.py`
- `handlers/assets.py`
- `handlers/analysis.py`
- `handlers/generation.py`
- `handlers/review.py`
- `handlers/finalize.py`

注册表能力：

- `start`
- `research`
- `collect_assets`
- `normalize_assets`
- `select_assets`
- `analyze_assets`
- `extract_patterns`
- `build_brief`
- `generate_variants`
- `generate_storyboards`
- `generate_video_prompts`
- `review_variants`
- `condition`
- `prepare_image_todo`
- `prepare_video_todo`
- `finalize`

完成标准：

- runtime 不再依赖大段 `if node.type == ...`

---

## Task 2.4 将 Skill 下沉为 Tool Registry

优先级：`P1`

目标：

把当前 `slg_*` 和其他 helper 能力下沉成工具层。

后端目标文件：

- [registry.py](/home/abyss/GraphiteUI/backend/app/skills/registry.py)
- 新增 `backend/app/tools/`

建议工具拆分：

- `rss_fetcher.py`
- `ad_library_fetcher.py`
- `video_understanding.py`
- `text_generation.py`
- `artifact_writer.py`
- `score_helper.py`

完成标准：

- 工作流节点直接表达“阶段行为”
- skill/tool 只负责提供底层能力

---

## Task 2.5 Condition Node 编译与执行

优先级：`P0`

目标：

把条件分支从“特殊边”改成正式节点。

后端目标文件：

- [workflow_builder.py](/home/abyss/GraphiteUI/backend/app/compiler/workflow_builder.py)
- [router.py](/home/abyss/GraphiteUI/backend/app/runtime/router.py)

完成标准：

- `condition` 节点读取 `evaluation_result`
- 根据结果走 `pass/revise/fail`
- 编译器不再要求 evaluator 直接挂 conditional edges

---

## 6. Phase 3：编辑器交互升级

## Task 3.1 扩展前端类型系统

优先级：`P0`

目标：

让前端先理解新版 graph 协议。

前端目标文件：

- [editor.ts](/home/abyss/GraphiteUI/frontend/types/editor.ts)
- [graph-api.ts](/home/abyss/GraphiteUI/frontend/lib/graph-api.ts)

需要新增的类型：

- `StateField`
- `ThemeConfig`
- `EditorNodeReadsWrites`
- `EditorEdgeFlow`
- `GraphDocumentV2`

完成标准：

- 前端本地 graph 结构可以表达 `state_schema`、`reads/writes`、`flow_keys`

---

## Task 3.2 引入 State Panel

优先级：`P0`

目标：

让 state 成为 editor 左侧的一等公民。

前端目标文件：

- 新增 [state-panel.tsx](/home/abyss/GraphiteUI/frontend/components/editor/state-panel.tsx)
- 更新 [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- 更新 [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)

必须支持：

- 查看 state 字段
- 新增字段
- 删除字段
- 编辑 title/description/type/role
- 从节点配置面板自动新增字段

完成标准：

- 新字段创建后能同步出现在节点输入/输出选择里

---

## Task 3.3 节点 UI 改成左入右出

优先级：`P0`

目标：

让节点视觉语义与 LangGraph 数据流一致。

前端目标文件：

- 新增 [graph-node.tsx](/home/abyss/GraphiteUI/frontend/components/editor/graph-node.tsx)
- 更新 [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- 更新 [globals.css](/home/abyss/GraphiteUI/frontend/app/globals.css)

要求：

- 左侧只显示输入 handle
- 右侧只显示输出 handle
- 节点上显示核心 reads/writes 摘要

完成标准：

- 画布节点不再只显示 label，而是能看出 I/O 语义

---

## Task 3.4 节点配置面板改成 `Inputs / Outputs / Params`

优先级：`P0`

目标：

将当前“以参数表单为主”的配置面板重构为三段式。

前端目标文件：

- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- 可拆出：
  - `node-inputs-editor.tsx`
  - `node-outputs-editor.tsx`
  - `node-params-editor.tsx`

必须支持：

- 为节点选择输入字段
- 为节点声明输出字段
- 在配置面板内点 `+` 直接创建新 state 字段

完成标准：

- 节点配置的第一视角变成“读写哪些状态”

---

## Task 3.5 边支持 flow keys 展示

优先级：`P1`

目标：

让边不再只是顺序关系。

前端目标文件：

- 新增 [edge-label.tsx](/home/abyss/GraphiteUI/frontend/components/editor/edge-label.tsx)
- 更新 [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)

必须支持：

- 给边绑定 `flow_keys`
- 在画布上显示 1~3 个主要 keys
- keys 太多时显示聚合标签

完成标准：

- 用户能看出某条边主要携带哪些状态项

---

## Task 3.6 引入 Condition Node 编辑器

优先级：`P1`

目标：

为 `condition` 节点提供专门的编辑体验。

前端目标文件：

- 新增 [condition-node-editor.tsx](/home/abyss/GraphiteUI/frontend/components/editor/condition-node-editor.tsx)

必须支持：

- 指定判断输入字段
- 配置输出分支标签
- 将分支标签和出边绑定

完成标准：

- 用户不需要再在边 label 上手写 `pass/revise/fail`

---

## 7. Phase 4：模板与主题系统

## Task 4.1 引入 Template Registry

优先级：`P0`

目标：

把复杂工作流从“示例图文件”升级为正式模板。

目标文件：

- 新增 `backend/app/templates/`
- 新增 `frontend/lib/templates.ts`

建议模板文件：

- `minimal_workflow.json`
- `creative_factory.json`

完成标准：

- 模板包含 graph、state_schema、theme_config、默认节点参数

---

## Task 4.2 前端 Template Picker

优先级：`P1`

目标：

用户能从模板创建 graph，而不是从空白画布搭。

前端目标文件：

- 新增 [template-picker.tsx](/home/abyss/GraphiteUI/frontend/components/editor/template-picker.tsx)
- 可在 Workspace 也增加入口

完成标准：

- 用户能选中 `Creative Factory`
- 自动加载默认 state 和节点序列

---

## Task 4.3 Theme Config Panel

优先级：`P0`

目标：

支持通过配置改变工作流主题和输出方向。

前端目标文件：

- 新增 [theme-config-panel.tsx](/home/abyss/GraphiteUI/frontend/components/editor/theme-config-panel.tsx)
- 更新 [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)

建议字段：

- `domain`
- `genre`
- `market`
- `language`
- `creative_style`
- `tone`
- `evaluation_policy`

完成标准：

- 修改 `theme_config` 后能保存进 graph
- 后端运行时能读到它

---

## Task 4.4 Template + Theme 的联动默认值

优先级：`P1`

目标：

模板选择后自动注入推荐主题参数。

示例：

- `Creative Factory + SLG`
- `Creative Factory + RPG`
- `Creative Factory + Survival`

完成标准：

- 用户切换 theme 后，不需要手动重改所有节点参数

---

## 8. Phase 5：Demo 对齐与迁移

## Task 5.1 将 `SLG creative factory` 迁移到正式节点链

优先级：`P0`

目标：

不再依赖过渡版 `skill_executor + slg_*` 作为主要表达方式。

迁移后的目标节点链：

- `start`
- `research`
- `collect_assets`
- `normalize_assets`
- `select_assets`
- `analyze_assets`
- `extract_patterns`
- `build_brief`
- `generate_variants`
- `generate_storyboards`
- `generate_video_prompts`
- `review_variants`
- `condition`
- `prepare_image_todo`
- `prepare_video_todo`
- `finalize`
- `end`

完成标准：

- 编辑器画布直接展示上述节点
- runtime 可执行

---

## Task 5.2 保留过渡兼容层

优先级：`P1`

目标：

避免已有 `demo-graph` 和 `slg-creative-factory` 立刻失效。

完成标准：

- 旧模板仍能打开
- 打开时自动提示“可升级到新版节点模型”

---

## Task 5.3 Demo 对齐测试清单

优先级：`P0`

目标：

确保新版 editor 真能完成 demo 任务。

必须验证：

- 能生成 `news_context`
- 能生成 `pattern_summary`
- 能生成 `creative_brief`
- 能生成 `script_variants`
- 能生成 `storyboard_packages`
- 能生成 `video_prompt_packages`
- 能生成 `review_results`
- 能生成 `best_variant`
- 能生成 `image_generation_todo`
- 能生成 `video_generation_todo`

完成标准：

- 以上字段都能在 run detail 或 state snapshot 中查看

---

## 9. 建议修改文件总表

### 后端优先文件

- [graph.py](/home/abyss/GraphiteUI/backend/app/schemas/graph.py)
- [graph_parser.py](/home/abyss/GraphiteUI/backend/app/compiler/graph_parser.py)
- [validator.py](/home/abyss/GraphiteUI/backend/app/compiler/validator.py)
- [workflow_builder.py](/home/abyss/GraphiteUI/backend/app/compiler/workflow_builder.py)
- [nodes.py](/home/abyss/GraphiteUI/backend/app/runtime/nodes.py)
- [state.py](/home/abyss/GraphiteUI/backend/app/runtime/state.py)
- [routes_graphs.py](/home/abyss/GraphiteUI/backend/app/api/routes_graphs.py)

### 前端优先文件

- [editor.ts](/home/abyss/GraphiteUI/frontend/types/editor.ts)
- [graph-api.ts](/home/abyss/GraphiteUI/frontend/lib/graph-api.ts)
- [editor-store.ts](/home/abyss/GraphiteUI/frontend/stores/editor-store.ts)
- [editor-workbench.tsx](/home/abyss/GraphiteUI/frontend/components/editor/editor-workbench.tsx)
- [editor-presets.ts](/home/abyss/GraphiteUI/frontend/lib/editor-presets.ts)
- [globals.css](/home/abyss/GraphiteUI/frontend/app/globals.css)

---

## 10. 最小开工顺序

如果马上开始实现，建议只按下面 6 步推进：

1. 扩展后端 graph schema
2. 建立旧协议到新协议的 adapter
3. 扩展前端 graph 类型和 store
4. 做 `State Panel`
5. 做 `Inputs / Outputs / Params`
6. 把 `Creative Factory` 模板迁移到正式节点链

---

## 11. 里程碑定义

### Milestone A：协议 ready

- 新版 graph schema 完成
- 旧协议兼容完成

### Milestone B：编译器 ready

- validator / parser / workflow builder 支持新模型

### Milestone C：编辑器 ready

- state panel
- 左入右出
- I/O 配置面板

### Milestone D：模板 ready

- Creative Factory 模板可创建
- Theme config 可编辑

### Milestone E：demo ready

- 通过编排和配置完成 demo 主任务
- 能切换主题
- 能调整节点顺序

---

## 12. 最终建议

接下来真正应该做的，不是继续堆更多过渡 skill，而是：

- 先升级协议
- 再升级 editor
- 最后把 demo 迁移到正式节点模型

只要这三步走对，GraphiteUI 就会从“能跑的画布”升级成真正的 LangGraph 状态编排器。
