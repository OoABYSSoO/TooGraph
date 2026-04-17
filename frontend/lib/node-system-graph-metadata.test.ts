import test from "node:test";
import assert from "node:assert/strict";

import { resolveCycleMaxIterations, writeCycleMaxIterations } from "./node-system-graph-metadata.ts";

test("resolveCycleMaxIterations prefers snake_case metadata and falls back to default", () => {
  assert.equal(resolveCycleMaxIterations({ cycle_max_iterations: 24 }), 24);
  assert.equal(resolveCycleMaxIterations({ cycle_max_iterations: "18" }), 18);
  assert.equal(resolveCycleMaxIterations({ cycle_max_iterations: 0 }), 12);
  assert.equal(resolveCycleMaxIterations({}), 12);
});

test("resolveCycleMaxIterations accepts camelCase legacy metadata as fallback input", () => {
  assert.equal(resolveCycleMaxIterations({ cycleMaxIterations: 9 }), 9);
  assert.equal(resolveCycleMaxIterations({ cycle_max_iterations: 15, cycleMaxIterations: 9 }), 15);
});

test("writeCycleMaxIterations writes normalized snake_case metadata and removes legacy key", () => {
  assert.deepEqual(
    writeCycleMaxIterations({ cycleMaxIterations: 8, keep: true }, 14),
    {
      keep: true,
      cycle_max_iterations: 14,
    },
  );
});

test("writeCycleMaxIterations removes cycle limit when null or invalid values are provided", () => {
  assert.deepEqual(writeCycleMaxIterations({ cycle_max_iterations: 12, keep: true }, null), { keep: true });
  assert.deepEqual(writeCycleMaxIterations({ cycle_max_iterations: 12, keep: true }, 0), { keep: true });
});
