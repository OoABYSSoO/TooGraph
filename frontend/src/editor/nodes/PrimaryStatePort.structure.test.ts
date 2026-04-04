import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "PrimaryStatePort.vue"), "utf8").replace(/\r\n/g, "\n");

test("PrimaryStatePort owns primary input and output state-pill popover presentation", () => {
  assert.match(componentSource, /<ElPopover/);
  assert.match(componentSource, /<StatePortCreatePopover/);
  assert.match(componentSource, /<StateEditorPopover/);
  assert.match(componentSource, /side === 'output'/);
  assert.match(componentSource, /side === 'input'/);
  assert.match(componentSource, /const anchorId = computed/);
  assert.match(componentSource, /`\$\{props\.anchorPrefix\}:\$\{props\.port\.key\}`/);
  assert.match(componentSource, /`\$\{props\.nodeId\}:\$\{anchorSlotKind\.value\}:\$\{props\.port\.key\}`/);
  assert.match(componentSource, /emit\("open-create", props\.side\)/);
  assert.match(componentSource, /emit\("port-click", anchorId\.value, props\.port\.key\)/);
  assert.match(componentSource, /const isManagedPort = computed\(\(\) => Boolean\(props\.port\?\.managedBySkill \|\| props\.port\?\.managedByCapability\)\);/);
  assert.match(componentSource, /if \(isManagedPort\.value\) \{[\s\S]*return;/);
  assert.match(componentSource, /v-if="isManagedPort"/);
  assert.match(componentSource, /<Connection \/>/);
  assert.match(componentSource, /import \{ Check, Connection \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /emit\('pointer-enter', anchorId\)/);
  assert.match(componentSource, /emit\('pointer-leave', anchorId\)/);
});

test("PrimaryStatePort carries primary state-pill scoped styles", () => {
  assert.match(componentSource, /\.node-card__port-pill-row \{/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*display:\s*inline-flex;/);
  assert.match(componentSource, /\.node-card__port-pill-source-icon \{/);
  assert.match(componentSource, /\.node-card__port-pill--skill-managed \{/);
  assert.match(componentSource, /\.node-card__port-pill--dock-start \{[\s\S]*margin-left:\s*calc\(var\(--node-card-inline-padding\) \* -1 - 10px\);/);
  assert.match(componentSource, /\.node-card__port-pill--dock-end \{[\s\S]*margin-right:\s*calc\(var\(--node-card-inline-padding\) \* -1 - 10px\);/);
  assert.doesNotMatch(componentSource, /text-overflow:\s*ellipsis;/);
  assert.match(componentSource, /\.node-card__confirm-hint--state \{[\s\S]*background:\s*rgba\(239,\s*246,\s*255,\s*0\.98\);/);
  assert.match(componentSource, /:deep\(\.node-card__state-editor-popper\.el-popper\)/);
});
