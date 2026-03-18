# GraphiteUI 原生 Skill 系统重构设想

## 背景

当前 GraphiteUI 的 Skill 系统同时混合了几个概念：

- 从外部目录发现的 Skill。
- GraphiteUI 托管的 Skill。
- 能在运行时真正执行的 Skill。
- 只作为说明或兼容信息存在的 Skill。
- Skill 管理页上的导入、启停、删除、就绪状态和健康状态展示。

这些概念被压缩进同一套 `SkillDefinition` 和同一个 catalog 视图后，用户很难判断一个 Skill 到底是“被发现了”、“已安装”、“已启用”，还是“真的能被 Agent 节点执行”。

新的方向是：GraphiteUI 默认只支持自己的原生 Skill 包，Skill 不做默认外部目录主动发现，而是通过手动上传导入进入 GraphiteUI 管理目录。Skill 被某个 Agent 节点显式引用，只有引用它的 Agent 节点才能使用它。

## Claude Code Skill 规范要点

Claude Code 的 Skill 更像“给 Agent 的可组合操作手册和资源包”，而不是严格的函数插件系统。它的关键特点包括：

- 一个 Skill 是一个目录，核心入口是 `SKILL.md`。
- `SKILL.md` 使用 YAML frontmatter 声明 `name`、`description` 等元数据，正文是给模型看的操作说明。
- Agent 启动时只预加载轻量元数据，用到时再读取完整 `SKILL.md` 和辅助文件，形成 progressive disclosure。
- Skill 可以包含参考文档、示例、脚本、模板和资源文件。
- Claude Code 扩展支持 `allowed-tools`、`disable-model-invocation`、参数替换和 `context: fork` 等行为控制。
- 复杂 Skill 可以通过脚本提供稳定的执行能力，而不是让模型每次临时生成代码。

GraphiteUI 应该借鉴这些思想，但不应该把 `SKILL.md` 当成运行时真相源。GraphiteUI 的核心价值是可视化编排、运行记录、恢复、人类在环和可审计性，因此需要一个机器可读、可校验、可执行的原生 manifest。

参考：

- https://code.claude.com/docs/en/skills
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

## 目标

1. 默认只管理 GraphiteUI 原生 Skill，不默认扫描 Claude、Codex、OpenClaw 等外部目录。
2. 支持用户手动上传 zip 或文件夹导入 Skill。
3. Skill 必须有机器可读 manifest，导入前可校验、预览和诊断。
4. Skill 必须由 Agent 节点显式引用，不能全局自动污染所有 Agent。
5. Skill 支持原子能力，也支持由多个原子能力组成的流程能力。
6. Skill 的权限、配置、健康状态、运行日志和使用位置都能在管理页解释清楚。

## 非目标

- 第一阶段不做外部目录自动发现。
- 第一阶段不直接兼容执行任意 Claude Code / Codex / OpenClaw Skill。
- 第一阶段不支持不受控 shell 注入或动态命令拼接。
- 第一阶段不把所有 Skill 自动暴露给所有 Agent。

## 原生 Skill 包结构

建议使用 `skill.json` 作为 GraphiteUI 的真相源，`SKILL.md` 作为给模型看的说明和 Claude Code 兼容材料。

```text
my_skill/
  skill.json
  SKILL.md
  main.py
  workflow.json
  reference/
  examples/
  assets/
  tests/
```

其中：

- `skill.json`：机器可读 manifest，描述输入输出、运行入口、权限、配置和组合关系。
- `SKILL.md`：模型说明，可用于 context 注入，也可作为 Claude Code 兼容文档。
- `main.py`：原子执行入口，可选。
- `workflow.json`：流程型 Skill 的步骤定义，可选。
- `reference/`、`examples/`、`assets/`：按需读取的辅助材料。
- `tests/`：Skill 自测用例，可用于导入后的 health check。

## Skill 类型

GraphiteUI Skill 不应该只等同于工具函数，也不应该只是 prompt。建议分成五类：

### Atomic Skill

单一职责的可执行能力。

示例：

- `web_fetch`
- `html_extract_main_content`
- `image_understanding`
- `sample_video_frames`
- `ocr_image`
- `extract_json_fields`
- `rewrite_text`

### Workflow Skill

由多个 Atomic Skill 或模型步骤组成的流程能力。

示例：`video_understanding`

```text
video -> sample_video_frames -> image_understanding per frame -> merge_frame_observations -> answer_video_question
```

这个模式可以让一个只有图片理解能力的模型，在 GraphiteUI 的流程拆分下获得视频理解能力。

### Adapter Skill

包装外部 API、本地命令或私有服务。

示例：

- 网页获取
- 搜索 API
- OCR 服务
- ffmpeg
- 内部知识系统

### Context Skill

只提供模型行为规则，不执行代码。

示例：

- 法律审查输出格式
- 品牌语气规范
- 数据分析报告模板

### Control Skill

负责流程控制。

示例：

- 批处理
- 分页抓取
- 重试
- map-reduce 总结
- 条件路由

## Manifest 草案

```json
{
  "schemaVersion": 1,
  "skillKey": "video_understanding",
  "label": "Video Understanding",
  "version": "1.0.0",
  "kind": "workflow",
  "description": "Understand a video by sampling frames, analyzing images, and merging temporal observations.",
  "whenToUse": "Use when an Agent node receives a video and needs summary, timeline, objects, events, or question answering.",
  "inputs": {
    "video": {
      "type": "file",
      "required": true,
      "mediaTypes": ["video/mp4", "video/webm"]
    },
    "question": {
      "type": "text",
      "required": false
    }
  },
  "outputs": {
    "summary": {
      "type": "markdown"
    },
    "timeline": {
      "type": "json"
    }
  },
  "permissions": ["file_read", "model_vision"],
  "runtime": {
    "type": "workflow",
    "entrypoint": "workflow.json"
  },
  "configSchema": {
    "frameIntervalSec": {
      "type": "number",
      "default": 2,
      "description": "Seconds between sampled frames."
    },
    "maxFrames": {
      "type": "integer",
      "default": 20
    }
  }
}
```

## Agent 节点引用模型

Skill 必须由 Agent 节点显式引用。Catalog 只负责安装和管理，Agent 节点负责选择和配置，Runtime 负责执行。

```json
{
  "nodes": {
    "agent_1": {
      "kind": "agent",
      "config": {
        "skills": [
          {
            "skillKey": "video_understanding",
            "version": "1.0.0",
            "mode": "workflow",
            "trigger": "before_agent",
            "inputs": {
              "video": "{{state.uploaded_video}}",
              "question": "{{state.user_question}}"
            },
            "outputs": {
              "summary": "video_summary",
              "timeline": "video_timeline"
            },
            "config": {
              "frameIntervalSec": 2,
              "maxFrames": 20
            }
          },
          {
            "skillKey": "web_fetch",
            "version": "1.0.0",
            "mode": "tool",
            "config": {
              "timeoutSec": 20
            }
          }
        ]
      }
    }
  }
}
```

运行时规则：

- 只有引用某个 Skill 的 Agent 节点可以使用该 Skill。
- 保存 graph 时记录 Skill 引用、版本和配置。
- 校验 graph 时检查 Skill 是否已安装、已启用、可运行、配置完整、权限允许。
- 运行记录中展示每个 Agent 节点实际使用的 Skill、输入、输出、耗时、错误和 artifacts。

## 调用模式

### Workflow Mode

GraphiteUI Runtime 按 Skill 定义的流程执行。

适合：

- 视频理解
- 文档处理
- 批量网页抓取
- 多步骤提取和校验
- 需要可视化、可复现、可审计的能力

优点：

- 稳定、可复现。
- 每一步可记录、展示、缓存、重试。
- 失败点清晰。
- 更符合 GraphiteUI 的可视化工作流定位。

缺点：

- Skill 作者需要明确写流程。
- 初期实现复杂度高于纯工具调用。

### Tool Mode

模型在 Agent 执行过程中按需调用 Skill。

适合：

- 网页获取
- 知识库查询
- 简单计算
- 外部 API 查询
- 可能需要也可能不需要的辅助能力

优点：

- 灵活。
- 适合开放式任务。

缺点：

- 模型可能不用、乱用或重复使用。
- 同样输入下调用路径可能不同。
- 调试和复现比 workflow mode 弱。

### Context Mode

Skill 只把说明、规范、模板或少量参考内容注入 Agent 上下文。

适合：

- 输出格式规范
- 品牌语气
- 审查标准
- 领域流程说明

优点：

- 最轻量。
- 不需要执行环境。

缺点：

- 不产生可执行 artifacts。
- 不能保证模型严格遵守，仍需要校验。

## 推荐策略

GraphiteUI 应采用 workflow-first 策略：

1. Workflow Skill 是核心，因为 GraphiteUI 的优势是可视化、可审计、可恢复。
2. Atomic Skill 是 Workflow Skill 的基础复用单元。
3. Tool Skill 作为补充，给 Agent 开放式调用能力。
4. Context Skill 作为轻量提示和规范注入。

也就是说，Skill 不是只给模型看的提示词，而是 graph 中可挂载、可诊断、可授权、可执行的能力包。

## 导入生命周期

手动导入流程建议做成显式向导：

1. 上传 zip 或文件夹。
2. 后端解包到临时目录。
3. 校验 `skill.json`。
4. 校验文件路径安全性。
5. 展示 manifest、权限、输入输出、配置项、入口文件。
6. 检查同名 Skill 冲突。
7. 用户选择安装、覆盖或取消。
8. 安装到 GraphiteUI 管理目录。
9. 运行 health check。
10. 用户启用后才能被 Agent 节点选择。

上传成功不等于可执行。页面必须明确区分：

- 已导入
- 已启用
- 配置完整
- Runtime ready
- Health check passed

## 管理页面重构

Skill 管理页应该从“全量卡片展示”改成任务型控制台。

### 页面分区

- `Installed`：已安装的 GraphiteUI 原生 Skill。
- `Import`：上传、校验、预览、安装。
- `Capabilities`：按能力类型查看，例如 text、image、video、web、file、workflow。
- `Diagnostics`：缺依赖、缺配置、权限风险、入口错误、health check 失败。
- `Usage`：查看哪些 Agent 节点引用了哪些 Skill。

### 列表布局

建议用紧凑表格替代大卡片：

```text
名称 | 状态 | 类型 | 权限 | 输入/输出 | 使用位置 | 最近检查 | 操作
```

### 详情抽屉

点击 Skill 后打开详情抽屉：

- Overview
- Manifest
- I/O Schema
- Permissions
- Config
- Files
- Usage
- Diagnostics
- Run History

### Agent 节点 Skill Picker

Agent 节点里只显示已安装、已启用、配置满足基本条件的 Skill。选择后在节点内显示：

- Skill 名称和版本。
- mode：workflow / tool / context。
- 需要的权限。
- 缺失配置。
- 输入输出映射。
- 是否会在 Agent 前执行、Agent 后执行，或作为工具暴露给模型。

## 后端模块边界

建议拆分当前 Skill 相关模块：

```text
backend/app/skills/
  manifest.py        # skill.json schema 与解析
  discovery.py       # 只扫描 GraphiteUI managed packages
  installation.py    # 上传、解包、安装、覆盖、删除
  catalog.py         # 聚合安装状态、启用状态、健康状态、使用情况
  diagnostics.py     # 依赖、权限、入口、配置检查
  runtime.py         # workflow/tool/context 调用适配
  executor.py        # Python atomic skill 执行器
```

现有 `definitions.py` 里解析、状态聚合、运行时就绪判断的职责应该拆开。现有 `registry.py` 里硬编码运行时函数的方式可以先保留为 legacy adapter，但不应继续作为新系统核心。

## API 草案

```text
GET    /api/skills
GET    /api/skills/{skill_key}
POST   /api/skills/imports/validate
POST   /api/skills/imports/install
POST   /api/skills/{skill_key}/enable
POST   /api/skills/{skill_key}/disable
DELETE /api/skills/{skill_key}
POST   /api/skills/{skill_key}/health-check
GET    /api/skills/{skill_key}/usage
```

Agent 节点运行时校验应复用同一套 catalog 和 diagnostics，而不是另写一套检查逻辑。

## 权限与安全

原生 Skill 必须显式声明权限：

- `model_text`
- `model_vision`
- `knowledge_read`
- `network`
- `file_read`
- `file_write`
- `subprocess`
- `secret_read`

第一阶段建议：

- 默认禁止任意 shell。
- 默认禁止网络，除非 Skill 声明并由用户确认。
- 网络类 Skill 支持 domain allowlist。
- 文件访问限定在运行工作目录和输入 artifact。
- Skill 运行设置超时、最大输出大小、错误捕获。
- Secret 不进入 manifest 明文，只通过 GraphiteUI settings 引用。

## 与现有 Skill 的迁移

第一阶段可以把现有五个内置 Skill 迁移成 GraphiteUI 原生包：

- `search_knowledge_base`
- `summarize_text`
- `extract_json_fields`
- `translate_text`
- `rewrite_text`

迁移策略：

1. 为每个 Skill 添加 `skill.json`。
2. 保留 `SKILL.md` 作为说明。
3. 用 legacy adapter 继续调用现有 Python 函数。
4. 管理页只显示 GraphiteUI managed/native Skill。
5. 移除默认扫描 `.claude/skills`、`.agents/skills`、`.openclaw/skills`、`$CODEX_HOME/skills`。
6. 后续再做 Claude Code Skill 导入器，把 `SKILL.md` 转成 GraphiteUI manifest 草案。

## 测试策略

后端测试：

- manifest schema 校验。
- 上传 zip / 文件夹路径安全。
- 导入预览不落盘。
- 安装覆盖和冲突处理。
- 启用、禁用、删除。
- health check 失败和错误信息。
- Agent 节点引用不存在、禁用、缺配置、权限不足 Skill 的校验。

前端测试：

- Skill 管理页表格筛选和状态展示。
- 导入向导步骤。
- 权限预览。
- 详情抽屉。
- Agent 节点 Skill Picker。
- 缺配置和不可运行提示。

端到端测试：

- 上传一个 atomic Skill。
- 启用 Skill。
- 在 Agent 节点绑定 Skill。
- 运行 graph。
- 查看 Run Detail 中的 Skill 调用记录和 artifacts。

## 推荐落地顺序

1. 定义 `skill.json` schema 和后端 manifest 解析。
2. 停止默认外部目录发现，只读取 GraphiteUI managed/native Skill。
3. 新建 Skill catalog DTO，拆分 installed、enabled、runtimeReady、configured、healthy。
4. 新增导入 validate/install 流程。
5. 迁移现有内置 Skill 到原生 manifest。
6. 改造 Agent 节点 Skill 引用结构，加入 mode、trigger、inputs、outputs、config。
7. 实现 workflow mode 的最小运行链路。
8. 改造 Skill 管理页为表格、详情抽屉和导入向导。
9. 增加 Run Detail 的 Skill 调用记录展示。
10. 后续补 tool mode、context mode 和 Claude Code Skill 导入器。

## 结论

GraphiteUI 的 Skill 系统应该围绕 Agent 节点显式引用和 workflow-first 的运行模型设计。Claude Code Skill 的 progressive disclosure、目录包、说明文档和脚本资源组织方式值得借鉴，但 GraphiteUI 需要自己的 manifest、权限、诊断和运行时契约。

最终定义：

> Skill 是一个可安装、可诊断、可授权、可被 Agent 节点显式引用的能力包。它可以是原子执行单元，也可以是由多个原子单元组成的流程能力。GraphiteUI 负责让它可见、可控、可复现、可审计。
