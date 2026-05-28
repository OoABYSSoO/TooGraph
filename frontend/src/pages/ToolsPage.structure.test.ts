import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "ToolsPage.vue"), "utf8");
const toolsApiSource = readFileSync(resolve(currentDirectory, "../api/tools.ts"), "utf8");
const sourceCoverageTest = readFileSync(resolve(currentDirectory, "../i18n/sourceCoverage.test.ts"), "utf8");

test("ToolsPage loads the full tool catalog into a searchable management surface", () => {
  assert.match(toolsApiSource, /export async function fetchToolCatalog/);
  assert.match(componentSource, /fetchToolCatalog/);
  assert.match(componentSource, /fetchToolFiles/);
  assert.match(componentSource, /const tools = ref<ToolDefinition\[\]>\(\[\]\);/);
  assert.match(componentSource, /const filteredTools = computed\(\(\) => filterToolsForManagement/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="tools-page__search"/);
  assert.match(componentSource, /role="tablist"[\s\S]*class="tools-page__filter-tabs"/);
  assert.match(componentSource, /v-for="tool in filteredTools"/);
});

test("ToolsPage mirrors ActionsPage with a two-column inspector and enabled switch", () => {
  assert.match(componentSource, /class="tools-page__workspace"/);
  assert.match(componentSource, /class="tools-page__selector"/);
  assert.match(componentSource, /class="tools-page__detail"/);
  assert.match(componentSource, /selectedToolKey/);
  assert.match(componentSource, /<ElSwitch[\s\S]*:model-value="tool\.status === 'active'"/);
  assert.match(componentSource, /:disabled="busyToolKey === tool\.toolKey"/);
  assert.match(componentSource, /async function setToolEnabled/);
  assert.match(componentSource, /updateToolStatus\(tool\.toolKey, status\)/);
});

test("ToolsPage exposes my and official source filters", () => {
  assert.match(componentSource, /sourceFilter/);
  assert.match(componentSource, /buildToolSourceOptions/);
  assert.match(componentSource, /t\(`tools\.sourceFilterOptions\.\$\{option\.value\}`\)/);
  assert.match(componentSource, /overview\.userTools/);
  assert.match(componentSource, /overview\.officialTools/);
});

test("ToolsPage exposes read-only Tool package files and user Tool deletion", () => {
  assert.match(componentSource, /fetchToolFiles/);
  assert.match(componentSource, /fetchToolFileContent/);
  assert.match(componentSource, /class="tools-page__file-browser"/);
  assert.match(componentSource, /class="tools-page__file-tree"/);
  assert.match(componentSource, /class="tools-page__file-preview"/);
  assert.match(componentSource, /deleteToolFromCatalog/);
  assert.match(componentSource, /selectedTool\.canManage/);
});

test("ToolsPage exposes upload management actions with local button styling", () => {
  assert.match(componentSource, /const confirmingToolDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /async function importUploadedTool/);
  assert.match(componentSource, /importToolUpload\(files, relativePaths\)/);
  assert.match(componentSource, /ref="toolArchiveInput"/);
  assert.match(componentSource, /ref="toolDirectoryInput"/);
  assert.match(componentSource, /accept="\.zip,application\/zip"/);
  assert.match(componentSource, /webkitdirectory/);
  assert.match(componentSource, /t\("tools\.importArchive"\)/);
  assert.match(componentSource, /t\("tools\.importFolder"\)/);
  assert.match(componentSource, /\.tools-page__action--danger/);
});

test("ToolsPage participates in i18n source coverage", () => {
  assert.match(sourceCoverageTest, /"src\/pages\/ToolsPage\.vue"/);
});
