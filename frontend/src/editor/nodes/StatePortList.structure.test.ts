import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);

test("StatePortList owns agent real state port rows and emits parent side effects", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "StatePortList.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /defineProps<\{[\s\S]*side: "input" \| "output";[\s\S]*ports: NodePortViewModel\[\];[\s\S]*nodeId: string;[\s\S]*stateEditorDraft: StateFieldDraft \| null;[\s\S]*\}>/);
  assert.match(componentSource, /createVisible: boolean;/);
  assert.match(componentSource, /createOpen: boolean;/);
  assert.match(componentSource, /createAccentColor: string;/);
  assert.match(componentSource, /createLabel: string;/);
  assert.match(componentSource, /createAnchorStateKey: string;/);
  assert.match(componentSource, /createDraft: StateFieldDraft \| null;/);
  assert.match(componentSource, /<TransitionGroup[\s\S]*name="node-card-port-reorder"/);
  assert.match(componentSource, /v-for="port in ports"/);
  assert.match(componentSource, /:data-port-reorder-node-id="canReorderPort\(port\) \? nodeId : undefined"/);
  assert.match(componentSource, /@pointerdown\.stop="handlePortPointerDown\(port, \$event\)"/);
  assert.match(componentSource, /@click\.stop="handlePortClick\(port\)"/);
  assert.match(componentSource, /@click\.stop="emit\('remove-click', anchorId\(port\.key\), side, port\.key\)"/);
  assert.match(componentSource, /v-if="isLeadingManagedIcon\(port\)"/);
  assert.match(componentSource, /v-if="isTrailingManagedIcon\(port\)"/);
  assert.match(componentSource, /function isRemovalLockedManagedPort\(port: NodePortViewModel\)/);
  assert.match(componentSource, /<Connection \/>/);
  assert.match(componentSource, /v-if="side === 'output' && canRemovePort\(port\)"/);
  assert.match(componentSource, /function canEditPort\(port: NodePortViewModel\)/);
  assert.match(componentSource, /function isManagedPort\(port: NodePortViewModel\)/);
  assert.match(componentSource, /function canReorderPort\(port: NodePortViewModel\)/);
  assert.match(componentSource, /<StateEditorPopover/);
  assert.match(componentSource, /import StatePortCreatePopover from "\.\/StatePortCreatePopover\.vue";/);
  assert.match(componentSource, /import \{ Check, Connection, Delete \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /<ElPopover[\s\S]*:visible="createOpen"[\s\S]*:placement="createPlacement"/);
  assert.match(componentSource, /data-agent-create-port/);
  assert.match(componentSource, /@click\.stop="emit\('open-create', side\)"/);
  assert.match(componentSource, /<StatePortCreatePopover[\s\S]*v-if="createOpen && createDraft"[\s\S]*:draft="createDraft"/);
  assert.match(componentSource, /:virtual-affordance-base-id="createPortVirtualAffordanceId"/);
  assert.match(componentSource, /@update:name="emit\('update:create-name', \$event\)"/);
  assert.match(componentSource, /@update:type="emit\('update:create-type', \$event\)"/);
  assert.match(componentSource, /@update:color="emit\('update:create-color', \$event\)"/);
  assert.match(componentSource, /@update:description="emit\('update:create-description', \$event\)"/);
  assert.match(componentSource, /@update:value="emit\('update:create-value', \$event\)"/);
  assert.match(componentSource, /@cancel="emit\('cancel-create'\)"/);
  assert.match(componentSource, /@create="emit\('commit-create'\)"/);
  assert.match(componentSource, /\(event: "open-create", side: "input" \| "output"\): void;/);
  assert.match(componentSource, /\(event: "commit-create"\): void;/);
  assert.match(componentSource, /\.node-card__port-pill \{/);
  assert.match(componentSource, /\.node-card__port-pill-source-icon \{/);
  assert.match(componentSource, /\.node-card__port-pill--skill-managed \{/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{/);
  assert.match(componentSource, /\.node-card__port-pill-row--create \{/);
  assert.match(componentSource, /\.node-card__port-pill--create \{/);
});

test("StatePortList exposes reusable state port operations to the virtual page operation book", () => {
  const componentSource = readFileSync(resolve(currentDirectory, "StatePortList.vue"), "utf8").replace(/\r\n/g, "\n");

  assert.match(componentSource, /:data-virtual-affordance-id="portVirtualAffordanceId\(port\)"/);
  assert.match(componentSource, /:data-virtual-affordance-label="portVirtualAffordanceLabel\(port\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="removePortVirtualAffordanceId\(port\)"/);
  assert.match(componentSource, /:data-virtual-affordance-label="removePortVirtualAffordanceLabel\(port\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="createPortVirtualAffordanceId"/);
  assert.match(componentSource, /:data-virtual-affordance-label="createPortVirtualAffordanceLabel"/);
  assert.match(componentSource, /data-virtual-affordance-zone="editor-canvas.port"/);
  assert.match(componentSource, /function portVirtualAffordanceId\(port: NodePortViewModel\)/);
  assert.match(componentSource, /const createPortVirtualAffordanceId = computed/);
});
