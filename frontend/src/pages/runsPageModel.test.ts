import assert from "node:assert/strict";
import test from "node:test";

import { resolveRunsCardDetail, resolveRunsEmptyAction } from "./runsPageModel.ts";

test("resolveRunsEmptyAction points empty runs state back to the editor entry", () => {
  assert.deepEqual(resolveRunsEmptyAction(), {
    href: "/editor",
    label: "打开编排器",
  });
});

test("resolveRunsCardDetail keeps list cards on the legacy detail affordance", () => {
  assert.equal(resolveRunsCardDetail(), "查看详情");
});
