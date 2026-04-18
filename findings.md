# Findings

## Source of Truth

- 旧 React 前端提交 `87d3d6e` 仍然是当前 Vue 迁移的产品行为参考。
- 旧 React 的 `frontend/components/editor/node-system-editor.tsx` 已经不在当前工作树里；后续对照编辑器本体时，需要直接从 `87d3d6e` 提交内容里读取，而不是在现分支文件系统里查找。
- 真正复杂的编辑器逻辑不只在工作区壳层，很多关键行为深埋在：
  - `frontend/components/editor/node-system-editor.tsx`

## Workspace / Welcome Findings

- `/editor` 必须是欢迎页 / 工作区入口，不能自动进入图。
- `/editor/new` 和 `/editor/:graphId` 才是真正的编辑态路由。
- 关闭最后一个标签页要回到欢迎页，这条逻辑是旧前端的核心心智。

## Editor Body Findings

- 旧前端的 `State` 面板不是简单状态浏览器，而是图内语义面板：
  - state 名称 / 类型 / 默认值
  - reader / writer 列表
  - reader / writer 的新增与移除
  - 绑定节点聚焦
- 旧前端的默认值编辑器是按 state 类型分流的：
  - `boolean` 用开关
  - `number` 用数字输入
  - `object / array / json / file_list` 用 JSON editor + Apply
  - 其他文本类用 textarea
- 在当前 Vue 协议下，reader / writer 绑定不再选择“端口 key”，而是直接选择目标节点：
  - `agent / condition / output` 可作为 reader
  - `input / agent` 可作为 writer
  - `output` 的 reader 采用单值替换
  - `input` 的 writer 采用单值替换
- 旧前端的聚焦行为不是简单“选中节点”，而是：
  - 选中目标节点
  - 以节点几何中心重新计算视口
  - 保持一个最低缩放阈值，避免聚焦后画布过远
- 旧前端 `StatePanel` 消费的是来自编辑器本体的 `selectedNodeId`；因此 Vue 版不能只保留“面板驱动画布”的单向 focus，还需要让画布里的节点点击反向同步回 `State` 面板高亮态。
- 旧前端的 reader / writer 绑定卡片会展示节点 family 和端口语义，聚焦后的项会有选中态；Vue 版现在也开始恢复这层表达。
- 旧前端 `PortRow`、`BranchRow`、`StatePanel` 都与 `node-system-editor.tsx` 内部状态流强耦合。
- 当前 Vue 版 `NodeCard` 现在已经能直接表达 `Reads / Writes` state 摘要，但这仍然只是“关系展示层”，不等于旧前端编辑器本体已经恢复。
- 旧前端 output 节点除了展示 preview，还带有可直接操作的内部编辑 chrome：
  - toolbar 上的 persist toggle
  - `Advanced` 里的 display mode 切换
  - `Advanced` 里的 persist format 切换
  - `Advanced` 里的 fileNameTemplate 输入
- 旧前端 output 节点对 `markdown` display mode 使用 `MD` 简写，而不是直接显示 `MARKDOWN`；Vue 版现在也应沿用这个标签语义。
- 旧前端 output 节点对 persist format 同样使用 `AUTO / TXT / MD / JSON` 这组简写；Vue 版现在也应沿用。
- 旧前端 agent 节点的主文本编辑面是 `taskInstruction`，不是只读占位内容；Vue 版接回内联编辑时应直接暴露真实字符串，避免 placeholder 抢占语义。
- 旧前端 agent 节点的 `Advanced` 至少包含：
  - `temperature` 数字输入
  - 温度会按 `0 - 2` 区间 clamp
  - 无效值回退到默认 `0.2`
- 旧前端 condition 节点的 `loopLimit` 不是任意数字输入：
  - trim 后为空则回退
  - 非有限数字则回退
  - 会先 `Math.trunc`
  - `-1` 表示 unlimited
  - 其余只接受正整数
  - blur 和 Enter 都会触发提交
- 旧前端 condition 节点除了 loop limit，还有一块独立的规则编辑卡：
  - `Source` 使用下拉
  - `Operator` 使用下拉
  - `Value` 使用输入框
  - 当 operator 为 `exists` 时，`Value` 输入会被禁用
  - 若当前 `rule.source` 已失效，会回退到第一个可用 source
- 旧前端 condition 节点的 branch 不是只读摘要，而是 `BranchRow` 级别的可编辑结构：
  - 可直接编辑 branch key
  - 可直接编辑映射到该 branch 的 match keys
  - branch 改名后，路由边 source handle 语义也要跟着更新
- 旧前端 condition 节点还有明确的 `Add branch` 入口：
  - 会通过 `createConditionBranchKey` 生成 `branch_2`、`branch_3` 这类不冲突 key
  - 新 branch 会先追加到 `node.config.branches`
  - 这说明 Vue 版下一步优先补 `Add branch` 是有直接代码依据的
- 旧 React 当前可直接对照到的 `BranchRow` 只覆盖编辑，不包含独立删除按钮：
  - 因此“删除 branch”不能凭空猜测 UI 和数据收缩策略
  - 如果要补删除，必须先核对 route / mapping 的收口规则
- condition branch 的真实更新范围不是只有 `node.config.branches`：
  - `node.config.branches`
  - `node.config.branchMapping`
  - `conditional_edges[].branches`
  这三者必须一起同步，才能保持节点 UI、branch mapping 摘要和 route edge 投影一致
- 旧前端 `node-system-condition-branch-mapping.ts` 已经把 branch mapping 输入语义收口成可迁移 helper：
  - 草稿是逗号分隔 token
  - token 会 trim
  - 重复 token 会去重
  - 应用 mapping 时，只重写当前 branch / 目标 branch 相关项，其余 branch mapping 保持不动
- 旧前端 input 节点的主体编辑区按值类型分流：
  - `text / json` 用 textarea 直接改值
  - `knowledge_base` 用下拉
  - file / image / audio / video 走上传预览流
  - 因此当前 Vue 版先恢复“文本值直改”是安全的第一步，但不能把它误当成整套 input 交互都迁完

## UI Direction Findings

- 用户迁移前端的根因不是单纯想换 Vue，而是旧 React 编辑器在图编辑器本体层已经难以继续维护。
- 因此 Vue 迁移不能重写产品逻辑，只能重写实现方式。
- 组件库的合适边界：
  - 画布 / 节点 / 连线：继续自定义
  - 工作区 chrome / 面板 / 下拉 / 弹窗：可用 `Reka UI` / `shadcn-vue` 路线

## Current Migration Reality

- Vue 基础骨架、欢迎页、工作区、tabs、关闭确认框已经明显恢复。
- 当前最主要未完成项已经从“外围结构”转移到“编辑器本体”和“状态语义”。
- 旧 React 前端的 `collectProjectedDataRelations` 逻辑已经迁入 Vue：数据流边不再依赖手工边存储，而是根据控制流可达性和 state 的唯一最近 writer 自动投影；多 writer 歧义场景保持跳过，避免画出错误数据来源。
- `NodeCard` 当前已迁回的旧前端结构语义包括：端口 type 标签、required 输入标记、condition branch match values、output persist 文案，以及 agent skill 数量摘要。
- `NodeCard` 现在已把一批旧前端内部编辑控件接回文档更新链路：output 的 display mode / persist toggle / persist format / fileNameTemplate、agent 的 taskInstruction 与 `Advanced` 第一版（thinking / temperature）、condition 的 loopLimit 与 `Source / Operator / Value` 规则编辑，以及 input 的文本值第一版编辑都不再只是展示。
- 当前 Vue 版已经把 condition 的 `BranchRow` 第一版也接回：
  - branch key 可编辑
  - mapping keys 可编辑
  - 图文档更新会同步 `conditional_edges`
  - 这意味着 condition 节点已经从“只有规则可改”推进到“规则与分支本体都可改”的下一层
- 当前 Vue 版已经把旧前端明确存在的 `Add branch` 入口也接回：
  - 新 branch key 复用旧 React 的 `createConditionBranchKey`
  - 通过文档 helper 追加到 `node.config.branches`
  - 画布锚点与分支编辑行会随 branch 列表一起刷新
- 旧 React 当前没有现成的 `removeConditionBranch` helper；因此 Vue 版删除语义需要保守落地：
  - 删除 branch 时同步清理 `branches`
  - 同步移除指向该 branch 的 `branchMapping`
  - 同步移除对应的 `conditional_edges` route 分支
  - 若删除后该 source 的 route 分支为空，则整条 `conditional_edges` 记录一起移除
  - 不允许删到只剩最后一个 branch，避免 condition 节点落到无分支状态
- 当前 Vue 版已经把 condition branch 删除第一版接回：
  - 每条 branch 行都有 `Remove`
  - 删除会同步清理 `branchMapping` 与 `conditional_edges`
  - 删除后若 route source 已空，会把空的 `conditional_edges` 记录一并裁掉
- 当前 Vue 版也把 condition route chrome 往前推进了一小步：
  - branch 行会显示当前 route target
  - 未连 route 的 branch 会显示 `Unrouted`
- 旧 React 的 route edge 不是简单折线，而是：
  - 使用 `resolveRouteEdgeSourceOffset` 做 branch lane spacing
  - 使用共享 lane 规则决定中间横向通道
  - 使用 rounded orthogonal path，而不是生硬折角
- 当前 Vue 版已经把这套 route-edge-path 几何也开始迁回：
  - 新增独立的 `routeEdgePath` helper
  - route edge path 改为 rounded orthogonal 几何
  - branch offset 语义与旧 React 的 `28 + index * 18` 对齐
- condition 分支的下一块续做切片不再是“先补 Add branch / 删除语义”，而是：
  - 继续把 route chrome 呈现往旧前端继续收满
  - 再评估是否切向 input 上传流或 agent 更深层高级配置
- 结合当前 plan / backlog / progress 重新评估后，最适合继续推进的迁移切片排序是：
  - 第一优先级：condition branch 删除语义与 route chrome 收口
  - 第二优先级：input 节点剩余类型切换与上传流
  - 第三优先级：agent 节点更深层高级配置
  推荐先走第一条，因为它与当前未完成链路最连续，且旧 React 对照依据最明确
