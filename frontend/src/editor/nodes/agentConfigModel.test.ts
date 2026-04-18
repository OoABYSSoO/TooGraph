import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_AGENT_TEMPERATURE, normalizeAgentTemperature } from "./agentConfigModel.ts";

test("normalizeAgentTemperature clamps finite values into the legacy 0-2 range", () => {
  assert.equal(normalizeAgentTemperature(0.7), 0.7);
  assert.equal(normalizeAgentTemperature(-1), 0);
  assert.equal(normalizeAgentTemperature(3), 2);
});

test("normalizeAgentTemperature falls back to legacy default for invalid values", () => {
  assert.equal(DEFAULT_AGENT_TEMPERATURE, 0.2);
  assert.equal(normalizeAgentTemperature(undefined), 0.2);
  assert.equal(normalizeAgentTemperature(Number.NaN), 0.2);
});
