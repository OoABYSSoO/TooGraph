# TooGraph P0～P1 开发目标文档

> 建议放置路径：`docs/development/p0_p1_development_goals.md`  
> 文档目标：明确 TooGraph 下一阶段的开发方向，将项目从“Agent 可视化编排原型”推进到“具备记忆、知识库、业务模板和评测闭环的 Agent 应用开发平台”。  
> 范围限定：本阶段只覆盖 P0～P1，不包含 Worker Queue、生产级沙箱、多租户权限、云端部署等 P2 之后任务。

---

## 1. 阶段目标

TooGraph 当前已经具备以下基础能力：

- 可视化 Agent Graph 编排。
- `node_system` 图协议。
- FastAPI 后端服务。
- LangGraph Runtime。
- Skill Manifest 与 Skill Runtime。
- Model Provider 抽象。
- Run 记录、节点状态、事件流、Artifacts。
- Knowledge 基础检索能力。
- Buddy Home、运行历史和基础记忆读写能力。

P0～P1 阶段的目标是补齐 Agent 应用落地最核心的四类能力：

1. **长期记忆系统**：让 Agent 能召回、提议、写入、修订、检索和审计长期记忆。
2. **SLG Creative Factory 模板**：将 SLG 买量创意生产流程整理为 TooGraph 模板，用于展示复杂业务 Agent 工作流。
3. **Hybrid RAG 知识库升级**：将当前知识库从基础 FTS 检索升级为可扩展的 Hybrid RAG。
4. **Agent Eval 评测体系**：让 Agent 工作流具备可量化评估、可回归测试、可持续优化的能力。

完成后，TooGraph 应该能展示以下闭环：

```text
业务输入
  ↓
Memory 召回用户偏好 / 工作流经验 / 相关会话摘要
  ↓
Knowledge 检索业务资料 / 外部资料
  ↓
Agent Graph 规划与执行
  ↓
Skill 调用外部工具
  ↓
Human-in-the-loop 审核与返修
  ↓
Artifacts 沉淀中间与最终产物
  ↓
Eval 评估工作流质量
  ↓
Memory 生成候选经验，经策略、审批和 revision 写回长期记忆
```

---

## 2. 本阶段范围

### 2.1 P0 必须完成

| 模块 | 目标 | 完成标准 |
|---|---|---|
| 长期记忆系统 | 从零散文件和基础读写升级为可召回、可提议、可审计、可恢复的长期记忆层 | 记忆 Store、候选写回、召回预算、revision、`memory_recall` / `memory_candidate_writer`、图模板集成 |
| SLG Creative Factory 模板 | 将 SLG 买量创意生产流程整理为 TooGraph 模板 | 模板状态、节点、Skill、Artifacts、返修循环完整可运行 |
| 文档与展示 | 让项目目标、模板逻辑、开发路线清晰可见 | README/开发文档/模板说明/示例运行结果 |

### 2.2 P1 尽量完成

| 模块 | 目标 | 完成标准 |
|---|---|---|
| Hybrid RAG | 从基础 FTS 检索升级为 FTS + Embedding + Rerank 的检索链路 | Embedding 表、检索 API、Context Pack、Citation |
| Agent Eval | 支持对 Graph/模板进行固定用例评测 | Eval Suite、Eval Case、Eval Run、指标汇总 |
| SLG 模板 Eval | 为 SLG Creative Factory 准备回归测试集 | 至少 8～10 个 Eval Case |

### 2.3 本阶段暂不包含

以下任务放入 P2 或后续阶段：

- Redis / Celery / RQ / Temporal 等 Worker Queue。
- 生产级任务调度。
- Docker Sandbox。
- 多用户、多租户权限。
- OAuth 登录。
- Secret Manager / KMS。
- 云端部署。
- 高并发压测。
- 企业级监控告警。

---

# P0-1：长期记忆系统

## 3. 模块目标

长期记忆系统的目标不是“给 LLM 多塞几条历史文本”，而是建立一套可召回、可证据化、可审计、可恢复的长期上下文层。它应服务普通图模板、Buddy 自主循环、业务模板和后续评测闭环，同时保持 TooGraph 的图优先原则。

长期记忆系统必须支持：

- 从用户偏好、项目事实、会话摘要、工作流经验、Skill 经验和能力使用统计中召回相关上下文。
- 由图模板或后台复盘生成候选记忆，而不是让单个 LLM 节点任意直接改长期资料。
- 通过明确的命令、审批策略、revision 和 activity event 写入或更新记忆。
- 按用户、项目、图、模板、Skill、Buddy Home 和知识集合等作用域隔离记忆。
- 追溯每条记忆的来源 run、节点、能力、artifact、证据摘要和修改历史。
- 对过期、低置信度、冲突、重复或被新事实替代的记忆进行归档、降权或 supersede。
- 以预算化的 `memory_context` 注入图运行，明确标注为参考上下文，不作为系统指令。

边界：

```text
Run State：单次运行内的短期状态和中间产物。
Memory：跨运行复用的偏好、事实、经验、策略摘要和能力使用统计。
Knowledge：外部文档、业务资料、规范、案例、素材库和可引用资料。
Artifact：某次运行生成或下载的文件、报告、图片、视频和结构化结果。
Policy：权限、行为边界和安全规则；可被记忆引用，但不能被普通记忆静默改写。
```

记忆不是权限来源。召回到 prompt 的记忆和会话摘要都必须带有“context only / reference only”边界。

---

## 4. 记忆分层

| layer | 含义 | 示例 | 默认写入路径 |
|---|---|---|---|
| `semantic` | 稳定事实和偏好 | 用户偏好简洁回复；项目使用 `npm start` | 手动写入或后台复盘候选 |
| `episodic_summary` | 会话或运行摘要 | 某次 SLG 模板运行的目标、结果、未完成项 | 后台复盘图 |
| `procedural` | 工作流、模板和 Skill 经验 | 视频分析失败时使用文本素材降级 | 模板复盘或能力使用统计 |
| `profile` | 用户/伙伴画像摘要 | 用户关心审计和可见操作 | Buddy Home writer |
| `policy_note` | 低风险策略备注 | 某模板默认需要人工确认写入文件 | 受控 writer；不得扩大权限 |
| `capability_stat` | 能力使用统计 | 某模板最近 5 次运行失败原因 | 运行后聚合 |

每条记忆必须有 `content` 和 `summary`。`content` 是可审计正文，`summary` 是召回和列表展示的短摘要。大型日志、完整 artifact、base64 和大媒体不能写进记忆正文，只能用 artifact refs 指向。

---

## 5. 作用域与可见性

| scope | 含义 | scope_key 示例 |
|---|---|---|
| `global` | 本地 TooGraph 实例通用事实 | 空字符串 |
| `user` | 用户偏好和长期事实 | `default_user` |
| `project` | 当前 workspace / repo 事实 | `toograph_workspace` |
| `buddy` | Buddy Home 长期资料 | `default_buddy` |
| `graph` | 单张 graph 的运行经验 | `graph_xxx` |
| `template` | 图模板经验和默认偏好 | `slg_creative_factory` |
| `skill` | 单个 Skill 的使用经验 | `web_search` |
| `knowledge_collection` | 知识库召回策略或资料经验 | `slg_creative_docs` |

作用域规则：

- 默认召回顺序为 user / project / buddy / template / graph / skill，再按相关性和预算裁剪。
- 图模板只能自动读取自己声明的作用域；跨项目、跨用户或跨 Buddy 的记忆需要显式选择或管理员策略。
- Buddy Home 中的 `AGENTS.md`、`SOUL.md`、`USER.md`、`MEMORY.md`、`policy.json` 是用户可编辑投影；底层 SQLite 记忆记录和 revision 是审计与恢复来源。

---

## 6. 记忆生命周期

```text
observed fact / run result / user correction
  -> memory_candidate
  -> dedupe + conflict check
  -> risk classification
  -> apply automatically / request approval / reject
  -> memory revision
  -> recall, decay, supersede, archive
```

状态字段：

| status | 含义 |
|---|---|
| `candidate` | 候选记忆，尚未写入长期召回池 |
| `active` | 可被召回 |
| `superseded` | 被新记忆替代，默认不召回 |
| `archived` | 保留审计但默认不召回 |
| `rejected` | 被用户、策略或 writer 拒绝 |

写入策略：

- 用户手动保存偏好或事实时，可以直接进入候选审查或明确写入。
- Buddy 后台复盘可以自动应用低风险 profile、memory、session summary、能力统计和精炼报告，但必须生成 command、revision 和 activity event。
- 权限升级、行为边界扩大、任意文件写入、脚本执行、图补丁、模型供应商配置和敏感资料变更不能作为低风险记忆自动写入。
- 更新记忆不是覆盖文本字段这么简单；必须创建 revision，记录 previous value、new value、diff、来源和执行结果。

---

## 7. 数据模型

核心表建议：

```sql
CREATE TABLE IF NOT EXISTS memories (
    memory_id TEXT PRIMARY KEY,
    layer TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global',
    scope_key TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    confidence REAL NOT NULL DEFAULT 1.0,
    importance INTEGER NOT NULL DEFAULT 3,
    priority INTEGER NOT NULL DEFAULT 0,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    artifact_refs_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    source_kind TEXT NOT NULL DEFAULT 'manual',
    source_run_id TEXT NOT NULL DEFAULT '',
    source_node_id TEXT NOT NULL DEFAULT '',
    source_skill_key TEXT NOT NULL DEFAULT '',
    source_template_id TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    supersedes_memory_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS memory_revisions (
    revision_id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    command_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    previous_json TEXT NOT NULL DEFAULT '{}',
    next_json TEXT NOT NULL DEFAULT '{}',
    diff_json TEXT NOT NULL DEFAULT '{}',
    source_run_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_events (
    event_id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}',
    source_run_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
USING fts5(
    memory_id UNINDEXED,
    layer UNINDEXED,
    memory_type UNINDEXED,
    scope UNINDEXED,
    scope_key UNINDEXED,
    title,
    summary,
    content,
    tokenize='porter unicode61 remove_diacritics 2'
);
```

后续进入 Hybrid RAG 阶段时再增加 embedding 表。P0 不要求一次性完成向量召回，但数据模型应保留 `metadata_json` 和 `artifact_refs_json`，避免将来迁移困难。

---

## 8. API 与 Store 边界

建议模块：

```text
backend/app/memory/schemas.py
backend/app/memory/store.py
backend/app/memory/search.py
backend/app/memory/candidates.py
backend/app/api/routes_memories.py
```

API：

```text
GET    /api/memories
POST   /api/memories/candidates
POST   /api/memories/candidates/{candidate_id}/apply
POST   /api/memories/candidates/{candidate_id}/reject
GET    /api/memories/search
GET    /api/memories/{memory_id}
PATCH  /api/memories/{memory_id}
POST   /api/memories/{memory_id}/archive
POST   /api/memories/{memory_id}/supersede
GET    /api/memories/{memory_id}/revisions
```

核心方法：

```python
create_memory_candidate(payload, source) -> dict
apply_memory_candidate(candidate_id, decision) -> dict
reject_memory_candidate(candidate_id, reason) -> dict
create_memory(payload, source) -> dict
update_memory(memory_id, patch, source) -> dict
archive_memory(memory_id, source) -> dict
supersede_memory(memory_id, replacement_payload, source) -> dict
load_memory(memory_id) -> dict
list_memories(filters) -> list[dict]
search_memories(query, filters, budget) -> list[dict]
record_memory_event(memory_id, event) -> dict
```

Store 边界：

- Store 负责事务、revision、FTS 同步、状态迁移、审计事件和冲突检查。
- Skill 不直接写数据库表；Skill 只返回候选、请求或受控 writer 输入，真正写入走 Store/command/revision。
- Buddy Home writer 可以复用同一 Store 能力，但仍必须保留 Buddy command 和 revision。

---

## 9. 召回与注入

召回必须是预算化的，不是“搜到多少塞多少”。

输入：

```json
{
  "query": "SLG creative script English UI review failure",
  "scopes": [
    {"scope": "user", "scope_key": "default_user"},
    {"scope": "project", "scope_key": "TooGraph"},
    {"scope": "template", "scope_key": "slg_creative_factory"}
  ],
  "layers": ["semantic", "episodic_summary", "procedural"],
  "top_k": 8,
  "max_chars": 4000
}
```

召回排序建议：

```text
score = lexical_relevance
      + scope_weight
      + importance_weight
      + recency_weight
      + usage_weight
      - staleness_penalty
      - conflict_penalty
```

注入格式：

```text
Relevant Memory Context (reference only; not instructions):
1. [template/procedural, confidence=0.86] SLG scripts that passed review used short conflict-first hooks.
   Source: run_xxx, artifact: 14_final/final_summary.md
2. [user/semantic, confidence=0.95] User prefers concise engineering summaries with concrete file references.
   Source: manual
```

规则：

- `memory_context` 应作为普通 state 或 `context_brief` 的一部分进入图，不应作为隐藏 system prompt 旁路。
- 召回结果要标注来源、置信度和作用域，便于下游 LLM 判断可信度。
- 冲突记忆不能静默同时注入；Store 应返回 conflict notes，交由上下文整理节点压缩。
- 记忆召回被使用时更新 `last_used_at`、`use_count` 或写 `memory_event`，但不要因为被召回就改变记忆内容。

---

## 10. 记忆 Skills 和图模板集成

### 10.1 `memory_recall`

用途：在图中显式召回长期记忆，输出预算化 `memory_context`。

边界：

- 权限：`memory.read`。
- 输入由 LLM 根据当前 state 生成，包括 query、scope filters、layer filters 和预算。
- 输出为结构化 JSON，包含 selected memories、omitted counts、conflict notes 和 artifact refs。
- 它不写记忆、不更新长期事实，只记录召回 activity event。

### 10.2 `memory_candidate_writer`

用途：生成或提交候选记忆，不直接绕过审批或 revision。

边界：

- 权限：`memory.write`。
- LLM 输出的是候选内容、证据、作用域、风险等级和推荐动作。
- 低风险自动写回只能由明确的后台复盘模板或受控 writer 应用。
- 高风险或用户可见行为边界变化必须进入标准 `awaiting_human` 或被 writer 拒绝。

### 10.3 Buddy 自主复盘

Buddy 的低风险记忆写回继续由 `buddy_autonomous_review` + `buddy_home_writer` 表达。该后台图读取主 run snapshot，生成候选，判断是否应用，并通过 command/revision 写回 Buddy Home。它不阻塞下一轮用户对话。

### 10.4 业务模板

业务模板可以显式包含：

```text
Input / context
  -> memory_recall
  -> domain planning
  -> capability execution
  -> result review
  -> memory_candidate_writer
  -> output
```

写入成功经验、失败经验和模板偏好时，模板应先产出候选和证据，最终由审批或后台复盘决定是否应用。

---

## 11. 验收标准

P0 验收必须覆盖：

- 可以创建、搜索、更新、归档和 supersede 记忆，并保留 revision。
- 可以创建候选记忆、应用候选、拒绝候选，并记录来源 run / node / skill / template。
- 可以按 layer、memory_type、scope、scope_key、status、tag、source_run_id 过滤。
- 搜索返回相关记忆、score、source、confidence、artifact refs 和 conflict notes。
- `memory_recall` Skill 可在图中输出预算化 `memory_context`。
- `memory_candidate_writer` 或等价受控 writer 可生成候选记忆，并通过运行时权限策略、后台复盘或用户审批应用。
- 召回内容以 “reference only / context only” 注入，不作为系统指令或权限来源。
- Buddy Home 写回、profile、session summary、memory 和 capability usage stats 使用 command/revision 路径。
- SLG Creative Factory 模板至少能读取一条模板作用域记忆，并在输出中体现其影响。
- SLG Creative Factory 模板能把成功/失败经验作为候选记忆写回，且候选可追溯证据。

---

# P0-2：SLG Creative Factory 模板

## 12. 模板目标

将 SLG 买量创意生产流程整理为 TooGraph 模板。该模板用于展示 TooGraph 如何承载一个复杂业务 Agent 工作流。

模板重点不是直接复刻单文件代码，而是将其流程拆成 TooGraph 的：

- Graph State。
- Agent 节点。
- Condition 节点。
- Skill 节点。
- Artifacts。
- 长期记忆。
- Knowledge。
- Eval Case。

模板名称建议：

```text
SLG Creative Factory
```

模板定位：

```text
基于新闻辅助上下文、Facebook Ad Library / 竞品广告素材、视频理解结果和创意评审机制，
生成 SLG 买量创意 Brief、多版本 15s 脚本、图片分镜脚本、两类视频生成提示词、评审结果和最终交付包。
```

---

## 13. 模板核心流程

TooGraph 模板应整理为以下流程：

```text
初始化运行目录 / 输入配置
  ↓
抓取 RSS 新闻
  ↓
清洗新闻并提炼辅助上下文
  ↓
抓取 Facebook Ad Library / 竞品广告素材
  ↓
规范化广告素材
  ↓
选择 Top N 视频素材
  ↓
视频理解 / 文本降级分析
  ↓
总结竞品创意模式
  ↓
总结新闻辅助上下文
  ↓
生成 Creative Brief
  ↓
生成多版本创意脚本
  ↓
生成图片分镜脚本
  ↓
生成两类视频提示词
  ↓
评审创意版本
  ↓
是否需要返修？
    ├─ 是：带反馈回到“生成多版本创意脚本”
    └─ 否：继续
  ↓
输出图片生成 TODO 清单
  ↓
输出视频生成 TODO 清单
  ↓
生成最终摘要、最佳版本和完整 Artifacts
  ↓
生成候选记忆 / 进入 Eval
```

---

## 14. 推荐 Graph 节点

| TooGraph 节点 | 类型 | 作用 |
|---|---|---|
| `input_config` | input | 输入项目配置、品类、搜索词、生成版本数 |
| `fetch_rss` | agent + skill | 抓取海外游戏媒体 RSS |
| `clean_news` | agent | 清洗新闻，提炼对创意有帮助的信息 |
| `fetch_ads` | agent + skill | 抓取 Facebook Ad Library 竞品广告 |
| `normalize_inputs` | agent/skill | 扁平化广告素材，统一结构 |
| `select_top_videos` | agent/skill | 选择可进入分析的 Top N 视频 |
| `analyze_videos` | agent + video model | 对视频素材做结构拆解 |
| `extract_patterns` | agent | 总结竞品爆款模式 |
| `news_context` | agent | 生成新闻辅助上下文 |
| `build_brief` | agent | 生成 Creative Brief |
| `generate_variants` | agent | 生成多版本创意脚本 |
| `generate_storyboards` | agent/skill | 生成图片分镜包 |
| `generate_video_prompts` | agent/skill | 生成两类视频提示词 |
| `review_variants` | agent | 打分评审并输出是否返修 |
| `condition_needs_revision` | condition | 判断是否进入返修循环 |
| `todo_image_generation` | output/skill | 输出图片生成待接入清单 |
| `todo_video_generation` | output/skill | 输出视频生成待接入清单 |
| `finalize` | agent/output | 汇总最终交付物 |
| `memory_candidate_writer` | agent + skill | 生成带证据的成功经验或失败经验候选 |

---

## 15. 推荐 State Schema

```json
{
  "pipeline_config": {
    "type": "json",
    "description": "运行配置，包括品类、搜索词、版本数、抓取数量、评分阈值等"
  },
  "rss_items": {
    "type": "json",
    "description": "RSS 原始新闻"
  },
  "clean_news_items": {
    "type": "json",
    "description": "清洗后的新闻辅助信息"
  },
  "ad_items": {
    "type": "json",
    "description": "广告抓取结果"
  },
  "normalized_video_items": {
    "type": "json",
    "description": "扁平化后的广告视频素材"
  },
  "selected_video_items": {
    "type": "json",
    "description": "最终进入分析的 Top N 视频素材"
  },
  "video_analysis_results": {
    "type": "json",
    "description": "视频理解 / 文本降级分析结果"
  },
  "news_context": {
    "type": "markdown",
    "description": "新闻辅助上下文"
  },
  "pattern_summary": {
    "type": "markdown",
    "description": "竞品创意模式总结"
  },
  "creative_brief": {
    "type": "markdown",
    "description": "创意 Brief"
  },
  "script_variants": {
    "type": "json",
    "description": "多版本创意脚本"
  },
  "storyboard_packages": {
    "type": "json",
    "description": "图片分镜包"
  },
  "video_prompt_packages": {
    "type": "json",
    "description": "两类视频生成提示词"
  },
  "review_results": {
    "type": "json",
    "description": "创意版本评分结果"
  },
  "best_variant": {
    "type": "json",
    "description": "推荐创意版本"
  },
  "image_generation_todo": {
    "type": "json",
    "description": "图片生成节点待接入清单"
  },
  "video_generation_todo": {
    "type": "json",
    "description": "视频生成节点待接入清单"
  },
  "revision_round": {
    "type": "number",
    "description": "当前返修轮次"
  },
  "needs_revision": {
    "type": "boolean",
    "description": "是否需要返修"
  },
  "revision_feedback": {
    "type": "json",
    "description": "评审打回意见"
  },
  "step_files": {
    "type": "json",
    "description": "每一步生成的本地文件路径"
  },
  "warnings": {
    "type": "json",
    "description": "运行告警"
  },
  "errors": {
    "type": "json",
    "description": "运行错误"
  }
}
```

---

## 16. 模板配置项

```json
{
  "project_name": "slg_creative_factory",
  "genre": "SLG",
  "country": "US",
  "days_back": 7,
  "script_variants_count": 3,
  "top_fetch_per_term": 5,
  "top_n_video_analysis": 20,
  "max_revision_rounds": 2,
  "min_pass_score": 7.8,
  "video_fps_for_understanding": 1,
  "news_items_per_feed": 15,
  "enable_rss_fetch": true,
  "enable_fb_ads_fetch": true,
  "search_terms": [
    "SLG",
    "Whiteout Survival",
    "Last War Survival",
    "State of Survival"
  ],
  "target_feeds": {
    "PocketGamer.biz": "https://www.pocketgamer.biz/rss/",
    "GameDeveloper": "https://www.gamedeveloper.com/rss.xml",
    "GamesIndustry.biz": "https://www.gamesindustry.biz/feed"
  }
}
```

---

## 17. 模板 Skill 拆分建议

### 17.1 `rss_fetcher`

职责：

- 根据 RSS 源列表抓取新闻。
- 输出原始新闻列表。
- 保留 source、title、link、summary、published、fetch_time。

输出：

```json
{
  "rss_items": [
    {
      "source": "PocketGamer.biz",
      "title": "...",
      "link": "...",
      "summary": "...",
      "published": "...",
      "fetch_time": "..."
    }
  ]
}
```

---

### 17.2 `article_extractor`

职责：

- 抽取文章正文。
- 转为 Markdown。
- 提取文章内视频链接。
- 作为 RSS 抓取的增强步骤。

可与 `rss_fetcher` 合并，也可拆为独立 Skill。

---

### 17.3 `facebook_ad_library_fetcher`

职责：

- 根据搜索词、国家、日期范围访问 Facebook Ad Library。
- 抓取页面文本、外链、视频 URL。
- 下载 Top N 视频到 Artifacts。
- 输出广告素材列表。

权限：

```json
["network.request", "filesystem.write", "artifact.write"]
```

该 Skill 应默认需要用户确认或显式启用，因为它涉及外部网络访问和文件写入。

---

### 17.4 `ad_normalizer`

职责：

- 将抓取结果扁平化。
- 每个广告视频变成一个 `normalized_video_item`。
- 保留本地视频路径、远程 URL、关键词、排名、页面文本。

---

### 17.5 `top_video_selector`

职责：

- 优先选择本地已下载视频。
- 按 video_rank、keyword 排序。
- 选择 Top N 进入视频理解。

---

### 17.6 `video_understanding`

职责：

- 调用本地视频理解模型。
- 对单条视频进行 SLG 买量创意拆解。
- 如果视频不可用，则使用广告文本做保守分析。

输出字段：

```json
{
  "hook_type": "前3秒钩子类型",
  "opening_summary": "前3秒发生了什么",
  "core_conflict": "核心冲突",
  "selling_points": ["卖点1", "卖点2"],
  "narrative_structure": ["阶段1", "阶段2", "阶段3"],
  "visual_patterns": ["镜头语言1", "镜头语言2"],
  "ui_or_feedback_patterns": ["数值/UI反馈1", "数值/UI反馈2"],
  "emotion_curve": "情绪变化",
  "slg_relevance": "与 SLG 买量的相关性",
  "reusable_formula": "可迁移创意骨架",
  "risks": ["不宜照搬点1", "不宜照搬点2"],
  "one_sentence_takeaway": "一句话总结"
}
```

---

### 17.7 `storyboard_package_builder`

职责：

- 从 `script_variants` 生成图片分镜包。
- 每个版本生成 5～6 个关键帧。
- 每个关键帧包含中文画面描述，但 UI / 字幕 / 配音必须为英文。
- 输出 Markdown 和 JSON 两种格式。

---

### 17.8 `video_prompt_package_builder`

职责：

为每个创意版本生成两类视频提示词：

1. **纯文本 15s 视频提示词**  
   适合直接交给视频生成模型。
2. **基于图片分镜的视频提示词**  
   适合先生成关键帧，再基于关键帧生成视频。

---

### 17.9 `creative_review`

职责：

- 对创意版本评分。
- 判断是否通过。
- 输出最佳版本。
- 输出返修意见。

评分维度：

| 维度 | 含义 |
|---|---|
| `hook_strength` | 前 3 秒抓人能力 |
| `slg_relevance` | SLG 题材和卖点契合度 |
| `competitor_pattern_fit` | 对竞品爆款模式的吸收程度 |
| `scene_generatability` | 后续视觉生成可执行性 |
| `prompt_completeness` | 视频提示词和图片分镜是否完整 |
| `ui_english_compliance` | UI、字幕、配音是否满足英文约束 |
| `differentiation` | 多版本之间差异度 |
| `production_value` | 整体完成度 |

---

## 18. 创意返修循环

模板需要保留返修循环：

```text
review_variants
  ↓
condition_needs_revision
  ├─ true 且 revision_round <= max_revision_rounds
  │    ↓
  │  generate_variants
  │    ↓
  │  generate_storyboards
  │    ↓
  │  generate_video_prompts
  │    ↓
  │  review_variants
  │
  └─ false 或超过最大轮次
       ↓
     todo_image_generation
```

Condition 逻辑：

```python
if needs_revision and revision_round <= max_revision_rounds:
    return "generate"
return "todo_image"
```

---

## 19. 输出 Artifacts 规范

模板运行后，应生成以下 Artifacts：

```text
00_config/config.json
00_config/workflow_mermaid.md

01_raw_news/rss_raw.json
02_clean_news/news_cleaned.json

03_raw_ads/ads_raw.json
03_raw_ads/videos/<keyword>/*.mp4

04_normalized/normalized_video_items.json
05_selected_videos/selected_video_items.json

06_video_analysis/video_analysis_results.json
06_video_analysis/items/<item_id>.json

07_patterns/pattern_summary.md
08_news_context/news_context.md
09_brief/creative_brief.md

10_script_variants/script_variants_round_1.json
11_storyboards/storyboard_packages_round_1.json
11_storyboards/storyboards_showcase_round_1.md

12_video_prompts/video_prompt_packages_round_1.json
12_video_prompts/video_prompts_showcase_round_1.md

13_review/review_round_1.json

14_final/final_summary.md
14_final/best_variant.json
14_final/all_video_prompt_packages.json
14_final/all_storyboard_packages.json
14_final/final_state.json

99_todo/todo_image_generation.json
99_todo/todo_image_generation.md
99_todo/todo_video_generation.json
99_todo/todo_video_generation.md
99_todo/todo_next_steps.md
```

TooGraph 中可以不完全按本地目录实现，但至少要将这些作为 Run Artifacts 展示。

---

## 20. 模板的长期记忆集成

模板启动前显式召回：

- `semantic`：用户偏好、项目事实、稳定约束。
- `procedural`：模板经验、Skill 降级策略、评审规则。
- `episodic_summary`：相似任务的精炼运行摘要。
- `capability_stat`：能力成功率、常见失败原因和成本提示。

推荐召回 query：

```text
SLG creative factory script generation English UI video prompt review failure
```

模板结束后不直接写长期记忆；它应输出候选记忆和证据，由审批或后台复盘决定是否应用。

### 20.1 成功经验候选

```json
{
  "layer": "episodic_summary",
  "memory_type": "task_result",
  "scope": "template",
  "scope_key": "slg_creative_factory",
  "title": "本轮通过的 SLG 创意版本",
  "summary": "最佳版本采用冲突先行 Hook，英文 UI 合规，评审分数达到阈值。",
  "content": "记录最佳版本、评分、Hook 类型、核心冲突、可复用骨架和最终 artifact refs。",
  "source_kind": "template_review",
  "source_run_id": "<run_id>",
  "evidence": ["review_round_1.json score >= threshold", "final_summary.md"],
  "artifact_refs": ["14_final/final_summary.md", "14_final/best_variant.json"],
  "confidence": 0.8,
  "importance": 4
}
```

### 20.2 失败经验候选

```json
{
  "layer": "procedural",
  "memory_type": "reflection",
  "scope": "template",
  "scope_key": "slg_creative_factory",
  "title": "本轮创意被打回原因",
  "summary": "低分原因是 Hook 不够明确、镜头描述过空泛或英文 UI 不合规。",
  "content": "记录评审反馈、失败版本、触发返修的条件和下次应避免的生成策略。",
  "source_kind": "template_review",
  "source_run_id": "<run_id>",
  "evidence": ["review_round_1.json", "revision feedback"],
  "confidence": 0.85,
  "importance": 4
}
```

### 20.3 Skill 经验记忆

```json
{
  "layer": "procedural",
  "memory_type": "skill_experience",
  "scope": "skill",
  "scope_key": "video_understanding",
  "title": "视频分析降级策略",
  "summary": "视频不可用时使用广告文本和外链信息保守推断，并标记证据等级。",
  "content": "当视频文件不可用时，应使用广告页面文本和外链信息做保守拆解，并明确标记为文本推断。",
  "source_kind": "capability_review",
  "source_run_id": "<run_id>",
  "evidence": ["video_analysis_results.json contains fallback=true"],
  "confidence": 0.9,
  "importance": 3
}
```

---

## 21. 模板验收标准

P0 验收必须覆盖：

- 能在 TooGraph 中以模板形式创建 SLG Creative Factory Graph。
- 能配置搜索词、版本数、Top N、评分阈值、最大返修轮数。
- 能运行完整流程，至少在关闭外部抓取时可以使用 mock data 跑通。
- 能生成 creative brief。
- 能生成多版本创意脚本。
- 能生成图片分镜包。
- 能生成两类视频提示词。
- 能对版本评分。
- 能根据评分条件进入返修循环。
- 能输出最佳版本。
- 能输出图片生成 TODO 和视频生成 TODO。
- 能将最终结果写入 Run Artifacts。
- 能将成功/失败经验作为候选记忆输出，并保留 evidence 与 artifact refs。

---

# P0-3：文档与模板展示

## 22. 文档目标

P0 阶段需要把项目目标、模板逻辑、使用方式写清楚，方便后续开发和展示。

建议新增：

```text
docs/development/p0_p1_development_goals.md
docs/templates/slg_creative_factory.md
docs/memory/long_term_memory_system.md
docs/examples/slg_creative_factory_run.md
```

---

## 23. `docs/templates/slg_creative_factory.md` 建议结构

```text
# SLG Creative Factory Template

## 1. 模板目标
## 2. 输入配置
## 3. Graph State
## 4. 节点流程
## 5. Skill 列表
## 6. 返修循环
## 7. 输出 Artifacts
## 8. 长期记忆集成
## 9. Mock Data 模式
## 10. 示例输出
```

---

## 24. Mock Data 模式

为保证模板稳定可演示，必须提供 mock data 模式。

配置：

```json
{
  "enable_rss_fetch": false,
  "enable_fb_ads_fetch": false,
  "use_mock_inputs": true
}
```

Mock 输入包括：

```text
mock_rss_items.json
mock_clean_news_items.json
mock_ad_items.json
mock_normalized_video_items.json
mock_video_analysis_results.json
```

目标：

- 不依赖 Facebook Ad Library。
- 不依赖 Playwright。
- 不依赖视频下载。
- 不依赖网络。
- 能稳定跑完整模板。
- 方便 Eval。

---

# P1-1：Hybrid RAG 知识库升级

## 25. 模块目标

当前 Knowledge 已具备基础文档表和 FTS5 检索能力。P1 阶段将其升级为 Hybrid RAG，使 Agent 能够更稳定地从文档、模板说明、历史案例中检索上下文。

目标链路：

```text
Query
  ↓
Query Rewrite
  ↓
FTS Keyword Recall
  ↓
Vector Semantic Recall
  ↓
Hybrid Merge
  ↓
Rerank
  ↓
Context Pack
  ↓
Citation Grounding
```

---

## 26. Embedding 数据表

增加：

```sql
CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
    chunk_id TEXT PRIMARY KEY,
    kb_id TEXT NOT NULL,
    embedding_provider TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dim INTEGER NOT NULL,
    embedding_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

MVP 阶段可以使用 SQLite 存储 embedding JSON。后续再替换为：

- FAISS。
- pgvector。
- Qdrant。
- Milvus。

---

## 27. RAG API

新增：

```text
POST /api/knowledge/bases/{kb_id}/rebuild-embeddings
POST /api/knowledge/retrieve
GET  /api/knowledge/search
POST /api/knowledge/evaluate
```

### 27.1 Retrieve 请求

```json
{
  "query": "SLG Creative Factory 如何处理返修循环？",
  "knowledge_base": "toograph_docs",
  "top_k": 8,
  "retrieval_mode": "hybrid",
  "filters": {
    "source_kind": "docs"
  }
}
```

### 27.2 Retrieve 返回

```json
{
  "query": "SLG Creative Factory 如何处理返修循环？",
  "mode": "hybrid",
  "results": [
    {
      "chunk_id": "slg_template:revision_loop:1",
      "kb_id": "toograph_docs",
      "doc_id": "slg_creative_factory",
      "title": "返修循环",
      "section": "Creative Review",
      "content": "...",
      "summary": "...",
      "url": "...",
      "scores": {
        "fts": 0.62,
        "vector": 0.81,
        "rerank": 0.88,
        "final": 0.84
      },
      "citation": {
        "chunk_id": "slg_template:revision_loop:1",
        "doc_id": "slg_creative_factory",
        "section": "Creative Review"
      }
    }
  ]
}
```

---

## 28. Hybrid 评分策略

MVP 版本：

```text
final_score = 0.45 * vector_score
            + 0.35 * fts_score
            + 0.20 * metadata_boost
```

如果没有 reranker：

```text
final_score = 0.60 * vector_score
            + 0.30 * fts_score
            + 0.10 * title_boost
```

如果接入 reranker：

```text
final_score = 0.50 * rerank_score
            + 0.30 * vector_score
            + 0.20 * fts_score
```

---

## 29. Context Pack 格式

Agent 不应该直接拿原始 chunk 拼 Prompt，应先构造 Context Pack：

```json
{
  "query": "SLG Creative Factory 如何处理返修循环？",
  "knowledge_base": "toograph_docs",
  "contexts": [
    {
      "citation_id": "ctx_1",
      "chunk_id": "slg_template:revision_loop:1",
      "title": "返修循环",
      "section": "Creative Review",
      "content": "模板在 review_variants 后通过 condition_needs_revision 判断是否返回 generate_variants...",
      "score": 0.84
    }
  ],
  "instructions": [
    "回答必须基于 contexts。",
    "如果上下文不足，说明不足。",
    "输出中保留 citation_ids。"
  ]
}
```

---

## 30. RAG 与 SLG 模板集成

SLG Creative Factory 可以使用 Knowledge 存储：

- 品类策略文档。
- 历史成功脚本。
- 历史失败案例。
- 英文 UI 合规规则。
- Prompt 生成规范。
- 评分标准。
- 视频生成模型限制。

在节点中使用：

```text
build_brief
  读取：pattern_summary + news_context + knowledge_context + memory_context

generate_variants
  读取：creative_brief + competitor_patterns + historical_success_cases

review_variants
  读取：review_rules + english_ui_rules + production_constraints
```

---

## 31. RAG 验收标准

P1 验收必须覆盖：

- 可以对指定 Knowledge Base 生成 Embedding。
- 可以执行 FTS 检索。
- 可以执行 Vector 检索。
- 可以执行 Hybrid 检索。
- Retrieve API 返回 Context Pack。
- Context Pack 包含 citation 信息。
- Agent 节点可以使用 Knowledge Context。
- 至少准备一个 `slg_creative_factory_docs` 知识库。
- 至少准备 10 条可检索的模板说明 / 策略 / 评分规则文档。

---

# P1-2：Agent Eval 评测体系

## 32. 模块目标

Agent Eval 用于评估 TooGraph 中 Agent Graph 的稳定性、输出质量和工具调用正确性。

P1 阶段先实现轻量版 Eval，不追求复杂平台化。

核心能力：

- 创建 Eval Suite。
- 创建 Eval Case。
- 运行 Eval。
- 记录每个 Case 的 Run。
- 汇总指标。
- 支持人工规则和 LLM Judge。
- 支持 SLG Creative Factory 模板回归测试。

---

## 33. Eval 数据表

```sql
CREATE TABLE IF NOT EXISTS eval_suites (
    suite_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    graph_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_cases (
    case_id TEXT PRIMARY KEY,
    suite_id TEXT NOT NULL,
    name TEXT NOT NULL,
    input_values_json TEXT NOT NULL,
    expected_json TEXT NOT NULL DEFAULT '{}',
    judge_config_json TEXT NOT NULL DEFAULT '{}',
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_runs (
    eval_run_id TEXT PRIMARY KEY,
    suite_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS eval_case_results (
    result_id TEXT PRIMARY KEY,
    eval_run_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    run_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    judge_result_json TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT ''
);
```

---

## 34. Eval API

```text
GET  /api/evals/suites
POST /api/evals/suites
GET  /api/evals/suites/{suite_id}
POST /api/evals/suites/{suite_id}/cases
GET  /api/evals/suites/{suite_id}/cases
POST /api/evals/suites/{suite_id}/run
GET  /api/evals/runs/{eval_run_id}
```

---

## 35. Eval Case 格式

```json
{
  "case_id": "slg_001",
  "suite_id": "slg_creative_factory_eval",
  "name": "基础 SLG 创意生成",
  "input_values": {
    "pipeline_config": {
      "genre": "SLG",
      "script_variants_count": 3,
      "enable_rss_fetch": false,
      "enable_fb_ads_fetch": false,
      "use_mock_inputs": true
    }
  },
  "expected": {
    "required_outputs": [
      "creative_brief",
      "script_variants",
      "storyboard_packages",
      "video_prompt_packages",
      "review_results",
      "best_variant"
    ],
    "min_variants_count": 3,
    "max_revision_rounds": 2,
    "required_language_constraints": {
      "ui_text_en": "english_only",
      "voiceover_en": "english_only"
    }
  },
  "judge_config": {
    "rule_based": true,
    "llm_judge": true,
    "min_pass_score": 7.8
  },
  "tags": ["slg", "template", "creative"]
}
```

---

## 36. Eval 指标

### 36.1 通用指标

| 指标 | 含义 |
|---|---|
| `case_pass_rate` | Case 通过率 |
| `graph_success_rate` | Graph 运行成功率 |
| `structured_output_valid_rate` | 结构化输出通过率 |
| `repair_attempt_rate` | JSON repair 触发率 |
| `repair_success_rate` | JSON repair 成功率 |
| `avg_latency_ms` | 平均耗时 |
| `p95_latency_ms` | P95 耗时 |
| `node_failure_count` | 节点失败数 |
| `warning_count` | 告警数 |

### 36.2 Skill 指标

| 指标 | 含义 |
|---|---|
| `expected_skill_hit_rate` | 预期 Skill 是否被调用 |
| `skill_success_rate` | Skill 成功率 |
| `skill_timeout_count` | Skill 超时次数 |
| `skill_error_count` | Skill 错误次数 |

### 36.3 SLG 模板专用指标

| 指标 | 含义 |
|---|---|
| `brief_generated` | 是否生成 Brief |
| `variants_count_valid` | 创意版本数是否符合预期 |
| `storyboard_generated` | 是否生成图片分镜 |
| `video_prompts_generated` | 是否生成两类视频提示词 |
| `review_generated` | 是否生成评审结果 |
| `best_variant_selected` | 是否选出最佳版本 |
| `english_ui_compliance` | UI / 配音英文约束是否通过 |
| `revision_loop_valid` | 返修循环是否符合最大轮次 |
| `todo_outputs_generated` | 图片 / 视频 TODO 是否生成 |

---

## 37. Rule-based Judge

先实现规则评测，不依赖模型：

```text
1. creative_brief 非空。
2. script_variants 数量 >= 配置数量。
3. 每个 variant 有 variant_id、strategy_name、hook、shot_list。
4. 每个 shot 有 visual_description_cn、ui_text_en、voiceover_en。
5. ui_text_en 不包含中文。
6. voiceover_en 不包含中文。
7. storyboard_packages 非空。
8. video_prompt_packages 非空。
9. review_results 非空。
10. best_variant 非空。
```

---

## 38. LLM Judge

可选实现，用于评估质量：

Prompt 目标：

```text
请作为 SLG 买量创意评审，根据以下标准评估该输出是否可用：
1. 前 3 秒 Hook 是否明确。
2. 核心冲突是否清晰。
3. 是否符合 SLG 题材。
4. 是否有数值 / UI / 成长反馈。
5. 图片分镜是否可生成。
6. 视频提示词是否可执行。
7. 英文 UI / 英文配音是否合规。
```

输出：

```json
{
  "pass": true,
  "score": 8.1,
  "strengths": ["Hook 清晰", "镜头可执行"],
  "issues": ["部分数值反馈可以更明确"],
  "suggestions": ["加强第 2 镜头的敌我数量对比"]
}
```

---

## 39. SLG Creative Factory Eval Suite

至少准备 8～10 个 Case：

| case_id | 名称 | 目的 |
|---|---|---|
| `slg_001` | 基础创意生成 | 验证完整链路 |
| `slg_002` | 关闭 RSS | 验证无新闻时仍能生成 |
| `slg_003` | 关闭 Ads，使用 mock | 验证稳定演示 |
| `slg_004` | 英文 UI 合规 | 验证不出现中文 UI / 配音 |
| `slg_005` | 返修循环 | 验证低评分后能进入返修 |
| `slg_006` | 最大返修轮次 | 验证超过最大轮次能停止 |
| `slg_007` | 视频分析失败降级 | 验证无视频时使用文本分析 |
| `slg_008` | 多版本差异度 | 验证不同版本策略不同 |
| `slg_009` | TODO 输出 | 验证图片 / 视频生成 TODO 完整 |
| `slg_010` | 记忆召回 | 验证模板能读取长期记忆并影响生成 |

---

## 40. Eval 验收标准

P1 验收必须覆盖：

- 可以创建 Eval Suite。
- 可以创建 Eval Case。
- 可以运行 Eval Suite。
- 每个 Eval Case 产生对应 Run。
- Eval Run 记录状态和汇总指标。
- SLG Creative Factory 至少有 8 个 Eval Case。
- Rule-based Judge 能判断基础合规。
- 至少一个 Case 验证长期记忆召回。
- 至少一个 Case 验证返修循环。
- 至少一个 Case 验证英文 UI 合规。
- Eval 结果能在前端或 API 中查看。

---

# 41. 推荐开发顺序

## 第 1 周：完成 P0 核心

目标：让项目具备长期记忆和可展示业务模板。

任务：

1. 扩展 SQLite schema：`memories`、`memory_revisions`、`memory_events`、`memories_fts`。
2. 实现长期记忆 Store、候选写回和 revision。
3. 实现记忆 API：列表、搜索、候选、应用、拒绝、归档、supersede、revision 查询。
4. 实现预算化记忆召回和冲突提示。
5. 新增 `memory_recall` 和 `memory_candidate_writer` Skills。
6. 新建 SLG Creative Factory 模板文档。
7. 在 TooGraph 中搭建 SLG Creative Factory Graph。
8. 准备 Mock Data 模式。
9. 跑通模板最小链路。
10. 输出 README / 示例文档。

完成标志：

```text
可以在无外部网络依赖的情况下运行 SLG Creative Factory 模板，
生成 brief、variants、storyboards、video prompts、review、final summary，
并能召回长期记忆、输出候选记忆和追溯写回证据。
```

---

## 第 2 周：完成 P1 能力

目标：让项目具备知识库增强和评测闭环。

任务：

1. 增加 `knowledge_chunk_embeddings`。
2. 实现 embedding provider。
3. 实现 vector recall。
4. 实现 hybrid retrieve API。
5. 实现 Context Pack。
6. 实现 Citation 输出。
7. 创建 `slg_creative_factory_docs` 知识库。
8. 新增 Eval 数据表。
9. 实现 Eval API。
10. 创建 SLG Creative Factory Eval Suite。
11. 跑通至少 8 个 Eval Case。

完成标志：

```text
可以对 SLG Creative Factory 模板运行 Eval，
看到 pass rate、structured output valid rate、English UI compliance、
revision loop validity、best variant selection 等指标。
```

---

# 42. 最终验收清单

## P0 验收清单

- [ ] 长期记忆使用 SQLite 存储，包含主表、revision、event 和 FTS。
- [ ] 长期记忆支持候选、应用、拒绝、更新、归档和 supersede。
- [ ] 长期记忆支持 FTS 搜索和预算化召回。
- [ ] 长期记忆支持 layer / memory_type / scope / scope_key / status 过滤。
- [ ] 长期记忆支持 source_run_id、source_node_id、source_skill_key、source_template_id 追溯。
- [ ] `memory_recall` Skill 可用。
- [ ] `memory_candidate_writer` Skill 或等价受控 writer 可用，并通过运行时权限、后台复盘或用户审批应用。
- [ ] 图模板可以接收 `memory_context`，且注入文本明确标注为参考上下文。
- [ ] SLG Creative Factory 模板文档完成。
- [ ] SLG Creative Factory Graph 搭建完成。
- [ ] 模板支持 Mock Data。
- [ ] 模板可生成 creative brief。
- [ ] 模板可生成多版本脚本。
- [ ] 模板可生成图片分镜。
- [ ] 模板可生成两类视频提示词。
- [ ] 模板可生成评审结果。
- [ ] 模板支持返修循环。
- [ ] 模板可输出 final summary。
- [ ] 模板可输出成功/失败经验候选记忆，并保留 evidence 与 artifact refs。

## P1 验收清单

- [ ] Knowledge 支持 embedding 表。
- [ ] Knowledge 支持 embedding rebuild。
- [ ] Knowledge 支持 vector recall。
- [ ] Knowledge 支持 hybrid retrieve。
- [ ] Retrieve 返回 Context Pack。
- [ ] Context Pack 包含 citation。
- [ ] Agent 节点可使用 Knowledge Context。
- [ ] 创建 SLG Creative Factory 文档知识库。
- [ ] Eval Suite 数据表完成。
- [ ] Eval Case 数据表完成。
- [ ] Eval Run 数据表完成。
- [ ] Eval API 完成。
- [ ] Rule-based Judge 完成。
- [ ] SLG Creative Factory 至少 8 个 Eval Case。
- [ ] Eval 汇总指标可查看。
- [ ] 至少一个 Eval Case 验证长期记忆召回。
- [ ] 至少一个 Eval Case 验证返修循环。
- [ ] 至少一个 Eval Case 验证英文 UI 合规。

---

# 43. 完成后的项目定位

完成 P0～P1 后，TooGraph 的定位应更新为：

```text
TooGraph 是一个面向 Agent 应用开发的可视化编排与运行观察平台。
它通过 node_system 协议统一管理 Graph、State、Agent 节点、Condition、Subgraph、Skills、Memory、Knowledge 和 Eval。
TooGraph 支持将复杂业务流程模板化，并通过 LangGraph Runtime 执行、观察、恢复和评估。
```

SLG Creative Factory 模板作为核心示例，用来证明 TooGraph 可以承载：

- 外部资料抓取。
- 竞品素材分析。
- 多模态理解。
- 创意 Brief 生成。
- 多版本脚本生成。
- 图片分镜生成。
- 视频提示词生成。
- 自动评审。
- 返修循环。
- Memory 沉淀。
- Eval 回归测试。

---

# 44. 后续 P2 方向预留

P0～P1 完成后，后续可以进入 P2：

- Run Worker Queue。
- Redis / RQ / Celery / Temporal。
- Worker Heartbeat。
- Cancel Token。
- Retry Policy。
- Dead Letter Queue。
- Skill Sandbox。
- Skill Audit Log。
- Secret Manager。
- 多租户权限。
- Docker 部署。
- Metrics / Tracing / Alerts。

这些能力暂不作为本阶段交付要求。
