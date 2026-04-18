# Vue Frontend Migration Task Plan

## Goal

在 `vue-frontend-rebuild` 分支中，基于旧 React 前端 `87d3d6e` 的产品逻辑，完整恢复 GraphiteUI 前端到 Vue 版本。后端契约保持不变，优先迁回编辑器本体、工作区逻辑、状态面板、欢迎页、运行记录和设置页。

## Current Phase

- Phase 1: Vue 基础骨架与工作区逻辑恢复 — `completed`
- Phase 2: 工作区 chrome 现代化与欢迎页恢复 — `in_progress`
- Phase 3: 编辑器本体与状态语义恢复 — `in_progress`
- Phase 4: 辅助页面恢复与文档收口 — `pending`

## Phase Breakdown

### Phase 1: Vue 基础骨架与工作区逻辑恢复
- [x] 建立 Vue 3 + Vite + Pinia + Vue Router 骨架
- [x] 恢复 `/editor`、`/editor/new`、`/editor/:graphId` 路由语义
- [x] 恢复欢迎页 / 工作区 / 标签页主链
- [x] 修复 `structuredClone` 与响应式 graph 的入口错误

### Phase 2: 工作区 chrome 现代化与欢迎页恢复
- [x] 恢复顶部工作区工具栏与 tab 主链
- [x] 用 `Reka UI` 重做工作区选择器
- [x] 恢复欢迎页搜索与模板/图卡片动作
- [x] 把关闭脏 tab 对话框切到现代化交互基元
- [ ] 继续把顶部 chrome 和欢迎页细节对齐旧前端节奏

### Phase 3: 编辑器本体与状态语义恢复
- [x] 基础画布、拖拽、锚点与控制流投影已接通
- [x] `NodeCard` 已有第一版 richer view model
- [x] `State` 面板已恢复开关与每 tab 开合状态
- [~] 恢复 `State` 面板更深的图内语义：reader / writer 节点明细、节点聚焦、读写绑定增删、state 字段编辑、按类型默认值编辑，以及 `State` 面板与画布选中态的双向联动都已接通，后续仍缺更完整的节点内联编辑联动
- [~] 继续对齐旧前端 `node-system-editor.tsx` 中的节点卡片结构：`Reads / Writes` 摘要、端口 type / required 元信息、condition branch mapping 摘要，以及 output 节点 `Advanced` 第一版内联编辑（persist toggle / display mode / persist format / file name）、agent `taskInstruction` 与 `Advanced` 第一版（thinking / temperature）、condition `loopLimit` 与 `Source / Operator / Value` 规则编辑、condition `BranchRow` 第一版（branch key / mapping keys）、input 文本值第一版内联编辑都已接入；其余 input / agent / condition 深层内部编辑与端口细节仍待迁回
- [~] 恢复更完整的端口、分支、边和节点内部 chrome：控制流边已接通，数据流投影边已恢复第一版，condition branch 改名 / mapping 编辑 / `Add branch` / 删除语义都已接通，branch 行也已显示 route target 第一版 chrome，route edge path 也开始对齐旧 React 的 rounded orthogonal 几何；后续继续补更完整的 route 呈现与细节打磨

### Phase 4: 辅助页面恢复与文档收口
- [ ] 继续恢复 `/runs`、`/runs/:runId`、`/settings`、首页
- [ ] 更新 `docs/current_engineering_backlog.md`
- [ ] 删除过时文档，只保留当前有效设计与计划

## Key Decisions

- 旧 React 前端 `87d3d6e` 是产品逻辑真相来源
- Vue 迁移只替换实现，不擅自改变用户流程
- 画布 / 节点 / 连线继续自定义
- 工作区 chrome、选择器、弹窗、表单优先走 `Reka UI` / `shadcn-vue` 风格
- 当前最高优先级是编辑器本体和状态语义，不再优先打磨外围页面
- condition branch 编辑不能只 patch `node.config`；`branches`、`branchMapping` 与 `conditional_edges` 要视作同一条语义链一起更新
- condition 分支后续实现按“先补旧前端已证实存在的交互，再补推断项”的顺序推进；当前 `Add branch` 已恢复，删除交互要等语义核对完成后再接
- 当前推荐的下一实现切片仍是“condition route chrome 继续收满，或切向 input 上传流 / agent 深层高级配置”；其中 route chrome 仍是当前最连续的剩余链路，但已经从文案层推进到路径几何层

## Risks / Open Questions

- 旧前端很多状态语义和编辑交互深埋在 `node-system-editor.tsx`，迁移时要防止只恢复外观不恢复行为
- 当前 Vue 画布还是基础版，可能继续出现“看起来像但交互不够”的落差
- 需要持续对照旧前端截图和代码，而不是凭新实现自行推断
- condition 分支的第一版编辑、`Add branch` 与删除语义都已接通，但更丰富的 route chrome 和 branch 级交互细节仍可能继续暴露“能用但还不像旧前端”的差距
