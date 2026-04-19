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
  assert.match(componentSource, /No matching nodes or presets\./);
});
