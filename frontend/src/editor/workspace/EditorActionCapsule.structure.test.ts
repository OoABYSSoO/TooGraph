import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorActionCapsule.vue"), "utf8");

test("EditorActionCapsule keeps graph tools compact while preserving Run as the only primary action", () => {
  assert.match(componentSource, /import \{ ElIcon, ElTooltip \} from "element-plus";/);
  assert.match(
    componentSource,
    /class="editor-action-capsule__tools"[\s\S]*class="editor-action-capsule__state-pill"[\s\S]*class="editor-action-capsule__run"/,
  );
  assert.match(componentSource, /:class="\{ 'editor-action-capsule__state-pill--active': isStatePanelOpen \}"/);
  assert.match(componentSource, /<span class="editor-action-capsule__state-count">\{\{ activeStateCount \}\}<\/span>/);
  assert.match(componentSource, /@click="\$emit\('toggle-state-panel'\)"/);
  assert.match(componentSource, /@click="\$emit\('run-active-graph'\)"/);
});

test("EditorActionCapsule renders non-primary graph actions as icon buttons with tooltips", () => {
  assert.match(
    componentSource,
    /<ElTooltip content="保存图" placement="bottom">[\s\S]*aria-label="保存图"[\s\S]*@click="\$emit\('save-active-graph'\)"/,
  );
  assert.match(
    componentSource,
    /<ElTooltip content="校验图" placement="bottom">[\s\S]*aria-label="校验图"[\s\S]*@click="\$emit\('validate-active-graph'\)"/,
  );
  assert.match(
    componentSource,
    /<ElTooltip content="导入 Python 图" placement="bottom">[\s\S]*aria-label="导入 Python 图"[\s\S]*@click="\$emit\('import-python-graph'\)"/,
  );
  assert.match(
    componentSource,
    /<ElTooltip content="导出 Python 图" placement="bottom">[\s\S]*aria-label="导出 Python 图"[\s\S]*@click="\$emit\('export-active-graph'\)"/,
  );
  assert.doesNotMatch(componentSource, /copy\.newGraph/);
});

test("EditorActionCapsule styles the state pill state and interactive controls", () => {
  assert.match(
    componentSource,
    /\.editor-action-capsule\s*\{[\s\S]*position:\s*relative;[\s\S]*isolation:\s*isolate;[\s\S]*overflow:\s*hidden;[\s\S]*background:\s*var\(--graphite-glass-bg\);[\s\S]*box-shadow:\s*var\(--graphite-glass-shadow\),\s*var\(--graphite-glass-highlight\),\s*var\(--graphite-glass-rim\);[\s\S]*backdrop-filter:\s*blur\(28px\) saturate\(1\.65\) contrast\(1\.02\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule::before\s*\{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\);[\s\S]*mix-blend-mode:\s*screen;[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule > \* \{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__state-pill--active\s*\{[\s\S]*border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.44\);[\s\S]*background:\s*rgba\(255,\s*238,\s*222,\s*0\.98\);[\s\S]*color:\s*rgba\(126,\s*46,\s*11,\s*0\.98\);[\s\S]*\}/,
  );
  assert.match(
    componentSource,
    /\.editor-action-capsule__state-count\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*min-width:\s*22px;[\s\S]*border-radius:\s*999px;[\s\S]*font-weight:\s*700;[\s\S]*\}/,
  );
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
