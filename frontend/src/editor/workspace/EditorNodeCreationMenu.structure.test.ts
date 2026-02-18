import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorNodeCreationMenu.vue"), "utf8");

test("EditorNodeCreationMenu is built on Element Plus input instead of hand-rolled search fields", () => {
  assert.match(componentSource, /import \{ ElInput \} from "element-plus";/);
  assert.match(componentSource, /<ElInput/);
});

test("EditorNodeCreationMenu renders creation entries and emits selection events", () => {
  assert.match(componentSource, /v-for="entry in entries"/);
  assert.match(componentSource, /@click="\$emit\('select-entry', entry\)"/);
  assert.match(componentSource, /@click="\$emit\('close'\)"/);
  assert.match(componentSource, /t\("nodeCreation\.empty"\)/);
  assert.match(componentSource, /\.editor-node-creation-menu \{[\s\S]*position:\s*fixed;/);
  assert.doesNotMatch(componentSource, /transform:\s*translate\(-20px,\s*-20px\)/);
});

test("EditorNodeCreationMenu matches the warm popup theme and closes when focus leaves it", () => {
  assert.match(componentSource, /import \{ computed, onBeforeUnmount, onMounted, ref, watch \} from "vue";/);
  assert.match(componentSource, /ref="menuRef"/);
  assert.match(componentSource, /document\.addEventListener\("pointerdown", handleGlobalPointerDown\)/);
  assert.match(componentSource, /document\.addEventListener\("focusin", handleGlobalFocusIn\)/);
  assert.match(componentSource, /document\.addEventListener\("keydown", handleGlobalKeyDown\)/);
  assert.match(componentSource, /document\.removeEventListener\("pointerdown", handleGlobalPointerDown\)/);
  assert.match(componentSource, /document\.removeEventListener\("focusin", handleGlobalFocusIn\)/);
  assert.match(componentSource, /document\.removeEventListener\("keydown", handleGlobalKeyDown\)/);
  assert.match(componentSource, /\.editor-node-creation-menu \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(componentSource, /\.editor-node-creation-menu \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\);/);
  assert.match(componentSource, /\.editor-node-creation-menu \{[\s\S]*box-shadow:\s*0 20px 40px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
  assert.match(componentSource, /:deep\(.editor-node-creation-menu__search \.el-input__wrapper\)/);
});
