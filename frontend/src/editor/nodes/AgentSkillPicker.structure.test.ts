import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("AgentSkillPicker owns agent skill picker presentation and emits parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "AgentSkillPicker.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*selectedSkillKey: string;[\s\S]*loading: boolean;[\s\S]*error: string \| null;[\s\S]*availableSkillDefinitions: SkillDefinition\[\];[\s\S]*breakpointEnabled: boolean;[\s\S]*confirmPopoverStyle: CSSProperties;[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "update:selected-skill", skillKey: string\): void;[\s\S]*\(event: "update:breakpoint-enabled", value: string \| number \| boolean\): void;[\s\S]*\}>/);
  assert.match(componentSource, /<ElSelect[\s\S]*class="node-card__agent-skill-select graphite-select"[\s\S]*:model-value="selectedSkillKey"[\s\S]*:disabled="skillSelectDisabled"[\s\S]*popper-class="graphite-select-popper node-card__agent-skill-popper"[\s\S]*@update:model-value="emit\('update:selected-skill', String\(\$event \?\? ''\)\)"/);
  assert.match(componentSource, /<ElOption :label="t\('nodeCard\.noSkill'\)" value="" \/>/);
  assert.match(componentSource, /v-if="selectedSkillMissing"/);
  assert.match(componentSource, /v-if="loading"/);
  assert.match(componentSource, /v-else-if="error"/);
  assert.match(componentSource, /v-for="definition in availableSkillDefinitions"/);
  assert.match(componentSource, /definition\.runtime\.type/);
  assert.match(componentSource, /definition\.runtime\.entrypoint/);
  assert.match(componentSource, /class="node-card__agent-toggle-card node-card__agent-toggle-card--breakpoint"/);
  assert.match(componentSource, /:model-value="breakpointEnabled"/);
  assert.match(componentSource, /@update:model-value="emit\('update:breakpoint-enabled', \$event\)"/);
  assert.match(componentSource, /const selectedSkillMissing = computed/);
  assert.match(componentSource, /const skillSelectDisabled = computed/);
  assert.match(componentSource, /\.node-card__agent-skill-select \{[\s\S]*--el-color-primary:\s*#2563eb;/);
  assert.match(componentSource, /:deep\(\.node-card__agent-skill-popper\.el-popper\)/);
});
