import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorStatePanel.vue"), "utf8");

test("EditorStatePanel presents the right sidebar as a compact inspector", () => {
  assert.match(componentSource, /editor-state-panel__inspector-header/);
  assert.match(componentSource, /Graph Inspector/);
  assert.match(componentSource, /editor-state-panel__header-count/);
  assert.match(componentSource, /editor-state-panel__quick-action/);
  assert.doesNotMatch(componentSource, /State Panel/);
  assert.match(componentSource, /\.editor-state-panel__inspector-header \{[\s\S]*padding:\s*14px 14px 10px;/);
  assert.match(componentSource, /\.editor-state-panel__quick-action \{[\s\S]*border-radius:\s*999px;/);
});

test("EditorStatePanel uses low-noise state rows with hover-revealed actions", () => {
  assert.match(componentSource, /class="editor-state-panel__state-row"/);
  assert.match(componentSource, /class="editor-state-panel__state-dot"/);
  assert.match(componentSource, /class="editor-state-panel__state-actions"/);
  assert.match(componentSource, /:style="\{ '--state-panel-row-accent': stateDefinition\(row\.key\)\?\.color \?\? '#d97706' \}"/);
  assert.match(componentSource, /\.editor-state-panel__state-row \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.editor-state-panel__state-actions \{[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.editor-state-panel__state-row:hover\s+\.editor-state-panel__state-actions \{[\s\S]*opacity:\s*1;/);
});

test("EditorStatePanel keeps detailed editing inside a soft inspector card", () => {
  assert.match(componentSource, /editor-state-panel__details-card/);
  assert.match(componentSource, /editor-state-panel__details-title/);
  assert.match(componentSource, /\.editor-state-panel__details-card \{[\s\S]*border-radius:\s*22px;[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.72\);/);
  assert.match(componentSource, /\.editor-state-panel__content \{[\s\S]*padding:\s*0 12px 14px;/);
});
