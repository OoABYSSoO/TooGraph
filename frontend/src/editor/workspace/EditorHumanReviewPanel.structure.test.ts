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
  assert.match(componentSource, /class="editor-human-review-panel__resume-icon"[\s\S]*<VideoPlay \/>/);
  assert.match(componentSource, /@click="handleResumeClick"/);
  assert.match(componentSource, /class="editor-human-review-panel__focus"/);
  assert.match(componentSource, /class="editor-human-review-panel__focus-icon"[\s\S]*<Coordinate \/>/);
  assert.match(componentSource, /@click="\$emit\('focus-node', currentFocusNodeId\)"/);
  assert.match(componentSource, /class="editor-human-review-panel__summary"/);
  assert.match(componentSource, /\{\{ panelModel\.summaryText \}\}/);
  assert.match(componentSource, /class="editor-human-review-panel__produced-section"/);
  assert.match(componentSource, /v-for="row in panelModel\.producedRows"/);
  assert.match(componentSource, /class="editor-human-review-panel__required-section"/);
  assert.match(componentSource, /v-for="row in panelModel\.requiredNow"/);
  assert.match(componentSource, /class="editor-human-review-panel__context-section"/);
  assert.match(componentSource, /v-for="row in panelModel\.contextRows"/);
  assert.match(componentSource, /class="editor-human-review-panel__other-toggle"/);
  assert.match(componentSource, /v-if="otherRowsExpanded && panelModel\.otherRows\.length > 0"/);
  assertSourceOrder(
    /class="editor-human-review-panel__action-bar"/,
    /class="editor-human-review-panel__summary"/,
    "Action bar should appear before summary in source order",
  );
  assertSourceOrder(
    /class="editor-human-review-panel__summary"/,
    /class="editor-human-review-panel__produced-section"/,
    "Summary should appear before produced section in source order",
  );
  assertSourceOrder(
    /class="editor-human-review-panel__produced-section"/,
    /class="editor-human-review-panel__required-section"/,
    "Produced section should appear before required section in source order",
  );
  assertSourceOrder(
    /class="editor-human-review-panel__required-section"/,
    /class="editor-human-review-panel__context-section"/,
    "Required section should appear before context section in source order",
  );
  assertSourceOrder(
    /class="editor-human-review-panel__context-section"/,
    /class="editor-human-review-panel__other-toggle"/,
    "Context section should appear before the other toggle in source order",
  );
  assert.doesNotMatch(componentSource, /editor-human-review-panel__run-card/);
  assert.doesNotMatch(componentSource, /Paused Run/);
  assert.doesNotMatch(componentSource, /editor-human-review-panel__footer/);
  assert.doesNotMatch(componentSource, /class="editor-human-review-panel__header"/);
  assert.doesNotMatch(componentSource, /pauseReason/);
});

test("EditorHumanReviewPanel keeps the resume button aligned with the warm run action style", () => {
  assert.match(componentSource, /import \{ ArrowRight, Coordinate, VideoPlay \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /\.editor-human-review-panel__resume \{[\s\S]*display:\s*inline-flex;/);
  assert.match(componentSource, /\.editor-human-review-panel__resume \{[\s\S]*background:\s*rgba\(154,\s*52,\s*18,\s*0\.92\);/);
  assert.doesNotMatch(componentSource, /\.editor-human-review-panel__resume \{[\s\S]*background:\s*#d97706;/);
});

test("EditorHumanReviewPanel renders the focus action as a quiet secondary locator button", () => {
  assert.match(componentSource, /\.editor-human-review-panel__focus \{[\s\S]*display:\s*inline-flex;/);
  assert.match(componentSource, /\.editor-human-review-panel__focus \{[\s\S]*background:\s*rgba\(255,\s*250,\s*242,\s*0\.68\);/);
  assert.match(componentSource, /\.editor-human-review-panel__focus-icon \{[\s\S]*font-size:\s*0\.9rem;/);
});

test("EditorHumanReviewPanel keeps the continue guard message near the action bar", () => {
  assert.match(componentSource, /const resumeGuardMessage = ref<string \| null>\(null\);/);
  assert.match(componentSource, /class="editor-human-review-panel__guard"/);
  assert.match(componentSource, /resumeGuardMessage\.value = t\("humanReview\.guard", \{ count: remainingEmptyRequiredDraftCount\.value \}\);/);
});

test("EditorHumanReviewPanel does not offer collapse while a graph is paused for human review", () => {
  assert.match(componentSource, /const isPausedReview = computed\(\(\) => props\.run\?\.status === "awaiting_human"\);/);
  assert.match(componentSource, /v-if="!isPausedReview"/);
  assert.match(componentSource, /:aria-label="t\('humanReview\.collapse'\)"/);
});

test("EditorHumanReviewPanel uses the shared right-side glass inspector surface", () => {
  assert.match(componentSource, /\.editor-human-review-panel \{[^}]*box-sizing:\s*border-box;/);
  assert.match(componentSource, /\.editor-human-review-panel \{[^}]*width:\s*100%;/);
  assert.match(componentSource, /\.editor-human-review-panel \{[\s\S]*padding:\s*12px;/);
  assert.match(componentSource, /\.editor-human-review-panel \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.editor-human-review-panel__surface \{[\s\S]*border:\s*1px solid var\(--graphite-glass-border\);/);
  assert.match(
    componentSource,
    /\.editor-human-review-panel__surface \{[\s\S]*border-radius:\s*28px;[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\),\s*var\(--graphite-glass-bg-strong\);/,
  );
  assert.match(componentSource, /\.editor-human-review-panel__surface \{[\s\S]*background-blend-mode:\s*screen,\s*screen,\s*normal;/);
  assert.match(
    componentSource,
    /\.editor-human-review-panel__surface \{[\s\S]*box-shadow:\s*var\(--graphite-glass-shadow\),\s*var\(--graphite-glass-highlight\),\s*var\(--graphite-glass-rim\);/,
  );
  assert.match(componentSource, /\.editor-human-review-panel__surface \{[\s\S]*backdrop-filter:\s*blur\(34px\) saturate\(1\.7\) contrast\(1\.02\);/);
});
