import test from "node:test";
import assert from "node:assert/strict";

import type { PresetDocument } from "../types/node-system.ts";

import { buildPresetKindOptions, buildPresetOverview, filterPresetsForManagement } from "./presetsPageModel.ts";

const presets: PresetDocument[] = [
  {
    presetId: "agent_writer",
    sourcePresetId: null,
    createdAt: "2026-04-20T08:00:00Z",
    updatedAt: "2026-04-21T08:00:00Z",
    status: "active",
    definition: {
      label: "Writing Agent",
      description: "Drafts polished copy.",
      state_schema: {
        brief: { name: "Brief", description: "Input brief", type: "text", color: "#d8a650" },
      },
      node: {
        kind: "agent",
        name: "Writer",
        description: "Writes copy",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "brief", required: true }],
        writes: [{ state: "draft" }],
        config: {
          skills: ["rewrite_text"],
          taskInstruction: "Draft copy",
          modelSource: "global",
          model: "",
          thinkingMode: "on",
          temperature: 0.2,
        },
      },
    },
  },
  {
    presetId: "plain_output",
    sourcePresetId: "output",
    createdAt: "2026-04-19T08:00:00Z",
    updatedAt: "2026-04-19T08:00:00Z",
    status: "disabled",
    definition: {
      label: "Plain Output",
      description: "Shows final text.",
      state_schema: {},
      node: {
        kind: "output",
        name: "Output",
        description: "Final output",
        ui: { position: { x: 0, y: 0 } },
        reads: [{ state: "draft" }],
        writes: [],
        config: {
          displayMode: "plain",
          persistEnabled: false,
          persistFormat: "txt",
          fileNameTemplate: "",
        },
      },
    },
  },
];

test("filterPresetsForManagement searches preset id, label, description, and node kind", () => {
  assert.deepEqual(
    filterPresetsForManagement(presets, { query: "rewrite", kind: "all" }).map((preset) => preset.presetId),
    ["agent_writer"],
  );
  assert.deepEqual(
    filterPresetsForManagement(presets, { query: "OUTPUT", kind: "all" }).map((preset) => preset.presetId),
    ["plain_output"],
  );
  assert.deepEqual(
    filterPresetsForManagement(presets, { query: "", kind: "agent" }).map((preset) => preset.presetId),
    ["agent_writer"],
  );
});

test("buildPresetOverview summarizes operational preset inventory", () => {
  assert.deepEqual(buildPresetOverview(presets), {
    total: 2,
    agent: 1,
    stateFields: 1,
    latestUpdatedAt: "2026-04-21T08:00:00Z",
  });
});

test("buildPresetKindOptions keeps the all option ahead of node families", () => {
  assert.deepEqual(buildPresetKindOptions(), ["all", "input", "agent", "condition", "output"]);
});
