import test from "node:test";
import assert from "node:assert/strict";

import type { TemplateRecord } from "../types/node-system.ts";
import {
  BUDDY_RUN_INPUT_SOURCE_OPTIONS,
  buildBuddyRunInputNodeOptions,
  buildBuddyRunTemplateSourceRows,
  buildBuddyHomeContextValue,
  buildBuddyRunTemplateInputRows,
  buildDefaultBuddyRunTemplateBinding,
  setBuddyRunTemplateSourceBinding,
  validateBuddyRunTemplateBinding,
} from "./buddyTemplateBindingModel.ts";

function template(): TemplateRecord {
  return {
    template_id: "custom_loop",
    label: "Custom Loop",
    description: "Custom Buddy template",
    default_graph_name: "Custom Loop",
    status: "active",
    state_schema: {
      prompt: { name: "prompt", description: "Prompt text", type: "text", value: "", color: "#d97706" },
      history: { name: "history", description: "History", type: "markdown", value: "", color: "#64748b" },
      context: { name: "context", description: "Page context", type: "markdown", value: "", color: "#0891b2" },
      invalid: { name: "invalid", description: "Invalid", type: "text", value: "", color: "#dc2626" },
    },
    nodes: {
      input_prompt: {
        kind: "input",
        name: "Prompt",
        description: "Prompt input",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "prompt", mode: "replace" }],
        config: { value: "" },
      },
      input_history: {
        kind: "input",
        name: "History",
        description: "History input",
        ui: { position: { x: 0, y: 120 } },
        reads: [],
        writes: [{ state: "history", mode: "replace" }],
        config: { value: "" },
      },
      input_invalid: {
        kind: "input",
        name: "Invalid",
        description: "Invalid input",
        ui: { position: { x: 0, y: 240 } },
        reads: [],
        writes: [
          { state: "context", mode: "replace" },
          { state: "invalid", mode: "replace" },
        ],
        config: { value: "" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

test("binding model lists input rows with node and state identity", () => {
  const rows = buildBuddyRunTemplateInputRows(template());
  assert.deepEqual(rows.map((row) => [row.nodeId, row.nodeName, row.stateKey, row.stateName, row.disabledReason]), [
    ["input_prompt", "Prompt", "prompt", "prompt", ""],
    ["input_history", "History", "history", "history", ""],
    ["input_invalid", "Invalid", "", "", "Input node must write exactly one state."],
  ]);
});

test("binding model validates current message and duplicate sources", () => {
  const good = validateBuddyRunTemplateBinding(template(), {
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
      input_history: "conversation_history",
    },
  });
  assert.equal(good.valid, true);

  const missing = validateBuddyRunTemplateBinding(template(), {
    template_id: "custom_loop",
    input_bindings: { input_history: "conversation_history" },
  });
  assert.equal(missing.valid, false);
  assert.match(missing.issues.join("\n"), /current_message/);

  const duplicate = validateBuddyRunTemplateBinding(template(), {
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
      input_history: "current_message",
    },
  });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.issues.join("\n"), /exactly once/);
});

test("binding model exposes Buddy input rows with current message required", () => {
  const rows = buildBuddyRunTemplateSourceRows({
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
      input_history: "conversation_history",
    },
  });

  assert.deepEqual(rows.map((row) => [row.source, row.required, row.selectedNodeId]), [
    ["current_message", true, "input_prompt"],
    ["conversation_history", false, "input_history"],
    ["page_context", false, ""],
    ["buddy_home_context", false, ""],
  ]);
});

test("binding model builds input-node options and disables nodes already used by another Buddy input", () => {
  const options = buildBuddyRunInputNodeOptions(
    template(),
    {
      template_id: "custom_loop",
      input_bindings: {
        input_prompt: "current_message",
        input_history: "conversation_history",
      },
    },
    "page_context",
  );

  assert.deepEqual(options.map((option) => [option.value, option.label, option.disabled, option.disabledReason]), [
    ["input_prompt", "Prompt / prompt (prompt)", true, "Already bound to current_message."],
    ["input_history", "History / history (history)", true, "Already bound to conversation_history."],
    ["input_invalid", "Invalid /  (input_invalid)", true, "Input node must write exactly one state."],
  ]);
});

test("binding model updates source rows without duplicating source or input node selections", () => {
  const initial = {
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
      input_history: "conversation_history",
    },
  };

  const moved = setBuddyRunTemplateSourceBinding(initial, "current_message", "input_history");
  assert.deepEqual(moved.input_bindings, {
    input_history: "current_message",
  });

  const optional = setBuddyRunTemplateSourceBinding(moved, "page_context", "input_prompt");
  assert.deepEqual(optional.input_bindings, {
    input_history: "current_message",
    input_prompt: "page_context",
  });

  const cleared = setBuddyRunTemplateSourceBinding(optional, "page_context", "");
  assert.deepEqual(cleared.input_bindings, {
    input_history: "current_message",
  });
});

test("binding model exposes source options and Buddy Home folder package", () => {
  assert.deepEqual(BUDDY_RUN_INPUT_SOURCE_OPTIONS.map((option) => option.value), [
    "",
    "current_message",
    "conversation_history",
    "page_context",
    "buddy_home_context",
  ]);
  assert.deepEqual(buildBuddyHomeContextValue(), {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "policy.json"],
  });
  assert.deepEqual(buildDefaultBuddyRunTemplateBinding().input_bindings.input_user_message, "current_message");
});
