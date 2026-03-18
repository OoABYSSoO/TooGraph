# GraphiteUI 原生 Skill 系统重构设计

日期：2026-05-01  
状态：待用户复核  
范围：只做 Skill 系统重构，不做 demo workflow、不做桌宠 Agent、不做 MCP、不做调度系统

## 1. 背景

GraphiteUI 当前已经有 Skills Page、Skill catalog、Agent Node skill picker、后端 skill definitions、runtime registry 和上传导入接口。现有系统也已经开始引入 `skill/graphite/<skillKey>/skill.json`，但运行时仍主要依赖 `config.skills: string[]`，skill 执行模式是“节点先执行绑定 skills，再做一次模型生成”。

这和我们讨论后的目标方向还差一层：

- GraphiteUI 原生 Skill 应该以 `skill.json` 作为运行时真相源。
- `SKILL.md` 应保留，但它是模型说明、人类文档和外部生态兼容材料，不是 Agent Node runtime 的唯一依据。
- Skill 要明确区分 `agent_node` 和 `companion` 两类使用目标。
- 能挂到 Agent Node 的 Skill 必须具备明确输入、输出、运行入口、权限、健康状态和可审计运行记录。
- 通用 `SKILL.md` 或外部 Skill 导入后默认不能直接挂 Agent Node，必须补齐 manifest 后才能启用。

用户确认本阶段先专注 Skill 系统重构，并补充一个重要要求：

> 默认技能从 `demo/` 文件夹里的原子能力抽取出来做成 Skill。

因此，本设计只处理 Skill 基座与默认技能，不制作 demo workflow。用户后续会基于搭建好的 Skill 自己搭工作流。

## 2. 目标

### 2.1 产品目标

1. Skill 管理页能解释每个 Skill 到底是 Agent Node Skill、Companion Skill，还是两者都可用。
2. Agent Node 只能选择真正可运行、可校验、健康的 `agent_node` Skill。
3. 外部或通用 Skill 可以导入，但默认状态要清楚表达“不可用于 Agent Node，需补 manifest 后启用”。
4. 第一批默认 Skill 应来自已有 demo 中稳定可复用的原子能力，而不是凭空设计。
5. 用户后续搭工作流时，能把这些原子 Skill 当作积木组合起来。

### 2.2 工程目标

1. 保持旧图兼容：已有 `config.skills: string[]` 不失效。
2. 新增结构化 `skillBindings`，承载 input mapping、output mapping、trigger、config。
3. Runtime 统一把旧 `skills` 和新 `skillBindings` 归一化成同一种执行计划。
4. Skill output 可以写回指定 graph state。
5. Validator 能基于 manifest 判断 Agent Node 是否能安全绑定 Skill。
6. Run detail 中保留 skill 输入、输出、错误、耗时、写入 state 等信息。

## 3. 非目标

本阶段不做：

- demo workflow 模板。
- 桌宠 Agent 真正使用 Companion Skill。
- LLM 自动生成 manifest 的完整交互流程。
- MCP server / MCP tool registry。
- Gateway、消息渠道、Webhook、Scheduler、Cron、Job Queue。
- 任意 shell/script runtime。
- Skill marketplace / remote hub。
- 沙箱和 secret 管理的完整系统。
- 可视化 input/output mapping wizard。

这些能力会在未来阶段建立在本次 Skill manifest、runtime plan、权限字段和 run record 之上。

## 4. 当前基线

当前相关代码大致是：

- `backend/app/core/schemas/skills.py`：已有 SkillDefinition、target、kind、mode、scope、permissions、inputSchema、outputSchema、runtimeReady、runtimeRegistered 等字段。
- `backend/app/skills/definitions.py`：加载 `skill/graphite/*/skill.json` 和 `skill/claude_code/*/SKILL.md`，生成 catalog。
- `backend/app/skills/registry.py`：内置 runtime functions，包括 `search_knowledge_base`、`summarize_text`、`extract_json_fields`、`translate_text`、`rewrite_text`。
- `backend/app/core/runtime/node_handlers.py`：Agent Node 执行所有 `config.skills`，把结果放进 `skill_context`，再调用一次模型生成。
- `backend/app/core/compiler/validator.py`：验证 skill 是否 active、target 包含 agent_node、configured、healthy、runtime_registered。
- `frontend/src/pages/SkillsPage.vue`：展示 catalog、targets、kind、mode、schema、permissions、compatibility、导入/启停/删除。
- `frontend/src/editor/nodes/AgentSkillPicker.vue`：只展示 attachable agent_node skills。

这个基线已经不错，因此第一版应当是“兼容式重构”，不是推倒重来。

## 5. 核心概念

### 5.1 Skill Package

安装单位仍然叫 Skill。原生 GraphiteUI Skill 推荐结构：

```text
skill/graphite/<skillKey>/
  skill.json
  SKILL.md
  scripts/
  references/
  examples/
  tests/
```

本阶段真正参与 runtime 的只有：

- `skill.json`
- 后端注册的 builtin runtime function

`SKILL.md` 仍保留，用于：

- 人类说明。
- Companion Agent 未来读取。
- 外部生态兼容。
- 后续 LLM 生成/修复 manifest 的上下文来源。

### 5.2 Agent Node Skill

Agent Node Skill 是 graph 运行能力。它必须满足：

- `targets` 包含 `agent_node`。
- `status = active`。
- `runtimeReady = true`。
- `runtimeRegistered = true`。
- `configured = true`。
- `healthy = true`。
- 有明确 input/output schema。
- 有 runtime 入口。
- 有权限与副作用声明。

### 5.3 Companion Skill

Companion Skill 是未来桌宠 Agent 使用的通用能力。它可以是：

- `context`
- `profile`
- `tool`
- `workflow`
- `adapter`

但本阶段 Companion Skill 不进入 Agent Node picker，也不参与 Agent Node runtime。

### 5.4 External / Legacy Skill

外部 `SKILL.md`、Claude Code Skill、OpenClaw Skill、Codex Skill 可以被导入或识别，但默认不应自动变成 Agent Node Skill。

本阶段通过规则给出状态：

- `ready`：可用于 Agent Node。
- `needs_manifest`：缺少 GraphiteUI 原生 manifest 或缺少 runtime/schema。
- `incompatible`：明显不适合 Agent Node，例如 profile-only、context-only、无稳定输入输出、需要交互式自主决策。

第一版不接 LLM 自动适配，只保留字段和规则判断。

## 6. Manifest 设计

### 6.1 `skill.json`

第一版 manifest 推荐字段：

```json
{
  "schemaVersion": "graphite.skill/v1",
  "skillKey": "normalize_shots",
  "label": "Normalize Shots",
  "description": "Normalize raw storyboard shots into stable time ranges, camera notes, and UI text.",
  "version": "1.0.0",
  "targets": ["agent_node"],
  "kind": "atomic",
  "mode": "tool",
  "scope": "node",
  "permissions": [],
  "inputSchema": [
    {
      "key": "shots",
      "label": "Shots",
      "valueType": "json",
      "required": true,
      "description": "Raw shot list."
    }
  ],
  "outputSchema": [
    {
      "key": "normalized_shots",
      "label": "Normalized Shots",
      "valueType": "json",
      "required": true,
      "description": "Normalized shot list."
    }
  ],
  "supportedValueTypes": ["json"],
  "sideEffects": ["none"],
  "runtime": {
    "type": "builtin",
    "entrypoint": "normalize_shots"
  },
  "health": {
    "type": "builtin"
  },
  "configured": true,
  "healthy": true
}
```

### 6.2 新增字段

后端 schema 需要在 `SkillDefinition` 中增加：

- `schema_version`
- `runtime`
- `health`
- `agent_node_eligibility`
- `agent_node_blockers`

建议 API 输出使用 camelCase：

- `schemaVersion`
- `runtime`
- `health`
- `agentNodeEligibility`
- `agentNodeBlockers`

### 6.3 Runtime 描述

第一版只支持 builtin：

```json
{
  "type": "builtin",
  "entrypoint": "normalize_shots"
}
```

暂不支持：

- `python`
- `node`
- `shell`
- `workflow`
- `mcp`
- `http`

这些后续再做。第一版如果 manifest 中声明非 builtin runtime，应显示为不可运行或 future runtime。

### 6.4 Health 描述

第一版只做轻量规则：

```json
{
  "type": "builtin"
}
```

判定逻辑：

- builtin entrypoint 在 registry 中存在，则 runtimeRegistered。
- manifest 配置完整，则 configured。
- 内置 health 不报错，则 healthy。

## 7. Agent Node 配置设计

### 7.1 兼容旧字段

旧格式继续有效：

```json
{
  "skills": ["summarize_text", "rewrite_text"]
}
```

旧字段语义：

- runtime 自动生成隐式 binding。
- skill 输入使用当前节点 `reads` 中的 state 值。
- skill 输出只进入 `skill_context`。
- 不直接写 graph state。

这样所有已有 graph 不需要迁移。

### 7.2 新增 `skillBindings`

新格式：

```json
{
  "skills": ["summarize_text"],
  "skillBindings": [
    {
      "skillKey": "summarize_text",
      "trigger": "before_agent",
      "inputMapping": {
        "text": "source_text"
      },
      "outputMapping": {
        "summary": "summary_text",
        "key_points": "summary_points"
      },
      "config": {
        "max_sentences": 4
      }
    }
  ]
}
```

字段含义：

- `skillKey`：绑定的 skill。
- `trigger`：第一版只支持 `before_agent`。
- `inputMapping`：skill input key 到 graph state key 的映射。
- `outputMapping`：skill output key 到 graph state key 的映射。
- `config`：固定参数，不来自 state。

### 7.3 `skills` 与 `skillBindings` 的关系

为了兼容前端 picker：

- `skills` 仍作为轻量 skill key 列表。
- `skillBindings` 作为详细绑定。
- 保存时允许只有 `skills`，没有 `skillBindings`。
- 如果存在 `skillBindings`，validator 应校验 binding 中的 skillKey 与 `skills` 至少不冲突。

推荐规则：

- 如果 `skillBindings` 存在，以 `skillBindings` 为执行依据。
- 对 `skills` 中没有 binding 的 skill，自动生成 legacy binding。
- UI picker 第一版只维护 `skills`，不强制编辑 binding。
- 后续 mapping UI 再维护 `skillBindings`。

## 8. Runtime 行为

### 8.1 执行顺序

Agent Node 执行顺序：

1. 根据 `skills` 和 `skillBindings` 生成 normalized bindings。
2. 对每个 `before_agent` binding 执行 skill。
3. 收集 skill output 到 `skill_context`。
4. 若 binding 配置了 `outputMapping`，把 skill output 写入对应 graph state。
5. 调用模型生成 Agent Node 自身 writes。
6. 合并 skill 写入和模型写入。
7. 返回 outputs、skill_outputs、warnings、runtime_config、final_result。

### 8.2 输入解析

Skill input 来源优先级：

1. `inputMapping` 指向的 graph state。
2. `config` 固定参数。
3. legacy mode 下使用 node `input_values`。

如果 required input 缺失：

- 该 skill 执行失败。
- Agent Node 失败。
- Run detail 记录缺失字段。

### 8.3 输出写回

如果 `outputMapping` 存在：

- 只写 mapping 中声明的 state。
- output key 不存在时写入 `None` 或报 warning，具体按 required 判断。
- 对 required output 缺失，第一版应失败，避免静默污染 state。

第一版仍只支持 state write mode `replace`，不做 reducer。

### 8.4 Run Detail

`skill_outputs` 需要扩展为：

```json
{
  "skill_name": "Summarize Text",
  "skill_key": "summarize_text",
  "trigger": "before_agent",
  "inputs": {},
  "outputs": {},
  "output_mapping": {},
  "state_writes": {},
  "duration_ms": 123,
  "status": "succeeded",
  "error": ""
}
```

这能让用户看到 skill 确实做了什么，以及哪些输出被写回 graph state。

## 9. Validator 行为

Agent Node 绑定 skill 时必须校验：

- skill 存在。
- status active。
- targets 包含 `agent_node`。
- agentNodeEligibility 为 `ready`。
- runtimeReady。
- runtimeRegistered。
- configured。
- healthy。
- required input 能从 `inputMapping`、config 或 legacy input 中获得。
- outputMapping 指向的 graph state 存在。
- outputMapping 的 state 类型与 outputSchema valueType 基本兼容。

Companion-only Skill 挂到 Agent Node 时，错误信息应明确：

```text
Skill '<key>' is a companion skill and cannot be attached to Agent nodes.
```

外部或未补 manifest 的 Skill 挂到 Agent Node 时，错误信息应明确：

```text
Skill '<key>' needs a GraphiteUI agent-node manifest before it can be used by Agent nodes.
```

## 10. 默认 Skill 抽取策略

### 10.1 来源

默认 Skill 第一版来自两类来源：

1. 当前已有内置 LLM / knowledge skills：
   - `search_knowledge_base`
   - `summarize_text`
   - `extract_json_fields`
   - `translate_text`
   - `rewrite_text`
2. `demo/slg_langgraph_single_file_modified_v2.py` 中稳定、可复用、边界清晰的原子函数。

`examples/graph_minimal_pass.json` 和 `examples/graph_revise.json` 是旧图结构示例，不作为默认 Skill 来源。它们更适合作为后续 graph/template 迁移参考。

### 10.2 抽取原则

从 demo 抽取默认 Skill 时，只抽原子能力，不抽完整 workflow。

优先抽取：

- 输入输出明确。
- 无外部副作用。
- 不依赖 Playwright/browser。
- 不依赖真实网络。
- 不依赖文件系统写入。
- 可用单元测试覆盖。
- 能被用户在工作流中组合。

暂不抽取：

- RSS 抓取。
- Facebook Ad Library 抓取。
- 视频下载。
- 浏览器滚动采集。
- 本地文件写入。
- 完整 SLG creative factory graph。
- 需要长流程状态的 node_xxx 函数。

这些能力未来可以作为 Adapter Skill 或 Workflow Skill，再补权限、沙箱、artifact 和调度。

### 10.3 第一批 demo-derived 默认 Skill

建议第一批从 demo 中抽取以下原子能力：

#### `extract_json_block`

来源函数：`extract_json_block`

用途：

- 从模型输出或混合文本中提取 JSON。
- 适合和任意 Agent Node 配合，做结构化后处理。

输入：

- `text: text`

输出：

- `parsed: json`
- `valid: boolean`
- `error: text`

#### `dedupe_items`

来源函数：`dedupe_keep_order`

用途：

- 对数组去重并保持顺序。
- 适合新闻条目、关键词、素材 URL、标签列表。

输入：

- `items: json`

输出：

- `items: json`
- `removed_count: number`

#### `select_top_items`

来源函数：`select_top_video_items` 的通用化版本。

用途：

- 从数组中截取 Top N。
- 第一版只做简单顺序截取，不做复杂排序。

输入：

- `items: json`
- `top_n: number`

输出：

- `selected_items: json`

#### `normalize_storyboard_shots`

来源函数：`normalize_shot_list`、`allocate_time_ranges`、`join_ui_text`

用途：

- 把模型生成的 raw shots 归一化为稳定分镜结构。

输入：

- `shots: json`

输出：

- `normalized_shots: json`

#### `build_storyboard_package`

来源函数：`build_storyboard_images`、`render_storyboard_markdown`

用途：

- 根据脚本 variant 生成图片分镜包和 Markdown 预览。

输入：

- `variant: json`

输出：

- `storyboard_images: json`
- `storyboard_markdown: markdown`

#### `build_video_prompt_package`

来源函数：`build_video_prompt_version1`、`build_video_prompt_version2`、`render_video_prompts_markdown`

用途：

- 根据脚本 variant 和 storyboard 生成两版视频提示词。

输入：

- `variant: json`
- `storyboard_images: json`

输出：

- `video_prompts: json`
- `video_prompts_markdown: markdown`

#### `build_final_summary`

来源函数：`build_final_summary`

用途：

- 将创意 brief、脚本、分镜、提示词、评审结果合成一份最终摘要。

输入：

- `payload: json`

输出：

- `summary_markdown: markdown`

### 10.4 默认 Skill 文件位置

每个默认 Skill 放在：

```text
skill/graphite/<skillKey>/
  skill.json
  SKILL.md
```

运行函数放在后端：

```text
backend/app/skills/builtin/demo_creative.py
backend/app/skills/registry.py
```

第一版可以把所有 demo-derived deterministic functions 放到一个模块里，再由 registry 暴露为多个 entrypoint。

## 11. 前端范围

### 11.1 Skills Page

保留现有卡片布局，增强解释字段：

- Runtime 类型和 entrypoint。
- Agent Node eligibility。
- Blockers。
- 如果是 companion-only，明确显示“不可用于 Agent Node”。
- 如果是 needs_manifest，明确显示“需补 GraphiteUI manifest 后启用”。

### 11.2 Agent Skill Picker

第一版保持轻量：

- 继续只列出 attachable agent_node skills。
- meta 中显示 kind/mode/runtime。
- 不做 input/output mapping 编辑器。

### 11.3 后续 Mapping UI

后续再做：

- inputMapping 选择 state。
- outputMapping 选择 state。
- config 固定参数编辑。
- per-skill run preview。

本阶段 demo-derived default skills 可以先通过后端和 JSON 结构验证，不需要 UI 完整编辑 mapping。

## 12. 测试策略

### 12.1 后端测试

新增或更新测试：

- manifest 解析 runtime / health / eligibility。
- companion-only skill 不出现在 attachable definitions。
- needs_manifest skill 不可绑定 Agent Node。
- legacy `skills` 仍能执行。
- `skillBindings` 能读取 inputMapping/config。
- `skillBindings` 能把 outputMapping 写回 state。
- required input 缺失会失败。
- outputMapping 指向不存在 state 会被 validator 拒绝。
- demo-derived skills 单元测试：
  - JSON block 提取。
  - 去重。
  - Top N 选择。
  - 分镜归一化。
  - storyboard markdown。
  - video prompt markdown。

### 12.2 前端测试

更新：

- `SkillDefinition` 类型。
- `skillPickerModel` 只展示 `agentNodeEligibility = ready` 的 skill。
- `skillsPageModel` 支持 eligibility/blockers 搜索和 attention 统计。
- Skills Page structure test 覆盖 runtime/eligibility 文案。

### 12.3 验证命令

实现完成后至少运行：

```bash
pytest backend/tests/test_runtime_skill_invocation.py backend/tests/test_node_handlers_runtime.py backend/tests/test_skill_upload_import_routes.py
```

以及相关前端测试：

```bash
npm test -- --runInBand
```

如果项目实际测试命令不同，以 `package.json` 和现有脚本为准。

代码变更完成后，根据仓库约定重启：

```bash
npm run dev
```

文档变更不需要重启。

## 13. 迁移策略

### 13.1 旧图兼容

旧图只包含：

```json
{
  "config": {
    "skills": ["rewrite_text"]
  }
}
```

运行时继续执行。

### 13.2 新图能力

新图可以逐步使用：

```json
{
  "config": {
    "skills": ["rewrite_text"],
    "skillBindings": [
      {
        "skillKey": "rewrite_text",
        "trigger": "before_agent",
        "inputMapping": {
          "text": "draft",
          "instruction": "rewrite_instruction"
        },
        "outputMapping": {
          "rewritten": "final_text"
        }
      }
    ]
  }
}
```

### 13.3 Skill 文件迁移

已有 `skill/graphite/*/skill.json` 需要补：

- `runtime`
- `health`
- 如有必要补 `targets`、`permissions`、`sideEffects`

已有 `skill/claude_code/*/SKILL.md` 保留，不删除。

## 14. 风险与处理

### 14.1 `skills` 与 `skillBindings` 双字段可能产生不一致

处理：

- runtime 以 `skillBindings` 为主。
- `skills` 中缺 binding 的项自动生成 legacy binding。
- validator 对冲突给 warning 或 issue。

### 14.2 Demo 函数和 Skill API 粒度不一致

处理：

- 只抽确定性、输入输出清晰的函数。
- 不直接搬 node_xxx workflow 函数。
- 每个 demo-derived skill 都写单测。

### 14.3 outputMapping 写 state 可能和 Agent 自身 writes 冲突

处理：

- 第一版允许同一个 Agent Node 的 skill outputMapping 写入非 Agent writes 的 state。
- 如果 outputMapping 写入 Agent 自身 writes，也允许，但模型输出后可能覆盖。
- Run detail 必须展示最终 state writes。
- 后续再做更严格的写入冲突提示。

### 14.4 UI 暂不支持 binding 编辑

处理：

- 第一版主要打通后端协议和运行能力。
- UI 仍能选择 skill。
- 高级 binding 先通过 JSON/template/API 使用。
- 后续再做 mapping UI。

## 15. 完成标准

本阶段完成时应满足：

1. `skill.json` 支持 runtime、health、eligibility。
2. `SkillDefinition` API 输出能解释 Agent Node 可用性。
3. Agent Node 支持旧 `skills` 和新 `skillBindings`。
4. Runtime 能执行 binding，并把 outputMapping 写回 state。
5. Validator 能拦截 companion-only、needs_manifest、unhealthy、unregistered skill。
6. 默认 demo-derived atomic skills 出现在 catalog 中，并有单元测试。
7. Skills Page 和 Agent Skill Picker 能正确展示/过滤新状态。
8. 旧 graph 和旧 skill 仍能运行。
9. 相关测试通过。

## 16. 后续阶段

本阶段之后再考虑：

- Skill mapping UI。
- LLM manifest draft 自动生成。
- Companion Skill runtime。
- Workflow Skill / Subgraph Skill。
- Script runtime 和 sandbox。
- MCP。
- Scheduler / Job Queue。
- Demo workflows。
