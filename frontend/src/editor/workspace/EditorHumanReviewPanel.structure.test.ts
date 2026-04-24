import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorHumanReviewPanel.vue"), "utf8");

function assertSourceOrder(first: RegExp, second: RegExp, message: string) {
  const firstMatch = componentSource.match(first);
  const secondMatch = componentSource.match(second);

  assert.ok(firstMatch, `Missing first pattern for order assertion: ${first}`);
  assert.ok(secondMatch, `Missing second pattern for order assertion: ${second}`);
  assert.ok(
    componentSource.indexOf(firstMatch[0]) < componentSource.indexOf(secondMatch[0]),
    message,
  );
}

test("EditorHumanReviewPanel renders an action-first breakpoint task panel", () => {
  assert.match(componentSource, /buildHumanReviewPanelModel/);
  assert.match(componentSource, /class="editor-human-review-panel__action-bar"/);
  assert.match(componentSource, /class="editor-human-review-panel__resume"/);
  assert.match(componentSource, /@click="handleResumeClick"/);
  assert.match(componentSource, /class="editor-human-review-panel__focus"/);
  assert.match(componentSource, /@click="\$emit\('focus-node', currentFocusNodeId\)"/);
  assert.match(componentSource, /class="editor-human-review-panel__summary"/);
  assert.match(componentSource, /\{\{ panelModel\.summaryText \}\}/);
  assert.match(componentSource, /class="editor-human-review-panel__required-section"/);
  assert.match(componentSource, /v-for="row in panelModel\.requiredNow"/);
  assert.match(componentSource, /class="editor-human-review-panel__other-toggle"/);
  assert.match(componentSource, /v-if="otherRowsExpanded && panelModel\.otherRows\.length > 0"/);
  assertSourceOrder(
    /class="editor-human-review-panel__action-bar"/,
    /class="editor-human-review-panel__summary"/,
    "Action bar should appear before summary in source order",
  );
  assertSourceOrder(
    /class="editor-human-review-panel__summary"/,
    /class="editor-human-review-panel__required-section"/,
    "Summary should appear before required section in source order",
  );
  assertSourceOrder(
    /class="editor-human-review-panel__required-section"/,
    /class="editor-human-review-panel__other-toggle"/,
    "Required section should appear before the other toggle in source order",
  );
  assert.doesNotMatch(componentSource, /editor-human-review-panel__run-card/);
  assert.doesNotMatch(componentSource, /Paused Run/);
  assert.doesNotMatch(componentSource, /editor-human-review-panel__footer/);
  assert.doesNotMatch(componentSource, /class="editor-human-review-panel__header"/);
  assert.doesNotMatch(componentSource, /pauseReason/);
});

test("EditorHumanReviewPanel keeps the continue guard message near the action bar", () => {
  assert.match(componentSource, /const resumeGuardMessage = ref<string \| null>\(null\);/);
  assert.match(componentSource, /class="editor-human-review-panel__guard"/);
  assert.match(componentSource, /还有 \$\{remainingEmptyRequiredDraftCount\.value\} 项需要填写/);
});
