import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalGraphPayload } from "./node-system-canonical.ts";
import { collectCycleBackEdgeIds } from "./node-system-cycle-edges.ts";
import {
  buildCanonicalOrdinaryEdgeId,
  resolveCanonicalOrdinaryEdgePresentation,
} from "./node-system-ordinary-edge.ts";

function createGraph(overrides: Partial<CanonicalGraphPayload> = {}): CanonicalGraphPayload {
  return {
    name: "Graph",
    state_schema: {
      question: { name: "Question", description: "", type: "text", value: "", color: "" },
      answer: { name: "Answer", description: "", type: "text", value: "", color: "" },
      result: { name: "Result", description: "", type: "text", value: "", color: "" },
    },
    nodes: {
      a: {
        kind: "agent",
        name: "A",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "result", required: true }],
        writes: [{ state: "question", mode: "replace" }],
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
      b: {
        kind: "agent",
        name: "B",
        description: "",
        ui: { position: { x: 200, y: 0 } },
        reads: [{ state: "question", required: true }],
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
      c: {
        kind: "agent",
        name: "C",
        description: "",
        ui: { position: { x: 400, y: 0 } },
        reads: [{ state: "answer", required: true }],
        writes: [{ state: "result", mode: "replace" }],
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
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ],
  });

  assert.deepEqual([...collectCycleBackEdgeIds(graph)], []);
});

test("collectCycleBackEdgeIds marks plain edges that close a cycle", () => {
  const graph = createGraph({
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
    ],
  });

  assert.deepEqual([...collectCycleBackEdgeIds(graph)], ["edge:c:a"]);
});

test("collectCycleBackEdgeIds also marks conditional branches that loop back", () => {
  const graph = createGraph({
    edges: [{ source: "a", target: "b" }],
    conditional_edges: [{ source: "b", branches: { retry: "a", done: "c" } }],
  });

  assert.deepEqual([...collectCycleBackEdgeIds(graph)], ["conditional:b:retry:a"]);
});

test("buildCanonicalOrdinaryEdgeId matches the hydrated ordinary-edge presentation id", () => {
  const graph = createGraph({
    edges: [{ source: "c", target: "a" }],
  });

  const edge = { source: "c", target: "a" };
  assert.equal(buildCanonicalOrdinaryEdgeId(graph, edge), resolveCanonicalOrdinaryEdgePresentation(graph, edge).id);
  assert.equal(buildCanonicalOrdinaryEdgeId(graph, edge), "edge:c:a");
});

test("resolveCanonicalOrdinaryEdgePresentation leaves ambiguous ordinary edges generic", () => {
  const graph = createGraph({
    state_schema: {
      alpha: { name: "Alpha", description: "", type: "text", value: "", color: "" },
      beta: { name: "Beta", description: "", type: "text", value: "", color: "" },
    },
    nodes: {
      source: {
        kind: "agent",
        name: "Source",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [
          { state: "alpha", mode: "replace" },
          { state: "beta", mode: "replace" },
        ],
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
      target: {
        kind: "agent",
        name: "Target",
        description: "",
        ui: { position: { x: 200, y: 0 } },
        reads: [
          { state: "alpha", required: true },
          { state: "beta", required: true },
        ],
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
    },
    edges: [{ source: "source", target: "target" }],
  });

  assert.deepEqual(resolveCanonicalOrdinaryEdgePresentation(graph, { source: "source", target: "target" }), {
    id: "edge:source:target",
    sourceHandle: "flow:out",
    targetHandle: "flow:in",
    projectedState: null,
  });
});

test("resolveCanonicalOrdinaryEdgePresentation leaves zero-shared ordinary edges generic", () => {
  const graph = createGraph({
    state_schema: {
      alpha: { name: "Alpha", description: "", type: "text", value: "", color: "" },
      beta: { name: "Beta", description: "", type: "text", value: "", color: "" },
    },
    nodes: {
      source: {
        kind: "agent",
        name: "Source",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "alpha", mode: "replace" }],
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
      target: {
        kind: "agent",
        name: "Target",
        description: "",
        ui: { position: { x: 200, y: 0 } },
        reads: [{ state: "beta", required: true }],
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
    },
    edges: [{ source: "source", target: "target" }],
  });

  assert.deepEqual(resolveCanonicalOrdinaryEdgePresentation(graph, { source: "source", target: "target" }), {
    id: "edge:source:target",
    sourceHandle: "flow:out",
    targetHandle: "flow:in",
    projectedState: null,
  });
});

test("resolveCanonicalOrdinaryEdgePresentation keeps resolved ordinary edges on shared flow handles", () => {
  const graph = createGraph({
    edges: [{ source: "c", target: "a" }],
  });

  assert.deepEqual(resolveCanonicalOrdinaryEdgePresentation(graph, { source: "c", target: "a" }), {
    id: "edge:c:a",
    sourceHandle: "flow:out",
    targetHandle: "flow:in",
    projectedState: "result",
  });
});
