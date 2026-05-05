# Companion Local File Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 移除专用 `companion_state` 桌宠技能，改为由通用本地文件读写技能和 `companion_chat_loop` 图模板共同实现桌宠对话、记忆读取和记忆写回循环。

**Architecture:** 新增一个窄边界的 `local_file` 基础技能，只负责受白名单约束的文本/JSON 文件读取、写入和 revision 记录。桌宠的 profile、policy、memory、summary 路径、读取顺序、整理策略、写回目标都显式写在图模板中，回复 Agent 和整理 Agent 只通过 state_schema 交换结构化状态。

**Tech Stack:** Python skill runner, GraphiteUI `node_system` graph templates, Pydantic graph validation, backend pytest/unittest coverage.

---

## Demo 循环实践分析

### `demo/claude-code-source`

Claude Code 的循环核心是 `QueryEngine` + `query` 的异步消息流：用户输入先经过 `processUserInput` 标准化，系统提示和 memory prompt 由 `fetchSystemPromptParts`、`loadMemoryPrompt` 等上下文构造器注入，然后进入模型/工具事件流。它的好实践是把“记忆作为提示上下文”和“工具执行/权限判断”分开：记忆不是某个隐藏对话副作用，工具调用也会经过 permission decision 与可追踪的 tool result。

对 GraphiteUI 的启发：桌宠对话应该是一条显式图 run，memory 文件只作为上下文 state 读入；读写能力用基础技能暴露，是否读取、写回哪些文件由模板决定。

### `demo/hermes-agent`

Hermes 的 `AIAgent.run_conversation()` 是标准 OpenAI 工具循环：构建 system prompt，组装 messages/tools，调用模型；如果返回 tool_calls，就通过 registry 分发工具并把 tool result 追加回消息，直到模型返回最终文本。它的 MemoryManager 把记忆流程拆成 pre-turn `prefetch_all()`、prompt 注入、post-turn `sync_all()`，并用 `<memory-context>` 这类边界防止记忆内容伪装成用户输入。

对 GraphiteUI 的启发：桌宠循环应明确分成读取上下文、回复、整理下一版状态、写回文件四段；记忆内容只作为带边界的上下文进入回复 Agent，整理结果必须是结构化 JSON。

### `demo/openclaw`

OpenClaw 把 Gateway/session/workspace/tool policy 分开：会话有 transcript 锁和生命周期事件，技能从 workspace 安全加载，root memory 文件有 canonical path 与 symlink/path 安全校验，工具通过 central factory 和 allow/deny policy 暴露。它还把 resolved skills 作为运行时 hydration，而不是把具体路径长期塞进持久状态。

对 GraphiteUI 的启发：`local_file` 必须做路径白名单、拒绝 symlink 越界、拒绝 `.git`/settings/构建产物等敏感路径；模板可以持有 repo-relative memory 路径，但技能运行时再解析和校验。

## File Structure

- Create: `skill/local_file/skill.json`
  负责把基础本地文件技能注册为 agent-node 可用的 runtime skill，声明 `file_read`/`file_write` side effects、输入输出 schema、runtime entrypoint。
- Create: `skill/local_file/SKILL.md`
  说明该技能只做受白名单保护的文本/JSON 读写，不拥有任何桌宠记忆策略。
- Create: `skill/local_file/run.py`
  实现 `read_text`、`read_json`、`write_text`、`write_json`，支持 `allowed_roots`、默认值、prompt section 包装、JSON revision 记录。
- Modify: `backend/app/templates/companion_chat_loop.json`
  把 `companion_state` 读取/整理节点替换成 `local_file` 读节点、整理 Agent、`local_file` 写节点；memory 路径和写回目标显式留在模板配置中。
- Delete: `skill/companion_state/*`
  移除旧专用桌宠技能包。
- Delete/Replace: `backend/tests/test_companion_state_skill.py` -> `backend/tests/test_local_file_skill.py`
  用基础文件技能测试替代旧桌宠策略测试。
- Modify: `backend/tests/test_template_layouts.py`
  断言 companion 模板不再引用 `companion_state`，而是通过 `local_file` 和模板 state 编排读写。
- Modify: `backend/tests/test_skill_upload_import_routes.py`
  更新默认技能目录期望，加入 `local_file` 并移除 `companion_state`。
- Modify: `docs/future/2026-05-05-companion-self-config-memory-design.md`
  把已过时的 `companion_state` 说法改成基础文件技能 + 模板编排。

### Task 1: Failing Tests For Local File Boundary

**Files:**
- Create: `backend/tests/test_local_file_skill.py`
- Modify: `backend/tests/test_skill_upload_import_routes.py`
- Modify: `backend/tests/test_template_layouts.py`

- [x] **Step 1: Write the failing local file skill tests**

Create `backend/tests/test_local_file_skill.py` with subprocess tests that call `skill/local_file/run.py`, set `GRAPHITE_REPO_ROOT` to a temp repo root, and verify:

```python
def test_read_json_returns_default_and_prompt_section_when_file_missing(self):
    result = self.invoke_skill({
        "operation": "read_json",
        "path": "backend/data/companion/profile.json",
        "default_value": {"name": "GraphiteUI Companion"},
        "section_tag": "companion-profile",
    }, repo_root)
    self.assertEqual(result["status"], "succeeded")
    self.assertEqual(result["json_content"]["name"], "GraphiteUI Companion")
    self.assertIn("<companion-profile>", result["prompt_section"])

def test_write_json_creates_revision_before_replacing_file(self):
    result = self.invoke_skill({
        "operation": "write_json",
        "path": "backend/data/companion/profile.json",
        "content": {"name": "图图"},
        "revision_path": "backend/data/companion/revisions.json",
        "revision_target_type": "profile",
        "revision_target_id": "profile",
        "changed_by": "companion_chat_loop_template",
        "change_reason": "测试写回。",
    }, repo_root)
    self.assertEqual(result["status"], "succeeded")
    self.assertEqual(json.loads(profile_path.read_text(encoding="utf-8"))["name"], "图图")
    self.assertEqual(revisions[-1]["changed_by"], "companion_chat_loop_template")

def test_rejects_paths_outside_allowlist_and_settings_dir(self):
    traversal = self.invoke_skill({"operation": "read_json", "path": "../secret.json"}, repo_root)
    settings = self.invoke_skill({"operation": "write_json", "path": "backend/data/settings/private.json", "content": {}}, repo_root)
    self.assertEqual(traversal["status"], "failed")
    self.assertEqual(settings["status"], "failed")
```

- [x] **Step 2: Update template/catalog tests to expect the new boundary**

In `backend/tests/test_skill_upload_import_routes.py`, change the default catalog list to:

```python
["game_ad_research_collector", "local_file", "web_media_downloader", "web_search"]
```

In `backend/tests/test_template_layouts.py`, update `test_companion_chat_loop_template_models_single_turn_companion_reply` so it asserts:

```python
self.assertNotIn("companion_state", serialized_template)
self.assertIn("local_file", serialized_template)
self.assertEqual(template.nodes["read_companion_profile"].config.skill_bindings[0].skill_key, "local_file")
self.assertEqual(template.nodes["write_companion_profile"].config.skill_bindings[0].skill_key, "local_file")
self.assertIn(state_by_name["companion_profile_next"], [binding.state for binding in template.nodes["curate_companion_memory"].writes])
```

- [x] **Step 3: Run tests and confirm failure**

Run:

```powershell
python -m pytest backend/tests/test_local_file_skill.py backend/tests/test_template_layouts.py::TemplateLayoutTests::test_companion_chat_loop_template_models_single_turn_companion_reply backend/tests/test_skill_upload_import_routes.py::SkillUploadImportRouteTests::test_default_catalog_only_loads_installed_root_skill_folders -q
```

Expected: FAIL because `skill/local_file/run.py` and the new template nodes do not exist yet.

### Task 2: Implement Generic Local File Skill

**Files:**
- Create: `skill/local_file/skill.json`
- Create: `skill/local_file/SKILL.md`
- Create: `skill/local_file/run.py`

- [x] **Step 1: Add manifest and docs**

Create a `local_file` skill manifest with `skillKey: local_file`, `targets: ["agent_node"]`, `kind: "atomic"`, `mode: "tool"`, `scope: "node"`, permissions `["file_read", "file_write"]`, side effects `["file_read", "file_write"]`, and required inputs `operation` and `path`.

- [x] **Step 2: Implement path safety**

In `run.py`, derive repo root from `GRAPHITE_REPO_ROOT` or `GRAPHITE_SKILL_DIR`, normalize relative POSIX paths, reject absolute/traversal paths, reject denied segments (`.git`, `node_modules`, `dist`, `.worktrees`, `__pycache__`) and denied prefixes (`backend/data/settings`, `.dev_` logs), and require target path to stay inside one of:

```python
DEFAULT_ALLOWED_ROOTS = [
    "backend/data/companion",
    "backend/data/agent_memory",
    "backend/data/graph_memory",
    "backend/data/skill_artifacts",
]
```

- [x] **Step 3: Implement read/write operations**

Implement:

```python
read_json(path, default_value=None, section_tag="")
read_text(path, default_value="", section_tag="")
write_json(path, content, revision_path="", revision_target_type="", revision_target_id="", changed_by="", change_reason="")
write_text(path, content, revision_path="", revision_target_type="", revision_target_id="", changed_by="", change_reason="")
```

Each successful read returns `status`, `path`, `exists`, `content`, `json_content`, `prompt_section`, `warnings`. Each successful write returns `status`, `path`, `content`, `json_content`, `revision`, `write_result`, `warnings`.

- [x] **Step 4: Run local file skill tests**

Run:

```powershell
python -m pytest backend/tests/test_local_file_skill.py -q
```

Expected: PASS.

### Task 3: Rebuild Companion Template Around Basic Skill

**Files:**
- Modify: `backend/app/templates/companion_chat_loop.json`

- [x] **Step 1: Replace old load node**

Replace `load_companion_context` with chained local_file read nodes:

```text
read_companion_profile -> read_companion_policy -> read_companion_memories -> read_companion_session_summary -> companion_reply_agent
```

Each read node uses `local_file` with static repo-relative paths under `backend/data/companion/`, default values, and `section_tag` wrappers.

- [x] **Step 2: Expand state schema**

Add state entries for raw JSON and next JSON values:

```text
companion_profile_json
companion_policy_json
companion_memories_json
companion_session_summary_json
companion_profile_next
companion_policy_next
companion_memories_next
companion_session_summary_next
companion_profile_write_result
companion_policy_write_result
companion_memories_write_result
companion_session_summary_write_result
```

- [x] **Step 3: Change curator from hidden skill to model planner**

Make `curate_companion_memory` a normal Agent node with no skills. It reads user message, assistant reply, current raw JSON states, and writes all `*_next` JSON states plus `companion_memory_update_result`. Its instruction must say it returns full next-file contents and must not upgrade `graph_permission_mode` above `advisory`.

- [x] **Step 4: Add generic write nodes**

Add `write_companion_profile`, `write_companion_policy`, `write_companion_memories`, and `write_companion_session_summary`, each binding `local_file.write_json` with `content` mapped from the corresponding `*_next` state and `revision_path` fixed to `backend/data/companion/revisions.json`.

- [x] **Step 5: Run template validation test**

Run:

```powershell
python -m pytest backend/tests/test_template_layouts.py::TemplateLayoutTests::test_templates_are_valid_runtime_graphs backend/tests/test_template_layouts.py::TemplateLayoutTests::test_companion_chat_loop_template_models_single_turn_companion_reply -q
```

Expected: PASS.

### Task 4: Remove Old Companion Skill And Update Docs

**Files:**
- Delete: `skill/companion_state/SKILL.md`
- Delete: `skill/companion_state/run.py`
- Delete: `skill/companion_state/skill.json`
- Modify: `docs/future/2026-05-05-companion-self-config-memory-design.md`

- [x] **Step 1: Delete the old skill package**

Remove `skill/companion_state` after all template references have moved to `local_file`.

- [x] **Step 2: Update future design doc**

Replace statements that name `companion_state` as the memory owner with language that says: `local_file` performs explicit, whitelist-scoped file IO; `companion_chat_loop` owns path selection and memory curation policy through graph nodes.

- [x] **Step 3: Confirm no live references remain**

Run:

```powershell
git grep -n "companion_state" -- . ':!docs/superpowers/specs/*'
```

Expected: no output.

### Task 5: Verify, Restart, Commit, Push

**Files:**
- No new source files beyond tasks above.

- [x] **Step 1: Run focused backend verification**

Run:

```powershell
python -m pytest backend/tests/test_local_file_skill.py backend/tests/test_template_layouts.py backend/tests/test_skill_upload_import_routes.py -q
```

Expected: PASS.

- [x] **Step 2: Restart the dev environment**

Run:

```powershell
npm run dev
```

If PowerShell blocks npm.ps1, run:

```powershell
npm.cmd run dev
```

- [x] **Step 3: Review git diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only planned files changed, no runtime logs/settings/build output staged.

- [x] **Step 4: Commit and push**

Run:

```powershell
git add -f docs/superpowers/plans/2026-05-05-companion-local-file-loop.md
git add backend/tests/test_local_file_skill.py backend/tests/test_skill_upload_import_routes.py backend/tests/test_template_layouts.py backend/app/templates/companion_chat_loop.json docs/future/2026-05-05-companion-self-config-memory-design.md skill/local_file
git rm -r skill/companion_state backend/tests/test_companion_state_skill.py
git commit -m "移除桌宠专用技能并改用基础文件技能"
git push
```

Expected: push succeeds on the current branch.

## Self-Review

- Spec coverage: 用户要求的三个 demo 分析、去掉旧桌宠技能、基础读写文件技能、模板组合循环、记忆路径模板化、白名单边界都已映射到任务。
- Placeholder scan: 没有 TBD/TODO/类似占位描述；每个任务有具体文件、命令和预期结果。
- Type consistency: 技能名统一为 `local_file`；旧技能名只保留在删除/验证说明中；模板 state 使用 neutral keys 但 state definition names 表达语义。
