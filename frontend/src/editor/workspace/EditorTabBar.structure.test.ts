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

test("EditorTabBar constrains the top chrome to the available editor width", () => {
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*display:\s*inline-flex;[\s\S]*max-width:\s*min\(100%,\s*var\(--editor-tab-strip-max-width\)\);[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*box-sizing:\s*border-box;[\s\S]*display:\s*inline-flex;[\s\S]*width:\s*auto;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*width:\s*fit-content;[\s\S]*max-width:\s*min\(100%,\s*var\(--editor-tab-strip-max-width\)\);/);
});

test("EditorTabBar keeps only the tab strip and a browser-style plus launcher in the top row", () => {
  assert.match(componentSource, /import \{ ElIcon, ElPopover, ElTabPane, ElTabs \} from "element-plus";/);
  assert.match(componentSource, /import \{ Plus \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import EditorTabLauncherPanel from "\.\/EditorTabLauncherPanel\.vue";/);
  assert.match(componentSource, /class="editor-tab-bar__strip"/);
  assert.match(componentSource, /class="editor-tab-bar__add-tab"/);
  assert.match(componentSource, /<ElPopover[\s\S]*trigger="click"[\s\S]*placement="bottom-start"/);
  assert.match(componentSource, /<EditorTabLauncherPanel[\s\S]*@create-new="\$emit\('create-new'\)"/);
  assert.doesNotMatch(componentSource, /editor-tab-bar__controls-dock/);
  assert.doesNotMatch(componentSource, /copy\.run/);
  assert.doesNotMatch(componentSource, /copy\.save/);
});

test("EditorTabBar does not declare or reference the retired toolbar boundary", () => {
  assert.doesNotMatch(componentSource, /activeStateCount/);
  assert.doesNotMatch(componentSource, /isStatePanelOpen/);
  assert.doesNotMatch(componentSource, /toggle-state-panel/);
  assert.doesNotMatch(componentSource, /save-active-graph/);
  assert.doesNotMatch(componentSource, /validate-active-graph/);
  assert.doesNotMatch(componentSource, /import-python-graph/);
  assert.doesNotMatch(componentSource, /export-active-graph/);
  assert.doesNotMatch(componentSource, /run-active-graph/);
  assert.doesNotMatch(componentSource, /selectedTemplateId/);
  assert.doesNotMatch(componentSource, /selectedGraphId/);
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

test("EditorTabBar keeps the plus launcher on the same visual strip as the tabs instead of a second toolbar row", () => {
  assert.match(componentSource, /\.editor-tab-bar__strip \{[\s\S]*display:\s*inline-flex;[\s\S]*max-width:\s*100%;/);
  assert.match(componentSource, /\.editor-tab-bar__strip \{[\s\S]*align-items:\s*center;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*flex:\s*0 1 auto;/);
  assert.match(componentSource, /\.editor-tab-bar__add-tab \{[\s\S]*flex:\s*0 0 auto;/);
});

test("EditorTabBar behaves like a floating card group instead of reserving a full-width header lane", () => {
  assert.match(componentSource, /--editor-tab-strip-max-width:\s*min\(980px,\s*calc\(100vw - var\(--app-sidebar-width\) - 220px\)\);/);
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*pointer-events:\s*auto;/);
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*padding:\s*12px 0 0 12px;/);
  assert.doesNotMatch(componentSource, /editor-action-capsule-desktop-reserve/);
  assert.doesNotMatch(componentSource, /padding:\s*12px calc\(var\(--editor-action-capsule-desktop-reserve\) \+ 12px\) 0 12px;/);
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
