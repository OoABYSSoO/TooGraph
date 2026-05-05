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
    name: "Web Search",
    description: "Searches the public web.",
    agentInstruction: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
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
    name: "Append Usage Introduction",
    description: "Appends usage instructions to the answer.",
    agentInstruction: "Use append_usage_introduction only when it is explicitly bound to the agent node.",
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
    name: "Desktop Companion Profile",
    kind: "profile",
    mode: "context",
    scope: "global",
  },
  {
    ...skillDefinitions[1],
    skillKey: "needs_configuration",
    name: "Needs Configuration",
    configured: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "unhealthy_skill",
    name: "Unhealthy Skill",
    healthy: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "runtime_pending",
    name: "Runtime Pending",
    runtimeRegistered: false,
  },
  {
    ...skillDefinitions[1],
    skillKey: "disabled_skill",
    name: "Disabled Skill",
    status: "disabled",
  },
  {
    ...skillDefinitions[1],
    skillKey: "needs_manifest",
    name: "Needs Manifest",
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
    ["web_search", "desktop_companion_profile"],
  );
});

test("resolveAttachedSkillBadges preserves attached order and falls back to raw keys", () => {
  assert.deepEqual(
    resolveAttachedSkillBadges(["append_usage_introduction", "custom_skill"], skillDefinitions),
    [
      {
        skillKey: "append_usage_introduction",
        name: "Append Usage Introduction",
        description: "Appends usage instructions to the answer.",
      },
      {
        skillKey: "custom_skill",
        name: "custom_skill",
        description: "",
      },
    ],
  );
});

test("resolveAttachAgentSkillPatch appends new skills and creates instruction blocks", () => {
  assert.deepEqual(resolveAttachAgentSkillPatch(["web_search"], "append_usage_introduction", skillDefinitions, {}), {
    skills: ["web_search", "append_usage_introduction"],
    skillInstructionBlocks: {
      append_usage_introduction: {
        skillKey: "append_usage_introduction",
        title: "Append Usage Introduction skill instruction",
        content: "Use append_usage_introduction only when it is explicitly bound to the agent node.",
        source: "skill.agentInstruction",
      },
    },
  });
  assert.equal(resolveAttachAgentSkillPatch(["web_search"], "web_search", skillDefinitions, {}), null);
});

test("resolveRemoveAgentSkillPatch removes existing skills and instruction blocks", () => {
  assert.deepEqual(
    resolveRemoveAgentSkillPatch(
      ["web_search", "append_usage_introduction"],
      "web_search",
      {
        web_search: {
          skillKey: "web_search",
          title: "Web Search skill instruction",
          content: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
          source: "skill.agentInstruction",
        },
      },
    ),
    {
      skills: ["append_usage_introduction"],
      skillInstructionBlocks: {},
    },
  );
  assert.equal(resolveRemoveAgentSkillPatch(["web_search"], "append_usage_introduction", {}), null);
});
