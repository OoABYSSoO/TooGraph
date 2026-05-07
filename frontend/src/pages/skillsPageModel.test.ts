import test from "node:test";
import assert from "node:assert/strict";

import type { SkillDefinition } from "../types/skills.ts";

import { buildSkillOverview, buildSkillStatusOptions, filterSkillsForManagement } from "./skillsPageModel.ts";

const skills: SkillDefinition[] = [
  {
    skillKey: "rewrite_text",
    name: "Rewrite Text",
    description: "Rewrite text with a specified style.",
    llmInstruction: "Rewrite the provided text.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [{ key: "text", name: "Text", valueType: "text", required: true, description: "Source text" }],
    outputSchema: [{ key: "rewritten", name: "Rewritten", valueType: "text", required: false, description: "Result" }],
    supportedValueTypes: ["text"],
    sideEffects: [],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    version: "1.0.0",
    runPolicies: {
      default: { discoverable: true, autoSelectable: false, requiresApproval: false },
      origins: {},
    },
    kind: "atomic",
    mode: "tool",
    scope: "node",
    permissions: ["model_text"],
    sourceFormat: "skill",
    sourceScope: "installed",
    sourcePath: "/skills/rewrite_text/SKILL.md",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
  },
  {
    skillKey: "draft_search",
    name: "Draft Search",
    description: "Installed skill that still needs a runtime manifest.",
    llmInstruction: "",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text", "json"],
    sideEffects: ["network"],
    runtime: { type: "future", entrypoint: "" },
    health: { type: "none" },
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
    version: "0.1.0",
    runPolicies: {
      default: { discoverable: true, autoSelectable: false, requiresApproval: false },
      origins: {
        companion: { discoverable: true, autoSelectable: true, requiresApproval: true },
      },
    },
    kind: "atomic",
    mode: "tool",
    scope: "workspace",
    permissions: ["network", "model_vision"],
    sourceFormat: "skill",
    sourceScope: "installed",
    sourcePath: "/skills/draft_search/skill.json",
    runtimeReady: false,
    runtimeRegistered: false,
    configured: true,
    healthy: false,
    status: "active",
    canManage: true,
  },
  {
    skillKey: "desktop_companion_profile",
    name: "Desktop Companion Profile",
    description: "A companion context profile.",
    llmInstruction: "",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text"],
    sideEffects: [],
    runtime: { type: "none", entrypoint: "" },
    health: { type: "none" },
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing outputSchema."],
    version: "0.1.0",
    runPolicies: {
      default: { discoverable: false, autoSelectable: false, requiresApproval: true },
      origins: {
        companion: { discoverable: false, autoSelectable: false, requiresApproval: true },
      },
    },
    kind: "profile",
    mode: "context",
    scope: "global",
    permissions: ["profile_context"],
    sourceFormat: "skill",
    sourceScope: "installed",
    sourcePath: "/skills/desktop_companion_profile/skill.json",
    runtimeReady: false,
    runtimeRegistered: false,
    configured: false,
    healthy: true,
    status: "active",
    canManage: true,
  },
];

test("filterSkillsForManagement searches native taxonomy and permission fields", () => {
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "rewrite", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "model_vision", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "profile", status: "all" }).map((skill) => skill.skillKey),
    ["desktop_companion_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "requires approval", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search", "desktop_companion_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "auto selectable", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "run.py python runtime", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "missing a script runtime", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search"],
  );
});

test("filterSkillsForManagement filters by run policy and attention state", () => {
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "discoverable" }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "autonomous" }).map((skill) => skill.skillKey),
    ["draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "runtime" }).map((skill) => skill.skillKey),
    ["rewrite_text"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "attention" }).map((skill) => skill.skillKey),
    ["draft_search", "desktop_companion_profile"],
  );
});

test("buildSkillOverview summarizes runtime and management readiness", () => {
  assert.deepEqual(buildSkillOverview(skills), {
    total: 3,
    active: 3,
    discoverableSkills: 2,
    autoSelectableSkills: 1,
    runtimeReady: 1,
    runtimeRegistered: 1,
    needsAttention: 2,
  });
});

test("buildSkillStatusOptions keeps management filters stable", () => {
  assert.deepEqual(buildSkillStatusOptions(), ["all", "active", "discoverable", "autonomous", "runtime", "attention"]);
});
