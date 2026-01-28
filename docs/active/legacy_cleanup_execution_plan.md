# 历史遗留清理与链路收口改造计划

更新时间：2026-04-13

## 1. 目标

本计划用于收口当前仓库里已经确认的几类问题：

- 删除 `default_theme_preset` 及相关残留调用
- 让 skill 在“导入后即可注册并可运行”的链路上闭环
- 删除 `inherit`，统一 agent thinking 配置语义
- 把 `memory` 明确标注为未来能力，而不是当前已交付能力
- 删除或归档过期文档，统一当前 source of truth

本计划以 `demo/GraphiteUI 仓库冗余与冲突代码深度分析报告.pdf` 的结论和当前仓库现状为依据。

## 2. 本轮改造原则

- 先收口协议，再调整 UI 文案和文档
- 先消灭“可见但不可用”的半状态，再考虑扩展能力
- 先把当前主链说明白，再保留未来方向
- 每一步都必须有可验证结果，避免只改描述不改链路

## 3. 范围

本轮纳入范围：

- settings / templates 契约清理
- skill catalog / import / runtime register / editor 选择链路
- agent thinking mode 前后端协议统一
- memory 相关代码与文档定位收口
- 过期文档清理与 README 对齐
- 与上述问题直接相关的中小型技术债清理

本轮不纳入范围：

- 通用 OpenClaw / Codex 外部 skill 运行器
- 完整 memory 写入、检索、长期记忆系统
- 大规模 editor 交互重构
- 新模板体系扩展

## 4. 执行前基线

执行任何代码改动前，先完成一次基线确认。

检查项：

- 确认 `/api/settings` 当前返回或报错状态
- 确认编辑器当前 skill 来源仍是 `/api/skills/definitions`
- 确认仓库内 `default_theme_preset`、`theme_preset`、`inherit`、`memory` 残留位置
- 确认哪些文档仍把 memory、主题预设、旧前端脚手架写成当前能力

建议命令：

```bash
./scripts/start.sh
curl --noproxy '*' -i http://127.0.0.1:8765/api/settings
rg -n "default_theme_preset|theme_preset|\binherit\b|memory|skills/definitions" .
```

通过标准：

- 能拿到当前问题清单和精确位置
- 后续每一阶段都能基于同一份基线做回归验证

## 5. 分阶段改造计划

## Phase 1 删除 `default_theme_preset` 契约

### 目标

把 `default_theme_preset` 彻底从后端 settings、前端 settings 页面、文档与残留数据叙事中移除。

### 主要改动

- 删除 `backend/app/api/routes_settings.py` 中对 `template["default_theme_preset"]` 的依赖
- 删除 `frontend/components/settings/settings-panel-client.tsx` 里相关类型和展示
- 明确模板信息只走 `/api/templates`
- 清理文档里对 theme preset 仍作为现行能力的描述
- 清理与当前主链无关的示例残留，避免后续继续误导

### 影响文件

- `backend/app/api/routes_settings.py`
- `frontend/components/settings/settings-panel-client.tsx`
- `docs/architecture/framework_positioning.md`
- 其他包含 `default_theme_preset` / `theme_preset` 的说明文件

### 可验证结果

接口验证：

```bash
curl --noproxy '*' -fsS http://127.0.0.1:8765/api/settings
curl --noproxy '*' -fsS http://127.0.0.1:8765/api/templates
```

静态验证：

```bash
rg -n "default_theme_preset" .
rg -n "theme_preset" docs backend frontend
```

人工验证：

- 设置页可以正常加载
- 设置页不再展示 theme preset 字段
- 模板信息仍可在 editor 模板入口正常使用

阶段完成标准：

- `/api/settings` 不再依赖历史字段
- settings 页面不再暴露该概念
- 文档不再把主题预设描述为当前主链能力

## Phase 2 收口 skill 导入到运行时注册的完整链路

### 目标

把 skill 状态从“可见但不可运行”收口为两类：

- `external`：仅外部发现，尚未进入 GraphiteUI 可运行集合
- `managed + runtime registered`：已导入、已注册、可被 editor 选择并可实际运行

### 主要改动

- 定义“导入成功”的唯一标准：skill 已进入 GraphiteUI 管理目录，且 runtime 已注册
- 后端导入动作改为完整链路：发现 -> 导入 -> 校验 -> 注册 -> 返回 catalog
- editor 不再直接使用 `/api/skills/definitions` 作为可附加 skill 来源
- editor 仅展示可运行 skill，或展示 catalog 时明确禁用不可运行项
- graph validate 阶段提前校验 skill 是否可运行，不把错误留到执行期

### 关键设计约束

- 本轮不做通用外部 skill 运行器
- 对没有 GraphiteUI runtime adapter 的 skill，保留为 external-only，不进入“导入即可运行”主链
- 不允许出现 `sourceScope=graphite_managed` 但 `runtimeRegistered=false` 的半状态作为成功结果

### 影响文件

- `backend/app/api/routes_skills.py`
- `backend/app/skills/definitions.py`
- `backend/app/skills/registry.py`
- `backend/app/core/storage/skill_store.py`
- `backend/app/core/compiler/validator.py`
- `frontend/components/editor/node-system-editor.tsx`
- `frontend/components/skills/skills-page-client.tsx`

### 可验证结果

接口验证：

```bash
curl --noproxy '*' -fsS "http://127.0.0.1:8765/api/skills/catalog?include_disabled=true"
curl --noproxy '*' -X POST http://127.0.0.1:8765/api/skills/<skill_key>/import
```

静态验证：

```bash
rg -n '"/api/skills/definitions"' frontend
```

人工验证：

- 导入一个受支持 skill 后，skills 页面显示为已导入且可直接运行
- editor 里只能选到可运行 skill
- 保存并运行一个挂载该 skill 的 graph，可成功通过 validate 并进入执行

阶段完成标准：

- skill 导入成功即表示可运行
- editor 不再给用户暴露“可选但不可跑”的 skill
- skill 未注册问题在 validate 阶段即可暴露

## Phase 3 删除 `inherit`，统一 thinking mode

### 目标

把 thinking mode 统一成清晰的二态协议：

- `on`
- `off`

全局设置只负责“默认值”，不再承担运行时继承语义。

### 主要改动

- 从后端 schema 中删除 `inherit`
- 删除运行时对 `inherit` 的解析分支
- 前端类型与 UI 保持二态，不再隐式映射旧值
- 对历史 graph 做兼容读取和归一化保存

### 兼容策略

- 读取历史 graph 时如果发现 `inherit`，按当前全局设置解析一次
- 用户下一次保存时，把值固化成明确的 `on/off`
- 不新增新的三态 UI

### 影响文件

- `backend/app/core/schemas/node_system.py`
- `backend/app/core/runtime/node_system_executor.py`
- `frontend/lib/node-system-schema.ts`
- `frontend/components/editor/node-system-editor.tsx`

### 可验证结果

静态验证：

```bash
rg -n "thinkingMode|AgentThinkingMode" backend frontend
```

人工验证：

- 新建 agent 节点时只能选 `on/off`
- 旧 graph 读入后仍能正常打开
- 旧 graph 保存后，payload 中不再出现 `inherit`
- 运行时 resolved thinking 与 UI 展示一致

阶段完成标准：

- 前后端协议中不再存在 `inherit`
- 用户可见配置和运行时行为不再分叉

## Phase 4 把 memory 明确降为未来功能

### 目标

明确 memory 当前不是完整产品能力，避免“页面存在 = 功能已交付”的误导。

### 主要改动

- 重新定义 memory 当前定位：
  - 如果保留页面，则明确为只读示例/实验入口
  - 如果不保留页面，则从主导航与演示文档移除
- 删除未接通链路的 `save_memory()`，或至少从产品叙事中完全降级
- 把真正的 memory 能力写入 `docs/FUTURE_WORK.md`

### 影响文件

- `backend/app/memory/store.py`
- `backend/app/api/routes_memories.py`
- `frontend/app/memories/page.tsx`
- `frontend/components/memories/memory-list-client.tsx`
- `docs/FUTURE_WORK.md`
- `docs/已交付功能.md`
- `docs/演示指南.md`
- `README.md`
- `CLAUDE.md`

### 可验证结果

静态验证：

```bash
rg -n "memory|记忆" docs README.md CLAUDE.md frontend backend
```

人工验证：

- 文档不再把 memory 写成已交付主能力
- 如果页面保留，页面标题和说明明确写出“future / experimental / placeholder”
- 如果页面下线，导航与演示路径中不再出现 Memories

阶段完成标准：

- memory 的产品定位在代码、UI、文档里一致
- `save_memory()` 不再以“未来也许会接”的死代码形态留在主链里

## Phase 5 清理过期文档并统一 source of truth

### 目标

删除明显过期或互相矛盾的文档，保留真正对当前代码仍有效的文档集合。

### 主要改动

- 删除明显过期的前端脚手架文档
- 删除旧节点系统过渡计划文档
- 复查 `docs/superpowers/` 是否仍只作为实现记录保留；若已经失效，则删除或归档
- 修正根 README、CLAUDE、architecture 文档中的旧模板、旧能力、旧依赖描述
- 更新 `docs/README.md`，让文档索引和真实目录保持一致

### 优先清理对象

- `frontend/README.md`
- `docs/legacy-node-system-plan.md`
- 仍引用旧模板、旧主题预设、旧前端状态的说明

### 重点对齐点

- root README 的环境要求与当前实际依赖对齐
- CLAUDE.md 里的架构说明与当前仓库结构对齐
- `framework_positioning.md` 不能一边说主题预设已删除，一边继续把它写成当前能力

### 可验证结果

静态验证：

```bash
find docs -maxdepth 3 -type f | sort
rg -n "creative_factory|theme_preset|前端目录已创建，但尚未初始化为完整 Next.js 项目" docs README.md CLAUDE.md
```

人工验证：

- `docs/README.md` 中列出的文档都真实存在
- README、CLAUDE、架构文档不再互相打架
- 演示文档只描述当前仍能演示的能力

阶段完成标准：

- 当前文档集合可以作为真实开发依据
- 不再存在明显“文档说有，代码已经没有”的主链描述

## Phase 6 第二轮技术债收口

### 目标

处理 PDF 中已经确认、但不宜和主契约清理混在同一批交付里的问题。

### 主要改动

- 把 JSON -> SQLite 迁移移出 `get_connection()` 高频路径
- 评估把 graph run 从裸线程切到更稳定的后台任务机制
- 修正 skill compatibility 的反向判断
- 清理未使用导入和重复前端类型

### 影响文件

- `backend/app/core/storage/database.py`
- `backend/app/api/routes_graphs.py`
- `backend/app/skills/definitions.py`
- 前端重复定义 `SkillDefinition` 的位置

### 可验证结果

静态验证：

```bash
cd frontend && npm run lint
python -m compileall backend/app
```

人工验证：

- 多次访问 API 时不再重复执行全量迁移扫描
- graph run 启动路径稳定
- skills 页面兼容性提示可信

阶段完成标准：

- 第二轮技术债不再影响主链稳定性

## 6. 推荐执行顺序

推荐严格按下面顺序落地：

1. Phase 1 删除 `default_theme_preset`
2. Phase 2 skill 导入注册闭环
3. Phase 3 删除 `inherit`
4. Phase 4 memory 降级为未来功能
5. Phase 5 过期文档清理
6. Phase 6 第二轮技术债

原因：

- Phase 1 和 Phase 2 直接消除当前最明显的接口崩溃与运行断链
- Phase 3 收口配置协议，避免后续文档和 UI 继续分叉
- Phase 4 和 Phase 5 负责消除产品叙事层面的误导
- Phase 6 放到最后，避免技术债修复掩盖主问题

## 7. 最终验收标准

满足以下条件，本轮改造才算完成：

- `/api/settings` 不再依赖 `default_theme_preset`
- settings、templates、文档里不再把 theme preset 当现行能力
- skill 导入成功后即可在 editor 中选择并实际运行
- editor 中不再出现“能选但不能跑”的 skill
- 全仓协议中不再出现 `inherit`
- memory 被明确标注为未来能力或实验能力，不再冒充已交付主能力
- 过期文档已删除或归档，当前文档集合与代码现状一致

## 8. 建议交付方式

建议按阶段分别提交，避免一个大提交混合多类问题。

推荐提交粒度：

1. settings / template 契约清理
2. skill import / runtime register / validate 闭环
3. thinking mode 协议统一
4. memory 与文档清理
5. 第二轮技术债

这样每一批都能独立回归，也便于定位回退点。
