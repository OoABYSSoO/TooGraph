import assert from "node:assert/strict";
import test from "node:test";

import { getNodePortSectionPresentation } from "./node-system-node-card-presentation.ts";

test("condition nodes present reads and branches as distinct visual sections", () => {
  assert.deepEqual(getNodePortSectionPresentation("condition"), {
    inputTitle: null,
    outputTitle: null,
    inputActionLabel: "input",
    outputActionLabel: "branch",
    outputVariant: "branch",
  });
});

test("agent nodes keep state-style read and write presentation", () => {
  assert.deepEqual(getNodePortSectionPresentation("agent"), {
    inputTitle: null,
    outputTitle: null,
    inputActionLabel: "input",
    outputActionLabel: "output",
    outputVariant: "state",
  });
});
