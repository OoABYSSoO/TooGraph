import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "LanguageSwitcher.vue"), "utf8");

test("LanguageSwitcher renders a compact global locale control", () => {
  assert.match(componentSource, /useLocaleStore/);
  assert.match(componentSource, /class="language-switcher"/);
  assert.match(componentSource, /<Switch \/>/);
  assert.match(componentSource, /toggleLocale/);
  assert.match(componentSource, /currentLocaleLabel/);
});
