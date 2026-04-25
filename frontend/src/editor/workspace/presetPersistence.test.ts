import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "@/types/node-system";

import { buildPresetPayloadForNode, slugifyPresetBase } from "./presetPersistence.ts";

const document: GraphPayload = {
  name: "Preset Save Test",
  state_schema: {
    question: { name: "Question", description: "", type: "text", value: "", color: "#d8a650" },
    answer: { name: "Answer", description: "", type: "markdown", value: "", color: "#2563eb" },
    unused: { name: "Unused", description: "", type: "text", value: "", color: "#78716c" },
  },
  nodes: {
    input_1: {
      kind: "input",
      name: "Question Input",
      description: "Collects a question.",
      ui: { position: { x: 0, y: 0 } },
      reads: [],
      writes: [{ state: "question" }],
      config: { value: "" },
    },
    agent_1: {
      kind: "agent",
      name: "Answer Agent",
      description: "Drafts an answer.",
      ui: { position: { x: 220, y: 0 } },
      reads: [{ state: "question", required: true }],
      writes: [{ state: "answer" }],
      config: {
        skills: [],
        taskInstruction: "Answer the question.",
        modelSource: "global",
        model: "",
        thinkingMode: "on",
        temperature: 0.2,
      },
    },
    condition_1: {
      kind: "condition",
      name: "Answer Check",
      description: "Checks the answer.",
      ui: { position: { x: 440, y: 0 } },
      reads: [{ state: "answer" }],
      writes: [],
      config: {
        branches: ["continue", "retry"],
        loopLimit: 5,
        branchMapping: {},
        rule: { source: "answer", operator: "exists", value: null },
      },
    },
    output_1: {
      kind: "output",
      name: "Final Output",
      description: "Shows the final answer.",
      ui: { position: { x: 660, y: 0 } },
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
  edges: [],
  conditional_edges: [],
  metadata: {},
};

test("slugifyPresetBase creates stable preset id segments", () => {
  assert.equal(slugifyPresetBase("Answer Agent"), "answer_agent");
  assert.equal(slugifyPresetBase("  !!!  "), "node");
});

test("buildPresetPayloadForNode saves every node family as a manageable preset", () => {
  const expectedKinds = [
    ["input_1", "preset.local.input.question_input.fixed"],
    ["agent_1", "preset.local.agent.answer_agent.fixed"],
    ["condition_1", "preset.local.condition.answer_check.fixed"],
    ["output_1", "preset.local.output.final_output.fixed"],
  ] as const;

  for (const [nodeId, presetId] of expectedKinds) {
    const payload = buildPresetPayloadForNode(document, nodeId, { idSuffix: "fixed" });

    assert.equal(payload?.presetId, presetId);
    assert.equal(payload?.sourcePresetId, null);
    assert.equal(payload?.definition.node.kind, document.nodes[nodeId].kind);
    assert.equal(payload?.definition.label, document.nodes[nodeId].name);
  }
});

test("buildPresetPayloadForNode keeps only state fields referenced by the saved node", () => {
  const payload = buildPresetPayloadForNode(document, "agent_1", { idSuffix: "fixed" });

  assert.deepEqual(Object.keys(payload?.definition.state_schema ?? {}).sort(), ["answer", "question"]);
  assert.equal(payload?.definition.state_schema.unused, undefined);
});

test("buildPresetPayloadForNode returns null for missing nodes", () => {
  assert.equal(buildPresetPayloadForNode(document, "missing", { idSuffix: "fixed" }), null);
});
