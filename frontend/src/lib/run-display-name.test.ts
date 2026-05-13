import assert from "node:assert/strict";
import test from "node:test";

import { formatRunDisplayName, formatRunDisplayTimestamp, formatRunDuration } from "./run-display-name.ts";

test("formatRunDisplayTimestamp formats started_at into a stable local date-time shape", () => {
  assert.equal(formatRunDisplayTimestamp("2026-04-24T09:30:45Z", { timeZone: "UTC" }), "2026-04-24 09:30");
});

test("formatRunDisplayName returns the graph name without duplicating the timestamp", () => {
  assert.equal(
    formatRunDisplayName(
      {
        graph_name: "Knowledge Run",
        started_at: "2026-04-24T09:30:45Z",
      },
      { timeZone: "UTC" },
    ),
    "Knowledge Run",
  );
});

test("formatRunDisplayName falls back when graph name is blank", () => {
  assert.equal(
    formatRunDisplayName(
      {
        graph_name: "   ",
        started_at: "2026-04-24T09:30:45Z",
      },
      { timeZone: "UTC" },
    ),
    "Untitled Graph",
  );
});

test("formatRunDuration uses compact human readable units", () => {
  assert.equal(formatRunDuration(0), formatRunDuration(null));
  assert.equal(formatRunDuration(480), "480ms");
  assert.equal(formatRunDuration(1240), "1.2s");
  assert.equal(formatRunDuration(12_400), "12s");
  assert.equal(formatRunDuration(125_000), "2m 5s");
});

test("formatRunDuration can render seconds with fixed decimals", () => {
  assert.equal(formatRunDuration(1240, { secondsFractionDigits: 2 }), "1.24s");
  assert.equal(formatRunDuration(12_400, { secondsFractionDigits: 2 }), "12.40s");
});
