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
  assert.match(componentSource, /@dblclick(?:\.stop)?="startTabRename\(tab\)"/);
});

test("EditorTabBar keeps the workspace controls on a single horizontal row", () => {
  assert.match(componentSource, /\.editor-tab-bar__controls \{[\s\S]*flex-wrap: nowrap;/);
  assert.match(componentSource, /\.editor-tab-bar__controls \{[\s\S]*overflow-x: auto;/);
});

test("EditorTabBar constrains the top chrome to the available editor width", () => {
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*box-sizing:\s*border-box;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*max-width:\s*100%;/);
});

test("EditorTabBar presents controls as a quiet grouped action dock", () => {
  assert.match(componentSource, /class="editor-tab-bar__controls-dock"/);
  assert.match(componentSource, /\.editor-tab-bar__controls-dock \{[\s\S]*border-radius:\s*18px;[\s\S]*background:\s*rgba\(255,\s*250,\s*242,\s*0\.76\);/);
  assert.match(componentSource, /\.editor-tab-bar__action \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.editor-tab-bar__action--primary \{[\s\S]*background:\s*rgba\(154,\s*52,\s*18,\s*0\.9\);/);
});

test("EditorTabBar exposes browser-like tab interactions", () => {
  assert.match(componentSource, /draggable="true"/);
  assert.match(componentSource, /@auxclick="handleTabAuxClick\(tab, \$event\)"/);
  assert.match(componentSource, /@dragstart="handleTabDragStart\(tab, \$event\)"/);
  assert.match(componentSource, /@dragover\.prevent="handleTabDragOver\(tab, \$event\)"/);
  assert.match(componentSource, /scrollIntoView\(/);
});

test("EditorTabBar is built on Element Plus tabs instead of reka-ui primitives", () => {
  assert.match(componentSource, /import \{[\s\S]*ElTabPane,[\s\S]*ElTabs[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /<ElTabs[\s\S]*type="card"/);
  assert.match(componentSource, /@tab-change="handleTabChange"/);
  assert.match(componentSource, /<ElTabPane[\s\S]*v-for="tab in tabs"/);
  assert.doesNotMatch(componentSource, /from "reka-ui"/);
});

test("EditorTabBar keeps Element Plus card tabs on a single toolbar row", () => {
  assert.match(componentSource, /\.editor-tab-bar__tabs \{[\s\S]*flex:\s*1 1 auto;/);
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*align-items:\s*center;/);
  assert.match(componentSource, /\.editor-tab-bar__controls \{[\s\S]*flex-wrap:\s*nowrap;/);
});

test("EditorTabBar adapts to narrow viewports by moving controls below the tab strip", () => {
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*flex:\s*1 1 520px;/);
  assert.match(componentSource, /\.editor-tab-bar__controls \{[\s\S]*flex:\s*0 1 auto;/);
  assert.match(componentSource, /@media \(max-width:\s*920px\) \{[\s\S]*\.editor-tab-bar__tabs-shell \{[\s\S]*flex-basis:\s*100%;/);
  assert.match(componentSource, /@media \(max-width:\s*920px\) \{[\s\S]*\.editor-tab-bar__controls \{[\s\S]*width:\s*100%;/);
});

test("EditorTabBar wraps the action dock on phone-width editor surfaces instead of clipping controls", () => {
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-tab-bar__controls-dock \{[\s\S]*display:\s*grid;/);
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-tab-bar__controls-dock \{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-tab-bar__select \{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/);
});

test("EditorTabBar keeps the wrapped phone action dock inside its content column", () => {
  assert.match(componentSource, /\.editor-tab-bar__controls-dock \{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-tab-bar__controls \{[\s\S]*flex:\s*1 1 100%;[\s\S]*max-width:\s*100%;/);
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-tab-bar__state-pill,\n\s*\.editor-tab-bar__action \{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /@media \(max-width:\s*640px\) \{[\s\S]*\.editor-tab-bar__action--primary \{[\s\S]*grid-column:\s*3;/);
});

test("EditorTabBar normalizes Element Plus tab spacing with shared size variables", () => {
  assert.match(componentSource, /--editor-tab-width:\s*\d+px;/);
  assert.match(componentSource, /--editor-tab-height:\s*\d+px;/);
  assert.match(componentSource, /--editor-tab-gap:\s*\d+px;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__nav\) \{[\s\S]*gap:\s*var\(--editor-tab-gap\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__nav-wrap\),[\s\S]*padding:\s*\d+px var\(--editor-tab-gap\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\) \{[\s\S]*margin:\s*0 !important;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\) \{[\s\S]*width:\s*var\(--editor-tab-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\) \{[\s\S]*flex:\s*0 0 var\(--editor-tab-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item:nth-child\(2\)\),[\s\S]*padding-left:\s*0 !important;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item:nth-child\(2\)\),[\s\S]*padding-right:\s*0 !important;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*width:\s*var\(--editor-tab-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*height:\s*var\(--editor-tab-height\);/);
});

test("EditorTabBar keeps the warm project palette instead of the default blue Element Plus theme", () => {
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*rgba\(244,\s*237,\s*225/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*border-radius:\s*14px;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\.is-active\) \{/);
});

test("EditorTabBar removes the old lower seam layers and keeps the active tab on one plane", () => {
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tab-shell--active::after \{/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tab-shell--active::before \{/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tabs-shell::before \{/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tabs-shell::after \{/);
});

test("EditorTabBar uses a restrained paper-warm palette instead of heavy gold gradients", () => {
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*background:\s*rgba\(236,\s*219,\s*190,\s*0\.95\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*linear-gradient\(180deg,\s*rgba\(250,\s*242,\s*228,\s*0\.98\)/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*linear-gradient\(180deg,\s*rgba\(255,\s*250,\s*242,\s*1\)/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*color:\s*rgba\(111,\s*52,\s*22,\s*1\);/);
  assert.match(componentSource, /rgba\(208,\s*177,\s*138,\s*0\.\d+\)/);
});
