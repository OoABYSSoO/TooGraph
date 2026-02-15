import assert from "node:assert/strict";
import test from "node:test";

import { formatRunDisplayName, formatRunDisplayTimestamp } from "./run-display-name.ts";

test("formatRunDisplayTimestamp formats started_at into a stable local date-time shape", () => {
  assert.equal(formatRunDisplayTimestamp("2026-04-24T09:30:45Z", { timeZone: "UTC" }), "2026-04-24 09:30");
});

test("formatRunDisplayName combines graph name with formatted time", () => {
  assert.equal(
    formatRunDisplayName(
      {
        graph_name: "知识库验证",
        started_at: "2026-04-24T09:30:45Z",
      },
      { timeZone: "UTC" },
    ),
    "知识库验证 · 2026-04-24 09:30",
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
    "Untitled Graph · 2026-04-24 09:30",
  );
});
