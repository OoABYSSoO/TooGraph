# Buddy 父图输出协议与节点计时设计

## 背景

Buddy 聊天窗口当前同时承担了“用户可见回复”和“运行过程观察”的职责，导致两个问题：

- 中间节点的结构化状态可能被展示到聊天窗口，例如 `request_understanding` 这类调试 JSON。
- 模板必须依赖 `visible_reply`、`final_reply` 等 Buddy 专用状态名，聊天窗口不是图模板公开输出的自然渲染面。

新的方向是把 Buddy 聊天窗口收敛成父图公开输出流：图模板通过父图 root-level `output` 节点声明哪些状态可以展示给用户，聊天窗口只消费这些公开输出。

## 目标

- Buddy 聊天窗口只展示父图 root-level `output` 节点导出的状态。
- 一次用户消息可以产生多条公开输出，每条输出独立流式、独立完成、独立显示耗时。
- 子图内部 `output` 节点只作为子图边界，不直接进入 Buddy 聊天窗口。
- 聊天窗口移除运行过程胶囊；运行过程保留在运行详情、调试视图和画布节点观测中。
- 画布节点左上角显示节点运行时长胶囊，增强节点本身的运行观测能力。
- Buddy 聊天中的 output 耗时使用公开输出耗时，而不是 output 节点自己的执行耗时。

## 非目标

- 不把子图内部输出直接渲染为聊天消息。
- 不继续维护 Buddy 专用回复状态名协议，例如只识别 `visible_reply`、`final_reply`。
- 不在聊天窗口展示任意 LLM 节点 delta、中间 JSON、activity event 或运行日志。
- 不设计多输入 output 节点。当前协议要求一个 output 节点有且只有一个输入 state。

## 核心协议

### 公开输出定义

公开输出是父图 root-level `output` 节点读取的唯一 state。

一个公开输出由以下字段唯一标识：

- `outputNodeId`: 父图 output 节点 ID。
- `stateKey`: 该 output 节点读取的唯一 state key。
- `displayMode`: output 节点的展示模式，例如 `markdown`、`json`、`auto`。
- `stateType`: state schema 中声明的状态类型，例如 `markdown`、`text`、`json`、`file`、`result_package`。

Buddy 聊天窗口不得根据中间节点 ID、LLM 输出字段名、状态名白名单或子图 output 节点创建消息。

### 输出顺序

一次用户消息可能产生多个公开输出。聊天窗口按运行时实际开始输出的顺序展示：

- 哪个公开输出先收到可显示内容，哪个先创建消息。
- 并行分支自然按实际到达顺序显示。
- 完成后的输出位置不再重排。
- 模板 JSON 顺序、画布位置和 output 节点创建顺序只作为调试信息，不参与聊天排序。

### 输出类型

Buddy 聊天根据公开输出类型选择展示形态：

- `markdown` / `text`: 普通伙伴气泡，支持流式文本更新。
- `json` / `result_package`: 结果卡片，默认显示摘要，支持展开查看结构化内容。
- `file`: 文件结果卡片，展示文件名、路径、类型和可打开入口。
- 其他未知类型：结果卡片，保留原始值的安全摘要和展开入口。

结构化输出不混入普通聊天文本，避免用户把内部字段误读成伙伴自然语言回复。

## 运行时计时

### 节点运行时长

每个参与本轮运行的节点维护自己的运行时长：

- 节点开始运行时记录 `startedAt`，画布显示左上角小胶囊。
- 节点运行中动态显示当前耗时。
- 节点完成后固定显示最终 `duration_ms`。
- 节点失败或暂停时保留当前已耗时，并用对应状态色区分。
- 下一次运行开始时清空上一轮节点时长，并重新计时。

节点时长胶囊只显示在运行中、完成、失败或暂停过的节点上；完全没有参与本轮运行的节点不显示。

### 公开 output 耗时

Buddy 聊天中每条 output 消息显示公开输出耗时。它不是 output 节点自身执行耗时，而是从上游开始生产该 state 到该 state 被公开输出接收完成的时间。

计时规则：

- 对每个父图 `output` 节点，确定它读取的唯一 `stateKey`。
- 找到连接到该 output 节点的直接上游节点。
- 当这个上游节点开始运行时，如果该 output 对应的消息尚未完成，启动公开输出计时。
- 当该 `stateKey` 的公开输出收到最终值时停止计时。
- 如果上游节点写多个 state，只按当前 output 节点读取的 `stateKey` 停止当前 output 的计时。
- 其他 state 若也有父图 output 节点，会创建自己的公开输出计时；没有父图 output 节点则不产生聊天输出计时。

如果一个 LLM 节点写出多个 state，并且多个父图 output 分别读取这些 state，则画布上该 LLM 节点只显示一个节点总耗时，聊天窗口中多个 output 消息分别显示各自公开输出耗时。

## 事件与数据流

### 后端事件要求

运行事件需要让前端能稳定区分三类信息：

- 节点运行观测：节点开始、完成、失败、暂停、耗时。
- 状态输出流：某个节点正在为某些 state 生成 delta 或最终值。
- 父图公开输出：某个父图 output 节点读取的 state 已产生可展示内容。

推荐新增或归一化一层 Buddy/公开输出专用事件模型，而不是让 Buddy UI 直接猜测普通 node delta：

```ts
type PublicOutputRunEvent = {
  event: "public_output.delta" | "public_output.completed";
  run_id: string;
  output_node_id: string;
  state_key: string;
  display_mode: string;
  state_type: string;
  value?: unknown;
  text?: string;
  started_at_ms?: number;
  duration_ms?: number;
};
```

后端可以在运行时根据父图 output 边界生成这些事件；如果短期先在前端推导，也必须以父图 root-level output 节点为唯一来源，不能使用 Buddy 专用状态名。

### 前端推导要求

前端在启动 Buddy 运行时，从父图 graph snapshot 建立公开输出索引：

```ts
type PublicOutputBinding = {
  outputNodeId: string;
  stateKey: string;
  displayMode: string;
  stateType: string;
  upstreamNodeIds: string[];
};
```

索引只扫描父图 `graph.nodes` 中 `kind === "output"` 的节点，不递归进入 subgraph。

运行中维护两个状态表：

```ts
type RunNodeTiming = {
  nodeId: string;
  status: "running" | "success" | "failed" | "paused";
  startedAtMs: number | null;
  durationMs: number | null;
};

type BuddyPublicOutputMessage = {
  outputNodeId: string;
  stateKey: string;
  displayMode: string;
  stateType: string;
  content: unknown;
  startedAtMs: number | null;
  durationMs: number | null;
  status: "streaming" | "completed" | "failed";
};
```

聊天窗口只从 `BuddyPublicOutputMessage` 渲染消息，不再从 `resolveBuddyReplyFromRunEvent` 这类状态名候选函数直接取回复。

## UI 设计

### Buddy 聊天窗口

聊天消息流包含：

- 用户消息。
- 父图公开 output 消息。
- 暂停/审批卡片。
- 错误卡片。

聊天消息流不包含：

- 运行过程胶囊。
- 中间节点输出。
- 活动日志。
- 子图内部 output。
- 未被父图 output 导出的 state。

每条 output 消息显示自己的耗时。文本气泡可在顶部或底部显示小型耗时标记；结构化结果卡片在卡片头部显示耗时。

### 画布节点时长胶囊

节点卡片左上角显示小型悬浮胶囊：

- 位置：节点卡片左上角，贴近卡片外沿或内沿，不能遮挡端口和标题编辑控件。
- 内容：计时语义 icon + 格式化时间，例如 `Clock 8.9s`。
- 状态：
  - running: 动态计时，使用运行中视觉状态。
  - success: 固定最终耗时，使用成功状态。
  - failed: 固定失败前耗时，使用失败状态。
  - paused: 固定或动态显示暂停前耗时，使用暂停状态。
- 未参与本轮运行的节点不显示胶囊。

节点胶囊和已有节点运行高亮共存：高亮表达状态，胶囊表达耗时。

## 模板影响

Buddy 模板需要把用户可见回复显式接到父图 output 节点：

- 简单回复可以只导出一个 `final_reply` 或等价 state。
- 需要先显示即时回复、再显示最终结果时，父图应有两个 output 节点分别导出两个 state。
- 结构化结果若要出现在聊天窗口，必须由父图 output 节点导出对应 state。
- 子图内部的输出节点只负责把子图结果回传给父图，不直接进入聊天。

因此，Buddy 模板不再要求前端识别固定回复状态名；是否展示由父图 output 节点决定。

## 边界情况

- 父图 output 节点没有读取 state：视为无效公开输出，聊天窗口忽略，并在模板校验中提示。
- 父图 output 节点读取多个 state：违反协议，模板校验应报错或至少警告。
- 父图 output 节点无直接上游边：仍可在 state 到达时展示，但 output 耗时从首个可显示事件开始计时。
- 上游节点失败且 state 未产生：不创建 output 消息；运行详情保留失败信息。
- output 已开始流式但上游失败：将对应 output 消息标记为失败，保留已生成内容和耗时。
- 运行被取消：已创建 output 消息标记为失败或取消，保留耗时；未创建的 output 不展示。
- 恢复暂停运行：保留已有 output 消息位置；继续按同一个 output identity 更新。

## 迁移策略

第一阶段应优先完成协议切换和 UI 收敛：

- 从 Buddy 聊天窗口移除运行过程胶囊。
- 建立父图 output 索引。
- 让 Buddy 聊天只消费父图 output 消息。
- 画布节点显示节点时长胶囊。

第二阶段再把事件层收敛为后端明确的 `public_output.*` 事件，减少前端推导。

第三阶段整理官方 Buddy 模板：

- 确保所有用户可见内容都由父图 output 节点导出。
- 移除依赖 Buddy 专用状态名的前端逻辑。
- 保留运行详情作为调试和审计入口。

## 验证要求

单元测试：

- 父图 output 索引只扫描 root-level output，不扫描子图 output。
- 一个 output 节点读取一个 state 时能创建公开输出绑定。
- 多 output 按实际首次内容到达顺序排序。
- 中间 LLM 节点 delta 不会直接创建 Buddy 聊天消息。
- 子图内部 output 不会创建 Buddy 聊天消息。
- `json/result_package/file` 渲染为结果卡片，`markdown/text` 渲染为文本气泡。
- 节点时长从 run event 或 run detail 中正确解析。

集成测试：

- Buddy 简单问候只显示父图 output 文本，不显示 `request_understanding`。
- 一个模板产生两个父图 output 时，聊天窗口显示两条独立消息。
- output 耗时从上游节点开始，到对应 state 完成时停止。
- 运行失败时，画布节点胶囊显示失败耗时，聊天窗口不泄漏运行日志。

视觉验证：

- 画布节点左上角耗时胶囊不遮挡端口、标题、描述和常用操作。
- Buddy 聊天窗口在窄宽度下文本气泡、结果卡片、耗时标记不重叠。

