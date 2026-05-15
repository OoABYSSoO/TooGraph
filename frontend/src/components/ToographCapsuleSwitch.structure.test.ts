import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentPath = resolve(currentDirectory, "ToographCapsuleSwitch.vue");

test("ToographCapsuleSwitch centralizes node capsule switch behavior", () => {
  assert.ok(existsSync(componentPath), "expected shared ToographCapsuleSwitch component");
  const componentSource = readFileSync(componentPath, "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /import \{ ElSwitch \} from "element-plus";/);
  assert.match(componentSource, /width:\s*56/);
  assert.match(componentSource, /activeText:\s*"ON"/);
  assert.match(componentSource, /inactiveText:\s*"OFF"/);
  assert.match(componentSource, /variant:\s*"warm"/);
  assert.match(componentSource, /<ElSwitch[\s\S]*class="toograph-capsule-switch"[\s\S]*:class="`toograph-capsule-switch--\$\{variant\}`"[\s\S]*:model-value="modelValue"[\s\S]*:width="width"[\s\S]*inline-prompt[\s\S]*:active-text="activeText"[\s\S]*:inactive-text="inactiveText"/);
  assert.match(componentSource, /@pointerdown\.stop/);
  assert.match(componentSource, /@click\.stop/);
  assert.match(componentSource, /@update:model-value="emit\('update:modelValue', Boolean\(\$event\)\)"/);
  assert.match(componentSource, /\.toograph-capsule-switch--warm/);
  assert.match(componentSource, /\.toograph-capsule-switch--blue/);
});
