import test from "node:test";
import assert from "node:assert/strict";

import {
  listSelectableSkillDefinitions,
  resolveSelectAgentSkillPatch,
} from "./skillPickerModel.ts";
import type { SkillDefinition } from "../../types/skills.ts";

const skillDefinitions: SkillDefinition[] = [
  {
    skillKey: "web_search",
    name: "Web Search",
    description: "Searches the public web.",
    llmInstruction: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text", "json"],
    sideEffects: ["network"],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
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
    llmInstruction: "Use append_usage_introduction only when it is explicitly bound to the LLM node.",
    schemaVersion: "graphite.skill/v1",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text"],
    sideEffects: ["none"],
    runtime: { type: "python", entrypoint: "run.py" },
    health: { type: "none" },
    llmNodeEligibility: "ready",
    llmNodeBlockers: [],
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
    llmNodeEligibility: "needs_manifest",
    llmNodeBlockers: ["Skill manifest is missing a script runtime entrypoint."],
  },
];

test("listSelectableSkillDefinitions exposes active healthy LLM node skills", () => {
  assert.deepEqual(
    listSelectableSkillDefinitions(unavailableSkillDefinitions).map((definition) => definition.skillKey),
    ["web_search", "desktop_companion_profile"],
  );
});

test("resolveSelectAgentSkillPatch replaces the selected skill and creates one instruction block", () => {
  assert.deepEqual(resolveSelectAgentSkillPatch("web_search", "append_usage_introduction", skillDefinitions, {}), {
    skillKey: "append_usage_introduction",
    skillInstructionBlocks: {
      append_usage_introduction: {
        skillKey: "append_usage_introduction",
        title: "Append Usage Introduction skill instruction",
        content: "Use append_usage_introduction only when it is explicitly bound to the LLM node.",
        source: "skill.llmInstruction",
      },
    },
  });
  assert.equal(resolveSelectAgentSkillPatch("web_search", "web_search", skillDefinitions, {}), null);
});

test("resolveSelectAgentSkillPatch clears the selected skill and stale instruction blocks", () => {
  assert.deepEqual(
    resolveSelectAgentSkillPatch("web_search", "", skillDefinitions, {
      web_search: {
        skillKey: "web_search",
        title: "Web Search skill instruction",
        content: "Decide the search query and execute this bound web search skill. Do not summarize the result.",
        source: "skill.llmInstruction",
      },
    }),
    {
      skillKey: "",
      skillInstructionBlocks: {},
    },
  );
});
