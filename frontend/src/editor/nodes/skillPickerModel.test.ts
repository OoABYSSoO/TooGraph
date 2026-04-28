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
    skillKey: "search_knowledge_base",
    label: "Search Knowledge Base",
    description: "Searches imported knowledge bases.",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text", "knowledge_base"],
    sideEffects: ["knowledge_read"],
    version: "1.0.0",
    targets: ["agent_node"],
    kind: "atomic",
    mode: "tool",
    scope: "node",
    permissions: ["knowledge_read"],
    sourceFormat: "graphite_definition",
    sourceScope: "graphite_managed",
    sourcePath: "/skills/search_knowledge_base",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
    canImport: false,
    compatibility: [],
  },
  {
    skillKey: "append_usage_introduction",
    label: "Append Usage Introduction",
    description: "Appends usage instructions to the answer.",
    inputSchema: [],
    outputSchema: [],
    supportedValueTypes: ["text"],
    sideEffects: ["none"],
    version: "1.0.0",
    targets: ["agent_node"],
    kind: "atomic",
    mode: "tool",
    scope: "node",
    permissions: [],
    sourceFormat: "graphite_definition",
    sourceScope: "graphite_managed",
    sourcePath: "/skills/append_usage_introduction",
    runtimeReady: true,
    runtimeRegistered: true,
    configured: true,
    healthy: true,
    status: "active",
    canManage: true,
    canImport: false,
    compatibility: [],
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
];

test("listAttachableSkillDefinitions filters already attached skill keys", () => {
  assert.deepEqual(
    listAttachableSkillDefinitions(skillDefinitions, ["search_knowledge_base"]),
    [skillDefinitions[1]],
  );
});

test("listAttachableSkillDefinitions only exposes active healthy agent runtime skills", () => {
  assert.deepEqual(
    listAttachableSkillDefinitions(unavailableSkillDefinitions, []).map((definition) => definition.skillKey),
    ["search_knowledge_base"],
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
  assert.deepEqual(resolveAttachAgentSkillPatch(["search_knowledge_base"], "append_usage_introduction"), {
    skills: ["search_knowledge_base", "append_usage_introduction"],
  });
  assert.equal(resolveAttachAgentSkillPatch(["search_knowledge_base"], "search_knowledge_base"), null);
});

test("resolveRemoveAgentSkillPatch removes existing skills and ignores missing keys", () => {
  assert.deepEqual(resolveRemoveAgentSkillPatch(["search_knowledge_base", "append_usage_introduction"], "search_knowledge_base"), {
    skills: ["append_usage_introduction"],
  });
  assert.equal(resolveRemoveAgentSkillPatch(["search_knowledge_base"], "append_usage_introduction"), null);
});
