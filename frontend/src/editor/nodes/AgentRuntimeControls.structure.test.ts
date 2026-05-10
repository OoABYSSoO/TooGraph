import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("AgentRuntimeControls owns agent runtime control presentation and emits parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "AgentRuntimeControls.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*modelValue\?: string;[\s\S]*modelOptions: AgentModelOption\[\];[\s\S]*globalModelRef: string;[\s\S]*thinkingModeValue: AgentThinkingControlMode;[\s\S]*thinkingOptions: AgentThinkingOption\[\];[\s\S]*thinkingEnabled: boolean;[\s\S]*confirmPopoverStyle: CSSProperties;[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "model-visible-change", visible: boolean\): void;[\s\S]*\(event: "update:model-value", value: string \| number \| boolean \| undefined\): void;[\s\S]*\(event: "update:thinking-mode", value: string \| number \| boolean \| undefined\): void;[\s\S]*\}>/);
  assert.match(componentSource, /<div class="node-card__agent-runtime-row">/);
  assert.match(componentSource, /<ElSelect[\s\S]*ref="agentModelSelectRef"[\s\S]*class="node-card__agent-model-select toograph-select"[\s\S]*:model-value="modelValue"[\s\S]*:placeholder="modelOptions\.length === 0 \? t\('nodeCard\.noConfiguredModels'\) : t\('nodeCard\.selectModel'\)"[\s\S]*:disabled="modelOptions\.length === 0"[\s\S]*@visible-change="emit\('model-visible-change', \$event\)"[\s\S]*@update:model-value="emit\('update:model-value', \$event\)"/);
  assert.match(componentSource, /v-for="option in modelOptions"/);
  assert.match(componentSource, /:label="option\.label"/);
  assert.doesNotMatch(componentSource, /globalModelSuffix/);
  assert.match(componentSource, /class="node-card__agent-toggle-card node-card__agent-toggle-card--thinking"/);
  assert.match(componentSource, /:class="\{ 'node-card__agent-toggle-card--enabled': thinkingEnabled \}"/);
  assert.match(componentSource, /class="node-card__agent-thinking-icon"/);
  assert.match(componentSource, /:class="\{ 'node-card__agent-thinking-icon--enabled': thinkingEnabled \}"/);
  assert.match(componentSource, /:model-value="thinkingModeValue"/);
  assert.match(componentSource, /v-for="option in thinkingOptions"/);
  assert.match(componentSource, /@update:model-value="emit\('update:thinking-mode', \$event\)"/);
  assert.doesNotMatch(componentSource, /breakpointEnabled/);
  assert.doesNotMatch(componentSource, /node-card__agent-toggle-card--breakpoint/);
  assert.doesNotMatch(componentSource, /update:breakpoint-enabled/);
  assert.match(componentSource, /defineExpose\(\{[\s\S]*collapseModelSelect[\s\S]*\}\);/);
  assert.match(componentSource, /\.node-card__agent-runtime-row \{/);
  assert.match(componentSource, /grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s*minmax\(132px,\s*0\.65fr\);/);
  assert.match(componentSource, /\.node-card__agent-model-select \{/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{/);
  assert.match(componentSource, /\.node-card__agent-thinking-select \{/);
});
