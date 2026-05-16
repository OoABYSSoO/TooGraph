import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("AgentActionPicker owns agent action picker presentation and emits parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "AgentActionPicker.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*selectedActionKey: string;[\s\S]*loading: boolean;[\s\S]*error: string \| null;[\s\S]*availableActionDefinitions: ActionDefinition\[\];[\s\S]*breakpointEnabled: boolean;[\s\S]*confirmPopoverStyle: CSSProperties;[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "update:selected-action", actionKey: string\): void;[\s\S]*\(event: "update:breakpoint-enabled", value: string \| number \| boolean\): void;[\s\S]*\}>/);
  assert.match(componentSource, /import ToographSelect from "@\/components\/ToographSelect\.vue";/);
  assert.match(componentSource, /import ToographCapsuleSwitch from "@\/components\/ToographCapsuleSwitch\.vue";/);
  assert.match(componentSource, /<ToographSelect[\s\S]*class="node-card__agent-action-select"[\s\S]*:class="\{ 'node-card__agent-action-select--empty': isActionEmpty \}"[\s\S]*:model-value="selectedActionKey"[\s\S]*:disabled="actionSelectDisabled"[\s\S]*filterable[\s\S]*popper-class="node-card__agent-action-popper"[\s\S]*@update:model-value="emit\('update:selected-action', String\(\$event \?\? ''\)\)"/);
  assert.doesNotMatch(componentSource, /fit-input-width/);
  assert.doesNotMatch(componentSource, /<ElSelect/);
  assert.match(componentSource, /<ElOption :label="t\('nodeCard\.noActionOption'\)" value="" \/>/);
  assert.match(componentSource, /v-if="selectedActionMissing"/);
  assert.match(componentSource, /v-if="loading"/);
  assert.match(componentSource, /v-else-if="error"/);
  assert.match(componentSource, /v-for="definition in availableActionDefinitions"/);
  assert.doesNotMatch(componentSource, /class="node-card__action-option"/);
  assert.doesNotMatch(componentSource, /definition\.description/);
  assert.doesNotMatch(componentSource, /definition\.runtime\.type/);
  assert.doesNotMatch(componentSource, /definition\.runtime\.entrypoint/);
  assert.match(componentSource, /class="node-card__agent-toggle-card node-card__agent-toggle-card--breakpoint"/);
  assert.match(componentSource, /<ToographCapsuleSwitch[\s\S]*class="node-card__agent-toggle-switch node-card__agent-breakpoint-switch"[\s\S]*:model-value="breakpointEnabled"/);
  assert.match(componentSource, /@update:model-value="emit\('update:breakpoint-enabled', \$event\)"/);
  assert.doesNotMatch(componentSource, /<ElSwitch/);
  assert.match(componentSource, /const isActionEmpty = computed/);
  assert.match(componentSource, /const selectedActionMissing = computed/);
  assert.match(componentSource, /const actionSelectDisabled = computed/);
  assert.doesNotMatch(componentSource, /availableActionDefinitions\.length === 0[\s\S]*actionSelectDisabled/);
  assert.doesNotMatch(componentSource, /t\("nodeCard\.noActions"\)/);
  assert.match(componentSource, /\.node-card__agent-action-select \{[\s\S]*--el-color-primary:\s*#2563eb;/);
  assert.match(componentSource, /\.node-card__agent-action-select--empty :deep\(\.el-select__wrapper\) \{[\s\S]*border-style:\s*dashed;/);
  assert.doesNotMatch(componentSource, /\.node-card__action-option/);
});
