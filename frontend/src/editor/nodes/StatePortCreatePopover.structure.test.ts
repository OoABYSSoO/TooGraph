import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "StatePortCreatePopover.vue"), "utf8").replace(/\r\n/g, "\n");

test("StatePortCreatePopover lets a port choose new or existing state before binding", () => {
  assert.match(componentSource, /import \{ PORT_STATE_CREATE_NEW_VALUE, type StatePortExistingStateOption \} from "\.\/statePortCreateModel";/);
  assert.match(componentSource, /selectionValue: string;/);
  assert.match(componentSource, /existingStateOptions: StatePortExistingStateOption\[\];/);
  assert.match(componentSource, /\(event: "update:selection", value: string\): void;/);
  assert.match(componentSource, /const isNewStateSelection = computed\(\(\) => props\.selectionValue === PORT_STATE_CREATE_NEW_VALUE\);/);
  assert.match(componentSource, /<div class="node-card__port-picker-grid node-card__port-picker-grid--identity">[\s\S]*<ToographSelect[\s\S]*class="node-card__control-select node-card__state-selection-select"[\s\S]*:model-value="selectionValue"[\s\S]*@update:model-value="emit\('update:selection', String\(\$event \?\? PORT_STATE_CREATE_NEW_VALUE\)\)"/);
  assert.match(componentSource, /<ElOption :label="t\('nodeCard\.newStateOption'\)" :value="PORT_STATE_CREATE_NEW_VALUE" \/>/);
  assert.match(componentSource, /v-for="option in existingStateOptions"[\s\S]*:label="option\.label"[\s\S]*:value="option\.value"[\s\S]*class="node-card__state-option"[\s\S]*\{\{ option\.key \}\}[\s\S]*\{\{ option\.name \}\}/);
  assert.match(componentSource, /<div class="node-card__port-picker-grid node-card__port-picker-grid--meta">[\s\S]*t\("nodeCard\.type"\)[\s\S]*t\("nodeCard\.color"\)/);
  assert.match(componentSource, /:disabled="!isNewStateSelection"/);
  assert.match(componentSource, /<StateDefaultValueEditor[\s\S]*v-if="isNewStateSelection"/);
  assert.match(componentSource, /isNewStateSelection \? t\("nodeCard\.create"\) : t\("nodeCard\.bindState"\)/);
});
