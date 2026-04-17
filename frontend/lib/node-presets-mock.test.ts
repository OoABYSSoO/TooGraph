import test from "node:test";
import assert from "node:assert/strict";

import { buildEditorNodeConfigFromCanonicalPreset } from "./node-system-canonical.ts";
import { EMPTY_AGENT_PRESET, TEXT_INPUT_PRESET, getNodePresetById } from "./node-presets-mock.ts";

test("static presets are stored as canonical preset documents", () => {
  const preset = getNodePresetById(TEXT_INPUT_PRESET.presetId);

  assert.ok(preset);
  assert.equal(preset.presetId, TEXT_INPUT_PRESET.presetId);
  assert.equal(preset.definition.node.kind, "input");
  assert.deepEqual(preset.definition.node.writes, [{ state: "value", mode: "replace" }]);
});

test("static canonical presets still derive usable editor configs", () => {
  const inputConfig = buildEditorNodeConfigFromCanonicalPreset(TEXT_INPUT_PRESET);
  const agentConfig = buildEditorNodeConfigFromCanonicalPreset(EMPTY_AGENT_PRESET);

  assert.equal(inputConfig.family, "input");
  assert.equal(inputConfig.output.key, "value");
  assert.equal(inputConfig.output.label, "Text");
  assert.equal(agentConfig.family, "agent");
  assert.deepEqual(agentConfig.inputs, []);
  assert.deepEqual(agentConfig.outputs, []);
});
