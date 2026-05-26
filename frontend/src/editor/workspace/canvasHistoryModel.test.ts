import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPayload } from "@/types/node-system";

import {
  createCanvasDocumentHistory,
  recordCanvasDocumentHistory,
  redoCanvasDocumentHistory,
  undoCanvasDocumentHistory,
} from "./canvasHistoryModel.ts";

function createDocument(name: string): GraphPayload {
  return {
    graph_id: null,
    name,
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("canvas history restores full document snapshots for undo and redo", () => {
  const original = createDocument("Original");
  const renamed = createDocument("Renamed");
  const history = recordCanvasDocumentHistory(createCanvasDocumentHistory(), original);

  const undo = undoCanvasDocumentHistory(history, renamed);

  assert.equal(undo.document?.name, "Original");
  assert.equal(undo.document === original, false);
  assert.deepEqual(undo.history.past, []);
  assert.equal(undo.history.future.length, 1);
  assert.equal(undo.history.future[0]?.name, "Renamed");

  const redo = redoCanvasDocumentHistory(undo.history, undo.document!);

  assert.equal(redo.document?.name, "Renamed");
  assert.equal(redo.history.past.length, 1);
  assert.deepEqual(redo.history.future, []);
});

test("canvas history keeps the newest bounded number of snapshots", () => {
  let history = createCanvasDocumentHistory({ limit: 2 });

  history = recordCanvasDocumentHistory(history, createDocument("Step 1"));
  history = recordCanvasDocumentHistory(history, createDocument("Step 2"));
  history = recordCanvasDocumentHistory(history, createDocument("Step 3"));

  assert.deepEqual(history.past.map((document) => document.name), ["Step 2", "Step 3"]);
});

test("canvas history merges rapid updates with the same merge key", () => {
  let history = createCanvasDocumentHistory({ limit: 50 });

  history = recordCanvasDocumentHistory(history, createDocument("Before drag"), {
    mergeKey: "node-position:agent_a",
    nowMs: 100,
  });
  history = recordCanvasDocumentHistory(history, createDocument("During drag"), {
    mergeKey: "node-position:agent_a",
    nowMs: 200,
  });

  assert.deepEqual(history.past.map((document) => document.name), ["Before drag"]);

  history = recordCanvasDocumentHistory(history, createDocument("Second drag"), {
    mergeKey: "node-position:agent_a",
    nowMs: 1200,
  });

  assert.deepEqual(history.past.map((document) => document.name), ["Before drag", "Second drag"]);
});
