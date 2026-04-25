import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "AppShell.vue"), "utf8");

test("AppShell collapses to a persistent sidebar rail instead of hiding the sidebar", () => {
  assert.match(componentSource, /'app-shell--collapsed': isSidebarCollapsed/);
  assert.match(componentSource, /'app-shell__sidebar--collapsed': isSidebarCollapsed/);
  assert.doesNotMatch(componentSource, /app-shell__sidebar--hidden/);
  assert.doesNotMatch(componentSource, /app-shell__expand/);
  assert.match(componentSource, /\.app-shell \{[\s\S]*--app-sidebar-width:\s*240px;/);
  assert.match(componentSource, /\.app-shell \{[\s\S]*grid-template-columns:\s*var\(--app-sidebar-width\) minmax\(0,\s*1fr\);/);
  assert.match(componentSource, /\.app-shell--collapsed \{[\s\S]*--app-sidebar-width:\s*64px;/);
});

test("AppShell keeps collapsed navigation usable with compact labels and an in-rail toggle", () => {
  assert.match(componentSource, /app-shell__brand-mark/);
  assert.match(componentSource, /app-shell__brand-copy/);
  assert.match(componentSource, /app-shell__link-icon/);
  assert.match(componentSource, /app-shell__link-label/);
  assert.match(componentSource, /:aria-label="isSidebarCollapsed \? '展开侧栏' : '收起侧栏'"/);
  assert.match(componentSource, /\.app-shell__sidebar--collapsed\s+\.app-shell__brand-copy \{[\s\S]*display:\s*none;/);
  assert.match(componentSource, /\.app-shell__sidebar--collapsed\s+\.app-shell__link-label \{[\s\S]*display:\s*none;/);
});

test("AppShell uses dynamic viewport height and keeps editor chrome inside the visible viewport", () => {
  assert.match(componentSource, /\.app-shell \{[\s\S]*min-height:\s*100dvh;/);
  assert.match(componentSource, /\.app-shell--editor \{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/);
  assert.match(componentSource, /\.app-shell__sidebar \{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/);
  assert.match(componentSource, /\.app-shell__content--editor \{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(componentSource, /\.app-shell__content--editor \{[\s\S]*height:\s*100vh;/);
});

test("AppShell uses a low-noise ChatGPT-style brand rail with library icons", () => {
  assert.match(componentSource, /import \{[\s\S]*ElIcon[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*House[\s\S]*EditPen[\s\S]*Clock[\s\S]*Setting[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /<div class="app-shell__brand-mark" aria-hidden="true">C<\/div>/);
  assert.match(componentSource, /<h1 class="app-shell__title">GraphiteUI<\/h1>/);
  assert.doesNotMatch(componentSource, /app-shell__note/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><House \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><EditPen \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><Clock \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><Setting \/><\/ElIcon>/);
  assert.match(componentSource, /\.app-shell__sidebar \{[\s\S]*background:\s*var\(--graphite-glass-bg\);/);
  assert.match(componentSource, /\.app-shell__sidebar \{[\s\S]*backdrop-filter:\s*blur\(24px\) saturate\(1\.35\);/);
  assert.match(componentSource, /\.app-shell__link \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.app-shell__link\.router-link-active,[\s\S]*\.app-shell__link\.app-shell__link--active \{[\s\S]*box-shadow:\s*inset 3px 0 0 rgba\(154,\s*52,\s*18,\s*0\.7\);/);
});

test("AppShell keeps the editor navigation entry active for graph-specific editor routes", () => {
  assert.match(componentSource, /const activeNavigationSection = computed\(\(\) => resolvePrimaryNavigationSection\(route\.path\)\);/);
  assert.match(componentSource, /<RouterLink[\s\S]*to="\/editor"[\s\S]*:class="\{ 'app-shell__link--active': activeNavigationSection === 'editor' \}"/);
  assert.match(componentSource, /\.app-shell__link\.app-shell__link--active \{[\s\S]*box-shadow:\s*inset 3px 0 0 rgba\(154,\s*52,\s*18,\s*0\.7\);/);
});
