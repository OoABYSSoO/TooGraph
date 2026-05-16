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

test("GraphLibraryPage hosts the editor start actions that used to live on the editor welcome page", () => {
  assert.match(componentSource, /import EditorWelcomeState from "@\/editor\/workspace\/EditorWelcomeState\.vue";/);
  assert.match(componentSource, /ref="pythonGraphImportInput"/);
  assert.match(componentSource, /accept="\.py,text\/x-python,text\/plain"/);
  assert.match(componentSource, /<EditorWelcomeState[\s\S]*@create-new="openBlankEditorGraph"[\s\S]*@import-python-graph="openPythonGraphImportDialog"[\s\S]*@open-template="openEditorTemplate"[\s\S]*@open-graph="openEditorGraph"/);
  assert.match(componentSource, /router\.push\("\/editor\/new"\)/);
  assert.match(componentSource, /router\.push\(`\/editor\/new\?template=\$\{encodeURIComponent\(templateId\)\}`\)/);
  assert.match(componentSource, /router\.push\(`\/editor\/\$\{encodeURIComponent\(graphId\)\}`\)/);
  assert.match(componentSource, /writePersistedEditorWorkspace/);
  assert.match(componentSource, /writePersistedEditorDocumentDraft/);
});
