import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorStatePanel.vue"), "utf8").replace(/\r\n/g, "\n");

test("EditorStatePanel presents the right sidebar as a compact inspector", () => {
  assert.doesNotMatch(componentSource, /editor-state-panel__collapsed/);
  assert.match(componentSource, /class="editor-state-panel__surface"/);
  assert.match(componentSource, /editor-state-panel__inspector-header/);
  assert.match(componentSource, /t\("statePanel\.title"\)/);
  assert.match(componentSource, /editor-state-panel__header-count/);
  assert.match(componentSource, /editor-state-panel__quick-action/);
  assert.doesNotMatch(componentSource, /State Panel/);
  assert.match(componentSource, /\.editor-state-panel \{[\s\S]*padding:\s*12px;/);
  assert.match(componentSource, /\.editor-state-panel \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.editor-state-panel__surface \{[\s\S]*border:\s*1px solid var\(--graphite-glass-border\);/);
  assert.match(
    componentSource,
    /\.editor-state-panel__surface \{[\s\S]*border-radius:\s*28px;[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\),\s*var\(--graphite-glass-bg-strong\);/,
  );
  assert.match(componentSource, /\.editor-state-panel__surface \{[\s\S]*background-blend-mode:\s*screen,\s*screen,\s*normal;/);
  assert.match(
    componentSource,
    /\.editor-state-panel__surface \{[\s\S]*box-shadow:\s*var\(--graphite-glass-shadow\),\s*var\(--graphite-glass-highlight\),\s*var\(--graphite-glass-rim\);/,
  );
  assert.match(componentSource, /\.editor-state-panel__surface \{[\s\S]*backdrop-filter:\s*blur\(34px\) saturate\(1\.7\) contrast\(1\.02\);/);
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
  assert.match(componentSource, /import \{ computed, onBeforeUnmount, ref, watch \} from "vue";/);
  assert.match(componentSource, /import \{ ElIcon, ElInput, ElOption, ElPopover, ElSelect \} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*Check[\s\S]*Delete[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /const activeStateDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const stateDeleteConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /watch\(\s*\(\) => Object\.keys\(props\.document\.state_schema\)\.join\("\\u0000"\)/);
  assert.match(componentSource, /if \(activeStateDeleteKey\.value && !props\.document\.state_schema\[activeStateDeleteKey\.value\]\) \{/);
  assert.match(componentSource, /clearStateDeleteConfirmState\(\);/);
  assert.match(componentSource, /function startStateDeleteConfirmWindow\(stateKey: string\)/);
  assert.match(componentSource, /function clearStateDeleteConfirmState\(\)/);
  assert.match(componentSource, /function handleStateDeleteActionClick\(stateKey: string\)/);
  assert.match(componentSource, /function confirmStateDelete\(stateKey: string\)/);
  assert.match(componentSource, /activeStateDeleteKey\.value === stateKey[\s\S]*confirmStateDelete\(stateKey\);/);
  assert.match(componentSource, /data-state-delete-surface="true"/);
  assert.match(componentSource, /target instanceof Element && target\.closest\("\[data-state-delete-surface='true'\]"\)/);
  assert.match(componentSource, /:class="\{ 'editor-state-panel__card-delete--confirm': isStateDeleteConfirmOpen\(row\.key\) \}"/);
  assert.match(componentSource, /placement="top-end"/);
  assert.match(componentSource, /@click\.stop="handleStateDeleteActionClick\(row\.key\)"/);
  assert.match(componentSource, /<ElIcon v-if="isStateDeleteConfirmOpen\(row\.key\)" aria-hidden="true"><Check \/><\/ElIcon>/);
  assert.match(componentSource, /<div class="editor-state-panel__confirm-hint editor-state-panel__confirm-hint--delete">\{\{ t\("statePanel\.deleteStateQuestion"\) \}\}<\/div>/);
  assert.match(componentSource, /\.editor-state-panel__card-delete--confirm,\n\.editor-state-panel__card-delete--confirm:hover,\n\.editor-state-panel__card-delete--confirm:focus-visible \{[\s\S]*background:\s*rgb\(185,\s*28,\s*28\);/);
});

test("EditorStatePanel keeps detailed editing inside a soft inspector card", () => {
  assert.match(componentSource, /editor-state-panel__details-card/);
  assert.match(componentSource, /editor-state-panel__details-title/);
  assert.match(componentSource, /<ElInput[\s\S]*:aria-label="t\('nodeCard\.name'\)"[\s\S]*<ElSelect[\s\S]*:aria-label="t\('nodeCard\.type'\)"[\s\S]*<ElSelect[\s\S]*:aria-label="t\('nodeCard\.color'\)"[\s\S]*<ElInput[\s\S]*:aria-label="t\('nodeCard\.description'\)"[\s\S]*<StateDefaultValueEditor/);
  assert.doesNotMatch(componentSource, /:aria-label="t\('nodeCard\.key'\)"/);
  assert.doesNotMatch(componentSource, /commitStateRename/);
  assert.doesNotMatch(componentSource, /@change="commitStateRename/);
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
  assert.match(componentSource, /\.editor-state-panel__content \{[\s\S]*padding:\s*0 2px 2px;/);
});

test("EditorStatePanel adds a collapsed run timeline section to each expanded state card", () => {
  assert.match(componentSource, /run\?: RunDetail \| null;/);
  assert.match(componentSource, /buildStatePanelViewModel\(props\.document,\s*props\.run \?\? null\)/);
  assert.match(componentSource, /class="editor-state-panel__timeline-toggle"/);
  assert.match(componentSource, /t\("statePanel\.timeline"\)/);
  assert.match(componentSource, /timelineSummary/);
  assert.match(componentSource, /timelineEntries/);
  assert.match(componentSource, /toggleTimelineSection\(row\.key\)/);
  assert.match(componentSource, /isTimelineSectionExpanded\(row\.key\)/);
  assert.match(componentSource, /editor-state-panel__timeline-entry-value-change/);
  assert.match(componentSource, /\.editor-state-panel__timeline \{[\s\S]*border-top:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.12\);/);
});
