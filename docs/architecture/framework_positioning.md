# GraphiteUI Framework Positioning

## 1. 文档目的

本文档用于回答一个关键问题：

**GraphiteUI 现在是不是只服务于当前 demo，还是可以继续延伸成一个通用 agent framework？**

结论先行：

**GraphiteUI 应该被定位为一个可扩展的 agent workflow framework，而 `creative factory` 只是当前第一套正式模板。**

也就是说：

- GraphiteUI 不是为某个 demo 单独定制的壳
- GraphiteUI 也不是一个纯粹的画布工具
- GraphiteUI 的目标是成为一个面向复杂 agent/workflow 的可视化编排与运行框架
- 当前 demo 负责校准方向、验证能力、提供第一批标准节点与模板

---

## 2. 一句话定位

**GraphiteUI = 面向状态驱动工作流的可视化 Agent Framework。**

它的核心价值不是“替代脚本”，而是把复杂任务从：

- 黑盒 Python
- 单点工具调用
- 难以复用的业务流水线

变成：

- 可编排
- 可配置
- 可执行
- 可观测
- 可复用

的标准化工作流系统。

---

## 3. 为什么它不该被限制在 demo 上

当前 demo 的价值很大，但它更适合扮演下面三个角色：

1. **能力验证样板**
- 用来验证编辑器、运行时、状态模型、节点体系是否足够支撑复杂任务

2. **首个正式模板**
- 作为 `Creative Factory` 模板沉淀下来
- 以后可以继续派生 `SLG Launch`、`RPG Fantasy`、`Survival Chaos` 等主题预设

3. **领域对齐参考**
- 用来帮助我们判断哪些抽象足够通用
- 哪些仍然只是特定业务的局部策略

补充边界：

- `demo/slg_langgraph_single_file_modified_v2.py` 应继续保留在仓库中
- 它应作为独立可运行的单文件参考实现
- 其他正式程序不得依赖这个单文件作为运行时模块
- 框架只能“承接它表达的能力”，不能“导入它本身来运行”

如果让系统直接等同于 demo，会产生三个问题：

- 框架层和业务层耦合
- 后续切换主题或扩展新任务时会越来越难
- 许多本来可以复用的能力会被错误地锁死在当前场景里

所以更好的做法是：

**让 demo 成为模板，不让 demo 成为框架边界。**

---

## 4. 推荐分层

GraphiteUI 后续应明确分成三层。

### 4.1 Core Layer

这一层是框架底座，不应带明显业务倾向。

职责：

- graph schema
- state schema
- node schema
- edge schema
- graph validation
- graph parsing
- workflow building
- runtime execution
- run persistence
- node handler registry
- tool registry
- editor canvas
- state panel
- run observation

这一层回答的是：

- 工作流如何被描述
- 工作流如何被执行
- 工作流如何被观察

这一层不应该回答：

- 到底是游戏广告、研究任务还是内容生成

### 4.2 Template Layer

这一层负责提供可直接使用的工作流模板。

当前模板：

- `hello_world`
- `research_pipeline`
- `content_pipeline`
- `analysis_pipeline`
- `review_pipeline`

模板应定义：

- 默认节点链
- 默认 state schema
- 默认边结构
- 默认主题配置
- 默认评审策略
- 默认产物结构

模板回答的是：

- 这类任务通常由哪些阶段组成

### 4.3 Theme / Policy Layer

这一层负责配置同一模板在不同语境下如何运行。

例如当前已经有雏形的内容：

- `theme_preset`
- `genre`
- `market`
- `platform`
- `creative_style`
- `tone`
- `evaluation_policy`
- `strategy_profile`

这一层回答的是：

- 同一条流水线，在不同主题、市场、风格下应该如何变化

这一层不应该决定：

- 是否需要一整套新的底层节点系统

---

## 5. GraphiteUI 现在处于什么阶段

当前状态更适合定义为：

**“一个已经具备 framework 雏形的标准工作流系统，正在从创意工厂模板出发往通用化延伸。”**

也就是说：

- 还不是完全成熟的通用 agent framework
- 但已经不是 demo 专用工具

当前已经具备 framework 特征的部分：

- 标准 graph 协议
- `State First` 模型
- 标准节点执行链
- `Node Handler Registry`
- `Tool Registry`
- 主题配置与主题预设
- 可视化编排器
- run detail / artifacts / state snapshot

当前仍然偏向首个模板的部分：

- 默认节点命名仍偏 `creative factory`
- 默认 state key 仍偏创意生产链
- 默认工具仍偏创意分析与生成
- editor 的默认心智仍围绕当前模板

这很正常，因为当前系统仍在用第一个模板校准框架抽象。

---

## 6. 如何判断某个能力属于框架，还是属于模板

这是后续开发里最重要的判断标准之一。

### 属于框架 Core 的典型特征

- 多个模板都需要
- 不依赖某个具体业务名词
- 更关注“执行机制”而不是“业务结果”

例子：

- `start`
- `end`
- `condition`
- `tool`
- `transform`
- state schema
- edge flow keys
- node reads / writes
- runtime executor
- run persistence

### 属于模板的典型特征

- 只对某一类任务有意义
- 节点名称本身带明显业务语义
- 产物结构明显服务于某个领域

例子：

- `build_brief`
- `generate_storyboards`
- `prepare_image_todo`
- `prepare_video_todo`
- `creative_brief`
- `storyboard_packages`
- `video_prompt_packages`

### 属于主题 / 策略层的典型特征

- 不改变主工作流阶段
- 只改变表达方式、风格、参数和评审偏好

例子：

- `SLG`
- `RPG`
- `Survival`
- `market=JP`
- `platform=tiktok`
- `hook_theme`
- `payoff_theme`
- `evaluation_focus`

---

## 7. 推荐的长期产品结构

长期看，GraphiteUI 最合理的产品结构应该是：

### 7.1 Framework Core

面向所有工作流共享：

- graph editor
- runtime
- state binding
- node registry
- tool registry
- run observation

### 7.2 Official Templates

官方模板库：

- Creative Factory
- Research Agent
- Content Ops
- Asset Review

### 7.3 Theme Packs / Policies

面向模板的主题预设：

- SLG Launch
- RPG Fantasy
- Survival Chaos
- B2B SaaS Explainer
- Education Shorts

### 7.4 Project Instances

用户自己的具体图：

- 在模板上二次调整节点顺序
- 改主题
- 改节点参数
- 改状态结构
- 插入或替换节点

这样系统的扩展路径就很清楚：

- 新行业不一定要重写框架
- 新业务不一定要新建仓库
- 很多时候只需要新增模板或新增策略包

---

## 8. 当前 demo 在这个结构中的正确位置

当前 demo 最合适的位置是：

### 不属于 Core

它不应该定义框架边界。

它也不应该成为：

- runtime 的依赖模块
- editor 的隐藏模板来源
- tool registry 的导入入口

### 属于 Template

它应该沉淀成：

- `hello_world` 模板

**注**：`creative_factory` 和 `themeConfig` 已在 2026-04-12 的清理中被移除，主题预设系统也随之删除。未来模板扩展请参考 `backend/app/templates/hello_world/` 的结构。

---

## 9. 后续抽象方向

如果目标是让 GraphiteUI 真正成长为通用 agent framework，后面应继续做下面这些抽象。

### 9.1 区分 Core Nodes 和 Template Nodes

建议长期分成两层节点体系：

Core Nodes：

- `start`
- `end`
- `condition`
- `tool`
- `transform`
- `review`
- `generate`
- `analyze`
- `fetch`

Template Nodes：

- `build_brief`
- `generate_storyboards`
- `prepare_image_todo`
- `prepare_video_todo`

这样可以逐步把更多模板节点回收成通用节点。

### 9.2 区分 System State 和 Template State

建议长期把 state 分成两类：

System State：

- `run_id`
- `graph_id`
- `status`
- `current_node_id`
- `revision_round`
- `warnings`
- `errors`

Template State：

- `creative_brief`
- `script_variants`
- `storyboard_packages`
- `video_prompt_packages`

这样框架不会被某个模板的产物结构绑死。

### 9.3 模板加载能力一等公民化

后续应该支持：

- 从模板创建新图
- 替换当前图使用的模板
- 模板升级提示
- 模板版本管理

### 9.4 主题策略编辑器

当前 `theme_preset` 已经开始驱动：

- 节点默认参数
- brief 策略
- variants 风格
- review 重点

后续应进一步提供：

- 可视化策略字段编辑器
- preset 复制
- preset 对比
- policy 覆盖关系展示

---

## 10. 当前最重要的边界约束

为了避免系统再次滑回“只服务 demo”的方向，后续开发建议坚持这几条约束：

1. 新增业务能力时，先判断它是 Core、Template 还是 Theme。
2. 不把具体题材名写进底层节点名。
3. 不把某个主题下的默认策略直接写死成框架行为。
4. 优先让 demo 成为模板输入，而不是框架定义本身。
5. 所有“通用化”工作都优先沉淀到 schema、registry、state、template 机制，而不是单次脚本逻辑。

---

## 11. 最终定位结论

GraphiteUI 后续应明确定位为：

**一个可视化、状态驱动、可扩展的 Agent Workflow Framework。**

当前 demo 的正确角色是：

**GraphiteUI 的首个正式模板与能力校准样板。**

所以答案是：

- 它应该能够承接你的 demo
- 但不应该被你的 demo 限定
- 后续所有架构决策都应优先服务“框架 + 模板 + 主题”三层结构

这会让 GraphiteUI 的上限明显更高，也更适合作为你后面继续扩其他复杂 agent/workflow 场景的长期底座。
