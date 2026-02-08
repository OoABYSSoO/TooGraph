import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorCloseConfirmDialog.vue"), "utf8");

test("EditorCloseConfirmDialog is built on Element Plus dialog instead of reka-ui", () => {
  assert.match(componentSource, /import \{[\s\S]*ElButton,[\s\S]*ElDialog[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /<ElDialog[\s\S]*:model-value="Boolean\(tab\)"/);
  assert.match(componentSource, /<ElButton/);
  assert.doesNotMatch(componentSource, /from "reka-ui"/);
  assert.doesNotMatch(componentSource, /<AlertDialogRoot/);
});
