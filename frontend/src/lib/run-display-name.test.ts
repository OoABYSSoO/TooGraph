import assert from "node:assert/strict";
import test from "node:test";

import {
  formatRunDisplayName,
  formatRunDisplayTimestamp,
  formatRunDuration,
  formatRunTokenUsageKTokens,
} from "./run-display-name.ts";

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

test("formatRunTokenUsageKTokens renders compact ktoken values", () => {
  assert.equal(formatRunTokenUsageKTokens(null), null);
  assert.equal(formatRunTokenUsageKTokens(0), null);
  assert.equal(formatRunTokenUsageKTokens(380), "0.38k Tokens");
  assert.equal(formatRunTokenUsageKTokens(3420), "3.42k Tokens");
  assert.equal(formatRunTokenUsageKTokens(12_400), "12.4k Tokens");
  assert.equal(formatRunTokenUsageKTokens(125_000), "125k Tokens");
});
