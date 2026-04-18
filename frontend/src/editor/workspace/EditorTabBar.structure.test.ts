import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorTabBar.vue"), "utf8");

test("EditorTabBar keeps the close control outside the tab activation button", () => {
  assert.match(componentSource, /editor-tab-bar__tab-activate/);
  assert.doesNotMatch(
    componentSource,
    /class="editor-tab-bar__tab"[\s\S]*class="editor-tab-bar__close"/,
  );
});

test("EditorTabBar renames graphs inline from the tab strip instead of a separate toolbar control", () => {
  assert.doesNotMatch(componentSource, /editor-tab-bar__graph-name/);
  assert.match(componentSource, /editor-tab-bar__tab-name-input/);
  assert.match(componentSource, /@dblclick="startTabRename\(tab\)"/);
});

test("EditorTabBar keeps the workspace controls on a single horizontal row", () => {
  assert.match(componentSource, /\.editor-tab-bar__controls \{[\s\S]*flex-wrap: nowrap;/);
  assert.match(componentSource, /\.editor-tab-bar__controls \{[\s\S]*overflow-x: auto;/);
});

test("EditorTabBar exposes browser-like tab interactions", () => {
  assert.match(componentSource, /draggable="true"/);
  assert.match(componentSource, /@auxclick="handleTabAuxClick\(tab, \$event\)"/);
  assert.match(componentSource, /@dragstart="handleTabDragStart\(tab, \$event\)"/);
  assert.match(componentSource, /@dragover\.prevent="handleTabDragOver\(tab, \$event\)"/);
  assert.match(componentSource, /scrollIntoView\(/);
});

test("EditorTabBar avoids trapezoid clipping and rounds only the active tab top edge", () => {
  assert.doesNotMatch(componentSource, /clip-path:\s*polygon/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*border-radius:\s*14px 14px 0 0;/);
});

test("EditorTabBar keeps the tab rail on the warm workspace palette", () => {
  assert.doesNotMatch(componentSource, /rgba\(226,\s*234,\s*244/);
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*rgba\(255,\s*250,\s*241/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*background:/);
});

test("EditorTabBar lets the active tab bridge into the content plane", () => {
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*z-index:\s*2;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*border-bottom:\s*none;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active::before \{/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active::after \{/);
});

test("EditorTabBar uses one shared rail band and tab body height for every tab state", () => {
  assert.match(componentSource, /--editor-tab-rail-band-size:\s*\d+px;/);
  assert.match(componentSource, /--editor-tab-body-height:\s*\d+px;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*padding:\s*var\(--editor-tab-rail-band-size\) 0;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*height:\s*var\(--editor-tab-body-height\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*height:\s*var\(--editor-tab-body-height\);/);
});

test("EditorTabBar keeps inactive tabs full-width while only revealing their shell on hover", () => {
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*min-width:\s*var\(--editor-tab-min-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*border:\s*none;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:not\(\.editor-tab-bar__tab-shell--active\):hover \{[\s\S]*border-radius:\s*12px;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:not\(\.editor-tab-bar__tab-shell--active\):hover \{[\s\S]*background:/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:not\(\.editor-tab-bar__tab-shell--active\)::before \{/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:hover \+ \.editor-tab-bar__tab-shell::before \{/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \+ \.editor-tab-bar__tab-shell::before \{/);
});
