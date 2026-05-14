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
  assert.match(componentSource, /fetchSkillCatalog/);
  assert.match(componentSource, /fetchSkillFiles/);
  assert.match(componentSource, /const skills = ref<SkillDefinition\[\]>\(\[\]\);/);
  assert.match(componentSource, /const filteredSkills = computed\(\(\) => filterSkillsForManagement/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="skills-page__search"/);
  assert.match(componentSource, /role="tablist"[\s\S]*class="skills-page__filter-tabs"/);
  assert.match(componentSource, /v-for="skill in filteredSkills"/);
  assert.doesNotMatch(componentSource, /skill\.compatibility/);
  assert.doesNotMatch(componentSource, /skills\.compatibility/);
});

test("SkillsPage uses a two-column inspector with a compact enabled Skill list", () => {
  assert.match(componentSource, /class="skills-page__workspace"/);
  assert.match(componentSource, /class="skills-page__selector"/);
  assert.match(componentSource, /class="skills-page__detail"/);
  assert.match(componentSource, /selectedSkillKey/);
  assert.match(componentSource, /<ElSwitch[\s\S]*:model-value="skill\.status === 'active'"/);
  assert.match(componentSource, /:disabled="actionSkillKey === skill\.skillKey"/);
  assert.doesNotMatch(componentSource, /!skill\.canManage \|\| actionSkillKey/);
  assert.doesNotMatch(componentSource, /<details[\s\S]*class="skills-page__card"/);
});

test("SkillsPage exposes a read-only Skill package file browser", () => {
  assert.match(componentSource, /fetchSkillFiles/);
  assert.match(componentSource, /fetchSkillFileContent/);
  assert.match(componentSource, /class="skills-page__file-browser"/);
  assert.match(componentSource, /class="skills-page__file-tree"/);
  assert.match(componentSource, /class="skills-page__file-preview"/);
  assert.match(componentSource, /selectedFilePath/);
});

test("SkillsPage surfaces Skill capability metadata without internal runtime status fields", () => {
  assert.match(componentSource, /overview\.visibleSkills/);
  assert.doesNotMatch(componentSource, /overview\.runtimeReady/);
  assert.doesNotMatch(componentSource, /overview\.runtimeRegistered/);
  assert.doesNotMatch(componentSource, /overview\.needsAttention/);
  assert.doesNotMatch(componentSource, /capabilityPolicyOriginEntries/);
  assert.doesNotMatch(componentSource, /selectedSkill\.kind/);
  assert.doesNotMatch(componentSource, /selectedSkill\.mode/);
  assert.doesNotMatch(componentSource, /selectedSkill\.scope/);
  assert.match(componentSource, /selectedSkill\.permissions/);
  assert.match(componentSource, /selectedSkill\.stateInputSchema/);
  assert.match(componentSource, /t\("skills\.stateInputSchema"\)/);
  assert.match(componentSource, /t\("skills\.llmInputSchema"\)/);
  assert.match(componentSource, /t\("skills\.stateOutputSchema"\)/);
  assert.doesNotMatch(componentSource, /selectedSkill\.runtimeReady/);
  assert.doesNotMatch(componentSource, /selectedSkill\.runtimeRegistered/);
  assert.doesNotMatch(componentSource, /selectedSkill\.runtime\.type/);
  assert.doesNotMatch(componentSource, /selectedSkill\.runtime\.entrypoint/);
  assert.doesNotMatch(componentSource, /selectedSkill\.configured/);
  assert.doesNotMatch(componentSource, /selectedSkill\.healthy/);
  assert.doesNotMatch(componentSource, /selectedSkill\.llmNodeEligibility/);
  assert.doesNotMatch(componentSource, /selectedSkill\.llmNodeBlockers/);
  assert.doesNotMatch(componentSource, /t\("skills\.capabilityPolicy"\)/);
  assert.match(componentSource, /t\("skills\.permissions"\)/);
  assert.doesNotMatch(componentSource, /t\("skills\.runtimeReady"\)/);
  assert.doesNotMatch(componentSource, /t\("skills\.runtimeRegistered"\)/);
  assert.doesNotMatch(componentSource, /t\("skills\.runtimePending"\)/);
  assert.doesNotMatch(componentSource, /t\("skills\.runtimeNotRegistered"\)/);
  assert.doesNotMatch(componentSource, /t\("skills\.llmNodeEligibility"\)/);
  assert.doesNotMatch(componentSource, /t\("skills\.llmNodeBlockers"\)/);
});

test("SkillsPage avoids legacy per-Skill capability policy controls", () => {
  assert.doesNotMatch(componentSource, /class="skills-page__policy-grid"/);
  assert.doesNotMatch(componentSource, /class="skills-page__policy-row"/);
  assert.doesNotMatch(componentSource, /class="skills-page__policy-control"/);
  assert.doesNotMatch(componentSource, /updateSkillCapabilityPolicy/);
  assert.doesNotMatch(componentSource, /policyActionKey/);
  assert.doesNotMatch(componentSource, /setSkillCapabilityPolicy/);
  assert.doesNotMatch(componentSource, /capabilityPolicySwitchLabel/);
  assert.doesNotMatch(componentSource, /requiresApproval/);
  assert.doesNotMatch(componentSource, /formatCapabilityPolicy/);
});

test("SkillsPage exposes upload, status, and delete management actions with local button styling", () => {
  assert.match(componentSource, /const confirmingSkillDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /async function setSkillEnabled/);
  assert.match(componentSource, /async function setSkillStatus/);
  assert.match(componentSource, /async function deleteSkillFromCatalog/);
  assert.match(componentSource, /async function importUploadedSkill/);
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
  assert.match(componentSource, /\.skills-page__metric,\r?\n\.skills-page__selector,\r?\n\.skills-page__detail \{[\s\S]*box-shadow:\s*var\(--skills-page-card-shadow\);/);
  assert.doesNotMatch(componentSource, /box-shadow:\s*var\(--toograph-shadow-panel\);/);
});
