import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "GraphLibraryPage.vue"), "utf8");

test("GraphLibraryPage renders templates and graphs as separate side-by-side columns", () => {
  const templateColumnIndex = componentSource.indexOf('graph-library-page__column--templates');
  const graphColumnIndex = componentSource.indexOf('graph-library-page__column--graphs');

  assert.ok(templateColumnIndex >= 0, "expected a templates column");
  assert.ok(graphColumnIndex >= 0, "expected a graphs column");
  assert.ok(templateColumnIndex < graphColumnIndex, "expected templates before graphs in the DOM");
  assert.match(componentSource, /const filteredColumns = computed\(\(\) => splitGraphLibraryItems\(filteredItems\.value\)\);/);
  assert.match(componentSource, /\.graph-library-page__columns \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(componentSource, /@media \(max-width:\s*980px\) \{[\s\S]*\.graph-library-page__columns \{[\s\S]*grid-template-columns:\s*1fr;/);
});

test("GraphLibraryPage keeps start actions compact instead of repeating the full editor welcome catalog", () => {
  assert.doesNotMatch(componentSource, /import EditorWelcomeState from "@\/editor\/workspace\/EditorWelcomeState\.vue";/);
  assert.match(componentSource, /ref="pythonGraphImportInput"/);
  assert.match(componentSource, /accept="\.py,text\/x-python,text\/plain"/);
  assert.match(componentSource, /class="graph-library-page__quick-actions"/);
  assert.match(componentSource, /@click="openBlankEditorGraph"/);
  assert.match(componentSource, /@click="openPythonGraphImportDialog"/);
  assert.match(componentSource, /router\.push\("\/editor\/new"\)/);
  assert.match(componentSource, /writePersistedEditorWorkspace/);
  assert.match(componentSource, /writePersistedEditorDocumentDraft/);
});

test("GraphLibraryPage makes each management card openable while keeping management actions secondary", () => {
  assert.match(componentSource, /class="graph-library-page__card-open"/);
  assert.match(componentSource, /<button[\s\S]*class="graph-library-page__card-open"/);
  assert.match(componentSource, /@click="openLibraryItem\(item\)"/);
  assert.match(componentSource, /class="graph-library-page__open-hint"/);
  assert.match(componentSource, /@click\.stop/);
  assert.match(componentSource, /function openLibraryItem\(item: GraphLibraryItem\)/);
  assert.match(componentSource, /router\.push\(`\/editor\/\$\{encodeURIComponent\(item\.id\)\}`\)/);
  assert.match(componentSource, /function openTemplateDraft\(template: TemplateRecord\)/);
});
