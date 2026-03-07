import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "NodeCard.vue"), "utf8").replace(/\r\n/g, "\n");
const createPopoverSource = readFileSync(resolve(currentDirectory, "StatePortCreatePopover.vue"), "utf8").replace(/\r\n/g, "\n");
const stateEditorModelSource = readFileSync(resolve(currentDirectory, "stateEditorModel.ts"), "utf8").replace(/\r\n/g, "\n");
const textEditorComposableSource = readFileSync(resolve(currentDirectory, "useNodeCardTextEditor.ts"), "utf8").replace(/\r\n/g, "\n");
const floatingPanelsComposableSource = readFileSync(resolve(currentDirectory, "useNodeFloatingPanels.ts"), "utf8").replace(/\r\n/g, "\n");
const portReorderComposableSource = readFileSync(resolve(currentDirectory, "usePortReorder.ts"), "utf8").replace(/\r\n/g, "\n");
const agentNodeBodySource = readFileSync(resolve(currentDirectory, "AgentNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");
const inputNodeBodySource = readFileSync(resolve(currentDirectory, "InputNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");
const outputNodeBodySource = readFileSync(resolve(currentDirectory, "OutputNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");
const conditionNodeBodySource = readFileSync(resolve(currentDirectory, "ConditionNodeBody.vue"), "utf8").replace(/\r\n/g, "\n");
const topActionsSource = readFileSync(resolve(currentDirectory, "NodeCardTopActions.vue"), "utf8").replace(/\r\n/g, "\n");
const agentSkillPickerSource = readFileSync(resolve(currentDirectory, "AgentSkillPicker.vue"), "utf8").replace(/\r\n/g, "\n");
const agentRuntimeControlsSource = readFileSync(resolve(currentDirectory, "AgentRuntimeControls.vue"), "utf8").replace(/\r\n/g, "\n");
const statePortListSource = readFileSync(resolve(currentDirectory, "StatePortList.vue"), "utf8").replace(/\r\n/g, "\n");
const portListSurfaceSource = `${componentSource}\n${statePortListSource}\n${conditionNodeBodySource}`;
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
  const rightOutputColumnStart = agentNodeBodySource.indexOf('<div class="node-card__port-column node-card__port-column--right">');
  const agentRuntimeControlsStart = agentNodeBodySource.indexOf("<AgentRuntimeControls", rightOutputColumnStart);
  assert.ok(rightOutputColumnStart >= 0 && agentRuntimeControlsStart > rightOutputColumnStart, "expected to find the right-side output port column");
  const rightOutputColumn = agentNodeBodySource.slice(rightOutputColumnStart, agentRuntimeControlsStart);
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
  assert.match(componentSource, /<article[\s\S]*v-bind="\$attrs"[\s\S]*class="node-card"/);
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
  assert.match(inputNodeBodySource, /\.node-card__input-body \{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(inputNodeBodySource, /\.node-card__surface-textarea \{[\s\S]*flex:\s*1 1 auto;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*resize:\s*none;/);
  assert.match(agentNodeBodySource, /\.node-card__surface-textarea \{[\s\S]*flex:\s*1 1 auto;[\s\S]*resize:\s*none;/);
  assert.match(outputNodeBodySource, /\.node-card__output-body \{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(outputNodeBodySource, /\.node-card__surface--output \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(outputNodeBodySource, /\.node-card__preview \{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
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

test("NodeCard delegates input body presentation while keeping the output state slot", () => {
  const inputSectionMatch = componentSource.match(
    /<section v-if="view\.body\.kind === 'input'"[\s\S]*?<\/section>/,
  );
  assert.ok(inputSectionMatch, "expected to find the input node section");
  const inputSection = inputSectionMatch[0];

  assert.match(componentSource, /import InputNodeBody from "\.\/InputNodeBody\.vue";/);
  assert.match(inputSection, /<InputNodeBody[\s\S]*:body="view\.body"[\s\S]*:input-boundary-selection="inputBoundarySelection"[\s\S]*:input-type-options="inputTypeOptions"[\s\S]*:input-asset-envelope="inputAssetEnvelope"[\s\S]*@update:boundary-selection="handleInputBoundarySelection"[\s\S]*@update:knowledge-base="handleInputKnowledgeBaseSelect"[\s\S]*@asset-file-change="handleInputAssetFileChange"[\s\S]*@asset-drop="handleInputAssetDrop"[\s\S]*@clear-asset="clearInputAsset"[\s\S]*@input-value="handleInputValueInput"/);
  assert.match(inputSection, /<template #primary-output>/);
  assert.match(inputNodeBodySource, /<slot name="primary-output" \/>/);
  assert.match(inputNodeBodySource, /<ElSegmented/);
  assert.match(inputNodeBodySource, /class="node-card__input-boundary-toggle"/);
  assert.match(inputNodeBodySource, /:options="inputTypeOptions"/);
  assert.match(inputNodeBodySource, /:model-value="inputBoundarySelection"/);
  assert.match(inputNodeBodySource, /:disabled="Boolean\(inputAssetEnvelope\)"/);
  assert.match(componentSource, /from "\.\/uploadedAssetModel";/);
  assert.match(componentSource, /resolveUploadedAssetLabel\(inputAssetType\.value\)/);
  assert.match(componentSource, /resolveUploadedAssetSummary\(inputAssetEnvelope\.value\)/);
  assert.match(componentSource, /resolveUploadedAssetTextPreview\(inputAssetEnvelope\.value\)/);
  assert.match(componentSource, /resolveUploadedAssetDescription\(inputAssetEnvelope\.value, inputAssetType\.value\)/);
  assert.doesNotMatch(componentSource, /return `Stored as \$\{asset\.detectedType\} upload\. \$\{inputAssetSummary\.value\}`;/);
  assert.match(inputNodeBodySource, /<template #default="\{ item \}">/);
  assert.match(inputNodeBodySource, /class="node-card__input-boundary-icon-wrap"/);
  assert.match(inputNodeBodySource, /<component :is="item\.icon" class="node-card__input-boundary-icon" aria-hidden="true" \/>/);
  assert.match(inputNodeBodySource, /<span class="node-card__sr-only">\{\{ item\.label \}\}<\/span>/);
  assert.match(inputSection, /class="node-card__port-pill[\s\S]*node-card__port-pill--output/);
  assert.match(componentSource, /from "@element-plus\/icons-vue"/);
  assert.match(componentSource, /icon:\s*Document/);
  assert.match(componentSource, /icon:\s*FolderOpened/);
  assert.match(componentSource, /icon:\s*Collection/);
  assert.doesNotMatch(inputSection, /<ElSegmented/);
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

test("NodeCard delegates knowledge base input presentation to a model", () => {
  assert.match(componentSource, /from "\.\/inputKnowledgeBaseModel";/);
  assert.match(componentSource, /buildInputKnowledgeBaseOptions\(props\.knowledgeBases, inputKnowledgeBaseValue\.value\)/);
  assert.match(componentSource, /resolveSelectedKnowledgeBaseDescription\(\{/);
  assert.match(componentSource, /showKnowledgeBaseInput: showKnowledgeBaseInput\.value/);
  assert.match(componentSource, /selectedValue: inputKnowledgeBaseValue\.value/);
  assert.doesNotMatch(componentSource, /label: `\$\{currentValue\} \(current\)`/);
  assert.doesNotMatch(componentSource, /This knowledge base is no longer available in the imported catalog\./);
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

  assert.match(componentSource, /import AgentNodeBody from "\.\/AgentNodeBody\.vue";/);
  assert.match(agentSection, /<AgentNodeBody[\s\S]*ref="agentNodeBodyRef"[\s\S]*:model-value="agentResolvedModelValue \|\| undefined"[\s\S]*:model-options="agentModelOptions"[\s\S]*:global-model-ref="trimmedGlobalTextModelRef"[\s\S]*:thinking-mode-value="agentThinkingModeValue"[\s\S]*:thinking-options="agentThinkingOptions"[\s\S]*:thinking-enabled="agentThinkingEnabled"[\s\S]*:breakpoint-enabled="Boolean\(agentBreakpointEnabled\)"[\s\S]*@model-visible-change="handleAgentModelSelectVisibleChange"[\s\S]*@update:model-value="handleAgentModelValueChange"[\s\S]*@update:thinking-mode="handleAgentThinkingModeSelect"[\s\S]*@update:breakpoint-enabled="handleAgentBreakpointToggleValue"/);
  assert.match(agentNodeBodySource, /import AgentRuntimeControls from "\.\/AgentRuntimeControls\.vue";/);
  assert.match(agentNodeBodySource, /<AgentRuntimeControls[\s\S]*ref="runtimeControlsRef"[\s\S]*:model-value="modelValue"[\s\S]*:model-options="modelOptions"[\s\S]*:global-model-ref="globalModelRef"[\s\S]*:thinking-mode-value="thinkingModeValue"[\s\S]*:thinking-options="thinkingOptions"[\s\S]*:thinking-enabled="thinkingEnabled"[\s\S]*:breakpoint-enabled="breakpointEnabled"[\s\S]*:confirm-popover-style="confirmPopoverStyle"[\s\S]*@model-visible-change="emit\('model-visible-change', \$event\)"[\s\S]*@update:model-value="emit\('update:model-value', \$event\)"[\s\S]*@update:thinking-mode="emit\('update:thinking-mode', \$event\)"[\s\S]*@update:breakpoint-enabled="emit\('update:breakpoint-enabled', \$event\)"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-runtime-row"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-model-select-shell"/);
  assert.match(agentRuntimeControlsSource, /@pointerdown\.stop/);
  assert.match(agentRuntimeControlsSource, /@click\.stop/);
  assert.match(agentRuntimeControlsSource, /<ElSelect/);
  assert.match(agentRuntimeControlsSource, /ref="agentModelSelectRef"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-model-select graphite-select"/);
  assert.match(agentRuntimeControlsSource, /@visible-change="emit\('model-visible-change', \$event\)"/);
  assert.match(agentRuntimeControlsSource, /popper-class="graphite-select-popper node-card__agent-model-popper"/);
  assert.equal(
    [...agentRuntimeControlsSource.matchAll(/<ElPopover\s+trigger="hover"\s+placement="top-start"[\s\S]*?popper-class="node-card__agent-toggle-hint-popper"/g)]
      .length,
    2,
  );
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-toggle-card node-card__agent-toggle-card--thinking"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-thinking-icon"/);
  assert.match(agentRuntimeControlsSource, /<ElSelect/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-thinking-select graphite-select"/);
  assert.match(agentRuntimeControlsSource, /:model-value="thinkingModeValue"/);
  assert.match(agentRuntimeControlsSource, /v-for="option in thinkingOptions"/);
  assert.match(agentRuntimeControlsSource, /@update:model-value="emit\('update:thinking-mode', \$event\)"/);
  assert.doesNotMatch(agentRuntimeControlsSource, /class="node-card__agent-toggle-switch node-card__agent-thinking-switch"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__confirm-hint node-card__confirm-hint--toggle">\{\{ t\("nodeCard\.thinkingMode"\) \}\}<\/div>/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-toggle-card node-card__agent-toggle-card--breakpoint"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-breakpoint-icon"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-toggle-switch node-card__agent-breakpoint-switch"/);
  assert.match(agentRuntimeControlsSource, /:model-value="breakpointEnabled"/);
  assert.match(agentRuntimeControlsSource, /@update:model-value="emit\('update:breakpoint-enabled', \$event\)"/);
  assert.match(agentRuntimeControlsSource, /class="node-card__confirm-hint node-card__confirm-hint--toggle">\{\{ t\("nodeCard\.setBreakpoint"\) \}\}<\/div>/);
  assert.doesNotMatch(agentRuntimeControlsSource, /class="node-card__agent-breakpoint-button"/);
  assert.doesNotMatch(agentRuntimeControlsSource, /node-card__agent-thinking-inline/);
  assert.doesNotMatch(agentRuntimeControlsSource, /node-card__agent-thinking-shell/);
  assert.doesNotMatch(agentRuntimeControlsSource, /class="node-card__agent-thinking-label"/);
  assert.doesNotMatch(agentRuntimeControlsSource, /class="node-card__agent-thinking-state"/);
  assert.doesNotMatch(agentRuntimeControlsSource, />Thinking</);
  assert.doesNotMatch(agentRuntimeControlsSource, /class="node-card__chip-row"/);
  assert.doesNotMatch(agentRuntimeControlsSource, /class="node-card__agent-thinking-toggle"/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-runtime-row \{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-model-select-shell \{[\s\S]*width:\s*100%;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{[\s\S]*grid-template-columns:\s*20px\s*56px;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card--thinking \{[\s\S]*grid-template-columns:\s*20px\s*minmax\(0,\s*1fr\);/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{[\s\S]*width:\s*100%;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{[\s\S]*min-height:\s*48px;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{[\s\S]*border-radius:\s*16px;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\);/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-toggle-card \{[\s\S]*padding:\s*0 14px;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__confirm-hint--toggle \{[\s\S]*background:\s*rgb\(255,\s*247,\s*237\);/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-thinking-icon \{[\s\S]*width:\s*20px;/);
  assert.match(agentRuntimeControlsSource, /\.node-card__agent-thinking-icon \{[\s\S]*height:\s*20px;/);
  assert.doesNotMatch(agentRuntimeControlsSource, /\.node-card__agent-thinking-icon \{[^}]*background:/);
  assert.match(componentSource, /const agentThinkingOptions = computed/);
  const thinkingOptions = componentSource.match(/const agentThinkingOptions = computed[\s\S]*?\]\);/);
  assert.ok(thinkingOptions, "expected agent thinking options");
  assert.match(
    thinkingOptions[0],
    /value:\s*"off"[\s\S]*label:\s*t\("nodeCard\.thinkingOff"\)[\s\S]*value:\s*"low"[\s\S]*label:\s*t\("nodeCard\.thinkingLow"\)[\s\S]*value:\s*"medium"[\s\S]*label:\s*t\("nodeCard\.thinkingMedium"\)[\s\S]*value:\s*"high"[\s\S]*label:\s*t\("nodeCard\.thinkingHigh"\)[\s\S]*value:\s*"xhigh"[\s\S]*label:\s*t\("nodeCard\.thinkingExtraHigh"\)/,
  );
  assert.doesNotMatch(thinkingOptions[0], /value:\s*"auto"/);
  assert.match(componentSource, /from "\.\/agentConfigModel";/);
  assert.match(componentSource, /normalizeAgentThinkingMode\(props\.node\.config\.thinkingMode\)/);
  assert.match(componentSource, /resolveAgentTemperatureInputValue\(value\)/);
  assert.doesNotMatch(componentSource, /function normalizeAgentThinkingMode/);
  assert.doesNotMatch(componentSource, /const nextValue = typeof value === "number" \? value : value === "" \? DEFAULT_AGENT_TEMPERATURE : Number\(value\);/);
  assert.match(componentSource, /agentBreakpointEnabled\?:\s*boolean;/);
  assert.match(componentSource, /agentBreakpointTiming\?:\s*"before" \| "after";/);
  assert.match(componentSource, /\(event: "toggle-agent-breakpoint", payload: \{ nodeId: string; enabled: boolean \}\): void;/);
  assert.match(componentSource, /\(event: "update-agent-breakpoint-timing", payload: \{ nodeId: string; timing: "before" \| "after" \}\): void;/);
  assert.match(componentSource, /function handleAgentBreakpointToggleValue\(value: string \| number \| boolean\) \{/);
  assert.match(componentSource, /emit\("toggle-agent-breakpoint", \{ nodeId: props\.nodeId, enabled: value \}\);/);
  assert.match(componentSource, /@update:agent-breakpoint-timing="handleAgentBreakpointTimingSelect"/);
  assert.match(topActionsSource, /class="node-card__breakpoint-timing-select graphite-select"/);
  assert.match(topActionsSource, /:model-value="agentBreakpointTimingValue"/);
  assert.match(topActionsSource, /@update:model-value="emit\('update:agent-breakpoint-timing', \$event\)"/);
  assert.match(topActionsSource, /t\('nodeCard\.runAfter'\)/);
  assert.match(topActionsSource, /t\('nodeCard\.runBefore'\)/);
  assert.match(componentSource, /const agentNodeBodyRef = ref<\{ collapseModelSelect\?: \(\) => void \} \| null>\(null\);/);
  assert.match(componentSource, /function collapseAgentModelSelect\(\) \{[\s\S]*agentNodeBodyRef\.value\?\.collapseModelSelect\?\.\(\);[\s\S]*\}/);
  assert.match(componentSource, /collapseAgentModelSelect\(\);/);
  assert.doesNotMatch(agentSection, /class="node-card__agent-runtime-row"/);
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

  assert.match(agentSection, /<AgentNodeBody/);
  assert.match(agentNodeBodySource, /<AgentRuntimeControls/);
  assert.match(agentRuntimeControlsSource, /class="node-card__agent-model-select graphite-select"/);
  assert.match(agentRuntimeControlsSource, /v-for="option in modelOptions"/);
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

  assert.match(agentNodeBodySource, /import AgentSkillPicker from "\.\/AgentSkillPicker\.vue";/);
  assert.match(agentNodeBodySource, /<AgentSkillPicker[\s\S]*:open="skillPickerOpen"[\s\S]*:show-trigger="showSkillPickerTrigger"[\s\S]*:available-skill-definitions="availableSkillDefinitions"[\s\S]*:attached-skill-badges="attachedSkillBadges"[\s\S]*@toggle="emit\('toggle-skill-picker'\)"[\s\S]*@attach="emit\('attach-skill', \$event\)"[\s\S]*@remove="emit\('remove-skill', \$event\)"/);
  assert.match(agentSection, /@toggle-skill-picker="toggleSkillPicker"[\s\S]*@attach-skill="attachAgentSkill"[\s\S]*@remove-skill="removeAgentSkill"/);
  assert.match(agentSkillPickerSource, /<ElPopover[\s\S]*:visible="open"[\s\S]*popper-class="node-card__agent-add-popover-popper"/);
  assert.match(agentSkillPickerSource, /class="node-card__agent-add-popover node-card__skill-picker"/);
  assert.match(agentSkillPickerSource, /@click\.stop="emit\('toggle'\)"/);
  assert.match(componentSource, /from "\.\/skillPickerModel";/);
  assert.match(componentSource, /resolveAttachAgentSkillPatch/);
  assert.match(componentSource, /resolveRemoveAgentSkillPatch/);
  assert.match(componentSource, /const patch = resolveAttachAgentSkillPatch\(props\.node\.config\.skills, skillKey\);/);
  assert.match(componentSource, /const patch = resolveRemoveAgentSkillPatch\(props\.node\.config\.skills, skillKey\);/);
  assert.match(componentSource, /function attachAgentSkill\(skillKey: string\) \{[\s\S]*if \(!patch\) \{[\s\S]*return;[\s\S]*\}[\s\S]*emitAgentConfigPatch\(patch\);/);
  assert.match(componentSource, /function removeAgentSkill\(skillKey: string\) \{[\s\S]*if \(!patch\) \{[\s\S]*return;[\s\S]*\}[\s\S]*emitAgentConfigPatch\(patch\);/);
  assert.doesNotMatch(componentSource, /props\.node\.config\.skills\.includes\(skillKey\)/);
  assert.doesNotMatch(componentSource, /props\.node\.config\.skills\.filter\(\(candidateKey\) => candidateKey !== skillKey\)/);
  assert.match(agentSection, /@open-create="openPortStateCreate"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('input'\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('output'\)"/);
  assert.match(componentSource, /import StatePortCreatePopover from "\.\/StatePortCreatePopover\.vue";/);
  assert.doesNotMatch(agentSection, /<StatePortCreatePopover/);
  assert.match(statePortListSource, /<StatePortCreatePopover/);
  assert.match(statePortListSource, /node-card__port-pill--input node-card__port-pill--dock-start/);
  assert.match(statePortListSource, /node-card__port-pill--output node-card__port-pill--dock-end/);
  assert.match(statePortListSource, /node-card__port-pill--create/);
  assert.match(agentSection, /pendingStateInputTarget\?\.label \?\? pendingStateInputSource\?\.label \?\? '\+ input'/);
  assert.match(agentSection, /pendingStateOutputTarget\?\.label \?\? '\+ output'/);
  assert.match(createPopoverSource, /<ElSelect[\s\S]*class="node-card__control-select graphite-select"[\s\S]*popper-class="graphite-select-popper node-card__port-picker-select-popper"/);
  assert.doesNotMatch(agentSection, /t\("nodeCard\.key"\)/);
  assert.doesNotMatch(agentSection, /portStateDraft\.key/);
  assert.doesNotMatch(agentSection, /class="node-card__port-state-key"/);
  assert.doesNotMatch(componentSource, /handlePortDraftKey/);
  assert.match(createPopoverSource, /class="node-card__port-picker-color-option"/);
  assert.match(createPopoverSource, /class="node-card__port-picker-color-dot"/);
  assert.match(createPopoverSource, /const colorOptions = computed\(\(\) => resolveStateColorOptions\(props\.draft\.definition\.color \?\? ""\)\);/);
  assert.match(componentSource, /const transparentPopoverStyle = \{/);
  assert.match(componentSource, /const agentAddPopoverStyle = transparentPopoverStyle;/);
  assert.match(componentSource, /"--el-popover-bg-color":\s*"transparent"/);
  assert.match(agentSkillPickerSource, /\.node-card__agent-add-popover \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(createPopoverSource, /\.node-card__agent-create-port-popover \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(componentSource, /:deep\(\.node-card__agent-add-popover-popper\.el-popper\) \{[\s\S]*background:\s*transparent;/);
  assert.equal((componentSource.match(/<StatePortCreatePopover/g) ?? []).length, 2);
  assert.equal((statePortListSource.match(/<StatePortCreatePopover/g) ?? []).length, 1);
  assert.equal((conditionNodeBodySource.match(/<StatePortCreatePopover/g) ?? []).length, 1);
  assert.doesNotMatch(agentSection, /v-for="picker in agentPortPickerActions"/);
  assert.doesNotMatch(agentSection, /@click\.stop="openPortPicker\(picker\.side\)"/);
  assert.doesNotMatch(componentSource, /const agentPortPickerActions/);
  assert.doesNotMatch(agentSection, /node-card__action-pill--input/);
  assert.doesNotMatch(agentSection, /node-card__action-pill--output/);
  assert.doesNotMatch(agentSection, /<div v-if="activePortPickerSide" class="node-card__port-picker"/);
  assert.doesNotMatch(agentSection, /<div v-if="isSkillPickerOpen" class="node-card__skill-picker"/);
  assert.doesNotMatch(agentSection, /v-for="definition in availableSkillDefinitions"/);
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
  assert.match(componentSource, /pendingStateInputTarget\?: \{ stateKey: string; label: string; stateColor: string \} \| null;/);
  assert.match(componentSource, /pendingStateOutputTarget\?: \{ stateKey: string; label: string; stateColor: string \} \| null;/);
  assert.match(componentSource, /const agentInputPorts = computed<NodePortViewModel\[\]>\(\(\) =>/);
  assert.match(componentSource, /const agentOutputPorts = computed<NodePortViewModel\[\]>\(\(\) =>/);
  assert.match(componentSource, /filter\(\(port\) => !port\.virtual\)/);
  assert.match(componentSource, /VIRTUAL_ANY_OUTPUT_STATE_KEY/);
  assert.match(componentSource, /function openPortStateCreate\(side: "input" \| "output"\)/);
  assert.match(componentSource, /createStateDraftFromQuery\("", Object\.keys\(props\.stateSchema\)\)/);
  assert.match(agentNodeBodySource, /<StatePortList[\s\S]*side="input"[\s\S]*:ports="orderedInputPorts"/);
  assert.match(agentNodeBodySource, /<StatePortList[\s\S]*side="output"[\s\S]*:ports="orderedOutputPorts"/);
  assert.match(agentSection, /:ordered-input-ports="orderedAgentInputPorts"/);
  assert.match(agentSection, /:ordered-output-ports="orderedAgentOutputPorts"/);
  assert.match(statePortListSource, /v-for="port in ports"/);
  assert.match(componentSource, /const shouldShowAgentCreateInputPort = computed\(\(\) => agentInputPorts\.value\.length === 0\);/);
  assert.match(componentSource, /const shouldShowAgentCreateOutputPort = computed\(\(\) => agentOutputPorts\.value\.length === 0\);/);
  assert.match(componentSource, /const shouldRevealAgentCreateInputPort = computed\(\(\) =>[\s\S]*shouldShowAgentCreateInputPort\.value[\s\S]*props\.selected[\s\S]*props\.hovered[\s\S]*hasFloatingPanelOpen\.value/);
  assert.match(componentSource, /const shouldRevealAgentCreateOutputPort = computed\(\(\) =>[\s\S]*shouldShowAgentCreateOutputPort\.value[\s\S]*props\.selected[\s\S]*props\.hovered[\s\S]*hasFloatingPanelOpen\.value/);
  assert.match(statePortListSource, /:data-agent-create-port="side"/);
  assert.match(statePortListSource, /'node-card__port-pill-row--create-visible': createVisible/);
  assert.match(agentSection, /:input-create-visible="shouldRevealAgentCreateInputPort"/);
  assert.match(agentSection, /:output-create-visible="shouldRevealAgentCreateOutputPort"/);
  assert.match(agentSection, /@open-create="openPortStateCreate"/);
  assert.match(statePortListSource, /@click\.stop="emit\('open-create', side\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('input'\)"/);
  assert.doesNotMatch(agentSection, /@dblclick\.stop="openPortStateCreate\('output'\)"/);
  assert.match(componentSource, /const agentCreateInputAnchorStateKey = computed\(\(\) =>/);
  assert.match(componentSource, /props\.pendingStateInputSource \? CREATE_AGENT_INPUT_STATE_KEY : VIRTUAL_ANY_INPUT_STATE_KEY/);
  assert.match(agentSection, /:input-create-anchor-state-key="agentCreateInputAnchorStateKey"/);
  assert.match(agentSection, /:output-create-anchor-state-key="VIRTUAL_ANY_OUTPUT_STATE_KEY"/);
  assert.match(statePortListSource, /:data-anchor-slot-id="\`\$\{nodeId\}:state-in:\$\{createAnchorStateKey\}\`"/);
  assert.match(statePortListSource, /:data-anchor-slot-id="\`\$\{nodeId\}:state-out:\$\{createAnchorStateKey\}\`"/);
  assert.match(statePortListSource, /node-card__port-pill--create/);
  assert.match(agentSection, /pendingStateInputTarget\?\.label \?\? pendingStateInputSource\?\.label \?\? '\+ input'/);
  assert.match(agentSection, /pendingStateOutputTarget\?\.label \?\? '\+ output'/);
  assert.match(agentSection, /pendingStateOutputTarget\?\.stateColor \?\? VIRTUAL_ANY_OUTPUT_COLOR/);
  assert.doesNotMatch(componentSource, /const shouldRenderPendingStateInputCapsule = computed/);
  assert.doesNotMatch(agentSection, /node-card__port-pill-create-badge/);
  assert.doesNotMatch(agentSection, /t\("common\.new"\)/);
  assert.match(agentSection, /pendingStateInputTarget\?\.stateColor \?\? pendingStateInputSource\?\.stateColor \?\? '#16a34a'/);
  assert.match(portListSurfaceSource, /\.node-card__port-pill--create \{[^}]*border-style:\s*dashed;/);
  assert.match(portListSurfaceSource, /\.node-card__port-pill--create \{[^}]*background:\s*color-mix\(in srgb,\s*var\(--node-card-port-accent\) 10%, transparent\);/);
  assert.match(portListSurfaceSource, /\.node-card__port-pill--create \{[^}]*box-shadow:\s*none;/);
  assert.match(portListSurfaceSource, /\.node-card__port-pill--create \{[^}]*color:\s*var\(--node-card-port-accent\);/);
  assert.doesNotMatch(componentSource, /\.node-card__port-pill--create \{[^}]*background:\s*transparent;/);
  const createRowStyle = statePortListSource.match(/\.node-card__port-pill-row--create \{[\s\S]*?\}/);
  assert.ok(createRowStyle, "expected create port row style");
  assert.match(createRowStyle[0], /display:\s*none;/);
  assert.doesNotMatch(createRowStyle[0], /max-height:/);
  assert.doesNotMatch(createRowStyle[0], /opacity:/);
  assert.match(statePortListSource, /\.node-card__port-pill-row--create-visible \{/);
  const visibleCreateRowStyle = statePortListSource.match(/\.node-card__port-pill-row--create-visible \{[\s\S]*?\}/);
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
  const rightOutputColumnStart = agentNodeBodySource.indexOf('<div class="node-card__port-column node-card__port-column--right">');
  const agentRuntimeControlsStart = agentNodeBodySource.indexOf("<AgentRuntimeControls", rightOutputColumnStart);
  assert.ok(rightOutputColumnStart >= 0 && agentRuntimeControlsStart > rightOutputColumnStart, "expected to find the agent output port column");
  const agentOutputPortSection = agentNodeBodySource.slice(rightOutputColumnStart, agentRuntimeControlsStart);

  assert.match(statePortListSource, /'node-card__port-pill--removable': !port\.virtual/);
  assert.match(componentSource, /const agentOutputPorts = computed<NodePortViewModel\[\]>\(\(\) =>[\s\S]*filter\(\(port\) => !port\.virtual\)/);
  assert.match(statePortListSource, /:data-agent-create-port="side"/);
  assert.match(agentOutputPortSection, /:create-anchor-state-key="outputCreateAnchorStateKey"/);
  assert.match(statePortListSource, /:data-anchor-slot-id="\`\$\{nodeId\}:state-out:\$\{createAnchorStateKey\}\`"/);
  assert.match(componentSource, /@port-click="handlePortStatePillClick"/);
  assert.match(statePortListSource, /@click\.stop="emit\('port-click', anchorId\(port\.key\), port\.key\)"/);
  assert.match(statePortListSource, /v-if="side === 'output' && !port\.virtual"[\s\S]*node-card__port-pill-remove/);
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

  assert.match(componentSource, /import ConditionNodeBody from "\.\/ConditionNodeBody\.vue";/);
  assert.match(conditionSection, /<ConditionNodeBody[\s\S]*:body="view\.body"[\s\S]*:node-id="nodeId"/);
  assert.match(outputSection, /'node-card__port-pill--create': view\.body\.primaryInput\.virtual/);
  assert.match(conditionNodeBodySource, /'node-card__port-pill--create': body\.primaryInput\.virtual/);
  assert.match(outputSection, /view\.body\.primaryInput\.virtual[\s\S]*isPortCreateOpen\('input'\)/);
  assert.match(conditionNodeBodySource, /body\.primaryInput\.virtual[\s\S]*isPortCreateOpen\('input'\)/);
  assert.match(outputSection, /@click\.stop="view\.body\.primaryInput\.virtual \? openPortStateCreate\('input'\) : handleStateEditorActionClick/);
  assert.match(conditionNodeBodySource, /@click\.stop="body\.primaryInput\.virtual \? emit\('open-create', 'input'\) : emit\('source-click', conditionInputAnchorId, body\.primaryInput\.key\)"/);
  assert.match(outputSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-in:\$\{view\.body\.primaryInput\.key\}\`"/);
  assert.match(conditionNodeBodySource, /:data-anchor-slot-id="\`\$\{nodeId\}:state-in:\$\{body\.primaryInput\.key\}\`"/);
  assert.match(outputSection, /view\.body\.primaryInput\.virtual && isPortCreateOpen\('input'\) && portStateDraft/);
  assert.match(conditionNodeBodySource, /body\.primaryInput\.virtual && isPortCreateOpen\('input'\) && portStateDraft/);
  assert.doesNotMatch(outputSection, />any</);
  assert.doesNotMatch(conditionNodeBodySource, />any</);
});

test("NodeCard renders empty input outputs as virtual plus output create pills", () => {
  const inputSectionMatch = componentSource.match(
    /<section v-if="view\.body\.kind === 'input'"[\s\S]*?<\/section>/,
  );
  assert.ok(inputSectionMatch, "expected to find the input node section");
  const inputSection = inputSectionMatch[0];

  assert.match(inputSection, /'node-card__port-pill--create': view\.body\.primaryOutput\.virtual/);
  assert.match(inputSection, /view\.body\.primaryOutput\.virtual \? \(pendingStateOutputTarget\?\.stateColor \?\? view\.body\.primaryOutput\.stateColor\) : view\.body\.primaryOutput\.stateColor/);
  assert.match(inputSection, /view\.body\.primaryOutput\.virtual \? \(pendingStateOutputTarget\?\.label \?\? view\.body\.primaryOutput\.label\) : view\.body\.primaryOutput\.label/);
  assert.match(inputSection, /@click\.stop="view\.body\.primaryOutput\.virtual \? openPortStateCreate\('output'\) : handleStateEditorActionClick/);
  assert.match(inputSection, /:data-anchor-slot-id="\`\$\{nodeId\}:state-out:\$\{view\.body\.primaryOutput\.key\}\`"/);
  assert.match(inputSection, /view\.body\.primaryOutput\.virtual && isPortCreateOpen\('output'\) && portStateDraft/);
  assert.match(inputSection, /<StatePortCreatePopover/);
  assert.doesNotMatch(inputSection, />any</);
});

test("NodeCard moves node actions into hoverable top buttons built from Element Plus icons and overlays", () => {
  assert.match(componentSource, /import NodeCardTopActions from "\.\/NodeCardTopActions\.vue";/);
  assert.match(componentSource, /<NodeCardTopActions[\s\S]*:active-top-action="activeTopAction"[\s\S]*:human-review-pending="humanReviewPending"/);
  assert.match(componentSource, /@toggle-advanced="toggleAdvancedPanel"/);
  assert.match(componentSource, /@delete-action="handleDeleteActionClick"/);
  assert.match(componentSource, /@preset-action="handlePresetActionClick"/);
  assert.match(componentSource, /@human-review="handleHumanReviewActionClick"/);
  assert.match(topActionsSource, /import \{[\s\S]*ElButton,[\s\S]*ElPopover[\s\S]*\} from "element-plus";/);
  assert.match(topActionsSource, /import \{[\s\S]*CollectionTag[\s\S]*Delete[\s\S]*Operation[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(topActionsSource, /class="node-card__top-actions"/);
  assert.match(topActionsSource, /node-card__top-action-button/);
  assert.match(topActionsSource, /class="node-card__top-action-button node-card__top-action-button--advanced"/);
  assert.match(topActionsSource, /class="node-card__top-action-button node-card__top-action-button--preset"/);
  assert.match(topActionsSource, /class="node-card__top-action-button node-card__top-action-button--delete"/);
  assert.match(topActionsSource, /@click\.stop="emit\('toggle-advanced'\)"/);
  assert.match(topActionsSource, /:show-arrow="false"/);
  assert.match(topActionsSource, /:popper-style="actionPopoverStyle"/);
  assert.match(componentSource, /import \{ useNodeFloatingPanels \} from "\.\/useNodeFloatingPanels";/);
  assert.match(componentSource, /const \{[\s\S]*activeTopAction,[\s\S]*addGlobalFloatingPanelListeners,[\s\S]*clearTopActionConfirmState,[\s\S]*clearTopActionTimeout,[\s\S]*removeGlobalFloatingPanelListeners,[\s\S]*startTopActionConfirmWindow,[\s\S]*\} = useNodeFloatingPanels\(\{/);
  assert.match(floatingPanelsComposableSource, /export type NodeTopAction = "advanced" \| "delete" \| "preset";/);
  assert.match(floatingPanelsComposableSource, /const activeTopAction = ref<NodeTopAction \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /const topActionTimeoutRef = ref<unknown \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /function clearTopActionConfirmState\(\)/);
  assert.match(floatingPanelsComposableSource, /function startTopActionConfirmWindow\(action: "delete" \| "preset"\)/);
  assert.match(componentSource, /if \(activeTopAction\.value === "delete"\) \{[\s\S]*confirmDeleteNode\(\);[\s\S]*return;/);
  assert.match(componentSource, /if \(activeTopAction\.value === "preset"\) \{[\s\S]*confirmSavePreset\(\);[\s\S]*return;/);
  assert.match(topActionsSource, /@click\.stop="emit\('delete-action'\)"/);
  assert.match(topActionsSource, /@click\.stop="emit\('preset-action'\)"/);
  assert.match(topActionsSource, /:visible="activeTopAction === 'preset'"/);
  assert.match(topActionsSource, /placement="top"/);
  assert.match(topActionsSource, /:popper-style="confirmPopoverStyle"/);
  assert.match(topActionsSource, /t\("nodeCard\.savePresetQuestion"\)/);
  assert.match(componentSource, /const canSavePreset = computed\(\(\) => props\.node\.kind === "agent"\);/);
  assert.match(topActionsSource, /:visible="activeTopAction === 'delete'"/);
  assert.match(topActionsSource, /t\("nodeCard\.deleteNodeQuestion"\)/);
  assert.match(componentSource, /const confirmPopoverStyle = \{/);
  assert.match(componentSource, /const transparentPopoverStyle = \{/);
  assert.match(componentSource, /const actionPopoverStyle = transparentPopoverStyle;/);
  assert.match(componentSource, /"--el-popover-bg-color":\s*"transparent"/);
  assert.match(topActionsSource, /node-card__top-action-button--confirm/);
  assert.match(componentSource, /\.node-card \{[\s\S]*overflow:\s*visible;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*top:\s*0;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*right:\s*18px;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*z-index:\s*12;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*transform:\s*translateY\(calc\(-100% - 8px\)\);/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*gap:\s*8px;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*padding:\s*8px;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.14\);/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*border-radius:\s*999px;/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*background:\s*var\(--graphite-glass-bg\);/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*box-shadow:\s*var\(--graphite-glass-shadow\),\s*var\(--graphite-glass-highlight\),\s*var\(--graphite-glass-rim\);/);
  assert.match(topActionsSource, /\.node-card__top-actions \{[\s\S]*backdrop-filter:\s*blur\(24px\) saturate\(1\.6\) contrast\(1\.02\);/);
  assert.match(topActionsSource, /\.node-card__top-actions::before \{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\);/);
  assert.match(topActionsSource, /\.node-card__top-actions::after \{[\s\S]*bottom:\s*-12px;/);
  assert.match(topActionsSource, /\.node-card__top-actions::after \{[\s\S]*height:\s*12px;/);
  assert.match(topActionsSource, /\.node-card__top-actions:hover \{[\s\S]*opacity:\s*1;/);
  assert.match(topActionsSource, /\.node-card__top-actions:hover \{[\s\S]*pointer-events:\s*auto;/);
  assert.match(topActionsSource, /\.node-card__top-action-button \{[\s\S]*width:\s*56px;/);
  assert.match(topActionsSource, /\.node-card__top-action-button \{[\s\S]*height:\s*40px;/);
  assert.match(topActionsSource, /\.node-card__top-action-button \{[\s\S]*border-radius:\s*999px;/);
  assert.match(topActionsSource, /\.node-card__top-action-button \{[\s\S]*box-shadow:\s*none;/);
  assert.match(topActionsSource, /\.node-card__top-action-button :deep\(\.el-icon\) \{[\s\S]*font-size:\s*1\.18rem;/);
  assert.match(topActionsSource, /\.node-card__top-popover \{[\s\S]*padding:\s*12px;/);
  assert.match(topActionsSource, /\.node-card__top-popover \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.14\);/);
  assert.match(topActionsSource, /\.node-card__top-popover \{[\s\S]*border-radius:\s*14px;/);
  assert.match(topActionsSource, /\.node-card__top-popover \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(topActionsSource, /\.node-card__top-popover \{[\s\S]*box-shadow:\s*0 16px 34px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
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
  assert.match(componentSource, /:human-review-pending="humanReviewPending"/);
  assert.match(topActionsSource, /v-if="humanReviewPending"/);
  assert.match(topActionsSource, /class="node-card__human-review-button"/);
  assert.match(topActionsSource, /@click\.stop="emit\('human-review'\)"/);
  assert.match(componentSource, /function handleHumanReviewActionClick\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(topActionsSource, /t\("nodeCard\.humanReview"\)/);
  assert.match(componentSource, /const isTopActionVisible = computed\(\(\) => props\.humanReviewPending \|\| props\.selected \|\| activeTopAction\.value !== null\);/);
  assert.match(topActionsSource, /\.node-card__human-review-button \{[\s\S]*background:\s*rgba\(217,\s*119,\s*6,\s*0\.12\);/);
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
  assert.match(componentSource, /function handleAgentBreakpointToggleValue\(value: string \| number \| boolean\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function toggleAdvancedPanel\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function toggleSkillPicker\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function openPortStateCreate\(side: "input" \| "output"\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
  assert.match(componentSource, /function commitPortStateCreate\(\)[\s\S]*if \(guardLockedGraphInteraction\(\)\) \{[\s\S]*return;/);
});

test("NodeCard reveals state pills on hover and opens state editing only after a confirm click", () => {
  assert.match(componentSource, /interactionLocked\?: boolean;/);
  assert.match(componentSource, /\(event: "locked-edit-attempt"\): void;/);
  assert.match(componentSource, /import StateEditorPopover from "\.\/StateEditorPopover\.vue";/);
  assert.match(statePortListSource, /@click\.stop="emit\('port-click', anchorId\(port\.key\), port\.key\)"/);
  assert.match(componentSource, /@port-click="handlePortStatePillClick"/);
  assert.match(componentSource, /onPortPillClick: \(anchorId, stateKey\) => \{[\s\S]*handleStateEditorActionClick\(anchorId, stateKey\);[\s\S]*\},/);
  assert.match(componentSource, /const stateEditorDraft = ref<StateFieldDraft \| null>\(null\);/);
  assert.match(componentSource, /const activeStateEditorAnchorId = ref<string \| null>\(null\);/);
  assert.match(componentSource, /activeStateEditorConfirmAnchorId,[\s\S]*activeTopAction,/);
  assert.match(componentSource, /const hoveredStateEditorPillAnchorId = ref<string \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /const activeStateEditorConfirmAnchorId = ref<string \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /const stateEditorConfirmTimeoutRef = ref<unknown \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /function clearStateEditorConfirmState\(\)/);
  assert.match(floatingPanelsComposableSource, /function startStateEditorConfirmWindow\(anchorId: string\)/);
  assert.match(componentSource, /function handleStateEditorPillPointerEnter\(anchorId: string\)/);
  assert.match(componentSource, /function handleStateEditorPillPointerLeave\(anchorId: string\)/);
  assert.match(componentSource, /function handleStateEditorActionClick\(anchorId: string, stateKey: string \| null \| undefined\)/);
  assert.match(componentSource, /function guardLockedStateEditAttempt\(\)/);
  assert.match(componentSource, /emit\("locked-edit-attempt"\);/);
  assert.match(componentSource, /@pointer-enter="handleStateEditorPillPointerEnter"/);
  assert.match(componentSource, /@pointer-leave="handleStateEditorPillPointerLeave"/);
  assert.match(statePortListSource, /@pointerenter="emit\('pointer-enter', anchorId\(port\.key\)\)"/);
  assert.match(statePortListSource, /@pointerleave="emit\('pointer-leave', anchorId\(port\.key\)\)"/);
  assert.match(componentSource, /if \(guardLockedStateEditAttempt\(\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /if \(activeStateEditorConfirmAnchorId\.value === anchorId\) \{[\s\S]*openStateEditor\(anchorId, stateKey\);[\s\S]*return;/);
  assert.match(componentSource, /startStateEditorConfirmWindow\(anchorId\);/);
  assert.match(componentSource, /emit\("update-state", \{[\s\S]*stateKey:/);
  assert.doesNotMatch(componentSource, /@update:key="handleStateEditorKeyInput"/);
  assert.doesNotMatch(componentSource, /function handleStateEditorKeyInput/);
  assert.doesNotMatch(componentSource, /emit\("rename-state"/);
  assert.match(
    statePortListSource,
    /<ElPopover[\s\S]*:visible="[\s\S]*isStateEditorOpen\([^"]+\)[\s\S]*isStateEditorConfirmOpen\([^"]+\)/,
  );
  assert.match(
    statePortListSource,
    /:width="isStateEditorOpen\([^"]+\) \? 320 : undefined"/,
  );
  assert.match(
    statePortListSource,
    /:placement="isStateEditorOpen\([^"]+\) \? editorPlacement : confirmPlacement"/,
  );
  assert.match(statePortListSource, /<StateEditorPopover/);
  assert.match(statePortListSource, /t\("nodeCard\.editStateQuestion"\)/);
  assert.match(statePortListSource, /node-card__port-pill--revealed/);
  assert.match(statePortListSource, /node-card__port-pill--confirm/);
  assert.match(statePortListSource, /node-card__port-pill-confirm-icon/);
  assert.match(statePortListSource, /node-card__port-pill-label-text/);
  assert.match(statePortListSource, /node-card__port-pill-label--confirm/);
  assert.match(statePortListSource, /:show-arrow="false"/);
  assert.match(agentNodeBodySource, /:popover-style="stateEditorPopoverStyle"/);
  assert.doesNotMatch(componentSource, /@cancel="closeStateEditor"/);
  assert.doesNotMatch(componentSource, /@save="commitStateEditor"/);
  assert.doesNotMatch(componentSource, /function commitStateEditor\(\)/);
  assert.match(componentSource, /function syncStateEditorDraft\(nextDraft: StateFieldDraft\)/);
  assert.match(componentSource, /from "\.\/stateEditorModel";/);
  assert.doesNotMatch(componentSource, /function buildStateDraftFromSchema/);
  assert.doesNotMatch(componentSource, /currentAnchorId\.split\(":\"\)\.at\(-1\)/);
  assert.match(componentSource, /buildStateEditorDraftFromSchema\(stateKey, props\.stateSchema\)/);
  assert.match(componentSource, /resolveStateEditorAnchorStateKey\(currentAnchorId\)/);
  assert.match(componentSource, /resolveStateEditorUpdatePatch\(nextDraft, currentStateKey\)/);
  assert.match(componentSource, /updateStateEditorDraftName\(stateEditorDraft\.value, value\)/);
  assert.match(componentSource, /updateStateEditorDraftDescription\(stateEditorDraft\.value, value\)/);
  assert.match(componentSource, /updateStateEditorDraftColor\(stateEditorDraft\.value, value\)/);
  assert.match(componentSource, /updateStateEditorDraftType\(stateEditorDraft\.value, value\)/);
  assert.match(stateEditorModelSource, /export function buildStateEditorDraftFromSchema/);
  assert.match(stateEditorModelSource, /export function resolveStateEditorUpdatePatch/);
  assert.doesNotMatch(componentSource, /trigger="manual"/);
  assert.match(createPopoverSource, /StateDefaultValueEditor/);
  assert.match(componentSource, /class="node-card__state-editor"/);
  assert.match(componentSource, /const transparentPopoverStyle = \{/);
  assert.match(componentSource, /const stateEditorPopoverStyle = transparentPopoverStyle;/);
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
  assert.match(portListSurfaceSource, /import \{[\s\S]*Delete[\s\S]*\} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /\(event: "remove-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string \}\): void;/);
  assert.match(componentSource, /activeRemovePortStateConfirmAnchorId,[\s\S]*activeStateEditorConfirmAnchorId,/);
  assert.match(floatingPanelsComposableSource, /const activeRemovePortStateConfirmAnchorId = ref<string \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /const removePortStateConfirmTimeoutRef = ref<unknown \| null>\(null\);/);
  assert.match(floatingPanelsComposableSource, /function clearRemovePortStateConfirmState\(\)/);
  assert.match(floatingPanelsComposableSource, /function startRemovePortStateConfirmWindow\(anchorId: string\)/);
  assert.match(floatingPanelsComposableSource, /function isRemovePortStateConfirmOpen\(anchorId: string\)/);
  assert.match(componentSource, /function handleRemovePortStateClick\(anchorId: string, side: "input" \| "output", stateKey: string \| null \| undefined\)/);
  assert.match(componentSource, /function handleRemovePortStateClick\(anchorId: string, side: "input" \| "output", stateKey: string \| null \| undefined\) \{[\s\S]*if \(guardLockedStateEditAttempt\(\)\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /emit\("remove-port-state", \{[\s\S]*nodeId: props\.nodeId,[\s\S]*side,[\s\S]*stateKey,[\s\S]*\}\);/);
  assert.match(statePortListSource, /class="node-card__port-pill-remove node-card__port-pill-remove--trailing"/);
  assert.match(statePortListSource, /class="node-card__port-pill-remove node-card__port-pill-remove--leading"/);
  assert.match(componentSource, /@remove-click="handleRemovePortStateClick"/);
  assert.match(statePortListSource, /@click\.stop="emit\('remove-click', anchorId\(port\.key\), side, port\.key\)"/);
  assert.match(componentSource, /@remove-source-click="handleRemovePortStateClick"/);
  assert.match(conditionNodeBodySource, /@click\.stop="emit\('remove-source-click', conditionInputAnchorId, 'input', body\.primaryInput\.key\)"/);
  assert.match(portListSurfaceSource, /t\("nodeCard\.removeStateQuestion"\)/);
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

  assert.match(componentSource, /import ConditionNodeBody from "\.\/ConditionNodeBody\.vue";/);
  assert.match(conditionSection, /<ConditionNodeBody[\s\S]*:body="view\.body"[\s\S]*:node-id="nodeId"/);
  assert.match(conditionSection, /:rule-operator-value="node\.kind === 'condition' \? node\.config\.rule\.operator : ''"/);
  assert.match(conditionSection, /:condition-rule-value-draft="conditionRuleValueDraft"/);
  assert.match(conditionSection, /:condition-rule-value-disabled="conditionRuleValueDisabled"/);
  assert.match(conditionSection, /:condition-loop-limit-draft="conditionLoopLimitDraft"/);
  assert.match(conditionSection, /@update:operator="handleConditionRuleOperatorSelect"/);
  assert.match(conditionSection, /@rule-value-input="handleConditionRuleValueInput"/);
  assert.match(conditionSection, /@commit-rule-value="commitConditionRuleValue"/);
  assert.match(conditionSection, /@rule-value-enter="handleConditionRuleValueEnter"/);
  assert.match(conditionSection, /@loop-limit-input="handleConditionLoopLimitInput"/);
  assert.match(conditionSection, /@commit-loop-limit="commitConditionLoopLimit"/);
  assert.match(conditionSection, /@loop-limit-enter="handleConditionLoopLimitEnter"/);
  assert.match(conditionNodeBodySource, /class="node-card__condition-source-row"/);
  assert.match(conditionNodeBodySource, /body\.primaryInput/);
  assert.match(conditionNodeBodySource, /class="node-card__port-pill[\s\S]*node-card__port-pill--input/);
  assert.match(conditionNodeBodySource, /const conditionInputAnchorId = computed\(\(\) =>[\s\S]*`condition-input:\$\{props\.body\.primaryInput\.key\}`/);
  assert.match(conditionNodeBodySource, /class="node-card__condition-controls-row"/);
  assert.match(conditionNodeBodySource, /<span class="node-card__control-label">\{\{ t\("nodeCard\.operator"\) \}\}<\/span>/);
  assert.match(conditionNodeBodySource, /<span class="node-card__control-label">\{\{ t\("nodeCard\.value"\) \}\}<\/span>/);
  assert.match(conditionNodeBodySource, /<span class="node-card__control-label">\{\{ t\("nodeCard\.maxLoops"\) \}\}<\/span>/);
  assert.match(conditionNodeBodySource, /body\.operatorLabel/);
  assert.match(conditionNodeBodySource, /body\.valueLabel/);
  assert.match(conditionNodeBodySource, /:value="conditionRuleValueDraft"/);
  assert.match(conditionNodeBodySource, /@blur="emit\('commit-rule-value'\)"/);
  assert.match(conditionNodeBodySource, /@keydown\.enter\.prevent="emit\('rule-value-enter', \$event\)"/);
  assert.match(conditionNodeBodySource, /conditionLoopLimitDraft/);
  assert.match(componentSource, /from "\.\/conditionLoopLimit";/);
  assert.match(componentSource, /conditionLoopLimitDraft\.value = resolveConditionLoopLimitDraft\(loopLimit\);/);
  assert.match(componentSource, /const result = resolveConditionLoopLimitPatch\(conditionLoopLimitDraft\.value, props\.node\.config\.loopLimit\);/);
  assert.match(componentSource, /if \(result\.kind === "reset"\) \{[\s\S]*conditionLoopLimitDraft\.value = result\.draftValue;[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /if \(result\.kind === "noop"\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(componentSource, /emitConditionConfigPatch\(result\.patch\);/);
  assert.doesNotMatch(componentSource, /parseConditionLoopLimitDraft\(conditionLoopLimitDraft\.value\)/);
  assert.doesNotMatch(componentSource, /String\(normalizeConditionLoopLimit\(props\.node\.config\.loopLimit\)\)/);
  assert.match(componentSource, /from "\.\/conditionRuleEditorModel";/);
  assert.match(componentSource, /const conditionRuleValueDraft = ref\(\"\"\);/);
  assert.match(componentSource, /conditionRuleValueDraft\.value = resolveConditionRuleValueDraft\(ruleValue\);/);
  assert.match(componentSource, /isConditionRuleValueInputDisabled\(props\.node\.config\.rule\.operator\)/);
  assert.match(componentSource, /updateConditionRule\(resolveConditionRuleOperatorPatch\(value\)\);/);
  assert.match(componentSource, /const patch = resolveConditionRuleValuePatch\(conditionRuleValueDraft\.value, props\.node\.config\.rule\.value\);/);
  assert.match(componentSource, /if \(!patch\) \{[\s\S]*return;[\s\S]*\}[\s\S]*updateConditionRule\(patch\);/);
  assert.match(componentSource, /function handleConditionRuleValueInput\(event: Event\) \{[\s\S]*conditionRuleValueDraft\.value = target\.value;/);
  assert.doesNotMatch(componentSource, /props\.node\.config\.rule\.value === null \|\| props\.node\.config\.rule\.value === undefined \? "" : String\(props\.node\.config\.rule\.value\)/);
  assert.match(componentSource, /function handleConditionRuleValueEnter\(event: KeyboardEvent\) \{[\s\S]*target\.blur\(\);/);
  assert.match(conditionNodeBodySource, /type="number"/);
  assert.match(conditionNodeBodySource, /:min="CONDITION_LOOP_LIMIT_MIN"/);
  assert.match(conditionNodeBodySource, /:max="CONDITION_LOOP_LIMIT_MAX"/);
  assert.doesNotMatch(conditionNodeBodySource, /class="node-card__condition-branch-rail"/);
  assert.doesNotMatch(conditionNodeBodySource, /v-for="branch in body\.routeOutputs"/);
  assert.doesNotMatch(conditionNodeBodySource, /class="node-card__condition-branch-chip"/);
  assert.doesNotMatch(conditionNodeBodySource, /class="node-card__condition-branch-label"/);
  assert.doesNotMatch(conditionNodeBodySource, /branch\.tone/);
  assert.match(conditionNodeBodySource, /\.node-card__condition-panel \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(conditionNodeBodySource, /\.node-card__condition-controls-row \{[\s\S]*--node-card-condition-loop-column:\s*clamp\(6\.5rem,\s*22%,\s*8rem\);/);
  assert.match(conditionNodeBodySource, /\.node-card__condition-controls-row \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\) var\(--node-card-condition-loop-column\);/);
  assert.match(conditionNodeBodySource, /\.node-card__condition-controls-row > \.node-card__control-row \{[\s\S]*min-width:\s*0;/);
  assert.doesNotMatch(componentSource, /\.node-card__control-select \{[^}]*border:/);
  assert.match(conditionNodeBodySource, /\.node-card__port-pill-row--condition-source \{[\s\S]*width:\s*100%;/);
  assert.doesNotMatch(conditionSection, /node-card__branch-editor/);
  assert.doesNotMatch(conditionSection, /node-card__branch-list/);
  assert.doesNotMatch(conditionSection, /\+ branch/);
  assert.doesNotMatch(conditionSection, /Matches/);
  assert.doesNotMatch(conditionSection, /Route/);
  assert.doesNotMatch(componentSource, /\.node-card__branch-editor/);
  assert.doesNotMatch(componentSource, /\.node-card__branch-list/);
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
  assert.match(componentSource, /import \{ useNodeCardTextEditor \} from "\.\/useNodeCardTextEditor";/);
  assert.doesNotMatch(componentSource, /from "\.\/textEditorModel";/);
  assert.match(textEditorComposableSource, /from "\.\/textEditorModel\.ts";/);
  assert.match(textEditorComposableSource, /buildTextEditorDrafts/);
  assert.match(textEditorComposableSource, /createTextTriggerPointerState/);
  assert.match(textEditorComposableSource, /resolveTextEditorMetadataPatch/);
  assert.match(textEditorComposableSource, /shouldActivateTextEditorFromPointerUp/);
  assert.match(textEditorComposableSource, /type TextEditorField/);
  assert.match(textEditorComposableSource, /type TextTriggerPointerState/);
  assert.match(textEditorComposableSource, /const activeTextEditor = ref<TextEditorField \| null>\(null\);/);
  assert.match(textEditorComposableSource, /const activeTextEditorConfirmField = ref<TextEditorField \| null>\(null\);/);
  assert.match(textEditorComposableSource, /const textTriggerPointerState = ref<TextTriggerPointerState \| null>\(null\);/);
  assert.match(textEditorComposableSource, /const textEditorConfirmTimeoutRef = ref<unknown \| null>\(null\);/);
  assert.match(textEditorComposableSource, /const titleEditorDraft = ref\(""\);/);
  assert.match(textEditorComposableSource, /const descriptionEditorDraft = ref\(""\);/);
  assert.match(componentSource, /const titleEditorInputRef = ref<\{ focus\?: \(\) => void \} \| null>\(null\);/);
  assert.match(componentSource, /const descriptionEditorInputRef = ref<\{ focus\?: \(\) => void \} \| null>\(null\);/);
  assert.match(componentSource, /const \{[\s\S]*activeTextEditor,[\s\S]*activeTextEditorConfirmField,[\s\S]*clearTextEditorConfirmState,[\s\S]*clearTextEditorConfirmTimeout,[\s\S]*clearTextEditorFocusTimeout,[\s\S]*clearTextTriggerPointerState,[\s\S]*closeTextEditor,[\s\S]*commitOpenTextEditorIfNeeded,[\s\S]*commitTextEditor,[\s\S]*handleTextEditorAction,[\s\S]*handleTextEditorDraftInput,[\s\S]*handleTextTriggerPointerDown,[\s\S]*handleTextTriggerPointerMove,[\s\S]*handleTextTriggerPointerUp,[\s\S]*isTextEditorConfirmOpen,[\s\S]*isTextEditorOpen,[\s\S]*textEditorDraftValue,[\s\S]*textEditorTitle,[\s\S]*textEditorWidth,[\s\S]*\} = useNodeCardTextEditor\(\{/);
  assert.match(componentSource, /getMetadata: \(\) => props\.node,/);
  assert.match(componentSource, /guardLockedInteraction: guardLockedGraphInteraction,/);
  assert.match(componentSource, /prepareTextEditorAction: \(\) => \{[\s\S]*clearRemovePortStateConfirmState\(\);[\s\S]*\},/);
  assert.match(componentSource, /prepareOpenTextEditor: \(\) => \{[\s\S]*clearTopActionTimeout\(\);[\s\S]*activeTopAction\.value = null;[\s\S]*clearStateEditorConfirmState\(\);[\s\S]*clearRemovePortStateConfirmState\(\);[\s\S]*closeStateEditor\(\);[\s\S]*closePortPicker\(\);[\s\S]*isSkillPickerOpen\.value = false;[\s\S]*\},/);
  assert.match(textEditorComposableSource, /function clearTextTriggerPointerState\(\)/);
  assert.match(textEditorComposableSource, /function handleTextTriggerPointerDown\(field: TextEditorField, event: PointerEvent\)/);
  assert.match(textEditorComposableSource, /function handleTextTriggerPointerMove\(field: TextEditorField, event: PointerEvent\)/);
  assert.match(textEditorComposableSource, /function handleTextTriggerPointerUp\(field: TextEditorField, event: PointerEvent\)/);
  assert.match(textEditorComposableSource, /createTextTriggerPointerState\(field, event\.pointerId, event\.clientX, event\.clientY\)/);
  assert.match(textEditorComposableSource, /updateTextTriggerPointerMoveState\([\s\S]*pointerState,[\s\S]*field,[\s\S]*event\.pointerId,[\s\S]*event\.clientX,[\s\S]*event\.clientY,[\s\S]*\)/);
  assert.match(textEditorComposableSource, /shouldActivateTextEditorFromPointerUp\(pointerState, field, event\.pointerId, event\.clientX, event\.clientY\)/);
  assert.match(textEditorComposableSource, /function isTextEditorOpen\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /function isTextEditorConfirmOpen\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /textEditorWidth: resolveTextEditorWidth/);
  assert.match(textEditorComposableSource, /textEditorTitle: resolveTextEditorTitle/);
  assert.match(textEditorComposableSource, /function textEditorDraftValue\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /resolveTextEditorDraftValue\(/);
  assert.match(textEditorComposableSource, /function focusTextEditorField\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /function clearTextEditorConfirmTimeout\(\)/);
  assert.match(textEditorComposableSource, /function clearTextEditorConfirmState\(\)/);
  assert.match(textEditorComposableSource, /function startTextEditorConfirmWindow\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /function handleTextEditorAction\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /const wasConfirmOpen = isTextEditorConfirmOpen\(field\);[\s\S]*clearTextEditorConfirmState\(\);[\s\S]*if \(wasConfirmOpen\) \{[\s\S]*openTextEditor\(field\);[\s\S]*return;/);
  assert.match(textEditorComposableSource, /function openTextEditor\(field: TextEditorField\)/);
  assert.match(textEditorComposableSource, /function closeTextEditor\(\)/);
  assert.match(textEditorComposableSource, /function handleTextEditorDraftInput\(field: TextEditorField, value: string \| number\)/);
  assert.match(textEditorComposableSource, /function commitTextEditor\(field: TextEditorField \| null = activeTextEditor\.value\)/);
  assert.match(textEditorComposableSource, /startTextEditorConfirmWindow\(field\);/);
  assert.match(textEditorComposableSource, /focusTextEditorField\(field\);/);
  assert.match(textEditorComposableSource, /const patch = resolveTextEditorMetadataPatch\(field, textEditorDraftValue\(field\), options\.getMetadata\(\)\);/);
  assert.match(componentSource, /emit\("update-node-metadata", \{ nodeId: props\.nodeId, patch \}\);/);
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
  assert.match(textEditorComposableSource, /timeoutScheduler\.setTimeout\(\(\) => \{/);
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
  assert.match(componentSource, /\(event: "reorder-port-state", payload: \{ nodeId: string; side: "input" \| "output"; stateKey: string; targetIndex: number \}\): void;/);
  assert.match(componentSource, /\(event: "delete-node", payload: \{ nodeId: string \}\): void;/);
  assert.match(componentSource, /\(event: "save-node-preset", payload: \{ nodeId: string \}\): void;/);
});

test("NodeCard lets real agent state pills drag-reorder within their own side", () => {
  assert.match(componentSource, /import \{ usePortReorder \} from "\.\/usePortReorder";/);
  assert.match(componentSource, /const \{[\s\S]*clearPortReorderPointerState,[\s\S]*handlePortReorderPointerDown,[\s\S]*handlePortStatePillClick,[\s\S]*orderedInputPorts: orderedAgentInputPorts,[\s\S]*orderedOutputPorts: orderedAgentOutputPorts,[\s\S]*portReorderFloatingPort,[\s\S]*portReorderFloatingStyle,[\s\S]*\} = usePortReorder<NodePortViewModel>\(\{/);
  assert.match(componentSource, /getPorts: \(side\) => \(side === "input" \? agentInputPorts\.value : agentOutputPorts\.value\),/);
  assert.match(componentSource, /onActivateReorder: \(\) => \{[\s\S]*clearStateEditorConfirmState\(\);[\s\S]*clearRemovePortStateConfirmState\(\);[\s\S]*closeStateEditor\(\);[\s\S]*\},/);
  assert.match(componentSource, /onPortPillClick: \(anchorId, stateKey\) => \{[\s\S]*handleStateEditorActionClick\(anchorId, stateKey\);[\s\S]*\},/);
  assert.match(componentSource, /onReorder: \(payload\) => \{[\s\S]*emit\("reorder-port-state", payload\);[\s\S]*\},/);
  assert.doesNotMatch(componentSource, /function handlePortReorderPointerDown/);
  assert.doesNotMatch(componentSource, /window\.addEventListener\("pointermove", handlePortReorderPointerMove/);
  assert.match(portReorderComposableSource, /PORT_REORDER_DRAG_THRESHOLD/);
  assert.match(portReorderComposableSource, /const portReorderPointerState = ref<PortReorderPointerState \| null>\(null\);/);
  assert.match(portReorderComposableSource, /const orderedInputPorts = computed/);
  assert.match(portReorderComposableSource, /buildPortReorderPreviewPorts\("input", options\.getPorts\("input"\), portReorderPointerState\.value\)/);
  assert.match(portReorderComposableSource, /const portReorderFloatingPort = computed/);
  assert.match(portReorderComposableSource, /return buildPortReorderFloatingStyle\(pointerState, floatingPort\.port\.stateColor\);/);
  assert.match(portReorderComposableSource, /function handlePortReorderPointerDown\(side: PortReorderSide, stateKey: string, event: PointerEvent\)/);
  assert.match(portReorderComposableSource, /windowTarget\?\.addEventListener\("pointermove", handlePortReorderPointerMove as EventListener\)/);
  assert.match(portReorderComposableSource, /resolvePortReorderTargetIndexFromElements\(targetElements, pointerState\.stateKey, clientY\)/);
  assert.match(portReorderComposableSource, /options\.onReorder\(\{[\s\S]*nodeId: options\.getNodeId\(\),[\s\S]*side: pointerState\.side,[\s\S]*stateKey: pointerState\.stateKey,[\s\S]*targetIndex,[\s\S]*\}\);/);
  assert.match(componentSource, /<Teleport to="body">/);
  assert.match(statePortListSource, /data-port-reorder-node-id/);
  assert.match(statePortListSource, /:data-port-reorder-side="side"/);
  assert.match(statePortListSource, /:data-port-reorder-state-key="port\.key"/);
  assert.match(statePortListSource, /'node-card__port-pill--reorder-placeholder': isPortReorderPlaceholder\(side, port\.key\)/);
  assert.match(componentSource, /@reorder-pointer-down="handlePortReorderPointerDown"/);
  assert.match(componentSource, /@port-click="handlePortStatePillClick"/);
  assert.match(statePortListSource, /@pointerdown\.stop="emit\('reorder-pointer-down', side, port\.key, \$event\)"/);
  assert.match(statePortListSource, /@click\.stop="emit\('port-click', anchorId\(port\.key\), port\.key\)"/);
  assert.match(portListSurfaceSource, /\.node-card-port-reorder-move \{/);
  assert.match(componentSource, /\.node-card__port-pill--floating \{/);
  assert.match(portListSurfaceSource, /\.node-card__port-pill--reorder-placeholder \{/);
  assert.match(portListSurfaceSource, /\.node-card__port-pill--reordering \{/);
  const createRow = statePortListSource.match(/node-card__port-pill-row--create[\s\S]*?<StatePortCreatePopover/)?.[0] ?? "";
  assert.doesNotMatch(createRow, /data-port-reorder-state-key/);
});

test("NodeCard delegates output preview presentation while keeping Advanced in the top popover", () => {
  const outputSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'output'"[\s\S]*?<\/section>/,
  );
  assert.ok(outputSectionMatch, "expected to find the output node section");
  const outputSection = outputSectionMatch[0];

  assert.match(componentSource, /import \{ resolveOutputPreviewContent \} from "\.\/outputPreviewContentModel";/);
  assert.match(componentSource, /from "\.\/outputConfigModel";/);
  assert.match(componentSource, /const outputDisplayModeOptions = OUTPUT_DISPLAY_MODE_OPTIONS;/);
  assert.match(componentSource, /const outputPersistFormatOptions = OUTPUT_PERSIST_FORMAT_OPTIONS;/);
  assert.match(componentSource, /const outputPreviewContent = computed\(/);
  assert.match(componentSource, /resolveOutputDisplayModeActive\(view\.value\.body\.kind === "output" \? view\.value\.body\.displayMode : null, displayMode\)/);
  assert.match(componentSource, /resolveOutputPersistFormatActive\(props\.node\.kind === "output" \? props\.node\.config\.persistFormat : null, persistFormat\)/);
  assert.match(componentSource, /resolveOutputFileNameTemplatePatch\(value\)/);
  assert.match(componentSource, /import OutputNodeBody from "\.\/OutputNodeBody\.vue";/);
  assert.match(outputSection, /<OutputNodeBody[\s\S]*:body="view\.body"[\s\S]*:output-preview-content="outputPreviewContent"[\s\S]*@update:persist-enabled="handleOutputPersistToggle"/);
  assert.match(outputSection, /<template #primary-input>/);
  assert.match(outputNodeBodySource, /<slot name="primary-input" \/>/);
  assert.match(outputNodeBodySource, /node-card__preview--markdown/);
  assert.match(outputNodeBodySource, /v-html="outputPreviewContent\.html"/);
  assert.match(outputNodeBodySource, /node-card__preview--json/);
  assert.match(outputNodeBodySource, /<pre v-else class="node-card__preview-text">\{\{ outputPreviewContent\.text \}\}<\/pre>/);
  assert.match(outputNodeBodySource, /node-card__preview--empty/);
  assert.doesNotMatch(outputSection, /Connected to \$\{view\.body\.connectedStateLabel/);
  assert.doesNotMatch(outputSection, /<pre v-else class="node-card__preview-text">/);
  assert.match(componentSource, /view\.body\.kind === 'output' \? 340 : 280/);
});

test("NodeCard uses an Element Plus switch card for output persistence like the agent thinking control", () => {
  const outputSectionMatch = componentSource.match(
    /<section v-else-if="view\.body\.kind === 'output'"[\s\S]*?<\/section>/,
  );
  assert.ok(outputSectionMatch, "expected to find the output node section");
  const outputSection = outputSectionMatch[0];

  assert.doesNotMatch(componentSource, /DocumentChecked/);
  assert.match(outputNodeBodySource, /import \{ DocumentChecked \} from "@element-plus\/icons-vue";/);
  assert.match(agentRuntimeControlsSource, /import \{ Flag, Opportunity \} from "@element-plus\/icons-vue";/);
  assert.match(outputNodeBodySource, /class="node-card__output-persist-card"/);
  assert.match(outputNodeBodySource, /class="node-card__output-persist-icon"/);
  assert.match(outputNodeBodySource, /<DocumentChecked \/>/);
  assert.match(outputNodeBodySource, /<ElSwitch/);
  assert.match(outputNodeBodySource, /class="node-card__output-persist-switch"/);
  assert.match(outputNodeBodySource, /:model-value="body\.persistEnabled"/);
  assert.match(outputNodeBodySource, /:width="56"/);
  assert.match(outputNodeBodySource, /inline-prompt/);
  assert.match(outputNodeBodySource, /active-text="ON"/);
  assert.match(outputNodeBodySource, /inactive-text="OFF"/);
  assert.match(outputNodeBodySource, /@update:model-value="emit\('update:persist-enabled', \$event\)"/);
  assert.doesNotMatch(outputSection, /node-card__persist-button/);
  assert.doesNotMatch(outputSection, /node-card__toggle/);
  assert.match(componentSource, /function handleOutputPersistToggle\(value: string \| number \| boolean\)/);
  assert.match(outputNodeBodySource, /\.node-card__output-persist-card \{[\s\S]*grid-template-columns:\s*auto 56px;/);
  assert.match(outputNodeBodySource, /\.node-card__output-persist-card \{[\s\S]*min-height:\s*48px;/);
  assert.match(outputNodeBodySource, /\.node-card__output-persist-card \{[\s\S]*border-radius:\s*16px;/);
  assert.match(outputNodeBodySource, /\.node-card__output-persist-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.88\);/);
  assert.match(outputNodeBodySource, /\.node-card__output-persist-switch \{[\s\S]*--el-switch-on-color:\s*#c96b1f;/);
});

test("NodeCard closes floating panels on focus loss and keeps popup surfaces on the warm theme", () => {
  assert.match(componentSource, /import \{ computed, onBeforeUnmount, onMounted, ref, watch \} from "vue";/);
  assert.match(componentSource, /const hasFloatingPanelOpen = computed\(/);
  assert.match(componentSource, /isFloatingPanelOpen: \(\) => hasFloatingPanelOpen\.value,/);
  assert.match(componentSource, /closeFloatingPanels: \(options\) => \{[\s\S]*closeFloatingPanels\(options\);[\s\S]*\},/);
  assert.match(floatingPanelsComposableSource, /documentTarget\?\.addEventListener\("pointerdown", handleGlobalFloatingPanelPointerDown as EventListener\)/);
  assert.match(floatingPanelsComposableSource, /documentTarget\?\.addEventListener\("focusin", handleGlobalFloatingPanelFocusIn as EventListener\)/);
  assert.match(floatingPanelsComposableSource, /documentTarget\?\.addEventListener\("keydown", handleGlobalFloatingPanelKeyDown as EventListener\)/);
  assert.match(floatingPanelsComposableSource, /documentTarget\?\.removeEventListener\("pointerdown", handleGlobalFloatingPanelPointerDown as EventListener\)/);
  assert.match(floatingPanelsComposableSource, /documentTarget\?\.removeEventListener\("focusin", handleGlobalFloatingPanelFocusIn as EventListener\)/);
  assert.match(floatingPanelsComposableSource, /documentTarget\?\.removeEventListener\("keydown", handleGlobalFloatingPanelKeyDown as EventListener\)/);
  assert.match(floatingPanelsComposableSource, /function isFloatingPanelSurfaceTarget\(target: EventTarget \| null\)/);
  assert.match(floatingPanelsComposableSource, /options\.closeFloatingPanels\(\{ commitTextEditor: true \}\);/);
  assert.match(floatingPanelsComposableSource, /options\.closeFloatingPanels\(\{ commitTextEditor: false \}\);/);
  assert.match(componentSource, /data-node-popup-surface="true"/);
  assert.match(componentSource, /\.node-card__text-editor-popper/);
  assert.match(agentSkillPickerSource, /\.node-card__skill-picker \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(agentSkillPickerSource, /\.node-card__skill-picker \{[\s\S]*background:\s*rgba\(255,\s*250,\s*241,\s*0\.98\);/);
  assert.match(agentSkillPickerSource, /\.node-card__skill-picker \{[\s\S]*box-shadow:\s*0 20px 40px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
  assert.match(createPopoverSource, /\.node-card__port-picker \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.16\);/);
  assert.match(createPopoverSource, /\.node-card__port-picker \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(createPopoverSource, /\.node-card__port-picker \{[\s\S]*box-shadow:\s*0 16px 34px rgba\(60,\s*41,\s*20,\s*0\.12\);/);
});
