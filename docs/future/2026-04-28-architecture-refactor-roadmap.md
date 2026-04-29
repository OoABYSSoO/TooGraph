# GraphiteUI Architecture Refactor Roadmap

本文档记录 2026-04-28 对 GraphiteUI 仓库的架构审计结论。目标不是一次性重写，而是用可验证、低回归风险的方式减少冗余代码、拆开过宽模块，并保持当前编辑器和运行态行为稳定。

## 总体判断

GraphiteUI 当前最大的问题不是依赖膨胀，也不是目录混乱，而是核心产品能力集中在少数超大文件中。前端图编辑器和后端运行时都已经形成了清晰的产品方向，但实现层仍有多个“上帝文件”：一个文件同时承担视图、状态、交互、协议转换、运行编排和错误反馈。

这类复杂度应通过阶段性抽取治理，不能通过一次性大重构解决。优先级应该按“用户改动频率、出错概率、测试保护程度、可拆边界清晰度”排序。

## 本轮已处理

- 删除未引用的旧本地运行时脚本 `scripts/lm_core1.py`。
  - 该文件 1989 行，未被 tracked scripts、frontend、backend、docs 或 README 引用。
  - 它还包含机器相关路径，并与当前 OpenAI-compatible provider 的本地运行时策略冲突。
  - 保留了已测试的迁移提示脚本：`lm_core0.py`、`download_Gemma_gguf.py`、`lm-server`。
- 清理前端静态检查发现的未使用符号。
  - `NodeCard.vue` 中旧事件处理函数。
  - `WorkspaceSearchField.vue` 中未使用的 `props` 绑定。
  - `graph-node-creation.ts` 中未使用的类型导入和参数。
- 确认仓库没有 tracked `__pycache__`、`.pyc`、`dist` 或 `.dev_*` 运行产物。

## 前端重点

### 1. `NodeCard.vue`

现状：`NodeCard.vue` 超过 5k 行，当前同时负责节点外观、标题/描述编辑、state 胶囊、虚拟胶囊、state 创建/编辑弹层、端口排序、agent runtime 控件、skill picker、input 内容、output preview、condition 配置和大量样式。

建议第一优先级拆分，因为它是用户交互最密集、近期需求最频繁的文件。

推荐拆分顺序：

1. 抽出 `useNodeFloatingPanels`：统一 top action、文本编辑确认、state 编辑确认、删除确认、全局 pointer/focus/keydown 关闭逻辑。
2. 抽出 `usePortReorder`：端口拖拽排序的 pointer 状态、目标 index 计算、浮动样式和提交逻辑。
3. 抽出 `StatePortList.vue`：真实/虚拟 input/output 胶囊列表、胶囊点击、创建入口和删除绑定入口。
4. 抽出节点主体组件：`AgentNodeBody.vue`、`InputNodeBody.vue`、`OutputNodeBody.vue`、`ConditionNodeBody.vue`。先拆 template 和 props/emit，不急着拆模型。
5. 把 CSS 按组件自然迁移，避免继续让一个 scoped style 承担所有节点类型。

当前执行进展：

- `useNodeCardTextEditor.ts` 已先行承接标题/描述编辑确认、指针触发、焦点调度、草稿和 metadata patch 提交。
- `useNodeFloatingPanels.ts` 已承接 roadmap 第 1 项中的 top action 确认定时器、全局 pointer/focus/keydown 外部关闭逻辑、state 编辑确认和删除绑定确认 active anchor/timer 状态。
- `usePortReorder.ts` 已承接 roadmap 第 2 项中的端口排序 pointer 状态、window listener 生命周期、拖拽激活、目标 index 解析、浮动胶囊投影、释放提交和拖拽后点击抑制。
- `StatePortList.vue` 已继续承接 roadmap 第 3 项中的 agent 真实 input/output state 胶囊列表、`+ input`/`+ output` 创建入口、状态创建/编辑弹层 wiring、删除绑定按钮、hover/click/reorder 事件转发和局部列表样式；`NodeCard.vue` 仍保留 state 草稿、校验、锁定态 guard 和 graph mutation emit。
- `AgentSkillPicker.vue` 已作为 roadmap 第 4 项的低风险前置切片，承接 agent skill picker 触发器、弹层内容、可挂载 skill 列表、已挂载 badge 和局部样式；`NodeCard.vue` 仍保留 skill 派生数据、锁定态 guard、attach/remove patch 和 agent config emit。
- `AgentRuntimeControls.vue` 已继续承接 roadmap 第 4 项中的 agent model select、thinking-mode select card、breakpoint switch card、model-select collapse ref 和局部 runtime-control 样式；`NodeCard.vue` 仍保留 model option 派生、refresh-model emit、thinking/breakpoint handlers、锁定态 guard 和 agent config emit。
- `AgentNodeBody.vue` 已承接 roadmap 第 4 项中的 agent body presentation wrapper：agent input/output state port columns、`AgentRuntimeControls`、`AgentSkillPicker` 和 prompt textarea wiring；`NodeCard.vue` 仍保留 state 派生、draft/validation、锁定态 guard、skill patch 创建和 graph mutation emit。拆分时已补充 scoped textarea surface 样式，避免父组件 scoped CSS 失效造成视觉回退。
- `InputNodeBody.vue` 已承接 roadmap 第 4 项中的 input body presentation wrapper：input boundary segmented control、knowledge-base selector、upload/dropzone/preview、editable textarea、read-only surface 和 input-specific scoped styles；`NodeCard.vue` 仍保留 input value 派生、uploaded asset 解析、knowledge-base option 派生、锁定态 guard、file/drop handlers 和 state/config mutation emit。primary output state pill 仍通过 parent-owned slot 保留在 `NodeCard.vue`，避免一次性迁移 state editor/create popover 行为。
- `OutputNodeBody.vue` 已承接 roadmap 第 4 项中的 output body presentation wrapper：output persistence switch card、preview metadata、plain/markdown/json preview surface 和 output-specific scoped styles；`NodeCard.vue` 仍保留 output preview content 派生、display/persist option 派生、锁定态 guard、output config handlers 和 graph mutation emit。primary input state pill 仍通过 parent-owned slot 保留在 `NodeCard.vue`，避免一次性迁移 state editor/create popover 行为。
- `ConditionNodeBody.vue` 已承接 condition source state 胶囊、state/create popover wiring、operator/value/loop 控件和局部 condition 样式；`NodeCardTopActions.vue` 已承接 top action dock、advanced agent/output popover 控件、confirm popover presentation 和 top-action 样式。`NodeCard.vue` 仍保留 condition draft 同步、loop-limit commit、config patch handlers、action confirmation、锁定态 guard 和 graph/state mutation emit。
- `PrimaryStatePort.vue` 已承接 input/output primary state 胶囊、anchor slot、state/create popover presentation 和局部主状态端口样式；`FloatingStatePortPill.vue` 已承接端口排序拖拽时的 floating preview Teleport 和样式。`NodeCard.vue` 仍保留 state draft 同步、port create validation、confirm timers、locked guards 和 graph/state mutation emit。
- roadmap 第 1 项剩余部分是进一步统一各类浮层的组件侧关闭编排；这部分跨 text editor、state editor、skill picker 和 port picker，后续应在更强 controller 覆盖下继续小步迁移，避免一次性改动 state 草稿和 graph mutation emit。至 Phase 29，`NodeCard.vue` 的低风险 P1 presentation 拆分基本完成；下一轮应先做 P1 completion gate，再决定是否转入 P2/P3。

不建议先做的事：

- 不要先把所有节点配置塞进一个抽象 schema renderer。当前每类节点的交互差异很大，过早抽象会增加调试成本。
- 不要先替换 UI 库或重做样式系统。现有 Element Plus + 自定义 warm theme 可继续承载。

### 2. `EditorCanvas.vue`

现状：`EditorCanvas.vue` 超过 4.6k 行，集中处理画布渲染、pan/zoom/pinch、minimap、节点拖拽、节点缩放、anchor 测量、连线预览、自动吸附、建链完成、edge 面板、hover 延迟、锁定态和运行态展示。

建议第二优先级拆分。它行为敏感，应按交互系统拆，而不是按视觉区域拆。

推荐拆分顺序：

1. `useCanvasMeasurement`：节点 DOM 注册、ResizeObserver、MutationObserver、anchor offset 测量、requestAnimationFrame 调度。
2. `useConnectionInteraction`：pending connection、hover target、auto snap、eligible anchor、complete connection。
3. `useNodeDragResize`：节点移动、缩放 hotzone、pointer 状态、viewport 坐标换算。
4. `useEdgeInteraction`：flow edge 删除确认、data edge state 编辑、edge selection。
5. 保留 `EditorCanvas.vue` 作为组合层：只负责 template 绑定和各 composable 的 wiring。

当前执行进展：

- `useCanvasNodeMeasurements.ts` 已承接节点 DOM 注册、ResizeObserver/MutationObserver、anchor slot 测量、flow anchor fallback 测量和 measured size 清理。
- `useCanvasEdgeInteractions.ts` 已承接 flow/route 删除确认、data edge state 编辑请求、disconnect/update emits 和缺失 edge 清理。
- `canvasConnectionInteractionModel.ts`、`canvasConnectionModel.ts`、`canvasPendingStatePortModel.ts` 等纯模型已承接连接预览、自动吸附候选、虚拟端口创建上下文和新节点创建 payload 的可测试决策。
- `canvasNodeDragResizeModel.ts` 已承接节点拖拽/缩放 move 阶段的阈值判断、viewport-scale 投影、rounding 和 resize result projection；`EditorCanvas.vue` 仍保留 pointer capture、animation-frame batching、connection completion 和 graph mutation emits。
- `useCanvasNodeDragResize.ts` 已承接节点拖拽/缩放 refs、pointer capture release、scheduled update dispatch、拖拽后残留 click 抑制和 teardown；`EditorCanvas.vue` 仍保留 selection、active connection cleanup、auto-snap、connection completion、panning、DOM measurement 和 graph mutation emits。
- `useCanvasConnectionInteraction.ts` 已承接 pending connection refs、preview point、auto-snapped target ref、active connection hover node ref、从 anchor 启停 pending connection、preview point 更新和 hover-change 通知；`EditorCanvas.vue` 仍保留 actual emits、panning、node drag/resize 和 DOM measurement。
- `canvasConnectionCompletionModel.ts` 已承接 connection completion action projection 和 completion request cleanup policy：从 active connection 和 target anchor 纯计算 `connect-flow`、`connect-route`、`connect-state`、`connect-state-input-source`、`reconnect-flow`、`reconnect-route` payload，并明确完成后清理连接交互状态/已选边；`EditorCanvas.vue` 仍保留实际 `emit` dispatch 和 imperative cleanup execution。
- `canvasConnectionInteractionModel.ts` 已进一步承接高层 auto-snap target resolution、pending connection creation-menu request、pointer-up route decision、active-connection node pointer-down route decision 与 pointer-move preview request：flow hotspot、node body fallback、reverse state input source、state output target、create-input fallback、node creation payload、打开菜单后的清理策略、locked cleanup / snapped completion / creation-menu 分支选择、node body snap completion / continue pointer-down 分支，以及 hover node / target anchor / fallback point 预览请求已可测试；`EditorCanvas.vue` 仍保留 DOM hit-test、pointer-to-canvas 坐标转换、RAF 调度、actual emits、panning、node drag/resize 和 DOM measurement。

### 3. `EditorWorkspaceShell.vue`

现状：`EditorWorkspaceShell.vue` 接近 2.9k 行，承担 workspace tab、草稿持久化、route sync、run polling/SSE、图 mutation 转发、state panel、创建菜单、import/export、human review 和反馈条。

建议第三优先级拆分，因为它是应用编排层，但不像 canvas 交互那样依赖像素细节。

推荐拆分顺序：

1. `useRunEventStream`：复用 workspace 和 run detail 里的 EventSource/polling/streaming output 逻辑。
2. `useEditorDraftPersistence`：封装 tab document draft、viewport draft、workspace localStorage 写入节奏。
3. `useGraphMutationActions`：把 state binding、node config、edge reconnect、state delete 等图操作从 shell 中移出。
4. `useNodeCreationFlow`：节点创建菜单、拖拽文件创建、从连接创建节点、创建后打开 state 编辑面板。

## 后端重点

### 1. `model_provider_client.py`

现状：同一文件中包含 provider discovery、HTTP 请求、stream fallback、OpenAI/Anthropic/Gemini/Codex 协议适配、Codex token refresh、日志记录和 provider ref 解析。

推荐目标结构：

- `tools/model_provider/http.py`：请求、stream fallback、错误格式化。
- `tools/model_provider/transports/openai.py`
- `tools/model_provider/transports/anthropic.py`
- `tools/model_provider/transports/gemini.py`
- `tools/model_provider/transports/codex.py`
- `tools/model_provider/discovery.py`
- `tools/model_provider/client.py`：保留当前公共 API 的薄门面，避免影响调用方。

拆分前应补齐测试重点：

- stream delta 合并。
- Codex token 过期刷新。
- provider model discovery fallback。
- thinking/reasoning metadata。

### 2. `node_system_executor.py`

现状：同一文件中包含 graph state 初始化、节点执行、agent prompt 构造、skill 调用、condition 计算、output artifact、streaming delta、LLM JSON 解析和运行快照。

推荐目标结构：

- `runtime/state_io.py`：读写 state、输入收集、输出边界。
- `runtime/agent_prompt.py`：system prompt、state prompt lines、输出 contract。
- `runtime/node_handlers.py`：input/agent/condition/output handler。
- `runtime/condition_eval.py`：condition 操作符和值归一化。
- `runtime/llm_output_parser.py`：JSON 解析、output key alias。
- `runtime/executor.py`：保留执行主循环和公共入口。

拆分原则：先移动纯函数和测试，再移动副作用函数。不要先重写执行模型。

### 3. `core/langgraph/runtime.py`

现状：LangGraph 构建、checkpoint、human review interrupt、cycle tracker、progress persistence 和最终 summary 都在一个文件。

推荐目标结构：

- `langgraph/build_runtime.py`：构建 graph node/route callable。
- `langgraph/checkpoint_runtime.py`：checkpoint metadata、resume、waiting state。
- `langgraph/cycle_tracker.py`：condition loop/cycle summary。
- `langgraph/progress.py`：run progress persistence。

这里应排在 provider/executor 之后，因为它和运行语义绑定更深。

## 可复用但不要过度抽象的模式

- Popover 样式和确认窗口逻辑重复较多，可以提取小型常量和 composable，但不要做大型弹层框架。
- `StateEditorPopover` 和 `StateDefaultValueEditor` 已经是正确方向，后续 state 创建、state panel、edge state 编辑应继续共用它们。
- `EventSource` 逻辑在 workspace 和 run detail 重复，应抽成运行事件流 composable。
- `graph-document.ts` 是核心图变更库，虽然超过 1k 行，但已有大量测试。它适合按 domain 分文件，不适合轻率重写。
- 结构测试能保护 UI 约束，但过多依赖源码字符串会让重构成本变高。后续拆组件时应把一部分结构测试替换成模型测试或组件行为测试。

## 优先级路线

### P0：已完成

- 删除旧本地运行时脚本。
- 清理静态未使用符号。
- 建立架构审计结论。

### P1：下一步最推荐

拆 `NodeCard.vue` 的端口/弹层/排序逻辑。理由：最近需求都集中在 state 胶囊和节点卡片，收益最大，且已有结构测试和模型测试可保护。

建议验收标准：

- 行为不变。
- `NodeCard.vue` 至少减少 25% 行数。
- state 胶囊和虚拟胶囊相关测试保持通过。
- 新抽出的 composable 有纯逻辑单测。

### P2：第二阶段

拆 `EditorCanvas.vue` 的 connection 和 measurement 系统。理由：连接线、吸附、缩放、hover 都是高风险区，应在 NodeCard 稳定后治理。

### P3：第三阶段

拆 `EditorWorkspaceShell.vue` 的 run event stream 和 draft persistence。理由：能复用到 run detail，也能降低 shell 的应用编排复杂度。

### P4：后端阶段

先拆 `model_provider_client.py`，再拆 `node_system_executor.py`，最后拆 LangGraph runtime。理由：provider client 的协议边界最清晰，executor 和 LangGraph runtime 对产品语义影响更大。

## 架构红线

- 不要改变 `node_system` 作为唯一正式图协议的定位。
- 不要让 state key 重新承担用户语义；用户语义继续放在 state name/type/description/value。
- 不要把本地运行时重新绑定到仓库启动流程；继续使用 OpenAI-compatible provider。
- 不要为了“抽象”隐藏 graph mutation 的可测试纯函数。
- 不要把桌宠 Agent、Skill、节点运行时强行揉进同一个 UI/运行配置面板；共享安装和诊断，分开绑定面。
