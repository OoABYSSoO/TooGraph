import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "NodeCard.vue"), "utf8").replace(/\r\n/g, "\n");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cssRuleBlock = (selector: string) => {
  const match = componentSource.match(new RegExp(`${escapeRegExp(selector)} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `expected to find CSS rule block for ${selector}`);
  return match[0];
};

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
  const rightOutputColumnStart = componentSource.indexOf('<div class="node-card__port-column node-card__port-column--right">');
  const agentRuntimeRowStart = componentSource.indexOf('<div class="node-card__agent-runtime-row">', rightOutputColumnStart);
  assert.ok(rightOutputColumnStart >= 0 && agentRuntimeRowStart > rightOutputColumnStart, "expected to find the right-side output port column");
  const rightOutputColumn = componentSource.slice(rightOutputColumnStart, agentRuntimeRowStart);
  assert.doesNotMatch(rightOutputColumn, /port\.typeLabel/);
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
  assert.match(componentSource, /\.node-card__port-pill--dock-start \{[\s\S]*margin-left:\s*calc\(var\(--node-card-inline-padding\) \* -1 - 10px\);/);
  assert.match(componentSource, /\.node-card__port-pill--dock-end \{[\s\S]*margin-right:\s*calc\(var\(--node-card-inline-padding\) \* -1 - 10px\);/);
});

test("NodeCard accepts canvas-provided real dimensions through CSS variables", () => {
  assert.match(componentSource, /\.node-card \{[\s\S]*width:\s*var\(--node-card-width,\s*460px\);/);
  assert.match(componentSource, /\.node-card \{[\s\S]*min-height:\s*var\(--node-card-min-height,\s*260px\);/);
  assert.match(componentSource, /\.node-card--condition \{[\s\S]*width:\s*var\(--node-card-width,\s*560px\);/);
});

test("NodeCard stretches primary editable surfaces when the canvas resizes the node", () => {
  assert.match(componentSource, /\.node-card \{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/);
  assert.match(componentSource, /\.node-card__body \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(
    componentSource,
    /\.node-card__body--input,[\s\S]*\.node-card__body--agent,[\s\S]*\.node-card__body--output \{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/,
  );
  assert.match(
    componentSource,
    /\.node-card__body--input > \.node-card__surface-textarea,[\s\S]*\.node-card__body--agent > \.node-card__surface-textarea \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/,
  );
  assert.match(componentSource, /\.node-card__surface-textarea \{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*resize:\s*none;/);
  assert.match(componentSource, /\.node-card__surface--output \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(componentSource, /\.node-card__preview \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
});

test("NodeCard keeps state pill geometry but hides the pill chrome visually", () => {
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*display:\s*inline-flex;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*align-items:\s*center;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*border-radius:\s*999px;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*padding:\s*5px 10px;/);
  assert.match(componentSource, /\.node-card__port-pill-anchor-slot \{[\s\S]*width:\s*14px;/);
  assert.match(componentSource, /\.node-card__port-pill-anchor-slot \{[\s\S]*height:\s*14px;/);
});

test("NodeCard clips long state port labels inside the pill", () => {
  const labelBlock = cssRuleBlock(".node-card__port-pill-label");
  const labelTextBlock = cssRuleBlock(".node-card__port-pill-label-text");
  assert.match(labelBlock, /overflow:\s*hidden;/);
  assert.match(labelBlock, /text-overflow:\s*ellipsis;/);
  assert.match(labelBlock, /line-height:\s*1\.2;/);
  assert.match(labelTextBlock, /text-overflow:\s*ellipsis;/);
  assert.match(labelTextBlock, /line-height:\s*1\.2;/);
  assert.doesNotMatch(labelBlock, /line-height:\s*1;/);
  assert.doesNotMatch(labelBlock, /overflow:\s*visible;/);
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

test("NodeCard routes input value editing through the output state schema value", () => {
  assert.match(componentSource, /const inputStateValue = computed\(\(\) =>/);
  assert.match(componentSource, /props\.stateSchema\[stateKey\]\?\.value/);
  assert.match(componentSource, /return view\.value\.body\.kind === "input" \? view\.value\.body\.valueText : "";/);
  assert.match(componentSource, /function emitInputValuePatch\(value: unknown\)/);
  assert.match(componentSource, /emitInputStatePatch\(stateKey, \{ value \}\);/);
  assert.match(componentSource, /emitInputConfigPatch\(\{ value \}\);/);
  assert.match(componentSource, /function handleInputValueInput\(event: Event\) \{[\s\S]*emitInputValuePatch\(target\.value\);/);
  assert.match(componentSource, /function handleInputKnowledgeBaseSelect\(value: string \| number \| boolean \| undefined\) \{[\s\S]*emitInputValuePatch\(typeof value === "string" \? value : ""\);/);
  assert.match(componentSource, /function clearInputAsset\(\) \{[\s\S]*emitInputValuePatch\(""\);/);
  assert.match(componentSource, /emitInputValuePatch\(JSON\.stringify\(envelope\)\);/);
  assert.doesNotMatch(componentSource, /return typeof props\.node\.config\.value === "string" \? props\.node\.config\.value : "";/);
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
  assert.match(agentSection, /ref="agentModelSelectRef"/);
  assert.match(agentSection, /class="node-card__agent-model-select graphite-select"/);
  assert.match(agentSection, /@visible-change="handleAgentModelSelectVisibleChange"/);
  assert.match(agentSection, /popper-class="graphite-select-popper node-card__agent-model-popper"/);
  assert.equal(
    [...agentSection.matchAll(/<ElPopover\s+trigger="hover"\s+placement="top-start"[\s\S]*?popper-class="node-card__agent-toggle-hint-popper"/g)]
      .length,
    2,
  );
  assert.match(agentSection, /class="node-card__agent-toggle-card node-card__agent-toggle-card--thinking"/);
  assert.match(agentSection, /class="node-card__agent-thinking-icon"/);
  assert.match(agentSection, /<ElSelect/);
  assert.match(agentSection, /class="node-card__agent-thinking-select graphite-select"/);
  assert.match(agentSection, /:model-value="agentThinkingModeValue"/);
  assert.match(agentSection, /v-for="option in agentThinkingOptions"/);
  assert.match(agentSection, /@update:model-value="handleAgentThinkingModeSelect"/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-toggle-switch node-card__agent-thinking-switch"/);
  assert.match(agentSection, /class="node-card__confirm-hint node-card__confirm-hint--toggle">\{\{ t\("nodeCard\.thinkingMode"\) \}\}<\/div>/);
  assert.match(agentSection, /class="node-card__agent-toggle-card node-card__agent-toggle-card--breakpoint"/);
  assert.match(agentSection, /class="node-card__agent-breakpoint-icon"/);
  assert.match(agentSection, /class="node-card__agent-toggle-switch node-card__agent-breakpoint-switch"/);
  assert.match(agentSection, /:model-value="agentBreakpointEnabled"/);
  assert.match(agentSection, /@update:model-value="handleAgentBreakpointToggleValue"/);
  assert.match(agentSection, /class="node-card__confirm-hint node-card__confirm-hint--toggle">\{\{ t\("nodeCard\.setBreakpoint"\) \}\}<\/div>/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-breakpoint-button"/);
  assert.doesNotMatch(agentSection, /node-card__agent-thinking-inline/);
  assert.doesNotMatch(agentSection, /node-card__agent-thinking-shell/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-thinking-label"/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-thinking-state"/);
  assert.doesNotMatch(agentSection, />Thinking</);
  assert.doesNotMatch(agentSection, /class="node-card__chip-row"/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-thinking-toggle"/);
  assert.match(componentSource, /\.node-card__agent-runtime-row \{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(componentSource, /\.node-card__agent-model-select-shell \{[\s\S]*width:\s*100%;/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{[\s\S]*grid-template-columns:\s*20px\s*56px;/);
  assert.match(componentSource, /\.node-card__agent-toggle-card--thinking \{[\s\S]*grid-template-columns:\s*20px\s*minmax\(0,\s*1fr\);/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{[\s\S]*width:\s*100%;/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{[\s\S]*min-height:\s*48px;/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{[\s\S]*border-radius:\s*16px;/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\);/);
  assert.match(componentSource, /\.node-card__agent-toggle-card \{[\s\S]*padding:\s*0 14px;/);
  assert.match(componentSource, /\.node-card__confirm-hint--toggle \{[\s\S]*background:\s*rgb\(255,\s*247,\s*237\);/);
  assert.match(componentSource, /\.node-card__agent-thinking-icon \{[\s\S]*width:\s*20px;/);
  assert.match(componentSource, /\.node-card__agent-thinking-icon \{[\s\S]*height:\s*20px;/);
  assert.doesNotMatch(componentSource, /\.node-card__agent-thinking-icon \{[^}]*background:/);
  assert.match(componentSource, /const agentThinkingOptions = computed/);
  const thinkingOptions = componentSource.match(/const agentThinkingOptions = computed[\s\S]*?\]\);/);
  assert.ok(thinkingOptions, "expected agent thinking options");
  assert.match(
    thinkingOptions[0],
    /value:\s*"off"[\s\S]*label:\s*t\("nodeCard\.thinkingOff"\)[\s\S]*value:\s*"low"[\s\S]*label:\s*t\("nodeCard\.thinkingLow"\)[\s\S]*value:\s*"medium"[\s\S]*label:\s*t\("nodeCard\.thinkingMedium"\)[\s\S]*value:\s*"high"[\s\S]*label:\s*t\("nodeCard\.thinkingHigh"\)[\s\S]*value:\s*"xhigh"[\s\S]*label:\s*t\("nodeCard\.thinkingExtraHigh"\)/,
  );
  assert.doesNotMatch(thinkingOptions[0], /value:\s*"auto"/);
  assert.match(componentSource, /function normalizeAgentThinkingMode/);
  assert.match(componentSource, /agentBreakpointEnabled\?:\s*boolean;/);
  assert.match(componentSource, /agentBreakpointTiming\?:\s*"before" \| "after";/);
  assert.match(componentSource, /\(event: "toggle-agent-breakpoint", payload: \{ nodeId: string; enabled: boolean \}\): void;/);
  assert.match(componentSource, /\(event: "update-agent-breakpoint-timing", payload: \{ nodeId: string; timing: "before" \| "after" \}\): void;/);
  assert.match(componentSource, /function handleAgentBreakpointToggle\(\) \{[\s\S]*emit\("toggle-agent-breakpoint", \{ nodeId: props\.nodeId, enabled: !props\.agentBreakpointEnabled \}\);[\s\S]*\}/);
  assert.match(componentSource, /function handleAgentBreakpointToggleValue\(value: string \| number \| boolean\) \{/);
  assert.match(componentSource, /class="node-card__breakpoint-timing-select graphite-select"/);
  assert.match(componentSource, /:model-value="agentBreakpointTimingValue"/);
  assert.match(componentSource, /@update:model-value="handleAgentBreakpointTimingSelect"/);
  assert.match(componentSource, /t\('nodeCard\.runAfter'\)/);
  assert.match(componentSource, /t\('nodeCard\.runBefore'\)/);
  assert.match(componentSource, /const agentModelSelectRef = ref<\{ blur\?: \(\) => void; toggleMenu\?: \(\) => void; expanded\?: boolean \} \| null>\(null\);/);
  assert.match(componentSource, /function collapseAgentModelSelect\(\) \{[\s\S]*if \(agentModelSelectRef\.value\?\.expanded\) \{[\s\S]*agentModelSelectRef\.value\.toggleMenu\?\.\(\);[\s\S]*\}[\s\S]*agentModelSelectRef\.value\?\.blur\?\.\(\);[\s\S]*\}/);
  assert.match(componentSource, /collapseAgentModelSelect\(\);/);
});

test("NodeCard asks the workspace to refresh models when the agent model select opens", () => {
  assert.match(componentSource, /\(event: "refresh-agent-models"\): void;/);
  assert.match(componentSource, /function handleAgentModelSelectVisibleChange\(visible: boolean\)/);
  assert.match(componentSource, /if \(visible\) \{[\s\S]*emit\("refresh-agent-models"\);[\s\S]*\}/);
});

test("NodeCard keeps agent model selection in the dropdown without rendering duplicate model capsules", () => {
  const agentSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'agent'"[\s\S]*?<\/section>/,
  );
  assert.ok(agentSectionMatch, "expected to find the agent node section");
  const agentSection = agentSectionMatch[0];

  assert.match(agentSection, /class="node-card__agent-model-select graphite-select"/);
  assert.match(agentSection, /v-for="option in agentModelOptions"/);
  assert.match(agentSection, /@update:model-value="handleAgentModelValueChange"/);
  assert.doesNotMatch(agentSection, /class="node-card__available-model-pills"/);
  assert.doesNotMatch(agentSection, /class="node-card__model-pill"/);
  assert.doesNotMatch(agentSection, /node-card__model-pill--active/);
  assert.doesNotMatch(componentSource, /\.node-card__available-model-pills \{/);
  assert.doesNotMatch(componentSource, /\.node-card__model-pill \{/);
  assert.doesNotMatch(componentSource, /\.node-card__model-pill--active \{/);
});

test("NodeCard keeps skill actions below the agent while creating ports from plus state pills", () => {
  const agentSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'agent'"[\s\S]*?<\/section>/,
  );
  assert.ok(agentSectionMatch, "expected to find the agent node section");
  const agentSection = agentSectionMatch[0];

  assert.match(agentSection, /<ElPopover[\s\S]*:visible="isSkillPickerOpen"[\s\S]*popper-class="node-card__agent-add-popover-popper"/);
  assert.match(agentSection, /class="node-card__agent-add-popover node-card__skill-picker"/);
  assert.match(agentSection, /@click\.stop="toggleSkillPicker"/);
  assert.match(agentSection, /@click\.stop="openPortStateCreate\('input'\)"/);
  assert.match(agentSection, /@click\.stop="openPortStateCreate\('output'\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('input'\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('output'\)"/);
  assert.match(agentSection, /class="node-card__agent-create-port-popover node-card__port-picker"/);
  assert.match(agentSection, /class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start node-card__port-pill--create"/);
  assert.match(agentSection, /class="node-card__port-pill node-card__port-pill--output node-card__port-pill--dock-end node-card__port-pill--create"/);
  assert.match(agentSection, />\+ input</);
  assert.match(agentSection, />\+ output</);
  assert.match(agentSection, /<ElSelect[\s\S]*class="node-card__control-select graphite-select"[\s\S]*popper-class="graphite-select-popper node-card__port-picker-select-popper"/);
  assert.doesNotMatch(agentSection, /t\("nodeCard\.key"\)/);
  assert.doesNotMatch(agentSection, /portStateDraft\.key/);
  assert.doesNotMatch(agentSection, /class="node-card__port-state-key"/);
  assert.doesNotMatch(componentSource, /handlePortDraftKey/);
  assert.match(agentSection, /class="node-card__port-picker-color-option"/);
  assert.match(agentSection, /class="node-card__port-picker-color-dot"/);
  assert.match(componentSource, /const portStateColorOptions = computed\(\(\) => resolveStateColorOptions\(portStateDraft\.value\?\.definition\.color \?\? ""\)\);/);
  assert.match(componentSource, /const agentAddPopoverStyle = \{/);
  assert.match(componentSource, /"--el-popover-bg-color":\s*"transparent"/);
  assert.match(componentSource, /\.node-card__agent-add-popover,[\s\S]*\.node-card__agent-create-port-popover \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(componentSource, /:deep\(\.node-card__agent-add-popover-popper\.el-popper\) \{[\s\S]*background:\s*transparent;/);
  assert.doesNotMatch(agentSection, /v-for="picker in agentPortPickerActions"/);
  assert.doesNotMatch(agentSection, /@click\.stop="openPortPicker\(picker\.side\)"/);
  assert.doesNotMatch(componentSource, /const agentPortPickerActions/);
  assert.doesNotMatch(agentSection, /node-card__action-pill--input/);
  assert.doesNotMatch(agentSection, /node-card__action-pill--output/);
  assert.doesNotMatch(agentSection, /<div v-if="activePortPickerSide" class="node-card__port-picker"/);
  assert.doesNotMatch(agentSection, /<div v-if="isSkillPickerOpen" class="node-card__skill-picker"/);
});

test("NodeCard renders plus input and plus output as virtual agent state port rows", () => {
  const agentSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'agent'"[\s\S]*?<\/section>/,
  );
  assert.ok(agentSectionMatch, "expected to find the agent node section");
  const agentSection = agentSectionMatch[0];

  assert.match(componentSource, /import \{[\s\S]*CREATE_AGENT_INPUT_STATE_KEY,[\s\S]*VIRTUAL_ANY_INPUT_STATE_KEY,[\s\S]*VIRTUAL_ANY_OUTPUT_COLOR,[\s\S]*VIRTUAL_ANY_OUTPUT_STATE_KEY[\s\S]*\} from "@\/lib\/virtual-any-input";/);
  assert.match(componentSource, /import \{ buildNodeCardViewModel, type NodePortViewModel \} from "\.\/nodeCardViewModel";/);
  assert.match(componentSource, /hovered\?:\s*boolean;/);
  assert.match(componentSource, /'node-card--hovered': hovered/);
  assert.match(componentSource, /pendingStateInputSource\?: \{ stateKey: string; label: string; stateColor: string \} \| null;/);
  assert.match(componentSource, /const agentInputPorts = computed<NodePortViewModel\[\]>\(\(\) =>/);
  assert.match(componentSource, /const agentOutputPorts = computed<NodePortViewModel\[\]>\(\(\) =>/);
  assert.match(componentSource, /filter\(\(port\) => !port\.virtual\)/);
  assert.match(componentSource, /VIRTUAL_ANY_OUTPUT_STATE_KEY/);
  assert.match(componentSource, /function openPortStateCreate\(side: "input" \| "output"\)/);
  assert.match(componentSource, /createStateDraftFromQuery\(side === "input" \? "Input" : "Output", Object\.keys\(props\.stateSchema\)\)/);
  assert.match(agentSection, /v-for="port in agentInputPorts"/);
  assert.match(agentSection, /v-for="port in agentOutputPorts"/);
  assert.match(componentSource, /const shouldShowAgentCreateInputPort = computed\(\(\) => agentInputPorts\.value\.length === 0\);/);
  assert.match(componentSource, /const shouldShowAgentCreateOutputPort = computed\(\(\) => agentOutputPorts\.value\.length === 0\);/);
  assert.match(agentSection, /data-agent-create-port="input"/);
  assert.match(agentSection, /data-agent-create-port="output"/);
  assert.match(agentSection, /:class="\{ 'node-card__port-pill-row--create-visible': shouldShowAgentCreateInputPort \}"/);
  assert.match(agentSection, /:class="\{ 'node-card__port-pill-row--create-visible': shouldShowAgentCreateOutputPort \}"/);
  assert.match(agentSection, /@click\.stop="openPortStateCreate\('input'\)"/);
  assert.match(agentSection, /@click\.stop="openPortStateCreate\('output'\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('input'\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('output'\)"/);
  assert.match(componentSource, /const agentCreateInputAnchorStateKey = computed\(\(\) =>/);
  assert.match(componentSource, /props\.pendingStateInputSource \? CREATE_AGENT_INPUT_STATE_KEY : VIRTUAL_ANY_INPUT_STATE_KEY/);
  assert.match(agentSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-in:\$\{agentCreateInputAnchorStateKey\}\`"/);
  assert.match(agentSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-out:\$\{VIRTUAL_ANY_OUTPUT_STATE_KEY\}\`"/);
  assert.match(agentSection, /node-card__port-pill--create/);
  assert.match(agentSection, /\+ input/);
  assert.match(agentSection, /\+ output/);
  assert.doesNotMatch(componentSource, /const shouldRenderPendingStateInputCapsule = computed/);
  assert.doesNotMatch(agentSection, /node-card__port-pill-create-badge/);
  assert.doesNotMatch(agentSection, /t\("common\.new"\)/);
  assert.doesNotMatch(agentSection, /\{\{ pendingStateInputSource\?\.label \}\}/);
  assert.match(componentSource, /\.node-card__port-pill--create \{[^}]*border-style:\s*dashed;/);
  assert.match(componentSource, /\.node-card__port-pill--create \{[^}]*background:\s*color-mix\(in srgb,\s*var\(--node-card-port-accent\) 10%, transparent\);/);
  assert.match(componentSource, /\.node-card__port-pill--create \{[^}]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill--create \{[^}]*color:\s*var\(--node-card-port-accent\);/);
  assert.doesNotMatch(componentSource, /\.node-card__port-pill--create \{[^}]*background:\s*transparent;/);
  const createRowStyle = componentSource.match(/\.node-card__port-pill-row--create \{[\s\S]*?\}/);
  assert.ok(createRowStyle, "expected create port row style");
  assert.match(createRowStyle[0], /display:\s*none;/);
  assert.doesNotMatch(createRowStyle[0], /max-height:/);
  assert.doesNotMatch(createRowStyle[0], /opacity:/);
  assert.match(componentSource, /\.node-card:hover \.node-card__port-pill-row--create,/);
  assert.match(componentSource, /\.node-card--hovered \.node-card__port-pill-row--create,/);
  assert.match(componentSource, /\.node-card--selected \.node-card__port-pill-row--create,/);
  assert.match(componentSource, /\.node-card__port-pill-row--create-visible,/);
  const visibleCreateRowStyle = componentSource.match(
    /\.node-card__port-pill-row--create-visible,[\s\S]*?\.node-card--floating-panel-open \.node-card__port-pill-row--create \{[\s\S]*?\}/,
  );
  assert.ok(visibleCreateRowStyle, "expected visible create port row style");
  assert.match(visibleCreateRowStyle[0], /display:\s*flex;/);
});

test("NodeCard constrains long state port labels without pushing anchor slots outside cards", () => {
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*max-width:\s*min\(100%,\s*var\(--node-card-port-pill-max-width,\s*188px\)\);/);
  assert.match(componentSource, /\.node-card__port-pill-label \{[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.node-card__port-pill-label \{[\s\S]*overflow:\s*hidden;/);
  assert.match(componentSource, /\.node-card__port-pill-label-text \{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.match(componentSource, /\.node-card__port-pill-anchor-slot \{[\s\S]*flex:\s*none;/);
});

test("NodeCard hides virtual agent output any behind the plus output row", () => {
  const rightOutputColumnStart = componentSource.indexOf('<div class="node-card__port-column node-card__port-column--right">');
  const agentRuntimeRowStart = componentSource.indexOf('<div class="node-card__agent-runtime-row">', rightOutputColumnStart);
  assert.ok(rightOutputColumnStart >= 0 && agentRuntimeRowStart > rightOutputColumnStart, "expected to find the agent output port column");
  const agentOutputPortSection = componentSource.slice(rightOutputColumnStart, agentRuntimeRowStart);

  assert.match(agentOutputPortSection, /'node-card__port-pill--removable': !port\.virtual/);
  assert.match(componentSource, /const agentOutputPorts = computed<NodePortViewModel\[\]>\(\(\) =>[\s\S]*filter\(\(port\) => !port\.virtual\)/);
  assert.match(agentOutputPortSection, /data-agent-create-port="output"/);
  assert.match(agentOutputPortSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-out:\$\{VIRTUAL_ANY_OUTPUT_STATE_KEY\}\`"/);
  assert.match(agentOutputPortSection, /@click\.stop="handlePortStatePillClick\(`agent-output:\$\{port\.key\}`, port\.key\)"/);
  assert.match(agentOutputPortSection, /v-if="!port\.virtual"[\s\S]*node-card__port-pill-remove/);
  assert.doesNotMatch(agentOutputPortSection, /node-card__port-pill-create-badge/);
});

test("NodeCard renders condition and output virtual inputs as plus input create pills", () => {
  const outputSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'output'"[\s\S]*?<\/section>/,
  );
  const conditionSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'condition'"[\s\S]*?<\/section>/,
  );
  assert.ok(outputSectionMatch, "expected to find the output node section");
  assert.ok(conditionSectionMatch, "expected to find the condition node section");
  const outputSection = outputSectionMatch[0];
  const conditionSection = conditionSectionMatch[0];

  assert.match(outputSection, /'node-card__port-pill--create': view\.body\.primaryInput\.virtual/);
  assert.match(conditionSection, /'node-card__port-pill--create': view\.body\.primaryInput\.virtual/);
  assert.match(outputSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-in:\$\{view\.body\.primaryInput\.key\}\`"/);
  assert.match(conditionSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-in:\$\{view\.body\.primaryInput\.key\}\`"/);
  assert.doesNotMatch(outputSection, />any</);
  assert.doesNotMatch(conditionSection, />any</);
});

test("NodeCard renders empty input outputs as virtual plus output create pills", () => {
  const inputSectionMatch = componentSource.match(
    /<section v-if="view\.body\.kind === 'input'"[\s\S]*?<\/section>/,
  );
  assert.ok(inputSectionMatch, "expected to find the input node section");
  const inputSection = inputSectionMatch[0];

  assert.match(inputSection, /'node-card__port-pill--create': view\.body\.primaryOutput\.virtual/);
  assert.match(inputSection, /@click\.stop="view\.body\.primaryOutput\.virtual \? openPortStateCreate\('output'\) : handleStateEditorActionClick/);
  assert.match(inputSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-out:\$\{view\.body\.primaryOutput\.key\}\`"/);
  assert.match(inputSection, /view\.body\.primaryOutput\.virtual && isPortCreateOpen\('output'\) && portStateDraft/);
  assert.match(inputSection, /class="node-card__agent-create-port-popover node-card__port-picker"/);
  assert.doesNotMatch(inputSection, />any</);
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
  assert.match(componentSource, /:show-arrow="false"/);
  assert.match(componentSource, /:popper-style="actionPopoverStyle"/);
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
  assert.match(componentSource, /t\("nodeCard\.savePresetQuestion"\)/);
  assert.match(componentSource, /const canSavePreset = computed\(\(\) => props\.node\.kind === "agent"\);/);
  assert.match(componentSource, /:visible="activeTopAction === 'delete'"/);
  assert.match(componentSource, /t\("nodeCard\.deleteNodeQuestion"\)/);
  assert.match(componentSource, /const confirmPopoverStyle = \{/);
  assert.match(componentSource, /const actionPopoverStyle = \{/);
  assert.match(componentSource, /"--el-popover-bg-color":\s*"transparent"/);
  assert.match(componentSource, /node-card__top-action-button--confirm/);
  assert.match(componentSource, /\.node-card \{[\s\S]*overflow:\s*visible;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*top:\s*0;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*right:\s*18px;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*z-index:\s*12;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*transform:\s*translateY\(calc\(-100% - 8px\)\);/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*gap:\s*8px;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*padding:\s*8px;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.14\);/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*border-radius:\s*999px;/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*background:\s*var\(--graphite-glass-bg\);/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*box-shadow:\s*var\(--graphite-glass-shadow\),\s*var\(--graphite-glass-highlight\),\s*var\(--graphite-glass-rim\);/);
  assert.match(componentSource, /\.node-card__top-actions \{[\s\S]*backdrop-filter:\s*blur\(24px\) saturate\(1\.6\) contrast\(1\.02\);/);
  assert.match(componentSource, /\.node-card__top-actions::before \{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\);/);
  assert.match(componentSource, /\.node-card__top-actions::after \{[\s\S]*bottom:\s*-12px;/);
  assert.match(componentSource, /\.node-card__top-actions::after \{[\s\S]*height:\s*12px;/);
  assert.match(componentSource, /\.node-card__top-actions:hover \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.node-card__top-actions:hover \{[\s\S]*pointer-events:\s*auto;/);
  assert.match(componentSource, /\.node-card__top-action-button \{[\s\S]*width:\s*56px;/);
  assert.match(componentSource, /\.node-card__top-action-button \{[\s\S]*height:\s*40px;/);
  assert.match(componentSource, /\.node-card__top-action-button \{[\s\S]*border-radius:\s*999px;/);
  assert.match(componentSource, /\.node-card__top-action-button \{[\s\S]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.node-card__top-action-button :deep\(\.el-icon\) \{[\s\S]*font-size:\s*1\.18rem;/);
  assert.match(componentSource, /\.node-card__top-popover \{[\s\S]*padding:\s*12px;/);
  assert.match(componentSource, /\.node-card__top-popover \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.14\);/);
  assert.match(componentSource, /\.node-card__top-popover \{[\s\S]*border-radius:\s*14px;/);
  assert.match(componentSource, /\.node-card__top-popover \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(componentSource, /\.node-card__top-popover \{[\s\S]*box-shadow:\s*0 16px 34px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
  assert.match(componentSource, /\.node-card__header \{[\s\S]*padding:\s*18px var\(--node-card-inline-padding\) 8px var\(--node-card-inline-padding\);/);
  assert.doesNotMatch(componentSource, /type="primary" @click\.stop="confirmSavePreset"/);
  assert.doesNotMatch(componentSource, /type="danger" @click\.stop="confirmDeleteNode"/);
  assert.doesNotMatch(componentSource, /<details class="node-card__advanced-panel"/);
});

test("NodeCard uses a calmer display hierarchy on the canvas", () => {
  assert.match(componentSource, /\.node-card \{[\s\S]*background:\s*var\(--graphite-surface-card\);/);
  assert.match(componentSource, /\.node-card__title \{[\s\S]*font-family:\s*var\(--graphite-font-display\);/);
  assert.match(componentSource, /\.node-card__title \{[\s\S]*font-size:\s*1\.72rem;/);
  assert.match(componentSource, /\.node-card__eyebrow \{[\s\S]*font-family:\s*var\(--graphite-font-mono\);/);
});

test("NodeCard shows a persistent human review capsule in the top action dock", () => {
  assert.match(componentSource, /humanReviewPending:\s*boolean;/);
  assert.match(componentSource, /v-if="humanReviewPending"/);
  assert.match(componentSource, /class="node-card__human-review-button"/);
  assert.match(componentSource, /@click\.stop="handleHumanReviewActionClick"/);
  assert.match(componentSource, /function handleHumanReviewActionClick\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /t\("nodeCard\.humanReview"\)/);
  assert.match(componentSource, /const isTopActionVisible = computed\(\(\) => props\.humanReviewPending \|\| props\.selected \|\| activeTopAction\.value !== null\);/);
  assert.match(componentSource, /\.node-card__human-review-button \{[\s\S]*background:\s*rgba\(217,\s*119,\s*6,\s*0\.12\);/);
});

test("NodeCard blocks every in-canvas control while graph editing is locked", () => {
  assert.match(componentSource, /@pointerdown\.capture="handleLockedNodeCardInteractionCapture"/);
  assert.match(componentSource, /@click\.capture="handleLockedNodeCardInteractionCapture"/);
  assert.match(componentSource, /@keydown\.capture="handleLockedNodeCardInteractionCapture"/);
  assert.match(componentSource, /function isLockedInteractiveTarget\(target: EventTarget \| null\)/);
  assert.match(componentSource, /"button",[\s\S]*"input",[\s\S]*"textarea",[\s\S]*"\[role='button'\]"/);
  assert.match(componentSource, /function closeLockedFloatingPanels\(\)/);
  assert.match(componentSource, /function guardLockedGraphInteraction\(\)/);
  assert.match(componentSource, /emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /function handleLockedNodeCardInteractionCapture\(event: Event\)[\s\S]*if \(!isLockedInteractiveTarget\(event\.target\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /function handleLockedNodeCardInteractionCapture\(event: Event\)[\s\S]*guardLockedGraphInteraction\(\);/);
  assert.match(componentSource, /watch\(\s*\(\) => props\.interactionLocked,[\s\S]*closeLockedFloatingPanels\(\);/);
  assert.match(componentSource, /function emitOutputConfigPatch\(patch: Partial<OutputNode\["config"\]>\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function emitInputConfigPatch\(patch: Partial<InputNode\["config"\]>\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function emitAgentConfigPatch\(patch: Partial<AgentNode\["config"\]>\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function emitConditionConfigPatch\(patch: Partial<ConditionNode\["config"\]>\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function handleAgentBreakpointToggle\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function toggleAdvancedPanel\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function toggleSkillPicker\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function openPortStateCreate\(side: "input" \| "output"\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function commitPortStateCreate\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
});

test("NodeCard reveals state pills on hover and opens state editing only after a confirm click", () => {
  assert.match(componentSource, /interactionLocked\?: boolean;/);
  assert.match(componentSource, /\(event: "locked-edit-attempt"\): void;/);
  assert.match(componentSource, /import StateEditorPopover from "\.\/StateEditorPopover\.vue";/);
  assert.match(componentSource, /@click\.stop="[^"]*handleStateEditorActionClick\(/);
  assert.match(componentSource, /const stateEditorDraft = ref<StateFieldDraft \| null>\(null\);/);
  assert.match(componentSource, /const activeStateEditorAnchorId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const activeStateEditorConfirmAnchorId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const hoveredStateEditorPillAnchorId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const stateEditorConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /function clearStateEditorConfirmState\(\)/);
  assert.match(componentSource, /function startStateEditorConfirmWindow\(anchorId: string\)/);
  assert.match(componentSource, /function handleStateEditorPillPointerEnter\(anchorId: string\)/);
  assert.match(componentSource, /function handleStateEditorPillPointerLeave\(anchorId: string\)/);
  assert.match(componentSource, /function handleStateEditorActionClick\(anchorId: string, stateKey: string \| null \| undefined\)/);
  assert.match(componentSource, /function guardLockedStateEditAttempt\(\)/);
  assert.match(componentSource, /emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /@pointerenter="handleStateEditorPillPointerEnter\(/);
  assert.match(componentSource, /@pointerleave="handleStateEditorPillPointerLeave\(/);
  assert.match(componentSource, /if \(guardLockedStateEditAttempt\(\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /if \(activeStateEditorConfirmAnchorId\.value === anchorId\) \{[\s\S]*openStateEditor\(anchorId, stateKey\);[\s\S]*return;/);
  assert.match(componentSource, /startStateEditorConfirmWindow\(anchorId\);/);
  assert.match(componentSource, /emit\("update-state", \{[\s\S]*stateKey:/);
  assert.doesNotMatch(componentSource, /@update:key="handleStateEditorKeyInput"/);
  assert.doesNotMatch(componentSource, /function handleStateEditorKeyInput/);
  assert.doesNotMatch(componentSource, /emit\("rename-state"/);
  assert.match(
    componentSource,
    /<ElPopover[\s\S]*:visible="isStateEditorOpen\([^"]+\) \|\| isStateEditorConfirmOpen\([^"]+\)"/,
  );
  assert.match(
    componentSource,
    /:width="isStateEditorOpen\([^"]+\) \? 320 : undefined"/,
  );
  assert.match(
    componentSource,
    /:placement="isStateEditorOpen\([^"]+\) \? 'bottom-(start|end)' : 'top-(start|end)'"/,
  );
  assert.match(componentSource, /<StateEditorPopover/);
  assert.match(componentSource, /t\("nodeCard\.editStateQuestion"\)/);
  assert.match(componentSource, /node-card__port-pill--revealed/);
  assert.match(componentSource, /node-card__port-pill--confirm/);
  assert.match(componentSource, /node-card__port-pill-confirm-icon/);
  assert.match(componentSource, /node-card__port-pill-label-text/);
  assert.match(componentSource, /node-card__port-pill-label--confirm/);
  assert.match(componentSource, /:show-arrow="false"/);
  assert.match(componentSource, /:popper-style="stateEditorPopoverStyle"/);
  assert.doesNotMatch(componentSource, /@cancel="closeStateEditor"/);
  assert.doesNotMatch(componentSource, /@save="commitStateEditor"/);
  assert.doesNotMatch(componentSource, /function commitStateEditor\(\)/);
  assert.match(componentSource, /function syncStateEditorDraft\(nextDraft: StateFieldDraft\)/);
  assert.doesNotMatch(componentSource, /trigger="manual"/);
  assert.match(componentSource, /StateDefaultValueEditor/);
  assert.match(componentSource, /class="node-card__state-editor"/);
  assert.match(componentSource, /const stateEditorPopoverStyle = \{/);
  assert.match(componentSource, /"--el-popover-bg-color":\s*"transparent"/);
  assert.match(componentSource, /"--el-popover-border-color":\s*"transparent"/);
  assert.match(componentSource, /"--el-popover-padding":\s*"0px"/);
  assert.match(componentSource, /"min-width":\s*"0"/);
  assert.match(componentSource, /:deep\(.node-card__state-editor-popper\.el-popper\) \{[\s\S]*border-radius:\s*16px;/);
  assert.match(componentSource, /:deep\(.node-card__state-editor-popper\.el-popper\) \{[\s\S]*background:\s*transparent;/);
  assert.match(componentSource, /:deep\(.node-card__state-editor-popper\.el-popper\) \{[\s\S]*padding:\s*0;/);
  assert.match(componentSource, /:deep\(.node-card__state-editor-popper\.el-popper\) \{[\s\S]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*position:\s*relative;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*padding:\s*5px 10px;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*border-radius:\s*999px;/);
  assert.match(componentSource, /\.node-card__port-pill \{[\s\S]*min-width:\s*132px;/);
  assert.match(componentSource, /\.node-card__port-pill-label \{[\s\S]*padding-inline:\s*0;/);
  assert.match(componentSource, /\.node-card__port-pill--output \{[\s\S]*color:\s*#1f2937;/);
  assert.match(componentSource, /\.node-card__port-pill--input \{[\s\S]*justify-content:\s*flex-start;[\s\S]*color:\s*#1f2937;/);
  assert.doesNotMatch(componentSource, /\.node-card__port-pill--input \{[\s\S]*#1d4ed8/);
  assert.match(componentSource, /\.node-card__port-pill--dock-start \{[\s\S]*margin-left:\s*calc\(var\(--node-card-inline-padding\) \* -1 - 10px\);/);
  assert.match(componentSource, /\.node-card__port-pill--dock-end \{[\s\S]*margin-right:\s*calc\(var\(--node-card-inline-padding\) \* -1 - 10px\);/);
  assert.match(
    componentSource,
    /\.node-card__port-pill:focus-visible,\n\.node-card__port-pill--revealed \{[\s\S]*border-color:\s*rgba\(154,\s*52,\s*18,\s*0\.14\);/,
  );
  assert.doesNotMatch(componentSource, /\.node-card__port-pill--confirm \{[^}]*min-width:/);
  assert.match(componentSource, /\.node-card__port-pill--confirm \{[^}]*background:\s*rgba\(59,\s*130,\s*246,\s*0\.96\);/);
  assert.match(componentSource, /\.node-card__port-pill--confirm \{[^}]*color:\s*#eff6ff;/);
  assert.match(componentSource, /\.node-card__port-pill--confirm \{[^}]*box-shadow:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill--confirm .node-card__port-pill-anchor-slot \{[^}]*opacity:\s*0;/);
  assert.match(componentSource, /\.node-card__port-pill-label--confirm .node-card__port-pill-label-text \{[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.node-card__port-pill-label--confirm .node-card__port-pill-confirm-icon \{[\s\S]*opacity:\s*1;/);
  assert.doesNotMatch(componentSource, /\.node-card__port-pill-label \{[^}]*position:\s*relative;/);
  assert.match(componentSource, /\.node-card__confirm-hint--state \{[\s\S]*padding:\s*5px 10px;/);
  assert.match(componentSource, /\.node-card__confirm-hint--state \{[\s\S]*letter-spacing:\s*0\.12em;/);
  assert.match(componentSource, /\.node-card__confirm-hint \{[\s\S]*display:\s*inline-flex;/);
  assert.match(componentSource, /\.node-card__confirm-hint \{[\s\S]*width:\s*fit-content;/);
});

test("NodeCard adds mirrored remove-binding buttons to non-output state pills", () => {
  assert.match(componentSource, /import \{[\s\S]*Delete[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /\(event: "remove-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string \}\): void;/);
  assert.match(componentSource, /const activeRemovePortStateConfirmAnchorId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /const removePortStateConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /function clearRemovePortStateConfirmState\(\)/);
  assert.match(componentSource, /function startRemovePortStateConfirmWindow\(anchorId: string\)/);
  assert.match(componentSource, /function isRemovePortStateConfirmOpen\(anchorId: string\)/);
  assert.match(componentSource, /function handleRemovePortStateClick\(anchorId: string, side: "input" \| "output", stateKey: string \| null \| undefined\)/);
  assert.match(componentSource, /function handleRemovePortStateClick\(anchorId: string, side: "input" \| "output", stateKey: string \| null \| undefined\) \{[\s\S]*if \(guardLockedStateEditAttempt\(\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /emit\("remove-port-state", \{[\s\S]*nodeId: props\.nodeId,[\s\S]*side,[\s\S]*stateKey,[\s\S]*\}\);/);
  assert.match(componentSource, /class="node-card__port-pill-remove node-card__port-pill-remove--trailing"/);
  assert.match(componentSource, /class="node-card__port-pill-remove node-card__port-pill-remove--leading"/);
  assert.match(componentSource, /@click\.stop="handleRemovePortStateClick\(`agent-input:\$\{port\.key\}`,\s*'input', port\.key\)"/);
  assert.match(componentSource, /@click\.stop="handleRemovePortStateClick\(`agent-output:\$\{port\.key\}`,\s*'output', port\.key\)"/);
  assert.match(componentSource, /@click\.stop="handleRemovePortStateClick\(`condition-input:\$\{view\.body\.primaryInput\.key\}`,\s*'input', view\.body\.primaryInput\.key\)"/);
  assert.match(componentSource, /t\("nodeCard\.removeStateQuestion"\)/);
  const inputSectionMatch = componentSource.match(
    /<section v-if="view\.body\.kind === 'input'"[\s\S]*?<\/section>/,
  );
  assert.ok(inputSectionMatch, "expected to find the input node section");
  assert.doesNotMatch(inputSectionMatch[0], /node-card__port-pill-remove/);
  const outputSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'output'"[\s\S]*?<\/section>/,
  );
  assert.ok(outputSectionMatch, "expected to find the output node section");
  assert.doesNotMatch(outputSectionMatch[0], /node-card__port-pill-remove/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*width:\s*28px;/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*height:\s*28px;/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*position:\s*absolute;/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*top:\s*50%;/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*appearance:\s*none;/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*transform:\s*translateY\(-50%\);/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*border-radius:\s*999px;/);
  assert.match(componentSource, /\.node-card__port-pill--removable\.node-card__port-pill--input \{[\s\S]*padding-right:\s*39px;/);
  assert.match(componentSource, /\.node-card__port-pill--removable\.node-card__port-pill--output \{[\s\S]*padding-left:\s*39px;/);
  assert.match(componentSource, /\.node-card__port-pill-remove--leading \{[\s\S]*left:\s*7px;/);
  assert.match(componentSource, /\.node-card__port-pill-remove--trailing \{[\s\S]*right:\s*7px;/);
  assert.match(componentSource, /\.node-card__port-pill-remove--confirm,\n\.node-card__port-pill-remove--confirm:hover,\n\.node-card__port-pill-remove--confirm:focus-visible \{/);
  assert.match(componentSource, /\.node-card__port-pill-remove \{[\s\S]*z-index:\s*2;/);
  assert.match(componentSource, /\.node-card__port-pill--confirm \.node-card__port-pill-remove \{[^}]*opacity:\s*1;/);
  assert.match(componentSource, /\.node-card__port-pill--confirm \.node-card__port-pill-remove \{[^}]*pointer-events:\s*auto;/);
  assert.match(componentSource, /\.node-card__confirm-hint--remove \{[\s\S]*background:\s*rgba\(255,\s*248,\s*248,\s*0\.98\);/);
});

test("NodeCard renders condition nodes as clean control-flow proxies", () => {
  const conditionSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'condition'"[\s\S]*?<\/section>/,
  );
  assert.ok(conditionSectionMatch, "expected to find the condition node section");
  const conditionSection = conditionSectionMatch[0];

  assert.match(conditionSection, /class="node-card__condition-source-row"/);
  assert.match(conditionSection, /view\.body\.primaryInput/);
  assert.match(conditionSection, /class="node-card__port-pill[\s\S]*node-card__port-pill--input/);
  assert.match(conditionSection, /condition-input:\$\{view\.body\.primaryInput\.key\}/);
  assert.match(conditionSection, /class="node-card__condition-controls-row"/);
  assert.match(conditionSection, /<span class="node-card__control-label">\{\{ t\("nodeCard\.operator"\) \}\}<\/span>/);
  assert.match(conditionSection, /<span class="node-card__control-label">\{\{ t\("nodeCard\.value"\) \}\}<\/span>/);
  assert.match(conditionSection, /<span class="node-card__control-label">\{\{ t\("nodeCard\.maxLoops"\) \}\}<\/span>/);
  assert.match(conditionSection, /view\.body\.operatorLabel/);
  assert.match(conditionSection, /view\.body\.valueLabel/);
  assert.match(conditionSection, /:value="conditionRuleValueDraft"/);
  assert.match(conditionSection, /@blur="commitConditionRuleValue"/);
  assert.match(conditionSection, /@keydown\.enter\.prevent="handleConditionRuleValueEnter"/);
  assert.match(conditionSection, /conditionLoopLimitDraft/);
  assert.match(componentSource, /const conditionRuleValueDraft = ref\(\"\"\);/);
  assert.match(componentSource, /watch\(\s*\(\) => \(props\.node\.kind === "condition" \? props\.node\.config\.rule\.value : null\),[\s\S]*conditionRuleValueDraft\.value = ruleValue === null \|\| ruleValue === undefined \? "" : String\(ruleValue\);/);
  assert.match(componentSource, /function handleConditionRuleValueInput\(event: Event\) \{[\s\S]*conditionRuleValueDraft\.value = target\.value;/);
  assert.match(componentSource, /function commitConditionRuleValue\(\) \{[\s\S]*updateConditionRule\(\{ value: conditionRuleValueDraft\.value \}\);/);
  assert.match(componentSource, /function handleConditionRuleValueEnter\(event: KeyboardEvent\) \{[\s\S]*target\.blur\(\);/);
  assert.match(conditionSection, /type="number"/);
  assert.match(conditionSection, /:min="CONDITION_LOOP_LIMIT_MIN"/);
  assert.match(conditionSection, /:max="CONDITION_LOOP_LIMIT_MAX"/);
  assert.doesNotMatch(conditionSection, /class="node-card__condition-branch-rail"/);
  assert.doesNotMatch(conditionSection, /v-for="branch in view\.body\.routeOutputs"/);
  assert.doesNotMatch(conditionSection, /class="node-card__condition-branch-chip"/);
  assert.doesNotMatch(conditionSection, /class="node-card__condition-branch-label"/);
  assert.doesNotMatch(conditionSection, /branch\.tone/);
  assert.match(componentSource, /\.node-card__condition-panel \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(componentSource, /\.node-card__condition-controls-row \{[\s\S]*--node-card-condition-loop-column:\s*clamp\(6\.5rem,\s*22%,\s*8rem\);/);
  assert.match(componentSource, /\.node-card__condition-controls-row \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\) var\(--node-card-condition-loop-column\);/);
  assert.match(componentSource, /\.node-card__condition-controls-row > \.node-card__control-row \{[\s\S]*min-width:\s*0;/);
  assert.doesNotMatch(componentSource, /\.node-card__control-select \{[^}]*border:/);
  assert.match(componentSource, /\.node-card__port-pill-row--condition-source \{[\s\S]*width:\s*100%;/);
  assert.doesNotMatch(conditionSection, /node-card__branch-editor/);
  assert.doesNotMatch(conditionSection, /node-card__branch-list/);
  assert.doesNotMatch(conditionSection, /\+ branch/);
  assert.doesNotMatch(conditionSection, /Matches/);
  assert.doesNotMatch(conditionSection, /Route/);
});

test("NodeCard routes title and description editing through hoverable confirm triggers before opening warm popovers", () => {
  assert.match(componentSource, /class="node-card__text-trigger node-card__text-trigger--title"/);
  assert.match(componentSource, /class="node-card__text-trigger node-card__text-trigger--description"/);
  assert.match(componentSource, /:class="\{ 'node-card__text-trigger--confirm': isTextEditorConfirmOpen\('title'\) \}"/);
  assert.match(componentSource, /:class="\{ 'node-card__text-trigger--confirm': isTextEditorConfirmOpen\('description'\) \}"/);
  assert.match(componentSource, /data-text-editor-trigger="true"/);
  assert.match(componentSource, /@pointerdown="handleTextTriggerPointerDown\('title', \$event\)"/);
  assert.match(componentSource, /@pointermove="handleTextTriggerPointerMove\('title', \$event\)"/);
  assert.match(componentSource, /@pointerup="handleTextTriggerPointerUp\('title', \$event\)"/);
  assert.match(componentSource, /@pointercancel="clearTextTriggerPointerState"/);
  assert.match(componentSource, /@click\.stop\.prevent/);
  assert.match(componentSource, /@pointerdown="handleTextTriggerPointerDown\('description', \$event\)"/);
  assert.match(componentSource, /@pointermove="handleTextTriggerPointerMove\('description', \$event\)"/);
  assert.match(componentSource, /@pointerup="handleTextTriggerPointerUp\('description', \$event\)"/);
  const titleTriggerIndex = componentSource.indexOf('class="node-card__text-trigger node-card__text-trigger--title"');
  assert.notEqual(titleTriggerIndex, -1, "expected to find the title text trigger");
  assert.doesNotMatch(componentSource.slice(titleTriggerIndex, titleTriggerIndex + 400), /@pointerdown\.stop/);
  const descriptionTriggerIndex = componentSource.indexOf('class="node-card__text-trigger node-card__text-trigger--description"');
  assert.notEqual(descriptionTriggerIndex, -1, "expected to find the description text trigger");
  assert.doesNotMatch(componentSource.slice(descriptionTriggerIndex, descriptionTriggerIndex + 400), /@pointerdown\.stop/);
  assert.match(componentSource, /@keydown\.enter\.prevent="handleTextEditorAction\('title'\)"/);
  assert.match(componentSource, /@keydown\.enter\.prevent="handleTextEditorAction\('description'\)"/);
  assert.match(componentSource, /<h3 class="node-card__title">\{\{ view\.title \}\}<\/h3>/);
  assert.match(componentSource, /<p class="node-card__description">\{\{ view\.description \}\}<\/p>/);
  assert.match(componentSource, /node-card__text-trigger-confirm-icon/);
  assert.match(componentSource, /type TextEditorField = "title" \| "description";/);
  assert.match(componentSource, /const activeTextEditor = ref<TextEditorField \| null>\(null\);/);
  assert.match(componentSource, /const activeTextEditorConfirmField = ref<TextEditorField \| null>\(null\);/);
  assert.match(componentSource, /const textTriggerPointerState = ref<\{/);
  assert.match(componentSource, /const textEditorConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(componentSource, /const titleEditorDraft = ref\(""\);/);
  assert.match(componentSource, /const descriptionEditorDraft = ref\(""\);/);
  assert.match(componentSource, /const titleEditorInputRef = ref<\{ focus\?: \(\) => void \} \| null>\(null\);/);
  assert.match(componentSource, /const descriptionEditorInputRef = ref<\{ focus\?: \(\) => void \} \| null>\(null\);/);
  assert.match(componentSource, /function clearTextTriggerPointerState\(\)/);
  assert.match(componentSource, /function handleTextTriggerPointerDown\(field: TextEditorField, event: PointerEvent\)/);
  assert.match(componentSource, /function handleTextTriggerPointerMove\(field: TextEditorField, event: PointerEvent\)/);
  assert.match(componentSource, /function handleTextTriggerPointerUp\(field: TextEditorField, event: PointerEvent\)/);
  assert.match(componentSource, /if \(Math\.abs\(deltaX\) > 3 \|\| Math\.abs\(deltaY\) > 3\)/);
  assert.match(componentSource, /if \(pointerState\.moved\) \{\s*return;\s*\}/);
  assert.match(componentSource, /function isTextEditorOpen\(field: TextEditorField\)/);
  assert.match(componentSource, /function isTextEditorConfirmOpen\(field: TextEditorField\)/);
  assert.match(componentSource, /function textEditorWidth\(field: TextEditorField\)/);
  assert.match(componentSource, /function textEditorTitle\(field: TextEditorField\)/);
  assert.match(componentSource, /function textEditorDraftValue\(field: TextEditorField\)/);
  assert.match(componentSource, /function focusTextEditorField\(field: TextEditorField\)/);
  assert.match(componentSource, /function clearTextEditorConfirmTimeout\(\)/);
  assert.match(componentSource, /function clearTextEditorConfirmState\(\)/);
  assert.match(componentSource, /function startTextEditorConfirmWindow\(field: TextEditorField\)/);
  assert.match(componentSource, /function handleTextEditorAction\(field: TextEditorField\)/);
  assert.match(componentSource, /const wasConfirmOpen = isTextEditorConfirmOpen\(field\);[\s\S]*clearTextEditorConfirmState\(\);[\s\S]*if \(wasConfirmOpen\) \{[\s\S]*openTextEditor\(field\);[\s\S]*return;/);
  assert.match(componentSource, /function openTextEditor\(field: TextEditorField\)/);
  assert.match(componentSource, /function closeTextEditor\(\)/);
  assert.match(componentSource, /function handleTextEditorDraftInput\(field: TextEditorField, value: string \| number\)/);
  assert.match(componentSource, /function commitTextEditor\(field: TextEditorField \| null = activeTextEditor\.value\)/);
  assert.match(componentSource, /startTextEditorConfirmWindow\(field\);/);
  assert.match(componentSource, /focusTextEditorField\(field\);/);
  assert.match(componentSource, /emit\("update-node-metadata", \{ nodeId: props\.nodeId, patch: \{ name: nextValue \} \}\);/);
  assert.match(componentSource, /emit\("update-node-metadata", \{ nodeId: props\.nodeId, patch: \{ description: nextValue \} \}\);/);
  assert.match(componentSource, /:visible="isTextEditorOpen\('title'\) \|\| isTextEditorConfirmOpen\('title'\)"/);
  assert.match(componentSource, /:visible="isTextEditorOpen\('description'\) \|\| isTextEditorConfirmOpen\('description'\)"/);
  assert.match(componentSource, /v-if="isTextEditorConfirmOpen\('title'\)"/);
  assert.match(componentSource, /v-else-if="isTextEditorOpen\('title'\)"/);
  assert.match(componentSource, /v-if="isTextEditorConfirmOpen\('description'\)"/);
  assert.match(componentSource, /v-else-if="isTextEditorOpen\('description'\)"/);
  assert.match(componentSource, /:placement="isTextEditorOpen\('title'\) \? 'bottom-start' : 'top-start'"/);
  assert.match(componentSource, /:placement="isTextEditorOpen\('description'\) \? 'bottom-start' : 'top-start'"/);
  assert.match(componentSource, /:width="isTextEditorOpen\('title'\) \? textEditorWidth\('title'\) : undefined"/);
  assert.match(componentSource, /:width="isTextEditorOpen\('description'\) \? textEditorWidth\('description'\) : undefined"/);
  assert.match(componentSource, /\{\{ textEditorTitle\('title'\) \}\}/);
  assert.match(componentSource, /\{\{ textEditorTitle\('description'\) \}\}/);
  assert.match(componentSource, /:model-value="textEditorDraftValue\('title'\)"/);
  assert.match(componentSource, /:model-value="textEditorDraftValue\('description'\)"/);
  assert.match(componentSource, /ref="titleEditorInputRef"/);
  assert.match(componentSource, /ref="descriptionEditorInputRef"/);
  assert.doesNotMatch(componentSource, /autofocus/);
  assert.match(componentSource, /@update:model-value="handleTextEditorDraftInput\('title', \$event\)"/);
  assert.match(componentSource, /@update:model-value="handleTextEditorDraftInput\('description', \$event\)"/);
  assert.doesNotMatch(componentSource, /@blur="commitTextEditor\('title'\)"/);
  assert.doesNotMatch(componentSource, /@blur="commitTextEditor\('description'\)"/);
  assert.match(componentSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(componentSource, /t\("nodeCard\.editNameQuestion"\)/);
  assert.match(componentSource, /t\("nodeCard\.editDescriptionQuestion"\)/);
  assert.match(componentSource, /class="node-card__confirm-hint node-card__confirm-hint--text"/);
  assert.match(componentSource, /popper-class="node-card__text-editor-popper"/);
  assert.match(componentSource, /class="node-card__text-editor"/);
  assert.match(componentSource, /\.node-card__text-trigger \{[\s\S]*border:\s*1px solid transparent;/);
  assert.match(componentSource, /\.node-card__text-trigger:hover,\n\.node-card__text-trigger:focus-visible \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.94\);/);
  assert.match(componentSource, /\.node-card__text-trigger--confirm,\n\.node-card__text-trigger--confirm:hover,\n\.node-card__text-trigger--confirm:focus-visible \{[\s\S]*background:\s*rgba\(201,\s*107,\s*31,\s*0\.96\);/);
  assert.match(componentSource, /\.node-card__text-trigger-content--confirm > \.node-card__title,\n\.node-card__text-trigger-content--confirm > \.node-card__description \{[\s\S]*opacity:\s*0;/);
  assert.match(componentSource, /\.node-card__text-trigger-content--confirm > \.node-card__text-trigger-confirm-icon \{[\s\S]*opacity:\s*1;/);
  assert.match(componentSource, /\.node-card__confirm-hint--text \{[\s\S]*background:\s*rgb\(255,\s*247,\s*237\);/);
  assert.match(componentSource, /\.node-card__confirm-hint--text \{[\s\S]*color:\s*rgb\(154,\s*52,\s*18\);/);
  assert.match(componentSource, /\.node-card__text-editor \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.14\);/);
  assert.match(componentSource, /\.node-card__text-editor \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(componentSource, /\.node-card__text-editor \{[\s\S]*border-radius:\s*16px;/);
  assert.match(componentSource, /\[data-text-editor-trigger='true'\]/);
});

test("NodeCard declares top-action and state-edit events for canvas forwarding", () => {
  assert.match(componentSource, /\(event: "update-node-metadata", payload: \{ nodeId: string; patch: Partial<Pick<GraphNode, "name" \| "description">> \}\): void;/);
  assert.doesNotMatch(componentSource, /\(event: "rename-state"/);
  assert.match(componentSource, /\(event: "update-state", payload: \{ stateKey: string; patch: Partial<StateDefinition> \}\): void;/);
  assert.match(componentSource, /\(event: "remove-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string \}\): void;/);
  assert.match(componentSource, /\(event: "reorder-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string; targetStateKey: string \}\): void;/);
  assert.match(componentSource, /\(event: "delete-node", payload: \{ nodeId: string \}\): void;/);
  assert.match(componentSource, /\(event: "save-node-preset", payload: \{ nodeId: string \}\): void;/);
});

test("NodeCard lets real agent state pills drag-reorder within their own side", () => {
  assert.match(componentSource, /const PORT_REORDER_DRAG_THRESHOLD = 6;/);
  assert.match(componentSource, /const portReorderPointerState = ref<\{/);
  assert.match(componentSource, /data-port-reorder-node-id/);
  assert.match(componentSource, /data-port-reorder-side="input"/);
  assert.match(componentSource, /data-port-reorder-side="output"/);
  assert.match(componentSource, /:data-port-reorder-state-key="port\.key"/);
  assert.match(componentSource, /@pointerdown\.stop="handlePortReorderPointerDown\('input', port\.key, \$event\)"/);
  assert.match(componentSource, /@pointerdown\.stop="handlePortReorderPointerDown\('output', port\.key, \$event\)"/);
  assert.match(componentSource, /@click\.stop="handlePortStatePillClick\(`agent-input:\$\{port\.key\}`, port\.key\)"/);
  assert.match(componentSource, /@click\.stop="handlePortStatePillClick\(`agent-output:\$\{port\.key\}`, port\.key\)"/);
  assert.match(componentSource, /function resolvePortReorderTargetStateKey\(side: "input" \| "output", clientX: number, clientY: number\)/);
  assert.match(componentSource, /function handlePortReorderPointerDown\(side: "input" \| "output", stateKey: string, event: PointerEvent\)/);
  assert.match(componentSource, /emit\("reorder-port-state", \{[\s\S]*nodeId: props\.nodeId,[\s\S]*side: pointerState\.side,[\s\S]*stateKey: pointerState\.stateKey,[\s\S]*targetStateKey,[\s\S]*\}\);/);
  assert.match(componentSource, /\.node-card__port-pill--reorder-target \{/);
  assert.match(componentSource, /\.node-card__port-pill--reordering \{/);
  const createInputPill = componentSource.match(/data-agent-create-port="input"[\s\S]*?<\/span>/)?.[0] ?? "";
  const createOutputPill = componentSource.match(/data-agent-create-port="output"[\s\S]*?<\/span>/)?.[0] ?? "";
  assert.doesNotMatch(createInputPill, /data-port-reorder-state-key/);
  assert.doesNotMatch(createOutputPill, /data-port-reorder-state-key/);
});

test("NodeCard renders output previews through a rich content presenter while keeping Advanced in the top popover", () => {
  const outputSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'output'"[\s\S]*?<\/section>/,
  );
  assert.ok(outputSectionMatch, "expected to find the output node section");
  const outputSection = outputSectionMatch[0];

  assert.match(componentSource, /import \{ resolveOutputPreviewContent \} from "\.\/outputPreviewContentModel";/);
  assert.match(componentSource, /const outputPreviewContent = computed\(/);
  assert.match(componentSource, /function isOutputDisplayModeActive[\s\S]*view\.value\.body\.kind === "output" && view\.value\.body\.displayMode === displayMode/);
  assert.match(outputSection, /node-card__preview--markdown/);
  assert.match(outputSection, /v-html="outputPreviewContent\.html"/);
  assert.match(outputSection, /node-card__preview--json/);
  assert.match(outputSection, /<pre v-else class="node-card__preview-text">\{\{ outputPreviewContent\.text \}\}<\/pre>/);
  assert.match(outputSection, /node-card__preview--empty/);
  assert.doesNotMatch(outputSection, /Connected to \$\{view\.body\.connectedStateLabel/);
  assert.match(componentSource, /view\.body\.kind === 'output' \? 340 : 280/);
});

test("NodeCard uses an Element Plus switch card for output persistence like the agent thinking control", () => {
  const outputSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'output'"[\s\S]*?<\/section>/,
  );
  assert.ok(outputSectionMatch, "expected to find the output node section");
  const outputSection = outputSectionMatch[0];

  assert.match(componentSource, /import \{[\s\S]*DocumentChecked[\s\S]*Opportunity[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(outputSection, /class="node-card__output-persist-card"/);
  assert.match(outputSection, /class="node-card__output-persist-icon"/);
  assert.match(outputSection, /<DocumentChecked \/>/);
  assert.match(outputSection, /<ElSwitch/);
  assert.match(outputSection, /class="node-card__output-persist-switch"/);
  assert.match(outputSection, /:model-value="view\.body\.persistEnabled"/);
  assert.match(outputSection, /:width="56"/);
  assert.match(outputSection, /inline-prompt/);
  assert.match(outputSection, /active-text="ON"/);
  assert.match(outputSection, /inactive-text="OFF"/);
  assert.match(outputSection, /@update:model-value="handleOutputPersistToggle"/);
  assert.doesNotMatch(outputSection, /node-card__persist-button/);
  assert.doesNotMatch(outputSection, /node-card__toggle/);
  assert.match(componentSource, /function handleOutputPersistToggle\(value: string \| number \| boolean\)/);
  assert.match(componentSource, /\.node-card__output-persist-card \{[\s\S]*grid-template-columns:\s*auto 56px;/);
  assert.match(componentSource, /\.node-card__output-persist-card \{[\s\S]*min-height:\s*48px;/);
  assert.match(componentSource, /\.node-card__output-persist-card \{[\s\S]*border-radius:\s*16px;/);
  assert.match(componentSource, /\.node-card__output-persist-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\);/);
  assert.match(componentSource, /\.node-card__output-persist-switch \{[\s\S]*--el-switch-on-color:\s*#c96b1f;/);
});

test("NodeCard closes floating panels on focus loss and keeps popup surfaces on the warm theme", () => {
  assert.match(componentSource, /import \{ computed, nextTick, onBeforeUnmount, onMounted, ref, watch \} from "vue";/);
  assert.match(componentSource, /const hasFloatingPanelOpen = computed\(/);
  assert.match(componentSource, /document\.addEventListener\("pointerdown", handleGlobalFloatingPanelPointerDown\)/);
  assert.match(componentSource, /document\.addEventListener\("focusin", handleGlobalFloatingPanelFocusIn\)/);
  assert.match(componentSource, /document\.addEventListener\("keydown", handleGlobalFloatingPanelKeyDown\)/);
  assert.match(componentSource, /document\.removeEventListener\("pointerdown", handleGlobalFloatingPanelPointerDown\)/);
  assert.match(componentSource, /document\.removeEventListener\("focusin", handleGlobalFloatingPanelFocusIn\)/);
  assert.match(componentSource, /document\.removeEventListener\("keydown", handleGlobalFloatingPanelKeyDown\)/);
  assert.match(componentSource, /data-node-popup-surface="true"/);
  assert.match(componentSource, /\.node-card__text-editor-popper/);
  assert.match(componentSource, /\.node-card__skill-picker \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(componentSource, /\.node-card__skill-picker \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\);/);
  assert.match(componentSource, /\.node-card__skill-picker \{[\s\S]*box-shadow:\s*0 20px 40px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
  assert.match(componentSource, /\.node-card__port-picker \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(componentSource, /\.node-card__port-picker \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\);/);
  assert.match(componentSource, /\.node-card__port-picker \{[\s\S]*box-shadow:\s*0 20px 40px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
});
