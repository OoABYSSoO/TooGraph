import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuddyPublicOutputBindings,
  createBuddyPublicOutputRuntimeState,
  listBuddyPublicOutputMessageIdsForOutputNode,
  listVisibleBuddyPublicOutputNodeIds,
  reduceBuddyPublicOutputEvent,
  resolveBuddyPublicOutputMessageKind,
} from "./buddyPublicOutput.ts";

test("buildBuddyPublicOutputBindings scans only root output nodes", () => {
  const graph = {
    state_schema: {
      answer: { name: "answer", description: "", type: "markdown", value: "", color: "#000" },
      internal: { name: "internal", description: "", type: "json", value: {}, color: "#000" },
    },
    nodes: {
      writer: {
        kind: "agent",
        name: "Writer",
        description: "",
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          actionKey: "",
          actionBindings: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "medium",
          temperature: 0.4,
        },
        ui: { position: { x: 0, y: 0 } },
      },
      output_answer: {
        kind: "output",
        name: "Answer",
        description: "",
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
        ui: { position: { x: 0, y: 0 } },
      },
      nested: {
        kind: "subgraph",
        name: "Nested",
        description: "",
        reads: [],
        writes: [],
        config: {
          graph: {
            state_schema: {
              internal: { name: "internal", description: "", type: "json", value: {}, color: "#000" },
            },
            nodes: {
              output_internal: {
                kind: "output",
                name: "Internal",
                description: "",
                reads: [{ state: "internal", required: true }],
                writes: [],
                config: {
                  displayMode: "json",
                  persistEnabled: false,
                  persistFormat: "auto",
                  fileNameTemplate: "",
                },
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
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "html", displayMode: "html" }), "text");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "json", displayMode: "json" }), "card");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "result_package", displayMode: "auto" }), "card");
  assert.equal(resolveBuddyPublicOutputMessageKind({ stateType: "file", displayMode: "documents" }), "card");
});

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

test("reduceBuddyPublicOutputEvent appends repeated completed output states as timeline messages", () => {
  const bindings = [
    {
      outputNodeId: "output_answer",
      outputNodeName: "Answer",
      stateKey: "answer",
      stateName: "answer",
      stateType: "markdown",
      displayMode: "markdown",
      upstreamNodeIds: ["gate"],
    },
  ];
  let state = createBuddyPublicOutputRuntimeState();

  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "state.updated",
    { node_id: "writer", state_key: "answer", value: "progress" },
    1000,
  );
  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "state.updated",
    { node_id: "writer", state_key: "answer", value: "final" },
    3000,
  );

  assert.deepEqual(state.order, ["output_answer", "output_answer:2"]);
  assert.equal(state.messagesByOutputNodeId.output_answer.content, "progress");
  assert.equal(state.messagesByOutputNodeId["output_answer:2"].content, "final");
  assert.equal(state.messagesByOutputNodeId["output_answer:2"].sourceOutputNodeId, "output_answer");
});

test("reduceBuddyPublicOutputEvent splits completed result packages into independent output messages", () => {
  const bindings = [
    {
      outputNodeId: "output_capability",
      outputNodeName: "Capability Result",
      stateKey: "capability_result",
      stateName: "Capability Result",
      stateType: "result_package",
      displayMode: "auto",
      upstreamNodeIds: ["dynamic_capability"],
    },
  ];
  const packageValue = {
    kind: "result_package",
    sourceType: "subgraph",
    sourceKey: "advanced_web_research_loop",
    outputs: {
      summary: {
        name: "整理结果",
        description: "面向用户展示的整理结果。",
        type: "markdown",
        value: "# Done",
      },
      source_documents: {
        name: "来源文档",
        description: "联网搜索下载到本地的原文。",
        type: "file",
        value: [{ title: "Article One", local_path: "runs/run_1/doc.md" }],
      },
    },
  };
  let state = createBuddyPublicOutputRuntimeState();

  state = reduceBuddyPublicOutputEvent(state, bindings, "node.started", { node_id: "dynamic_capability" }, 1000);
  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "state.updated",
    { node_id: "dynamic_capability", state_key: "capability_result", value: packageValue },
    2500,
  );

  assert.deepEqual(state.order, ["output_capability:summary", "output_capability:source_documents"]);
  assert.deepEqual(listBuddyPublicOutputMessageIdsForOutputNode(state, "output_capability"), state.order);
  assert.deepEqual(listVisibleBuddyPublicOutputNodeIds(state), ["output_capability"]);

  const summary = state.messagesByOutputNodeId["output_capability:summary"];
  assert.equal(summary.sourceOutputNodeId, "output_capability");
  assert.equal(summary.outputNodeName, "Capability Result");
  assert.equal(summary.stateKey, "capability_result.summary");
  assert.equal(summary.stateName, "整理结果");
  assert.equal(summary.stateType, "markdown");
  assert.equal(summary.displayMode, "markdown");
  assert.equal(summary.kind, "text");
  assert.equal(summary.content, "# Done");
  assert.equal(summary.durationMs, 1500);
  assert.equal(summary.status, "completed");

  const sources = state.messagesByOutputNodeId["output_capability:source_documents"];
  assert.equal(sources.sourceOutputNodeId, "output_capability");
  assert.equal(sources.stateKey, "capability_result.source_documents");
  assert.equal(sources.stateName, "来源文档");
  assert.equal(sources.stateType, "file");
  assert.equal(sources.displayMode, "documents");
  assert.equal(sources.kind, "card");
  assert.deepEqual(sources.content, [{ title: "Article One", local_path: "runs/run_1/doc.md" }]);
});

test("reduceBuddyPublicOutputEvent uses run event timestamps instead of local receive time", () => {
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

  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "node.started",
    { node_id: "writer", started_at: "2026-05-13T10:00:00.000Z" },
    Date.parse("2026-05-13T10:00:05.000Z"),
  );
  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "state.updated",
    { node_id: "writer", state_key: "answer", value: "你好", created_at: "2026-05-13T10:00:01.500Z" },
    Date.parse("2026-05-13T10:00:08.000Z"),
  );

  assert.equal(state.messagesByOutputNodeId.output_answer.startedAtMs, Date.parse("2026-05-13T10:00:00.000Z"));
  assert.equal(state.messagesByOutputNodeId.output_answer.durationMs, 1500);
});

test("reduceBuddyPublicOutputEvent ignores states without parent output bindings", () => {
  let state = createBuddyPublicOutputRuntimeState();

  state = reduceBuddyPublicOutputEvent(
    state,
    [],
    "state.updated",
    { node_id: "writer", state_key: "request_understanding", value: { intent: "debug" } },
    1000,
  );

  assert.deepEqual(state.order, []);
  assert.deepEqual(state.messagesByOutputNodeId, {});
});

test("reduceBuddyPublicOutputEvent strips a single output JSON envelope by state key", () => {
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

  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "node.output.delta",
    {
      node_id: "writer",
      text: '{"answer":"你好，TooGraph',
      output_keys: ["answer"],
      stream_state_keys: ["answer"],
    },
    1000,
  );

  assert.deepEqual(state.order, ["output_answer"]);
  assert.equal(state.messagesByOutputNodeId.output_answer.content, "你好，TooGraph");
  assert.equal(state.messagesByOutputNodeId.output_answer.status, "streaming");
});

test("reduceBuddyPublicOutputEvent preserves JSON text inside a stripped single output envelope", () => {
  const bindings = [
    {
      outputNodeId: "output_payload",
      outputNodeName: "Payload",
      stateKey: "payload",
      stateName: "payload",
      stateType: "json",
      displayMode: "json",
      upstreamNodeIds: ["writer"],
    },
  ];
  let state = createBuddyPublicOutputRuntimeState();

  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "node.output.delta",
    {
      node_id: "writer",
      text: '{"payload":"{\\\"ok\\\":true}"}',
      output_keys: ["payload"],
      stream_state_keys: ["payload"],
    },
    1000,
  );

  assert.deepEqual(state.order, ["output_payload"]);
  assert.equal(state.messagesByOutputNodeId.output_payload.content, '{"ok":true}');
  assert.equal(state.messagesByOutputNodeId.output_payload.kind, "card");
});

test("reduceBuddyPublicOutputEvent preserves JSON object bodies inside a stripped single output envelope", () => {
  const bindings = [
    {
      outputNodeId: "output_payload",
      outputNodeName: "Payload",
      stateKey: "payload",
      stateName: "payload",
      stateType: "json",
      displayMode: "json",
      upstreamNodeIds: ["writer"],
    },
  ];
  let state = createBuddyPublicOutputRuntimeState();

  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "node.output.delta",
    {
      node_id: "writer",
      text: '{"payload":{"ok":true',
      output_keys: ["payload"],
      stream_state_keys: ["payload"],
    },
    1000,
  );

  assert.deepEqual(state.order, ["output_payload"]);
  assert.equal(state.messagesByOutputNodeId.output_payload.content, '{"ok":true');
  assert.equal(state.messagesByOutputNodeId.output_payload.kind, "card");
});

test("reduceBuddyPublicOutputEvent hides a single output JSON envelope before the body starts", () => {
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

  state = reduceBuddyPublicOutputEvent(
    state,
    bindings,
    "node.output.delta",
    {
      node_id: "writer",
      text: '{"answer"',
      output_keys: ["answer"],
      stream_state_keys: ["answer"],
    },
    1000,
  );

  assert.deepEqual(state.order, []);
  assert.deepEqual(state.messagesByOutputNodeId, {});
});
