import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalGraphPayload } from "./node-system-canonical.ts";
import { collectProjectedDataRelations } from "./node-system-data-flow-projection.ts";

function createGraph(overrides: Partial<CanonicalGraphPayload> = {}): CanonicalGraphPayload {
  return {
    name: "Graph",
    state_schema: {
      answer: { name: "Answer", description: "", type: "text", value: "", color: "" },
    },
    nodes: {
      writer_a: {
        kind: "agent",
        name: "Writer A",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
      writer_b: {
        kind: "agent",
        name: "Writer B",
        description: "",
        ui: { position: { x: 160, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          skills: [],
          systemInstruction: "",
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0,
        },
      },
      reader: {
        kind: "output",
        name: "Reader",
        description: "",
        ui: { position: { x: 320, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "writer_a", target: "writer_b" },
      { source: "writer_b", target: "reader" },
    ],
    conditional_edges: [],
    metadata: {},
    ...overrides,
  };
}

test("collectProjectedDataRelations uses the nearest upstream writer on a sequential path", () => {
  const graph = createGraph();
  assert.deepEqual(collectProjectedDataRelations(graph), [
    { source: "writer_a", target: "writer_b", state: "answer" },
    { source: "writer_b", target: "reader", state: "answer" },
  ]);
});

test("collectProjectedDataRelations skips ambiguous reads fed by unordered writers", () => {
  const graph = createGraph({
    nodes: {
      writer_a: createGraph().nodes.writer_a,
      writer_b: {
        ...createGraph().nodes.writer_b,
        reads: [],
      },
      reader: createGraph().nodes.reader,
    },
    edges: [
      { source: "writer_a", target: "reader" },
      { source: "writer_b", target: "reader" },
    ],
  });
  assert.deepEqual(collectProjectedDataRelations(graph), []);
});
