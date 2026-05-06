import test from "node:test";
import assert from "node:assert/strict";

import { buildGraphEditPlaybackDocumentDiff } from "./graphEditPlaybackDiffModel.ts";
import type { GraphPayload } from "@/types/node-system";

function baseGraph(): GraphPayload {
  return {
    graph_id: null,
    name: "Draft Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("buildGraphEditPlaybackDocumentDiff records compact graph JSON pointer changes", () => {
  const previous = baseGraph();
  const next: GraphPayload = {
    ...baseGraph(),
    name: "Final Graph",
    metadata: { description: "Updated." },
    nodes: {
      answer: {
        kind: "output",
        name: "Answer",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: true,
          persistFormat: "md",
          fileNameTemplate: "answer.md",
        },
      },
    },
  };

  assert.deepEqual(buildGraphEditPlaybackDocumentDiff(previous, next), [
    { op: "add", path: "/metadata/description", next: "Updated." },
    { op: "replace", path: "/name", previous: "Draft Graph", next: "Final Graph" },
    { op: "add", path: "/nodes/answer", next: next.nodes.answer },
  ]);
});
