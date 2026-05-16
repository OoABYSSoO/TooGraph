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

test("EditorTabBar prioritizes dirty state over the close control until hover", () => {
  assert.match(componentSource, /<span v-if="tab\.dirty" class="editor-tab-bar__dirty-dot" \/>/);
  assert.match(componentSource, /class="editor-tab-bar__close"/);
  assert.doesNotMatch(componentSource, /editor-tab-bar__close--visible/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tab-shell--active \.editor-tab-bar__dirty-dot/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:hover \.editor-tab-bar__dirty-dot,[\s\S]*\.editor-tab-bar__tab-shell:focus-within \.editor-tab-bar__dirty-dot \{[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.editor-tab-bar__close \{[\s\S]*opacity:\s*0;[\s\S]*pointer-events:\s*none;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:hover \.editor-tab-bar__close,[\s\S]*\.editor-tab-bar__tab-shell:focus-within \.editor-tab-bar__close \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell:hover \.editor-tab-bar__close,[\s\S]*\.editor-tab-bar__tab-shell:focus-within \.editor-tab-bar__close \{[\s\S]*pointer-events:\s*auto;/);
});

test("EditorTabBar renames graphs inline from the tab strip instead of a separate toolbar control", () => {
  assert.doesNotMatch(componentSource, /editor-tab-bar__graph-name/);
  assert.match(componentSource, /editor-tab-bar__tab-name-input/);
  assert.match(componentSource, /@dblclick(?:\.stop)?="startTabRename\(tab\)"/);
});

test("EditorTabBar constrains the top chrome to the available editor width", () => {
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*display:\s*flex;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*box-sizing:\s*border-box;[\s\S]*display:\s*flex;[\s\S]*width:\s*100%;/);
  assert.match(componentSource, /\.editor-tab-bar__strip \{[\s\S]*display:\s*flex;[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*width:\s*auto;[\s\S]*max-width:\s*var\(--editor-tab-strip-max-width\);/);
});

test("EditorTabBar keeps only the tab strip and a browser-style plus launcher in the top row", () => {
  assert.match(componentSource, /import \{ ElIcon, ElPopover, ElTabPane, ElTabs \} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*Plus[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import EditorTabLauncherPanel from "\.\/EditorTabLauncherPanel\.vue";/);
  assert.match(componentSource, /class="editor-tab-bar__strip"/);
  assert.match(componentSource, /class="editor-tab-bar__add-tab"/);
  assert.match(componentSource, /<ElPopover[\s\S]*trigger="click"[\s\S]*placement="bottom-start"/);
  assert.match(componentSource, /<EditorTabLauncherPanel[\s\S]*@create-new="handleLauncherCreateNew"/);
  assert.match(componentSource, /@import-python-graph="handleLauncherImportPythonGraph"/);
  assert.match(componentSource, /@open-graph-replay-debug="handleLauncherOpenGraphReplayDebug"/);
  assert.doesNotMatch(componentSource, /editor-tab-bar__controls-dock/);
  assert.doesNotMatch(componentSource, /copy\.run/);
  assert.doesNotMatch(componentSource, /copy\.save/);
});

test("EditorTabBar visually marks subgraph tabs without changing them into normal graph tabs", () => {
  assert.match(componentSource, /'editor-tab-bar__tab-shell--subgraph': tab\.kind === 'subgraph'/);
  assert.match(componentSource, /v-if="tab\.kind === 'subgraph'"/);
  assert.match(componentSource, /class="editor-tab-bar__tab-kind"/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--subgraph \{[\s\S]*border-color:\s*rgba\(13,\s*148,\s*136,\s*0\.32\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--subgraph\.editor-tab-bar__tab-shell--active \{[\s\S]*inset 0 3px 0 rgba\(13,\s*148,\s*136,\s*0\.58\)/);
  assert.match(componentSource, /\.editor-tab-bar__tab-kind \{[\s\S]*border:\s*1px solid rgba\(13,\s*148,\s*136,\s*0\.24\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-kind \{[\s\S]*font-size:\s*0\.62rem;/);
});

test("EditorTabBar does not declare or reference the retired toolbar boundary", () => {
  assert.doesNotMatch(componentSource, /activeStateCount/);
  assert.doesNotMatch(componentSource, /isStatePanelOpen/);
  assert.doesNotMatch(componentSource, /toggle-state-panel/);
  assert.doesNotMatch(componentSource, /save-active-graph/);
  assert.doesNotMatch(componentSource, /validate-active-graph/);
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
  assert.match(componentSource, /@wheel="handleTabsWheel"/);
  assert.doesNotMatch(componentSource, /@wheel\.prevent="handleTabsWheel"/);
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
  assert.match(componentSource, /\.editor-tab-bar__strip \{[\s\S]*display:\s*flex;[\s\S]*max-width:\s*100%;/);
  assert.match(componentSource, /\.editor-tab-bar__strip \{[\s\S]*align-items:\s*center;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*flex:\s*1 1 auto;/);
  assert.match(componentSource, /\.editor-tab-bar__add-tab \{[\s\S]*flex:\s*0 0 auto;/);
});

test("EditorTabBar behaves like a floating card group instead of reserving a full-width header lane", () => {
  assert.match(componentSource, /--editor-tab-strip-max-width:\s*100%;/);
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*pointer-events:\s*auto;/);
  assert.match(componentSource, /\.editor-tab-bar__inner \{[\s\S]*padding:\s*12px 0 0 12px;/);
  assert.doesNotMatch(componentSource, /editor-action-capsule-desktop-reserve/);
  assert.doesNotMatch(componentSource, /padding:\s*12px calc\(var\(--editor-action-capsule-desktop-reserve\) \+ 12px\) 0 12px;/);
});

test("EditorTabBar relies on the native tab scroller instead of embedded scroll buttons", () => {
  assert.match(componentSource, /import \{ Plus \} from "@element-plus\/icons-vue";/);
  assert.doesNotMatch(componentSource, /ArrowLeft/);
  assert.doesNotMatch(componentSource, /ArrowRight/);
  assert.doesNotMatch(componentSource, /editor-tab-bar__scroll-button/);
  assert.doesNotMatch(componentSource, /aria-label="向左滚动标签页"/);
  assert.doesNotMatch(componentSource, /aria-label="向右滚动标签页"/);
  assert.doesNotMatch(componentSource, /scrollTabsBy/);
  assert.doesNotMatch(componentSource, /canScrollTabsBackward/);
  assert.doesNotMatch(componentSource, /canScrollTabsForward/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*display:\s*flex;/);
});

test("EditorTabBar maps regular wheel input onto the native tab scroller", () => {
  assert.match(componentSource, /ref="tabsScroller"/);
  assert.match(componentSource, /class="editor-tab-bar__tabs-scroller"/);
  assert.match(componentSource, /const tabsScroller = ref<HTMLElement \| null>\(null\);/);
  assert.match(componentSource, /const delta = Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\) \? event\.deltaX : event\.deltaY;/);
  assert.match(componentSource, /event\.preventDefault\(\);/);
  assert.match(componentSource, /scrollContainer\.scrollLeft = nextScrollLeft;/);
  assert.match(componentSource, /function resolveTabsScrollContainer\(root: HTMLElement \| null\)/);
  assert.match(componentSource, /querySelector\("\.editor-tab-bar__tabs-scroller"\)/);
  assert.doesNotMatch(componentSource, /querySelector\("\.el-tabs__nav-wrap"\)/);
});

test("EditorTabBar normalizes Element Plus tab spacing with shared size variables", () => {
  const navWrapScrollbarBlock =
    componentSource.match(/\.editor-tab-bar__tabs\s+:deep\(.el-tabs__nav-wrap::-webkit-scrollbar\) \{[^}]*\}/)?.[0] ?? "";

  assert.match(componentSource, /--editor-tab-width:\s*\d+px;/);
  assert.match(componentSource, /--editor-tab-height:\s*\d+px;/);
  assert.match(componentSource, /--editor-tab-gap:\s*\d+px;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__nav\) \{[\s\S]*gap:\s*var\(--editor-tab-gap\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-scroller \{[\s\S]*overflow-x:\s*auto;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-scroller \{[\s\S]*padding:\s*6px 0;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-scroller \{[\s\S]*margin:\s*-6px 0;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-scroller \{[\s\S]*scrollbar-width:\s*thin;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-scroller::-webkit-scrollbar \{[\s\S]*height:\s*8px;/);
  assert.equal(navWrapScrollbarBlock, "");
  assert.match(componentSource, /\.editor-tab-bar__tabs \{[\s\S]*width:\s*max-content;[\s\S]*min-width:\s*100%;[\s\S]*max-width:\s*none;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__nav-wrap\),[\s\S]*overflow:\s*visible;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__nav-wrap\),[\s\S]*padding:\s*10px var\(--editor-tab-gap\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\) \{[\s\S]*margin:\s*0 !important;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\) \{[\s\S]*width:\s*var\(--editor-tab-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\) \{[\s\S]*flex:\s*0 0 var\(--editor-tab-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item:nth-child\(2\)\),[\s\S]*padding-left:\s*0 !important;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item:nth-child\(2\)\),[\s\S]*padding-right:\s*0 !important;/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*width:\s*var\(--editor-tab-width\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*height:\s*var\(--editor-tab-height\);/);
});

test("EditorTabBar keeps the warm project palette instead of the default blue Element Plus theme", () => {
  assert.match(componentSource, /\.editor-tab-bar \{[\s\S]*--editor-tab-bar-paper:\s*var\(--toograph-glass-bg\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*border-radius:\s*14px;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs\s+:deep\(.el-tabs__item\.is-active\) \{/);
});

test("EditorTabBar makes the active tab visually dominant without adding seam layers", () => {
  const activeTabBlock = componentSource.match(/\.editor-tab-bar__tab-shell--active \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*border:\s*1px solid rgba\(213,\s*184,\s*146,\s*0\.62\);/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell \{[\s\S]*color:\s*rgba\(88,\s*61,\s*39,\s*0\.82\);/);
  assert.match(activeTabBlock, /z-index:\s*2;/);
  assert.match(activeTabBlock, /border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.52\);/);
  assert.match(activeTabBlock, /inset 0 3px 0 rgba\(154,\s*52,\s*18,\s*0\.72\)/);
  assert.doesNotMatch(activeTabBlock, /drop-shadow/);
  assert.doesNotMatch(activeTabBlock, /\n\s*0 \d+px \d+px rgba\(154,\s*52,\s*18,/);
  assert.doesNotMatch(activeTabBlock, /filter:/);
  assert.doesNotMatch(activeTabBlock, /translateY\(-1px\)/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \.editor-tab-bar__tab-title \{[\s\S]*font-weight:\s*700;/);
});

test("EditorTabBar removes the old lower seam layers and keeps the active tab on one plane", () => {
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tab-shell--active::after \{/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tab-shell--active::before \{/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tabs-shell::before \{/);
  assert.doesNotMatch(componentSource, /\.editor-tab-bar__tabs-shell::after \{/);
});

test("EditorTabBar uses a restrained paper-warm palette instead of heavy gold gradients", () => {
  const tabShellBlock = componentSource.match(/\.editor-tab-bar__tab-shell \{[\s\S]*?\n\}/)?.[0] ?? "";
  const activeTabBlock = componentSource.match(/\.editor-tab-bar__tab-shell--active \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(
    componentSource,
    /\.editor-tab-bar__tabs-shell \{[\s\S]*background:\s*var\(--toograph-glass-specular\),\s*var\(--toograph-glass-lens\),\s*var\(--editor-tab-bar-paper\);/,
  );
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*background-blend-mode:\s*screen,\s*screen,\s*normal;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*padding:\s*8px;/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*box-shadow:[\s\S]*var\(--toograph-glass-rim\);/);
  assert.match(componentSource, /\.editor-tab-bar__tabs-shell \{[\s\S]*backdrop-filter:\s*blur\(28px\) saturate\(1\.65\) contrast\(1\.02\);/);
  assert.match(tabShellBlock, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.28\);/);
  assert.match(activeTabBlock, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.5\);/);
  assert.doesNotMatch(tabShellBlock, /linear-gradient/);
  assert.doesNotMatch(activeTabBlock, /linear-gradient/);
  assert.match(componentSource, /\.editor-tab-bar__tab-shell--active \{[\s\S]*color:\s*rgba\(111,\s*52,\s*22,\s*1\);/);
  assert.match(componentSource, /border:\s*1px solid var\(--toograph-glass-border\);/);
});

test("EditorTabBar gives the plus launcher the same liquid glass light stack as the tab strip", () => {
  assert.match(
    componentSource,
    /\.editor-tab-bar__add-tab \{[\s\S]*background:\s*var\(--toograph-glass-specular\),\s*var\(--toograph-glass-lens\),\s*var\(--toograph-glass-bg-strong\);/,
  );
  assert.match(componentSource, /\.editor-tab-bar__add-tab \{[\s\S]*background-blend-mode:\s*screen,\s*screen,\s*normal;/);
});

test("EditorTabBar lets the plus launcher popover use the panel glass surface instead of Element Plus chrome", () => {
  assert.match(componentSource, /popper-class="editor-tab-bar__launcher-popper"/);
  assert.match(componentSource, /:global\(\.editor-tab-bar__launcher-popper\.el-popper\) \{[\s\S]*border:\s*none;/);
  assert.match(componentSource, /:global\(\.editor-tab-bar__launcher-popper\.el-popper\) \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /:global\(\.editor-tab-bar__launcher-popper\.el-popper\) \{[\s\S]*box-shadow:\s*none;/);
  assert.match(componentSource, /:global\(\.editor-tab-bar__launcher-popper \.el-popper__arrow\) \{[\s\S]*display:\s*none;/);
});

test("EditorTabBar closes the plus launcher popover after a terminal launcher action", () => {
  assert.match(componentSource, /<ElPopover[\s\S]*v-model:visible="launcherPopoverOpen"[\s\S]*trigger="click"/);
  assert.match(componentSource, /const launcherPopoverOpen = ref\(false\);/);
  assert.match(componentSource, /<EditorTabLauncherPanel[\s\S]*:open="launcherPopoverOpen"/);
  assert.match(componentSource, /@create-new="handleLauncherCreateNew"/);
  assert.match(componentSource, /@create-from-template="handleLauncherCreateFromTemplate"/);
  assert.match(componentSource, /@open-graph="handleLauncherOpenGraph"/);
  assert.match(componentSource, /function handleLauncherCreateNew\(\) \{[\s\S]*launcherPopoverOpen\.value = false;[\s\S]*emit\("create-new"\);[\s\S]*\}/);
  assert.match(componentSource, /function handleLauncherCreateFromTemplate\(templateId: string\) \{[\s\S]*launcherPopoverOpen\.value = false;[\s\S]*emit\("create-from-template", templateId\);[\s\S]*\}/);
  assert.match(componentSource, /function handleLauncherOpenGraph\(graphId: string\) \{[\s\S]*launcherPopoverOpen\.value = false;[\s\S]*emit\("open-graph", graphId\);[\s\S]*\}/);
});
