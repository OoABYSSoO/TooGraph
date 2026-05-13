# Buddy Template Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Buddy visible chat runs use a user-selected graph template with explicit input-node bindings instead of the fixed `buddy_autonomous_loop` state injection path.

**Architecture:** Store one auditable Buddy run-template binding in Buddy Home, expose it on the Buddy page, and make the Buddy chat sender fetch that binding before each run. Runtime injection writes only bound source values into selected root input nodes; permission mode remains metadata only.

**Tech Stack:** FastAPI, Python Buddy Home SQLite store, Vue 3, TypeScript, Element Plus, TooGraph `node_system` graph payloads, node test runner, pytest.

**Implementation Note:** The user requested direct `main` development without worktrees. Execute this plan on the current branch and commit after each task.

---

## File Structure

### Backend

- Modify `backend/app/buddy/store.py`
  - Add default binding constants.
  - Add `load_run_template_binding()`.
  - Add `save_run_template_binding()`.
  - Extend `restore_revision()` for `run_template_binding`.
- Modify `backend/app/buddy/commands.py`
  - Add `run_template_binding.update` to `_dispatch_command()`.
- Modify `backend/app/api/routes_buddy.py`
  - Add `GET /api/buddy/run-template-binding`.
- Modify `backend/tests/test_buddy_routes.py`
  - Cover default load, command save, revision listing, and revision restore.
- Modify `backend/tests/test_buddy_commands.py`
  - Cover command dispatch for `run_template_binding.update`.

### Frontend Domain and API

- Modify `frontend/src/types/buddy.ts`
  - Add `BuddyRunInputSource`, `BuddyRunTemplateBinding`, and validation issue types.
- Modify `frontend/src/api/buddy.ts`
  - Add `fetchBuddyRunTemplateBinding()`.
  - Add `updateBuddyRunTemplateBinding()`.
- Modify `frontend/src/api/buddy.test.ts`
  - Verify the new GET endpoint and command payload.
- Create `frontend/src/buddy/buddyTemplateBindingModel.ts`
  - Own source options, default binding, input-row extraction, binding validation, and Buddy Home folder value construction.
- Create `frontend/src/buddy/buddyTemplateBindingModel.test.ts`
  - Unit-test row extraction and validation rules.

### Buddy Runtime

- Modify `frontend/src/buddy/buddyChatGraph.ts`
  - Change `buildBuddyChatGraph()` to require a `BuddyRunTemplateBinding`.
  - Inject by input node id only.
  - Remove hard-coded Buddy state-name injection.
  - Keep model override and permission metadata.
- Modify `frontend/src/buddy/buddyChatGraph.test.ts`
  - Replace state-name injection tests with input-node binding tests.
  - Assert no graph-input injection of `buddy_mode` or `skill_catalog_snapshot`.
- Modify `frontend/src/buddy/BuddyWidget.vue`
  - Fetch binding, then selected template, then build and run graph.
  - Convert binding validation failure into the assistant error message before graph run.
- Modify `frontend/src/buddy/BuddyWidget.structure.test.ts`
  - Assert the widget uses `fetchBuddyRunTemplateBinding()` and no longer fetches `BUDDY_TEMPLATE_ID` for visible runs.

### Buddy Page UI

- Modify `frontend/src/pages/BuddyPage.vue`
  - Add `binding` tab.
  - Load templates and saved binding in `loadAll()`.
  - Render template selector and input-node binding table.
  - Save binding through command flow.
- Modify `frontend/src/pages/BuddyPage.structure.test.ts`
  - Assert the new tab and imported APIs exist.
- Modify `frontend/src/pages/buddyRevisionHistoryModel.ts`
  - Add `run_template_binding` filter support.
- Modify `frontend/src/pages/buddyRevisionHistoryModel.test.ts`
  - Cover binding revision rows.
- Modify `frontend/src/i18n/messages.ts`
  - Add Chinese and English labels for the binding tab, source dropdowns, validation messages, and history target.

### Official Template and Docs

- Modify `graph_template/official/buddy_autonomous_loop/template.json`
  - Remove the root `buddy_mode` state, input node, edges, and reads from the visible Buddy template and its affected subgraphs.
- Modify `backend/tests/test_template_layouts.py`
  - Assert `buddy_mode` is not part of the official visible Buddy template contract.
- Modify `docs/current_project_status.md`
  - Update Buddy visible run description to say template input binding supplies current message, history, page context, and Buddy Home context; permission mode is metadata-only.

---

### Task 1: Backend Binding Store, Command, and API

**Files:**
- Modify: `backend/app/buddy/store.py`
- Modify: `backend/app/buddy/commands.py`
- Modify: `backend/app/api/routes_buddy.py`
- Test: `backend/tests/test_buddy_routes.py`
- Test: `backend/tests/test_buddy_commands.py`

- [ ] **Step 1: Write backend route tests first**

Add these tests to `backend/tests/test_buddy_routes.py`:

```python
    def test_run_template_binding_default_save_and_restore(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    default_response = client.get("/api/buddy/run-template-binding")
                    save_response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "run_template_binding.update",
                            "payload": {
                                "template_id": "custom_loop",
                                "input_bindings": {
                                    "input_prompt": "current_message",
                                    "input_history": "conversation_history",
                                },
                            },
                            "change_reason": "用户更新伙伴运行模板绑定。",
                        },
                    )
                    saved_response = client.get("/api/buddy/run-template-binding")
                    revisions = client.get(
                        "/api/buddy/revisions",
                        params={"target_type": "run_template_binding"},
                    ).json()
                    restore_response = client.post(f"/api/buddy/revisions/{revisions[-1]['revision_id']}/restore")
                    restored_response = client.get("/api/buddy/run-template-binding")

        self.assertEqual(default_response.status_code, 200)
        self.assertEqual(default_response.json()["template_id"], "buddy_autonomous_loop")
        self.assertEqual(default_response.json()["input_bindings"]["input_user_message"], "current_message")
        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.json()["result"]["template_id"], "custom_loop")
        self.assertEqual(saved_response.json()["template_id"], "custom_loop")
        self.assertEqual(len(revisions), 1)
        self.assertEqual(restore_response.status_code, 200)
        self.assertEqual(restored_response.json()["template_id"], "buddy_autonomous_loop")
```

Add this invalid payload test to the same file:

```python
    def test_run_template_binding_rejects_missing_current_message(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(store, "BUDDY_HOME_DIR", Path(temp_dir) / "buddy_home"):
                with TestClient(app) as client:
                    response = client.post(
                        "/api/buddy/commands",
                        json={
                            "action": "run_template_binding.update",
                            "payload": {
                                "template_id": "custom_loop",
                                "input_bindings": {"input_history": "conversation_history"},
                            },
                        },
                    )

        self.assertEqual(response.status_code, 422)
        self.assertIn("current_message", response.json()["detail"])
```

- [ ] **Step 2: Run backend tests and verify they fail**

Run:

```bash
python -m pytest backend/tests/test_buddy_routes.py -q
```

Expected: failure because `/api/buddy/run-template-binding` and `run_template_binding.update` do not exist.

- [ ] **Step 3: Add store constants and normalizers**

In `backend/app/buddy/store.py`, add near the existing constants:

```python
RUN_TEMPLATE_BINDING_KEY = "run_template_binding"
RUN_TEMPLATE_BINDING_TARGET_TYPE = "run_template_binding"
RUN_TEMPLATE_BINDING_TARGET_ID = "run_template_binding"
RUN_TEMPLATE_BINDING_VERSION = 1
ALLOWED_RUN_TEMPLATE_INPUT_SOURCES = {
    "current_message",
    "conversation_history",
    "page_context",
    "buddy_home_context",
}
DEFAULT_RUN_TEMPLATE_BINDING = {
    "version": RUN_TEMPLATE_BINDING_VERSION,
    "template_id": "buddy_autonomous_loop",
    "input_bindings": {
        "input_user_message": "current_message",
        "input_conversation_history": "conversation_history",
        "input_page_context": "page_context",
        "input_buddy_context": "buddy_home_context",
    },
}
```

Add these helper functions near `load_session_summary()`:

```python
def load_run_template_binding() -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute("SELECT value_json FROM buddy_kv WHERE key = ?", (RUN_TEMPLATE_BINDING_KEY,)).fetchone()
    if not row:
        return _normalize_run_template_binding(DEFAULT_RUN_TEMPLATE_BINDING)
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception:
        value = {}
    if not isinstance(value, dict):
        value = {}
    return _normalize_run_template_binding(value)


def save_run_template_binding(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_run_template_binding()
    next_value = _normalize_run_template_binding(payload)
    _write_with_revision(
        RUN_TEMPLATE_BINDING_TARGET_TYPE,
        RUN_TEMPLATE_BINDING_TARGET_ID,
        "update",
        previous,
        next_value,
        changed_by,
        change_reason,
    )
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_kv (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
            """,
            (RUN_TEMPLATE_BINDING_KEY, _json_dumps(next_value), next_value["updated_at"]),
        )
        connection.commit()
    return load_run_template_binding()


def _normalize_run_template_binding(payload: dict[str, Any]) -> dict[str, Any]:
    template_id = str(payload.get("template_id") or "").strip()
    if not template_id:
        raise ValueError("template_id is required.")
    raw_bindings = payload.get("input_bindings")
    if not isinstance(raw_bindings, dict):
        raise ValueError("input_bindings must be an object.")
    input_bindings: dict[str, str] = {}
    for node_id, source in raw_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        normalized_source = str(source or "").strip()
        if not normalized_node_id or not normalized_source:
            continue
        if normalized_source not in ALLOWED_RUN_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy input source: {normalized_source}")
        input_bindings[normalized_node_id] = normalized_source
    current_message_count = sum(1 for source in input_bindings.values() if source == "current_message")
    if current_message_count != 1:
        raise ValueError("current_message must be bound exactly once.")
    return {
        "version": RUN_TEMPLATE_BINDING_VERSION,
        "template_id": template_id,
        "input_bindings": input_bindings,
        "updated_at": str(payload.get("updated_at") or utc_now_iso()),
    }
```

- [ ] **Step 4: Extend revision restore**

In `restore_revision()` in `backend/app/buddy/store.py`, add this branch after `session_summary`:

```python
    elif target_type == RUN_TEMPLATE_BINDING_TARGET_TYPE:
        current = load_run_template_binding()
        restored = _normalize_run_template_binding(restored)
        _write_with_revision(
            RUN_TEMPLATE_BINDING_TARGET_TYPE,
            RUN_TEMPLATE_BINDING_TARGET_ID,
            "restore",
            current,
            restored,
            changed_by,
            change_reason,
        )
        with _connection() as connection:
            connection.execute(
                """
                INSERT INTO buddy_kv (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                """,
                (RUN_TEMPLATE_BINDING_KEY, _json_dumps(restored), utc_now_iso()),
            )
            connection.commit()
```

- [ ] **Step 5: Add command dispatch**

In `backend/app/buddy/commands.py`, add this branch in `_dispatch_command()` after `session_summary.update`:

```python
    if action == "run_template_binding.update":
        return (
            store.save_run_template_binding(payload, changed_by=COMMAND_CHANGED_BY, change_reason=change_reason),
            "run_template_binding",
            "run_template_binding",
        )
```

- [ ] **Step 6: Add route**

In `backend/app/api/routes_buddy.py`, add after the session summary route:

```python
@router.get("/run-template-binding")
def get_run_template_binding_endpoint() -> dict[str, Any]:
    return store.load_run_template_binding()
```

- [ ] **Step 7: Run backend tests**

Run:

```bash
python -m pytest backend/tests/test_buddy_routes.py backend/tests/test_buddy_commands.py -q
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add backend/app/buddy/store.py backend/app/buddy/commands.py backend/app/api/routes_buddy.py backend/tests/test_buddy_routes.py backend/tests/test_buddy_commands.py
git commit -m "保存伙伴运行模板绑定"
```

---

### Task 2: Frontend Binding Types, API, and Domain Model

**Files:**
- Modify: `frontend/src/types/buddy.ts`
- Modify: `frontend/src/api/buddy.ts`
- Modify: `frontend/src/api/buddy.test.ts`
- Create: `frontend/src/buddy/buddyTemplateBindingModel.ts`
- Create: `frontend/src/buddy/buddyTemplateBindingModel.test.ts`

- [ ] **Step 1: Add API tests first**

In `frontend/src/api/buddy.test.ts`, import the new functions:

```ts
  fetchBuddyRunTemplateBinding,
  updateBuddyRunTemplateBinding,
```

Add this test:

```ts
test("buddy API manages run template binding through command flow", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const payload = init?.method === "POST"
      ? { result: { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } } }
      : { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchBuddyRunTemplateBinding();
  await updateBuddyRunTemplateBinding(
    { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } },
    "用户更新伙伴运行模板绑定。",
  );

  assert.equal(requests[0].url, "/api/buddy/run-template-binding");
  assert.equal(requests[1].url, "/api/buddy/commands");
  assert.deepEqual(requests[1].body, {
    action: "run_template_binding.update",
    payload: { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } },
    change_reason: "用户更新伙伴运行模板绑定。",
  });
  globalThis.fetch = originalFetch;
});
```

- [ ] **Step 2: Add domain model tests first**

Create `frontend/src/buddy/buddyTemplateBindingModel.test.ts` with:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import type { TemplateRecord } from "../types/node-system.ts";
import {
  BUDDY_RUN_INPUT_SOURCE_OPTIONS,
  buildBuddyHomeContextValue,
  buildBuddyRunTemplateInputRows,
  buildDefaultBuddyRunTemplateBinding,
  validateBuddyRunTemplateBinding,
} from "./buddyTemplateBindingModel.ts";

function template(): TemplateRecord {
  return {
    template_id: "custom_loop",
    label: "Custom Loop",
    description: "Custom Buddy template",
    default_graph_name: "Custom Loop",
    status: "active",
    state_schema: {
      prompt: { name: "prompt", description: "Prompt text", type: "text", value: "", color: "#d97706" },
      history: { name: "history", description: "History", type: "markdown", value: "", color: "#64748b" },
      context: { name: "context", description: "Page context", type: "markdown", value: "", color: "#0891b2" },
      invalid: { name: "invalid", description: "Invalid", type: "text", value: "", color: "#dc2626" },
    },
    nodes: {
      input_prompt: {
        kind: "input",
        name: "Prompt",
        description: "Prompt input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "prompt", mode: "replace" }],
        config: { value: "" },
      },
      input_history: {
        kind: "input",
        name: "History",
        description: "History input",
        ui: { position: { x: 0, y: 120 } },
        reads: [],
        writes: [{ state: "history", mode: "replace" }],
        config: { value: "" },
      },
      input_invalid: {
        kind: "input",
        name: "Invalid",
        description: "Invalid input",
        ui: { position: { x: 0, y: 240 } },
        reads: [],
        writes: [
          { state: "context", mode: "replace" },
          { state: "invalid", mode: "replace" },
        ],
        config: { value: "" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("binding model lists input rows with node and state identity", () => {
  const rows = buildBuddyRunTemplateInputRows(template());
  assert.deepEqual(rows.map((row) => [row.nodeId, row.nodeName, row.stateKey, row.stateName, row.disabledReason]), [
    ["input_prompt", "Prompt", "prompt", "prompt", ""],
    ["input_history", "History", "history", "history", ""],
    ["input_invalid", "Invalid", "", "", "Input node must write exactly one state."],
  ]);
});

test("binding model validates current message and duplicate sources", () => {
  const good = validateBuddyRunTemplateBinding(template(), {
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
      input_history: "conversation_history",
    },
  });
  assert.equal(good.valid, true);

  const missing = validateBuddyRunTemplateBinding(template(), {
    template_id: "custom_loop",
    input_bindings: { input_history: "conversation_history" },
  });
  assert.equal(missing.valid, false);
  assert.match(missing.issues.join("\n"), /current_message/);

  const duplicate = validateBuddyRunTemplateBinding(template(), {
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
      input_history: "current_message",
    },
  });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.issues.join("\n"), /exactly once/);
});

test("binding model exposes source options and Buddy Home folder package", () => {
  assert.deepEqual(BUDDY_RUN_INPUT_SOURCE_OPTIONS.map((option) => option.value), [
    "",
    "current_message",
    "conversation_history",
    "page_context",
    "buddy_home_context",
  ]);
  assert.deepEqual(buildBuddyHomeContextValue(), {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "policy.json"],
  });
  assert.deepEqual(buildDefaultBuddyRunTemplateBinding().input_bindings.input_user_message, "current_message");
});
```

- [ ] **Step 3: Run frontend tests and verify they fail**

Run:

```bash
node --test frontend/src/api/buddy.test.ts frontend/src/buddy/buddyTemplateBindingModel.test.ts
```

Expected: failure because the new API functions and model file do not exist.

- [ ] **Step 4: Add frontend types**

In `frontend/src/types/buddy.ts`, add:

```ts
export type BuddyRunInputSource = "current_message" | "conversation_history" | "page_context" | "buddy_home_context";

export type BuddyRunTemplateBinding = {
  version?: number;
  template_id: string;
  input_bindings: Record<string, BuddyRunInputSource>;
  updated_at?: string;
};

export type BuddyRunTemplateBindingValidation = {
  valid: boolean;
  issues: string[];
};
```

- [ ] **Step 5: Add API functions**

In `frontend/src/api/buddy.ts`, import `BuddyRunTemplateBinding` and add:

```ts
export function fetchBuddyRunTemplateBinding() {
  return apiGet<BuddyRunTemplateBinding>("/api/buddy/run-template-binding");
}

export function updateBuddyRunTemplateBinding(payload: BuddyRunTemplateBinding, changeReason: string) {
  return executeBuddyCommand<BuddyRunTemplateBinding>("run_template_binding.update", payload, changeReason);
}
```

- [ ] **Step 6: Add binding model**

Create `frontend/src/buddy/buddyTemplateBindingModel.ts`:

```ts
import type { GraphNode, InputNode, TemplateRecord } from "../types/node-system.ts";
import type {
  BuddyRunInputSource,
  BuddyRunTemplateBinding,
  BuddyRunTemplateBindingValidation,
} from "../types/buddy.ts";

export const DEFAULT_BUDDY_RUN_TEMPLATE_ID = "buddy_autonomous_loop";

export type BuddyRunInputSourceOption = {
  value: BuddyRunInputSource | "";
  labelKey: string;
};

export type BuddyRunTemplateInputRow = {
  nodeId: string;
  nodeName: string;
  nodeDescription: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  stateDescription: string;
  disabledReason: string;
};

export const BUDDY_RUN_INPUT_SOURCE_OPTIONS: BuddyRunInputSourceOption[] = [
  { value: "", labelKey: "buddyPage.binding.sources.none" },
  { value: "current_message", labelKey: "buddyPage.binding.sources.currentMessage" },
  { value: "conversation_history", labelKey: "buddyPage.binding.sources.conversationHistory" },
  { value: "page_context", labelKey: "buddyPage.binding.sources.pageContext" },
  { value: "buddy_home_context", labelKey: "buddyPage.binding.sources.buddyHomeContext" },
];

export function buildDefaultBuddyRunTemplateBinding(): BuddyRunTemplateBinding {
  return {
    version: 1,
    template_id: DEFAULT_BUDDY_RUN_TEMPLATE_ID,
    input_bindings: {
      input_user_message: "current_message",
      input_conversation_history: "conversation_history",
      input_page_context: "page_context",
      input_buddy_context: "buddy_home_context",
    },
  };
}

export function buildBuddyRunTemplateInputRows(template: TemplateRecord | null | undefined): BuddyRunTemplateInputRow[] {
  if (!template) {
    return [];
  }
  return Object.entries(template.nodes)
    .filter((entry): entry is [string, InputNode] => entry[1].kind === "input")
    .map(([nodeId, node]) => buildInputRow(template, nodeId, node));
}

export function validateBuddyRunTemplateBinding(
  template: TemplateRecord | null | undefined,
  binding: BuddyRunTemplateBinding,
): BuddyRunTemplateBindingValidation {
  const issues: string[] = [];
  if (!template) {
    issues.push("Selected template is not loaded.");
    return { valid: false, issues };
  }
  if (template.status === "disabled") {
    issues.push("Selected template is disabled.");
  }
  if (binding.template_id !== template.template_id) {
    issues.push("Binding template_id does not match the selected template.");
  }
  const rows = buildBuddyRunTemplateInputRows(template);
  if (!rows.some((row) => !row.disabledReason)) {
    issues.push("Selected template has no bindable input nodes.");
  }
  const seenSources = new Map<BuddyRunInputSource, string>();
  let currentMessageCount = 0;
  for (const [nodeId, source] of Object.entries(binding.input_bindings ?? {})) {
    const row = rows.find((candidate) => candidate.nodeId === nodeId);
    if (!row) {
      issues.push(`Input node does not exist: ${nodeId}`);
      continue;
    }
    if (row.disabledReason) {
      issues.push(`${nodeId}: ${row.disabledReason}`);
      continue;
    }
    if (!isBuddyRunInputSource(source)) {
      issues.push(`Unsupported Buddy input source for ${nodeId}: ${String(source)}`);
      continue;
    }
    if (source === "current_message") {
      currentMessageCount += 1;
    }
    const previousNodeId = seenSources.get(source);
    if (previousNodeId) {
      issues.push(`${source} is already bound to ${previousNodeId}.`);
    } else {
      seenSources.set(source, nodeId);
    }
  }
  if (currentMessageCount !== 1) {
    issues.push("current_message must be bound exactly once.");
  }
  return { valid: issues.length === 0, issues };
}

export function buildBuddyHomeContextValue() {
  return {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "policy.json"],
  };
}

export function isBuddyRunInputSource(value: unknown): value is BuddyRunInputSource {
  return value === "current_message"
    || value === "conversation_history"
    || value === "page_context"
    || value === "buddy_home_context";
}

function buildInputRow(template: TemplateRecord, nodeId: string, node: InputNode): BuddyRunTemplateInputRow {
  const write = node.writes.length === 1 ? node.writes[0] : null;
  const state = write ? template.state_schema[write.state] : null;
  return {
    nodeId,
    nodeName: node.name || nodeId,
    nodeDescription: node.description || "",
    stateKey: write && state ? write.state : "",
    stateName: state?.name ?? "",
    stateType: state?.type ?? "",
    stateDescription: state?.description ?? "",
    disabledReason: resolveInputRowDisabledReason(node, state, write?.state),
  };
}

function resolveInputRowDisabledReason(node: GraphNode, state: unknown, stateKey: string | undefined) {
  if (node.kind !== "input") {
    return "Node is not an input node.";
  }
  if (node.writes.length !== 1) {
    return "Input node must write exactly one state.";
  }
  if (!stateKey || !state) {
    return "Input node writes a missing state.";
  }
  return "";
}
```

- [ ] **Step 7: Run frontend tests**

Run:

```bash
node --test frontend/src/api/buddy.test.ts frontend/src/buddy/buddyTemplateBindingModel.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/types/buddy.ts frontend/src/api/buddy.ts frontend/src/api/buddy.test.ts frontend/src/buddy/buddyTemplateBindingModel.ts frontend/src/buddy/buddyTemplateBindingModel.test.ts
git commit -m "新增伙伴模板绑定模型"
```

---

### Task 3: Migrate Buddy Graph Builder to Input-Node Binding

**Files:**
- Modify: `frontend/src/buddy/buddyChatGraph.ts`
- Modify: `frontend/src/buddy/buddyChatGraph.test.ts`

- [ ] **Step 1: Add graph-builder tests first**

In `frontend/src/buddy/buddyChatGraph.test.ts`, replace fixed injection tests with tests shaped like:

```ts
test("buildBuddyChatGraph injects only configured input-node bindings", () => {
  const graph = buildBuddyChatGraph(
    createTemplate(),
    {
      userMessage: "你好",
      history: [{ role: "assistant", content: "上一轮", includeInContext: true }],
      pageContext: "当前在编辑器。",
      buddyMode: "full_access",
      buddyModel: "",
    },
    {
      template_id: "basic_buddy_loop",
      input_bindings: {
        input_user_message: "current_message",
        input_conversation_history: "conversation_history",
      },
    },
  );

  assertInputNode(graph.nodes.input_user_message);
  assertInputNode(graph.nodes.input_conversation_history);
  assert.equal(graph.nodes.input_user_message.config.value, "你好");
  assert.match(String(graph.nodes.input_conversation_history.config.value), /伙伴: 上一轮/);
  assert.equal(graph.state_schema.state_1.value, "你好");
  assert.match(String(graph.state_schema.state_2.value), /伙伴: 上一轮/);
  assert.equal(graph.nodes.input_page_context.kind, "input");
  assert.equal(graph.nodes.input_page_context.config.value, "");
  assert.equal(graph.state_schema.state_3.value, "");
  assert.equal(graph.metadata.buddy_template_id, "basic_buddy_loop");
  assert.equal(graph.metadata.buddy_can_execute_actions, true);
});

test("buildBuddyChatGraph does not inject buddy mode or skill catalog as graph input", () => {
  const graph = buildBuddyChatGraph(
    createAgenticTemplate(),
    {
      userMessage: "用工具查资料",
      history: [],
      pageContext: "页面上下文",
      buddyMode: "full_access",
    },
    {
      template_id: "buddy_autonomous_loop",
      input_bindings: {
        input_user_message: "current_message",
        input_page_context: "page_context",
      },
    },
  );

  assert.equal(graph.metadata.buddy_mode, "full_access");
  assert.equal(graph.metadata.buddy_can_execute_actions, true);
  assert.equal(graph.nodes.input_page_context.kind, "input");
  assert.equal(graph.nodes.input_page_context.config.value, "页面上下文");
  assert.equal(graph.nodes.input_skill_catalog_snapshot.kind, "input");
  assert.deepEqual(graph.nodes.input_skill_catalog_snapshot.config.value, []);
  assert.deepEqual(graph.state_schema.state_7.value, []);
});
```

Keep helper assertions already present in the test file.

- [ ] **Step 2: Run graph-builder tests and verify they fail**

Run:

```bash
node --test frontend/src/buddy/buddyChatGraph.test.ts
```

Expected: failure because `buildBuddyChatGraph()` has the old signature and still performs fixed state injection.

- [ ] **Step 3: Update imports and input type**

In `frontend/src/buddy/buddyChatGraph.ts`, import:

```ts
import type { BuddyRunInputSource, BuddyRunTemplateBinding } from "../types/buddy.ts";
import {
  buildBuddyHomeContextValue,
  validateBuddyRunTemplateBinding,
} from "./buddyTemplateBindingModel.ts";
```

Remove `skillCatalog?: SkillDefinition[];` from `BuildBuddyChatGraphInput`. Keep `buddyMode` and `buddyModel`.

- [ ] **Step 4: Change builder signature and validation**

Change the function signature to:

```ts
export function buildBuddyChatGraph(
  template: TemplateRecord,
  input: BuildBuddyChatGraphInput,
  binding: BuddyRunTemplateBinding,
): GraphPayload {
```

Immediately after creating and configuring the cloned graph, add:

```ts
  const validation = validateBuddyRunTemplateBinding(template, binding);
  if (!validation.valid) {
    throw new Error(`Buddy run template binding is invalid: ${validation.issues.join(" ")}`);
  }
  applyBuddyRunTemplateBinding(graph, binding, buildBuddyRuntimeSourceValues(input));
```

- [ ] **Step 5: Replace fixed state injection with input-node injection**

Remove these fixed calls from `buildBuddyChatGraph()`:

```ts
  const historyValue = formatBuddyHistory(input.history);
  const pageContextValue = input.pageContext.trim() || "当前页面上下文不可用。";
  const skillCatalogSnapshot = buildBuddySkillCatalogSnapshot(input.skillCatalog ?? [], buddyMode);

  setStateValueByNameOrKey(graph, "user_message", BUDDY_USER_MESSAGE_STATE_KEY, input.userMessage);
  setStateValueByNameOrKey(graph, "conversation_history", BUDDY_HISTORY_STATE_KEY, historyValue);
  setStateValueByNameOrKey(graph, "page_context", BUDDY_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  setStateValueByNameOrKey(graph, "buddy_mode", BUDDY_MODE_STATE_KEY, buddyMode);
  setStateValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
  syncInputNodeValueByNameOrKey(graph, "user_message", BUDDY_USER_MESSAGE_STATE_KEY, input.userMessage);
  syncInputNodeValueByNameOrKey(graph, "conversation_history", BUDDY_HISTORY_STATE_KEY, historyValue);
  syncInputNodeValueByNameOrKey(graph, "page_context", BUDDY_PAGE_CONTEXT_STATE_KEY, pageContextValue);
  syncInputNodeValueByNameOrKey(graph, "buddy_mode", BUDDY_MODE_STATE_KEY, buddyMode);
  syncInputNodeValueByName(graph, "skill_catalog_snapshot", skillCatalogSnapshot);
```

Remove the fixed reply-clearing loop for `buddy_reply`, `visible_reply`, `final_reply`, `direct_reply`, `denied_reply`, and `approval_prompt`. Arbitrary templates should use their saved defaults and parent output-node streaming, not Buddy-specific state-name cleanup.

Add these helpers near the old state helpers:

```ts
type BuddyRuntimeSourceValues = Record<BuddyRunInputSource, unknown>;

function buildBuddyRuntimeSourceValues(input: BuildBuddyChatGraphInput): BuddyRuntimeSourceValues {
  return {
    current_message: input.userMessage,
    conversation_history: formatBuddyHistory(input.history),
    page_context: input.pageContext.trim() || "当前页面上下文不可用。",
    buddy_home_context: buildBuddyHomeContextValue(),
  };
}

function applyBuddyRunTemplateBinding(
  graph: GraphPayload,
  binding: BuddyRunTemplateBinding,
  sourceValues: BuddyRuntimeSourceValues,
) {
  for (const [nodeId, source] of Object.entries(binding.input_bindings ?? {})) {
    const node = graph.nodes[nodeId];
    if (!node || node.kind !== "input") {
      throw new Error(`Buddy binding references a missing input node: ${nodeId}`);
    }
    if (node.writes.length !== 1) {
      throw new Error(`Buddy binding input node must write exactly one state: ${nodeId}`);
    }
    const stateKey = node.writes[0].state;
    if (!graph.state_schema[stateKey]) {
      throw new Error(`Buddy binding input node writes a missing state: ${nodeId}`);
    }
    const value = sourceValues[source];
    node.config.value = cloneJson(value);
    graph.state_schema[stateKey].value = cloneJson(value);
  }
}
```

Update metadata to include:

```ts
      buddy_template_binding: cloneJson(binding),
```

- [ ] **Step 6: Remove unused builder code**

Remove unused imports, constants, and functions made obsolete by the migration from this file when TypeScript reports them as unused:

- `SkillDefinition` import from this file.
- `BUDDY_USER_MESSAGE_STATE_KEY`, `BUDDY_HISTORY_STATE_KEY`, `BUDDY_PAGE_CONTEXT_STATE_KEY`, and `BUDDY_MODE_STATE_KEY`.
- `setStateValueByNameOrKey()` and `syncInputNodeValueByNameOrKey()`.
- `buildBuddySkillCatalogSnapshot()`.

Do not remove `BUDDY_REVIEW_TEMPLATE_ID` or self-review state constants used by `buildBuddyReviewGraph()`.

- [ ] **Step 7: Run graph-builder tests**

Run:

```bash
node --test frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/buddyTemplateBindingModel.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add frontend/src/buddy/buddyChatGraph.ts frontend/src/buddy/buddyChatGraph.test.ts
git commit -m "按输入节点绑定构建伙伴运行图"
```

---

### Task 4: Use Saved Binding in Buddy Chat Sender

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/buddy/BuddyWidget.structure.test.ts`

- [ ] **Step 1: Update structure tests first**

In `frontend/src/buddy/BuddyWidget.structure.test.ts`, add assertions in the visible-run test section:

```ts
assert.match(componentSource, /fetchBuddyRunTemplateBinding/);
assert.match(componentSource, /fetchTemplate\(binding\.template_id\)/);
assert.doesNotMatch(componentSource, /fetchTemplate\(BUDDY_TEMPLATE_ID\)/);
```

- [ ] **Step 2: Run structure tests and verify they fail**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: failure because the sender still fetches `BUDDY_TEMPLATE_ID`.

- [ ] **Step 3: Update imports**

In `frontend/src/buddy/BuddyWidget.vue`, import `fetchBuddyRunTemplateBinding` from `../api/buddy.ts`. Remove `BUDDY_TEMPLATE_ID` and `fetchSkillCatalog` from the visible-run path imports if they are no longer used there.

- [ ] **Step 4: Fetch binding and selected template**

Replace the visible-run preparation block:

```ts
    const [template, skillCatalog] = await Promise.all([
      fetchTemplate(BUDDY_TEMPLATE_ID),
      fetchSkillCatalog({ includeDisabled: true }),
    ]);
    const graph = buildBuddyChatGraph(template, {
      userMessage: turn.userMessage,
      history,
      pageContext: buildPageContext(),
      buddyMode: buddyMode.value,
      buddyModel: buddyModelRef.value,
      skillCatalog,
    });
```

with:

```ts
    const binding = await fetchBuddyRunTemplateBinding();
    const template = await fetchTemplate(binding.template_id);
    const graph = buildBuddyChatGraph(
      template,
      {
        userMessage: turn.userMessage,
        history,
        pageContext: buildPageContext(),
        buddyMode: buddyMode.value,
        buddyModel: buddyModelRef.value,
      },
      binding,
    );
```

- [ ] **Step 5: Keep error behavior visible**

Leave the existing `catch` block in `processQueuedTurn()` as the single visible error path. It already writes `buddy.errorReply` to the assistant message. Confirm the thrown validation error from `buildBuddyChatGraph()` reaches this block before `runGraph()` starts.

- [ ] **Step 6: Run tests**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/buddy/buddyChatGraph.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/buddy/BuddyWidget.vue frontend/src/buddy/BuddyWidget.structure.test.ts
git commit -m "使用伙伴模板绑定启动对话运行"
```

---

### Task 5: Add Buddy Page Binding Tab

**Files:**
- Modify: `frontend/src/pages/BuddyPage.vue`
- Modify: `frontend/src/pages/BuddyPage.structure.test.ts`
- Modify: `frontend/src/pages/buddyRevisionHistoryModel.ts`
- Modify: `frontend/src/pages/buddyRevisionHistoryModel.test.ts`
- Modify: `frontend/src/i18n/messages.ts`

- [ ] **Step 1: Update structure tests first**

In `frontend/src/pages/BuddyPage.structure.test.ts`, add:

```ts
  assert.match(source, /fetchBuddyRunTemplateBinding/);
  assert.match(source, /updateBuddyRunTemplateBinding/);
  assert.match(source, /fetchTemplates/);
  assert.match(source, /fetchTemplate/);
  assert.match(source, /name="binding"/);
  assert.match(source, /buildBuddyRunTemplateInputRows/);
  assert.match(source, /validateBuddyRunTemplateBinding/);
```

Add an ordering assertion so the Binding tab appears before Confirmation:

```ts
test("BuddyPage places template binding before confirmations", () => {
  const bindingIndex = source.indexOf('name="binding"');
  const confirmationIndex = source.indexOf('name="confirmation"');
  assert.ok(bindingIndex > -1);
  assert.ok(confirmationIndex > -1);
  assert.ok(bindingIndex < confirmationIndex);
});
```

- [ ] **Step 2: Update revision model tests first**

In `frontend/src/pages/buddyRevisionHistoryModel.test.ts`, add a case:

```ts
test("revision history includes run template binding target", () => {
  assert.ok(BUDDY_REVISION_HISTORY_TARGET_FILTERS.includes("run_template_binding"));
  const rows = buildBuddyRevisionHistoryRows(
    [{
      revision_id: "rev_binding",
      target_type: "run_template_binding",
      target_id: "run_template_binding",
      operation: "update",
      previous_value: { template_id: "buddy_autonomous_loop", input_bindings: { input_user_message: "current_message" } },
      next_value: { template_id: "custom_loop", input_bindings: { input_prompt: "current_message" } },
      changed_by: "buddy_command",
      change_reason: "用户更新伙伴运行模板绑定。",
      created_at: "2026-05-13T00:00:00Z",
    }],
    [{
      command_id: "cmd_binding",
      kind: "buddy.manual_write",
      action: "run_template_binding.update",
      status: "succeeded",
      target_type: "run_template_binding",
      target_id: "run_template_binding",
      revision_id: "rev_binding",
      run_id: null,
      payload: {},
      change_reason: "用户更新伙伴运行模板绑定。",
      created_at: "2026-05-13T00:00:00Z",
      completed_at: "2026-05-13T00:00:00Z",
    }],
  );
  assert.equal(filterBuddyRevisionHistoryRows(rows, "run_template_binding").length, 1);
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
node --test frontend/src/pages/BuddyPage.structure.test.ts frontend/src/pages/buddyRevisionHistoryModel.test.ts
```

Expected: failure because the tab, APIs, and filter do not exist.

- [ ] **Step 4: Extend revision filter**

In `frontend/src/pages/buddyRevisionHistoryModel.ts`, change:

```ts
export const BUDDY_REVISION_HISTORY_TARGET_FILTERS = [
  "all",
  "profile",
  "policy",
  "memory",
  "session_summary",
] as const;
```

to:

```ts
export const BUDDY_REVISION_HISTORY_TARGET_FILTERS = [
  "all",
  "profile",
  "policy",
  "memory",
  "session_summary",
  "run_template_binding",
] as const;
```

- [ ] **Step 5: Add Buddy page state and imports**

In `frontend/src/pages/BuddyPage.vue`, add imports:

```ts
import { fetchTemplate, fetchTemplates } from "@/api/graphs";
import type { TemplateRecord } from "@/types/node-system";
import type { BuddyRunInputSource, BuddyRunTemplateBinding } from "@/types/buddy";
import {
  BUDDY_RUN_INPUT_SOURCE_OPTIONS,
  buildBuddyRunTemplateInputRows,
  buildDefaultBuddyRunTemplateBinding,
  validateBuddyRunTemplateBinding,
} from "@/buddy/buddyTemplateBindingModel";
```

Add Buddy API imports:

```ts
  fetchBuddyRunTemplateBinding,
  updateBuddyRunTemplateBinding,
```

Add refs near existing save flags:

```ts
const isSavingBinding = ref(false);
const isLoadingBindingTemplate = ref(false);
const availableTemplates = ref<TemplateRecord[]>([]);
const selectedBindingTemplate = ref<TemplateRecord | null>(null);
const bindingDraft = ref<BuddyRunTemplateBinding>(buildDefaultBuddyRunTemplateBinding());
```

Add computed values:

```ts
const bindingInputRows = computed(() => buildBuddyRunTemplateInputRows(selectedBindingTemplate.value));
const bindingValidation = computed(() => validateBuddyRunTemplateBinding(selectedBindingTemplate.value, bindingDraft.value));
const bindingTemplateOptions = computed(() =>
  availableTemplates.value.map((template) => ({
    label: `${template.label} (${template.template_id})`,
    value: template.template_id,
  })),
);
const bindingSourceOptions = computed(() =>
  BUDDY_RUN_INPUT_SOURCE_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  })),
);
```

Include `isSavingBinding` and `isLoadingBindingTemplate` in `hasActiveBuddyPageWrite()`.

- [ ] **Step 6: Load binding data**

In `loadAll()`, include template list and binding:

```ts
    const [profile, policy, memoryList, summary, revisionList, commandList, templateList, runBinding] = await Promise.all([
      fetchBuddyProfile(),
      fetchBuddyPolicy(),
      fetchBuddyMemories(),
      fetchBuddySessionSummary(),
      fetchBuddyRevisions(),
      fetchBuddyCommands(),
      fetchTemplates(),
      fetchBuddyRunTemplateBinding(),
    ]);
```

After assigning commands:

```ts
    availableTemplates.value = templateList;
    bindingDraft.value = normalizeBindingDraft(runBinding);
    await loadBindingTemplate(bindingDraft.value.template_id);
```

Add helper functions:

```ts
function normalizeBindingDraft(binding: BuddyRunTemplateBinding): BuddyRunTemplateBinding {
  return {
    version: binding.version ?? 1,
    template_id: binding.template_id || buildDefaultBuddyRunTemplateBinding().template_id,
    input_bindings: { ...(binding.input_bindings ?? {}) },
    updated_at: binding.updated_at,
  };
}

async function loadBindingTemplate(templateId: string) {
  if (!templateId) {
    selectedBindingTemplate.value = null;
    return;
  }
  try {
    isLoadingBindingTemplate.value = true;
    selectedBindingTemplate.value = await fetchTemplate(templateId);
  } finally {
    isLoadingBindingTemplate.value = false;
  }
}
```

- [ ] **Step 7: Add binding handlers**

Add:

```ts
async function selectBindingTemplate(templateId: string) {
  bindingDraft.value = {
    ...bindingDraft.value,
    template_id: templateId,
    input_bindings: {},
  };
  await loadBindingTemplate(templateId);
}

function setBindingSource(nodeId: string, source: BuddyRunInputSource | "") {
  const nextBindings = { ...bindingDraft.value.input_bindings };
  if (source) {
    nextBindings[nodeId] = source;
  } else {
    delete nextBindings[nodeId];
  }
  bindingDraft.value = {
    ...bindingDraft.value,
    input_bindings: nextBindings,
  };
}

function resetBindingToDefault() {
  bindingDraft.value = buildDefaultBuddyRunTemplateBinding();
  void loadBindingTemplate(bindingDraft.value.template_id);
}

async function saveBinding() {
  if (!bindingValidation.value.valid || isSavingBinding.value) {
    return;
  }
  try {
    isSavingBinding.value = true;
    bindingDraft.value = normalizeBindingDraft(
      acceptCommandResult(await updateBuddyRunTemplateBinding(bindingDraft.value, t("buddyPage.changeReasons.binding"))),
    );
    await refreshAuditTrail();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingBinding.value = false;
  }
}
```

- [ ] **Step 8: Add binding tab markup**

Insert the tab after Summary and before Confirmation:

```vue
        <ElTabPane :label="t('buddyPage.tabs.binding')" name="binding">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.binding.title") }}</h3>
                <p>{{ t("buddyPage.binding.body") }}</p>
              </div>
            </div>
            <ElForm label-position="top" class="buddy-page__form">
              <ElFormItem :label="t('buddyPage.binding.template')">
                <ElSelect
                  v-model="bindingDraft.template_id"
                  :loading="isLoadingBindingTemplate"
                  filterable
                  @change="selectBindingTemplate"
                >
                  <ElOption
                    v-for="option in bindingTemplateOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </ElSelect>
              </ElFormItem>
              <ElAlert
                v-if="!bindingValidation.valid"
                type="warning"
                show-icon
                :closable="false"
                :title="bindingValidation.issues.join(' ')"
              />
              <ElTable :data="bindingInputRows" class="buddy-page__table buddy-page__binding-table" empty-text=" ">
                <ElTableColumn prop="nodeName" :label="t('buddyPage.binding.inputNode')" min-width="150" />
                <ElTableColumn prop="nodeId" :label="t('buddyPage.binding.nodeId')" min-width="190" show-overflow-tooltip />
                <ElTableColumn prop="stateName" :label="t('buddyPage.binding.stateName')" min-width="150" />
                <ElTableColumn prop="stateKey" :label="t('buddyPage.binding.stateKey')" min-width="160" show-overflow-tooltip />
                <ElTableColumn prop="stateType" :label="t('buddyPage.binding.stateType')" width="110" />
                <ElTableColumn :label="t('buddyPage.binding.source')" min-width="210" fixed="right">
                  <template #default="{ row }">
                    <ElSelect
                      :model-value="bindingDraft.input_bindings[row.nodeId] || ''"
                      :disabled="Boolean(row.disabledReason)"
                      @update:model-value="(value) => setBindingSource(row.nodeId, value)"
                    >
                      <ElOption
                        v-for="option in bindingSourceOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </ElSelect>
                    <small v-if="row.disabledReason" class="buddy-page__binding-warning">{{ row.disabledReason }}</small>
                  </template>
                </ElTableColumn>
              </ElTable>
              <div class="buddy-page__actions">
                <ElButton
                  type="primary"
                  :loading="isSavingBinding"
                  :disabled="!bindingValidation.valid"
                  @click="saveBinding"
                >
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("buddyPage.binding.save") }}</span>
                </ElButton>
                <ElButton :disabled="isSavingBinding" @click="resetBindingToDefault">
                  {{ t("buddyPage.binding.resetDefault") }}
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>
```

Add `ElSelect` and `ElOption` imports from Element Plus.

- [ ] **Step 9: Add i18n labels**

In both locales in `frontend/src/i18n/messages.ts`, add `tabs.binding` and `buddyPage.binding`.

Chinese:

```ts
        binding: "绑定",
```

```ts
      binding: {
        title: "运行模板绑定",
        body: "选择伙伴聊天要运行的模板，并把伙伴输入绑定到模板的 input 节点。",
        template: "运行模板",
        inputNode: "Input 节点",
        nodeId: "节点 ID",
        stateName: "State 名称",
        stateKey: "State Key",
        stateType: "类型",
        source: "输入来源",
        save: "保存绑定",
        resetDefault: "恢复默认绑定",
        sources: {
          none: "不绑定",
          currentMessage: "当前消息",
          conversationHistory: "对话历史",
          pageContext: "页面上下文",
          buddyHomeContext: "Buddy Home 上下文",
        },
      },
```

English:

```ts
        binding: "Binding",
```

```ts
      binding: {
        title: "Run Template Binding",
        body: "Choose the template Buddy chat runs and map Buddy inputs to the template input nodes.",
        template: "Run template",
        inputNode: "Input node",
        nodeId: "Node ID",
        stateName: "State name",
        stateKey: "State key",
        stateType: "Type",
        source: "Input source",
        save: "Save binding",
        resetDefault: "Reset default",
        sources: {
          none: "Not bound",
          currentMessage: "Current message",
          conversationHistory: "Conversation history",
          pageContext: "Page context",
          buddyHomeContext: "Buddy Home context",
        },
      },
```

Add history target labels:

```ts
          run_template_binding: "运行绑定",
```

and:

```ts
          run_template_binding: "Run binding",
```

Add change reason labels:

```ts
        binding: "用户在伙伴页面更新运行模板绑定。",
```

and:

```ts
        binding: "User updated the Buddy run template binding from the Buddy page.",
```

- [ ] **Step 10: Run tests**

Run:

```bash
node --test frontend/src/pages/BuddyPage.structure.test.ts frontend/src/pages/buddyRevisionHistoryModel.test.ts frontend/src/i18n/messages.test.ts frontend/src/i18n/sourceCoverage.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 11: Commit**

Run:

```bash
git add frontend/src/pages/BuddyPage.vue frontend/src/pages/BuddyPage.structure.test.ts frontend/src/pages/buddyRevisionHistoryModel.ts frontend/src/pages/buddyRevisionHistoryModel.test.ts frontend/src/i18n/messages.ts
git commit -m "新增伙伴运行绑定页面"
```

---

### Task 6: Remove Permission Mode from Official Buddy Template Inputs

**Files:**
- Modify: `graph_template/official/buddy_autonomous_loop/template.json`
- Modify: `backend/tests/test_template_layouts.py`
- Modify: `docs/current_project_status.md`

- [ ] **Step 1: Add template contract assertions first**

In `backend/tests/test_template_layouts.py`, inside `test_buddy_autonomous_loop_contract`, add:

```python
        self.assertNotIn("buddy_mode", states)
        self.assertNotIn("input_buddy_mode", nodes)
        for node in nodes.values():
            for read in node.get("reads", []):
                self.assertNotEqual(read.get("state"), "buddy_mode")
        for edge in template["edges"]:
            self.assertNotEqual(edge.get("source"), "input_buddy_mode")
            self.assertNotEqual(edge.get("target"), "input_buddy_mode")
```

- [ ] **Step 2: Run template test and verify it fails**

Run:

```bash
python -m pytest backend/tests/test_template_layouts.py::TemplateLayoutTests::test_buddy_autonomous_loop_contract -q
```

Expected: failure because the official template still contains `buddy_mode`.

- [ ] **Step 3: Remove root `buddy_mode` from the official template**

Edit `graph_template/official/buddy_autonomous_loop/template.json` using a structured JSON rewrite during implementation. The rewrite must:

- Remove root `state_schema.buddy_mode`.
- Remove root `nodes.input_buddy_mode`.
- Remove root edges whose source or target is `input_buddy_mode`.
- Remove any root node reads where `state` is `buddy_mode`.
- Recursively apply the same removal inside subgraph node `config.graph` objects.

Use this one-off script command during implementation:

```bash
python - <<'PY'
import json
from pathlib import Path

path = Path("graph_template/official/buddy_autonomous_loop/template.json")
payload = json.loads(path.read_text(encoding="utf-8"))

def strip_buddy_mode(graph):
    graph.get("state_schema", {}).pop("buddy_mode", None)
    nodes = graph.get("nodes", {})
    nodes.pop("input_buddy_mode", None)
    graph["edges"] = [
        edge for edge in graph.get("edges", [])
        if edge.get("source") != "input_buddy_mode" and edge.get("target") != "input_buddy_mode"
    ]
    for node in nodes.values():
        if isinstance(node.get("reads"), list):
            node["reads"] = [read for read in node["reads"] if read.get("state") != "buddy_mode"]
        if node.get("kind") == "subgraph" and isinstance(node.get("config", {}).get("graph"), dict):
            strip_buddy_mode(node["config"]["graph"])

strip_buddy_mode(payload)
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
```

After this script, review the diff manually and ensure no unrelated template fields changed beyond formatting and `buddy_mode` removal.

- [ ] **Step 4: Update project status doc**

In `docs/current_project_status.md`, change the Buddy main-template flow sentence from:

```md
输入用户消息、历史、页面上下文、伙伴模式和 Buddy Home 选中文件
```

to:

```md
通过伙伴运行绑定把当前消息、对话历史、页面上下文和 Buddy Home 上下文注入模板 input 节点
```

Also change the metadata sentence near the top so it says `buddy_mode` is runtime permission metadata and is not graph input state.

- [ ] **Step 5: Run template tests**

Run:

```bash
python -m pytest backend/tests/test_template_layouts.py -q
```

Expected: all template layout tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add graph_template/official/buddy_autonomous_loop/template.json backend/tests/test_template_layouts.py docs/current_project_status.md
git commit -m "移除伙伴模板权限输入"
```

---

### Task 7: Full Verification, Build, Restart, and Push

**Files:**
- No source edits unless verification reveals a concrete failing test.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
python -m pytest backend/tests/test_buddy_routes.py backend/tests/test_buddy_commands.py backend/tests/test_template_layouts.py -q
```

Expected: all selected backend tests pass.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
node --test frontend/src/api/buddy.test.ts frontend/src/buddy/buddyTemplateBindingModel.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/pages/BuddyPage.structure.test.ts frontend/src/pages/buddyRevisionHistoryModel.test.ts frontend/src/i18n/messages.test.ts frontend/src/i18n/sourceCoverage.test.ts
```

Expected: all selected frontend tests pass.

- [ ] **Step 3: Build frontend**

Run:

```bash
npm --prefix frontend run build
```

Expected: Vite build completes successfully.

- [ ] **Step 4: Restart TooGraph**

Run:

```bash
npm start
```

Expected: TooGraph restarts on `http://127.0.0.1:3477`.

If `npm start` keeps the process attached, leave it running only long enough to verify health, then stop it cleanly before final response.

- [ ] **Step 5: Verify local health**

Run:

```bash
curl -s http://127.0.0.1:3477/api/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 6: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted source files except ignored runtime artifacts. If verification fixes were needed, commit them with a Chinese message.

- [ ] **Step 7: Push**

Run:

```bash
git push
```

Expected: `main` pushes to `github.com:OoABYSSoO/TooGraph.git`.
