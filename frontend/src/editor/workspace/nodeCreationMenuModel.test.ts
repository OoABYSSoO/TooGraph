import test from "node:test";
import assert from "node:assert/strict";

import { buildNodeCreationEntries, supportsCreationSourceType } from "./nodeCreationMenuModel.ts";
import type { NodeCreationEntry, PresetDocument } from "@/types/node-system";

const builtins: NodeCreationEntry[] = [
  {
    id: "node-input",
    family: "input",
    label: "Input",
    description: "Create a workflow input boundary.",
    mode: "node",
    origin: "builtin",
    nodeKind: "input",
  },
  {
    id: "node-output",
    family: "output",
    label: "Output",
    description: "Create a workflow output boundary.",
    mode: "node",
    origin: "builtin",
    nodeKind: "output",
  },
  {
    id: "preset-agent-empty",
    family: "agent",
    label: "Empty Agent Node",
    description: "Blank agent node.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.agent.empty.v0",
  },
  {
    id: "preset-condition-empty",
    family: "condition",
    label: "Condition Node",
    description: "Branch based on state.",
    mode: "preset",
    origin: "builtin",
    presetId: "preset.condition.empty.v0",
  },
];

const presets: PresetDocument[] = [
  {
    presetId: "preset.agent.answer_text",
    sourcePresetId: null,
    createdAt: null,
    updatedAt: null,
    definition: {
      label: "Answer Text",
      description: "Answer a text question.",
      state_schema: {
        question: {
          name: "question",
          description: "",
          type: "text",
          value: "",
          color: "#d97706",
        },
      },
      node: {
        kind: "agent",
        name: "answer_text",
        description: "Answer a text question.",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "question", required: true }],
        writes: [],
        config: {
          skills: [],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  },
  {
    presetId: "preset.agent.lookup_kb",
    sourcePresetId: null,
    createdAt: null,
    updatedAt: null,
    definition: {
      label: "Lookup KB",
      description: "Read from a knowledge base.",
      state_schema: {
        query: {
          name: "query",
          description: "",
          type: "text",
          value: "",
          color: "#2563eb",
        },
        knowledge_base: {
          name: "knowledge_base",
          description: "",
          type: "knowledge_base",
          value: "",
          color: "#16a34a",
        },
      },
      node: {
        kind: "agent",
        name: "lookup_kb",
        description: "Read from a knowledge base.",
        ui: { position: { x: 0, y: 0 } },
        reads: [
          { state: "query", required: true },
          { state: "knowledge_base", required: true },
        ],
        writes: [],
        config: {
          skills: ["search_knowledge_base"],
          taskInstruction: "",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  },
];

test("buildNodeCreationEntries keeps node entries ahead of persisted presets within family order", () => {
  const entries = buildNodeCreationEntries({
    builtins: [...builtins],
    presets: [...presets],
    query: "",
    sourceValueType: null,
  });

  assert.deepEqual(
    entries.map((entry) => entry.id),
    [
      "node-input",
      "node-output",
      "preset-agent-empty",
      "preset-preset.agent.answer_text",
      "preset-preset.agent.lookup_kb",
      "preset-condition-empty",
    ],
  );
});

test("buildNodeCreationEntries filters creation candidates by query and source type", () => {
  const entries = buildNodeCreationEntries({
    builtins: [...builtins],
    presets: [...presets],
    query: "lookup",
    sourceValueType: "knowledge_base",
  });

  assert.deepEqual(entries.map((entry) => entry.id), ["preset-preset.agent.lookup_kb"]);
});

test("supportsCreationSourceType rejects text-only agent presets for knowledge base outputs", () => {
  const textPresetEntry: NodeCreationEntry = {
    id: "preset-preset.agent.answer_text",
    family: "agent",
    label: "Answer Text",
    description: "Answer a text question.",
    mode: "preset",
    origin: "persisted",
    presetId: "preset.agent.answer_text",
    acceptsValueTypes: ["text"],
  };

  assert.equal(supportsCreationSourceType(textPresetEntry, "knowledge_base"), false);
  assert.equal(supportsCreationSourceType(textPresetEntry, "text"), true);
});
