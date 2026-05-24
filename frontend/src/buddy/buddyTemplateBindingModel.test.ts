import test from "node:test";
import assert from "node:assert/strict";

import type { TemplateRecord } from "../types/node-system.ts";
import {
  BUDDY_MEMORY_REVIEW_INPUT_SOURCE_OPTIONS,
  BUDDY_RUN_INPUT_SOURCE_OPTIONS,
  buildBuddyMemoryReviewInputNodeOptions,
  buildBuddyMemoryReviewTemplateSourceRows,
  buildBuddyRunInputNodeOptions,
  buildBuddyRunTemplateSourceRows,
  buildBuddyHomeContextValue,
  buildDefaultBuddyMemoryReviewTemplateBinding,
  buildBuddyRunTemplateInputRows,
  buildDefaultBuddyRunTemplateBinding,
  setBuddyMemoryReviewTemplateSourceBinding,
  setBuddyRunTemplateSourceBinding,
  validateBuddyMemoryReviewTemplateBinding,
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

function memoryReviewTemplate(): TemplateRecord {
  return {
    template_id: "buddy_autonomous_review",
    label: "Autonomous Review",
    description: "Review buddy memory after a run.",
    default_graph_name: "Autonomous Review",
    status: "active",
    state_schema: {
      source_run_id: { name: "source_run_id", description: "", type: "text", value: "", color: "#475569" },
      current_session_id: { name: "current_session_id", description: "", type: "text", value: "", color: "#475569" },
      user_message: { name: "user_message", description: "", type: "text", value: "", color: "#d97706" },
      public_response: { name: "public_response", description: "", type: "markdown", value: "", color: "#16a34a" },
      buddy_context: { name: "buddy_context", description: "", type: "file", value: "", color: "#0f766e" },
      memory_update_plan: { name: "memory_update_plan", description: "", type: "json", value: {}, color: "#22c55e" },
    },
    nodes: {
      input_source_run_id: {
        kind: "input",
        name: "Source Run",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "source_run_id", mode: "replace" }],
        config: { value: "" },
      },
      input_current_session_id: {
        kind: "input",
        name: "Current Session",
        description: "",
        ui: { position: { x: 0, y: 120 } },
        reads: [],
        writes: [{ state: "current_session_id", mode: "replace" }],
        config: { value: "" },
      },
      input_user_message: {
        kind: "input",
        name: "User Message",
        description: "",
        ui: { position: { x: 0, y: 240 } },
        reads: [],
        writes: [{ state: "user_message", mode: "replace" }],
        config: { value: "" },
      },
      input_public_response: {
        kind: "input",
        name: "Public Response",
        description: "",
        ui: { position: { x: 0, y: 360 } },
        reads: [],
        writes: [{ state: "public_response", mode: "replace" }],
        config: { value: "" },
      },
      input_buddy_context: {
        kind: "input",
        name: "Buddy Context",
        description: "",
        ui: { position: { x: 0, y: 480 } },
        reads: [],
        writes: [{ state: "buddy_context", mode: "replace" }],
        config: { value: "" },
      },
      input_memory_update_plan: {
        kind: "input",
        name: "Memory Update Plan",
        description: "",
        ui: { position: { x: 0, y: 600 } },
        reads: [],
        writes: [{ state: "memory_update_plan", mode: "replace" }],
        config: { value: "" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: { role: "buddy_autonomous_review", internal: true },
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

test("binding model rejects templates with breakpoint metadata", () => {
  const pausedTemplate = {
    ...template(),
    hasBreakpointMetadata: true,
    capabilityDiscoverableBlockedReason: "breakpoint_metadata",
    metadata: { interrupt_after: ["review"] },
  };

  const validation = validateBuddyRunTemplateBinding(pausedTemplate, {
    template_id: "custom_loop",
    input_bindings: {
      input_prompt: "current_message",
    },
  });

  assert.equal(validation.valid, false);
  assert.match(validation.issues.join("\n"), /breakpoint/);
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
    ["session_summary", false, ""],
    ["buddy_home_context", false, ""],
    ["current_session_id", false, ""],
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
    "session_summary",
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

  const optional = setBuddyRunTemplateSourceBinding(moved, "session_summary", "input_prompt");
  assert.deepEqual(optional.input_bindings, {
    input_history: "current_message",
    input_prompt: "session_summary",
  });

  const cleared = setBuddyRunTemplateSourceBinding(optional, "session_summary", "");
  assert.deepEqual(cleared.input_bindings, {
    input_history: "current_message",
  });
});

test("binding model exposes source options and Buddy Home folder package", () => {
  assert.deepEqual(BUDDY_RUN_INPUT_SOURCE_OPTIONS.map((option) => option.value), [
    "",
    "current_message",
    "conversation_history",
    "session_summary",
    "buddy_home_context",
    "current_session_id",
  ]);
  assert.deepEqual(buildBuddyHomeContextValue(), {
    kind: "local_folder",
    root: "buddy_home",
    selected: ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "policy.json"],
  });
  assert.deepEqual(buildDefaultBuddyRunTemplateBinding().input_bindings.input_user_message, "current_message");
  assert.deepEqual(buildDefaultBuddyRunTemplateBinding().input_bindings.input_existing_session_summary, "session_summary");
  assert.deepEqual(buildDefaultBuddyRunTemplateBinding().input_bindings.input_current_session_id, "current_session_id");
  const defaultRunSources = new Set<string>(Object.values(buildDefaultBuddyRunTemplateBinding().input_bindings));
  assert.equal(defaultRunSources.has("page_context"), false);
  assert.equal(defaultRunSources.has("raw_conversation_history"), false);
});

test("memory review binding model exposes required automatic source rows", () => {
  const binding = buildDefaultBuddyMemoryReviewTemplateBinding();
  const rows = buildBuddyMemoryReviewTemplateSourceRows(binding);

  assert.equal(binding.template_id, "buddy_autonomous_review");
  assert.deepEqual(rows.map((row) => [row.source, row.required, row.selectedNodeId]), [
    ["source_run_id", true, "input_source_run_id"],
    ["current_session_id", true, "input_current_session_id"],
    ["user_message", true, "input_user_message"],
    ["public_response", true, "input_public_response"],
    ["buddy_home_context", true, "input_buddy_context"],
    ["conversation_history", false, "input_conversation_history"],
    ["request_understanding", false, "input_request_understanding"],
    ["capability_result", false, "input_capability_result"],
    ["capability_review", false, "input_capability_review"],
  ]);
});

test("memory review binding validation requires core sources and rejects internal output states", () => {
  const good = validateBuddyMemoryReviewTemplateBinding(memoryReviewTemplate(), {
    template_id: "buddy_autonomous_review",
    input_bindings: {
      input_source_run_id: "source_run_id",
      input_current_session_id: "current_session_id",
      input_user_message: "user_message",
      input_public_response: "public_response",
      input_buddy_context: "buddy_home_context",
    },
  });
  assert.equal(good.valid, true);

  const missing = validateBuddyMemoryReviewTemplateBinding(memoryReviewTemplate(), {
    template_id: "buddy_autonomous_review",
    input_bindings: {
      input_source_run_id: "source_run_id",
      input_user_message: "user_message",
      input_public_response: "public_response",
      input_buddy_context: "buddy_home_context",
    },
  });
  assert.equal(missing.valid, false);
  assert.match(missing.issues.join("\n"), /current_session_id/);

  const internal = validateBuddyMemoryReviewTemplateBinding(memoryReviewTemplate(), {
    template_id: "buddy_autonomous_review",
    input_bindings: {
      input_source_run_id: "source_run_id",
      input_current_session_id: "current_session_id",
      input_user_message: "user_message",
      input_public_response: "public_response",
      input_buddy_context: "buddy_home_context",
      input_memory_update_plan: "memory_update_plan",
    },
  });
  assert.equal(internal.valid, false);
  assert.match(internal.issues.join("\n"), /Unsupported Buddy memory review input source/);
});

test("memory review binding model updates source rows without duplication", () => {
  const initial = buildDefaultBuddyMemoryReviewTemplateBinding();

  const moved = setBuddyMemoryReviewTemplateSourceBinding(initial, "current_session_id", "input_user_message");
  assert.equal(moved.input_bindings.input_user_message, "current_session_id");
  assert.equal(Object.values(moved.input_bindings).includes("user_message"), false);

  const options = buildBuddyMemoryReviewInputNodeOptions(memoryReviewTemplate(), moved, "user_message");
  assert.deepEqual(options.map((option) => [option.value, option.disabled, option.disabledReason]), [
    ["input_source_run_id", true, "Already bound to source_run_id."],
    ["input_current_session_id", false, ""],
    ["input_user_message", true, "Already bound to current_session_id."],
    ["input_public_response", true, "Already bound to public_response."],
    ["input_buddy_context", true, "Already bound to buddy_home_context."],
    ["input_memory_update_plan", true, "State is produced inside the memory review graph."],
  ]);
  assert.deepEqual(BUDDY_MEMORY_REVIEW_INPUT_SOURCE_OPTIONS.map((option) => option.value).slice(0, 3), [
    "",
    "source_run_id",
    "current_session_id",
  ]);
});
