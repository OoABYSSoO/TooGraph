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
  assert.match(componentSource, /app-shell__link-short/);
  assert.match(componentSource, /app-shell__link-label/);
  assert.match(componentSource, /:aria-label="isSidebarCollapsed \? '展开侧栏' : '收起侧栏'"/);
  assert.match(componentSource, /\.app-shell__sidebar--collapsed\s+\.app-shell__brand-copy \{[\s\S]*display:\s*none;/);
  assert.match(componentSource, /\.app-shell__sidebar--collapsed\s+\.app-shell__link-label \{[\s\S]*display:\s*none;/);
  assert.match(componentSource, /\.app-shell__sidebar:not\(\.app-shell__sidebar--collapsed\)\s+\.app-shell__link-short \{[\s\S]*display:\s*none;/);
});
