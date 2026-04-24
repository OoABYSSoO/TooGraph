import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorActionCapsule.vue"), "utf8");

test("EditorActionCapsule keeps graph tools compact while preserving Run as the only primary action", () => {
  assert.match(componentSource, /import \{ ElIcon, ElTooltip \} from "element-plus";/);
  assert.match(componentSource, /class="editor-action-capsule__tools"/);
  assert.match(componentSource, /class="editor-action-capsule__state-pill"/);
  assert.match(componentSource, /class="editor-action-capsule__run"/);
  assert.match(componentSource, /@click="\$emit\('toggle-state-panel'\)"/);
  assert.match(componentSource, /@click="\$emit\('run-active-graph'\)"/);
  assert.match(componentSource, /aria-label="保存图"/);
  assert.match(componentSource, /aria-label="校验图"/);
  assert.match(componentSource, /aria-label="导入 Python 图"/);
  assert.match(componentSource, /aria-label="导出 Python 图"/);
});

test("EditorActionCapsule renders non-primary graph actions as icon buttons with tooltips", () => {
  assert.match(componentSource, /<ElTooltip[\s\S]*content="保存图"/);
  assert.match(componentSource, /<ElTooltip[\s\S]*content="校验图"/);
  assert.match(componentSource, /<ElTooltip[\s\S]*content="导入 Python 图"/);
  assert.match(componentSource, /<ElTooltip[\s\S]*content="导出 Python 图"/);
  assert.doesNotMatch(componentSource, /copy\.newGraph/);
});
