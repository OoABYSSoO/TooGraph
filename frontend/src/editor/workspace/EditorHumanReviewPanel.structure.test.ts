import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorHumanReviewPanel.vue"), "utf8");

test("EditorHumanReviewPanel renders paused run context and editable state drafts", () => {
  assert.match(componentSource, /class="editor-human-review-panel"/);
  assert.doesNotMatch(componentSource, /editor-human-review-panel__collapsed/);
  assert.match(componentSource, /Human Review/);
  assert.match(componentSource, /run\?: RunDetail \| null;/);
  assert.match(componentSource, /document: GraphPayload \| GraphDocument;/);
  assert.match(componentSource, /reviewRows/);
  assert.match(componentSource, /v-for="row in reviewRows"/);
  assert.match(componentSource, /class="editor-human-review-panel__textarea"/);
  assert.match(componentSource, /@input="updateDraft\(row\.key, \(\$event\.target as HTMLTextAreaElement\)\.value\)"/);
  assert.match(componentSource, /@click="\$emit\('resume', buildResumePayload\(\)\)"/);
});
