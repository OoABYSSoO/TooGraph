import test from "node:test";
import assert from "node:assert/strict";

import type { SkillDefinition } from "../types/skills.ts";

import { buildSkillOverview, buildSkillStatusOptions, filterSkillsForManagement } from "./skillsPageModel.ts";

const skills: SkillDefinition[] = [
  {
    skillKey: "rewrite_text",
    label: "Rewrite Text",
    description: "Rewrite text with a specified style.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [{ key: "text", label: "Text", valueType: "text", required: true, description: "Source text" }],
    outputSchema: [{ key: "rewritten", label: "Rewritten", valueType: "text", required: false, description: "Result" }],
    supportedValueTypes: ["text"],
    sideEffects: [],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    agentNodeEligibility: "ready",
    agentNodeBlockers: [],
    version: "1.0.0",
    targets: ["agent_node"],
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
    label: "Draft Search",
    description: "Installed skill that still needs a runtime manifest.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text", "json"],
    sideEffects: ["network"],
    runtime: { type: "future", entrypoint: "" },
    health: { type: "none" },
    agentNodeEligibility: "needs_manifest",
    agentNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
    version: "0.1.0",
    targets: ["agent_node", "companion"],
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
    label: "Desktop Companion Profile",
    description: "A companion context profile.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text"],
    sideEffects: [],
    runtime: { type: "none", entrypoint: "" },
    health: { type: "none" },
    agentNodeEligibility: "incompatible",
    agentNodeBlockers: ["Skill target does not include agent_node."],
    version: "0.1.0",
    targets: ["companion"],
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
    filterSkillsForManagement(skills, { query: "run.py python runtime", status: "all" }).map((skill) => skill.skillKey),
    ["rewrite_text"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "missing a script runtime", status: "all" }).map((skill) => skill.skillKey),
    ["draft_search"],
  );
});

test("filterSkillsForManagement filters by target and attention state", () => {
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "agent" }).map((skill) => skill.skillKey),
    ["rewrite_text", "draft_search"],
  );
  assert.deepEqual(
    filterSkillsForManagement(skills, { query: "", status: "companion" }).map((skill) => skill.skillKey),
    ["draft_search", "desktop_companion_profile"],
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
    agentSkills: 2,
    companionSkills: 2,
    runtimeReady: 1,
    runtimeRegistered: 1,
    needsAttention: 2,
  });
});

test("buildSkillStatusOptions keeps management filters stable", () => {
  assert.deepEqual(buildSkillStatusOptions(), ["all", "active", "agent", "companion", "runtime", "attention"]);
});
