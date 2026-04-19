# 节点创建方式对齐报告

日期：2026-04-19  
对比基线：`87d3d6ecaf4b25efdc35f9b0bccd9f4667109fb2`  
当前实现：Vue 前端重构分支当前工作区

## 结论摘要

如果要让“节点创建方式”回到 `87d3d6e` 那版的体验，不能只补一个“新增节点按钮”，而是要一起恢复下面这整条链路：

1. 画布空白处双击打开创建菜单。
2. 从输出口拖到空白处时，弹出带类型感知的创建菜单。
3. 通过菜单创建节点后，自动补默认配置、自动接入状态、自动补流程线。
4. 允许把预设拖到画布上，或把文件拖到画布上直接生成输入节点。
5. 新建图时的初始落点，要重新决定是否继续沿用旧版“优先从默认模板/`hello_world` 起步”。

当前 Vue 版并不是“做得不一样”，而是“这一整套画布内创建链路还没有回迁”。现在保留下来的主要是工作区级别的新建图/开模板/开已有图，以及节点编辑、连线、状态绑定。

## 1. `87d3d6e` 里的节点创建入口

旧版不是单入口，而是四条创建路径并存。

### 1.1 双击画布空白处

旧版在 `frontend/components/editor/node-system-editor.tsx` 的画布容器上监听 `onDoubleClickCapture`：

- 如果双击目标落在节点卡片上，则忽略。
- 如果双击目标是画布空白处，则在鼠标位置打开创建菜单。

用户文案也明确围绕这个入口展开：

- 空画布提示：`Double click to create your first node`
- 底栏提示：`Double click canvas or drag from an output handle to open preset suggestions.`

### 1.2 从输出口拖到空白处

旧版在 React Flow 上通过 `onConnectStart` / `onConnectEnd` 实现：

- `onConnectStart` 记录来源节点、来源 handle、来源值类型。
- 如果 `onConnectEnd` 时没有真正连到目标节点，而是落在空白处，就在落点打开创建菜单。
- 菜单会带上 `sourceValueType`，变成“按类型推荐”的创建菜单。

这条链路是旧版最重要的差异点之一，因为它不是“先造节点、后想怎么接”，而是“从已有输出继续往下长”。

### 1.3 把预设拖到画布上

旧版 `onDrop` 支持读取 `application/graphiteui-node-preset`：

- 如果 drop 的是节点预设，就直接在落点创建对应节点。
- 这一条和双击菜单配合，说明旧版既支持“搜索式创建”，也支持“拖拽式创建”。

### 1.4 把文件拖到画布上

旧版 `onDrop` 还支持直接把文件拖到画布：

- 自动检测文件类型。
- 自动生成对应的输入边界节点。
- 输入节点的名称、描述、输出类型、默认值都会跟着文件元数据一起组装。

## 2. 旧版创建菜单长什么样

旧版创建菜单本质上是“边界节点 + 预设节点”的混合面板。

### 2.1 菜单来源

菜单项由 `nodePalette` 计算得到，来源分两类：

- 边界节点：
  - 无来源类型时：`Input`、`Output`
  - 有来源类型时：只保留类型感知后的 `Output`
- 预设节点：
  - `EMPTY_AGENT_PRESET`
  - `EMPTY_CONDITION_PRESET`
  - 用户保存的持久化 presets

### 2.2 排序和搜索

旧版有明确的 family 优先级：

1. `input`
2. `output`
3. `agent`
4. `condition`

排序规则是：

- 先按 family 优先级。
- 同 family 下，原生 `node` 在 `preset` 前面。
- 最后按 label 字母序。

搜索是对 `label / description / family / presetId / nodeKind / id` 的联合模糊匹配。

### 2.3 类型感知推荐

当创建菜单由“拖输出口到空白处”触发时：

- 菜单会拿到 `sourceValueType`。
- 只推荐和该类型兼容的 agent / condition presets。
- 边界节点只保留“适合作为当前结果落点”的 `Output`。

这让旧版的创建动作天然带有“下一步推荐”。

## 3. 旧版创建后的默认行为

旧版不是只“插一个节点对象”，而是创建完成后顺手把一系列连接语义补齐。

### 3.1 通用默认值

旧版通过两类 helper 生成节点：

- `createNodeFromConfig(...)`
- `createNodeFromCanonicalPreset(...)`

共同点：

- 节点 id 是 `{family}_{8位uuid}` 或 `{kind}_{8位uuid}`。
- 节点初始为展开态。
- 会补默认宽度。
- 会同时生成 Flow 节点和 canonical node。

### 3.2 Generic Input / Output 的默认值

旧版还有两套非 preset 的边界默认值：

- `createGenericInputNodeConfig()`
  - 默认是文本输入
  - 输出 key 是 `value`
- `createGenericOutputNodeConfig(sourceType?)`
  - 默认读取 `value`
  - `persistEnabled = false`
  - `persistFormat = auto`
  - 如果来源类型已知，会把输入 value type 改成来源类型

### 3.3 从输出口创建新节点时的自动接线

这是旧版最关键的“省操作”部分。

创建菜单如果是从某个输出口拖出来的，创建完成后会自动做这些事：

1. 补新节点。
2. 必要时补 state。
3. 必要时把 state 自动绑定到目标节点输入。
4. 调 `buildCreationControlEdge(...)` 自动补流程线或条件分支线。

也就是说，旧版的节点创建不是孤立动作，而是“创建 + 接上”。

### 3.4 自动创建输入 state 的规则

旧版对 agent / condition 这类节点有特殊兜底：

- 如果来源值类型能匹配，但目标 preset 没有现成输入槽，
- 会根据来源 port key 自动生成一个 state 字段，
- 然后把它绑定到新节点的输入侧。

这样从上游拖一个输出到空白处，再选 agent preset，节点基本能“马上接上就用”。

## 4. 旧版“新建图”的起点

这里有一个很容易被忽略，但体感影响很大的点：

旧版 `NodeSystemEditor` 在没有 `initialGraph` 时，不是无脑空白图，而是走 `createEditorSeedGraph(...)`：

- 优先用 `defaultTemplateId`
- 否则回退到 `hello_world`
- 再否则用第一个可用模板
- 只有完全没有模板时才是空图

所以旧版很多时候并不是“我先面对一张空画布，再开始加节点”，而是“我先落在一个种子图上，再继续改”。

## 5. 当前 Vue 版的现状

当前 Vue 版已经有工作区壳、节点编辑、状态面板、流程/数据连线，但画布内创建链路和旧版差距很大。

### 5.1 现有入口只剩工作区级别

当前入口主要在：

- `frontend/src/editor/workspace/EditorWelcomeState.vue`
- `frontend/src/editor/workspace/EditorWorkspaceShell.vue`

保留的是：

- 新建空白图
- 从模板创建
- 打开已有图

### 5.2 当前没有画布内创建菜单

当前 `EditorCanvas.vue` 只暴露这些类事件：

- 选中节点
- 更新节点配置
- 创建/绑定 state
- 连接 flow / state / route
- 重连或删除边
- 更新节点位置

但没有：

- `create-node`
- `open-creation-menu`
- `drop-preset-to-create`
- `double-click-canvas-to-create`

### 5.3 当前文档层也没有“新增节点”帮助函数

当前 `frontend/src/lib/graph-document.ts` 主要是：

- 创建空图 / 从模板创建 draft
- clone
- 更新 config
- 加删改 state
- 连接 / 重连 / 删除边

但没有旧版那一整组：

- 从 preset 生成节点
- 从 generic input/output 生成节点
- 按来源类型自动补 state
- 创建后自动补 control edge

### 5.4 当前新建空白图逻辑也和旧版不同

当前 Vue 版：

- `openNewTab(null)` 直接 `createEmptyDraftGraph(...)`
- 只有显式选模板时才 `createDraftFromTemplate(...)`

这和旧版默认从 seed template 起步的感觉不一致。

## 6. 如果要“和 87d3d6e 一致”，需要恢复哪些东西

我建议把“对齐目标”拆成三层，不要只补 UI。

### 6.1 必须恢复

这些是旧版创建体验的骨架：

1. 画布空白处双击 -> 打开创建菜单
2. 从输出口拖到空白处 -> 打开带类型感知的创建菜单
3. 创建节点后自动补流程线
4. 对 agent / condition 在必要时自动创建并绑定输入 state
5. 创建菜单支持搜索、排序和 preset 推荐

### 6.2 建议恢复

这些会让整体更像旧版而不是“只像一半”：

1. 空画布 onboarding 文案
2. 预设拖到画布直接创建
3. 文件拖到画布自动生成输入节点
4. 新建图时的 seed-template 策略

### 6.3 可以后置

这些不是第一批必须项：

1. preset 持久化保存与拖拽协同
2. 更复杂的 preset 分类视觉
3. 旧版状态消息文案的 1:1 复刻

## 7. 对 Vue 版的具体迁移建议

考虑到当前仓库已经统一倾向 `Element Plus`，而且 `AGENTS.md` 明确要求 UI 优先复用现有库，我建议迁移时按下面的结构做。

### 7.1 画布层

在 `EditorCanvas.vue` 增加：

- 画布双击打开创建菜单
- 从流程/数据出口拖到空白时打开创建菜单
- `create-node-at` / `open-node-creation-menu` 这类事件

### 7.2 文档层

在 `graph-document.ts` 或拆分的新模块里补：

- `createNodeFromPresetInDocument(...)`
- `createGenericInputNodeInDocument(...)`
- `createGenericOutputNodeInDocument(...)`
- `createNodeFromDroppedFileInDocument(...)`
- `connectCreationResultInDocument(...)`

重点不是函数名，而是把“新增节点 + 补 state + 补 control edge”这套事务性操作封在一起。

### 7.3 菜单层

建议新增一个独立的创建菜单 model，而不是把逻辑全塞回 `EditorCanvas.vue`：

- 菜单项生成
- family 排序
- query 搜索
- 来源类型过滤
- 兼容性判断

这样更容易把 `87d3d6e` 的推荐逻辑完整搬回来。

### 7.4 UI 组件建议

尽量用现有 `Element Plus` 组合：

- `ElPopover` / `ElDialog` / `ElDropdown` 之一承接创建浮层
- `ElInput` 做搜索
- `ElScrollbar` 做长列表
- `ElEmpty` 做空结果

不建议为了这个菜单再手搓一套新的交互原语。

## 8. 我对“还原范围”的判断

如果目标是“节点创建方式和 `87d3d6e` 一致”，我建议按下面这个顺序做：

1. 先恢复画布内创建入口
2. 再恢复类型感知推荐
3. 再恢复创建后的自动接线和自动 state 绑定
4. 最后决定是否把“新建图默认从 seed template 起步”也拉回来

原因是：

- 第 1、2、3 步决定的是“创建方式”
- 第 4 步决定的是“进入编辑器后的起手体验”

两者相关，但不完全是一回事。

## 9. 一句话总结

`87d3d6e` 的节点创建体验，本质上是“从当前流程自然长出下一个节点”，而不是“先有一个孤立的新增节点入口”。  
当前 Vue 版缺的不是一个按钮，而是整条“创建菜单 + 类型推荐 + 自动接线 + 自动补 state”的闭环。
