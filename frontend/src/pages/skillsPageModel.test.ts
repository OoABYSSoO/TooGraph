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
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
    version: "1.0.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {},
    },
    permissions: ["model_text"],
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
    runtime: { type: "future", entrypoint: "" },
    health: { type: "none" },
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
    version: "0.1.0",
    capabilityPolicy: {
      default: { selectable: true, requiresApproval: false },
      origins: {
        companion: { selectable: true, requiresApproval: true },
      },
    },
    permissions: ["network", "model_vision"],
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
    runtime: { type: "none", entrypoint: "" },
    health: { type: "none" },
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing outputSchema."],
    version: "0.1.0",
    capabilityPolicy: {
      default: { selectable: false, requiresApproval: true },
      origins: {
        companion: { selectable: false, requiresApproval: true },
      },
    },
    permissions: ["profile_context"],
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

test("filterSkillsForManagement searches capability policy and permission fields", () => {
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
    filterSkillsForManagement(skills, { query: "selectable capability", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "profile_context", status: "all" }).map((skill) => skill.skillKey),
    ["desktop_companion_profile"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "companion selectable capability requires approval", status: "all" }).map((skill) => skill.skillKey),
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

test("filterSkillsForManagement filters by capability policy and attention state", () => {
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "selectable" }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search"],
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
    selectableSkills: 2,
    runtimeReady: 1,
    runtimeRegistered: 1,
    needsAttention: 2,
  });
});

test("buildSkillStatusOptions keeps management filters stable", () => {
  assert.deepEqual(buildSkillStatusOptions(), ["all", "active", "selectable", "runtime", "attention"]);
});
