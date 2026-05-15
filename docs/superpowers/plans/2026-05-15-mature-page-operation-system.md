# Mature Page Operation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build mature page operation phase one: Buddy reads a structured operation book, chooses semantic `commands`, and executes allowed page clicks/text input through the visible virtual cursor and keyboard with audit records.

**Architecture:** Frontend owns page affordance collection and virtual DOM execution; the Skill owns semantic validation and audit-shaped operation requests. Backend graph runtime passes frontend page operation context through graph metadata into Skill `before_llm.py` without forcing the Skill to parse Markdown state. Buddy self-surfaces are filtered at collection time and rejected again in Skill/runtime execution.

**Tech Stack:** Vue 3, Pinia, TypeScript `node --test`, Element Plus, Python Skill scripts, pytest, TooGraph node_system runtime, existing Buddy virtual cursor code.

---

## Scope

Implement the approved design in `docs/superpowers/specs/2026-05-15-mature-page-operation-system-design.md`.

This plan covers:

- App navigation links, generic registered buttons/tabs/menu items, text inputs, `click`, `focus`, `clear`, `type`, `press`, and simple `wait`.
- A new `commands` protocol for `toograph_page_operator`.
- Runtime page operation context passed through graph metadata to Skill `before_llm.py`.
- Frontend virtual operation execution for command sequences.
- Journal and `activity_events` audit data.

This plan does not cover canvas drag, node creation, graph edits, destructive action approval, or long multi-page planning.

## File Structure

Create:

- `frontend/src/buddy/pageOperationAffordances.ts`: DOM affordance collector, pure operation-book builder, safety filtering, and compact text formatting.
- `frontend/src/buddy/pageOperationAffordances.test.ts`: pure tests for affordance normalization, filtering, and operation-book formatting.
- `frontend/src/buddy/virtualOperationProtocol.ts`: typed protocol helpers for `virtual_ui_operation` events, command normalization, journal skeletons, and cursor lifecycle.
- `frontend/src/buddy/virtualOperationProtocol.test.ts`: protocol parser tests independent from Vue.

Modify:

- `frontend/src/layouts/AppShell.vue`: register safe app navigation affordances and mark Buddy navigation as a self-surface.
- `frontend/src/layouts/AppShell.structure.test.ts`: assert navigation affordance metadata and Buddy self-surface exclusion.
- `frontend/src/buddy/buddyPageContext.ts`: accept a structured `pageOperationBook` and render it into `<page-context>`.
- `frontend/src/buddy/buddyPageContext.test.ts`: update page-operation-book expectations from static `click_nav runs` to structured `commands`.
- `frontend/src/buddy/buddyChatGraph.ts`: carry `skillRuntimeContext` into graph metadata.
- `frontend/src/buddy/buddyChatGraph.test.ts`: assert graph metadata includes `skill_runtime_context.page_operation_book`.
- `frontend/src/buddy/BuddyWidget.vue`: collect current page operation context, pass it to Buddy graph creation, parse operation events, and execute command sequences through the virtual cursor.
- `frontend/src/buddy/BuddyWidget.structure.test.ts`: assert command-sequence handling and forbidden Buddy target checks.
- `frontend/src/stores/buddyMascotDebug.ts`: widen virtual operation request type from a single click to a command sequence.
- `frontend/src/stores/buddyMascotDebug.test.ts`: assert command-sequence request storage.
- `backend/app/core/runtime/node_handlers.py`: merge graph metadata `skill_runtime_context` into agent runtime config before Skill input planning.
- `backend/app/core/langgraph/runtime.py`: inherit `skill_runtime_context` into dynamic subgraph metadata.
- `backend/tests/test_agent_skill_input_generation.py`: keep direct prompt tests for direct `runtime_context` prompt injection.
- `backend/tests/test_node_handlers_runtime.py`: add focused coverage that graph metadata reaches Skill input planning through the agent node path.
- `backend/tests/test_toograph_page_operator_skill.py`: migrate tests to `commands`, operation-book runtime context, and failure cases.
- `skill/official/toograph_page_operator/skill.json`: replace `action` / `target` with `commands` and `reason`.
- `skill/official/toograph_page_operator/SKILL.md`: document the mature `commands` protocol.
- `skill/official/toograph_page_operator/before_llm.py`: prefer `runtime_context.page_operation_book` and `runtime_context.page_snapshot`.
- `skill/official/toograph_page_operator/after_llm.py`: validate `commands`, reject self-surfaces, and emit a command-sequence `virtual_ui_operation`.

Verification commands:

- `python -m pytest backend/tests/test_toograph_page_operator_skill.py backend/tests/test_agent_skill_input_generation.py backend/tests/test_node_handlers_runtime.py -q`
- `node --test frontend/src/buddy/pageOperationAffordances.test.ts frontend/src/buddy/virtualOperationProtocol.test.ts frontend/src/buddy/buddyPageContext.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/stores/buddyMascotDebug.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/layouts/AppShell.structure.test.ts`
- `npm --prefix frontend run build`
- `python -m pytest backend/tests -q`
- `npm start`

---

### Task 1: Frontend Affordance Registry And Operation Book

**Files:**

- Create: `frontend/src/buddy/pageOperationAffordances.ts`
- Create: `frontend/src/buddy/pageOperationAffordances.test.ts`
- Modify: `frontend/src/layouts/AppShell.vue`
- Modify: `frontend/src/layouts/AppShell.structure.test.ts`

- [ ] **Step 1: Write the failing frontend tests**

Create `frontend/src/buddy/pageOperationAffordances.test.ts` with these tests:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPageOperationBook,
  formatPageOperationBookLines,
  normalizePageAffordance,
} from "./pageOperationAffordances.ts";

test("normalizePageAffordance keeps safe navigation commands", () => {
  const affordance = normalizePageAffordance({
    id: "app.nav.runs",
    label: "运行历史",
    role: "navigation-link",
    zone: "app-shell",
    actions: ["click"],
    enabled: true,
    visible: true,
    pathAfterClick: "/runs",
  });

  assert.deepEqual(affordance, {
    id: "app.nav.runs",
    label: "运行历史",
    role: "navigation-link",
    zone: "app-shell",
    actions: ["click"],
    enabled: true,
    visible: true,
    current: false,
    pathAfterClick: "/runs",
    input: null,
    safety: {
      selfSurface: false,
      requiresConfirmation: false,
      destructive: false,
    },
  });
});

test("buildPageOperationBook filters buddy self surfaces and disabled targets", () => {
  const book = buildPageOperationBook({
    snapshotId: "snapshot-1",
    path: "/editor",
    title: "图编辑器",
    affordances: [
      {
        id: "app.nav.runs",
        label: "运行历史",
        role: "navigation-link",
        zone: "app-shell",
        actions: ["click"],
        enabled: true,
        visible: true,
        pathAfterClick: "/runs",
      },
      {
        id: "app.nav.buddy",
        label: "伙伴",
        role: "navigation-link",
        zone: "buddy-page",
        actions: ["click"],
        enabled: true,
        visible: true,
        safety: { selfSurface: true },
      },
      {
        id: "settings.disabled",
        label: "不可用按钮",
        role: "button",
        zone: "settings",
        actions: ["click"],
        enabled: false,
        visible: true,
      },
    ],
  });

  assert.deepEqual(book.allowedOperations.map((item) => item.targetId), ["app.nav.runs"]);
  assert.deepEqual(book.unavailable.map((item) => item.targetId), ["settings.disabled"]);
  assert.match(book.forbidden.join("\n"), /伙伴页面、伙伴浮窗、伙伴形象/);
});

test("formatPageOperationBookLines renders commands without selectors or coordinates", () => {
  const lines = formatPageOperationBookLines(
    buildPageOperationBook({
      snapshotId: "snapshot-2",
      path: "/settings",
      title: "设置",
      affordances: [
        {
          id: "settings.modelProviders.local.baseUrl",
          label: "本地网关地址",
          role: "textbox",
          zone: "settings",
          actions: ["focus", "clear", "type", "press"],
          enabled: true,
          visible: true,
          input: { kind: "text", maxLength: 300, valuePreview: "http://127.0.0.1:8888/v1" },
        },
      ],
    }),
  );

  const text = lines.join("\n");
  assert.match(text, /页面操作书:/);
  assert.match(text, /settings\.modelProviders\.local\.baseUrl/);
  assert.match(text, /commands: focus settings\.modelProviders\.local\.baseUrl/);
  assert.match(text, /type settings\.modelProviders\.local\.baseUrl <text>/);
  assert.doesNotMatch(text, /querySelector|selector|x:|y:/i);
});
```

Update `frontend/src/layouts/AppShell.structure.test.ts` with assertions:

```ts
assert.match(componentSource, /data-virtual-affordance-id="app\.nav\.runs"/);
assert.match(componentSource, /data-virtual-affordance-label="运行历史"/);
assert.match(componentSource, /data-virtual-affordance-actions="click"/);
assert.match(componentSource, /data-virtual-affordance-path-after-click="\/runs"/);
assert.match(componentSource, /data-virtual-affordance-id="app\.nav\.settings"/);
assert.match(componentSource, /data-virtual-affordance-self-surface="true"[\s\S]*nav\.buddy|nav\.buddy[\s\S]*data-virtual-affordance-self-surface="true"/);
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
node --test frontend/src/buddy/pageOperationAffordances.test.ts frontend/src/layouts/AppShell.structure.test.ts
```

Expected: fail because `pageOperationAffordances.ts` does not exist and the AppShell affordance metadata is incomplete.

- [ ] **Step 3: Implement `pageOperationAffordances.ts`**

Create `frontend/src/buddy/pageOperationAffordances.ts` with exported types and functions matching these names:

```ts
export type PageAffordanceAction = "click" | "focus" | "clear" | "type" | "press" | "wait";
export type PageAffordanceRole = "navigation-link" | "tab" | "button" | "menuitem" | "textbox" | "combobox" | "unknown";

export type PageAffordanceInput = {
  kind: "text";
  maxLength: number | null;
  valuePreview: string;
};

export type PageAffordanceSafety = {
  selfSurface: boolean;
  requiresConfirmation: boolean;
  destructive: boolean;
};

export type PageAffordance = {
  id: string;
  label: string;
  role: PageAffordanceRole;
  zone: string;
  actions: PageAffordanceAction[];
  enabled: boolean;
  visible: boolean;
  current: boolean;
  pathAfterClick: string;
  input: PageAffordanceInput | null;
  safety: PageAffordanceSafety;
};

export type PageOperationSnapshot = {
  snapshotId: string;
  path: string;
  title: string;
  affordances: PageAffordance[];
};

export type PageOperationBook = {
  page: { path: string; title: string; snapshotId: string };
  allowedOperations: Array<{
    targetId: string;
    label: string;
    role: PageAffordanceRole;
    commands: string[];
    resultHint: { path: string } | null;
  }>;
  inputs: Array<{
    targetId: string;
    label: string;
    commands: string[];
    valuePreview: string;
    maxLength: number | null;
  }>;
  unavailable: Array<{ targetId: string; label: string; reason: string }>;
  forbidden: string[];
};
```

Implementation requirements:

- `normalizePageAffordance(input)` trims text, deduplicates actions, defaults safety booleans to false, defaults `current` to false, and returns `null` only when `id` or `label` is empty.
- `buildPageOperationBook(snapshot)` excludes self-surfaces, hidden targets, confirmation-required targets, and destructive targets from `allowedOperations`.
- Disabled targets go to `unavailable` with reason `disabled`.
- Text inputs with `type` action go to `inputs`.
- `formatPageOperationBookLines(book)` returns short human-readable lines beginning with `页面操作书:`.
- `collectPageOperationSnapshot({ routePath, root })` scans `[data-virtual-affordance-id]`; it reads `data-virtual-affordance-label`, `role`, `zone`, `actions`, `path-after-click`, `self-surface`, `requires-confirmation`, and `destructive`; it never returns bounds.

- [ ] **Step 4: Register AppShell affordances**

Modify `frontend/src/layouts/AppShell.vue` so safe navigation links have stable metadata:

```vue
data-virtual-affordance-id="app.nav.runs"
data-virtual-affordance-label="运行历史"
data-virtual-affordance-role="navigation-link"
data-virtual-affordance-zone="app-shell"
data-virtual-affordance-actions="click"
data-virtual-affordance-path-after-click="/runs"
```

Apply equivalent metadata to safe navigation links:

- `app.nav.home` -> `/`
- `app.nav.editor` -> `/editor`
- `app.nav.runs` -> `/runs`
- `app.nav.library` -> `/library`
- `app.nav.presets` -> `/presets`
- `app.nav.skills` -> `/skills`
- `app.nav.models` -> `/models`
- `app.nav.modelLogs` -> `/model-logs`
- `app.nav.settings` -> `/settings`

Mark Buddy navigation as a self-surface:

```vue
data-virtual-affordance-id="app.nav.buddy"
data-virtual-affordance-label="伙伴"
data-virtual-affordance-role="navigation-link"
data-virtual-affordance-zone="buddy-page"
data-virtual-affordance-actions="click"
data-virtual-affordance-self-surface="true"
```

- [ ] **Step 5: Verify and commit Task 1**

Run:

```bash
node --test frontend/src/buddy/pageOperationAffordances.test.ts frontend/src/layouts/AppShell.structure.test.ts
npm --prefix frontend run build
```

Expected: both commands pass.

Commit:

```bash
git add frontend/src/buddy/pageOperationAffordances.ts frontend/src/buddy/pageOperationAffordances.test.ts frontend/src/layouts/AppShell.vue frontend/src/layouts/AppShell.structure.test.ts
git commit -m "添加页面操作目标注册表"
```

---

### Task 2: Page Context And Skill Runtime Context Wiring

**Files:**

- Modify: `frontend/src/buddy/buddyPageContext.ts`
- Modify: `frontend/src/buddy/buddyPageContext.test.ts`
- Modify: `frontend/src/buddy/buddyChatGraph.ts`
- Modify: `frontend/src/buddy/buddyChatGraph.test.ts`
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `backend/app/core/runtime/node_handlers.py`
- Modify: `backend/app/core/langgraph/runtime.py`
- Test: `backend/tests/test_node_handlers_runtime.py`

- [ ] **Step 1: Write failing frontend tests for context wiring**

Update `frontend/src/buddy/buddyPageContext.test.ts` so page operation expectations use `commands`:

```ts
const context = buildBuddyPageContext({
  routePath: "/editor",
  editor: null,
  pageOperationBook: buildPageOperationBook({
    snapshotId: "snapshot-ctx",
    path: "/editor",
    title: "图编辑器",
    affordances: [
      {
        id: "app.nav.runs",
        label: "运行历史",
        role: "navigation-link",
        zone: "app-shell",
        actions: ["click"],
        enabled: true,
        visible: true,
        pathAfterClick: "/runs",
      },
    ],
  }),
});

assert.match(context, /页面操作书:/);
assert.match(context, /click app\.nav\.runs/);
assert.doesNotMatch(context, /click_nav runs/);
assert.doesNotMatch(context, /app\.nav\.buddy/);
```

Update `frontend/src/buddy/buddyChatGraph.test.ts` with a test:

```ts
const graph = buildBuddyChatGraph(template, {
  userMessage: "打开运行历史",
  history: [],
  pageContext: "当前路径: /editor",
  pageOperationContext: {
    page_path: "/editor",
    page_operation_book: {
      page: { path: "/editor", title: "图编辑器", snapshotId: "snapshot-graph" },
      allowedOperations: [{ targetId: "app.nav.runs", label: "运行历史", role: "navigation-link", commands: ["click app.nav.runs"], resultHint: { path: "/runs" } }],
      inputs: [],
      unavailable: [],
      forbidden: ["伙伴自身区域不可操作"],
    },
  },
}, binding);

assert.deepEqual(graph.metadata.skill_runtime_context, {
  page_path: "/editor",
  page_operation_book: {
    page: { path: "/editor", title: "图编辑器", snapshotId: "snapshot-graph" },
    allowedOperations: [{ targetId: "app.nav.runs", label: "运行历史", role: "navigation-link", commands: ["click app.nav.runs"], resultHint: { path: "/runs" } }],
    inputs: [],
    unavailable: [],
    forbidden: ["伙伴自身区域不可操作"],
  },
});
```

- [ ] **Step 2: Write failing backend test for metadata runtime context**

Add a test to `backend/tests/test_node_handlers_runtime.py` or create `backend/tests/test_agent_skill_runtime_context.py`:

```py
def test_agent_skill_input_planning_receives_graph_skill_runtime_context() -> None:
    captured: dict[str, Any] = {}

    def fake_generate_agent_skill_inputs(**kwargs: Any):
        captured["runtime_config"] = kwargs["runtime_config"]
        return (
            {"toograph_page_operator": {"commands": [{"action": "click", "target_id": "app.nav.runs"}], "cursor_lifecycle": "return_after_step", "reason": "test"}},
            "",
            [],
            kwargs["runtime_config"],
        )

    node = NodeSystemAgentNode.model_validate({
        "kind": "agent",
        "ui": {"position": {"x": 0, "y": 0}},
        "reads": [{"state": "user_goal", "required": True}],
        "writes": [{"state": "ok", "mode": "replace"}],
        "config": {"skillKey": "toograph_page_operator"},
    })

    execute_agent_node(
        {"user_goal": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT), "ok": NodeSystemStateDefinition(type=NodeSystemStateType.BOOLEAN)},
        node,
        {"user_goal": "打开运行历史"},
        {"metadata": {"skill_runtime_context": {"page_path": "/editor"}}},
        node_name="operate_page",
        state={"metadata": {"skill_runtime_context": {"page_path": "/editor"}}, "activity_events": []},
        get_skill_registry_func=lambda include_disabled=False: {"toograph_page_operator": lambda **inputs: {"ok": True}},
        get_skill_definition_registry_func=lambda include_disabled=False: {
            "toograph_page_operator": SkillDefinition(
                skillKey="toograph_page_operator",
                llmOutputSchema=[
                    SkillIoField(key="commands", name="Commands", valueType="json"),
                    SkillIoField(key="cursor_lifecycle", name="Cursor Lifecycle", valueType="text"),
                    SkillIoField(key="reason", name="Reason", valueType="text"),
                ],
            )
        },
        generate_agent_skill_inputs_func=fake_generate_agent_skill_inputs,
    )

    assert captured["runtime_config"]["skill_runtime_context"] == {"page_path": "/editor"}
```

Use the repo's existing unittest style if the target file is unittest-based.

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
node --test frontend/src/buddy/buddyPageContext.test.ts frontend/src/buddy/buddyChatGraph.test.ts
python -m pytest backend/tests/test_node_handlers_runtime.py -q
```

Expected: frontend tests fail because `pageOperationBook` / `pageOperationContext` inputs do not exist; backend test fails because runtime config does not include `skill_runtime_context`.

- [ ] **Step 4: Implement frontend context wiring**

Modify `BuildBuddyPageContextInput` in `frontend/src/buddy/buddyPageContext.ts`:

```ts
import type { PageOperationBook } from "./pageOperationAffordances.ts";
import { formatPageOperationBookLines } from "./pageOperationAffordances.ts";

export type BuildBuddyPageContextInput = {
  routePath: string;
  editor?: BuddyEditorContextSnapshot | null;
  activeBuddyRunId?: string | null;
  pageOperationBook?: PageOperationBook | null;
};
```

Replace the static `buildPageOperationBookLines(input.routePath)` usage with:

```ts
...formatPageOperationBookLines(input.pageOperationBook ?? null),
```

Keep the Buddy-page self-surface warning:

```ts
...(normalizeRoutePath(input.routePath).startsWith("/buddy") ? ["伙伴相关页面内容已过滤。"] : []),
```

Modify `BuildBuddyChatGraphInput` in `frontend/src/buddy/buddyChatGraph.ts`:

```ts
export type BuddySkillRuntimeContext = {
  page_path?: string;
  page_snapshot?: unknown;
  page_operation_book?: unknown;
};

export type BuildBuddyChatGraphInput = {
  userMessage: string;
  history: BuddyChatMessage[];
  pageContext: string;
  pageOperationContext?: BuddySkillRuntimeContext | null;
  buddyMode?: unknown;
  buddyModel?: unknown;
};
```

When building graph metadata, add:

```ts
skill_runtime_context: cloneJson(input.pageOperationContext ?? {}),
```

Modify `BuddyWidget.vue` `buildPageContext()` and `processQueuedTurn()` so one collected context is reused for both the visible Markdown and skill runtime metadata:

```ts
function buildPageOperationRuntimeContext() {
  const snapshot = collectPageOperationSnapshot({
    routePath: route.fullPath,
    root: typeof document === "undefined" ? null : document,
  });
  const pageOperationBook = buildPageOperationBook(snapshot);
  return {
    pageContext: buildBuddyPageContext({
      routePath: route.fullPath,
      editor: buddyContextStore.editorSnapshot,
      activeBuddyRunId: activeRunId.value,
      pageOperationBook,
    }),
    skillRuntimeContext: {
      page_path: snapshot.path,
      page_snapshot: snapshot,
      page_operation_book: pageOperationBook,
    },
  };
}
```

Use it before `buildBuddyChatGraph`:

```ts
const pageOperationContext = buildPageOperationRuntimeContext();
const graph = buildBuddyChatGraph(template, {
  userMessage: turn.userMessage,
  history,
  pageContext: pageOperationContext.pageContext,
  pageOperationContext: pageOperationContext.skillRuntimeContext,
  buddyMode: buddyMode.value,
  buddyModel: buddyModelRef.value,
}, binding);
```

- [ ] **Step 5: Implement backend runtime context propagation**

In `backend/app/core/runtime/node_handlers.py`, after `runtime_config = resolve_agent_runtime_config_func(node)`, merge graph metadata context:

```py
metadata = graph_context.get("metadata") if isinstance(graph_context.get("metadata"), dict) else {}
skill_runtime_context = metadata.get("skill_runtime_context")
if isinstance(skill_runtime_context, dict):
    runtime_config = {
        **runtime_config,
        "skill_runtime_context": dict(skill_runtime_context),
    }
```

In `backend/app/core/langgraph/runtime.py`, add `skill_runtime_context` to the inherited metadata set:

```py
INHERITED_PERMISSION_METADATA_KEYS = {
    "graph_permission_mode",
    "buddy_mode",
    "buddy_requires_approval",
    "buddy_can_execute_actions",
    "skill_runtime_context",
}
```

- [ ] **Step 6: Verify and commit Task 2**

Run:

```bash
node --test frontend/src/buddy/pageOperationAffordances.test.ts frontend/src/buddy/buddyPageContext.test.ts frontend/src/buddy/buddyChatGraph.test.ts
python -m pytest backend/tests/test_node_handlers_runtime.py backend/tests/test_agent_skill_input_generation.py -q
npm --prefix frontend run build
```

Expected: all pass.

Commit:

```bash
git add frontend/src/buddy/buddyPageContext.ts frontend/src/buddy/buddyPageContext.test.ts frontend/src/buddy/buddyChatGraph.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/BuddyWidget.vue backend/app/core/runtime/node_handlers.py backend/app/core/langgraph/runtime.py backend/tests/test_node_handlers_runtime.py
git commit -m "打通页面操作运行时上下文"
```

---

### Task 3: Migrate Page Operator Skill To `commands`

**Files:**

- Modify: `skill/official/toograph_page_operator/skill.json`
- Modify: `skill/official/toograph_page_operator/SKILL.md`
- Modify: `skill/official/toograph_page_operator/before_llm.py`
- Modify: `skill/official/toograph_page_operator/after_llm.py`
- Modify: `backend/tests/test_toograph_page_operator_skill.py`

- [ ] **Step 1: Write failing Skill tests for `commands`**

Update `backend/tests/test_toograph_page_operator_skill.py`:

```py
def test_manifest_exposes_page_operator_commands_contract(self) -> None:
    definition = _parse_native_skill_manifest(PAGE_OPERATOR_MANIFEST_PATH, SkillSourceScope.OFFICIAL).definition

    self.assertEqual([field.key for field in definition.state_input_schema], ["user_goal"])
    self.assertEqual([field.key for field in definition.llm_output_schema], ["commands", "cursor_lifecycle", "reason"])
    self.assertEqual([field.key for field in definition.state_output_schema], ["ok", "next_page_path", "cursor_session_id", "journal", "error"])
```

Replace the before-LLM test payload with:

```py
result = _run_skill_script(
    PAGE_OPERATOR_BEFORE_LLM_PATH,
    {
        "graph_state": {"page_path": "/stale-graph-state"},
        "runtime_context": {
            "page_path": "/editor",
            "page_operation_book": {
                "page": {"path": "/editor", "title": "图编辑器", "snapshotId": "snapshot-skill"},
                "allowedOperations": [
                    {
                        "targetId": "app.nav.runs",
                        "label": "运行历史",
                        "role": "navigation-link",
                        "commands": ["click app.nav.runs"],
                        "resultHint": {"path": "/runs"},
                    }
                ],
                "inputs": [],
                "unavailable": [],
                "forbidden": ["伙伴页面、伙伴浮窗、伙伴形象不可操作"],
            },
        },
    },
)
context = str(result.get("context") or "")
self.assertIn('"snapshotId": "snapshot-skill"', context)
self.assertIn("click app.nav.runs", context)
self.assertNotIn("/stale-graph-state", context)
```

Replace the after-LLM success test payload with:

```py
result = _run_skill_script(
    PAGE_OPERATOR_AFTER_LLM_PATH,
    {
        "commands": [{"action": "click", "target_id": "app.nav.runs"}],
        "cursor_lifecycle": "return_after_step",
        "reason": "用户要求打开运行历史",
    },
)
self.assertEqual(result["ok"], True)
self.assertEqual(result["next_page_path"], "/runs")
self.assertEqual(result["journal"][0]["target_id"], "app.nav.runs")
self.assertEqual(result["journal"][0]["action"], "click")
event = result["activity_events"][0]
self.assertEqual(event["kind"], "virtual_ui_operation")
self.assertEqual(event["detail"]["commands"], [{"action": "click", "target_id": "app.nav.runs"}])
self.assertEqual(event["detail"]["reason"], "用户要求打开运行历史")
```

Add rejection tests:

```py
def test_after_llm_rejects_unknown_targets(self) -> None:
    result = _run_skill_script(PAGE_OPERATOR_AFTER_LLM_PATH, {"commands": [{"action": "click", "target_id": "missing.target"}]})
    self.assertEqual(result["ok"], False)
    self.assertEqual(result["error"]["code"], "target_not_found")

def test_after_llm_rejects_unsupported_action_for_runs(self) -> None:
    result = _run_skill_script(PAGE_OPERATOR_AFTER_LLM_PATH, {"commands": [{"action": "type", "target_id": "app.nav.runs", "text": "x"}]})
    self.assertEqual(result["ok"], False)
    self.assertEqual(result["error"]["code"], "unsupported_action")
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
python -m pytest backend/tests/test_toograph_page_operator_skill.py -q
```

Expected: fail because manifest and scripts still use `action` / `target`.

- [ ] **Step 3: Update Skill manifest and docs**

Modify `skill/official/toograph_page_operator/skill.json`:

- Replace `llmInstruction` with language requiring `commands`.
- Replace `llmOutputSchema` fields `action` and `target` with:

```json
{
  "key": "commands",
  "name": "Commands",
  "valueType": "json",
  "description": "同一页面快照上的语义命令数组。每项包含 action、target_id，可选 text/key/option。"
},
{
  "key": "cursor_lifecycle",
  "name": "Cursor Lifecycle",
  "valueType": "text",
  "description": "虚拟鼠标生命周期，keep、return_after_step 或 return_at_end；没有连续操作时返回 return_after_step。"
},
{
  "key": "reason",
  "name": "Reason",
  "valueType": "text",
  "description": "选择这些命令的简短原因，用于审计。"
}
```

Update `SKILL.md` so LLM output lists `commands`, `cursor_lifecycle`, and `reason`.

- [ ] **Step 4: Update `before_llm.py`**

Implement behavior:

- Read `runtime_context.page_operation_book`.
- If present, return it as JSON under `context`.
- Include `output_contract` with `commands`, `cursor_lifecycle`, and `reason`.
- Do not parse graph state.
- Keep a fallback book with safe app navigation when runtime context is empty so unit tests and manual runs remain useful.

Use this payload shape:

```py
operation_book = runtime_context.get("page_operation_book")
if isinstance(operation_book, dict):
    context_payload = {
        "page_operation_book": operation_book,
        "output_contract": {
            "commands": [{"action": "click", "target_id": "app.nav.runs"}],
            "cursor_lifecycle": "return_after_step",
            "reason": "简短说明选择该操作的原因",
        },
    }
    return {"context": json.dumps(context_payload, ensure_ascii=False, indent=2)}
```

- [ ] **Step 5: Update `after_llm.py`**

Implement these helper functions:

- `_coerce_commands(value: Any) -> list[dict[str, Any]]`
- `_normalize_command(raw: dict[str, Any]) -> dict[str, Any]`
- `_validate_command(command: dict[str, Any]) -> dict[str, Any] | None`
- `_build_success(commands: list[dict[str, Any]], cursor_lifecycle: str, reason: str) -> dict[str, Any]`

Supported target/action matrix for phase one:

```py
SUPPORTED_TARGETS = {
    "app.nav.runs": {
        "label": "运行历史",
        "role": "navigation-link",
        "actions": {"click"},
        "path_after_click": "/runs",
    }
}
```

Validation rules:

- Empty commands -> `empty_commands`.
- More than five commands -> `too_many_commands`.
- Buddy/self target or `target_id` starts with `buddy.` -> `forbidden_self_surface`.
- Unknown target -> `target_not_found`.
- Unsupported action for target -> `unsupported_action`.
- `type` command without non-empty `text` -> `missing_text`.

Success result:

```py
{
    "ok": True,
    "next_page_path": "/runs",
    "cursor_session_id": "",
    "journal": [
        {
            "command_index": 0,
            "action": "click",
            "target_id": "app.nav.runs",
            "target_label": "运行历史",
            "status": "requested",
            "path_after": "/runs",
        }
    ],
    "error": None,
    "activity_events": [
        {
            "kind": "virtual_ui_operation",
            "summary": "Requested virtual page operation command sequence.",
            "status": "requested",
            "detail": {
                "commands": commands,
                "cursor_lifecycle": cursor_lifecycle,
                "reason": reason,
                "next_page_path": "/runs",
                "journal": journal,
            },
        }
    ],
}
```

- [ ] **Step 6: Verify and commit Task 3**

Run:

```bash
python -m pytest backend/tests/test_toograph_page_operator_skill.py backend/tests/test_agent_skill_input_generation.py -q
```

Expected: pass.

Commit:

```bash
git add skill/official/toograph_page_operator/skill.json skill/official/toograph_page_operator/SKILL.md skill/official/toograph_page_operator/before_llm.py skill/official/toograph_page_operator/after_llm.py backend/tests/test_toograph_page_operator_skill.py
git commit -m "迁移页面操作技能命令协议"
```

---

### Task 4: Virtual Operation Protocol And Store

**Files:**

- Create: `frontend/src/buddy/virtualOperationProtocol.ts`
- Create: `frontend/src/buddy/virtualOperationProtocol.test.ts`
- Modify: `frontend/src/stores/buddyMascotDebug.ts`
- Modify: `frontend/src/stores/buddyMascotDebug.test.ts`

- [ ] **Step 1: Write failing protocol and store tests**

Create `frontend/src/buddy/virtualOperationProtocol.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  parseVirtualUiOperationEvent,
  normalizeVirtualOperationCommand,
} from "./virtualOperationProtocol.ts";

test("normalizeVirtualOperationCommand rejects buddy self targets", () => {
  assert.equal(normalizeVirtualOperationCommand({ action: "click", target_id: "buddy.avatar" }), null);
  assert.equal(normalizeVirtualOperationCommand({ action: "click", target_id: "app.nav.buddy" }), null);
});

test("parseVirtualUiOperationEvent returns command sequences", () => {
  const parsed = parseVirtualUiOperationEvent({
    kind: "virtual_ui_operation",
    detail: {
      commands: [
        { action: "click", target_id: "settings.input" },
        { action: "type", target_id: "settings.input", text: "hello" },
      ],
      cursor_lifecycle: "keep",
      reason: "test input",
    },
  });

  assert.deepEqual(parsed, {
    commands: [
      { action: "click", targetId: "settings.input" },
      { action: "type", targetId: "settings.input", text: "hello" },
    ],
    cursorLifecycle: "keep",
    reason: "test input",
  });
});
```

Update `frontend/src/stores/buddyMascotDebug.test.ts` virtual operation test:

```ts
store.requestVirtualOperation({
  commands: [
    { action: "click", targetId: "settings.input" },
    { action: "type", targetId: "settings.input", text: "hello" },
  ],
  cursorLifecycle: "keep",
  reason: "test input",
});

assert.deepEqual(store.latestVirtualOperationRequest.operation.commands, [
  { action: "click", targetId: "settings.input" },
  { action: "type", targetId: "settings.input", text: "hello" },
]);
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
node --test frontend/src/buddy/virtualOperationProtocol.test.ts frontend/src/stores/buddyMascotDebug.test.ts
```

Expected: fail because the protocol file does not exist and store still accepts only single click operations.

- [ ] **Step 3: Implement `virtualOperationProtocol.ts`**

Create types:

```ts
export type VirtualOperationAction = "click" | "focus" | "clear" | "type" | "press" | "wait";
export type VirtualOperationCursorLifecycle = "keep" | "return_after_step" | "return_at_end";

export type VirtualOperationCommand = {
  action: VirtualOperationAction;
  targetId: string;
  text?: string;
  key?: string;
  option?: string;
};

export type VirtualOperationRequestPayload = {
  commands: VirtualOperationCommand[];
  cursorLifecycle: VirtualOperationCursorLifecycle;
  reason: string;
};
```

Implement:

- `normalizeVirtualOperationCommand(raw)` accepts `target_id` or `targetId`, rejects `buddy.*` and `app.nav.buddy`, normalizes action.
- `normalizeVirtualOperationCursorLifecycle(raw)` defaults to `return_after_step`.
- `parseVirtualUiOperationEvent(payload)` returns `null` unless `payload.kind === "virtual_ui_operation"` and at least one command is valid.
- For transitional frontend event parsing only, accept old `detail.operation` single-click shape and normalize it to one `click` command. Do not expose old shape to Skill docs.

- [ ] **Step 4: Update store types**

Modify `frontend/src/stores/buddyMascotDebug.ts`:

```ts
import type {
  VirtualOperationCommand,
  VirtualOperationCursorLifecycle,
  VirtualOperationRequestPayload,
} from "../buddy/virtualOperationProtocol.ts";

export type BuddyVirtualOperationCursorLifecycle = VirtualOperationCursorLifecycle;
export type BuddyVirtualOperation = VirtualOperationRequestPayload;
```

Keep `BuddyVirtualOperationRequest` shape `{ id, operation }`.

- [ ] **Step 5: Verify and commit Task 4**

Run:

```bash
node --test frontend/src/buddy/virtualOperationProtocol.test.ts frontend/src/stores/buddyMascotDebug.test.ts
npm --prefix frontend run build
```

Expected: pass.

Commit:

```bash
git add frontend/src/buddy/virtualOperationProtocol.ts frontend/src/buddy/virtualOperationProtocol.test.ts frontend/src/stores/buddyMascotDebug.ts frontend/src/stores/buddyMascotDebug.test.ts
git commit -m "扩展虚拟页面操作协议"
```

---

### Task 5: Virtual Operator Runtime Command Execution

**Files:**

- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/buddy/BuddyWidget.structure.test.ts`

- [ ] **Step 1: Write failing structure tests for command execution**

Update `frontend/src/buddy/BuddyWidget.structure.test.ts`:

```ts
assert.match(componentSource, /parseVirtualUiOperationEvent\(payload\)/);
assert.match(componentSource, /async function executeVirtualOperationCommands\(operation: BuddyVirtualOperation\)/);
assert.match(componentSource, /case "focus":[\s\S]*executeBuddyVirtualFocusOperation/);
assert.match(componentSource, /case "clear":[\s\S]*executeBuddyVirtualClearOperation/);
assert.match(componentSource, /case "type":[\s\S]*executeBuddyVirtualTypeOperation/);
assert.match(componentSource, /case "press":[\s\S]*executeBuddyVirtualPressOperation/);
assert.match(componentSource, /case "wait":[\s\S]*executeBuddyVirtualWaitOperation/);
assert.doesNotMatch(componentSource, /targetId !== "app\.nav\.runs"/);
assert.match(componentSource, /targetId\.startsWith\("buddy\."\) \|\| targetId === "app\.nav\.buddy"/);
```

- [ ] **Step 2: Run structure test and verify it fails**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: fail because `BuddyWidget.vue` still handles only a single `app.nav.runs` click.

- [ ] **Step 3: Replace event parsing**

In `BuddyWidget.vue`, import:

```ts
import {
  parseVirtualUiOperationEvent,
  type VirtualOperationCommand,
} from "./virtualOperationProtocol.ts";
```

Replace `handleBuddyVirtualUiOperationEvent` body with:

```ts
const operation = parseVirtualUiOperationEvent(payload);
if (!operation) {
  return;
}
buddyMascotDebugStore.requestVirtualOperation(operation);
```

- [ ] **Step 4: Execute command sequences**

Replace `executeVirtualOperationRequest` so it loops over `operation.commands`:

```ts
async function executeVirtualOperationRequest(request: BuddyVirtualOperationRequest | null) {
  if (!request) {
    return;
  }
  await executeVirtualOperationCommands(request.operation);
}

async function executeVirtualOperationCommands(operation: BuddyVirtualOperation) {
  stopBuddyIdleAnimation();
  await ensureVirtualCursorReadyForOperation();
  for (const command of operation.commands) {
    await executeBuddyVirtualOperationCommand(command);
  }
  if (operation.cursorLifecycle === "return_after_step" || operation.cursorLifecycle === "return_at_end") {
    await waitForVirtualOperation(BUDDY_VIRTUAL_OPERATION_CLICK_SETTLE_MS);
    buddyMascotDebugStore.setVirtualCursorEnabled(false);
  }
}
```

Implement command dispatch:

```ts
async function executeBuddyVirtualOperationCommand(command: VirtualOperationCommand) {
  switch (command.action) {
    case "click":
      await executeBuddyVirtualClickOperation(command);
      return;
    case "focus":
      await executeBuddyVirtualFocusOperation(command);
      return;
    case "clear":
      await executeBuddyVirtualClearOperation(command);
      return;
    case "type":
      await executeBuddyVirtualTypeOperation(command);
      return;
    case "press":
      await executeBuddyVirtualPressOperation(command);
      return;
    case "wait":
      await executeBuddyVirtualWaitOperation(command);
      return;
  }
}
```

- [ ] **Step 5: Implement target resolution and keyboard actions**

Update `resolveVirtualOperationAffordance(targetId)`:

- Reject `targetId.startsWith("buddy.")` and `targetId === "app.nav.buddy"`.
- Query `[data-virtual-affordance-id="${cssEscape(targetId)}"]`.
- Keep the existing visible-size check.

Implement:

```ts
async function executeBuddyVirtualFocusOperation(command: VirtualOperationCommand) {
  const affordance = resolveVirtualOperationAffordance(command.targetId);
  if (!affordance) return;
  await moveVirtualCursorToElement(affordance.element);
  affordance.element.focus();
}

async function executeBuddyVirtualClearOperation(command: VirtualOperationCommand) {
  await executeBuddyVirtualFocusOperation(command);
  const input = resolveTextInputElement(command.targetId);
  if (!input) return;
  input.value = "";
  dispatchInputEvents(input);
}

async function executeBuddyVirtualTypeOperation(command: VirtualOperationCommand) {
  await executeBuddyVirtualFocusOperation(command);
  const input = resolveTextInputElement(command.targetId);
  if (!input || !command.text) return;
  input.value = `${input.value}${command.text}`;
  dispatchInputEvents(input);
}

async function executeBuddyVirtualPressOperation(command: VirtualOperationCommand) {
  const affordance = resolveVirtualOperationAffordance(command.targetId);
  if (!affordance || !command.key) return;
  affordance.element.dispatchEvent(new KeyboardEvent("keydown", { key: command.key, bubbles: true }));
  affordance.element.dispatchEvent(new KeyboardEvent("keyup", { key: command.key, bubbles: true }));
}

async function executeBuddyVirtualWaitOperation(command: VirtualOperationCommand) {
  const waitMs = command.option === "short" ? 300 : 120;
  await waitForVirtualOperation(waitMs);
}
```

Use a helper for cursor movement:

```ts
async function moveVirtualCursorToElement(element: HTMLElement) {
  const cursorPosition = resolveVirtualCursorPositionForElement(element);
  const flightWaitMs = moveVirtualCursorToWithArmedTransition(cursorPosition);
  await waitForVirtualOperation(flightWaitMs);
}
```

Implement `dispatchInputEvents`:

```ts
function dispatchInputEvents(element: HTMLInputElement | HTMLTextAreaElement) {
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: element.value }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
```

- [ ] **Step 6: Verify and commit Task 5**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/buddy/virtualOperationProtocol.test.ts frontend/src/stores/buddyMascotDebug.test.ts
npm --prefix frontend run build
```

Expected: pass.

Commit:

```bash
git add frontend/src/buddy/BuddyWidget.vue frontend/src/buddy/BuddyWidget.structure.test.ts
git commit -m "执行虚拟页面操作命令序列"
```

---

### Task 6: End-To-End Verification And Cleanup

**Files:**

- Modify: `docs/current_project_status.md`
- No new source files expected.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
python -m pytest backend/tests/test_toograph_page_operator_skill.py backend/tests/test_agent_skill_input_generation.py backend/tests/test_node_handlers_runtime.py -q
```

Expected: pass.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
node --test frontend/src/buddy/pageOperationAffordances.test.ts frontend/src/buddy/virtualOperationProtocol.test.ts frontend/src/buddy/buddyPageContext.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/stores/buddyMascotDebug.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/layouts/AppShell.structure.test.ts
```

Expected: pass.

- [ ] **Step 3: Run broad verification**

Run:

```bash
npm --prefix frontend run build
python -m pytest backend/tests -q
git diff --check
```

Expected: frontend build passes, backend suite passes, diff check has no output.

- [ ] **Step 4: Restart TooGraph**

Run:

```bash
npm start
```

Expected: TooGraph starts at `http://127.0.0.1:3477` or the configured `PORT`.

- [ ] **Step 5: Manual browser verification**

Open `http://127.0.0.1:3477` and verify:

- Buddy page context no longer prints `click_nav runs`; it prints `click app.nav.runs`.
- Ask Buddy to open run history while in full-access mode or through the current approved execution path.
- The virtual cursor moves to the Runs navigation link and clicks it.
- The route becomes `/runs`.
- Run detail activity contains `virtual_ui_operation` with `commands`, `cursor_lifecycle`, and `journal`.
- Buddy navigation and Buddy widget controls do not appear as allowed operation targets.

- [ ] **Step 6: Update status doc if source behavior changed**

If implementation materially changes documented current behavior, add a concise note to `docs/current_project_status.md`:

```md
- Buddy page operation now uses the mature `commands` protocol with frontend page affordance snapshots, filtered operation books, and virtual cursor command-sequence execution for safe page controls.
```

- [ ] **Step 7: Commit final verification or doc updates**

If Step 6 changed docs:

```bash
git add docs/current_project_status.md
git commit -m "更新页面操作系统状态说明"
```

If Step 6 did not change docs, create no empty commit.

---

## Self-Review Checklist

Spec coverage:

- Affordance Registry: Task 1.
- Page Operation Book: Tasks 1 and 2.
- Skill `commands` protocol: Task 3.
- Runtime context instead of Markdown parsing: Task 2.
- Virtual Operator Runtime command execution: Tasks 4 and 5.
- Buddy self-surface filtering and rejection: Tasks 1, 3, 4, and 5.
- Audit journal and activity events: Task 3 and Task 6.
- Tests and restart flow: Task 6.

No placeholders:

- The plan contains concrete file paths, commands, expected outcomes, and commit commands.
- The plan avoids keeping old `action` / `target` as a documented protocol.

Type consistency:

- Frontend command type uses `targetId`; Skill JSON uses `target_id`.
- Protocol parser converts `target_id` to `targetId`.
- Skill runtime context metadata key is `skill_runtime_context`.
- Operation book field names use frontend camelCase; `before_llm.py` treats the operation book as JSON context and does not rename it for LLM display.
