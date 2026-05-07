import test from "node:test";
import assert from "node:assert/strict";

import type { GraphPayload } from "../../types/node-system.ts";
import {
  buildConditionRouteTargets,
  buildConditionRouteTargetsByNodeId,
} from "./conditionRouteTargetsModel.ts";

const document: GraphPayload = {
  name: "Route targets",
  state_schema: {},
  metadata: {},
  nodes: {
    gate: {
      kind: "condition",
      name: "Gate",
      description: "",
      ui: { position: { x: 0, y: 0 } },
      reads: [],
      writes: [],
      config: {
        branches: ["pass", "retry", "missing", "empty"],
        loopLimit: 1,
        branchMapping: {},
        rule: { source: "", operator: "exists", value: null },
      },
    },
    other_gate: {
      kind: "condition",
      name: "Other Gate",
      description: "",
      ui: { position: { x: 0, y: 0 } },
      reads: [],
      writes: [],
      config: {
        branches: ["done"],
        loopLimit: 1,
        branchMapping: {},
        rule: { source: "", operator: "exists", value: null },
      },
    },
    writer: {
      kind: "agent",
      name: "Writer",
      description: "",
      ui: { position: { x: 0, y: 0 } },
      reads: [],
      writes: [],
      config: {
        skillKey: "",
        taskInstruction: "",
        modelSource: "global",
        model: "",
        thinkingMode: "off",
        temperature: 0.2,
      },
    },
    input: {
      kind: "input",
      name: "Input",
      description: "",
      ui: { position: { x: 0, y: 0 } },
      reads: [],
      writes: [],
      config: { value: "" },
    },
  },
  edges: [],
  conditional_edges: [
    {
      source: "gate",
      branches: {
        pass: "writer",
        retry: "input",
        missing: "removed_node",
      },
    },
  ],
};

test("condition route target model projects branch target display names", () => {
  assert.deepEqual(buildConditionRouteTargets(document, "gate"), {
    pass: "Writer",
    retry: "Input",
    missing: "removed_node",
    empty: null,
  });
});

test("condition route target model ignores missing and non-condition nodes", () => {
  assert.deepEqual(buildConditionRouteTargets(document, "writer"), {});
  assert.deepEqual(buildConditionRouteTargets(document, "unknown"), {});
});

test("condition route target model builds lookup entries only for condition nodes", () => {
  assert.deepEqual(buildConditionRouteTargetsByNodeId(document), {
    gate: {
      pass: "Writer",
      retry: "Input",
      missing: "removed_node",
      empty: null,
    },
    other_gate: {
      done: null,
    },
  });
});
