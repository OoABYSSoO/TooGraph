import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("AgentSkillPicker owns agent skill picker presentation and emits parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "AgentSkillPicker.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*open: boolean;[\s\S]*showTrigger: boolean;[\s\S]*loading: boolean;[\s\S]*error: string \| null;[\s\S]*availableSkillDefinitions: SkillDefinition\[\];[\s\S]*attachedSkillBadges: AttachedSkillBadge\[\];[\s\S]*popoverStyle: CSSProperties;[\s\S]*\}>/);
  assert.match(componentSource, /defineEmits<\{[\s\S]*\(event: "toggle"\): void;[\s\S]*\(event: "attach", skillKey: string\): void;[\s\S]*\(event: "remove", skillKey: string\): void;[\s\S]*\}>/);
  assert.match(componentSource, /<ElPopover[\s\S]*:visible="open"[\s\S]*popper-class="node-card__agent-add-popover-popper"/);
  assert.match(componentSource, /@click\.stop="emit\('toggle'\)"/);
  assert.match(componentSource, /class="node-card__agent-add-popover node-card__skill-picker"/);
  assert.match(componentSource, /v-if="loading"/);
  assert.match(componentSource, /v-else-if="error"/);
  assert.match(componentSource, /v-else-if="availableSkillDefinitions\.length === 0"/);
  assert.match(componentSource, /v-for="definition in availableSkillDefinitions"/);
  assert.match(componentSource, /@click\.stop="emit\('attach', definition\.skillKey\)"/);
  assert.match(componentSource, /definition\.runtime\.type/);
  assert.match(componentSource, /definition\.runtime\.entrypoint/);
  assert.match(componentSource, /v-for="badge in attachedSkillBadges"/);
  assert.match(componentSource, /@click\.stop="emit\('remove', badge\.skillKey\)"/);
  assert.match(componentSource, /\.node-card__skill-picker \{/);
  assert.match(componentSource, /\.node-card__skill-badge \{/);
});
