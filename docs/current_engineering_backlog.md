# Current Engineering Backlog

这份文件只保留当前 `vue-frontend-rebuild` 这条迁移线里仍然有效的信息。

使用原则：

- 已完成的阶段计划、已放弃的 React 前端方向、以及已经偏离当前路线的视觉实验文档都不再保留
- 旧 React 前端在 `87d3d6e` 提交上的行为逻辑，仍然是当前 Vue 迁移的产品参考
- 当前后端不改；所有剩余工作都围绕 Vue 前端恢复旧逻辑并继续迭代

## 当前总体状态

### 已完成

- Vue 3 + Vite + Pinia + Vue Router 前端骨架已建立
- `/editor` 欢迎页、`/editor/new` 新图、`/editor/:graphId` 已有图 这三类路由语义已经恢复
- 工作区 tabs、关闭脏 tab 确认框、关闭最后一个 tab 回欢迎页，这条主链已经接通
- 基础画布可打开，节点拖拽、基础锚点与控制流边投影已接上
- `structuredClone` 对 Vue 响应式 graph 的 `DataCloneError` 已根因修复
- 编辑态已经回到“左侧独立侧栏 + 右侧全高工作区”的旧前端大框架
- 顶部工作区 chrome 已恢复到旧前端主逻辑：
  - 图标签切换
  - 图名编辑
  - 新建图 / 从模板创建 / 打开已有图
  - Save / Validate / Run 主入口
- 右侧 `State` 面板主链已恢复：
  - 顶部 `State` 按钮可开关
  - 面板按 tab 记住开合状态
  - 面板可浏览 graph state 对象、类型与当前值摘要
  - 每个 state 已能看到 reader / writer 数量与节点明细
  - reader / writer 可增删，支持节点聚焦与当前聚焦态
  - state key / name / description / type / color / default value 已可编辑
- `NodeCard` 与画布主链已继续向旧前端收口：
  - `Reads / Writes` 摘要已可见
  - 端口 type / required 元信息已可见
  - condition branch match values 摘要已可见
  - 第一版节点内联编辑已接通：
    - input 文本值
    - agent `taskInstruction`
    - agent `thinking / temperature`
    - condition `loopLimit`
    - condition `Source / Operator / Value`
    - condition branch key / mapping keys
    - output 节点 `Advanced`
  - output 节点 `Advanced` 当前已接通：
    - persist toggle
    - display mode
    - persist format
    - file name
  - condition branch 改名会同步到 `conditional_edges`
- Vue 前端外围 UI 的实现方向已经明确：
  - 画布 / 节点 / 连线继续自定义
  - 工作区 chrome、面板、下拉、弹层改走 `Reka UI` / `shadcn-vue` 思路

### 当前主要问题

- Vue 版图编辑器本体仍然只恢复到基础版，距离旧前端完整体验还有明显差距
- 顶部工作区 chrome 主链已恢复，但细节质感与组件化程度还不够
- 节点卡片细节、状态面板深层交互、画布交互、运行反馈等还没有完全迁回旧逻辑
- 旧前端 `State` 面板真正有用的 reader / writer 绑定交互和字段编辑主链已经明显恢复，但与其余节点内联编辑和画布交互的联动还不完整
- condition 节点的 branch key / mapping keys 编辑、`Add branch` 和删除语义已经接回；route chrome 也开始从“显示 target”推进到“路径几何对齐旧 React”，但更完整的 route 呈现仍待继续收口
- 基于最新文档复盘，当前最建议优先推进的实现切片已经从“先补删除语义”推进到“继续收口 condition route chrome”；这比先切 input 上传流或 agent 深层配置更连续，也更容易保持与旧 React 的行为对齐
- 文档需要围绕当前 Vue 路线持续收口，避免混入旧 React 方案和已废弃设计

## 当前优先级

1. 恢复旧前端图编辑器本体
2. 用现代 Vue UI 基元提升工作区 chrome 和外围面板
3. 恢复编辑器内部交互与面板逻辑
4. 恢复辅助页面到可用水平
5. 收口并清理 Vue 迁移文档

## 1. 恢复旧前端图编辑器本体

当前现状：

- `AppShell`、`EditorWorkspaceShell`、`EditorTabBar` 已回到旧前端的大框架方向
- `EditorCanvas` 不再是一个大卡片，但节点/边/控件仍是 Vue 基础实现
- `NodeCard` 已有 richer view model，input 文本值、agent `taskInstruction` 与 `thinking / temperature`、condition `loopLimit` / 规则编辑 / branch key / mapping keys、output 节点第一版 `Advanced` 都已接通，但 input 的类型切换 / 上传流，以及其余 agent / condition 深层内部编辑还没有迁回

后续要做：

- 继续按旧前端 `node-system-editor.tsx` 的逻辑迁移：
  - 节点卡片结构
  - 端口排布
  - 条件节点 `BranchRow` 的更完整呈现
  - 节点内部编辑
  - 画布中的节点/边层级
- condition branch 当前已经按“单条语义链”接通了：
  - branch key 改名
  - mapping keys 编辑
  - `conditional_edges` 中对应 route 分支同步
- condition branch 当前已经补到：
  - `Add branch` 入口
  - 新分支写入 `branches` 后的编辑行 / 画布锚点呈现
- branch 删除当前已经按保守规则接通：
  - 同步清理 `branches`
  - 同步清理 `branchMapping`
  - 同步清理对应 `conditional_edges`
  - 不允许删到最后一个 branch
- condition branch 当前也已有 route chrome 第一版：
  - branch 行显示 route target
  - 未连 route 时显示 `Unrouted`
- route edge 几何当前也已开始对齐旧 React：
  - branch offset 规则已对齐
  - route edge path 改为 rounded orthogonal
- 后续仍要继续收口：
  - 更完整的 route 呈现
  - 更接近旧前端的 branch 级交互手感
- 把“能看到一个 Vue 图”推进到“旧前端那套图编辑器在 Vue 里重新活起来”

## 2. 用现代 Vue UI 基元提升工作区 chrome 和外围面板

当前现状：

- `State` 面板已经回到工作区主链
- 顶部工具栏里的模板 / 已有图选择器已经不再使用原生 `select`
- 当前已经开始接入 `Reka UI`
- 顶部 tab 的脏状态 / 关闭动作和欢迎页搜索控件已经开始沿着 `Reka UI` / `shadcn-vue` 风格收口

后续要做：

- 继续把欢迎页、顶部 tab bar、面板和弹层统一到现代 Vue 交互基元上
- 默认采用：
  - `Reka UI` 作为可访问性交互底座
  - `shadcn-vue` 风格的 open-code 组件方法作为外围 UI 方向
- 保持边界：
  - 图编辑器画布和节点系统继续自定义
  - 不把图编辑器本体交给通用 flow / UI 库

## 3. 恢复编辑器内部交互与面板逻辑

当前现状：

- 基础拖拽、保存、校验、运行入口已经在 workspace shell 上接通
- `State` 面板已接通，reader / writer 节点明细、节点聚焦、增删绑定与字段编辑主链都已迁回第一版
- input / output / agent / condition 已经开始从“展示”变成“可编辑”
- 编辑器内部仍缺少旧前端的完整交互节奏

后续要做：

- 恢复图名编辑、状态面板、编辑器 chrome 的完整行为
- 继续恢复 condition 剩余 route chrome 细节；之后再推进 input 节点剩余的类型切换 / 上传流，以及 agent 剩余 model / systemInstruction 交互、运行反馈、错误提示的旧逻辑节奏
- 继续修正“看起来能用，但手感不像旧前端”的部分

## 4. 恢复辅助页面到可用水平

当前现状：

- `/runs`、`/settings` 已经有基础接线
- 首页和工作区入口已经开始恢复旧逻辑

后续要做：

- 把首页、运行记录、设置页继续收回到旧前端的完整产品逻辑
- 保持这些页面和新的 Vue 工作区模型一致

## 5. 收口并清理 Vue 迁移文档

当前现状：

- Vue 前端重建设计仍然有效
- 编辑器逻辑恢复计划仍然有效
- `Reka UI` / `shadcn-vue` 方向已经成为当前外围 UI 的明确路线
- 一些旧 React 时代的视觉实验文档已经不再适用

后续要做：

- 继续删除已经失效或已完成的过时文档
- 在阶段完成后，把 backlog 和 docs 索引更新到当前真实状态
- 保证 `docs/` 始终只保留当前还在指导实现的文档
