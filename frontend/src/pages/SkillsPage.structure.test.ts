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
  assert.match(componentSource, /import \{ deleteSkill, fetchSkillCatalog, importSkill, importSkillUpload, updateSkillStatus \} from "@\/api\/skills";/);
  assert.match(componentSource, /const skills = ref<SkillDefinition\[\]>\(\[\]\);/);
  assert.match(componentSource, /const filteredSkills = computed\(\(\) => filterSkillsForManagement/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="skills-page__search"/);
  assert.match(componentSource, /role="tablist"[\s\S]*class="skills-page__filter-tabs"/);
  assert.match(componentSource, /v-for="skill in filteredSkills"/);
  assert.match(componentSource, /skill\.compatibility/);
});

test("SkillsPage surfaces native Skill taxonomy and readiness metadata", () => {
  assert.match(componentSource, /overview\.agentSkills/);
  assert.match(componentSource, /overview\.companionSkills/);
  assert.match(componentSource, /overview\.runtimeReady/);
  assert.match(componentSource, /overview\.needsAttention/);
  assert.match(componentSource, /skill\.targets/);
  assert.match(componentSource, /skill\.kind/);
  assert.match(componentSource, /skill\.mode/);
  assert.match(componentSource, /skill\.scope/);
  assert.match(componentSource, /skill\.permissions/);
  assert.match(componentSource, /skill\.runtimeReady/);
  assert.match(componentSource, /skill\.configured/);
  assert.match(componentSource, /skill\.healthy/);
  assert.match(componentSource, /t\("skills\.targets"\)/);
  assert.match(componentSource, /t\("skills\.permissions"\)/);
});

test("SkillsPage exposes import, status, and delete management actions with local button styling", () => {
  assert.match(componentSource, /const confirmingSkillDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /async function importSkillIntoCatalog/);
  assert.match(componentSource, /async function setSkillStatus/);
  assert.match(componentSource, /async function deleteSkillFromCatalog/);
  assert.match(componentSource, /async function importUploadedSkill/);
  assert.match(componentSource, /importSkill\(skill\.skillKey\)/);
  assert.match(componentSource, /importSkillUpload\(files, relativePaths\)/);
  assert.match(componentSource, /updateSkillStatus\(skill\.skillKey, status\)/);
  assert.match(componentSource, /deleteSkill\(skill\.skillKey\)/);
  assert.match(componentSource, /class="skills-page__actions"/);
  assert.match(componentSource, /ref="skillArchiveInput"/);
  assert.match(componentSource, /ref="skillDirectoryInput"/);
  assert.match(componentSource, /accept="\.zip,application\/zip"/);
  assert.match(componentSource, /webkitdirectory/);
  assert.match(componentSource, /t\("skills\.importArchive"\)/);
  assert.match(componentSource, /t\("skills\.importFolder"\)/);
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
  assert.match(componentSource, /\.skills-page__filter-tabs \{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/);
  assert.match(componentSource, /@media \(max-width:\s*700px\) \{[\s\S]*\.skills-page__refresh \{[\s\S]*width:\s*100%;/);
});

test("SkillsPage replaces the bulky segmented status filter with compact warm tabs", () => {
  assert.doesNotMatch(componentSource, /ElSegmented/);
  assert.match(componentSource, /\.skills-page__filter-tab \{/);
  assert.match(componentSource, /\.skills-page__filter-tab--active \{/);
  assert.match(componentSource, /:class="\{ 'skills-page__filter-tab--active': statusFilter === option\.value \}"/);
});

test("SkillsPage uses local short shadows so dense management cards do not stack into bands", () => {
  assert.match(componentSource, /--skills-page-panel-shadow:/);
  assert.match(componentSource, /--skills-page-card-shadow:/);
  assert.match(componentSource, /box-shadow:\s*var\(--skills-page-panel-shadow\);/);
  assert.match(componentSource, /\.skills-page__metric,\n\.skills-page__card \{[\s\S]*box-shadow:\s*var\(--skills-page-card-shadow\);/);
  assert.doesNotMatch(componentSource, /box-shadow:\s*var\(--graphite-shadow-panel\);/);
});
