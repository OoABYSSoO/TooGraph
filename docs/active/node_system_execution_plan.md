# Node System Execution Plan

## 1. Purpose

本文档把 [node_system_design.md](/home/abyss/GraphiteUI/docs/active/node_system_design.md) 中的目标，拆成当前代码库可执行、可验证、可回滚的开发步骤。

它回答的是：

- 当前代码离目标差多远
- 先做什么，后做什么
- 每一步改哪些层
- 每一步如何验证
- 哪些步骤是前置依赖

本文档不再讨论方向选择；方向已经由 `node_system_design.md` 收口。

---

## 2. Current Baseline

### 2.1 Frontend

当前前端已经具备一部分“定义驱动”能力，但仍是过渡状态。

现状：

- 节点定义仍保存在本地 TS 注册表：
  [editor-node-definitions.ts](/home/abyss/GraphiteUI/frontend/lib/editor-node-definitions.ts)
- 当前只覆盖少量特例节点：
  - `text_input`
  - `hello_model`
  - `text_output`
- 节点协议仍是旧结构：
  - `type`
  - `kind`
  - `inputs / outputs / widgets`
  - `runtime mapping`
- 还没有：
  - `preset_id`
  - `system_instruction`
  - `task_instruction`
  - `skills`
  - `Condition Node` 的新协议
  - `Empty Agent Node / Preset Agent Node`

### 2.2 Backend

当前后端仍围绕旧 graph 协议工作。

现状：

- graph schema 仍依赖固定 `NodeType` 枚举：
  [graph.py](/home/abyss/GraphiteUI/backend/app/core/schemas/graph.py)
- validator 仍依赖旧条件节点规则：
  [validator.py](/home/abyss/GraphiteUI/backend/app/core/compiler/validator.py)
- `settings` 接口仍直接暴露 `skills`：
  [routes_settings.py](/home/abyss/GraphiteUI/backend/app/api/routes_settings.py)
- 运行时仍以旧 handler / node type 体系为核心

### 2.3 Gap Summary

从当前代码到目标设计，主要差距有五类：

1. 节点原型还没切到四类核心原型
2. preset 体系还不存在
3. skill 挂载协议还不存在
4. 前后端还没有单一节点定义加载链路
5. graph schema / validator / runtime 仍被旧业务节点模型绑定

---

## 3. Planning Principles

开发顺序必须满足四条约束：

1. 每一步都能单独验证
2. 每一步都尽量可回退
3. 不同时重写前端协议、后端协议、运行时三层
4. 先建立新协议并双轨兼容，再移除旧实现

因此不建议一次性把系统切到新节点模型。

---

## 4. Target Milestone

最终目标不是“把现有节点换个名字”，而是做到：

1. 用户侧只主要面对：
   - `Input Boundary`
   - `Empty Agent Node`
   - `Preset Agent Node`
   - `Condition Node`
   - `Output Boundary`

2. skill 成为 agent node 的能力插件，而不是独立节点类型

3. preset 成为模板、类、快照三者结合的节点来源系统

4. 节点输出是否展示和保存，由 `Output Boundary` 决定

5. 新增常见能力时，主要新增：
   - skill
   - preset
   而不是新增新的底层节点类型

---

## 5. Phase Breakdown

下面的阶段顺序是建议执行顺序。

---

## Phase 0: Freeze The Design Vocabulary

### Goal

先让仓库中“节点系统”的术语只有一套，避免开发过程中继续出现旧旧混杂。

### Changes

1. 将 `node_system_design.md` 作为节点系统唯一方向文档
2. 后续文档引用统一使用：
   - `Input Boundary`
   - `Empty Agent Node`
   - `Preset Agent Node`
   - `Condition Node`
   - `Output Boundary`
   - `skill attachment`
   - `preset_id`

### Verification

1. `docs/active/` 中节点方向只保留一份主文档
2. `docs/README.md` 的 active 节点入口只指向该文档

### Status

已完成。

---

## Phase 1: Introduce New Node Definition Schema In Frontend

### Goal

先在前端建立“新节点协议”，但不立即替换所有旧节点和运行时。

### Why First

这是 UI 层和产品交互层的基础。
如果这里不先稳定，后端后面即使能提供新协议，前端也没有消费面。

### Changes

1. 新增新的前端节点定义 schema

建议新增文件：

- `frontend/lib/node-system-schema.ts`

内容至少包含：

- 四类核心原型的 TS 类型
- `ValueType`
- `SkillAttachment`
- 引用路径类型
- `preset_id`

2. 在前端保留旧 `editor-node-definitions.ts`，但明确标记为过渡层

3. 新增一份静态“零号预设 + 若干 preset agent/input/output/condition”的前端 mock 数据

建议新增：

- `frontend/lib/node-presets-mock.ts`

### Deliverables

1. `Empty Agent Node` 的前端 schema 类型
2. `Input Boundary` 的前端 schema 类型
3. `Output Boundary` 的前端 schema 类型
4. `Condition Node` 的前端 schema 类型

### Verification

1. TypeScript 编译通过
2. 新 schema 文件里能表达：
   - `preset_id`
   - `system_instruction`
   - `task_instruction`
   - `skills`
   - `branches`
   - `display_mode`

### Exit Criteria

前端已经能“表示”新模型，即使还不能完整渲染。

---

## Phase 2: Build Preset-Driven Node Creator In Frontend

### Goal

先把创建节点的 UX 切到新心智，但节点运行仍可先走旧实现或 mock。

### Changes

1. 新建节点面板调整为两类入口：
   - `Empty Agent Node`
   - `Preset Agent Node`

2. 基于 `value_type` 做创建推荐

规则：

- 从连线拖出时，根据源端口类型推荐 preset
- 双击空白画布时：
  - 第一个是 `Empty Agent Node`
  - 后面是常用 preset

3. 前端允许插入 preset agent node，并在 inspector 中修改

4. 允许将修改后的 agent node 保存为新的本地 preset 草案

这一阶段可以先只做前端内存态，不要求后端保存 preset。

说明：

- inspector 中直接编辑 `inputs / outputs / skills / branches` 的 JSON 只是原型阶段手段
- 这不是最终用户交互
- 最终用户不应被要求手写整段 JSON 来维护节点结构

### Deliverables

1. 节点创建器支持：
   - 从连线上下文推荐
   - 从空白画布推荐
2. `Empty Agent Node` 可创建
3. 至少 2~3 个 `Preset Agent Node` 示例可创建

### Verification

1. 从 `text` 输出拖出时，推荐文本相关 preset
2. 双击空白画布时，`Empty Agent Node` 排第一
3. 插入 preset 后可编辑其：
   - `label`
   - `inputs`
   - `outputs`
   - `system_instruction`
   - `task_instruction`
   - `skills`

### Exit Criteria

用户已经可以按新心智创建节点，而不是继续依赖旧业务节点清单。

---

## Phase 2.5: Replace Raw JSON Editing With Structured Node Editors

### Goal

把 inspector 从“原型期 JSON 直接编辑”升级为“点击、选择、增删行”的结构化编辑器。

### Why Now

如果继续让用户直接改整段 JSON：

- 容易破坏节点结构
- 难以发现类型错误
- 对非开发者不友好
- 不符合后续 preset/模板化的产品方向

当前 JSON 编辑器应只视为开发期调试面板，而不是正式交互。

### Changes

1. 为 `Agent Node` 提供结构化编辑器

- `inputs` 使用行式编辑器
  - 添加输入
  - 删除输入
  - 编辑 `key / label / value_type / required`
- `outputs` 使用行式编辑器
  - 添加输出
  - 删除输出
  - 编辑 `key / label / value_type`
- `skills` 使用行式编辑器
  - 选择 `skill_key`
  - 编辑 `name`
  - 编辑 `usage`
  - 分步编辑 `input_mapping / context_binding`

2. 为 `Condition Node` 提供结构化编辑器

- `inputs`
- `branches`
- `rule`
- `branch_mapping`

3. 为 `Input Boundary` 提供结构化编辑器

- `label`
- `value_type`
- `default_value`
- `placeholder`
- `input_mode`

4. 为 `Output Boundary` 提供结构化编辑器

- `label`
- `display_mode`
- `persist_enabled`
- `persist_format`
- `file_name_template`

5. 保留一个“高级 JSON”折叠区

- 默认收起
- 仅用于调试和快速粘贴
- 不作为主要编辑入口

### Deliverables

1. `inputs / outputs / branches / skills` 不再要求用户直接编辑整段 JSON
2. 新增统一的行式编辑组件
3. `value_type` 改为下拉选择
4. `required / persist_enabled` 改为开关或复选框
5. Inspector 默认主路径为结构化编辑，不是原始 JSON

### Verification

1. 不手写 JSON 也能完成：
   - 新增一个输入
   - 新增一个输出
   - 修改一个 skill
   - 新增一个 branch
2. 非法中间结构不会轻易破坏节点配置
3. 用户可以通过点击和选择完成大部分节点编辑
4. 原始 JSON 面板即使隐藏，也能作为调试兜底存在

### Exit Criteria

节点结构编辑已经从开发者式 JSON 原型升级为面向用户的结构化交互。

### Status

前端原型已完成：

- inspector 主路径已切换为结构化编辑
- `inputs / outputs / skills / branches / rule / branch_mapping` 已支持表单式增删改
- 原始 JSON 仅作为默认收起的高级调试兜底保留

---

## Phase 3: Add New Graph Payload Family Without Breaking Old Runtime

### Goal

在后端先增加新 graph 协议的数据结构，但不立即砍掉旧协议。

### Changes

1. 扩展或并行新增新的 graph schema

建议：

- 保留现有 `GraphPayload`
- 新增一版 node definition family 或 new graph payload family

例如：

- `backend/app/core/schemas/node_system.py`
- 或 `backend/app/core/schemas/graph_v2.py`

2. 新协议至少要能表达：

- `preset_id`
- `Input Boundary`
- `Agent Node`
- `Condition Node`
- `Output Boundary`
- `skills`
- `branches`
- `display/persist`

3. 保持 `/api/graphs/save` 与 `/api/graphs/validate` 对旧 payload 继续兼容

### Deliverables

1. 新节点协议的后端 schema
2. 基础序列化与校验入口

### Verification

1. 新 schema 单测通过
2. 旧 graph 保存/验证不回归
3. 后端可以接受一份最小的 `Empty Agent Node` payload

### Exit Criteria

后端已经能“理解”新模型，但还不需要完整运行。

### Status

基础接入已完成：

- 后端新增了 `node_system` graph schema
- `/api/graphs/save` 与 `/api/graphs/validate` 已支持新旧 payload 双通道解析
- 存储层已能保存和读取新 graph family
- 运行时仍保持旧协议执行，`node_system` 仅完成“理解与保存”，尚未进入执行阶段

---

## Phase 4: Introduce Skill Registry Schema

### Goal

把 skill 从“仅运行时代码”升级成“机器可读能力定义”，否则 agent node 无法稳定挂载 skill。

### Why This Is A Hard Dependency

如果 skill 没有 schema，前端无法知道：

- 某个 skill 接收什么
- 返回什么
- 是否适合挂到某类 preset
- 该如何做 mapping

### Changes

1. 为现有 skill registry 增加机器可读定义

至少包含：

- `skill_key`
- `label`
- `description`
- `input_schema`
- `output_schema`
- `supported_value_types`
- `side_effects`

2. 提供后端接口：

- `/api/skills/definitions`

### Deliverables

1. skill definition schema
2. skill definition registry loader
3. skills definition API

### Verification

1. 接口返回至少 1~2 个正式 skill 定义
2. 前端可以拿到 skill 列表与它们的 input/output contract

### Exit Criteria

agent node 的 skill attachment 已经有可依赖的数据源。

### Status

基础定义链路已完成：

- 后端新增了 `skill definition schema`
- 已提供 `/api/skills/definitions`
- 当前已有一批正式 machine-readable skill definitions 可供前端读取
- 前端 `NodeSystemEditor` 已接入 definitions，用于 skill 选择与 contract 展示
- 前端已新增独立 `Skills` 管理页，用于查看 skill 列表、运行注册状态和 Claude Code / Codex 兼容缺口，并支持禁用、启用、删除
- skill 定义源已从 Graphite 原生 Python 常量迁到 `.claude/agents/*.md`，当前以 Claude Code 风格文件作为单一来源
- 现阶段 definitions 先覆盖代表性 skills，后续再扩展到完整 skill 集

---

## Phase 5: Make Agent Node Executable Through Generic Runtime

### Goal

建立第一版通用 `Agent Node` 执行器，而不是继续按业务节点 if/else 运行。

### Changes

1. 新增通用 agent runtime executor

职责：

- 解析 `inputs`
- 解析 `skills`
- 执行 skill attachments
- 组织 `system_instruction / task_instruction`
- 获取模型 `response`
- 根据 `output_binding` 写回 outputs

2. 第一版只支持：

- `response_mode = json`
- 基础 `input_mapping`
- 基础 `context_binding`
- 基础 `output_binding`

3. 暂时不支持：

- 复杂 skill 编排
- 并行 skill
- 表达式 DSL
- 自动修复链

### Deliverables

1. 通用 agent executor
2. 最小 response parser
3. 最小 output binder

### Verification

用一个最小 graph 跑通：

1. `Input Boundary(text)`
2. `Preset Agent Node` 挂一个简单 skill 或纯模型输出
3. `Output Boundary(text)`

验证点：

- 输入被消费
- skill 被调用
- 输出项被写入 state
- output node 能展示结果

### Exit Criteria

至少一个 agent preset 能脱离旧 `hello_model` 体系运行。

### Status

第一版最小 runtime 已接入：

- `node_system` graph 已增加独立执行入口
- 当前支持线性 DAG 下的 `Input Boundary -> Agent Node -> Output Boundary`
- `Agent Node` 已支持基础 skill 调用、文本生成与 `output_binding`
- `Condition Node` runtime 仍待 Phase 6

---

## Phase 6: Add Generic Condition Node Runtime

### Goal

把条件路由从旧 condition 特例升级成新协议下的 `Condition Node`。

### Changes

1. 新增 Condition Node 执行器
2. 第一版只支持：
   - `condition_mode = rule`
   - 单规则
   - 二分支

3. validator 同步迁移：
   - 不再硬编码必须有 `pass`
   - 改为依据 node 的 `branches`

### Deliverables

1. 新 condition executor
2. 新 validator branch rule

### Verification

跑一个二分支图：

1. agent 生成 `needs_revision`
2. condition 节点读该字段
3. 根据 true/false 走不同分支

### Exit Criteria

新 graph 体系已经能表达最基础的条件路由。

### Status

第一版条件路由已接入：

- `Condition Node` 已支持 `condition_mode = rule`
- 当前支持单规则与基础 `branch_mapping`
- 运行时会只激活命中的分支边
- 更复杂的表达式与 model-based condition 仍待后续扩展

---

## Phase 7: Make Output Boundary The Only Export Surface

### Goal

正式把展示/保存职责集中到 `Output Boundary`，清除中间节点保存产物的散乱逻辑。

### Changes

1. Output executor 支持：
   - `display_mode`
   - `persist_enabled`
   - `persist_format`
   - `file_name_template`

2. run detail / artifact view 调整为围绕 output boundary 展示

3. 约束中间节点：
   - 不再承担正式保存职责

### Deliverables

1. output runtime executor
2. text/json 第一版展示和保存能力

### Verification

验证三种连接语义：

1. 只连 agent
   - 参与运行，不强制导出
2. 只连 output
   - 展示并保存
3. 同时连 agent 与 output
   - 既参与运行又导出

### Exit Criteria

“输出是否可见/可保存由 output boundary 决定”正式成立。

### Status

第一版输出边界收口已完成：

- `Output Boundary` 已支持展示与可选持久化保存
- `node_system` runtime 已把导出结果收口为 `exported_outputs`
- run detail 已开始围绕 output boundary 展示导出内容
- 中间节点当前不承担正式文件导出职责

---

## Phase 8: Introduce Preset Persistence

### Goal

把前端内存态 preset 草案升级成正式可保存 preset。

### Changes

1. 后端新增 preset schema 与存储
2. 新增 preset API：
   - list
   - get
   - create
   - update

3. 支持：
   - 从 `Empty Agent Node` 另存为新 preset
   - 从 `Preset Agent Node` 派生新 preset

### Deliverables

1. preset schema
2. preset registry
3. preset CRUD API

### Verification

1. 修改后的 preset agent node 可以保存为新 preset
2. 新 preset 能在创建器里再次出现
3. `preset_id` lineage 不丢失

### Exit Criteria

`preset` 从设计概念变成正式系统能力。

### Status

第一版 preset 持久化已接入：

- 后端已新增 preset schema、SQLite 存储和 `/api/presets`
- 前端 `Save As Preset` 已改为保存到正式后端
- NodeSystemEditor 已会加载后端 preset 并纳入创建器
- 当前先完成 list/get/create/update 基础链路，lineage 通过 `sourcePresetId` 保留

---

## Phase 9: Migrate Existing Demo Flow Into New Preset + Skill Model

### Goal

不要再继续用 `hello_model` 当主验证路径，把 demo 中的核心阶段迁成新模型样板。

### Status

已完成：

- `hello_world` 模板已开始提供 `default_node_system_graph`
- 新默认图已改为 `Input Boundary -> Agent Node -> Output Boundary`
- 新默认 `Agent Node` 已通过 `generate_hello_greeting` skill 生成 greeting
- `hello_world` 的模板图已通过 validate/run，最小闭环已可作为 node system smoke path
- `creative_factory` 已补入 research/fetch 最小 node system 样板
- `creative_factory` 已扩展到 `research -> brief` 第二阶段闭环
- `creative_factory` 已扩展到 `review + condition` 第三阶段闭环
- `creative_factory` 第三阶段模板已通过 validate/run，并能正确命中 `pass / revise` 分支
- `creative_factory` 已扩展到 `storyboards / prompts / todo / finalize` 主链原型
- 模板默认入口已收口到 `default_node_system_graph`，不再继续维护旧 `default_graph` 默认图
- `/editor/new` 已支持按模板创建新节点系统图
- `hello_world` 默认验证链路已不再依赖旧 `hello_model`

### Changes

从 demo 中优先抽出最少一条闭环：

建议先迁以下能力链：

1. 输入文本 / 配置输入
2. 一个 research / fetch 类 preset
3. 一个 summarize / analyze 类 preset
4. 一个 output boundary

后续再迁：

- review + condition
- todo image
- todo video
- finalize

### Deliverables

1. 1 条最小新模型闭环模板
2. 对应 skill 定义
3. 对应 preset 定义

### Verification

1. 能从模板直接创建 graph
2. 能运行
3. 能看到 output
4. 不依赖 `hello_model`

### Exit Criteria

新节点系统已经不是纸面设计，而能承接 demo 的核心阶段。

### Conclusion

本阶段已满足退出条件。

---

## Phase 10: Remove Legacy Transitional Node Path

### Goal

在新链路稳定后，移除旧的三节点过渡体系和旧业务节点枚举依赖。

### Changes

1. 逐步移除：
   - `text_input`
   - `hello_model`
   - `text_output`
   作为 editor 核心建模方式

2. 收缩旧 `NodeType` 枚举的业务节点依赖

3. settings 中不再把 `skills` 直接作为主能力列表暴露给用户界面

### Deliverables

1. 旧前端 registry 下线
2. 旧业务节点型 runtime 路径下线或归档

### Verification

1. 新模板可跑
2. 老 `hello_world` 路径如仍保留，则明确降级为兼容模式
3. editor 默认入口不再依赖旧三节点模型

### Exit Criteria

系统默认路径已切到新节点模型。

### Status

已完成：

- 前端 `EditorClient` 已收口为 `NodeSystemEditor` 薄包装，旧三节点编辑器 registry 不再作为主实现保留
- 模板元数据 `supported_node_types` 已切到 node system 节点族，不再暴露旧业务节点枚举
- `/api/settings` 不再把 `skills` 作为主能力列表暴露给界面，仅保留 `skill_definitions`
- editor 默认创建路径与模板默认图均已切到 node system

### Conclusion

本阶段已满足退出条件，当前编排器默认开发路径已经完成切换。

---

## 6. Recommended Implementation Order

建议实际执行顺序：

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 8
9. Phase 9
10. Phase 10

理由：

- 先定义前端协议和创建器
- 再补后端 schema
- 再补 skill schema
- 再补通用执行器
- 再迁业务能力
- 最后移除旧路径

---

## 7. Verification Matrix

每阶段都至少应有一种明确验证方式：

### 文档/类型层

- TS build
- Python schema import / compile
- API schema smoke

### UI 层

- 新建节点
- 推荐节点
- inspector 编辑
- 连线兼容性

### Runtime 层

- graph validate
- graph run
- state snapshot
- output persist

### 模板层

- 从模板创建 graph
- 运行最小闭环

---

## 8. Explicit Non-Goals

当前这份执行文档不要求第一阶段立即做到：

1. Python 单源或 JSON 单源最终拍板
2. 完整多模态输入 UI
3. 复杂条件表达式
4. 并行 skill orchestration
5. 任意表达式 DSL
6. preset 市场/共享系统

这些都应在主链路稳定后再扩展。

---

## 9. First Actionable Slice

如果下一步只做一个最小可落地切片，建议是：

### Slice A

1. 新建前端新 schema 文件
2. 建立 `Empty Agent Node` 和 2 个 `Preset Agent Node` mock
3. 做新的节点创建器入口
4. 保持运行时仍走旧路径

### Why

因为这一步：

- 风险最低
- 最容易看到界面成果
- 同时不会马上破坏后端运行能力

### Acceptance

1. 用户能创建 `Empty Agent Node`
2. 用户能从 `text` 连线拖出并看到推荐 preset
3. 用户能插入一个 preset 并编辑配置

这一步完成后，再开始后端 schema 和 runtime 迁移，节奏会更稳。

---

## 10. Source Of Truth Statement

就“节点系统开发顺序”这个问题而言：

**本文档是当前唯一执行参考文档。**

如果后续讨论改变了阶段拆分，应优先修改本文档，而不是继续并行新增新的 active 执行文档。
