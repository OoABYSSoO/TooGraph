import assert from "node:assert/strict";
import test from "node:test";

import type { GraphPayload } from "@/types/node-system";

import {
  createCanvasClipboardPayload,
  pasteCanvasClipboardPayload,
} from "./canvasClipboardModel.ts";

function createDocument(): GraphPayload {
  return {
    graph_id: null,
    name: "Clipboard Graph",
    state_schema: {
      question: {
        name: "Question",
        description: "",
        type: "text",
        color: "#2563eb",
      },
      answer: {
        name: "Answer",
        description: "",
        type: "text",
        color: "#16a34a",
        binding: {
          kind: "action_output",
          actionKey: "summarize",
          nodeId: "agent_a",
          fieldKey: "answer",
        },
      },
    },
    nodes: {
      input_a: {
        kind: "input",
        name: "Input",
        description: "",
        ui: { position: { x: 20, y: 30 } },
        reads: [],
        writes: [{ state: "question" }],
        config: { value: "Hello" },
      },
      agent_a: {
        kind: "agent",
        name: "Agent",
        description: "",
        ui: { position: { x: 320, y: 30 } },
        reads: [{ state: "question" }],
        writes: [{ state: "answer", mode: "replace" }],
        config: {
          actionKey: "summarize",
          actionBindings: [{ actionKey: "summarize", outputMapping: { answer: "answer" } }],
          taskInstruction: "Summarize",
          modelSource: "global",
          model: "",
          thinkingMode: "off",
          temperature: 0.7,
        },
      },
      output_a: {
        kind: "output",
        name: "Output",
        description: "",
        ui: { position: { x: 620, y: 30 } },
        reads: [{ state: "answer" }],
        writes: [],
        config: {
          displayMode: "markdown",
          persistEnabled: false,
          persistFormat: "auto",
          fileNameTemplate: "",
        },
      },
    },
    edges: [
      { source: "input_a", target: "agent_a" },
      { source: "agent_a", target: "output_a" },
    ],
    conditional_edges: [],
    metadata: {},
  };
}

test("createCanvasClipboardPayload copies selected nodes with only internal edges and referenced state", () => {
  const document = createDocument();
  const payload = createCanvasClipboardPayload(document, ["input_a", "agent_a"]);

  assert.equal(Object.keys(payload?.nodes ?? {}).length, 2);
  assert.deepEqual(payload?.edges, [{ source: "input_a", target: "agent_a" }]);
  assert.deepEqual(payload?.conditional_edges, []);
  assert.deepEqual(Object.keys(payload?.state_schema ?? {}).sort(), ["answer", "question"]);
});

test("pasteCanvasClipboardPayload creates remapped nodes, edges, state definitions, and positions", () => {
  const document = createDocument();
  const payload = createCanvasClipboardPayload(document, ["input_a", "agent_a"]);
  assert.ok(payload);

  const result = pasteCanvasClipboardPayload(document, payload, { offset: { x: 40, y: 50 } });

  assert.equal(result.pastedNodeIds.length, 2);
  const [pastedInputId, pastedAgentId] = result.pastedNodeIds;
  assert.notEqual(pastedInputId, "input_a");
  assert.notEqual(pastedAgentId, "agent_a");
  assert.deepEqual(result.document.nodes[pastedInputId]?.ui.position, { x: 60, y: 80 });
  assert.deepEqual(result.document.nodes[pastedAgentId]?.ui.position, { x: 360, y: 80 });
  assert.ok(result.document.edges.some((edge) => edge.source === pastedInputId && edge.target === pastedAgentId));
  assert.equal(result.document.edges.some((edge) => edge.source === pastedAgentId && edge.target === "output_a"), false);

  const pastedQuestionKey = result.document.nodes[pastedInputId]?.writes[0]?.state;
  const pastedAnswerKey = result.document.nodes[pastedAgentId]?.writes[0]?.state;
  assert.ok(pastedQuestionKey);
  assert.ok(pastedAnswerKey);
  assert.notEqual(pastedQuestionKey, "question");
  assert.notEqual(pastedAnswerKey, "answer");
  assert.equal(result.document.nodes[pastedAgentId]?.reads[0]?.state, pastedQuestionKey);
  assert.equal(result.document.state_schema[pastedAnswerKey]?.binding?.nodeId, pastedAgentId);
  const pastedAgent = result.document.nodes[pastedAgentId];
  assert.equal(pastedAgent?.kind, "agent");
  if (pastedAgent?.kind === "agent") {
    assert.equal(pastedAgent.config.actionBindings?.[0]?.outputMapping?.answer, pastedAnswerKey);
  }
});

test("pasteCanvasClipboardPayload keeps external read-only state references shared", () => {
  const document = createDocument();
  const payload = createCanvasClipboardPayload(document, ["output_a"]);
  assert.ok(payload);

  const result = pasteCanvasClipboardPayload(document, payload);
  const pastedOutputId = result.pastedNodeIds[0] ?? "";

  assert.notEqual(pastedOutputId, "output_a");
  assert.equal(result.document.nodes[pastedOutputId]?.reads[0]?.state, "answer");
  assert.equal(result.document.state_schema.answer_copy, undefined);
});
