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
- `useCanvasEdgeInteractions.ts` 已承接 flow/route 删除确认、data edge state 编辑请求、disconnect/update emits 和缺失 edge 清理；`flowEdgeDeleteModel.ts` 已承接 selected-edge keyboard delete 的 editable-target / locked / missing / non-deletable / flow-route delete action projection；`edgeVisibilityModel.ts` 已承接 edge visibility toolbar click 的 locked / same-mode / change-mode cleanup policy。
- `canvasConnectionInteractionModel.ts`、`canvasConnectionModel.ts`、`canvasPendingStatePortModel.ts` 等纯模型已承接连接预览、自动吸附候选、虚拟端口创建上下文和新节点创建 payload 的可测试决策。
- `canvasNodeDragResizeModel.ts` 已承接节点拖拽/缩放 move 阶段的阈值判断、viewport-scale 投影、rounding、resize result projection，以及 node-resize/node pointer-down 的 missing-node / locked-edit / active-connection / inline-editor focus / start-resize / start-drag 路由；`EditorCanvas.vue` 仍保留 pointer capture、animation-frame batching、connection completion、rendered-size lookup、drag/resize execution 和 graph mutation emits。
- `canvasPinchZoomModel.ts` 已承接双指缩放起点计算、pointer distance/center 计算、canvas pointer-down 在 pinch cleanup 与 pan startup 之间的 setup action 决策、pinch update 的 missing target cleanup/non-positive distance ignore/`zoomAt` request projection、pinch pointer release 的 end-pinch versus continue-pointer-up routing，以及 touch pointer-move 的 tracked/update-pinch routing；`EditorCanvas.vue` 仍保留 pointer snapshot storage、active pointer cache updates/deletion、DOM focus/preventDefault、pointer capture、canvas rect lookup、event side effects、viewport pan/zoom execution 和 transient cleanup execution。
- `canvasViewportInteractionModel.ts` 已承接 wheel zoom delta、zero-delta ignore、pointer-centered zoom request、无 canvas rect 时的 set-scale fallback、zoom button 的 zoom-out/zoom-in clamped scale projection、reset viewport action selection，以及 pan pointer-move schedule/no-op routing；`EditorCanvas.vue` 仍保留 DOM rect lookup、实际 viewport mutation、wheel event binding、pan scheduling execution 和 viewport draft emits。
- `focusNodeViewport.ts` 已承接外部节点聚焦的 missing-target ignore 与 focused viewport projection；`EditorCanvas.vue` 仍保留 node lookup、DOM rect/element measurement、实际 selection mutation 和 viewport mutation。
- `canvasRunPresentationModel.ts` 已承接 awaiting-human run node presentation、human-review visual selection 和 lock-banner click action projection；`EditorCanvas.vue` 仍保留实际 button event binding、emit dispatch 和锁定态副作用。
- `minimapModel.ts` 已承接 minimap 模型投影、minimap point-to-world 映射、center-view viewport projection，以及 center-view 的 empty canvas-size ignore action；`EditorCanvas.vue` 仍保留 canvas size refresh、实际 viewport mutation、canvas focus execution 和 minimap event binding。
- `useCanvasNodeDragResize.ts` 已承接节点拖拽/缩放 refs、pointer capture release、scheduled update dispatch、拖拽后残留 click 抑制和 teardown；`EditorCanvas.vue` 仍保留 selection、active connection cleanup、auto-snap、connection completion、panning、DOM measurement 和 graph mutation emits。
- `useCanvasConnectionInteraction.ts` 已承接 pending connection refs、preview point、auto-snapped target ref、active connection hover node ref、从 anchor 启停 pending connection、preview point 更新和 hover-change 通知；`EditorCanvas.vue` 仍保留 actual emits、panning、node drag/resize 和 DOM measurement。
- `canvasConnectionCompletionModel.ts` 已承接 connection completion action projection、completion request cleanup policy 和 completion execution routing：从 active connection、target anchor 和锁定态纯计算 locked/no-connection ignore、`connect-flow`、`connect-route`、`connect-state`、`connect-state-input-source`、`reconnect-flow`、`reconnect-route` payload，并明确完成后清理连接交互状态/已选边；`EditorCanvas.vue` 仍保留实际 `emit` dispatch 和 imperative cleanup execution。
- `canvasConnectionInteractionModel.ts` 已进一步承接高层 auto-snap target resolution、pending connection creation-menu request、empty-canvas double-click creation request、file-drop creation request、drag-over drop-effect request、pointer-up route decision、active-connection node pointer-down route decision、pointer-move preview request 与 anchor pointer-down route decision：flow hotspot、node body fallback、reverse state input source、state output target、create-input fallback、node creation payload、打开菜单后的清理策略、empty-canvas locked/ignored/open-menu 分支、file-drop locked/ignored/missing-file/create-from-file 分支、drag-over copy/none drop-effect 分支、locked cleanup / snapped completion / creation-menu 分支选择、node body snap completion / continue pointer-down 分支、hover node / target anchor / fallback point 预览请求，以及 locked-edit / complete / ignore / start-toggle anchor 分支已可测试；`EditorCanvas.vue` 仍保留 DOM hit-test、pointer-to-canvas 坐标转换、dataTransfer 访问和 mutation、RAF 调度、actual emits、panning、node drag/resize 和 DOM measurement。
- `edgeProjection.ts` 已继续承接 projected anchor 的 flow/route/point 分组；`EditorCanvas.vue` 仍保留 transient anchor construction、connection eligibility、overlay rendering 和 pointer handlers。
- `edgeProjection.ts` 已继续承接 projected edge 的 flow/route 与 data 分层分组；`EditorCanvas.vue` 仍保留 SVG layer ordering、selected-edge state、hitarea handlers 和 edge class bindings。
- `canvasInteractionStyleModel.ts` 已继续承接 connection preview、projected edge、selected/active-run edge 和 edge hitarea class projection；`EditorCanvas.vue` 仍保留 selected-edge state input、active-run edge lookup、SVG rendering 和 pointer handlers。
- `canvasInteractionStyleModel.ts` 已继续承接 flow hotspot 与 route handle 的 outbound/visibility/tone/connect class projection；`EditorCanvas.vue` 仍保留 hotspot visibility 输入、route tone 输入、anchor overlay rendering 和 pointer handlers。

### 3. `EditorWorkspaceShell.vue`

现状：`EditorWorkspaceShell.vue` 约 2.0k 行，承担 workspace tab、草稿持久化、route sync、run polling/SSE、图 mutation 转发、创建菜单、import/export、human review 和反馈条。

建议第三优先级拆分，因为它是应用编排层，但不像 canvas 交互那样依赖像素细节。

推荐拆分顺序：

1. `useRunEventStream`：复用 workspace 和 run detail 里的 EventSource/polling/streaming output 逻辑。
2. `useEditorDraftPersistence`：封装 tab document draft、viewport draft、workspace localStorage 写入节奏。
3. `useGraphMutationActions`：把 state binding、node config、edge reconnect、state delete 等图操作从 shell 中移出。
4. `useNodeCreationFlow`：节点创建菜单、拖拽文件创建、从连接创建节点、创建后打开 state 编辑面板。

当前执行进展：

- `run-event-stream.ts` 已承接 workspace 与 run detail 共用的 run event stream URL 构造、SSE payload JSON 解析，以及 RunDetail live output merge 规则；`EditorWorkspaceShell.vue` 和 `RunDetailPage.vue` 仍保留 EventSource 生命周期、polling timers、abort controller、restore/human-review behavior 和实际 UI state mutation。
- `run-event-stream.ts` 已继续承接 queued/running/resuming run polling status 语义；`EditorWorkspaceShell.vue` 和 `RunDetailPage.vue` 仍保留 polling timer cadence、abort behavior、EventSource close behavior、human-review opening、terminal run persistence 和实际 UI state mutation。
- `run-event-stream.ts` 已继续承接 run event payload 的 node id、text 和 output key projection；`EditorWorkspaceShell.vue` 和 `RunDetailPage.vue` 仍保留 EventSource 生命周期、preview state writes、graph mutation、polling timers、restore/human-review behavior 和实际 UI state mutation。
- `run-event-stream.ts` 已继续承接 workspace streaming output preview target projection：output keys 匹配 output node reads，并在没有匹配项时回退到 payload node id；`EditorWorkspaceShell.vue` 仍保留 preview ref assignment、EventSource lifecycle、graph mutation、polling timers 和 live display state。
- `run-event-stream.ts` 已继续承接 streaming output preview map patch projection：按目标 node ids 生成 immutable plain preview entries；`EditorWorkspaceShell.vue` 仍保留 preview ref assignment、EventSource lifecycle、graph mutation、polling timers 和 live display state。
- `run-event-stream.ts` 已继续承接 streaming output preview payload-to-map request projection：组合 text、output keys、fallback node id、target node selection 和 immutable preview patching；`EditorWorkspaceShell.vue` 仍保留 preview ref assignment、EventSource lifecycle、graph mutation、polling timers、restore/human-review behavior 和 live display state。
- `run-event-stream.ts` 已继续承接 Event-to-payload parsing wrapper：统一 `MessageEvent` 判断和 JSON payload 解析；`EditorWorkspaceShell.vue` 与 `RunDetailPage.vue` 仍保留 EventSource lifecycle、listener registration、polling timers、restore/human-review behavior 和 UI state mutation。
- `editorDraftPersistenceModel.ts` 已开始承接 draft persistence 的 viewport draft 决策：缺失 viewport 的 tab id 选择、相同 viewport no-op、immutable viewport draft update；`EditorWorkspaceShell.vue` 仍保留实际 localStorage read/write、ref assignment、route sync、tab registration、graph mutation、restore behavior 和 run stream behavior。
- `editorDraftPersistenceModel.ts` 已继续承接 document draft hydration 决策：未保存 tab 缺失文档筛选、persisted-vs-seed、已有图 tab hydrate gating、persisted-vs-cached-vs-fetch source selection；`EditorWorkspaceShell.vue` 仍保留实际 localStorage read、graph fetch、registerDocument、loading/error state、route sync、restore behavior 和 run stream behavior。
- `editorDraftPersistenceModel.ts` 已继续承接 workspace draft watcher 决策：hydrated/no-op gating、workspace persistence request 和 document/viewport draft pruning tab ids；`EditorWorkspaceShell.vue` 仍保留实际 workspace localStorage write、document/viewport pruning side effects、route sync 和 draft hydration calls。
- `editorTabRuntimeModel.ts` 已开始承接 tab-scoped runtime record operations：关闭 tab 时的 clone/delete cleanup，以及 feedback、run output preview、run visual state、polling state、document registration、existing graph loading 的 immutable set writes；`EditorWorkspaceShell.vue` 仍保留 close-tab transition、persisted draft removal、run polling/EventSource cancellation、stream payload handling、graph fetches、human-review opening、route sync 和 visual layout。
- `nodeCreationMenuModel.ts` 已开始承接 node creation menu 的 open/close/query state projection，以及 created-state edge editor request projection；`EditorWorkspaceShell.vue` 仍保留 edit guard、node creation execution、Date generation、state editor ref assignment、feedback、graph mutation 和 menu component wiring。
- `editorTabRuntimeModel.ts` 已继续承接 run invocation 与 human-review resume 的 tab-state set writes；`EditorWorkspaceShell.vue` 仍保留 `runGraph`/`resumeRun` 调用、polling generation、EventSource lifecycle、restored checkpoint usage、feedback formatting 和 human-review behavior。
- `EditorWorkspaceShell.vue` 本地已集中 dirty graph document commit：位置、尺寸、重命名和普通 dirty 写入共享 `commitDirtyDocumentForTab`；graph mutator calls、edit guards、draft writes、save behavior 和 route sync 仍保持 shell-owned。
- `editorTabRuntimeModel.ts` 已继续承接 document、side-panel 与 focus/focus-request 的 tab-scoped set writes；`EditorWorkspaceShell.vue` 仍保留 persisted document draft writes、panel mode decisions、human-review lock/open policy 和 focus request sequencing。
- `EditorWorkspaceShell.vue` 本地已继续集中 simple graph mutation commit：state binding、port binding/reorder、flow/route connect/reconnect/remove、node config、condition/output config、state field update 等简单 handler 共享 `commitDocumentMutationForTab` 的 document lookup、no-op、dirty commit 和 optional focus sequencing；node creation、delete、save/open 与 human-review routing 仍保持 shell-owned。
- `useWorkspaceGraphMutationActions.ts` 已承接更完整的 graph mutation action layer：state binding、port binding/reorder、data-edge disconnect、create-port state、node deletion、flow/route connect/reconnect/remove、state input source connect、node/config/state field update/delete 等 handler；`EditorWorkspaceShell.vue` 仍保留 save/open routing、node creation execution、preset persistence、run lifecycle、human-review routing、route sync 和 draft persistence。
- `useWorkspaceSidePanelController.ts` 与 `workspaceSidePanelModel.ts` 已承接 state panel open/mode defaults、Human Review awaiting-human gate、locked-open policy、active panel toggling、focus request sequencing 和浮动侧栏宽度样式；`EditorWorkspaceShell.vue` 仍保留模板 wiring、graph mutation、node creation execution、run lifecycle、route sync、draft persistence 和 toast rendering。
- `useWorkspaceRunVisualState.ts` 已承接 run feedback、message feedback、run node status/current-node、output preview merge、failure messages、active run edge ids 和 restored/terminal run visual projection；`EditorWorkspaceShell.vue` 仍保留 fetch/poll/EventSource lifecycle、restored checkpoint cleanup、Human Review opening、run invocation、graph mutation、node creation execution、route sync 和 draft persistence。
- `useWorkspaceDocumentState.ts` 已承接 document synchronization、persisted document draft writes、viewport draft hydration/update、terminal run-written state persistence、dirty graph metadata commit 和 locked-edit guarded dirty writes；`EditorWorkspaceShell.vue` 仍保留 save/open routing、graph fetch、route sync、run lifecycle、Human Review routing、node creation execution 和 graph mutation action wiring。

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

当前执行进展：

- `model_provider_http.py` 已作为 P4 的第一步承接 provider client 共用的 base URL normalization、auth headers、Anthropic headers、string dedupe、request JSON、request-error formatting、request log safety、SSE event reading 和 streaming fallback。`model_provider_client.py` 仍保留现有公共 API、provider discovery/chat 编排、各 provider 协议解析、Codex refresh 语义和兼容 patch 接缝。
- `model_provider_discovery.py` 已承接 OpenAI/Anthropic data model id parsing、Gemini model id filtering、Codex model id sorting/filtering 和 provider model discovery 请求；`model_provider_client.discover_provider_models` 仍作为兼容门面，并注入 Codex token resolve/refresh callbacks 以保留现有 patch 接缝。
- `model_provider_openai.py` 已承接 OpenAI-compatible chat request payload、stream delta extraction、stream coalescing、response text extraction、fallback metadata 和 request logging 调用；`model_provider_response_parsing.py` 已承接共享 message text normalization 和 SSE JSON event parsing。`model_provider_client._chat_openai_compatible` 仍作为兼容门面，并注入旧 request-log / streaming fallback patch 接缝。
- `model_provider_anthropic.py` 已承接 Anthropic messages request payload、thinking token budget handling、stream delta extraction、stream coalescing、response text extraction、fallback metadata 和 request logging 调用；`model_provider_client._chat_anthropic` 仍作为兼容门面，并注入旧 request-log / streaming fallback patch 接缝。
- `model_provider_gemini.py` 已承接 Gemini generate-content request payload、model path normalization、stream/fallback params、stream delta extraction、stream coalescing、response text extraction、fallback metadata 和 request logging 调用；`model_provider_client._chat_gemini` 仍作为兼容门面，并注入旧 request-log / streaming fallback patch 接缝。
- `model_provider_codex.py` 已承接 Codex responses response-text extraction、stream delta extraction、stream coalescing、one-shot responses POST、token-expiry retry、request logging 和 response metadata；`model_provider_client._chat_codex_responses` 仍作为兼容门面，并注入 Codex token resolve/refresh 与 request-log patch 接缝。
- Phase 99 后 `model_provider_client.py` 从 1,380 行降到 333 行；下一步应清理 provider facade 或进入 executor/runtime 纯 helper，而不是同时移动多个运行语义。

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

当前执行进展：

- `runtime/condition_eval.py` 已承接 condition 操作符、数值归一化、文本 coercion 和 branch key resolution；`node_system_executor.py` 保留 `_evaluate_condition_rule` 等兼容别名。
- `runtime/agent_prompt.py` 已承接 agent system prompt、state prompt lines 和输出 contract 文案构造；`node_system_executor.py` 保留旧私有 helper 入口。
- `runtime/llm_output_parser.py` 已承接 output key alias 构造、LLM JSON response parsing 和 fallback parsing；`node_system_executor.py` 继续通过兼容别名调用。
- `runtime/execution_graph.py` 已承接 `ExecutionEdge`、cycle detection、regular/conditional edge id construction、execution edge expansion 和 active outgoing edge selection；`node_system_executor.py` 保留旧私有 helper 入口，`core/langgraph/runtime.py` 已直接依赖新模块。
- `runtime/state_io.py` 已承接 graph state initialization、node input collection、state write application、writer records、state events 和 write change records；`node_system_executor.py` 保留旧私有 helper 入口，`core/langgraph/runtime.py` 与导出的 LangGraph Python 源码已直接依赖新模块。
- `runtime/output_artifacts.py` 已承接 loop-limit output value formatting、output preview/final-result wrapping 和 active output-node resolution；`node_system_executor.py` 保留旧私有 helper 入口，output boundary collection 和 output persistence side effects 仍留在 executor。
- `runtime/run_artifacts.py` 已承接 run artifact refresh、exported output saved-file matching、state snapshot refresh、knowledge summary building 和 run snapshot append/deep-copy behavior；`node_system_executor.py` 保留 `_refresh_run_artifacts` 与 `_build_knowledge_summary` 兼容入口，`core/langgraph/runtime.py` 已直接依赖新模块。
- `runtime/input_boundary.py` 已承接 first-truthy selection 和 input boundary JSON coercion；`node_system_executor.py` 保留旧私有 helper 入口。
- `runtime/output_boundaries.py` 已承接 output node execution、output preview construction、output persistence calls、active output refresh filtering、saved output filtering 和 final result selection；`node_system_executor.py` 保留 `collect_output_boundaries` 与 `_execute_output_node` 兼容入口，`core/langgraph/runtime.py` 已直接依赖新模块。
- `runtime/agent_streaming.py` 已承接 streamed delta accumulation、streaming output record updates、node.output.delta/node.output.completed run events 和 output value deep-copying；`node_system_executor.py` 保留旧私有 helper 入口。
- `runtime/reference_resolution.py` 已承接 dotted path lookup、运行时 reference namespace resolution 和 condition source fallback；`node_system_executor.py` 保留 `_read_path`、`_resolve_reference` 与 `_resolve_condition_source` 兼容入口。
- `runtime/skill_invocation.py` 已承接 callable keyword signature inspection 和 skill invocation calling conventions；`node_system_executor.py` 保留 `_callable_accepts_keyword` 与 `_invoke_skill` 兼容入口。
- `runtime/agent_runtime_config.py` 已承接 global-vs-override model selection、thinking-level resolution、temperature bounds、provider/runtime model derivation 和 local progress/reasoning request flags；`node_system_executor.py` 保留 `_resolve_agent_runtime_config` 兼容门面，并通过依赖注入保留旧 patch 接缝。
- `runtime/agent_response_generation.py` 已承接 provider call routing、fallback thinking level、default user prompt、LLM JSON parsing、response payload construction、warnings/reasoning 和 provider runtime metadata capture；`node_system_executor.py` 保留 `_generate_agent_response` 兼容门面，并通过依赖注入保留旧 patch 接缝。
- `runtime/node_handlers.py` 已承接 input、condition 和 agent node handler body，包括 input output construction、condition branch execution、skill invocation ordering、knowledge-base skill input selection、stream callback wiring、generation kwargs、output value projection、warning dedupe 和 final result selection；`node_system_executor.py` 保留 `_execute_input_node`、`_execute_agent_node` 与 `_execute_condition_node` 兼容门面。
- `runtime/run_progress.py` 已承接 run artifact refresh、lifecycle touch、run save 和 `run.updated` event payload construction；`node_system_executor.py` 保留 `_persist_run_progress` 兼容门面。
- `runtime/runtime_summaries.py` 已承接 compact input 和 output/final-result summaries；`node_system_executor.py` 保留 `_summarize_inputs` 与 `_summarize_outputs` 兼容别名。
- Phase 114 后 `node_system_executor.py` 从 1,226 行降到 240 行；执行主流程和兼容门面仍留在 executor，已足够作为薄门面保留，后续 P4 重点转向 LangGraph runtime preparation。

### 3. `core/langgraph/runtime.py`

现状：LangGraph 构建、checkpoint、human review interrupt、cycle tracker、progress persistence 和最终 summary 都在一个文件。

当前执行进展：

- `runtime/runtime_summaries.py` 已承接 LangGraph node step input/output summary 的 first non-empty value selection；`core/langgraph/runtime.py` 保留 `_summarize_values` 兼容别名。
- `core/langgraph/checkpoint_runtime.py` 已承接 checkpoint runtime config construction、checkpoint lookup config construction、initial checkpoint metadata normalization 和 checkpoint metadata sync from saver；`core/langgraph/runtime.py` 保留 `_build_checkpoint_runtime` 与 `_sync_checkpoint_metadata` 兼容别名。
- `core/langgraph/interrupts.py` 已承接 breakpoint node name wrapping/unwrapping、interrupt metadata normalization、waiting-for-human detection、pending interrupt serialization、waiting state mutation、pending interrupt metadata cleanup 和 pause/completion snapshot id allocation；`core/langgraph/runtime.py` 保留相关私有兼容别名。
- `core/langgraph/cycle_tracker.py` 已承接 cycle tracker construction、condition loop-limit collection/resolution、loop iteration advancement、cycle iteration records、node/route activity recording、no-state-change 和 max-iteration failure projection、cycle record serialization、final stop reason resolution 和 final cycle summary projection；`core/langgraph/runtime.py` 保留相关私有兼容别名。
- Phase 117 后 `core/langgraph/runtime.py` 从约 1,040 行降到 528 行；execution callables 和图构建主流程仍留在 runtime，checkpoint、interrupt、cycle helper 已迁出。

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
- 2026-04-30：`canvasLockedInteractionModel.ts` 已承担锁定节点 pointer capture 的 no-op/捕获策略，`EditorCanvas.vue` 仍保留 DOM 目标判断、事件副作用、focus、清理、选中和 emit 执行。
- 2026-04-30：`canvasLockedInteractionModel.ts` 继续承担通用锁定交互 guard 的 allow/block 与清理策略，`EditorCanvas.vue` 仍保留实际清理调用、选中边 mutation 和 locked-attempt emit。
- 2026-04-30：`canvasEdgePointerInteractionModel.ts` 已承担 edge pointer-down 的锁定、flow/route 删除确认、data-edge 状态确认和选中边 fallback 策略，`EditorCanvas.vue` 仍保留实际 confirm/composable 调用与选中态副作用。
- 2026-04-30：`canvasConnectionInteractionModel.ts` 已承担 pending connection 创建菜单 action 路由，`EditorCanvas.vue` 仍保留 canvas 坐标输入、实际 open-node-creation-menu emit 和 cleanup 执行。
- 2026-04-30：`canvasConnectionCompletionModel.ts` 已继续承担 connection completion execution routing 的 locked/no-connection ignore 与 complete cleanup policy，`EditorCanvas.vue` 仍保留实际 typed emit dispatch、连接清理和 selected-edge mutation。
- 2026-04-30：`canvasViewportInteractionModel.ts` 已继续承担 zoom button 的 clamped scale/reset action routing，`EditorCanvas.vue` 仍保留实际 canvas-center zoom、viewport reset mutation 和 viewport draft emit。
- 2026-04-30：`minimapModel.ts` 已继续承担 minimap center-view 的 empty-size ignore 与 centered viewport action，`EditorCanvas.vue` 仍保留 canvas size refresh、实际 viewport mutation 和 focus execution。
- 2026-04-30：`focusNodeViewport.ts` 已承担外部节点聚焦的 missing-target ignore 与 focused viewport action projection，`EditorCanvas.vue` 仍保留 node lookup、DOM measurement、selection 和 viewport mutation execution。
- 2026-04-30：`canvasPinchZoomModel.ts` 已继续承担 pinch update 的 missing pinch/target cleanup、non-positive distance ignore、center calculation 和 zoom request projection，`EditorCanvas.vue` 仍保留 active pointer cache updates、DOM canvas rect lookup、actual cleanup 和 viewport `zoomAt` execution。
- 2026-04-30：`canvasPinchZoomModel.ts` 已继续承担 pinch pointer release 的 end-pinch versus continue-pointer-up routing，`EditorCanvas.vue` 仍保留 active pointer deletion、actual cleanup/end-pan、pointer capture release、connection pointer-up 和 node drag/resize release。
- 2026-04-30：`canvasPinchZoomModel.ts` 已继续承担 touch pointer-move 的 tracked-pointer update、pinch preventDefault、scheduled update 和 stop routing，`EditorCanvas.vue` 仍保留 active pointer cache mutation、event side effects、schedule execution、connection pointer move、node drag/resize 和 panning。
- 2026-04-30：`canvasViewportInteractionModel.ts` 已继续承担 pan pointer-move 的 schedule/no-op routing，`EditorCanvas.vue` 仍保留 actual `scheduleDragFrame` 和 `viewport.movePan(event)` execution。
- 2026-04-30：`canvasViewportInteractionModel.ts` 已继续承担 canvas world point projection 的 missing-canvas fallback 与 viewport-relative coordinate math，`EditorCanvas.vue` 仍保留 DOM rect lookup、pending connection fallback input 和 connection/menu/drop consumer wiring。
- 2026-04-30：`canvasViewportInteractionModel.ts` 已继续承担 canvas size update 的 missing-element、unchanged-size 和 update-size routing，`EditorCanvas.vue` 仍保留 DOM client size reads、`ResizeObserver` lifecycle、minimap consumers 和 actual `canvasSize` ref mutation。
- 2026-04-30：`canvasEdgePointerInteractionModel.ts` 已继续承担 selected-edge target point projection 的 data/flow target anchor lookup，`EditorCanvas.vue` 仍保留 projected anchor ref access、selected-edge mutation 和 actual pending connection point mutation。
- 2026-04-30：`edgeVisibilityModel.ts` 已继续承担 canvas flow/route hotspot visibility projection，`EditorCanvas.vue` 仍保留 selected/hovered refs、active connection source ref、eligible target ids 和 anchor overlay rendering。
- 2026-04-30：`edgeVisibilityModel.ts` 已继续承担 projected-edge visibility membership，`EditorCanvas.vue` 仍保留 visible edge id computation、projected edge rendering、selected-edge state 和 hitarea handlers。
- 2026-04-30：`canvasInteractionStyleModel.ts` 已继续承担 active-source 和 eligible-target anchor class-state checks，`EditorCanvas.vue` 仍保留 style context、overlay rendering 和 pointer handlers。
- 2026-04-30：`canvasConnectionInteractionModel.ts` 已继续承担 connection completion eligibility routing，`EditorCanvas.vue` 仍保留 active connection refs、graph document input、auto-snap callers 和 completion emits。
- 2026-04-30：`edgeProjection.ts` 已继续承担 projected anchor grouping，`EditorCanvas.vue` 仍保留 transient anchor construction、connection eligibility、anchor overlay rendering 和 pointer handlers。
- 2026-04-30：`edgeProjection.ts` 已继续承担 projected edge layer grouping，`EditorCanvas.vue` 仍保留 SVG layer ordering、selected-edge state、edge hitarea handlers 和 edge class bindings。
- 2026-04-30：`canvasInteractionStyleModel.ts` 已继续承担 edge class projection，`EditorCanvas.vue` 仍保留 selected-edge state input、active-run lookup、SVG rendering 和 pointer handlers。
- 2026-04-30：`canvasInteractionStyleModel.ts` 已继续承担 flow hotspot 和 route handle class projection，`EditorCanvas.vue` 仍保留 hotspot visibility/tone 输入、overlay rendering 和 pointer handlers。
- 2026-04-30：`run-event-stream.ts` 已承担 run event stream URL 构造、event payload 解析和 RunDetail live output 合并；workspace/run detail 仍保留 EventSource 生命周期、polling/abort 和 UI state mutation。
- 2026-04-30：`run-event-stream.ts` 已继续承担 queued/running/resuming run polling status classification；workspace/run detail 仍保留 timer cadence、abort、EventSource closure、human-review opening、terminal persistence 和 UI state mutation。
- 2026-04-30：`run-event-stream.ts` 已继续承担 run event payload node id trimming、explicit text/fallback selection 和 output key normalization；workspace/run detail 仍保留 preview writes、stream lifecycle、graph mutation、polling、restore 和 human-review behavior。
- 2026-04-30：`run-event-stream.ts` 已继续承担 streaming output preview target node projection；workspace shell 仍保留 preview ref assignment、stream lifecycle、graph mutation、polling 和 live display state。
- 2026-04-30：`run-event-stream.ts` 已继续承担 streaming output preview map patch construction；workspace shell 仍保留 preview ref assignment、stream lifecycle、graph mutation、polling 和 live display state。
- 2026-04-30：`run-event-stream.ts` 已继续承担 streaming output preview payload-to-map request projection；workspace shell 仍保留 preview ref assignment、stream lifecycle、graph mutation、polling、restore 和 human-review behavior。
- 2026-04-30：`run-event-stream.ts` 已继续承担 Event-to-payload wrapper；workspace/run detail 仍保留 EventSource lifecycle、listener registration、polling、restore/human-review behavior 和 UI state mutation。
- 2026-04-30：`editorDraftPersistenceModel.ts` 已开始承担 viewport draft hydration/update decisions；workspace shell 仍保留 actual localStorage read/write、viewport ref assignment、route sync、tab registration、graph mutation、restore 和 run stream behavior。
- 2026-04-30：`editorDraftPersistenceModel.ts` 已继续承担 document draft hydration routing；workspace shell 仍保留 actual localStorage read、graph fetch、registerDocument、loading/error state writes、route sync、restore 和 run stream behavior。
- 2026-04-30：`editorDraftPersistenceModel.ts` 已继续承担 workspace draft watcher hydration/pruning requests；workspace shell 仍保留 actual workspace localStorage write、document/viewport draft pruning side effects、route sync 和 draft hydration calls。
- 2026-04-30：`editorTabRuntimeModel.ts` 已承担 tab-scoped clone/delete cleanup 与 immutable set writes，覆盖 feedback、preview、run visual/polling、document load、run invocation 和 human-review resume state；workspace shell 仍保留 lifecycle/API/route/graph side effects。
- 2026-04-30：`nodeCreationMenuModel.ts` 已承担 node creation menu state projection 与 created-state edge editor request projection；workspace shell 仍保留 node creation execution、Date generation、state editor ref assignment、feedback 和 graph mutation ownership。
- 2026-04-30：`EditorWorkspaceShell.vue` 已集中 dirty graph document commit helper；位置、尺寸、重命名和 dirty 写入复用同一 metadata update path，graph mutation helpers 和 save/open routing 后续仍可继续拆分。
- 2026-04-30：`editorTabRuntimeModel.ts` 已继续覆盖 document、side-panel、focused-node 和 focus-request tab-state writes；workspace shell 仍保留实际 draft persistence、panel routing、human-review lock policy 和 focus sequencing。
- 2026-04-30：`EditorWorkspaceShell.vue` 已集中 simple graph mutation commit helper；简单图 mutation handlers 复用 document lookup、no-op detection、dirty commit 和 focus sequencing，复杂 node creation/delete/save/open/human-review flows 暂不移动。
- 2026-04-30：`useWorkspaceGraphMutationActions.ts` 已承接 broader graph mutation action layer，`EditorWorkspaceShell.vue` 从 2462 行降到约 2055 行；save/open、node creation execution、run lifecycle 和 human-review routing 后续仍需单独拆分。
- 2026-04-30：`useWorkspaceSidePanelController.ts` 已承接 side panel/Human Review/focus request controller，`workspaceSidePanelModel.ts` 承接纯状态判断，`EditorWorkspaceShell.vue` 从 2055 行降到 1977 行；run lifecycle、save/open、node creation execution、route sync 和 draft persistence 仍保持 shell-owned。
- 2026-04-30：`useWorkspaceRunVisualState.ts` 已承接 run visual state controller，`EditorWorkspaceShell.vue` 从 1977 行降到 1894 行；polling/SSE lifecycle、Human Review opening、run invocation、save/open、node creation execution、route sync 和 draft persistence 仍保持 shell-owned。
- 2026-04-30：`useWorkspaceDocumentState.ts` 已承接 document/viewport draft state controller，`EditorWorkspaceShell.vue` 从 1894 行降到 1831 行；save/open routing、graph fetch、route sync、run lifecycle、Human Review routing、node creation execution 和 graph mutation action wiring 仍保持 shell-owned。

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

当前 P4 进展：`model_provider_client.py` 的共享 HTTP/request 层、provider discovery 层、OpenAI-compatible chat transport、Anthropic messages transport、Gemini generate-content transport、Codex responses transport 和共享 response parsing 已完成抽取；`node_system_executor.py` 的 condition evaluation、agent prompt、LLM output parser、execution graph、state I/O、output artifact、run artifact、input boundary、output boundary、agent streaming、reference resolution、skill invocation、agent runtime config、agent response generation、node handler、run progress 和 runtime summary helper 已完成抽取；LangGraph runtime 已开始复用共享 summary helper，并已迁出 checkpoint/runtime metadata helper、waiting-state interrupt helper 和 cycle helper。Phase 121 后，后端 P4 约 95% 完成；全路线总进度约 96.5%，因为 frontend P3/P2/P1 仍有尾部大文件工作。

## 架构红线

- 不要改变 `node_system` 作为唯一正式图协议的定位。
- 不要让 state key 重新承担用户语义；用户语义继续放在 state name/type/description/value。
- 不要把本地运行时重新绑定到仓库启动流程；继续使用 OpenAI-compatible provider。
- 不要为了“抽象”隐藏 graph mutation 的可测试纯函数。
- 不要把桌宠 Agent、Skill、节点运行时强行揉进同一个 UI/运行配置面板；共享安装和诊断，分开绑定面。
