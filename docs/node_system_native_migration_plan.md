# Node System Native Migration Plan

这份文档用于指导 GraphiteUI 从“后端兼容旧前端结构”逐步迁移到“前端原生支持正式 `node_system` 协议”的全过程。

目标不是一次性推翻现有编辑器，而是在 **不改视觉设计、不改用户操作逻辑** 的前提下，逐步把前端的数据内核切到正式协议，最终删除兼容层。

## 总目标

最终状态需要同时满足下面 5 条：

1. 前端页面视觉保持当前版本，不重新设计节点卡片、画布、工具栏和面板布局。
2. 前端交互保持当前版本，不改变用户创建节点、连线、编辑、保存、运行的操作路径。
3. 前端内部状态以正式 `node_system` 协议为唯一数据源，不再以旧 `NodePresetDefinition` 结构作为 source of truth。
4. `/api/templates`、`/api/graphs`、`/api/graphs/save|validate|run`、`/api/presets` 都以正式协议为主，不再依赖 `legacy_node_system.py` 做主链转换。
5. 删除兼容层后，`hello_world`、已有图、节点预设、知识库 skill、cycles 都仍然可用。

## 迁移边界

### 这次迁移允许做的事

- 调整前端内部数据模型
- 调整前端 selector / adapter / serializer
- 调整后端接口返回结构
- 调整模板和预设存储结构
- 增加前端本地派生字段

### 这次迁移明确不做的事

- 不重做页面布局
- 不修改节点卡片视觉语言
- 不更改创建节点、编辑节点、连线、保存、运行的交互路径
- 不把“顺手重构 UI”夹带进来

## 当前状态

当前系统处于过渡态：

- 后端正式协议已经是 `node_system`
- 后端已经存在兼容层 [legacy_node_system.py](/home/abyss/GraphiteUI/backend/app/api/legacy_node_system.py)
- 前端主编辑器仍以旧结构思维工作
- 旧前端依赖的展示字段主要有：
  - `config.label`
  - `config.description`
  - `port.label`
  - `state.title`
  - `branch.label`
  - 旧形态的 `skills`
  - `outputBinding`

因此当前最核心的问题不是“页面长什么样”，而是“前端内部真实依赖的数据模型还是旧的”。

## 迁移原则

### 原则 1：先改内核，再改接口

先让前端内部可以理解正式协议，再逐步切读取和写入接口。  
不要一开始就把所有接口直接换成正式结构。

### 原则 2：单步可回退

每一阶段都必须能单独验证并可回滚。  
不能出现“改到一半只能继续往前，无法稳定停住”的状态。

### 原则 3：兼容层只作为过渡

兼容层不是长期架构。  
每完成一个阶段，都要明确“这一阶段之后哪些兼容逻辑不再需要”。

### 原则 4：`hello_world` 是第一张验收图

每一步都必须至少用 `hello_world` 走通：

- 新建
- 编辑
- 保存
- 校验
- 运行

通过之后再扩到已有图和更多模板。

## 阶段计划

## Phase 0：建立迁移护栏

### 目标

把“哪些东西不能动”先固定住，避免后续开发再次误伤前端视觉和交互。

### 改动范围

- 补一份迁移计划文档
- 在实现中坚持以下约束：
  - 不改节点卡片整体骨架
  - 不改画布布局
  - 不改工具栏交互
  - 不改创建菜单入口

### 可验证结果

- 文档存在并可作为后续开发基准
- 后续 PR / commit 都能明确标注属于哪个阶段

### 完成标准

- 本文档进入 `docs/`
- 团队后续默认按本文档顺序推进

## Phase 1：前端内部引入正式协议镜像（已完成）

### 目标

让前端在 **不改页面展示** 的前提下，开始在内部保留一份正式 `node_system` graph 数据，而不是只保留旧 payload。

### 主要改动

- 在前端新增正式 graph 类型对应的本地结构
- 编辑器内部同时持有两层：
  - `canonicalGraph`
  - 当前页面展示所需的派生视图
- 节点卡片展示仍然读派生视图，不直接读旧持久化对象

### 关键规则

- `canonicalGraph.state_schema` 使用对象映射
- `canonicalGraph.nodes` 使用对象映射
- 节点 key 继续作为唯一身份
- 节点显示名使用 `node.name`
- 节点描述直接来自 `node.description`
- `state.title` 不再作为正式源字段，显示时直接取 state 名
- `port.label` 不再作为正式源字段，显示时直接取绑定 state 名

### 影响文件

- `frontend/components/editor/node-system-editor.tsx`
- 前端类型文件和本地 adapter / selector 文件

### 不改的内容

- 不改 API
- 不改保存/运行链路
- 不删兼容层

### 可验证结果

- 页面显示与当前版本一致
- 前端内存里已经可以拿到一份正式协议 graph
- 改节点显示名、改描述、改 state 时，派生视图正确刷新

### 完成标准

- 前端内部不再把旧 payload 当唯一 source of truth
- 旧展示结构只是派生结果

### 当前落实结果

- 前端已经在内部稳定构建 `canonicalGraph`
- 节点显示名和节点说明的读路径已开始优先使用正式协议镜像
- 运行态摘要、节点查找和部分核心展示已不再直接依赖旧节点字段
- 页面视觉、节点卡片骨架和用户交互保持不变

## Phase 2：节点编辑动作直接写正式协议

### 目标

把当前所有编辑动作，从“改旧 config”切成“直接改正式协议对象”。

### 主要改动

- 改节点显示名：直接改 `node.name`
- 改节点描述：直接改 `node.description`
- 改 state：直接改 `canonicalGraph.state_schema`
- 新增输入/输出绑定：直接改 `reads / writes`
- 删除输入/输出绑定：直接改 `reads / writes`
- 条件分支编辑：直接改 `conditional_edges` 和 condition config

### 关键规则

- 页面上的输入/输出只是 state 引用视图
- 旧 `config.inputs / outputs` 不再是正式编辑目标
- 旧 `stateReads / stateWrites` 也不再作为主状态，必要时仅作派生

### 影响文件

- `frontend/components/editor/node-system-editor.tsx`
- 前端派生器 / serializer / helper

### 不改的内容

- 不切 API
- 不删兼容层

### 可验证结果

- 双击节点改名后，真实改的是正式 graph
- 修改 state 名称/说明后，全图引用同步变化
- 新增/删除端口绑定后，正式 graph 中的 `reads / writes` 立即正确更新

### 完成标准

- 前端编辑动作已经直接写正式协议
- 页面上旧结构字段只剩展示派生用途

## Phase 3：保存 / 校验 / 运行原生化

### 目标

让前端直接把正式协议发给后端，不再通过老 payload 保存、校验和运行。

### 主要改动

- `buildPayload()` 直接输出正式 `node_system`
- `/api/graphs/save`
- `/api/graphs/validate`
- `/api/graphs/run`
  改为直接吃前端发出的正式协议

### 影响文件

- `frontend/components/editor/node-system-editor.tsx`
- `backend/app/api/routes_graphs.py`

### 兼容层变化

- `legacy_node_system.py` 中和保存/校验/运行相关的入口不再走主链
- 兼容层此时只保留“旧读取转换”

### 可验证结果

- `hello_world` 可直接保存
- `hello_world` 可直接校验
- `hello_world` 可直接运行
- 保存后读回页面显示不变

### 完成标准

- 前端写路径全部原生化
- 后端兼容层不再处理主写链路

## Phase 4：模板和图详情读取原生化

### 目标

让前端直接读取正式模板和正式图结构，不再依赖后端把它们翻译成老 shape。

### 主要改动

- `/api/templates` 返回正式模板
- `/api/templates/{id}` 返回正式模板
- `/api/graphs` 返回正式 graph
- `/api/graphs/{graph_id}` 返回正式 graph
- 前端本地把正式数据派生为当前页面需要的展示结构

### 影响文件

- `backend/app/api/routes_templates.py`
- `backend/app/api/routes_graphs.py`
- 前端编辑器页和模板加载逻辑

### 关键要求

- 页面视觉不变
- 节点卡片内容来源改为本地派生，而不是后端兼容字段

### 可验证结果

- 新建 `hello_world` 页面正常
- 打开已有 graph 页面正常
- 编辑器首页图列表正常
- 模板列表正常

### 完成标准

- 模板和图详情读取主链都已原生化
- 后端兼容层只剩极少数历史兜底或预设相关逻辑

## Phase 5：节点预设原生化

### 目标

保留“保存节点为预设”能力，但让预设也切到正式协议心智下。

### 为什么要单独成阶段

节点预设和 state 单一数据源不冲突，但它保存的是：

- 节点类型
- 节点自身运行配置
- 节点默认读取哪些 state
- 节点默认写入哪些 state
- 节点默认 UI 信息

它不是 graph，也不是 state 当前值快照。

### 主要改动

- 预设保存时直接保存正式协议下的节点定义
- 预设读取时直接返回正式节点结构
- 新建节点时：
  - 如果预设引用的 state 已存在，则复用
  - 如果不存在，则自动创建对应 state

### 影响文件

- `/api/presets`
- `backend/app/core/storage/preset_store.py`
- 前端“保存预设”和“从预设创建节点”逻辑

### 不改的内容

- 不改变“保存为预设”的按钮位置和交互入口

### 可验证结果

- agent / condition 节点仍可保存为预设
- 新建节点时仍可从预设创建
- 预设生成的节点能正确绑定或创建所需 state

### 完成标准

- 预设系统不再依赖旧 `NodePresetDefinition`
- 预设与正式协议一致

## Phase 6：删除兼容层

### 目标

彻底去掉后端兼容层，让正式协议成为唯一链路。

### 主要改动

- 删除 [legacy_node_system.py](/home/abyss/GraphiteUI/backend/app/api/legacy_node_system.py)
- 删除后端 routes 中对 legacy 转换的调用
- 删除前端不再使用的旧类型和 helper：
  - 旧 graph payload 结构
  - 旧 `StateField[]`
  - 旧 `NodePresetDefinition` 主链依赖
  - 旧 `outputBinding`
  - 旧 skill 包装对象主链依赖

### 可验证结果

- 不存在 legacy adapter 仍在主链中被调用
- `hello_world`、已有图、节点预设仍可正常使用
- 页面视觉和交互保持不变

### 完成标准

- 前后端都只保留正式 `node_system` 协议

## 每个阶段的统一验收清单

每完成一个阶段，都必须至少做下面这些检查：

1. `hello_world` 新建正常
2. `hello_world` 保存正常
3. `hello_world` 校验正常
4. `hello_world` 运行正常
5. 已有 graph 至少抽查 1 张能打开
6. 节点卡片视觉没有漂移
7. 画布交互没有变化
8. `scripts/start.sh` 重启后仍可正常访问

## 推荐执行顺序

建议严格按下面顺序推进：

1. Phase 1：前端内部引入正式协议镜像
2. Phase 2：节点编辑动作直接写正式协议
3. Phase 3：保存 / 校验 / 运行原生化
4. Phase 4：模板和图详情读取原生化
5. Phase 5：节点预设原生化
6. Phase 6：删除兼容层

不要跳步骤。  
尤其不要在 Phase 1 和 Phase 2 还没稳定时，就直接切模板或图详情接口。

## 当前下一步

当前最适合开始的第一步是：

- Phase 1：前端内部引入正式协议镜像

原因：

- 风险最低
- 不改页面视觉
- 不改用户交互
- 能为后续删兼容层打下数据基础
