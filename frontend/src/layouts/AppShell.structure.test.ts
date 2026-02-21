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

test("AppShell keeps collapsed navigation usable with compact labels and a brand mark toggle", () => {
  assert.match(componentSource, /app-shell__brand-mark/);
  assert.match(componentSource, /app-shell__brand-copy/);
  assert.match(componentSource, /app-shell__link-icon/);
  assert.match(componentSource, /app-shell__link-label/);
  assert.match(componentSource, /<button[\s\S]*class="app-shell__brand-mark"[\s\S]*:aria-label="isSidebarCollapsed \? t\('nav\.expandSidebar'\) : t\('nav\.collapseSidebar'\)"[\s\S]*@click="setSidebarCollapsed\(!isSidebarCollapsed\)"/);
  assert.doesNotMatch(componentSource, /class="app-shell__collapse"/);
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

test("AppShell keeps the sidebar fixed while normal pages scroll in the content pane", () => {
  assert.match(componentSource, /\.app-shell \{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/);
  assert.match(componentSource, /\.app-shell__sidebar \{[\s\S]*height:\s*100dvh;[\s\S]*max-height:\s*100dvh;/);
  assert.match(componentSource, /\.app-shell__content \{[\s\S]*height:\s*100%;[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/);
  assert.match(componentSource, /\.app-shell__content--editor \{[\s\S]*overflow:\s*hidden;/);
});

test("AppShell uses a low-noise ChatGPT-style brand rail with library icons", () => {
  assert.match(componentSource, /import \{[\s\S]*ElIcon[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*House[\s\S]*EditPen[\s\S]*Clock[\s\S]*Setting[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.doesNotMatch(componentSource, /Fold|Expand/);
  assert.match(componentSource, /<button[\s\S]*class="app-shell__brand-mark"[\s\S]*<img class="app-shell__brand-logo" src="\/logo\.svg" alt="" aria-hidden="true" \/>[\s\S]*<\/button>/);
  assert.match(componentSource, /<h1 class="app-shell__title">GraphiteUI<\/h1>/);
  assert.doesNotMatch(componentSource, /app-shell__note/);
  assert.match(componentSource, /\.app-shell__brand-logo \{[\s\S]*object-fit:\s*contain;/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><House \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><EditPen \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><Clock \/><\/ElIcon>/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><Setting \/><\/ElIcon>/);
  assert.match(componentSource, /\{\{ t\("nav\.home"\) \}\}/);
  assert.match(componentSource, /\{\{ t\("nav\.editor"\) \}\}/);
  assert.match(componentSource, /\{\{ t\("nav\.runs"\) \}\}/);
  assert.match(componentSource, /\{\{ t\("nav\.settings"\) \}\}/);
  assert.match(componentSource, /\.app-shell__sidebar \{[\s\S]*background:\s*var\(--graphite-glass-bg\);/);
  assert.match(componentSource, /\.app-shell__sidebar \{[\s\S]*backdrop-filter:\s*blur\(24px\) saturate\(1\.35\);/);
  assert.match(componentSource, /\.app-shell__link \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.app-shell__link\.router-link-active,[\s\S]*\.app-shell__link\.app-shell__link--active \{[\s\S]*box-shadow:\s*inset 3px 0 0 rgba\(154,\s*52,\s*18,\s*0\.7\);/);
});

test("AppShell exposes the global language switcher in the sidebar", () => {
  assert.match(componentSource, /import LanguageSwitcher from "\.\/LanguageSwitcher\.vue";/);
  assert.match(componentSource, /<LanguageSwitcher[\s\S]*:collapsed="isSidebarCollapsed"/);
});

test("AppShell keeps the editor navigation entry active for graph-specific editor routes", () => {
  assert.match(componentSource, /const activeNavigationSection = computed\(\(\) => resolvePrimaryNavigationSection\(route\.path\)\);/);
  assert.match(componentSource, /<RouterLink[\s\S]*to="\/editor"[\s\S]*:class="\{ 'app-shell__link--active': activeNavigationSection === 'editor' \}"/);
  assert.match(componentSource, /\.app-shell__link\.app-shell__link--active \{[\s\S]*box-shadow:\s*inset 3px 0 0 rgba\(154,\s*52,\s*18,\s*0\.7\);/);
});

test("AppShell exposes preset node and skill management as primary sidebar destinations", () => {
  assert.match(componentSource, /import \{[\s\S]*CollectionTag[\s\S]*Opportunity[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /to="\/presets"[\s\S]*activeNavigationSection === 'presets'[\s\S]*t\("nav\.presets"\)/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><CollectionTag \/><\/ElIcon>/);
  assert.match(componentSource, /to="\/skills"[\s\S]*activeNavigationSection === 'skills'[\s\S]*t\("nav\.skills"\)/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><Opportunity \/><\/ElIcon>/);
});

test("AppShell exposes model provider management as a primary sidebar destination", () => {
  assert.match(componentSource, /import \{[\s\S]*DataLine[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /to="\/models"[\s\S]*activeNavigationSection === 'models'[\s\S]*t\("nav\.models"\)/);
  assert.match(componentSource, /<ElIcon class="app-shell__link-icon"><DataLine \/><\/ElIcon>/);
});
