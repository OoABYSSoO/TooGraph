# Buddy Output Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Buddy chat render only parent graph output nodes, support multiple independent streamed outputs, remove run trace capsules from chat, and show per-node timing capsules on the canvas.

**Architecture:** First fix the current Buddy intake subgraph boundary mismatch so the existing template produces correct state. Then add a frontend public-output protocol model that maps root-level output nodes to their single state and direct upstream node. Buddy consumes that model to create output messages, while the editor workspace uses a separate node timing model to display per-node runtime capsules on the canvas.

**Tech Stack:** Vue 3, TypeScript, Element Plus, Node test runner, FastAPI runtime event stream, existing TooGraph node-system graph protocol.

---

## File Structure

- Modify `graph_template/official/buddy_autonomous_loop/template.json`: reorder the intake subgraph output boundary nodes so parent subgraph writes map to the correct state, and keep user-visible content exported only through parent output nodes.
- Modify `backend/tests/test_template_layouts.py`: protect the Buddy intake output boundary ordering.
- Create `frontend/src/buddy/buddyPublicOutput.ts`: root-level output binding discovery, output message reducer, output timing helpers.
- Create `frontend/src/buddy/buddyPublicOutput.test.ts`: tests for root-only output discovery, event routing, ordering, timing, and structured output classification.
- Modify `frontend/src/buddy/BuddyWidget.vue`: remove run trace rendering from chat, consume public-output messages, create one assistant message per parent output node, and persist completed output messages.
- Modify `frontend/src/buddy/buddyChatGraph.ts`: retire Buddy reply-state extraction from the visible path or leave it only as a fallback for old persisted runs.
- Modify `frontend/src/buddy/buddyChatGraph.test.ts`: update tests so Buddy does not create chat messages from intermediate node output.
- Create `frontend/src/editor/workspace/runNodeTimingModel.ts`: event and run-detail reducer for per-node timing.
- Create `frontend/src/editor/workspace/runNodeTimingModel.test.ts`: tests for running, completed, failed, paused, and final run reconciliation.
- Modify `frontend/src/editor/workspace/useWorkspaceRunVisualState.ts`: apply final run-detail node timings and live node timing events.
- Modify `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`: pass run events into the node timing visual state.
- Modify `frontend/src/editor/workspace/useWorkspaceRunController.ts`: clear node timing state when a new run is queued.
- Modify `frontend/src/editor/workspace/useWorkspaceTabLifecycleController.ts`: clear node timing state on tab cleanup.
- Modify `frontend/src/editor/workspace/EditorWorkspaceShell.vue`: own `runNodeTimingByTabId` and pass timing data to `EditorCanvas`.
- Modify related workspace structure tests under `frontend/src/editor/workspace/*.test.ts`.
- Modify `frontend/src/editor/canvas/EditorCanvas.vue`: accept `runNodeTimingByNodeId` and pass each node timing record to `NodeCard`.
- Modify `frontend/src/editor/canvas/canvasRunPresentationModel.ts`: add a small presentation helper for timing visibility and formatted status.
- Modify `frontend/src/editor/canvas/canvasRunPresentationModel.test.ts`: cover timing presentation rules.
- Modify `frontend/src/editor/nodes/NodeCard.vue`: render the top-left timing capsule with an Element Plus clock icon and stable styling.
- Modify `frontend/src/editor/nodes/NodeCard.structure.test.ts`: protect the timing capsule markup and CSS.
- Modify `frontend/src/i18n/zh-CN.ts` and `frontend/src/i18n/en-US.ts`: add the node timing capsule label and any Buddy output card labels used by the UI.

## Task 1: Fix Buddy Intake Subgraph Boundary

**Files:**
- Modify: `graph_template/official/buddy_autonomous_loop/template.json`
- Modify: `backend/tests/test_template_layouts.py`

- [ ] **Step 1: Write the failing template layout test**

Add assertions to the Buddy template test that the parent `intake_request.writes` order matches the embedded intake output node order.

```python
        intake_output_boundaries = [
            node["reads"][0]["state"]
            for node in intake_graph["nodes"].values()
            if node["kind"] == "output"
        ]
        self.assertEqual(
            intake_output_boundaries,
            [write["state"] for write in nodes["intake_request"]["writes"]],
        )
```

- [ ] **Step 2: Run the focused failing test**

Run: `pytest backend/tests/test_template_layouts.py -q`

Expected before implementation: the Buddy template layout test fails because the embedded output nodes are ordered as `request_understanding`, then `visible_reply`, while the parent writes are `visible_reply`, then `request_understanding`.

- [ ] **Step 3: Reorder the embedded intake output nodes**

In `graph_template/official/buddy_autonomous_loop/template.json`, move the `output_visible_reply` node definition before `output_request_understanding` inside `nodes.intake_request.config.graph.nodes`.

The relevant embedded output order must become:

```json
"output_visible_reply": {
  "kind": "output",
  "name": "输出即时回复",
  "reads": [
    {
      "state": "visible_reply",
      "required": false
    }
  ]
},
"output_request_understanding": {
  "kind": "output",
  "name": "输出请求理解",
  "reads": [
    {
      "state": "request_understanding",
      "required": true
    }
  ]
}
```

Keep the existing config, UI positions, and edge targets unchanged.

- [ ] **Step 4: Verify the test passes**

Run: `pytest backend/tests/test_template_layouts.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add graph_template/official/buddy_autonomous_loop/template.json backend/tests/test_template_layouts.py
git commit -m "修正伙伴请求理解输出边界"
git push
```

## Task 2: Add Root Public Output Binding Model

**Files:**
- Create: `frontend/src/buddy/buddyPublicOutput.ts`
- Create: `frontend/src/buddy/buddyPublicOutput.test.ts`

- [ ] **Step 1: Write binding discovery tests**

Create `frontend/src/buddy/buddyPublicOutput.test.ts` with these initial tests:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuddyPublicOutputBindings,
  resolveBuddyPublicOutputMessageKind,
} from "./buddyPublicOutput.ts";

test("buildBuddyPublicOutputBindings scans only root output nodes", () => {
  const graph = {
    state_schema: {
      answer: { name: "answer", description: "", type: "markdown", value: "", color: "#000" },
      internal: { name: "internal", description: "", type: "json", value: {}, color: "#000" },
    },
    nodes: {
      writer: { kind: "agent", name: "Writer", reads: [], writes: [{ state: "answer", mode: "replace" }], config: {}, ui: { position: { x: 0, y: 0 } } },
      output_answer: {
        kind: "output",
        name: "Answer",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: { displayMode: "markdown" },
        ui: { position: { x: 0, y: 0 } },
      },
      nested: {
        kind: "subgraph",
        name: "Nested",
        reads: [],
        writes: [],
        config: {
          graph: {
            state_schema: { internal: { name: "internal", description: "", type: "json", value: {}, color: "#000" } },
            nodes: {
              output_internal: {
                kind: "output",
                name: "Internal",
                reads: [{ state: "internal", required: true }],
                writes: [],
                config: { displayMode: "json" },
                ui: { position: { x: 0, y: 0 } },
              },
            },
            edges: [],
            conditional_edges: [],
            metadata: {},
          },
        },
        ui: { position: { x: 0, y: 0 } },
      },
    },
    edges: [{ source: "writer", target: "output_answer" }],
    conditional_edges: [],
    metadata: {},
    graph_id: null,
    name: "Buddy",
  };

  assert.deepEqual(buildBuddyPublicOutputBindings(graph), [
    {
      outputNodeId: "output_answer",
      outputNodeName: "Answer",
      stateKey: "answer",
      stateName: "answer",
      stateType: "markdown",
      displayMode: "markdown",
      upstreamNodeIds: ["writer"],
    },
  ]);
});

test("resolveBuddyPublicOutputMessageKind separates text bubbles from cards", () => {
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "markdown", displayMode: "markdown" }), "text");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "text", displayMode: "plain" }), "text");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "json", displayMode: "json" }), "card");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "result_package", displayMode: "auto" }), "card");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "file", displayMode: "documents" }), "card");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test frontend/src/buddy/buddyPublicOutput.test.ts`

Expected: FAIL because `buddyPublicOutput.ts` does not exist.

- [ ] **Step 3: Implement binding discovery**

Create `frontend/src/buddy/buddyPublicOutput.ts` with these exports:

```ts
import type { GraphPayload } from "../types/node-system.ts";

export type BuddyPublicOutputBinding = {
  outputNodeId: string;
  outputNodeName: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  upstreamNodeIds: string[];
};

export type BuddyPublicOutputMessageKind = "text" | "card";

export function buildBuddyPublicOutputBindings(graph: Pick<GraphPayload, "state_schema" | "nodes" | "edges" | "conditional_edges">): BuddyPublicOutputBinding[] {
  return Object.entries(graph.nodes)
    .filter(([, node]) => node.kind === "output")
    .flatMap(([outputNodeId, node]) => {
      const read = node.reads[0];
      const stateKey = typeof read?.state === "string" ? read.state.trim() : "";
      if (!stateKey || node.reads.length !== 1) {
        return [];
      }
      const stateDefinition = graph.state_schema[stateKey];
      return [
        {
          outputNodeId,
          outputNodeName: node.name?.trim() || outputNodeId,
          stateKey,
          stateName: stateDefinition?.name?.trim() || stateKey,
          stateType: stateDefinition?.type?.trim() || "text",
          displayMode: normalizeDisplayMode(node.config?.displayMode),
          upstreamNodeIds: resolveDirectUpstreamNodeIds(graph, outputNodeId),
        },
      ];
    });
}

export function resolveBuddyPublicOutputMessageKind(input: { stateType: string; displayMode: string | null | undefined }): BuddyPublicOutputMessageKind {
  const stateType = input.stateType.trim();
  const displayMode = String(input.displayMode ?? "").trim();
  if (stateType === "markdown" || stateType === "text" || displayMode === "markdown" || displayMode === "plain") {
    return "text";
  }
  return "card";
}

function normalizeDisplayMode(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "auto";
}

function resolveDirectUpstreamNodeIds(graph: Pick<GraphPayload, "edges" | "conditional_edges">, outputNodeId: string) {
  const upstream = new Set<string>();
  for (const edge of graph.edges ?? []) {
    if (edge.target === outputNodeId && edge.source) {
      upstream.add(edge.source);
    }
  }
  for (const route of graph.conditional_edges ?? []) {
    for (const target of Object.values(route.branches ?? {})) {
      if (target === outputNodeId && route.source) {
        upstream.add(route.source);
      }
    }
  }
  return Array.from(upstream);
}
```

- [ ] **Step 4: Verify binding tests pass**

Run: `node --test frontend/src/buddy/buddyPublicOutput.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/buddy/buddyPublicOutput.ts frontend/src/buddy/buddyPublicOutput.test.ts
git commit -m "建立伙伴父图输出索引"
git push
```

## Task 3: Add Public Output Event Reducer

**Files:**
- Modify: `frontend/src/buddy/buddyPublicOutput.ts`
- Modify: `frontend/src/buddy/buddyPublicOutput.test.ts`

- [ ] **Step 1: Write event reducer tests**

Append tests that prove ordering, timing, text streaming, JSON card completion, and intermediate-output ignoring:

```ts
import { reduceBuddyPublicOutputEvent, createBuddyPublicOutputRuntimeState } from "./buddyPublicOutput.ts";

test("reduceBuddyPublicOutputEvent starts output timing from upstream node start and completes on matching state", () => {
  const bindings = [
    {
      outputNodeId: "output_answer",
      outputNodeName: "Answer",
      stateKey: "answer",
      stateName: "answer",
      stateType: "markdown",
      displayMode: "markdown",
      upstreamNodeIds: ["writer"],
    },
  ];
  let state = createBuddyPublicOutputRuntimeState();
  state = reduceBuddyPublicOutputEvent(state, bindings, "node.started", { node_id: "writer" }, 1000);
  state = reduceBuddyPublicOutputEvent(state, bindings, "state.updated", { node_id: "writer", state_key: "answer", value: "你好" }, 1900);

  assert.deepEqual(state.order, ["output_answer"]);
  assert.equal(state.messagesByOutputNodeId.output_answer.content, "你好");
  assert.equal(state.messagesByOutputNodeId.output_answer.durationMs, 900);
  assert.equal(state.messagesByOutputNodeId.output_answer.status, "completed");
});

test("reduceBuddyPublicOutputEvent ignores states without parent output bindings", () => {
  let state = createBuddyPublicOutputRuntimeState();
  state = reduceBuddyPublicOutputEvent(state, [], "state.updated", { node_id: "writer", state_key: "request_understanding", value: { intent: "debug" } }, 1000);
  assert.deepEqual(state.order, []);
  assert.deepEqual(state.messagesByOutputNodeId, {});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test frontend/src/buddy/buddyPublicOutput.test.ts`

Expected: FAIL because reducer exports are missing.

- [ ] **Step 3: Implement reducer types and helpers**

Add these exports to `buddyPublicOutput.ts`:

```ts
import { routeStreamingJsonStateText } from "../lib/streamingJsonStateRouter.ts";

export type BuddyPublicOutputMessageStatus = "streaming" | "completed" | "failed";

export type BuddyPublicOutputMessage = {
  outputNodeId: string;
  outputNodeName: string;
  stateKey: string;
  stateName: string;
  stateType: string;
  displayMode: string;
  kind: BuddyPublicOutputMessageKind;
  content: unknown;
  startedAtMs: number | null;
  durationMs: number | null;
  status: BuddyPublicOutputMessageStatus;
};

export type BuddyPublicOutputRuntimeState = {
  order: string[];
  messagesByOutputNodeId: Record<string, BuddyPublicOutputMessage>;
  startedAtByOutputNodeId: Record<string, number>;
};

export function createBuddyPublicOutputRuntimeState(): BuddyPublicOutputRuntimeState {
  return {
    order: [],
    messagesByOutputNodeId: {},
    startedAtByOutputNodeId: {},
  };
}

export function reduceBuddyPublicOutputEvent(
  state: BuddyPublicOutputRuntimeState,
  bindings: BuddyPublicOutputBinding[],
  eventType: string,
  payload: Record<string, unknown>,
  nowMs: number,
): BuddyPublicOutputRuntimeState {
  if (eventType === "node.started") {
    return startOutputTimersForNode(state, bindings, String(payload.node_id ?? "").trim(), nowMs);
  }
  if (eventType === "node.output.delta") {
    return applyStreamingDelta(state, bindings, payload, nowMs);
  }
  if (eventType === "state.updated") {
    return completeStateOutput(state, bindings, String(payload.state_key ?? "").trim(), payload.value, nowMs);
  }
  if (eventType === "node.failed") {
    return failOutputsForNode(state, bindings, String(payload.node_id ?? "").trim(), nowMs);
  }
  return state;
}
```

Implement private helpers with immutable updates:

- `startOutputTimersForNode`: records `startedAtByOutputNodeId[outputNodeId] = nowMs` for every binding whose `upstreamNodeIds` contains the node and no completed message exists.
- `applyStreamingDelta`: reads `stream_state_keys` or `output_keys`, routes JSON text with `routeStreamingJsonStateText`, and upserts only matching bindings.
- `completeStateOutput`: upserts the message, sets `status: "completed"`, and computes `durationMs` from `startedAtByOutputNodeId[outputNodeId]` when present.
- `failOutputsForNode`: marks existing streaming messages whose upstream contains the failed node as `failed`.
- `upsertMessage`: appends `outputNodeId` to `order` only the first time a visible message is created.

- [ ] **Step 4: Verify reducer tests pass**

Run: `node --test frontend/src/buddy/buddyPublicOutput.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/buddy/buddyPublicOutput.ts frontend/src/buddy/buddyPublicOutput.test.ts
git commit -m "支持伙伴公开输出事件归约"
git push
```

## Task 4: Integrate Public Outputs Into BuddyWidget

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/buddy/buddyChatGraph.ts`
- Modify: `frontend/src/buddy/buddyChatGraph.test.ts`
- Modify: `frontend/src/i18n/zh-CN.ts`
- Modify: `frontend/src/i18n/en-US.ts`

- [ ] **Step 1: Update Buddy chat tests for the new contract**

In `frontend/src/buddy/buddyChatGraph.test.ts`, replace reply-state expectations with public output expectations:

```ts
test("buddy reply extraction does not treat request_understanding as visible chat text", () => {
  assert.equal(
    resolveBuddyReplyFromRunEvent(
      {
        event: "state.updated",
        state_key: "request_understanding",
        value: { intent: "greeting" },
      },
      createAgenticTemplate() as never,
    ),
    "",
  );
});
```

Keep legacy `final_reply` tests only if the function is explicitly renamed or documented as a fallback for persisted old runs.

- [ ] **Step 2: Run the focused Buddy tests**

Run: `node --test frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/buddyPublicOutput.test.ts`

Expected before implementation: the new request-understanding test fails if current reply extraction still treats internal states as display candidates.

- [ ] **Step 3: Extend `BuddyMessage` for public output cards**

In `BuddyWidget.vue`, extend the local message type:

```ts
type BuddyMessage = BuddyChatMessage & {
  id: string;
  clientOrder?: number | null;
  activityText?: string;
  runId?: string | null;
  publicOutput?: {
    outputNodeId: string;
    stateKey: string;
    stateType: string;
    displayMode: string;
    kind: "text" | "card";
    durationMs: number | null;
    status: "streaming" | "completed" | "failed";
  };
};
```

Remove `runTrace?: BuddyMessageRunTrace` from the visible message contract after all run-trace template usage is removed.

- [ ] **Step 4: Replace single assistant reply streaming with output messages**

In `processQueuedTurn`:

- Keep the hidden assistant placeholder only for pause, error, and empty-output fallback.
- Build bindings once after `buildBuddyChatGraph`.
- Reset a local `BuddyPublicOutputRuntimeState`.
- Pass bindings and reducer state into `startRunEventStream`.

Use deterministic output message IDs:

```ts
function buildPublicOutputMessageId(controllerMessageId: string, outputNodeId: string) {
  return `${controllerMessageId}:output:${outputNodeId}`;
}
```

Add an upsert helper:

```ts
function upsertPublicOutputMessages(
  controllerMessageId: string,
  runId: string,
  outputState: BuddyPublicOutputRuntimeState,
) {
  for (const outputNodeId of outputState.order) {
    const output = outputState.messagesByOutputNodeId[outputNodeId];
    const messageId = buildPublicOutputMessageId(controllerMessageId, outputNodeId);
    const content = renderPublicOutputContentForStorage(output);
    const existing = messages.value.find((message) => message.id === messageId);
    if (existing) {
      existing.content = content;
      existing.publicOutput = toBuddyPublicOutputMetadata(output);
      existing.runId = runId;
      continue;
    }
    messages.value.push({
      ...createMessage("assistant", content, messageId, allocateBuddyMessageClientOrder()),
      includeInContext: output.kind === "text",
      runId,
      publicOutput: toBuddyPublicOutputMetadata(output),
    });
  }
}
```

For `json`, `result_package`, and `file`, `renderPublicOutputContentForStorage` should return a compact markdown label plus fenced JSON or file path. The card renderer can use `message.publicOutput` to choose the visual card style.

- [ ] **Step 5: Remove run trace from the chat message UI**

Delete the `buddy-widget__run-trace` section from the message template. Keep pause cards and error messages.

Change `shouldRenderMessage` to:

```ts
function shouldRenderMessage(message: BuddyMessage) {
  return (
    message.role === "user" ||
    Boolean(message.content.trim()) ||
    Boolean(message.activityText?.trim()) ||
    shouldShowPausedRunCard(message)
  );
}
```

Delete run-trace-only helpers after the compiler confirms they are unused:

- `resetRunTraceForMessage`
- `markRunTraceFinished`
- `appendRunTraceEntry`
- `applyRunTraceTiming`
- `visibleRunTraceEntries`
- `runTraceHeaderText`
- `shouldShowRunTraceForMessage`

- [ ] **Step 6: Reconcile final run detail**

In `finishBuddyVisibleRun`, do not call `resolveBuddyReplyText` for normal completed runs. Instead, build output messages from final `runDetail.output_previews` by matching preview `node_id` to root output bindings.

If the run completed and no public output message exists, update the hidden assistant placeholder with `t("buddy.emptyReply")` and `includeInContext: false`.

- [ ] **Step 7: Verify Buddy tests**

Run: `node --test frontend/src/buddy/buddyPublicOutput.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/buddy/BuddyWidget.vue frontend/src/buddy/buddyChatGraph.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/i18n/zh-CN.ts frontend/src/i18n/en-US.ts
git commit -m "改为按父图输出展示伙伴回复"
git push
```

## Task 5: Add Workspace Node Timing Model

**Files:**
- Create: `frontend/src/editor/workspace/runNodeTimingModel.ts`
- Create: `frontend/src/editor/workspace/runNodeTimingModel.test.ts`

- [ ] **Step 1: Write node timing tests**

Create `runNodeTimingModel.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunNodeTimingByNodeIdFromRun,
  reduceRunNodeTimingEvent,
  type RunNodeTimingByNodeId,
} from "./runNodeTimingModel.ts";

test("reduceRunNodeTimingEvent starts and completes node timing", () => {
  let timings: RunNodeTimingByNodeId = {};
  timings = reduceRunNodeTimingEvent(timings, "node.started", { node_id: "agent" }, 1000);
  assert.deepEqual(timings.agent, { status: "running", startedAtMs: 1000, durationMs: null });

  timings = reduceRunNodeTimingEvent(timings, "node.completed", { node_id: "agent", duration_ms: 875 }, 2000);
  assert.deepEqual(timings.agent, { status: "success", startedAtMs: 1000, durationMs: 875 });
});

test("buildRunNodeTimingByNodeIdFromRun uses node executions", () => {
  const timings = buildRunNodeTimingByNodeIdFromRun({
    node_executions: [
      { node_id: "input", status: "success", duration_ms: 3 },
      { node_id: "agent", status: "failed", duration_ms: 1200 },
    ],
  });
  assert.equal(timings.input.durationMs, 3);
  assert.equal(timings.agent.status, "failed");
  assert.equal(timings.agent.durationMs, 1200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test frontend/src/editor/workspace/runNodeTimingModel.test.ts`

Expected: FAIL because `runNodeTimingModel.ts` does not exist.

- [ ] **Step 3: Implement node timing reducer**

Create `runNodeTimingModel.ts`:

```ts
export type RunNodeTimingStatus = "running" | "success" | "failed" | "paused";

export type RunNodeTiming = {
  status: RunNodeTimingStatus;
  startedAtMs: number | null;
  durationMs: number | null;
};

export type RunNodeTimingByNodeId = Record<string, RunNodeTiming>;

export function reduceRunNodeTimingEvent(
  current: RunNodeTimingByNodeId,
  eventType: string,
  payload: Record<string, unknown>,
  nowMs: number,
): RunNodeTimingByNodeId {
  const nodeId = normalizeNodeId(payload.node_id);
  if (!nodeId) {
    return current;
  }
  if (eventType === "node.started") {
    return { ...current, [nodeId]: { status: "running", startedAtMs: nowMs, durationMs: null } };
  }
  if (eventType === "node.completed") {
    return completeNodeTiming(current, nodeId, "success", payload.duration_ms, nowMs);
  }
  if (eventType === "node.failed") {
    return completeNodeTiming(current, nodeId, "failed", payload.duration_ms, nowMs);
  }
  return current;
}

export function buildRunNodeTimingByNodeIdFromRun(run: { node_executions?: Array<{ node_id?: string; status?: string; duration_ms?: number | null }> }): RunNodeTimingByNodeId {
  const result: RunNodeTimingByNodeId = {};
  for (const execution of run.node_executions ?? []) {
    const nodeId = normalizeNodeId(execution.node_id);
    if (!nodeId) {
      continue;
    }
    result[nodeId] = {
      status: normalizeExecutionStatus(execution.status),
      startedAtMs: null,
      durationMs: typeof execution.duration_ms === "number" ? Math.max(0, Math.round(execution.duration_ms)) : null,
    };
  }
  return result;
}
```

Add private helpers `normalizeNodeId`, `normalizeExecutionStatus`, and `completeNodeTiming`.

- [ ] **Step 4: Verify node timing tests pass**

Run: `node --test frontend/src/editor/workspace/runNodeTimingModel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/editor/workspace/runNodeTimingModel.ts frontend/src/editor/workspace/runNodeTimingModel.test.ts
git commit -m "增加节点运行时长模型"
git push
```

## Task 6: Wire Node Timing Through Workspace and Canvas

**Files:**
- Modify: `frontend/src/editor/workspace/EditorWorkspaceShell.vue`
- Modify: `frontend/src/editor/workspace/useWorkspaceRunVisualState.ts`
- Modify: `frontend/src/editor/workspace/useWorkspaceRunLifecycleController.ts`
- Modify: `frontend/src/editor/workspace/useWorkspaceRunController.ts`
- Modify: `frontend/src/editor/workspace/useWorkspaceTabLifecycleController.ts`
- Modify: related workspace tests
- Modify: `frontend/src/editor/canvas/EditorCanvas.vue`
- Modify: `frontend/src/editor/canvas/canvasRunPresentationModel.ts`
- Modify: `frontend/src/editor/canvas/canvasRunPresentationModel.test.ts`

- [ ] **Step 1: Add workspace state tests**

Update `frontend/src/editor/workspace/useWorkspaceRunVisualState.test.ts` to assert:

```ts
harness.controller.applyRunEventVisualStateToTab("tab_a", "node.started", { node_id: "agent" });
assert.equal(harness.runNodeTimingByTabId.value.tab_a.agent.status, "running");

harness.controller.applyRunEventVisualStateToTab("tab_a", "node.completed", { node_id: "agent", duration_ms: 42 });
assert.equal(harness.runNodeTimingByTabId.value.tab_a.agent.durationMs, 42);
```

Update `useWorkspaceRunController.test.ts` so `clearQueuedRunVisualState` clears `runNodeTimingByTabId`.

- [ ] **Step 2: Run focused workspace tests**

Run: `node --test frontend/src/editor/workspace/useWorkspaceRunVisualState.test.ts frontend/src/editor/workspace/useWorkspaceRunController.test.ts frontend/src/editor/workspace/useWorkspaceTabLifecycleController.test.ts`

Expected before implementation: FAIL because timing state is not wired.

- [ ] **Step 3: Thread `runNodeTimingByTabId` through workspace controllers**

In `EditorWorkspaceShell.vue`, add:

```ts
const runNodeTimingByTabId = ref<Record<string, RunNodeTimingByNodeId>>({});
```

Pass it into:

- `useWorkspaceRunVisualState`
- `useWorkspaceRunController`
- `useWorkspaceTabLifecycleController`
- `EditorCanvas`

In `useWorkspaceRunVisualState.ts`:

- Add `runNodeTimingByTabId` to `WorkspaceRunVisualStateInput`.
- In `applyRunVisualStateToTab`, set it from `buildRunNodeTimingByNodeIdFromRun(visualRun)`.
- In `applyRunEventVisualStateToTab`, update it with `reduceRunNodeTimingEvent`.

In `useWorkspaceRunController.ts`, clear timing alongside node status:

```ts
input.runNodeTimingByTabId.value = setTabScopedRecordEntry(input.runNodeTimingByTabId.value, tabId, {});
```

In `useWorkspaceTabLifecycleController.ts`, clear timing on tab removal and document unload.

- [ ] **Step 4: Pass timing to canvas nodes**

In `EditorCanvas.vue`, add prop:

```ts
runNodeTimingByNodeId?: Record<string, RunNodeTiming>;
```

When rendering `NodeCard`, pass:

```vue
:run-timing="props.runNodeTimingByNodeId?.[nodeId] ?? null"
```

- [ ] **Step 5: Add timing presentation helper**

In `canvasRunPresentationModel.ts`, export:

```ts
export function shouldShowRunNodeTiming(input: { timing?: { status?: string; durationMs?: number | null; startedAtMs?: number | null } | null }) {
  return Boolean(input.timing && ["running", "success", "failed", "paused"].includes(String(input.timing.status ?? "")));
}
```

Add tests for visible and hidden states.

- [ ] **Step 6: Verify workspace and canvas tests**

Run: `node --test frontend/src/editor/workspace/useWorkspaceRunVisualState.test.ts frontend/src/editor/workspace/useWorkspaceRunController.test.ts frontend/src/editor/workspace/useWorkspaceTabLifecycleController.test.ts frontend/src/editor/canvas/canvasRunPresentationModel.test.ts frontend/src/editor/canvas/EditorCanvas.structure.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/editor/workspace frontend/src/editor/canvas
git commit -m "接入画布节点运行时长状态"
git push
```

## Task 7: Render Node Timing Capsules

**Files:**
- Modify: `frontend/src/editor/nodes/NodeCard.vue`
- Modify: `frontend/src/editor/nodes/NodeCard.structure.test.ts`
- Modify: `frontend/src/i18n/zh-CN.ts`
- Modify: `frontend/src/i18n/en-US.ts`

- [ ] **Step 1: Add structure tests**

Update `NodeCard.structure.test.ts` to assert:

```ts
assert.match(componentSource, /node-card__run-timing-capsule/);
assert.match(componentSource, /Clock/);
assert.match(componentSource, /formatNodeRunTimingDuration/);
```

Add CSS assertions:

```ts
assert.match(componentSource, /\.node-card__run-timing-capsule \{[\s\S]*position:\s*absolute;/);
assert.match(componentSource, /\.node-card__run-timing-capsule \{[\s\S]*top:/);
assert.match(componentSource, /\.node-card__run-timing-capsule \{[\s\S]*left:/);
```

- [ ] **Step 2: Run structure test to verify it fails**

Run: `node --test frontend/src/editor/nodes/NodeCard.structure.test.ts`

Expected: FAIL because the capsule does not exist.

- [ ] **Step 3: Render the timing capsule**

In `NodeCard.vue`, import the clock icon from the existing Element Plus icon set:

```ts
import { Clock } from "@element-plus/icons-vue";
```

Add prop:

```ts
runTiming?: RunNodeTiming | null;
```

Add the capsule near the top of the root node card template:

```vue
<div
  v-if="shouldShowNodeRunTiming"
  class="node-card__run-timing-capsule"
  :class="`node-card__run-timing-capsule--${runTiming?.status ?? 'running'}`"
  :title="t('nodeCard.runTiming')"
>
  <ElIcon aria-hidden="true"><Clock /></ElIcon>
  <span>{{ formattedNodeRunTimingDuration }}</span>
</div>
```

Use existing `formatRunDuration` for final durations. For running nodes, compute the live elapsed duration with a small interval owned by `NodeCard`, only active while `runTiming.status === "running"` and `runTiming.startedAtMs !== null`.

- [ ] **Step 4: Add stable CSS**

Add CSS:

```css
.node-card__run-timing-capsule {
  position: absolute;
  top: -12px;
  left: 16px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(var(--node-card-kind-rgb), 0.18);
  border-radius: 999px;
  background: rgba(255, 251, 247, 0.96);
  color: rgba(71, 47, 29, 0.84);
  box-shadow: 0 8px 18px rgba(60, 41, 20, 0.11);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
}
```

Add success, failed, paused modifiers with subtle border and text color changes, using the project’s existing run-state colors.

- [ ] **Step 5: Verify NodeCard tests pass**

Run: `node --test frontend/src/editor/nodes/NodeCard.structure.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/editor/nodes/NodeCard.vue frontend/src/editor/nodes/NodeCard.structure.test.ts frontend/src/i18n/zh-CN.ts frontend/src/i18n/en-US.ts
git commit -m "显示节点运行时长胶囊"
git push
```

## Task 8: End-to-End Verification and Startup

**Files:**
- Inspect: `docs/current_project_status.md`

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
node --test frontend/src/buddy/buddyPublicOutput.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/editor/workspace/runNodeTimingModel.test.ts frontend/src/editor/workspace/useWorkspaceRunVisualState.test.ts frontend/src/editor/workspace/useWorkspaceRunController.test.ts frontend/src/editor/workspace/useWorkspaceTabLifecycleController.test.ts frontend/src/editor/canvas/canvasRunPresentationModel.test.ts frontend/src/editor/canvas/EditorCanvas.structure.test.ts frontend/src/editor/nodes/NodeCard.structure.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend template test**

Run:

```bash
pytest backend/tests/test_template_layouts.py -q
```

Expected: PASS.

- [ ] **Step 3: Run broader frontend verification**

Run:

```bash
node --test $(find frontend/src -name '*.test.ts' -print)
```

Expected: PASS.

- [ ] **Step 4: Restart TooGraph**

Run:

```bash
npm start
```

Expected: TooGraph starts at `http://127.0.0.1:3477` and reuses `frontend/dist` when the manifest is current.

- [ ] **Step 5: Visual check**

Open `http://127.0.0.1:3477` and verify:

- Buddy simple greeting produces only parent output messages.
- Expanding or sending messages does not show run trace capsules in Buddy chat.
- A graph run displays node timing capsules on running and completed nodes.
- The timing capsule does not cover ports, title editing, description editing, or top actions.
- Structured output appears as a card instead of raw chat text.

- [ ] **Step 6: Commit final status if docs changed**

If `docs/current_project_status.md` is updated:

```bash
git add docs/current_project_status.md
git commit -m "更新伙伴输出协议开发状态"
git push
```

If no docs changed, run:

```bash
git status --short
```

Expected: clean working tree.
