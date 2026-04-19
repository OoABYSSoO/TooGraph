# 编辑器节点创建链路回迁设计

## 目标

在当前 Vue 编辑器中回迁 `87d3d6ecaf4b25efdc35f9b0bccd9f4667109fb2` 的核心节点创建体验，但明确排除“把预设拖到画布上直接创建”这一路径。

这次回迁的重点不是加一个“新增节点”按钮，而是恢复旧版那套以画布为中心的创建闭环：

- 双击画布空白处创建节点
- 从输出口拖到空白处，打开类型感知的创建菜单
- 创建节点后自动补流程线
- 必要时自动创建并绑定 state
- 支持把文件拖到画布上直接生成输入节点

## 范围

### 本次包含

- 画布空白处双击 -> 打开节点创建菜单
- 从流程输出或数据输出拖到空白处 -> 打开带来源上下文的节点创建菜单
- 节点创建菜单的搜索、排序、类型过滤
- 通过菜单创建 `input / output / agent / condition`
- 创建完成后自动补控制流连线
- 对 agent / condition / output 在必要时自动补 state 及输入绑定
- 文件拖到画布上自动创建输入节点
- 空画布 onboarding 文案恢复到旧版语义

### 本次不包含

- 把预设拖到画布上直接创建节点
- 节点 preset 的拖拽来源面板
- 改回旧版“新建图默认从 seed template 起步”的行为
- 旧版 React Flow 组件结构的 1:1 回迁

## 用户体验设计

### 1. 双击空白画布创建

- 用户在画布空白区域双击时，打开节点创建菜单。
- 如果双击目标落在节点卡片、状态面板、下拉框、输入框或其他交互控件上，则不打开。
- 菜单出现在鼠标附近，沿用当前暖色主题。

### 2. 从输出口拖到空白处创建

- 从 `state-out` 点拖出去但没有落到合法目标时，在释放点打开创建菜单。
- 从流程出口拖出去但没有落到合法目标时，也在释放点打开创建菜单。
- 菜单携带来源上下文：
  - `sourceNodeId`
  - `sourceAnchorKind`
  - `sourceStateKey`（如果是数据输出）
  - `sourceValueType`（如果能解析）

### 3. 创建菜单内容

- 无来源上下文时，菜单包含：
  - `Input`
  - `Output`
  - 推荐 presets 对应的 `agent / condition`
- 有来源上下文时：
  - 对 `state-out`，仅展示与来源类型兼容的候选
  - 边界节点里保留最适合承接当前结果的 `Output`
  - `agent / condition` 只展示可兼容该类型输入的项
- 菜单保留搜索框。
- 菜单排序沿用旧版逻辑：
  1. `input`
  2. `output`
  3. `agent`
  4. `condition`
  - 同 family 下，原生 `node` 在 `preset` 前
  - 最后按 label 排序

### 4. 空画布文案

- 当节点数为 `0` 时，画布中央显示欢迎态：
  - 标题：`Double click to create your first node`
  - 说明：`Drag from an output handle into empty space to get type-aware preset suggestions.`
- 底部状态提示也补上：
  - `Double click canvas or drag from an output handle to open preset suggestions.`

## 创建后的行为设计

### 1. 创建普通 input

- 走 generic input 默认配置
- 默认文本输入
- 默认输出 state key 为 `value`
- 自动展开
- 自动选中

### 2. 创建普通 output

- 走 generic output 默认配置
- 默认输入 key 为 `value`
- `displayMode = auto`
- `persistEnabled = false`
- `persistFormat = auto`
- 如果创建动作来自已知类型的上游输出，则把 output 的输入类型收窄到该来源类型

### 3. 创建 agent / condition preset

- 从 preset definition 生成节点
- 补齐当前画布位置
- 初始展开
- 自动选中
- 如果 preset 自带 `state_schema`，先把对应 state 合并进文档

### 4. 自动补控制流

- 如果节点创建来自某个上游输出，则创建成功后尝试自动补一条控制流边
- 普通节点走 flow edge
- condition branch 走 route edge
- 规则沿用旧版 `buildCreationControlEdge(...)` 语义，不要求函数名完全一致

### 5. 自动补 state 与输入绑定

- 如果创建动作来自 `state-out`，并且目标节点没有可直接接入的现成输入：
  - 对 `agent / condition` 自动创建一个输入 state
  - state key 优先沿用来源 port/state key
  - state type 跟随来源值类型
  - 创建后自动把它绑定到目标节点输入侧
- 如果目标是 generic `output`：
  - 自动创建或复用对应 state
  - 自动绑定到 output 的输入

### 6. 文件拖入创建输入节点

- 文件 drop 到画布上时：
  - 自动检测值类型
  - 生成 input 节点
  - 节点标题、描述、输出类型、默认值按旧版逻辑自动组装
- 这一行为独立于 preset 拖拽保留

## 技术设计

### 1. 组件边界

#### `EditorCanvas.vue`

负责：

- 双击空白画布打开创建菜单
- 管理“拖线落空”后的创建菜单触发
- 把创建动作抛给工作区壳
- 渲染空画布 onboarding

新增或扩展的事件建议：

- `open-node-creation-menu`
- `create-node-from-menu`
- `create-node-from-file`

这里不直接修改文档，只负责收集位置和来源上下文。

#### 新增创建菜单组件

建议新增独立组件，例如：

- `frontend/src/editor/workspace/EditorNodeCreationMenu.vue`
- 配套 view model / menu model 文件

负责：

- 接收创建上下文
- 生成菜单项
- 搜索与过滤
- 使用现有 UI 库渲染浮层和列表

UI 优先使用现有库：

- `Element Plus`
- 搜索使用 `ElInput`
- 列表容器可用普通容器或 `ElScrollbar`
- 浮层优先 `ElPopover` / `ElDialog` 风格，不再手搓新的复杂弹层原语

#### `EditorWorkspaceShell.vue`

负责：

- 收到画布创建事件后真正修改文档
- 处理新增节点、自动接线、自动 state 绑定
- 统一标记 dirty 和 focus

### 2. 文档层 helper

当前 `graph-document.ts` 只有更新和连线 helper，不足以承接旧版创建事务。这次需要新增一组“创建型 helper”。

建议拆成单独文件，避免把 `graph-document.ts` 继续堆大：

- `frontend/src/lib/graph-node-creation.ts`

建议提供这些能力：

- `buildGenericInputNode(...)`
- `buildGenericOutputNode(...)`
- `buildNodeFromPreset(...)`
- `buildInputNodeFromFile(...)`
- `insertNodeIntoDocument(...)`
- `ensureStateDefinitionForCreation(...)`
- `bindCreatedStateToNode(...)`
- `buildCreationFlowEdge(...)`
- `applyNodeCreationResult(...)`

其中最关键的是 `applyNodeCreationResult(...)` 这一类事务性 helper，要把：

- 加节点
- 合并 state schema
- 绑定 reads/writes
- 自动补 flow / route

统一成一次文档更新，避免事件层东一块西一块拼 patch。

### 3. 创建上下文模型

建议新增一个明确的创建上下文类型，例如：

- `NodeCreationContext`

字段应包含：

- `position`
- `sourceNodeId`
- `sourceAnchorKind`
- `sourceStateKey`
- `sourceValueType`

这样画布层和文档层就不会靠松散参数传递。

### 4. 类型兼容逻辑

兼容性逻辑建议抽成纯函数，而不是散落在组件里：

- 给 `state-out` 使用值类型兼容判断
- 给 `agent / condition / output` 预设判断“是否可承接该类型”
- 给 generic output 推导输入类型

这部分最好落在单独 model 文件里，方便测试。

## 当前 Vue 版与回迁后的结构关系

### 保留不动

- 当前工作区 tab / welcome / 保存 / 运行链路
- 当前节点卡片 UI
- 当前 flow/state/route 连线渲染
- 当前状态面板和节点配置更新方式

### 新增补齐

- 画布内创建入口
- 创建菜单组件
- 创建事务 helper
- 文件拖入转 input 节点
- 自动补线 / 自动补 state 的旧版语义

### 明确不回退

- 不恢复 React 版 `NodeSystemEditor`
- 不恢复 `reka-ui`
- 不恢复 preset 拖到画布这条路径

## 测试设计

### 纯函数测试

- 创建菜单排序和过滤
- 来源类型兼容判断
- generic input/output 默认值
- 自动 state 推导
- 自动补 flow / route edge

### 结构测试

- 空画布欢迎态文案存在
- 双击画布空白处能触发创建菜单
- 从输出口拖到空白处能触发创建菜单
- 创建菜单包含搜索框和候选项
- 文件 drop 能走输入节点创建链路

### 集成行为测试

- 从空白处双击创建 agent
- 从 `state-out` 拖到空白处创建 output，并自动绑定 state
- 从流程出口拖到空白处创建节点，并自动补流程线
- 创建 condition 时自动 route 连接规则正确

### 构建与手工验证

- `node --test --experimental-strip-types ...`
- `cd frontend && npm run build`
- `./scripts/start.sh`
- 手工验证：
  - 双击空白画布
  - 从状态点拖到空白
  - 从流程出口拖到空白
  - 文件拖入画布

## 风险与约束

### 1. 当前画布没有创建菜单基础设施

这意味着本次不是“补几行事件”，而是要真正新建一层创建系统。

### 2. 自动补 state 可能影响现有连线心智

因此需要把“仅在必要时自动创建 state”控制好，避免用户感觉编辑器在偷偷改图。

### 3. 不恢复 seed template 起步

这意味着“进入编辑器后的第一感觉”仍会与旧版不同。  
但这是有意取舍，因为当前用户已经接受 Vue 工作区的欢迎页与模板入口。

## 成功标准

满足下面这些条件，就算本次回迁达标：

1. 用户可以在当前 Vue 画布中双击空白处直接创建节点。
2. 用户可以从输出口拖到空白处打开类型感知的创建菜单。
3. 创建 agent / condition / output 后，控制流会自动接上。
4. 在必要场景下，state 会被自动创建并绑定。
5. 文件拖入画布仍能直接生成输入节点。
6. 整个实现不重新引入“预设拖到画布上”的路径。
