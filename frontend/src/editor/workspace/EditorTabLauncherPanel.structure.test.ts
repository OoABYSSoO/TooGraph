import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorTabLauncherPanel.vue"), "utf8");

test("EditorTabLauncherPanel offers blank, template, and existing-graph entry points behind the plus launcher", () => {
  assert.match(componentSource, /import WorkspaceSelect from "\.\/WorkspaceSelect\.vue";/);
  assert.match(componentSource, /const expandedSection = ref<"template" \| "graph" \| null>\(null\);/);
  assert.match(componentSource, /@click="\$emit\('create-new'\)"/);
  assert.match(componentSource, /@click="toggleSection\('template'\)"/);
  assert.match(componentSource, /@click="toggleSection\('graph'\)"/);
  assert.match(
    componentSource,
    /<div v-if="expandedSection === 'template'" class="editor-tab-launcher-panel__picker">[\s\S]*<WorkspaceSelect/,
  );
  assert.match(
    componentSource,
    /<div v-if="expandedSection === 'graph'" class="editor-tab-launcher-panel__picker">[\s\S]*<WorkspaceSelect/,
  );
  assert.doesNotMatch(componentSource, /<WorkspaceSelect[^>]*v-if="expandedSection === 'template'"/);
  assert.doesNotMatch(componentSource, /<WorkspaceSelect[^>]*v-if="expandedSection === 'graph'"/);
});

test("EditorTabLauncherPanel keeps the launcher light by using compact cards instead of a full dialog", () => {
  assert.match(componentSource, /class="editor-tab-launcher-panel__entry"/);
  assert.match(componentSource, /\.editor-tab-launcher-panel \{[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 32px\)\);/);
  assert.doesNotMatch(componentSource, /<ElDialog/);
  assert.doesNotMatch(componentSource, /position:\s*fixed;/);
});

test("EditorTabLauncherPanel selection watchers emit and then collapse the expanded section", () => {
  assert.match(
    componentSource,
    /watch\(selectedTemplateId, \(nextValue\) => \{[\s\S]*emit\("create-from-template", nextValue\);[\s\S]*expandedSection\.value = null;[\s\S]*\}\);/,
  );
  assert.match(
    componentSource,
    /watch\(selectedGraphId, \(nextValue\) => \{[\s\S]*emit\("open-graph", nextValue\);[\s\S]*expandedSection\.value = null;[\s\S]*\}\);/,
  );
});
