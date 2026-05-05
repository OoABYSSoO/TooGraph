import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("AgentNodeBody owns agent body presentation and forwards parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "AgentNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /const props = defineProps<\{[\s\S]*nodeId: string;[\s\S]*body: AgentBodyViewModel;[\s\S]*orderedInputPorts: NodePortViewModel\[\];[\s\S]*orderedOutputPorts: NodePortViewModel\[\];[\s\S]*modelOptions: AgentModelOption\[\];[\s\S]*availableSkillDefinitions: SkillDefinition\[\];[\s\S]*attachedSkillBadges: AttachedSkillBadge\[\];[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "port-click", anchorId: string, stateKey: string\): void;[\s\S]*\(event: "update:model-value", value: string \| number \| boolean \| undefined\): void;[\s\S]*\(event: "attach-skill", skillKey: string\): void;[\s\S]*\(event: "update-skill-instruction", payload: \{ skillKey: string; content: string \}\): void;[\s\S]*\(event: "task-input", inputEvent: Event\): void;[\s\S]*\}>/);
  assert.match(componentSource, /<StatePortList[\s\S]*side="input"[\s\S]*:ports="orderedInputPorts"[\s\S]*:create-visible="inputCreateVisible"[\s\S]*:create-open="inputCreateOpen"[\s\S]*@port-click="\(anchorId, stateKey\) => emit\('port-click', anchorId, stateKey\)"/);
  assert.match(componentSource, /<StatePortList[\s\S]*side="output"[\s\S]*:ports="orderedOutputPorts"[\s\S]*:create-visible="outputCreateVisible"[\s\S]*:create-open="outputCreateOpen"/);
  assert.match(componentSource, /<AgentRuntimeControls[\s\S]*ref="runtimeControlsRef"[\s\S]*:model-value="modelValue"[\s\S]*:model-options="modelOptions"[\s\S]*@model-visible-change="emit\('model-visible-change', \$event\)"[\s\S]*@update:breakpoint-enabled="emit\('update:breakpoint-enabled', \$event\)"/);
  assert.match(componentSource, /<AgentSkillPicker[\s\S]*:open="skillPickerOpen"[\s\S]*:available-skill-definitions="availableSkillDefinitions"[\s\S]*:attached-skill-badges="attachedSkillBadges"[\s\S]*@attach="emit\('attach-skill', \$event\)"[\s\S]*@remove="emit\('remove-skill', \$event\)"/);
  assert.match(componentSource, /class="node-card__surface node-card__prompt-surface"[\s\S]*<textarea[\s\S]*class="node-card__surface-textarea"[\s\S]*:value="body\.taskInstruction"[\s\S]*@input="emit\('task-input', \$event\)"/);
  assert.match(componentSource, /class="node-card__skill-instruction-capsule"[\s\S]*@update:model-value="emit\('update-skill-instruction'/);
  assert.match(componentSource, /defineExpose\(\{[\s\S]*collapseModelSelect[\s\S]*\}\);/);
  assert.match(componentSource, /\.node-card__surface \{[\s\S]*border-radius:\s*24px;/);
  assert.match(componentSource, /\.node-card__surface-textarea \{[\s\S]*flex:\s*1 1 auto;[\s\S]*resize:\s*none;/);
});
