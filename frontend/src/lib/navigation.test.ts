import assert from "node:assert/strict";
import test from "node:test";

import { buildVisibleNavigationItems, isDeveloperNavigationPath, PRIMARY_NAVIGATION_ITEMS } from "./navigation.ts";

test("navigation marks only unfinished pages as developer-only", () => {
  const developerPaths = PRIMARY_NAVIGATION_ITEMS
    .filter((item) => item.visibility === "developer")
    .map((item) => item.path);

  assert.deepEqual(developerPaths, ["/evidence"]);
  assert.equal(PRIMARY_NAVIGATION_ITEMS.find((item) => item.path === "/actions")?.visibility, "stable");
  assert.equal(PRIMARY_NAVIGATION_ITEMS.find((item) => item.path === "/tools")?.visibility, "stable");
  assert.equal(PRIMARY_NAVIGATION_ITEMS.find((item) => item.path === "/model-logs")?.visibility, "stable");
});

test("navigation orders stable product surfaces by primary workflow", () => {
  assert.deepEqual(
    buildVisibleNavigationItems(false).map((item) => [item.path, item.icon]),
    [
      ["/", "House"],
      ["/editor", "EditPen"],
      ["/library", "Collection"],
      ["/buddy", "ChatDotRound"],
      ["/runs", "Clock"],
      ["/knowledge", "Reading"],
      ["/scheduler", "Calendar"],
      ["/message-platforms", "MessageBox"],
      ["/models", "Cpu"],
      ["/model-logs", "Memo"],
      ["/actions", "Operation"],
      ["/tools", "ToolWrench"],
      ["/presets", "CollectionTag"],
      ["/settings", "Setting"],
    ],
  );
});

test("navigation hides developer pages until developer mode is enabled", () => {
  assert.deepEqual(
    buildVisibleNavigationItems(false)
      .filter((item) => item.visibility === "developer")
      .map((item) => item.path),
    [],
  );
  assert.deepEqual(
    buildVisibleNavigationItems(true)
      .filter((item) => item.visibility === "developer")
      .map((item) => item.path),
    ["/evidence"],
  );
});

test("developer path matching applies to developer pages and their children", () => {
  assert.equal(isDeveloperNavigationPath("/evidence/run_123"), true);
  assert.equal(isDeveloperNavigationPath("/model-logs"), false);
  assert.equal(isDeveloperNavigationPath("/actions"), false);
});
