import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "PresetsPage.vue"), "utf8").replace(/\r\n/g, "\n");
const sourceCoverageTest = readFileSync(resolve(currentDirectory, "../i18n/sourceCoverage.test.ts"), "utf8").replace(/\r\n/g, "\n");

test("PresetsPage loads persisted node presets into a searchable management surface", () => {
  assert.match(componentSource, /import \{ deletePreset, fetchPresets, updatePresetStatus \} from "@\/api\/presets";/);
  assert.match(componentSource, /const presets = ref<PresetDocument\[\]>\(\[\]\);/);
  assert.match(componentSource, /const filteredPresets = computed\(\(\) => filterPresetsForManagement/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="presets-page__search"/);
  assert.match(componentSource, /role="tablist"[\s\S]*class="presets-page__filter-tabs"/);
  assert.match(componentSource, /v-for="option in kindOptions"/);
  assert.match(componentSource, /@click="kindFilter = option\.value"/);
  assert.doesNotMatch(componentSource, /ElSegmented/);
  assert.match(componentSource, /v-for="preset in filteredPresets"/);
  assert.match(componentSource, /preset\.definition\.node\.kind/);
});

test("PresetsPage exposes active, disabled, and delete management actions with local button styling", () => {
  assert.match(componentSource, /fetchPresets\(\{ includeDisabled: true \}\)/);
  assert.match(componentSource, /const confirmingPresetDeleteId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /async function setPresetStatus/);
  assert.match(componentSource, /async function deletePresetFromCatalog/);
  assert.match(componentSource, /updatePresetStatus\(preset\.presetId, status\)/);
  assert.match(componentSource, /deletePreset\(preset\.presetId\)/);
  assert.match(componentSource, /class="presets-page__actions"/);
  assert.match(componentSource, /t\("presets\.enable"\)/);
  assert.match(componentSource, /t\("presets\.disable"\)/);
  assert.match(componentSource, /t\("presets\.delete"\)/);
  assert.match(componentSource, /t\("presets\.confirmDelete"\)/);
  assert.match(componentSource, /\.presets-page__action \{[\s\S]*background:\s*rgba\(255,\s*248,\s*240,\s*0\.96\);/);
  assert.match(componentSource, /\.presets-page__action--danger/);
});

test("PresetsPage participates in i18n source coverage", () => {
  assert.match(sourceCoverageTest, /"src\/pages\/PresetsPage\.vue"/);
});

test("PresetsPage prevents management controls from overflowing narrow shells", () => {
  assert.match(componentSource, /\.presets-page \{[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.presets-page__filter-tabs \{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/);
  assert.match(componentSource, /@media \(max-width:\s*700px\) \{[\s\S]*\.presets-page__refresh \{[\s\S]*width:\s*100%;/);
});

test("PresetsPage uses compact local filter tabs for node type filtering", () => {
  assert.match(componentSource, /\.presets-page__filter-tabs \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.08\);/);
  assert.match(componentSource, /\.presets-page__filter-tab \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.presets-page__filter-tab--active \{[\s\S]*box-shadow:\s*inset 0 0 0 1px rgba\(154,\s*52,\s*18,\s*0\.1\),\s*0 4px 10px rgba\(154,\s*52,\s*18,\s*0\.06\);/);
});

test("PresetsPage uses local short shadows so dense management cards do not stack into bands", () => {
  assert.match(componentSource, /--presets-page-panel-shadow:/);
  assert.match(componentSource, /--presets-page-card-shadow:/);
  assert.match(componentSource, /box-shadow:\s*var\(--presets-page-panel-shadow\);/);
  assert.match(componentSource, /\.presets-page__metric,\n\.presets-page__card \{[\s\S]*box-shadow:\s*var\(--presets-page-card-shadow\);/);
  assert.doesNotMatch(componentSource, /box-shadow:\s*var\(--graphite-shadow-panel\);/);
});
