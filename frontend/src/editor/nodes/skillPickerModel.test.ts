import test from "node:test";
import assert from "node:assert/strict";

import { listAttachableSkillDefinitions, resolveAttachedSkillBadges } from "./skillPickerModel.ts";
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
    sourceFormat: "graphite_definition",
    sourceScope: "graphite_managed",
    sourcePath: "/skills/search_knowledge_base",
    runtimeRegistered: true,
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
    sourceFormat: "graphite_definition",
    sourceScope: "graphite_managed",
    sourcePath: "/skills/append_usage_introduction",
    runtimeRegistered: true,
    status: "active",
    canManage: true,
    canImport: false,
    compatibility: [],
  },
];

test("listAttachableSkillDefinitions filters already attached skill keys", () => {
  assert.deepEqual(
    listAttachableSkillDefinitions(skillDefinitions, ["search_knowledge_base"]),
    [skillDefinitions[1]],
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
