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

test("EditorCloseConfirmDialog uses one shared glass card instead of nested white panels", () => {
  const contentBlock = componentSource.match(/\.editor-close-dialog__content \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(componentSource, /:global\(\.editor-close-dialog\.el-dialog\) \{[\s\S]*border:\s*1px solid var\(--toograph-glass-border\);/);
  assert.match(
    componentSource,
    /:global\(\.editor-close-dialog\.el-dialog\) \{[\s\S]*background:\s*var\(--toograph-glass-specular\),\s*var\(--toograph-glass-lens\),\s*var\(--toograph-glass-bg-strong\);/,
  );
  assert.match(componentSource, /:global\(\.editor-close-dialog\.el-dialog\) \{[\s\S]*backdrop-filter:\s*blur\(30px\) saturate\(1\.55\) contrast\(1\.02\);/);
  assert.doesNotMatch(contentBlock, /border:\s*1px solid/);
  assert.doesNotMatch(contentBlock, /background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\)/);
});

test("EditorCloseConfirmDialog lowers the modal pressure while keeping the tab identity visible", () => {
  assert.match(componentSource, /:global\(\.editor-close-dialog__overlay\.el-overlay\) \{[\s\S]*background:\s*rgba\(42,\s*24,\s*14,\s*0\.24\);/);
  assert.match(componentSource, /class="editor-close-dialog__status-pill">\{\{ t\("closeDialog\.status"\) \}\}<\/span>/);
  assert.match(componentSource, /class="editor-close-dialog__tab-chip"[\s\S]*\{\{ tab\?\.title \}\}/);
  assert.match(componentSource, /\.editor-close-dialog__title \{[\s\S]*font-size:\s*1\.48rem;/);
});

test("EditorCloseConfirmDialog keeps glass material opacity stable during entry", () => {
  assert.match(
    componentSource,
    /:global\(\.editor-close-dialog__overlay\.dialog-fade-enter-active\),[\s\S]*:global\(\.editor-close-dialog__overlay\.dialog-fade-leave-active\) \{[\s\S]*animation:\s*none;/,
  );
  assert.match(
    componentSource,
    /:global\(\.editor-close-dialog__overlay\.dialog-fade-enter-active \.el-overlay-dialog\),[\s\S]*:global\(\.editor-close-dialog__overlay\.dialog-fade-leave-active \.el-overlay-dialog\) \{[\s\S]*animation:\s*none;/,
  );
  assert.match(
    componentSource,
    /:global\(\.editor-close-dialog__overlay\.dialog-fade-enter-active \.editor-close-dialog\.el-dialog\),[\s\S]*:global\(\.editor-close-dialog__overlay\.dialog-fade-leave-active \.editor-close-dialog\.el-dialog\) \{[\s\S]*opacity:\s*1;[\s\S]*transition:\s*transform 180ms ease;/,
  );
  assert.match(
    componentSource,
    /:global\(\.editor-close-dialog__overlay\.dialog-fade-enter-from \.editor-close-dialog\.el-dialog\) \{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*translateY\(10px\) scale\(0\.985\);/,
  );
});

test("EditorCloseConfirmDialog gives save, discard, and cancel clear visual priority", () => {
  assert.match(componentSource, /editor-close-dialog__button--cancel/);
  assert.match(componentSource, /editor-close-dialog__button--discard/);
  assert.match(componentSource, /editor-close-dialog__button--primary/);
  assert.match(componentSource, /\.editor-close-dialog__button--primary \{[\s\S]*--el-button-bg-color:\s*rgb\(154,\s*52,\s*18\);/);
  assert.match(componentSource, /\.editor-close-dialog__button--discard \{[\s\S]*--el-button-bg-color:\s*rgba\(255,\s*255,\s*255,\s*0\.34\);/);
  assert.match(componentSource, /\.editor-close-dialog__button--cancel \{[\s\S]*--el-button-border-color:\s*transparent;/);
});
