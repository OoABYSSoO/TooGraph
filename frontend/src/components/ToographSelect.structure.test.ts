import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentPath = resolve(currentDirectory, "ToographSelect.vue");

test("ToographSelect centralizes editor select popper behavior", () => {
  assert.ok(existsSync(componentPath), "expected shared ToographSelect component");
  const componentSource = readFileSync(componentPath, "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /import \{ computed, nextTick, ref \} from "vue";/);
  assert.match(componentSource, /import \{ ElSelect \} from "element-plus";/);
  assert.match(componentSource, /teleported:\s*true/);
  assert.match(componentSource, /persistent:\s*false/);
  assert.match(componentSource, /collapseOnSelect:\s*true/);
  assert.match(componentSource, /const resolvedPopperClass = computed/);
  assert.match(componentSource, /\["toograph-select-popper", props\.popperClass\]/);
  assert.match(componentSource, /<ElSelect[\s\S]*:key="renderKey"[\s\S]*ref="selectRef"[\s\S]*class="toograph-select"[\s\S]*:teleported="teleported"[\s\S]*:persistent="persistent"[\s\S]*:popper-class="resolvedPopperClass"/);
  assert.match(componentSource, /@pointerdown\.stop/);
  assert.match(componentSource, /@click\.stop/);
  assert.match(componentSource, /@update:model-value="handleUpdate"/);
  assert.match(componentSource, /function handleUpdate\(value: ToographSelectValue\)/);
  assert.match(componentSource, /emit\("update:modelValue", value\);/);
  assert.match(componentSource, /void nextTick\(\(\) => \{[\s\S]*collapseSelect\(\);[\s\S]*if \(props\.remountOnSelect\) \{[\s\S]*renderKey\.value \+= 1;[\s\S]*globalThis\.setTimeout\(\(\) => collapseSelect\(\), 0\);/);
  assert.match(componentSource, /function collapseSelect\(\)/);
  assert.match(componentSource, /select\.dropdownMenuVisible = false;/);
  assert.match(componentSource, /select\.expanded = false;/);
  assert.match(componentSource, /select\.blur\?\.\(\);/);
  assert.match(componentSource, /defineExpose\(\{[\s\S]*collapseSelect[\s\S]*\}\);/);
  assert.match(componentSource, /<template v-if="\$slots\.label" #label>/);
});
