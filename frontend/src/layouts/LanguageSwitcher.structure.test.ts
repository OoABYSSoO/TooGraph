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
  assert.match(componentSource, /<ElPopover/);
  assert.match(componentSource, /:teleported="true"/);
  assert.match(componentSource, /:global\(\.language-switcher-popper\.el-popper\)/);
  assert.match(componentSource, /:global\(\.language-switcher-popper \.el-popover\)/);
  assert.match(componentSource, /:global\(\.language-switcher-popper \.el-popper__arrow\)/);
  assert.match(componentSource, /\.language-switcher__menu \{[\s\S]*background:\s*var\(--toograph-glass-specular\),\s*var\(--toograph-glass-lens\),\s*var\(--toograph-glass-bg-strong\);/);
  assert.doesNotMatch(componentSource, /:teleported="false"/);
  assert.match(componentSource, /v-for="option in LANGUAGE_OPTIONS"/);
  assert.match(componentSource, /localeStore\.setLocale\(option\.locale\)/);
  assert.doesNotMatch(componentSource, /toggleLocale/);
  assert.match(componentSource, /currentLocaleLabel/);
});
