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
