# Vue Frontend Migration Task Plan

## Goal

在 `vue-frontend-rebuild` 分支中，基于旧 React 前端 `87d3d6e` 的产品逻辑，完整恢复 GraphiteUI 前端到 Vue 版本。该迁移现已完成；本文件保留为最终闭环与审计记录。

## Current Phase

- Phase 1: Vue 基础骨架与工作区逻辑恢复 — `completed`
- Phase 2: 工作区 chrome 现代化与欢迎页恢复 — `completed`
- Phase 3: 编辑器本体与状态语义恢复 — `completed`
- Phase 4: 辅助页面恢复与文档收口 — `completed`

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
- [x] 继续把顶部 chrome 和欢迎页细节对齐旧前端节奏

### Phase 3: 编辑器本体与状态语义恢复
- [x] 基础画布、拖拽、锚点与控制流投影已接通
- [x] `NodeCard` 已有第一版 richer view model
- [x] `State` 面板已恢复开关与每 tab 开合状态
- [x] 恢复 `State` 面板更深的图内语义：reader / writer 节点明细、节点聚焦、读写绑定增删、state 字段编辑、按类型默认值编辑，以及 `State` 面板与画布选中态的双向联动都已接通
- [x] 继续对齐旧前端 `node-system-editor.tsx` 中的节点卡片结构：`Reads / Writes` 摘要、端口 type / required 元信息、condition branch mapping 摘要，以及 output 节点 `Advanced` 第一版内联编辑（persist toggle / display mode / persist format / file name）、agent `taskInstruction` / `systemInstruction` / global-override model / skill attach-remove / `+input / +output` state bind-create / knowledge-base skill auto-sync 第一版与 `Advanced` 第一版（thinking / temperature）、condition `loopLimit` 与 `Source / Operator / Value` 规则编辑、condition `BranchRow` 第一版（branch key / mapping keys）、input 文本值 / `knowledge_base` / file-image-audio-video 上传流与类型切换第一版都已接入；剩余差异只再归类为可选 polish
- [x] 恢复更完整的端口、分支、边和节点内部 chrome：控制流边、数据流投影、condition branch 改名 / mapping 编辑 / `Add branch` / 删除语义、route chrome、建链 / 删链 / 重连 / preview、工作区运行反馈条、节点运行态壳层、output latest run preview、失败节点提示和 active path 高亮都已接通

### Phase 4: 辅助页面恢复与文档收口
- [x] 继续恢复 `/runs`、`/runs/:runId`、`/settings`、首页：`/runs` 列表已补齐空态 CTA 与详情提示，`/runs/:runId` 已补回 live polling、cycle iteration 明细和 output artifacts，`/settings` 已补到 provider fallback / 温度收口，首页也已完成空态 CTA 与卡片细节收口
- [x] 更新当前状态文档与项目索引
- [x] 删除过时迁移文档，只保留当前有效状态文档

## Key Decisions

- 旧 React 前端 `87d3d6e` 是产品逻辑真相来源
- Vue 迁移只替换实现，不擅自改变用户流程
- 画布 / 节点 / 连线继续自定义
- 工作区 chrome、选择器、弹窗、表单优先走 `Reka UI` / `shadcn-vue` 风格
- 当前最高优先级是编辑器本体和状态语义，不再优先打磨外围页面
- condition branch 编辑不能只 patch `node.config`；`branches`、`branchMapping` 与 `conditional_edges` 要视作同一条语义链一起更新
- condition 分支后续实现按“先补旧前端已证实存在的交互，再补推断项”的顺序推进；当前 `Add branch` 与删除交互都已按保守语义接回，后续重点转到 route chrome 视觉收口
- 当前主迁移目标已经达成：input 线已经覆盖文本值、`knowledge_base`、上传流与类型切换，agent 已补到 `systemInstruction`、global-override model、skill attach-remove、`+input / +output` state bind-create 与 knowledge-base skill auto-sync，画布连线已补到建链 / 删链 / 重连 / preview 与 route chrome，运行反馈已补到工作区反馈条、节点壳层、output 最新运行预览、失败节点提示和 active path 高亮，`/runs`、`/runs/:runId`、`/settings` 与首页也已经回到可替换旧前端主逻辑的状态；后续工作不再计入“迁移未完成”
- 审计还确认：README、knowledge 文档中残留的 React/Next.js 叙述和“前端待补”表述，属于文档滞后，不属于迁移未完成；真正仍未完成的是 WebSocket、人类在环前端、导出 UI、memory 等产品路线图能力
- 迁移专用 backlog 已经由 `docs/current_project_status.md` 取代；知识库导入链路也已经改为读取这份当前状态文档，而不是旧的阶段 backlog

## Risks / Open Questions

- 旧前端很多状态语义和编辑交互深埋在 `node-system-editor.tsx`，因此这次迁移始终以行为 parity 为准，而不是只恢复外观
- 当前 Vue 画布和外围页主链已经接近旧前端完成态；已知剩余项只属于非阻断性的体验 polish，不再构成迁移风险
- 后续如果继续迭代，应继续对照旧前端截图和代码，而不是凭当前实现自行发散
