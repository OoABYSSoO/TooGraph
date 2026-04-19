import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuddyPublicOutputBindings,
  createBuddyPublicOutputRuntimeState,
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
          skillKey: "",
          skillBindings: [],
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
