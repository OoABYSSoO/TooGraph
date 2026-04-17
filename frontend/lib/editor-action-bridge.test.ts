import test from "node:test";
import assert from "node:assert/strict";

import { createLiveEditorActionBridge, type LiveEditorActionRefMap } from "./editor-action-bridge.ts";

type ActionSet = {
  save?: () => Promise<boolean> | boolean;
  validate?: () => void;
  run?: () => void;
  toggleStatePanel?: () => void;
  setGraphName?: (name: string) => void;
};

test("live editor action bridge invokes the latest action for the active tab", async () => {
  const calls: string[] = [];
  const actionsRef: { current: LiveEditorActionRefMap<ActionSet> } = {
    current: {
      tab_a: {
        run: () => {
          calls.push("old-run");
        },
      },
    },
  };
  const activeTabIdRef = { current: "tab_a" as string | null };
  const bridge = createLiveEditorActionBridge(actionsRef, activeTabIdRef);

  actionsRef.current.tab_a = {
    run: () => {
      calls.push("new-run");
    },
  };

  await bridge.run();

  assert.deepEqual(calls, ["new-run"]);
});

test("live editor action bridge follows active tab changes without recreation", async () => {
  const calls: string[] = [];
  const actionsRef: { current: LiveEditorActionRefMap<ActionSet> } = {
    current: {
      tab_a: {
        save: async () => {
          calls.push("save-a");
          return true;
        },
      },
      tab_b: {
        save: async () => {
          calls.push("save-b");
          return false;
        },
      },
    },
  };
  const activeTabIdRef = { current: "tab_a" as string | null };
  const bridge = createLiveEditorActionBridge(actionsRef, activeTabIdRef);

  assert.equal(await bridge.save(), true);
  activeTabIdRef.current = "tab_b";
  assert.equal(await bridge.save(), false);

  assert.deepEqual(calls, ["save-a", "save-b"]);
});
