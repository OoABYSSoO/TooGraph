import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "SkillsPage.vue"), "utf8");
const skillsApiSource = readFileSync(resolve(currentDirectory, "../api/skills.ts"), "utf8");
const sourceCoverageTest = readFileSync(resolve(currentDirectory, "../i18n/sourceCoverage.test.ts"), "utf8");

test("SkillsPage loads the full skill catalog into a searchable management surface", () => {
  assert.match(skillsApiSource, /export async function fetchSkillCatalog/);
  assert.match(componentSource, /import \{ deleteSkill, fetchSkillCatalog, importSkill, updateSkillStatus \} from "@\/api\/skills";/);
  assert.match(componentSource, /const skills = ref<SkillDefinition\[\]>\(\[\]\);/);
  assert.match(componentSource, /const filteredSkills = computed\(\(\) => filterSkillsForManagement/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="skills-page__search"/);
  assert.match(componentSource, /<ElSegmented[\s\S]*v-model="statusFilter"[\s\S]*:options="statusOptions"/);
  assert.match(componentSource, /v-for="skill in filteredSkills"/);
  assert.match(componentSource, /skill\.compatibility/);
});

test("SkillsPage exposes import, status, and delete management actions with local button styling", () => {
  assert.match(componentSource, /const confirmingSkillDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /async function importSkillIntoCatalog/);
  assert.match(componentSource, /async function setSkillStatus/);
  assert.match(componentSource, /async function deleteSkillFromCatalog/);
  assert.match(componentSource, /importSkill\(skill\.skillKey\)/);
  assert.match(componentSource, /updateSkillStatus\(skill\.skillKey, status\)/);
  assert.match(componentSource, /deleteSkill\(skill\.skillKey\)/);
  assert.match(componentSource, /class="skills-page__actions"/);
  assert.match(componentSource, /t\("skills\.import"\)/);
  assert.match(componentSource, /t\("skills\.enable"\)/);
  assert.match(componentSource, /t\("skills\.disable"\)/);
  assert.match(componentSource, /t\("skills\.delete"\)/);
  assert.match(componentSource, /t\("skills\.confirmDelete"\)/);
  assert.match(componentSource, /\.skills-page__action \{[\s\S]*background:\s*rgba\(255,\s*248,\s*240,\s*0\.96\);/);
  assert.match(componentSource, /\.skills-page__action--danger/);
});

test("SkillsPage participates in i18n source coverage", () => {
  assert.match(sourceCoverageTest, /"src\/pages\/SkillsPage\.vue"/);
});

test("SkillsPage prevents management controls from overflowing narrow shells", () => {
  assert.match(componentSource, /\.skills-page \{[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.skills-page__segments \{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/);
  assert.match(componentSource, /@media \(max-width:\s*700px\) \{[\s\S]*\.skills-page__refresh \{[\s\S]*width:\s*100%;/);
});
