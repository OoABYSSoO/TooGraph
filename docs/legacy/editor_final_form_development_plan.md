# GraphiteUI Editor Final-Form Development Plan

## 1. 文档目的

本文档定义 **GraphiteUI 编辑器的最终目标形态**，用于指导后续架构升级与功能开发。

这份文档不再局限于当前第一阶段的最小闭环，而是直接面向以下目标：

- 让编辑器能够通过可视化编排完成 [slg_langgraph_single_file_modified_v2.py](/home/abyss/GraphiteUI/demo/slg_langgraph_single_file_modified_v2.py) 的核心任务
- 让同一套编排能力不被 `SLG` 限定，而是可以通过配置切换主题、题材和输出风格
- 让用户能够在编辑器中方便地调整节点运行顺序、插入新节点、替换节点实现，而不需要手改 Python
- 让节点、状态、条件分支、产物沉淀都成为编辑器的一等公民

本文档是产品定义、交互模型、数据协议和开发计划的组合文档。

---

## 1.1 当前实现状态

截至当前版本，以下最终形态能力已经落地：

- 标准 graph 协议
- `theme_config`
- `state_schema`
- 节点 `reads / writes / params`
- 边的 `flow_keys / edge_kind / branch_label`
- `Condition Node`
- `State Panel`
- 自定义节点卡片
- 左入右出节点交互
- creative factory 标准模板
- 基于标准节点链的 runtime 执行

当前仍在继续推进的部分：

- 更强的边 bus 表达
- `Start / End` 语义深化
- Handler Registry / Tool Registry 正式拆分
- 模板与主题系统继续抽象
- 顺序调整与插入体验继续增强

---

## 2. 目标问题

当前系统已经具备基础可视化编排能力，但距离真正适合复杂 LangGraph 工作流的编辑器还有明显差距。

主要问题：

- 当前节点配置更偏“参数填写”，还不是“状态输入/输出编排”
- 当前编辑器对 `state` 的表达过弱，用户难以看出数据如何流动
- 当前 `skill_executor` 是过渡方案，很多本该是工作流节点的能力暂时被塞进了技能列表
- 当前图模型主要强调执行顺序，尚未把“状态演化”表达清楚
- 当前模板能力不足，难以把复杂 demo 任务直接沉淀成可重复编排的工作流模板

---

## 3. 最终产品目标

GraphiteUI 编辑器的最终目标不是“做一个通用画布”，而是：

**做一个面向 LangGraph 的状态驱动工作流编排器。**

这个编排器应满足：

1. 用户编排的是“节点如何消费 state、生成 state、路由 state”
2. 用户能清楚看见工作流的执行顺序和主要数据流
3. 用户可以通过模板快速搭建复杂流水线
4. 用户可以通过主题配置把同一条流水线切换到不同业务场景
5. 用户可以通过调整节点顺序、节点配置和路由逻辑改变工作流行为

---

## 4. 用 `SLG Creative Factory` 校准目标

当前 demo 文件本质上是一条典型的“研究 -> 分析 -> 生成 -> 评审 -> TODO 导出”流水线。

它不应该被理解为一堆独立 skill，而应该被理解为一组 **可编排节点**：

- 输入任务
- 市场研究
- 素材抓取
- 素材规范化
- 素材筛选
- 素材分析
- 模式提取
- Brief 生成
- 创意版本生成
- Storyboard 生成
- 视频提示词生成
- 版本评审
- 图片 TODO 生成
- 视频 TODO 生成
- Finalize

`SLG` 本身不是节点类型，也不是 skill 名字的主语。

`SLG` 更适合落在以下配置中：

- `theme`
- `genre`
- `market`
- `platform`
- `creative_style`
- `language_constraints`
- `evaluation_policy`

所以最终系统应该做到：

- 同一条流水线可以跑 `SLG`
- 也可以切换成 `RPG`
- 也可以切换成 `Survival`
- 或者切换成非游戏类的短视频创意工厂

---

## 5. 核心设计原则

### 5.1 Node First，不是 Skill First

编辑器中一等公民应是 **节点**，不是 skill。

节点回答的是：

- 这一阶段在做什么
- 它读哪些状态
- 它写哪些状态
- 它之后走向哪里

skill / tool 更适合成为节点的内部执行依赖。

### 5.2 State First，不是 Form First

节点配置面板不能只是一堆表单项。

它必须围绕三个问题展开：

- 输入来自哪些 state 项
- 输出写入哪些 state 项
- 节点内部策略参数是什么

### 5.3 Template First，不是 Hardcode First

复杂工作流要优先沉淀为模板。

模板应包含：

- 默认节点序列
- 默认 state schema
- 默认主题配置
- 默认评审策略
- 默认产物结构

### 5.4 Configurable Domain，不是固定业务实现

系统需要支持：

- 主题切换
- 输出风格切换
- 目标市场切换
- 素材来源切换
- 评审标准切换

这些都应该通过配置完成，而不是复制出一套新的工作流代码。

---

## 6. 编辑器最终交互模型

## 6.1 页面布局

编辑器从当前四区布局升级为五区布局：

1. 左侧上半区：`State Panel`
2. 左侧下半区：`Node Palette / Templates`
3. 中间：`Graph Canvas`
4. 右侧：`Node Config Panel`
5. 顶部：`Toolbar / Theme Config / Run Controls`

---

## 6.2 State Panel

`State Panel` 是最终形态的关键能力。

### 目标

让用户可以显式管理工作流共享状态，而不是只在节点里隐式读写。

### 必须支持

- 查看全局 state 字段列表
- 新增 state 字段
- 删除未使用字段
- 修改字段名、说明、类型、示例值
- 查看字段由哪些节点写入
- 查看字段被哪些节点消费
- 标记字段角色

### 字段角色建议

- `input`
- `intermediate`
- `decision`
- `artifact`
- `final`

### 字段类型建议

- `string`
- `number`
- `boolean`
- `object`
- `array`
- `markdown`
- `json`
- `file_list`

### 字段元数据建议

```json
{
  "key": "creative_brief",
  "type": "markdown",
  "role": "artifact",
  "title": "Creative Brief",
  "description": "Brief generated from patterns and market context",
  "source_nodes": ["build_brief"],
  "target_nodes": ["generate_variants", "review_variants"]
}
```

---

## 6.3 Canvas 语义

画布中的边不应只表示“顺序”。

最终定义：

**GraphiteUI 中的边表示节点之间的执行流转，同时携带一组主要 state keys。**

也就是说，一条边同时表达：

- 谁在谁后面执行
- 这一跳主要带着哪些状态项

### 视觉建议

- 边主体：表示执行流
- 边标签 / 边气泡：表示主要携带的 state keys
- 当 key 很多时：聚合成 bus / bundle 展示

### 为什么这样定义

- 纯顺序线信息不够
- 纯数据线难以看清流程
- 二者绑定更符合 LangGraph 的实际心智

---

## 6.4 Start / End 语义

### Start

`Start` 不是普通节点，它代表工作流初始上下文入口。

职责：

- 输出初始 state keys
- 连接到第一个执行节点
- 显示当前工作流的起始输入集合

### End

`End` 不是普通节点，它代表最终结果收束点。

职责：

- 接收最终结果字段
- 显示最终 artifact 汇总
- 定义哪些输出被视为工作流正式产物

---

## 6.5 Node I/O 结构

所有节点统一使用：

- 左侧输入区
- 右侧输出区

节点必须显式声明：

- `reads`: 消费哪些 state keys
- `writes`: 产出哪些 state keys

### 例子

`Build Brief` 节点：

- `reads`: `pattern_summary`, `news_context`, `theme_config`
- `writes`: `creative_brief`

`Review Variants` 节点：

- `reads`: `creative_brief`, `script_variants`, `storyboard_packages`, `video_prompt_packages`
- `writes`: `review_results`, `best_variant`, `revision_feedback`, `evaluation_result`

---

## 6.6 Condition Node

条件边不再是“特殊边”，而应升级为 `Condition Node`。

### 原因

- 让图模型更统一
- 减少“特殊规则边”的理解成本
- 更适合在画布上表达 `pass / revise / fail`

### Condition Node 特征

- 一个输入
- 多个输出口
- 每个输出口对应一个条件结果

### 例子

`Condition Node`

- 输入：`evaluation_result`
- 输出：
  - `pass`
  - `revise`
  - `fail`

---

## 6.7 Node Config Panel

节点配置面板升级为三段式：

1. `Inputs`
2. `Outputs`
3. `Params`

### Inputs

- 选择该节点从哪些 state 字段读取
- 可新增尚未存在的 state 字段
- 新增后自动同步到全局 `State Panel`

### Outputs

- 定义该节点产出哪些 state 字段
- 可新增字段
- 自动同步到全局 state 定义

### Params

- 存放节点内部策略参数
- 例如：
  - `top_n`
  - `theme`
  - `prompt_style`
  - `score_threshold`
  - `language_constraint`

---

## 7. 节点模型重构方案

## 7.1 当前过渡节点

当前系统里很多复杂业务能力被塞进了 `skill_executor`。

这是为了快速打通链路的过渡方案，不应作为最终形态保留。

---

## 7.2 最终正式节点类型

建议将编辑器节点类型重构为两层：

### 通用工作流节点

- `start`
- `end`
- `research`
- `collect_assets`
- `normalize_assets`
- `select_assets`
- `analyze_assets`
- `extract_patterns`
- `build_brief`
- `generate_variants`
- `generate_storyboards`
- `generate_video_prompts`
- `review_variants`
- `prepare_image_todo`
- `prepare_video_todo`
- `condition`
- `finalize`

### 基础系统节点

- `knowledge`
- `memory`
- `planner`
- `evaluator`
- `tool`
- `transform`

### 不建议继续作为最终一等节点的类型

- `skill_executor`

它可以在过渡期保留，但最终应被更明确的工作流节点替代。

---

## 7.3 节点定义建议

每个节点都应包含：

```json
{
  "id": "build_brief_1",
  "type": "build_brief",
  "label": "Build Brief",
  "position": { "x": 860, "y": 220 },
  "reads": ["pattern_summary", "news_context", "theme_config"],
  "writes": ["creative_brief"],
  "params": {
    "brief_style": "performance_creative",
    "language": "zh"
  },
  "implementation": {
    "executor": "node_handler",
    "handler_key": "build_brief"
  }
}
```

---

## 8. Skill / Tool 的最终定位

## 8.1 Skill 不应该等于工作流步骤

以下内容更适合作为 **节点内部依赖**，不是画布主节点：

- RSS 抓取器
- Facebook / Ad Library 抓取器
- LLM 文本生成器
- 视频理解器
- JSON 结构抽取器
- 文件写入器
- 评分助手
- 提示词模板渲染器

---

## 8.2 Skill 的职责

Skill 应负责：

- 节点内部可复用实现
- 与外部系统或本地资源交互
- 提供稳定、可测试的原子能力

### 例子

- `rss_fetcher`
- `ad_library_fetcher`
- `video_understanding`
- `text_generation`
- `json_normalizer`
- `artifact_writer`
- `score_calculator`

---

## 8.3 Theme / Domain 的职责

主题和题材不应该写死在 skill 名字中。

正确落点应是工作流配置：

```json
{
  "theme": {
    "domain": "game_ads",
    "genre": "SLG",
    "market": "US",
    "creative_style": "high_pressure_growth_loop",
    "ui_language": "en_only"
  }
}
```

这意味着：

- 同一个 `generate_variants` 节点
- 在 `SLG` 配置下生成 SLG 版本
- 在 `RPG` 配置下生成 RPG 版本
- 在其他主题下生成其他风格

---

## 9. 模板系统设计

## 9.1 模板的地位

复杂场景应优先以模板交付，而不是让用户从零拼图。

模板包含：

- graph 结构
- state schema
- 默认 theme config
- 默认节点参数
- 默认条件路由

---

## 9.2 当前必须支持的模板

### Template A: Minimal Workflow

用于基础验证：

- Start
- Planner
- Evaluator / Condition
- Finalize

### Template B: Creative Factory

用于承载 demo 核心能力：

- Start
- Research
- Collect Assets
- Normalize Assets
- Select Assets
- Analyze Assets
- Extract Patterns
- Build Brief
- Generate Variants
- Generate Storyboards
- Generate Video Prompts
- Review Variants
- Condition
- Prepare Image TODO
- Prepare Video TODO
- Finalize

### Template C: Theme Variants

同一条 Creative Factory 模板，支持：

- `SLG`
- `RPG`
- `Survival`
- `Strategy`

通过切换 theme config 实现。

---

## 9.3 模板切换体验

用户应可以在 Workspace 或 Editor 中：

- 新建 graph
- 从模板创建
- 选择主题
- 自动加载默认 state、节点和配置

---

## 10. 通过配置改变主题的方案

## 10.1 Theme Config

编辑器顶部应增加 `Theme Config` 面板。

### 建议字段

- `domain`
- `genre`
- `market`
- `language`
- `creative_style`
- `tone`
- `asset_source_policy`
- `evaluation_policy`

---

## 10.2 Theme Config 对节点的影响

Theme config 改变后，应影响：

- brief 生成内容
- variant 生成策略
- storyboard 风格
- video prompt 风格
- 评分标准
- TODO 输出格式

节点本身不改代码，只读配置。

---

## 10.3 Theme Config 传播方式

建议把 `theme_config` 本身作为一个全局 state 字段：

- Start 输出 `theme_config`
- 后续生成类节点直接读取它

这样系统更统一。

---

## 11. 调整节点运行顺序的方案

## 11.1 顺序调整目标

用户需要能够：

- 拖动节点改变流程顺序
- 插入中间节点
- 删除某一阶段节点
- 替换某个阶段实现
- 调整条件路由

---

## 11.2 约束规则

顺序可调整，但不能完全无约束。

应建立三类约束：

### 结构约束

- 必须有 Start
- 必须有 End
- Condition Node 必须有至少两个输出

### 状态约束

- 节点读取的 state 必须已被上游定义或由 Start 提供
- 节点写出的 state 不能与系统保留字段冲突

### 业务约束

- `review_variants` 之前必须存在 `generate_variants`
- `prepare_video_todo` 之前必须存在 `generate_video_prompts`

---

## 11.3 编译器职责升级

后端编译器不再只验证节点和边结构。

还需要验证：

- state 依赖是否闭合
- 节点顺序是否满足读写依赖
- 条件分支是否完整
- 最终输出是否存在

---

## 12. 目标数据协议

## 12.1 Graph 顶层协议

```json
{
  "graph_id": "graph_xxx",
  "name": "Creative Factory",
  "template_id": "creative_factory",
  "theme_config": {},
  "state_schema": [],
  "nodes": [],
  "edges": [],
  "metadata": {}
}
```

---

## 12.2 State Schema 协议

```json
[
  {
    "key": "creative_brief",
    "type": "markdown",
    "role": "artifact",
    "title": "Creative Brief",
    "description": "Brief generated for downstream creative generation"
  }
]
```

---

## 12.3 Edge 协议

```json
{
  "id": "edge_a_b",
  "source": "analyze_assets_1",
  "target": "build_brief_1",
  "flow_keys": ["pattern_summary", "news_context"],
  "edge_kind": "normal"
}
```

Condition Node 的输出仍用边表达，但不再依赖特殊条件边作为主模型：

```json
{
  "id": "edge_condition_pass",
  "source": "condition_1",
  "target": "prepare_image_todo_1",
  "flow_keys": ["best_variant", "evaluation_result"],
  "edge_kind": "branch",
  "branch_label": "pass"
}
```

---

## 13. 后端最终目标结构

## 13.1 Compiler

编译器需要从“普通 graph 转 LangGraph”升级为“状态依赖图转 LangGraph”。

职责：

- 校验 state schema
- 校验节点读写关系
- 基于节点类型选择 handler
- 基于 edge 生成执行拓扑
- 为 Condition Node 生成条件路由

---

## 13.2 Runtime

运行时需要支持：

- 节点按 read/write schema 读写 state
- 节点 handler 与 tool/skill 解耦
- 记录完整 state snapshot
- 记录每节点输入输出
- 支持模板级 theme config 注入

---

## 13.3 Persistence

最终建议使用 SQLite 或更清晰的结构化存储，至少保存：

- graph
- state schema
- theme config
- runs
- node executions
- artifacts
- memories
- template definitions

---

## 14. 前端最终目标结构

## 14.1 新组件建议

- `StatePanel`
- `ThemeConfigPanel`
- `TemplatePicker`
- `NodePortsPanel`
- `ConditionNodeEditor`
- `EdgeFlowInspector`
- `ArtifactSchemaViewer`

---

## 14.2 关键交互

- 点击节点：编辑 `reads / writes / params`
- 点击边：查看 `flow_keys`
- 点击 state 字段：查看来源与去向
- 切换模板：重建 graph 和 state schema
- 切换主题：批量影响生成类节点参数

---

## 15. 开发阶段拆分

## Phase 1: 数据模型升级

目标：

- 为 graph 增加 `state_schema`
- 为节点增加 `reads / writes / params`
- 为边增加 `flow_keys`
- 增加 `template_id` 和 `theme_config`

产出：

- 新版 graph schema
- 兼容旧协议的迁移逻辑

---

## Phase 2: 编译器升级

目标：

- 从节点类型映射到正式 handler
- 增加 state 依赖校验
- 增加 Condition Node 编译能力

产出：

- 新版 parser
- 新版 validator
- 新版 workflow builder

---

## Phase 3: 编辑器交互升级

目标：

- 加入 State Panel
- 节点左入右出
- 节点配置改成 `Inputs / Outputs / Params`
- 边支持 `flow_keys`

产出：

- 新版 canvas 节点组件
- 新版配置面板

---

## Phase 4: 模板系统

目标：

- 引入模板元数据
- 支持从模板创建 graph
- 内置 Creative Factory 模板
- 内置 Theme 预设

产出：

- 模板选择器
- 默认模板数据文件

---

## Phase 5: 节点体系重构

目标：

- 将当前 `skill_executor` 过渡节点拆成正式节点类型
- 将 skill 下沉为节点内部实现

产出：

- 正式节点 handler 注册表
- skill/tool registry 调整

---

## Phase 6: Demo 对齐与验收

目标：

- 用编排器完整表达 demo 核心任务
- 不依赖单文件 Python 主逻辑
- 只靠模板 + 配置 + 节点执行完成任务

通过标准：

- Creative Factory 模板可以跑通
- 切换 `theme.genre` 后输出方向会变化
- 调整节点顺序后 workflow 行为会跟着变化

---

## 16. 当前建议的第一实施顺序

如果立即开始执行，建议按下面顺序推进：

1. 先定义新版 graph schema
2. 再定义 `state_schema / reads / writes / flow_keys`
3. 再把 `Condition Node` 纳入模型
4. 再升级前端节点交互
5. 再把 `SLG creative factory` 从过渡 skill 链升级为正式模板节点链

---

## 17. 最终判断

GraphiteUI 的最终竞争力不在于“能拖线”，而在于：

- 它能把 LangGraph 的状态流动关系可视化
- 它能把复杂 workflow 模板化
- 它能把领域能力参数化，而不是硬编码
- 它能让用户通过配置切换主题，通过编排调整顺序，通过节点读写定义任务

这也是让编辑器真正承载 demo 任务，并进一步超越 demo 脚本的正确方向。
