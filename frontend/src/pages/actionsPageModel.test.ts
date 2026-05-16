import test from "node:test";
import assert from "node:assert/strict";

import type { SkillDefinition } from "../types/actions.ts";

import { buildSkillOverview, buildSkillStatusOptions, filterSkillsForManagement } from "./actionsPageModel.ts";

const actions: SkillDefinition[] = [
  {
    skillKey: "rewrite_text",
    name: "Rewrite Text",
    description: "Rewrite text with a specified style.",
    llmInstruction: "Rewrite the provided text.",
    schemaVersion: "toograph.action/v1",
    stateInputSchema: [{ key: "source_text", name: "Source Text", valueType: "text", description: "Bound graph state input" }],
    llmOutputSchema: [{ key: "text", name: "Text", valueType: "text", description: "Source text" }],
    stateOutputSchema: [{ key: "rewritten", name: "Rewritten", valueType: "text", description: "Result" }],
    runtime: { type: "python", entrypoint: "run.py" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    version: "1.0.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {},
    },
    permissions: ["model_text"],
    sourceScope: "installed",
    sourcePath: "/actions/rewrite_text/ACTION.md",
    runtimeReady: true,
    runtimeRegistered: true,
    status: "active",
    canManage: true,
  },
  {
    skillKey: "draft_search",
    name: "Draft Search",
    description: "Installed skill that still needs a runtime manifest.",
    llmInstruction: "",
    schemaVersion: "toograph.action/v1",
    stateInputSchema: [],
    llmOutputSchema: [],
    stateOutputSchema: [],
    runtime: { type: "future", entrypoint: "" },
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
    version: "0.1.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {
        buddy: { selectable: true, requiresApproval: true },
      },
    },
    permissions: ["network", "model_vision"],
    sourceScope: "installed",
    sourcePath: "/actions/draft_search/action.json",
    runtimeReady: false,
    runtimeRegistered: false,
    status: "active",
    canManage: true,
  },
  {
    skillKey: "desktop_buddy_profile",
    name: "Desktop Buddy Profile",
    description: "A buddy context profile.",
    llmInstruction: "",
    schemaVersion: "toograph.action/v1",
    stateInputSchema: [],
    llmOutputSchema: [],
    stateOutputSchema: [],
    runtime: { type: "none", entrypoint: "" },
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing stateOutputSchema."],
    version: "0.1.0",
    capabilityPolicy: {
      default: { selectable: false, requiresApproval: true },
      origins: {
        buddy: { selectable: false, requiresApproval: true },
      },
    },
    permissions: ["profile_context"],
    sourceScope: "installed",
    sourcePath: "/actions/desktop_buddy_profile/action.json",
    runtimeReady: false,
    runtimeRegistered: false,
    status: "disabled",
    canManage: true,
  },
];

test("filterSkillsForManagement searches skill metadata and permission fields", () => {
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "rewrite", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "model_vision", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "profile", status: "all" }).map((skill) => skill.skillKey),
    ["desktop_buddy_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "profile_context", status: "all" }).map((skill) => skill.skillKey),
    ["desktop_buddy_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "bound graph state input", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "action.json", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search", "desktop_buddy_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "run.py python runtime", status: "all" }).map((skill) => skill.skillKey),
    [],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "missing a script runtime", status: "all" }).map((skill) => skill.skillKey),
    [],
  );
});

test("filterSkillsForManagement filters by user-facing availability", () => {
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "", status: "disabled" }).map((skill) => skill.skillKey),
    ["desktop_buddy_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "", status: "active" }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search", "desktop_buddy_profile"],
  );
});

test("filterSkillsForManagement ignores removed runtime and attention filters", () => {
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "", status: "runtime" as never }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search", "desktop_buddy_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(actions, { query: "", status: "attention" as never }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search", "desktop_buddy_profile"],
  );
});

test("buildSkillOverview summarizes user-facing management counts", () => {
  assert.deepEqual(buildSkillOverview(actions), {
    total: 3,
    active: 2,
    visibleActions: 2,
  });
});

test("buildSkillStatusOptions keeps user-facing management filters stable", () => {
  assert.deepEqual(buildSkillStatusOptions(), ["all", "active", "disabled"]);
});
