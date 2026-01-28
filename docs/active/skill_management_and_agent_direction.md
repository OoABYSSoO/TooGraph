# Skill 管理与 Agent 能力方向

更新时间：2026-04-12

## 1. 这份文档解决什么问题

这份文档回答三个实际问题：

1. skill 管理页应该如何变得更清晰、更适合日常维护
2. GraphiteUI 的 skill 是否应该默认按 Claude Code 风格来管理
3. GraphiteUI 当前的 agent，和 `claude-code-source` 这种终端型 agent 平台相比，还差哪些关键能力

## 2. 当前 GraphiteUI 的真实状态

### 2.1 Skill 管理

当前 skill catalog 是“两层来源”模型：

- 已导入到 GraphiteUI 本地仓库的 skill
- 从外部目录发现、但还没导入的 skill

代码依据：

- [backend/app/skills/definitions.py](/home/abyss/GraphiteUI/backend/app/skills/definitions.py:44)
- [backend/app/api/routes_skills.py](/home/abyss/GraphiteUI/backend/app/api/routes_skills.py:15)
- [backend/app/core/storage/skill_store.py](/home/abyss/GraphiteUI/backend/app/core/storage/skill_store.py:10)

当前已接入的本地 runtime skill 只有 5 个：

- `search_knowledge_base`
- `summarize_text`
- `extract_json_fields`
- `translate_text`
- `rewrite_text`

代码依据：

- [backend/app/skills/registry.py](/home/abyss/GraphiteUI/backend/app/skills/registry.py:13)

这些 skill 的定义文件已经是 `SKILL.md + YAML frontmatter` 形式，且能声明：

- 作用描述
- 输入 schema
- 输出 schema
- 支持的 value type
- side effects

示例：

- [search_knowledge_base/SKILL.md](/home/abyss/GraphiteUI/.graphite/skills/claude_code/search_knowledge_base/SKILL.md:1)
- [extract_json_fields/SKILL.md](/home/abyss/GraphiteUI/.graphite/skills/claude_code/extract_json_fields/SKILL.md:1)

### 2.2 Agent 能力

当前 GraphiteUI agent 的能力边界很明确：

- 它是工作流里的一个 `Agent Node`
- 它可以绑定模型、thinking、temperature
- 它可以挂接本地 skill
- 它会按输入、skill 结果、output binding 生成一次本地 LLM 输出

代码依据：

- [backend/app/core/schemas/node_system.py](/home/abyss/GraphiteUI/backend/app/core/schemas/node_system.py:87)
- [backend/app/core/runtime/node_system_executor.py](/home/abyss/GraphiteUI/backend/app/core/runtime/node_system_executor.py:346)

这意味着它目前更像：

- 可视化工作流里的“单步推理节点”

而不是：

- 一个带完整工具权限、插件系统、会话系统、并行 worker 的通用软件工程 agent 平台

## 3. Skill 管理页应该怎么收口

### 3.1 信息架构目标

skill 管理页应该优先回答这四个问题：

1. 这个 skill 是已导入还是外部待导入
2. 它是做什么的
3. 它需要什么输入
4. 它会产出什么输出

不该让次要信息抢主视觉：

- compatibility 细项
- 冗余来源卡片
- 过多状态统计卡片
- 格式实现细节先于作用和 IO

### 3.2 推荐页面结构

顶部：

- 一个集中式 summary 卡片
- 只保留 `总数 / 已导入 / 外部待导入 / 可直接运行`

左侧列表：

- 搜索框
- 简易筛选器：`全部 / 已导入 / 外部待导入`
- 每个 skill 卡只显示：名称、skill key、状态、1 行描述、输入摘要、输出摘要

右侧详情：

- 标题和状态
- 作用说明
- 输入预览
- 输出预览
- 管理动作
- 完整 schema
- `Advanced` 里再放来源路径和兼容性细节

### 3.3 当前这轮页面改动的含义

本轮页面已经按上面的方向做了第一步收口：

- 左侧加了已导入 / 外部待导入筛选器
- 顶部指标改成一个集中 summary 区
- skill 列表和详情都把“作用 + 输入 + 输出”前置
- compatibility 和来源路径收进 `Advanced`

对应实现：

- [frontend/components/skills/skills-page-client.tsx](/home/abyss/GraphiteUI/frontend/components/skills/skills-page-client.tsx:1)

## 4. 是否应该默认按 Claude Code 格式管理

我的结论是：

- 应该把 Claude Code 风格设成默认目标格式
- 当前后端已经把“可导入 skill”收口到运行时支持集合，并在导入时规范化到 GraphiteUI 的 Claude Code 管理目录

### 4.1 现在已经有的基础

GraphiteUI 已经支持把 `SKILL.md` 解析成统一 catalog 结构，并且能识别：

- `claude_code`
- `openclaw`
- `codex`
- `graphite_definition`

代码依据：

- [backend/app/skills/definitions.py](/home/abyss/GraphiteUI/backend/app/skills/definitions.py:101)

### 4.2 当前已经明确的约束

当前系统并不尝试让所有外部 skill 都可导入。

当前约束是：

- 只有具备 GraphiteUI runtime adapter 的 skill 才允许导入
- 导入成功的 skill 会被规范化纳入 GraphiteUI 管理目录
- 对没有运行时适配的外部 skill，只保留“发现”能力，不进入“导入即可运行”的主链

代码依据：

- [backend/app/api/routes_skills.py](/home/abyss/GraphiteUI/backend/app/api/routes_skills.py:29)
- [backend/app/core/storage/skill_store.py](/home/abyss/GraphiteUI/backend/app/core/storage/skill_store.py:88)

所以现阶段更准确的说法是：

- 页面可以优先按 Claude 风格去展示和理解 skill
- 运行主链已经采用 Claude Code-first 的 managed store
- 外部 skill 的“被发现”与“可导入”已被明确区分

### 4.3 推荐目标

建议把 skill 管理拆成两层：

1. 外部发现层
2. Graphite 标准化层

导入时建议做一件更明确的事情：

- 把外部 skill 解析成统一中间结构
- 再写回 GraphiteUI 的标准 `SKILL.md`
- 默认落到 `skill/claude_code/<skill_key>/SKILL.md`

这样页面、运行时、校验器和后续导出器都会更简单。

## 5. `claude-code-source` 能做到什么

我检查了这个仓库的公开源码，核心结论很明确：

- 它不是单纯的 skill 仓库
- 它是完整的终端 agent 平台

外部源码入口：

- README: https://raw.githubusercontent.com/AbyssBadger0/claude-code-source/main/README.md
- package: https://raw.githubusercontent.com/AbyssBadger0/claude-code-source/main/package.json
- src 目录列表 API: https://api.github.com/repos/AbyssBadger0/claude-code-source/contents/src

从源码结构看，它至少包含这些层：

- 命令系统
- 工具系统
- skills 加载器
- plugin 系统
- coordinator / worker 模式
- tasks / remote / server / voice 等模块

参考源码：

- skills 加载：https://raw.githubusercontent.com/AbyssBadger0/claude-code-source/main/src/skills/loadSkillsDir.ts
- 工具注册：https://raw.githubusercontent.com/AbyssBadger0/claude-code-source/main/src/tools.ts
- 内建 plugin：https://raw.githubusercontent.com/AbyssBadger0/claude-code-source/main/src/plugins/builtinPlugins.ts
- coordinator 模式：https://raw.githubusercontent.com/AbyssBadger0/claude-code-source/main/src/coordinator/coordinatorMode.ts

从这些文件可以确认它支持的方向包括：

- skill frontmatter 字段远比 GraphiteUI 当前更丰富
- skill 可以声明 allowed tools、arguments、when_to_use、model、hooks、agent、effort、shell 等
- 平台内有大量原生工具，不只是调用本地几个固定 skill
- plugin 可以提供 skills、hooks、MCP servers
- coordinator 模式可以编排 worker、消息、任务、并行执行

## 6. GraphiteUI agent 现在能不能做到它做到的事

我的判断是：

- 不能，至少现在还差一个层级

### 6.1 GraphiteUI 已经具备的部分

- 可视化 graph 工作流
- 节点级 agent 配置
- 基础 skill catalog
- 本地 skill 执行
- 本地模型调用
- 输出绑定和流程编排

### 6.2 GraphiteUI 还缺的关键层

GraphiteUI 目前没有这些关键能力：

- 通用工具运行时
- 文件 / shell / 搜索 / web / git 等一等工具抽象
- skill 对工具权限的声明与限制
- plugin 装配层
- MCP server / resource 集成
- 会话级命令系统
- 多 worker / coordinator orchestration
- 长时任务与任务消息总线
- 项目级 onboarding / memory / hooks 体系

### 6.3 更准确的定位差异

`claude-code-source` 更像：

- terminal-native 通用 agent 操作系统

GraphiteUI 当前更像：

- graph-native 可视化 agent workflow 编辑器

这两个方向并不冲突，但它们解决的问题层级不同。

## 7. 如果要向那个方向靠近，建议怎么走

不建议直接复制整套 `claude-code-source`。

更可行的路线是：

### Phase A: 先把 skill 规范做对

- 定义 Graphite 标准 skill schema
- 导入时统一规范化为 Claude Code 风格 `SKILL.md`
- 给每个 skill 增加更明确的 `用途 / 输入 / 输出 / side effects / 可用工具` 元数据

### Phase B: 把“skill”升级成“tool-capable skill”

- 在运行时引入一层通用 tool registry
- skill 不只绑定 Python 函数，也能声明自己可调用哪些工具
- 先实现最小工具集：`file_read / file_write / bash / web_fetch / search`

### Phase C: 增加 plugin / MCP 适配层

- skill 可以来自本地仓库、plugin、MCP skill builder
- 页面里明确区分 `内置 / 导入 / 插件 / MCP`

### Phase D: 增加 coordinator agent

- 把当前单节点 agent 升级为可选“协调型 agent”
- 允许一个 agent 节点派生子任务节点或 worker session
- 在运行记录里展示 delegation、verification、汇总过程

### Phase E: 再考虑 CLI / GitHub / 远程执行

- 这一步是平台层扩展，不应该先于 skill/tool/runtime 基础

## 8. 我建议的近期优先级

如果只看接下来最值得做的事情，我建议是：

1. 先把 skill 导入规范化成 Claude Code-first
2. 给 skill 增加更完整的可视元数据
3. 在 agent runtime 里引入通用 tool registry
4. 再考虑 plugin / MCP
5. 最后再考虑 coordinator / 多 agent

## 9. 一句话结论

GraphiteUI 现在已经有“可视化 agent workflow + 本地 skill catalog”的基础，但还不是 `claude-code-source` 那种完整通用 agent 平台。

最正确的方向不是直接模仿它的全部外形，而是先把 GraphiteUI 自己的 skill 标准、tool runtime 和 agent orchestration 三层搭稳，再逐步吸收它在 `skills / tools / plugins / coordinator` 上已经验证过的能力模型。
