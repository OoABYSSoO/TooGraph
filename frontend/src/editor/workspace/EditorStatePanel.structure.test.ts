import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorStatePanel.vue"), "utf8");

test("EditorStatePanel presents the right sidebar as a compact inspector", () => {
  assert.doesNotMatch(componentSource, /editor-state-panel__collapsed/);
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
  assert.match(componentSource, /expandedStateKeys/);
  assert.match(componentSource, /@click="toggleStateRow\(row\.key\)"/);
  assert.match(componentSource, /v-if="isStateRowExpanded\(row\.key\)"/);
  assert.match(componentSource, /class="editor-state-panel__expand-indicator"/);
  assert.match(componentSource, /:class="\{ 'editor-state-panel__expand-indicator--open': isStateRowExpanded\(row\.key\) \}"/);
  assert.match(componentSource, /<ArrowDown \/>/);
  assert.match(componentSource, /:style="\{ '--state-panel-row-accent': stateDefinition\(row\.key\)\?\.color \?\? '#d97706' \}"/);
  assert.match(componentSource, /\.editor-state-panel__state-row \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.18\);/);
  assert.match(componentSource, /\.editor-state-panel__state-row \{[\s\S]*box-shadow:[\s\S]*0 14px 30px rgba\(60,\s*41,\s*20,\s*0\.08\)/);
  assert.match(componentSource, /\.editor-state-panel__state-row:hover \{[\s\S]*border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.26\);/);
  assert.match(componentSource, /\.editor-state-panel__expand-indicator--open \{[\s\S]*transform:\s*rotate\(180deg\);/);
  assert.match(componentSource, /\.editor-state-panel__state-row-head \{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(componentSource, /\.editor-state-panel__state-copy \{[\s\S]*display:\s*flex;/);
  assert.doesNotMatch(componentSource, /class="editor-state-panel__card-key"/);
  assert.doesNotMatch(componentSource, /\{\{ row\.key \}\}/);
  assert.match(componentSource, /\{\{ row\.readerCount \}\}r/);
  assert.match(componentSource, /\{\{ row\.writerCount \}\}w/);
  assert.match(componentSource, /\.editor-state-panel__state-counts \{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(componentSource, /\.editor-state-panel__state-actions \{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.doesNotMatch(componentSource, /\.editor-state-panel__state-actions \{[\s\S]*opacity:\s*0;/);
  assert.doesNotMatch(componentSource, /\.editor-state-panel__state-row:hover\s+\.editor-state-panel__state-actions/);
});

test("EditorStatePanel deletes states through the same two-click confirm pattern as node actions", () => {
  assert.match(componentSource, /import \{ ElIcon, ElInput, ElOption, ElPopover, ElSelect \} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*Check[\s\S]*Delete[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /const activeStateDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const stateDeleteConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /function startStateDeleteConfirmWindow\(stateKey: string\)/);
  assert.match(componentSource, /function clearStateDeleteConfirmState\(\)/);
  assert.match(componentSource, /function handleStateDeleteActionClick\(stateKey: string\)/);
  assert.match(componentSource, /function confirmStateDelete\(stateKey: string\)/);
  assert.match(componentSource, /activeStateDeleteKey\.value === stateKey[\s\S]*confirmStateDelete\(stateKey\);/);
  assert.match(componentSource, /data-state-delete-surface="true"/);
  assert.match(componentSource, /:class="\{ 'editor-state-panel__card-delete--confirm': isStateDeleteConfirmOpen\(row\.key\) \}"/);
  assert.match(componentSource, /@click\.stop="handleStateDeleteActionClick\(row\.key\)"/);
  assert.match(componentSource, /<ElIcon v-if="isStateDeleteConfirmOpen\(row\.key\)" aria-hidden="true"><Check \/><\/ElIcon>/);
  assert.match(componentSource, /<div class="editor-state-panel__confirm-hint editor-state-panel__confirm-hint--delete">Delete state\?<\/div>/);
  assert.match(componentSource, /\.editor-state-panel__card-delete--confirm,\n\.editor-state-panel__card-delete--confirm:hover,\n\.editor-state-panel__card-delete--confirm:focus-visible \{[\s\S]*background:\s*rgb\(185,\s*28,\s*28\);/);
});

test("EditorStatePanel keeps detailed editing inside a soft inspector card", () => {
  assert.match(componentSource, /editor-state-panel__details-card/);
  assert.match(componentSource, /editor-state-panel__details-title/);
  assert.match(componentSource, /<ElInput[\s\S]*aria-label="State key"[\s\S]*<ElInput[\s\S]*aria-label="State name"[\s\S]*<ElSelect[\s\S]*aria-label="State type"[\s\S]*<ElSelect[\s\S]*aria-label="State color"[\s\S]*<ElInput[\s\S]*aria-label="State description"[\s\S]*<StateDefaultValueEditor/);
  assert.match(componentSource, /function stateColorOptions\(stateKey: string\) \{[\s\S]*resolveStateColorOptions\(stateDefinition\(stateKey\)\?\.color \?\? ""\)/);
  assert.match(componentSource, /class="editor-state-panel__color-select graphite-select"/);
  assert.match(componentSource, /popper-class="graphite-select-popper editor-state-panel__select-popper"/);
  assert.match(componentSource, /class="editor-state-panel__color-select-value"/);
  assert.match(componentSource, /class="editor-state-panel__color-dot" :style="selectedStateColorStyle\(row\.key\)"/);
  assert.match(componentSource, /v-for="option in stateColorOptions\(row\.key\)"/);
  assert.match(componentSource, /class="editor-state-panel__color-option"/);
  assert.match(componentSource, /\.editor-state-panel__details-card \{[\s\S]*border-radius:\s*22px;[\s\S]*background:\s*rgba\(255,\s*252,\s*247,\s*0\.94\);/);
  assert.match(componentSource, /\.editor-state-panel__field-grid \{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*150px\),\s*1fr\)\);/);
  assert.match(componentSource, /\.editor-state-panel__content \{[\s\S]*overflow-x:\s*hidden;/);
  assert.match(componentSource, /\.editor-state-panel__content \{[\s\S]*scrollbar-gutter:\s*stable;/);
  assert.match(componentSource, /\.editor-state-panel__content \{[\s\S]*padding:\s*0 12px 14px;/);
});
