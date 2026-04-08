# GraphiteUI Framework Rebuild Execution Backlog

## 1. 文档目的

这份文档记录 **基于当前代码状态** 的可执行 backlog。

它不再展开历史规划，而是回答两个问题：

1. 现在代码已经改到哪一步了
2. 下一步具体应该继续做什么

---

## 2. 当前代码状态快照

以下事项已完成：

- 后端 `core/` 分层已存在
- `creative_factory` 模板已拆为：
  - `template.py`
  - `state.py`
  - `themes.py`
  - `handlers.py`
- 模板注册 API 已存在
- editor 模板页已优先从后端模板 `default_graph` 初始化
- SQLite 持久化已落地
- Tailwind 与前端组件层已建立
- editor 第一阶段 `canvas-first` 布局已落地
  - `State Panel` 折叠
  - 浮动面板
  - 节点库搜索

以下事项仍然是现实问题：

1. 模板注册表目前只有 `creative_factory`
2. 前端仍保留 fallback 模板逻辑
3. `/api/settings` 仍暴露 `skills`
4. `Node Picker` 与拖线建点还未实现
5. UI 层虽然已有 primitives 和语义组件，但还没有完整设计系统

---

## 3. 当前优先任务

## Task T1 Editor 运行轮询

优先级：`P0`

状态：`已完成`

目标：

让 editor 在点击 `Run` 后持续刷新 run 状态，而不是只拉一次。

需要修改：

- `frontend/components/editor/editor-workbench.tsx`
- `frontend/stores/editor-store.ts`

已完成结果：

- 点击 `Run` 后保存 `run_id`
- 周期性请求 `/api/runs/{run_id}`
- 状态进入 `completed / failed` 后停止轮询
- 节点状态会随 run detail 更新

## Task T2 模板单一来源继续收口

优先级：`P0`

目标：

进一步减少前端 fallback 模板维护量。

需要关注：

- `frontend/lib/templates/creative-factory.ts`
- `frontend/lib/templates/index.ts`
- `frontend/components/editor/editor-workbench.tsx`
- `backend/app/templates/creative_factory/template.py`

完成标准：

- 前端不再维护完整独立默认图副本
- fallback 只保留最小安全兜底能力

当前进度：

- editor 模板主路径已优先依赖后端 `default_graph`
- store 初始化已改为轻量 shell，而非完整本地模板图
- 前端本地完整模板图已删除
- 模板接口失败时只回退到最小 shell graph + 本地 theme presets

## Task T2A Editor 运行观测增强

优先级：`P0`

状态：`已完成`

目标：

让 editor 内的运行反馈不只停留在节点颜色变化，而是能直接看到当前 run 的警告、错误和节点级执行明细。

已完成结果：

- 运行中会显示 `Polling run` 状态标签
- run 级 `warnings / errors` 会显示在编辑器右侧摘要区
- 选中节点时会请求 `/api/runs/{run_id}/nodes/{node_id}`
- 节点执行明细已包含：
  - `warnings`
  - `errors`
  - `artifacts`
  - 更完整的执行时间信息

## Task T3 第二个模板

优先级：`P1`

目标：

验证当前架构不是只服务 `creative_factory`。

建议新增：

- 第二个模板目录：
  - `backend/app/templates/<new_template>/`
- 对应前端模板源最小支持

完成标准：

- `/api/templates` 返回两个模板
- editor 能通过模板路由打开第二个模板

## Task T4 弱化 settings 中的 skills 概念

优先级：`P1`

目标：

让 `Core / Template / Theme / Tool` 成为更清晰的主概念。

需要修改：

- `backend/app/api/routes_settings.py`
- `frontend/components/settings/settings-panel-client.tsx`

完成标准：

- UI 不再强调 `skills`
- 必要时保留内部兼容，但不继续强化这个概念

## Task T5 UI 组件层继续收口

优先级：`P2`

目标：

继续从“基础组件 + 少量语义组件”推进到更稳定的设计系统。

建议新增：

- `FormField`
- `DataList`
- `ToolbarGroup`

## Task T6 Node Picker 与拖线建点

优先级：`P0`

目标：

让用户从节点拖线到空白处时，直接在落点创建新节点，而不是先回到节点库。

需要修改：

- `frontend/components/editor/editor-workbench.tsx`
- 新增 `Node Picker` 组件
- React Flow 空白落点处理逻辑

完成标准：

- 拖线到空白处会弹出节点选择器
- 选择节点类型后自动创建并连线
- 支持搜索
- 节点分组与当前 palette 保持一致

---

## 4. 当前不建议优先做的事

这些事项目前不应抢占前面几项优先级：

- 再做一轮纯样式微调
- 增加大量新的 theme preset
- 增加更多 creative factory 专用节点
- 重新引入旧图兼容层

---

## 5. 当前执行顺序建议

建议按这个顺序推进：

1. `T2 模板单一来源继续收口`
2. `T6 Node Picker 与拖线建点`
3. `T3 第二个模板`
4. `T4 弱化 settings 中的 skills 概念`
5. `T5 UI 组件层继续收口`
