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
