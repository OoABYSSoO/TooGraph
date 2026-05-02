import test from "node:test";
import assert from "node:assert/strict";

import {
  listAttachableSkillDefinitions,
  resolveAttachAgentSkillPatch,
  resolveAttachedSkillBadges,
  resolveRemoveAgentSkillPatch,
} from "./skillPickerModel.ts";
import type { SkillDefinition } from "../../types/skills.ts";

const skillDefinitions: SkillDefinition[] = [
  {
    skillKey: "web_search",
    label: "Web Search",
    description: "Searches the public web.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text", "json"],
    sideEffects: ["network"],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    agentNodeEligibility: "ready",
    agentNodeBlockers: [],
    version: "1.0.0",
    targets: ["agent_node"],
    kind: "atomic",
    mode: "tool",
    scope: "node",
    permissions: ["network"],
    sourceFormat: "skill",
    sourceScope: "installed",
    sourcePath: "/skills/web_search/skill.json",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
  },
  {
    skillKey: "append_usage_introduction",
    label: "Append Usage Introduction",
    description: "Appends usage instructions to the answer.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text"],
    sideEffects: ["none"],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    agentNodeEligibility: "ready",
    agentNodeBlockers: [],
    version: "1.0.0",
    targets: ["agent_node"],
    kind: "atomic",
    mode: "tool",
    scope: "node",
    permissions: [],
    sourceFormat: "skill",
    sourceScope: "installed",
    sourcePath: "/skills/append_usage_introduction/skill.json",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
  },
];

const unavailableSkillDefinitions: SkillDefinition[] = [
  skillDefinitions[0],
  {
    ...skillDefinitions[1],
    skillKey: "desktop_companion_profile",
    label: "Desktop Companion Profile",
    targets: ["companion"],
    kind: "profile",
    mode: "context",
    scope: "global",
  },
  {
    ...skillDefinitions[1],
    skillKey: "needs_configuration",
    label: "Needs Configuration",
    configured: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "unhealthy_skill",
    label: "Unhealthy Skill",
    healthy: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "runtime_pending",
    label: "Runtime Pending",
    runtimeRegistered: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "disabled_skill",
    label: "Disabled Skill",
    status: "disabled",
  },
  {
    ...skillDefinitions[1],
    skillKey: "needs_manifest",
    label: "Needs Manifest",
    agentNodeEligibility: "needs_manifest",
    agentNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
  },
];

test("listAttachableSkillDefinitions filters already attached skill keys", () => {
  assert.deepEqual(
    listAttachableSkillDefinitions(skillDefinitions, ["web_search"]),
    [skillDefinitions[1]],
  );
});

test("listAttachableSkillDefinitions only exposes active healthy agent runtime skills", () => {
  assert.deepEqual(
    listAttachableSkillDefinitions(unavailableSkillDefinitions, []).map((definition) => definition.skillKey),
    ["web_search"],
  );
});

test("resolveAttachedSkillBadges preserves attached order and falls back to raw keys", () => {
  assert.deepEqual(
    resolveAttachedSkillBadges(["append_usage_introduction", "custom_skill"], skillDefinitions),
    [
      {
        skillKey: "append_usage_introduction",
        label: "Append Usage Introduction",
        description: "Appends usage instructions to the answer.",
      },
      {
        skillKey: "custom_skill",
        label: "custom_skill",
        description: "",
      },
    ],
  );
});

test("resolveAttachAgentSkillPatch appends new skills and ignores duplicates", () => {
  assert.deepEqual(resolveAttachAgentSkillPatch(["web_search"], "append_usage_introduction"), {
    skills: ["web_search", "append_usage_introduction"],
  });
  assert.equal(resolveAttachAgentSkillPatch(["web_search"], "web_search"), null);
});

test("resolveRemoveAgentSkillPatch removes existing skills and ignores missing keys", () => {
  assert.deepEqual(resolveRemoveAgentSkillPatch(["web_search", "append_usage_introduction"], "web_search"), {
    skills: ["append_usage_introduction"],
  });
  assert.equal(resolveRemoveAgentSkillPatch(["web_search"], "append_usage_introduction"), null);
});
