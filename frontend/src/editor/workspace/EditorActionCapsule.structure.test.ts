import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorActionCapsule.vue"), "utf8");

test("EditorActionCapsule keeps graph tools compact while preserving Run as the only primary action", () => {
  assert.match(componentSource, /import \{ CircleCheck, CollectionTag, Download, VideoPlay \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElIcon, ElTooltip \} from "element-plus";/);
  assert.match(
    componentSource,
    /class="editor-action-capsule__tools"[\s\S]*class="editor-action-capsule__state-pill"[\s\S]*t\("editor\.statePanel"\)[\s\S]*class="editor-action-capsule__state-pill"[\s\S]*t\("editor\.runActivityPanel"\)[\s\S]*class="editor-action-capsule__run"/,
  );
  assert.match(componentSource, /:class="\{ 'editor-action-capsule__state-pill--active': isStatePanelOpen \}"/);
  assert.match(
    componentSource,
    /:class="\{[\s\S]*'editor-action-capsule__state-pill--active': isRunActivityPanelOpen,[\s\S]*'editor-action-capsule__state-pill--hint': hasRunActivityHint && !isRunActivityPanelOpen,[\s\S]*\}"/,
  );
  assert.match(componentSource, /<span class="editor-action-capsule__state-count">\{\{ activeStateCount \}\}<\/span>/);
  assert.match(componentSource, /class="editor-action-capsule__run-icon"[\s\S]*<VideoPlay \/>/);
  assert.match(componentSource, /@click="\$emit\('toggle-state-panel'\)"/);
  assert.match(componentSource, /@click="\$emit\('toggle-run-activity-panel'\)"/);
  assert.match(componentSource, /@click="\$emit\('run-active-graph'\)"/);
  assert.match(componentSource, /isRunActivityPanelOpen: boolean;/);
  assert.match(componentSource, /hasRunActivityHint: boolean;/);
  assert.match(componentSource, /\(event: "toggle-run-activity-panel"\): void;/);
});

test("EditorActionCapsule renders non-primary graph actions as icon buttons with tooltips", () => {
  assert.match(
    componentSource,
    /<ElTooltip :content="resolvedSaveGraphLabel" placement="bottom">[\s\S]*:aria-label="resolvedSaveGraphLabel"[\s\S]*@click="\$emit\('save-active-graph'\)"/,
  );
  assert.match(componentSource, /const resolvedSaveGraphLabel = computed\(\(\) => props\.saveGraphLabel \?\? t\("editor\.saveGraph"\)\);/);
  assert.match(componentSource, /showSaveAsGraph\?: boolean;/);
  assert.match(componentSource, /saveAsGraphLabel\?: string;/);
  assert.match(
    componentSource,
    /v-if="showSaveAsGraph"[\s\S]*:content="resolvedSaveAsGraphLabel"[\s\S]*:aria-label="resolvedSaveAsGraphLabel"[\s\S]*@click="\$emit\('save-active-graph-as-new'\)"/,
  );
  assert.match(
    componentSource,
    /<ElTooltip :content="t\('editor\.validateGraph'\)" placement="bottom">[\s\S]*:aria-label="t\('editor\.validateGraph'\)"[\s\S]*@click="\$emit\('validate-active-graph'\)"/,
  );
  assert.doesNotMatch(componentSource, /editor\.importPythonGraph/);
  assert.doesNotMatch(componentSource, /import-python-graph/);
  assert.doesNotMatch(componentSource, /<Upload \/>/);
  assert.match(
    componentSource,
    /<ElTooltip :content="t\('editor\.exportPythonGraph'\)" placement="bottom">[\s\S]*:aria-label="t\('editor\.exportPythonGraph'\)"[\s\S]*@click="\$emit\('export-active-graph'\)"/,
  );
  assert.match(
    componentSource,
    /<ElTooltip :content="t\('editor\.saveAsTemplate'\)" placement="bottom">[\s\S]*:aria-label="t\('editor\.saveAsTemplate'\)"[\s\S]*@click="\$emit\('save-active-graph-as-template'\)"/,
  );
  assert.match(componentSource, /\(event: "save-active-graph-as-new"\): void;/);
  assert.match(componentSource, /\(event: "save-active-graph-as-template"\): void;/);
  assert.doesNotMatch(componentSource, /copy\.newGraph/);
});

test("EditorActionCapsule exposes official page-operation affordance ids", () => {
  assert.match(componentSource, /data-virtual-affordance-id="editor\.action\.saveActiveGraph"/);
  assert.match(componentSource, /data-virtual-affordance-id="editor\.action\.validateActiveGraph"/);
  assert.match(componentSource, /data-virtual-affordance-id="editor\.action\.toggleRunActivity"/);
  assert.match(componentSource, /data-virtual-affordance-id="editor\.action\.toggleStatePanel"/);
  assert.match(componentSource, /data-virtual-affordance-id="editor\.action\.runActiveGraph"/);
});

test("EditorActionCapsule styles the state pill state and interactive controls", () => {
  assert.match(
    componentSource,
    /\.editor-action-capsule\s*\{[\s\S]*position:\s*relative;[\s\S]*isolation:\s*isolate;[\s\S]*overflow:\s*hidden;[\s\S]*background:\s*var\(--toograph-glass-bg\);[\s\S]*padding:\s*8px;[\s\S]*box-shadow:\s*var\(--toograph-glass-shadow\),\s*var\(--toograph-glass-highlight\),\s*var\(--toograph-glass-rim\);[\s\S]*backdrop-filter:\s*blur\(28px\) saturate\(1\.65\) contrast\(1\.02\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule::before\s*\{[\s\S]*background:\s*var\(--toograph-glass-specular\),\s*var\(--toograph-glass-lens\);[\s\S]*mix-blend-mode:\s*screen;[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule > \* \{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__state-pill--active\s*\{[\s\S]*border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.44\);[\s\S]*background:\s*rgba\(255,\s*238,\s*222,\s*0\.98\);[\s\S]*color:\s*rgba\(126,\s*46,\s*11,\s*0\.98\);[\s\S]*\}/,
  );
  assert.match(componentSource, /\.editor-action-capsule__state-pill--hint\s*\{[\s\S]*animation:\s*editor-action-capsule-run-activity-pulse/);
  assert.match(componentSource, /@keyframes editor-action-capsule-run-activity-pulse/);
  assert.match(componentSource, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(
    componentSource,
    /\.editor-action-capsule__state-count\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*min-width:\s*22px;[\s\S]*border-radius:\s*999px;[\s\S]*font-weight:\s*700;[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__icon-button,\s*\.editor-action-capsule__state-pill,\s*\.editor-action-capsule__run\s*\{[\s\S]*min-height:\s*40px;/,
  );
  assert.match(componentSource, /\.editor-action-capsule__icon-button\s*\{[\s\S]*width:\s*40px;/);
  assert.match(
    componentSource,
    /\.editor-action-capsule__icon-button:hover\s*\{[\s\S]*border-color:\s*rgba\(193,\s*151,\s*106,\s*0\.34\);[\s\S]*background:\s*rgba\(255,\s*245,\s*232,\s*0\.96\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__state-pill:hover\s*\{[\s\S]*border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.28\);[\s\S]*background:\s*rgba\(255,\s*246,\s*237,\s*0\.98\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__run:hover\s*\{[\s\S]*border-color:\s*rgba\(131,\s*43,\s*13,\s*0\.96\);[\s\S]*background:\s*rgba\(131,\s*43,\s*13,\s*0\.96\);[\s\S]*transform:\s*translateY\(-1px\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__icon-button:focus-visible,\s*\.editor-action-capsule__state-pill:focus-visible,\s*\.editor-action-capsule__run:focus-visible\s*\{[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*0 0 0 3px rgba\(210,\s*162,\s*117,\s*0\.3\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__state-pill--active:hover\s*\{[\s\S]*border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.44\);[\s\S]*background:\s*rgba\(255,\s*238,\s*222,\s*0\.98\);[\s\S]*color:\s*rgba\(126,\s*46,\s*11,\s*0\.98\);[\s\S]*\}/,
  );
});
