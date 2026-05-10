import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "WorkspaceSelect.vue"), "utf8");

test("WorkspaceSelect is built on Element Plus select instead of reka-ui", () => {
  assert.match(componentSource, /import \{[\s\S]*ElOption,[\s\S]*ElSelect[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /<ElSelect[\s\S]*:model-value="modelValue(?: \|\| undefined)?"/);
  assert.match(componentSource, /class="workspace-select__trigger toograph-select"/);
  assert.match(componentSource, /popper-class="toograph-select-popper workspace-select__popper"/);
  assert.match(componentSource, /<ElOption[\s\S]*v-for="option in options"/);
  assert.doesNotMatch(componentSource, /from "reka-ui"/);
  assert.doesNotMatch(componentSource, /<SelectRoot/);
});
