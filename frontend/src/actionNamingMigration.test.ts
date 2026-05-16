import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const sourceRoot = dirname(fileURLToPath(import.meta.url));

const actionModulePaths = [
  "api/actions.ts",
  "api/actions.test.ts",
  "api/capabilityArtifacts.ts",
  "api/capabilityArtifacts.test.ts",
  "editor/nodes/AgentActionPicker.vue",
  "editor/nodes/AgentActionPicker.structure.test.ts",
  "editor/nodes/actionPickerModel.ts",
  "editor/nodes/actionPickerModel.test.ts",
  "pages/ActionsPage.vue",
  "pages/ActionsPage.structure.test.ts",
  "pages/actionsPageModel.ts",
  "pages/actionsPageModel.test.ts",
  "types/actions.ts",
];

const legacyCurrentActionModulePaths = [
  "api/skills.ts",
  "api/skills.test.ts",
  "api/skillArtifacts.ts",
  "api/skillArtifacts.test.ts",
  "editor/nodes/AgentSkillPicker.vue",
  "editor/nodes/AgentSkillPicker.structure.test.ts",
  "editor/nodes/skillPickerModel.ts",
  "editor/nodes/skillPickerModel.test.ts",
  "pages/SkillsPage.vue",
  "pages/SkillsPage.structure.test.ts",
  "pages/skillsPageModel.ts",
  "pages/skillsPageModel.test.ts",
  "types/skills.ts",
];

test("current node capability frontend modules use Action filenames", () => {
  for (const relativePath of actionModulePaths) {
    assert.equal(existsSync(resolve(sourceRoot, relativePath)), true, `${relativePath} should exist`);
  }

  for (const relativePath of legacyCurrentActionModulePaths) {
    assert.equal(existsSync(resolve(sourceRoot, relativePath)), false, `${relativePath} should be renamed`);
  }
});
