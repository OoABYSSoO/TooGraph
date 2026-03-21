import assert from "node:assert/strict";
import test from "node:test";

import type { RunDetail } from "@/types/run";

import {
  canShowWorkspaceHumanReviewPanel,
  isWorkspaceHumanReviewPanelLockedOpen,
  isWorkspaceRunActivityPanelOpen,
  isWorkspaceStatePanelOpen,
  resolveWorkspaceSidePanelMode,
  shouldShowWorkspaceRunActivityPanel,
  shouldShowWorkspaceHumanReviewPanel,
} from "./workspaceSidePanelModel.ts";

function runWithStatus(status: string): RunDetail {
  return { status } as RunDetail;
}

test("isWorkspaceStatePanelOpen reads the tab entry and defaults missing tabs to closed", () => {
  assert.equal(isWorkspaceStatePanelOpen({ tab_a: true, tab_b: false }, "tab_a"), true);
  assert.equal(isWorkspaceStatePanelOpen({ tab_a: true, tab_b: false }, "tab_b"), false);
  assert.equal(isWorkspaceStatePanelOpen({ tab_a: true }, "tab_missing"), false);
});

test("resolveWorkspaceSidePanelMode reads the tab entry and defaults missing tabs to state mode", () => {
  assert.equal(resolveWorkspaceSidePanelMode({ tab_a: "human-review" }, "tab_a"), "human-review");
  assert.equal(resolveWorkspaceSidePanelMode({ tab_b: "run-activity" }, "tab_b"), "run-activity");
  assert.equal(resolveWorkspaceSidePanelMode({ tab_a: "human-review" }, "tab_missing"), "state");
});

test("shouldShowWorkspaceRunActivityPanel requires the side panel to be open in run-activity mode", () => {
  assert.equal(shouldShowWorkspaceRunActivityPanel({ tab_a: true }, { tab_a: "run-activity" }, "tab_a"), true);
  assert.equal(shouldShowWorkspaceRunActivityPanel({ tab_a: true }, { tab_a: "state" }, "tab_a"), false);
  assert.equal(shouldShowWorkspaceRunActivityPanel({ tab_a: false }, { tab_a: "run-activity" }, "tab_a"), false);
  assert.equal(isWorkspaceRunActivityPanelOpen({ tab_a: true }, { tab_a: "run-activity" }, "tab_a"), true);
});

test("canShowWorkspaceHumanReviewPanel only allows awaiting-human runs", () => {
  assert.equal(canShowWorkspaceHumanReviewPanel({ tab_a: runWithStatus("awaiting_human") }, "tab_a"), true);
  assert.equal(canShowWorkspaceHumanReviewPanel({ tab_a: runWithStatus("running") }, "tab_a"), false);
  assert.equal(canShowWorkspaceHumanReviewPanel({ tab_a: null }, "tab_a"), false);
  assert.equal(canShowWorkspaceHumanReviewPanel({}, "tab_missing"), false);
});

test("shouldShowWorkspaceHumanReviewPanel requires both human-review mode and awaiting-human status", () => {
  const runs = {
    tab_a: runWithStatus("awaiting_human"),
    tab_b: runWithStatus("running"),
  };

  assert.equal(shouldShowWorkspaceHumanReviewPanel({ tab_a: "human-review" }, runs, "tab_a"), true);
  assert.equal(shouldShowWorkspaceHumanReviewPanel({ tab_a: "state" }, runs, "tab_a"), false);
  assert.equal(shouldShowWorkspaceHumanReviewPanel({ tab_b: "human-review" }, runs, "tab_b"), false);
  assert.equal(shouldShowWorkspaceHumanReviewPanel({ tab_missing: "human-review" }, runs, "tab_missing"), false);
});

test("isWorkspaceHumanReviewPanelLockedOpen mirrors the locked open Human Review policy", () => {
  const runs = {
    tab_a: runWithStatus("awaiting_human"),
    tab_b: runWithStatus("awaiting_human"),
  };

  assert.equal(isWorkspaceHumanReviewPanelLockedOpen({ tab_a: "human-review" }, runs, "tab_a"), true);
  assert.equal(isWorkspaceHumanReviewPanelLockedOpen({ tab_b: "state" }, runs, "tab_b"), false);
});
