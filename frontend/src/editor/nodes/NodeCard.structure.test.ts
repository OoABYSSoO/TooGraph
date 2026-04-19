import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "NodeCard.vue"), "utf8");

test("NodeCard does not render the reads and writes summary block", () => {
  assert.doesNotMatch(componentSource, /class="node-card__state-summary"/);
  assert.doesNotMatch(componentSource, />Reads</);
  assert.doesNotMatch(componentSource, />Writes</);
});

test("NodeCard renders output state pills with an integrated anchor slot", () => {
  assert.match(componentSource, /class="node-card__port-pill[\s\S]*node-card__port-pill--output/);
  assert.match(componentSource, /class="node-card__port-pill-anchor-slot"/);
  assert.match(componentSource, /data-anchor-slot-id=/);
  assert.doesNotMatch(componentSource, /class="node-card__port-pill-anchor"/);
  assert.doesNotMatch(componentSource, /view\.body\.primaryOutput\.typeLabel/);
  const rightOutputColumnMatch = componentSource.match(
    /<div class="node-card__port-column node-card__port-column--right">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<div class="node-card__agent-runtime-row">/,
  );
  assert.ok(rightOutputColumnMatch, "expected to find the right-side output port column");
  assert.doesNotMatch(rightOutputColumnMatch[1], /port\.typeLabel/);
});

test("NodeCard renders input state pills with leading anchor slots", () => {
  assert.match(componentSource, /class="node-card__port-pill[\s\S]*node-card__port-pill--input/);
  assert.match(componentSource, /data-anchor-slot-id="\`\$\{nodeId\}:state-in:/);
  assert.match(componentSource, /class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"/);
});

test("NodeCard does not render Required badges for visible state inputs", () => {
  assert.doesNotMatch(componentSource, />Required</);
  assert.doesNotMatch(componentSource, /node-card__port-badge/);
});

test("NodeCard docks state pills against the card edges", () => {
  assert.match(componentSource, /node-card__port-pill--dock-start/);
  assert.match(componentSource, /node-card__port-pill--dock-end/);
  assert.match(componentSource, /\.node-card \{[\s\S]*--node-card-inline-padding:\s*24px;/);
  assert.match(componentSource, /\.node-card__port-pill--dock-start \{[\s\S]*margin-left:\s*calc\(var\(--node-card-inline-padding\) \* -1\);/);
  assert.match(componentSource, /\.node-card__port-pill--dock-end \{[\s\S]*margin-right:\s*calc\(var\(--node-card-inline-padding\) \* -1\);/);
});

test("NodeCard keeps state pill geometry but hides the pill chrome visually", () => {
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*display:\s*inline-flex;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*align-items:\s*center;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*border:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*border-radius:\s*0;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*padding:\s*0;/);
  assert.match(componentSource, /\.node-card__port-pill-anchor-slot \{[\s\S]*width:\s*14px;/);
  assert.match(componentSource, /\.node-card__port-pill-anchor-slot \{[\s\S]*height:\s*14px;/);
});

test("NodeCard renders full state port labels without ellipsis clipping", () => {
  assert.match(componentSource, /\.node-card__port-pill-label \{[\s\S]*overflow:\s*visible;/);
  assert.match(componentSource, /\.node-card__port-pill-label \{[\s\S]*text-overflow:\s*clip;/);
  assert.doesNotMatch(componentSource, /\.node-card__port-pill-label \{[\s\S]*text-overflow:\s*ellipsis;/);
});

test("NodeCard uses Element Plus segmented control on the same row as the input output pill", () => {
  const inputSectionMatch = componentSource.match(
    /<section v-if="view\.body\.kind === 'input'"[\s\S]*?<\/section>/,
  );
  assert.ok(inputSectionMatch, "expected to find the input node section");
  const inputSection = inputSectionMatch[0];

  assert.match(inputSection, /<div class="node-card__port-row node-card__port-row--single node-card__port-row--input-boundary">/);
  assert.match(inputSection, /<ElSegmented/);
  assert.match(inputSection, /class="node-card__input-boundary-toggle"/);
  assert.match(inputSection, /:options="inputTypeOptions"/);
  assert.match(inputSection, /:model-value="inputBoundarySelection"/);
  assert.match(inputSection, /:disabled="Boolean\(inputAssetEnvelope\)"/);
  assert.match(inputSection, /<template #default="\{ item \}">/);
  assert.match(inputSection, /class="node-card__input-boundary-icon-wrap"/);
  assert.match(inputSection, /<component :is="item\.icon" class="node-card__input-boundary-icon" aria-hidden="true" \/>/);
  assert.match(inputSection, /<span class="node-card__sr-only">\{\{ item\.label \}\}<\/span>/);
  assert.match(inputSection, /class="node-card__port-pill[\s\S]*node-card__port-pill--output/);
  assert.match(componentSource, /from "@element-plus\/icons-vue"/);
  assert.match(componentSource, /icon:\s*Document/);
  assert.match(componentSource, /icon:\s*FolderOpened/);
  assert.match(componentSource, /icon:\s*Collection/);
  assert.doesNotMatch(inputSection, /v-for="option in inputTypeOptions"/);
  assert.doesNotMatch(inputSection, /class="node-card__control-button"/);
});

test("NodeCard does not expose manual system instruction editing for agent nodes", () => {
  const agentSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'agent'"[\s\S]*?<\/section>/,
  );
  assert.ok(agentSectionMatch, "expected to find the agent node section");
  const agentSection = agentSectionMatch[0];

  assert.doesNotMatch(agentSection, /System<\/span>/);
  assert.doesNotMatch(agentSection, /view\.body\.systemInstruction/);
  assert.doesNotMatch(componentSource, /handleAgentSystemInstructionInput/);
  assert.doesNotMatch(componentSource, /systemInstruction/);
});

test("NodeCard restores the legacy agent runtime control order with Element Plus controls", () => {
  const agentSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'agent'"[\s\S]*?<\/section>/,
  );
  assert.ok(agentSectionMatch, "expected to find the agent node section");
  const agentSection = agentSectionMatch[0];

  assert.match(agentSection, /class="node-card__agent-runtime-row"/);
  assert.match(agentSection, /class="node-card__agent-model-select-shell"/);
  assert.match(agentSection, /@pointerdown\.stop/);
  assert.match(agentSection, /@click\.stop/);
  assert.match(agentSection, /<ElSelect/);
  assert.match(agentSection, /class="node-card__agent-model-select"/);
  assert.match(agentSection, /popper-class="node-card__agent-model-popper"/);
  assert.match(agentSection, /class="node-card__agent-thinking-card"/);
  assert.match(agentSection, /class="node-card__agent-thinking-icon"/);
  assert.match(agentSection, /<ElSwitch/);
  assert.match(agentSection, /class="node-card__agent-thinking-switch"/);
  assert.match(agentSection, /:model-value="agentThinkingEnabled"/);
  assert.match(agentSection, /:width="56"/);
  assert.match(agentSection, /active-text="ON"/);
  assert.match(agentSection, /inactive-text="OFF"/);
  assert.doesNotMatch(agentSection, /node-card__agent-thinking-inline/);
  assert.doesNotMatch(agentSection, /node-card__agent-thinking-shell/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-thinking-label"/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-thinking-state"/);
  assert.doesNotMatch(agentSection, />Thinking</);
  assert.doesNotMatch(agentSection, /class="node-card__chip-row"/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-thinking-toggle"/);
  assert.match(componentSource, /\.node-card__agent-thinking-card \{/);
  assert.match(componentSource, /\.node-card__agent-runtime-row \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
  assert.match(componentSource, /\.node-card__agent-thinking-card \{[\s\S]*grid-template-columns:\s*20px\s*56px;/);
  assert.match(componentSource, /\.node-card__agent-thinking-card \{[\s\S]*min-height:\s*48px;/);
  assert.match(componentSource, /\.node-card__agent-thinking-card \{[\s\S]*border-radius:\s*16px;/);
  assert.match(componentSource, /\.node-card__agent-thinking-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\);/);
  assert.match(componentSource, /\.node-card__agent-thinking-card \{[\s\S]*padding:\s*0 14px;/);
  assert.match(componentSource, /\.node-card__agent-thinking-icon \{[\s\S]*width:\s*20px;/);
  assert.match(componentSource, /\.node-card__agent-thinking-icon \{[\s\S]*height:\s*20px;/);
  assert.doesNotMatch(componentSource, /\.node-card__agent-thinking-icon \{[^}]*background:/);
});

test("NodeCard moves node actions into hoverable top buttons built from Element Plus icons and overlays", () => {
  assert.match(componentSource, /import \{[\s\S]*ElButton,[\s\S]*ElPopover[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /import \{[\s\S]*CollectionTag[\s\S]*Delete[\s\S]*Operation[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /class="node-card__top-actions"/);
  assert.match(componentSource, /node-card__top-action-button/);
  assert.match(componentSource, /class="node-card__top-action-button node-card__top-action-button--advanced"/);
  assert.match(componentSource, /class="node-card__top-action-button node-card__top-action-button--preset"/);
  assert.match(componentSource, /class="node-card__top-action-button node-card__top-action-button--delete"/);
  assert.match(componentSource, /@click\.stop="toggleAdvancedPanel"/);
  assert.match(componentSource, /const activeTopAction = ref<"advanced" \| "delete" \| "preset" \| null>\(null\);/);
  assert.match(componentSource, /const topActionTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /function clearTopActionConfirmState\(\)/);
  assert.match(componentSource, /function startTopActionConfirmWindow\(action: "delete" \| "preset"\)/);
  assert.match(componentSource, /if \(activeTopAction\.value === "delete"\) \{[\s\S]*confirmDeleteNode\(\);[\s\S]*return;/);
  assert.match(componentSource, /if \(activeTopAction\.value === "preset"\) \{[\s\S]*confirmSavePreset\(\);[\s\S]*return;/);
  assert.match(componentSource, /@click\.stop="handleDeleteActionClick"/);
  assert.match(componentSource, /@click\.stop="handlePresetActionClick"/);
  assert.match(componentSource, /:visible="activeTopAction === 'preset'"/);
  assert.match(componentSource, /placement="top"/);
  assert.match(componentSource, /:popper-style="confirmPopoverStyle"/);
  assert.match(componentSource, /Save preset\?/);
  assert.match(componentSource, /:visible="activeTopAction === 'delete'"/);
  assert.match(componentSource, /Delete node\?/);
  assert.match(componentSource, /const confirmPopoverStyle = \{/);
  assert.match(componentSource, /node-card__top-action-button--confirm/);
  assert.doesNotMatch(componentSource, /type="primary" @click\.stop="confirmSavePreset"/);
  assert.doesNotMatch(componentSource, /type="danger" @click\.stop="confirmDeleteNode"/);
  assert.doesNotMatch(componentSource, /<details class="node-card__advanced-panel"/);
});

test("NodeCard opens bound-state editing from a double click on the port label", () => {
  assert.match(componentSource, /@dblclick\.stop="openStateEditor\(/);
  assert.match(componentSource, /const stateEditorDraft = ref<StateFieldDraft \| null>\(null\);/);
  assert.match(componentSource, /const activeStateEditorAnchorId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /emit\("rename-state", \{ currentKey:/);
  assert.match(componentSource, /emit\("update-state", \{[\s\S]*stateKey:/);
  assert.match(componentSource, /<ElPopover[\s\S]*:visible="isStateEditorOpen\(/);
  assert.doesNotMatch(componentSource, /trigger="manual"/);
  assert.match(componentSource, /StateDefaultValueEditor/);
  assert.match(componentSource, /class="node-card__state-editor"/);
});

test("NodeCard declares top-action and state-edit events for canvas forwarding", () => {
  assert.match(componentSource, /\(event: "rename-state", payload: \{ currentKey: string; nextKey: string \}\): void;/);
  assert.match(componentSource, /\(event: "update-state", payload: \{ stateKey: string; patch: Partial<StateDefinition> \}\): void;/);
  assert.match(componentSource, /\(event: "delete-node", payload: \{ nodeId: string \}\): void;/);
  assert.match(componentSource, /\(event: "save-node-preset", payload: \{ nodeId: string \}\): void;/);
});

test("NodeCard closes floating panels on focus loss and keeps popup surfaces on the warm theme", () => {
  assert.match(componentSource, /import \{ computed, onBeforeUnmount, onMounted, ref, watch \} from "vue";/);
  assert.match(componentSource, /const hasFloatingPanelOpen = computed\(\(\) =>/);
  assert.match(componentSource, /document\.addEventListener\("pointerdown", handleGlobalFloatingPanelPointerDown\)/);
  assert.match(componentSource, /document\.addEventListener\("focusin", handleGlobalFloatingPanelFocusIn\)/);
  assert.match(componentSource, /document\.addEventListener\("keydown", handleGlobalFloatingPanelKeyDown\)/);
  assert.match(componentSource, /document\.removeEventListener\("pointerdown", handleGlobalFloatingPanelPointerDown\)/);
  assert.match(componentSource, /document\.removeEventListener\("focusin", handleGlobalFloatingPanelFocusIn\)/);
  assert.match(componentSource, /document\.removeEventListener\("keydown", handleGlobalFloatingPanelKeyDown\)/);
  assert.match(componentSource, /data-node-popup-surface="true"/);
  assert.match(componentSource, /\.node-card__skill-picker \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(componentSource, /\.node-card__skill-picker \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\);/);
  assert.match(componentSource, /\.node-card__skill-picker \{[\s\S]*box-shadow:\s*0 20px 40px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
  assert.match(componentSource, /\.node-card__port-picker \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(componentSource, /\.node-card__port-picker \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\);/);
  assert.match(componentSource, /\.node-card__port-picker \{[\s\S]*box-shadow:\s*0 20px 40px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
});
