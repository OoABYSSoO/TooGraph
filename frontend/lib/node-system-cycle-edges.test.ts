import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalGraphPayload } from "./node-system-canonical.ts";
import { collectCycleBackEdgeIds } from "./node-system-cycle-edges.ts";

function createGraph(overrides: Partial<CanonicalGraphPayload> = {}): CanonicalGraphPayload {
  return {
    name: "Graph",
    state_schema: {},
    nodes: {
      a: {
        kind: "input",
        name: "A",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: { value: "" },
      },
      b: {
        kind: "agent",
        name: "B",
        description: "",
        ui: { position: { x: 200, y: 0 } },
        reads: [],
        writes: [],
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
      c: {
        kind: "output",
        name: "C",
        description: "",
        ui: { position: { x: 400, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "auto",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
    ...overrides,
  };
}

test("collectCycleBackEdgeIds returns an empty set for acyclic graphs", () => {
  const graph = createGraph({
    edges: [
      { source: "a", sourceHandle: "output:question", target: "b", targetHandle: "input:question" },
      { source: "b", sourceHandle: "output:answer", target: "c", targetHandle: "input:answer" },
    ],
  });

  assert.deepEqual([...collectCycleBackEdgeIds(graph)], []);
});

test("collectCycleBackEdgeIds marks standard edges that close a cycle", () => {
  const graph = createGraph({
    edges: [
      { source: "a", sourceHandle: "output:question", target: "b", targetHandle: "input:question" },
      { source: "b", sourceHandle: "output:answer", target: "c", targetHandle: "input:answer" },
      { source: "c", sourceHandle: "output:result", target: "a", targetHandle: "input:question" },
    ],
  });

  assert.deepEqual([...collectCycleBackEdgeIds(graph)], ["edge:c:output:result:a:input:question"]);
});

test("collectCycleBackEdgeIds also marks conditional branches that loop back", () => {
  const graph = createGraph({
    edges: [{ source: "a", sourceHandle: "output:question", target: "b", targetHandle: "input:question" }],
    conditional_edges: [{ source: "b", branches: { retry: "a", done: "c" } }],
  });

  assert.deepEqual([...collectCycleBackEdgeIds(graph)], ["conditional:b:retry:a"]);
});
