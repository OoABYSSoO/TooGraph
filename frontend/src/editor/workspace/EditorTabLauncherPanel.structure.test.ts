import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorTabLauncherPanel.vue"), "utf8");
const entryButtonMatches = componentSource.match(/class="editor-tab-launcher-panel__entry"/g) ?? [];
const entryTitleMatches = componentSource.match(/class="editor-tab-launcher-panel__entry-title">/g) ?? [];
const entryIconMatches = componentSource.match(/class="editor-tab-launcher-panel__entry-icon"/g) ?? [];
const optionListMatches = componentSource.match(/class="editor-tab-launcher-panel__option-list"/g) ?? [];

test("EditorTabLauncherPanel offers blank, template, and existing-graph entry points behind the plus launcher", () => {
  assert.match(componentSource, /const activeView = ref<"root" \| "template" \| "graph">\("root"\);/);
  assert.match(componentSource, /@click="\$emit\('create-new'\)"/);
  assert.match(componentSource, /@click="openSecondaryView\('template'\)"/);
  assert.match(componentSource, /@click="openSecondaryView\('graph'\)"/);
  assert.equal(entryButtonMatches.length, 3);
  assert.equal(entryTitleMatches.length, 3);
  assert.match(componentSource, /class="editor-tab-launcher-panel__entry-title">\{\{ t\("launcher\.blankTitle"\) \}\}</);
  assert.match(componentSource, /class="editor-tab-launcher-panel__entry-title">\{\{ t\("launcher\.templateTitle"\) \}\}</);
  assert.match(componentSource, /class="editor-tab-launcher-panel__entry-title">\{\{ t\("launcher\.graphTitle"\) \}\}</);
  assert.equal(optionListMatches.length, 1);
  assert.match(componentSource, /v-if="activeView === 'root'"/);
  assert.match(componentSource, /v-else/);
  assert.match(componentSource, /v-for="option in activePageItems"[\s\S]*@click="selectActiveOption\(option\.value\)"/);
  assert.doesNotMatch(componentSource, /import WorkspaceSelect from/);
  assert.doesNotMatch(componentSource, /<WorkspaceSelect/);
});

test("EditorTabLauncherPanel keeps the launcher light by using compact cards instead of a full dialog", () => {
  assert.match(componentSource, /class="editor-tab-launcher-panel__entry"/);
  assert.match(componentSource, /\.editor-tab-launcher-panel \{[\s\S]*width:\s*min\(336px,\s*calc\(100vw - 32px\)\);/);
  assert.match(componentSource, /\.editor-tab-launcher-panel__option-list \{[\s\S]*max-height:\s*min\(260px,\s*42vh\);[\s\S]*overflow-y:\s*auto;/);
  assert.doesNotMatch(componentSource, /<ElDialog/);
  assert.doesNotMatch(componentSource, /position:\s*fixed;/);
});

test("EditorTabLauncherPanel secondary views expose a back affordance and avoid loading-only dead ends", () => {
  assert.match(componentSource, /class="editor-tab-launcher-panel__back"/);
  assert.match(componentSource, /@click="returnToRoot"/);
  assert.match(componentSource, /t\("common\.back"\)/);
  assert.match(componentSource, /const activeTitle = computed/);
  assert.match(componentSource, /const activePlaceholder = computed/);
  assert.match(componentSource, /v-if="activeOptions.length === 0"[\s\S]*\{\{ activePlaceholder \}\}/);
  assert.doesNotMatch(componentSource, /Loading/);
  assert.doesNotMatch(componentSource, /正在加载/);
});

test("EditorTabLauncherPanel paginates secondary menu options inside the popover", () => {
  assert.match(componentSource, /const optionPageSize = 5;/);
  assert.match(componentSource, /paginateWorkspaceOptions\(activeOptions\.value,\s*activePage\.value,\s*optionPageSize\)/);
  assert.match(componentSource, /class="editor-tab-launcher-panel__pager"/);
  assert.match(componentSource, /@click="goToPreviousPage"/);
  assert.match(componentSource, /@click="goToNextPage"/);
  assert.match(componentSource, /activePageModel\.page \+ 1/);
  assert.match(componentSource, /activePageModel\.pageCount/);
});

test("EditorTabLauncherPanel uses the shared liquid glass visual language", () => {
  assert.match(componentSource, /import \{ ElIcon \} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*ArrowLeft[\s\S]*ArrowRight[\s\S]*CollectionTag[\s\S]*DocumentAdd[\s\S]*FolderOpened[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.equal(entryIconMatches.length, 3);
  assert.match(componentSource, /<ElIcon><DocumentAdd \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon><CollectionTag \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon><FolderOpened \/><\/ElIcon>/);
  assert.match(componentSource, /\.editor-tab-launcher-panel \{[\s\S]*border:\s*1px solid var\(--graphite-glass-border\);/);
  assert.match(
    componentSource,
    /\.editor-tab-launcher-panel \{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\),\s*var\(--graphite-glass-bg-strong\);/,
  );
  assert.match(componentSource, /\.editor-tab-launcher-panel \{[\s\S]*box-shadow:[\s\S]*var\(--graphite-glass-rim\);/);
  assert.match(componentSource, /\.editor-tab-launcher-panel \{[\s\S]*backdrop-filter:\s*blur\(26px\) saturate\(1\.55\) contrast\(1\.01\);/);
  assert.match(componentSource, /\.editor-tab-launcher-panel__entry \{[\s\S]*grid-template-columns:\s*40px minmax\(0,\s*1fr\) 18px;/);
  assert.match(componentSource, /\.editor-tab-launcher-panel__entry-icon \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.48\);/);
  assert.match(componentSource, /\.editor-tab-launcher-panel__option \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.28\);/);
});

test("EditorTabLauncherPanel option rows emit immediately and return to the root view", () => {
  assert.match(
    componentSource,
    /function selectActiveOption\(optionId: string\) \{[\s\S]*if \(activeView\.value === "template"\) \{[\s\S]*emit\("create-from-template", optionId\);[\s\S]*\}[\s\S]*if \(activeView\.value === "graph"\) \{[\s\S]*emit\("open-graph", optionId\);[\s\S]*\}[\s\S]*returnToRoot\(\);[\s\S]*\}/,
  );
  assert.doesNotMatch(componentSource, /selectedTemplateId/);
  assert.doesNotMatch(componentSource, /selectedGraphId/);
});

test("EditorTabLauncherPanel resets secondary card navigation after the popover closes", () => {
  assert.match(componentSource, /import \{ computed, ref, watch \} from "vue";/);
  assert.match(componentSource, /open: boolean;/);
  assert.match(
    componentSource,
    /watch\(\s*\(\) => props\.open,\s*\(nextOpen\) => \{[\s\S]*if \(!nextOpen\) \{[\s\S]*returnToRoot\(\);[\s\S]*\}[\s\S]*\},[\s\S]*\);/,
  );
});

test("EditorTabLauncherPanel cards provide pressed feedback for responsive clicks", () => {
  assert.match(componentSource, /\.editor-tab-launcher-panel__entry:active \{[\s\S]*transform:\s*translateY\(0\) scale\(0\.99\);/);
  assert.match(componentSource, /\.editor-tab-launcher-panel__option:active \{[\s\S]*transform:\s*translateX\(1px\) scale\(0\.99\);/);
});
