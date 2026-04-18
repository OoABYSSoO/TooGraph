<template>
  <article class="node-card" :class="{ 'node-card--selected': selected }">
    <header class="node-card__header">
      <div class="node-card__eyebrow">{{ view.kindLabel }}</div>
      <h3 class="node-card__title">{{ view.title }}</h3>
    </header>

    <p class="node-card__description">{{ view.description }}</p>

    <div
      v-if="view.stateSummary && (view.stateSummary.reads.length > 0 || view.stateSummary.writes.length > 0)"
      class="node-card__state-summary"
    >
      <div v-if="view.stateSummary.reads.length > 0" class="node-card__state-group">
        <span class="node-card__state-group-label">Reads</span>
        <div class="node-card__state-token-list">
          <span v-for="stateLabel in view.stateSummary.reads" :key="`read-${stateLabel}`" class="node-card__state-token node-card__state-token--read">
            {{ stateLabel }}
          </span>
        </div>
      </div>

      <div v-if="view.stateSummary.writes.length > 0" class="node-card__state-group">
        <span class="node-card__state-group-label">Writes</span>
        <div class="node-card__state-token-list">
          <span v-for="stateLabel in view.stateSummary.writes" :key="`write-${stateLabel}`" class="node-card__state-token node-card__state-token--write">
            {{ stateLabel }}
          </span>
        </div>
      </div>
    </div>

    <section v-if="view.body.kind === 'input'" class="node-card__body node-card__body--input">
      <div class="node-card__port-row node-card__port-row--single">
        <span class="node-card__port-spacer" />
        <div v-if="view.body.primaryOutput" class="node-card__port-stack node-card__port-stack--right">
          <span class="node-card__port-label">{{ view.body.primaryOutput.label }}</span>
          <span class="node-card__port-meta" :style="{ color: view.body.primaryOutput.stateColor }">
            {{ view.body.primaryOutput.typeLabel }}
          </span>
        </div>
      </div>
      <textarea
        v-if="isInputValueEditable"
        class="node-card__surface node-card__surface-textarea"
        :value="inputValueText"
        placeholder="Enter input value"
        @pointerdown.stop
        @click.stop
        @input="handleInputValueInput"
      />
      <div v-else class="node-card__surface node-card__surface--tall">{{ view.body.valueText || "Empty input" }}</div>
    </section>

    <section v-else-if="view.body.kind === 'agent'" class="node-card__body node-card__body--agent">
      <div class="node-card__port-grid">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-stack">
            <div class="node-card__port-label-row">
              <span class="node-card__port-label">{{ port.label }}</span>
              <span v-if="port.required" class="node-card__port-badge">Required</span>
            </div>
            <span class="node-card__port-meta" :style="{ color: port.stateColor }">{{ port.typeLabel }}</span>
          </div>
        </div>
        <div class="node-card__port-column node-card__port-column--right">
          <div v-for="port in view.outputs" :key="port.key" class="node-card__port-stack node-card__port-stack--right">
            <span class="node-card__port-label">{{ port.label }}</span>
            <span class="node-card__port-meta" :style="{ color: port.stateColor }">{{ port.typeLabel }}</span>
          </div>
        </div>
      </div>
      <div class="node-card__chip-row">
        <span class="node-card__chip">{{ view.body.modelLabel }}</span>
        <span class="node-card__chip">{{ view.body.thinkingLabel }}</span>
        <span class="node-card__chip node-card__chip--muted">{{ view.body.skillLabel }}</span>
      </div>
      <div class="node-card__action-row">
        <span class="node-card__action-pill node-card__action-pill--skill">+ skill</span>
        <span class="node-card__action-pill node-card__action-pill--input">+ input</span>
        <span class="node-card__action-pill node-card__action-pill--output">+ output</span>
      </div>
      <textarea
        class="node-card__surface node-card__surface-textarea"
        :value="view.body.taskInstruction"
        placeholder="Describe what this node should do"
        @pointerdown.stop
        @click.stop
        @input="handleAgentTaskInstructionInput"
      />
      <details class="node-card__advanced-panel" @pointerdown.stop>
        <summary class="node-card__advanced-summary">Advanced</summary>
        <div class="node-card__advanced-content">
          <div class="node-card__control-row">
            <span class="node-card__control-label">Thinking</span>
            <div class="node-card__control-list">
              <button
                v-for="option in agentThinkingOptions"
                :key="option.value"
                type="button"
                class="node-card__control-button"
                :class="{ 'node-card__control-button--active': isAgentThinkingModeActive(option.value) }"
                @pointerdown.stop
                @click.stop="updateAgentThinkingMode(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <label class="node-card__control-row">
            <span class="node-card__control-label">Temperature</span>
            <input
              class="node-card__control-input"
              type="number"
              min="0"
              max="2"
              step="0.1"
              :value="agentTemperatureInput"
              @pointerdown.stop
              @click.stop
              @input="handleAgentTemperatureInput"
            />
          </label>
        </div>
      </details>
    </section>

    <section v-else-if="view.body.kind === 'output'" class="node-card__body node-card__body--output">
      <div class="node-card__output-toolbar">
        <span class="node-card__port-label">{{ view.body.connectedStateLabel ?? "Unbound" }}</span>
        <button
          type="button"
          class="node-card__persist-button"
          :aria-pressed="view.body.persistEnabled"
          @pointerdown.stop
          @click.stop="toggleOutputPersist"
        >
          <span class="node-card__persist">
            <span>{{ view.body.persistLabel }}</span>
            <span class="node-card__toggle" :class="{ 'node-card__toggle--on': view.body.persistEnabled }">
              <span class="node-card__toggle-thumb" />
            </span>
          </span>
        </button>
      </div>
      <div class="node-card__surface node-card__surface--output">
        <div class="node-card__surface-meta">
          <span>{{ view.body.previewTitle.toUpperCase() }}</span>
          <span>{{ view.body.displayModeLabel }}</span>
        </div>
        <div class="node-card__preview">{{ view.body.previewText || `Connected to ${view.body.connectedStateLabel ?? "state"}` }}</div>
      </div>
      <details class="node-card__advanced-panel" @pointerdown.stop>
        <summary class="node-card__advanced-summary">Advanced</summary>
        <div class="node-card__advanced-content">
          <div class="node-card__control-row">
            <span class="node-card__control-label">Display</span>
            <div class="node-card__control-list">
              <button
                v-for="option in outputDisplayModeOptions"
                :key="option.value"
                type="button"
                class="node-card__control-button"
                :class="{ 'node-card__control-button--active': isOutputDisplayModeActive(option.value) }"
                @pointerdown.stop
                @click.stop="updateOutputDisplayMode(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div class="node-card__control-row">
            <span class="node-card__control-label">Format</span>
            <div class="node-card__control-list">
              <button
                v-for="option in outputPersistFormatOptions"
                :key="option.value"
                type="button"
                class="node-card__control-button"
                :class="{ 'node-card__control-button--active': isOutputPersistFormatActive(option.value) }"
                @pointerdown.stop
                @click.stop="updateOutputPersistFormat(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <label class="node-card__control-row">
            <span class="node-card__control-label">FileName</span>
            <input
              class="node-card__control-input"
              type="text"
              :value="view.body.fileNameTemplate"
              :placeholder="view.title || 'Output'"
              @pointerdown.stop
              @click.stop
              @input="handleOutputFileNameInput"
            />
          </label>
        </div>
      </details>
    </section>

    <section v-else class="node-card__body node-card__body--condition">
      <div class="node-card__condition-topline">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-stack">
            <div class="node-card__port-label-row">
              <span class="node-card__port-label">{{ port.label }}</span>
              <span v-if="port.required" class="node-card__port-badge">Required</span>
            </div>
            <span class="node-card__port-meta" :style="{ color: port.stateColor }">{{ port.typeLabel }}</span>
          </div>
        </div>
        <label class="node-card__loop-control" @pointerdown.stop @click.stop>
          <span class="node-card__loop-label">Loop</span>
          <input
            class="node-card__loop-input"
            type="text"
            inputmode="numeric"
            :value="conditionLoopLimitDraft"
            @pointerdown.stop
            @click.stop
            @input="handleConditionLoopLimitInput"
            @blur="commitConditionLoopLimit"
            @keydown.enter.prevent="handleConditionLoopLimitEnter"
          />
        </label>
      </div>
      <div class="node-card__surface">
        <div class="node-card__condition-editor">
          <label class="node-card__control-row">
            <span class="node-card__control-label">Source</span>
            <select
              class="node-card__control-select"
              :value="conditionRuleEditor?.resolvedSource ?? ''"
              :disabled="!conditionRuleEditor || conditionRuleEditor.sourceOptions.length === 0"
              @pointerdown.stop
              @click.stop
              @change="handleConditionRuleSourceChange"
            >
              <option v-if="!conditionRuleEditor || conditionRuleEditor.sourceOptions.length === 0" value="">No state</option>
              <option v-for="option in conditionRuleEditor?.sourceOptions ?? []" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <div class="node-card__condition-editor-grid">
            <label class="node-card__control-row">
              <span class="node-card__control-label">Operator</span>
              <select
                class="node-card__control-select"
                :value="node.kind === 'condition' ? node.config.rule.operator : ''"
                @pointerdown.stop
                @click.stop
                @change="handleConditionRuleOperatorChange"
              >
                <option v-for="option in conditionRuleOperatorOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="node-card__control-row">
              <span class="node-card__control-label">Value</span>
              <input
                class="node-card__control-input"
                type="text"
                :value="conditionRuleValueText"
                :disabled="conditionRuleEditor?.isValueDisabled"
                @pointerdown.stop
                @click.stop
                @input="handleConditionRuleValueInput"
              />
            </label>
          </div>
        </div>
        <div class="node-card__condition-rule">{{ view.body.ruleSummary }}</div>
        <div class="node-card__branch-list">
          <div v-for="branch in view.body.branchMappings" :key="branch.branch" class="node-card__branch-editor">
            <label class="node-card__branch-field">
              <span class="node-card__branch-field-label">Branch</span>
              <input
                class="node-card__branch-input"
                type="text"
                autocomplete="off"
                :value="conditionBranchDrafts[branch.branch]?.branchKey ?? branch.branch"
                @pointerdown.stop
                @click.stop
                @input="handleConditionBranchKeyInput(branch.branch, $event)"
                @blur="commitConditionBranch(branch.branch)"
                @keydown.enter.prevent="handleConditionBranchEnter(branch.branch, $event)"
              />
            </label>
            <label class="node-card__branch-field">
              <span class="node-card__branch-field-label">Matches</span>
              <input
                class="node-card__branch-input node-card__branch-input--mapping"
                type="text"
                autocomplete="off"
                :value="conditionBranchDrafts[branch.branch]?.mappingText ?? branch.matchValueLabel"
                placeholder="true, false"
                @pointerdown.stop
                @click.stop
                @input="handleConditionBranchMappingInput(branch.branch, $event)"
                @blur="commitConditionBranch(branch.branch)"
                @keydown.enter.prevent="handleConditionBranchEnter(branch.branch, $event)"
              />
            </label>
            <button
              v-if="canRemoveConditionBranch"
              type="button"
              class="node-card__branch-remove"
              @pointerdown.stop
              @click.stop="removeConditionBranch(branch.branch)"
            >
              Remove
            </button>
            <div
              class="node-card__branch-route"
              :class="{ 'node-card__branch-route--unrouted': !branch.routeTargetLabel }"
            >
              {{ branch.routeTargetLabel ? `Route to ${branch.routeTargetLabel}` : "Unrouted" }}
            </div>
          </div>
          <button
            type="button"
            class="node-card__branch-add"
            @pointerdown.stop
            @click.stop="addConditionBranch"
          >
            + branch
          </button>
        </div>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { listConditionBranchMappingKeys, parseConditionBranchMappingDraft } from "@/lib/condition-branch-mapping";
import type { AgentNode, ConditionNode, GraphNode, InputNode, OutputNode, StateDefinition } from "@/types/node-system";

import { DEFAULT_AGENT_TEMPERATURE, normalizeAgentTemperature } from "./agentConfigModel";
import { parseConditionLoopLimitDraft } from "./conditionLoopLimit";
import { buildConditionRuleEditorModel, CONDITION_RULE_OPERATOR_OPTIONS } from "./conditionRuleEditorModel";
import { buildNodeCardViewModel } from "./nodeCardViewModel";

const props = defineProps<{
  nodeId: string;
  node: GraphNode;
  stateSchema: Record<string, StateDefinition>;
  conditionRouteTargets?: Record<string, string | null>;
  selected: boolean;
}>();

const emit = defineEmits<{
  (event: "update-input-config", payload: { nodeId: string; patch: Partial<InputNode["config"]> }): void;
  (event: "update-output-config", payload: { nodeId: string; patch: Partial<OutputNode["config"]> }): void;
  (event: "update-agent-config", payload: { nodeId: string; patch: Partial<AgentNode["config"]> }): void;
  (event: "update-condition-config", payload: { nodeId: string; patch: Partial<ConditionNode["config"]> }): void;
  (event: "update-condition-branch", payload: { nodeId: string; currentKey: string; nextKey: string; mappingKeys: string[] }): void;
  (event: "add-condition-branch", payload: { nodeId: string }): void;
  (event: "remove-condition-branch", payload: { nodeId: string; branchKey: string }): void;
}>();

const outputDisplayModeOptions: Array<{ value: OutputNode["config"]["displayMode"]; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "plain", label: "PLAIN" },
  { value: "markdown", label: "MD" },
  { value: "json", label: "JSON" },
];
const outputPersistFormatOptions: Array<{ value: OutputNode["config"]["persistFormat"]; label: string }> = [
  { value: "auto", label: "AUTO" },
  { value: "txt", label: "TXT" },
  { value: "md", label: "MD" },
  { value: "json", label: "JSON" },
];
const agentThinkingOptions: Array<{ value: AgentNode["config"]["thinkingMode"]; label: string }> = [
  { value: "on", label: "ON" },
  { value: "off", label: "OFF" },
];
const conditionRuleOperatorOptions = CONDITION_RULE_OPERATOR_OPTIONS;

const view = computed(() =>
  buildNodeCardViewModel(props.nodeId, props.node, props.stateSchema, {
    conditionRouteTargets: props.conditionRouteTargets,
  }),
);
const canRemoveConditionBranch = computed(() => props.node.kind === "condition" && props.node.config.branches.length > 1);
const conditionLoopLimitDraft = ref("");
const conditionBranchDrafts = ref<Record<string, { branchKey: string; mappingText: string }>>({});
const conditionRuleEditor = computed(() =>
  props.node.kind === "condition" ? buildConditionRuleEditorModel(props.node.config.rule, props.stateSchema) : null,
);
const isInputValueEditable = computed(
  () => props.node.kind === "input" && (typeof props.node.config.value === "string" || props.node.config.value === null || props.node.config.value === undefined),
);
const inputValueText = computed(() => {
  if (props.node.kind !== "input") {
    return "";
  }
  if (typeof props.node.config.value === "string") {
    return props.node.config.value;
  }
  if (props.node.config.value === null || props.node.config.value === undefined) {
    return "";
  }
  return view.value.body.kind === "input" ? view.value.body.valueText : "";
});
const conditionRuleValueText = computed(() => {
  if (props.node.kind !== "condition") {
    return "";
  }
  return props.node.config.rule.value === null ? "" : String(props.node.config.rule.value);
});
const agentTemperatureInput = computed(() => {
  if (props.node.kind !== "agent") {
    return String(DEFAULT_AGENT_TEMPERATURE);
  }
  return String(normalizeAgentTemperature(props.node.config.temperature));
});

watch(
  () => (props.node.kind === "condition" ? props.node.config.loopLimit : null),
  (loopLimit) => {
    conditionLoopLimitDraft.value = loopLimit === null ? "" : String(loopLimit);
  },
  { immediate: true },
);

watch(
  () =>
    props.node.kind === "condition"
      ? JSON.stringify({
          branches: props.node.config.branches,
          branchMapping: props.node.config.branchMapping,
        })
      : "",
  () => {
    conditionBranchDrafts.value = props.node.kind === "condition" ? buildConditionBranchDrafts(props.node) : {};
  },
  { immediate: true },
);

function emitOutputConfigPatch(patch: Partial<OutputNode["config"]>) {
  if (props.node.kind !== "output") {
    return;
  }
  emit("update-output-config", { nodeId: props.nodeId, patch });
}

function emitInputConfigPatch(patch: Partial<InputNode["config"]>) {
  if (props.node.kind !== "input") {
    return;
  }
  emit("update-input-config", { nodeId: props.nodeId, patch });
}

function emitAgentConfigPatch(patch: Partial<AgentNode["config"]>) {
  if (props.node.kind !== "agent") {
    return;
  }
  emit("update-agent-config", { nodeId: props.nodeId, patch });
}

function emitConditionConfigPatch(patch: Partial<ConditionNode["config"]>) {
  if (props.node.kind !== "condition") {
    return;
  }
  emit("update-condition-config", { nodeId: props.nodeId, patch });
}

function emitConditionBranchUpdate(currentKey: string, nextKey: string, mappingKeys: string[]) {
  if (props.node.kind !== "condition") {
    return;
  }
  emit("update-condition-branch", {
    nodeId: props.nodeId,
    currentKey,
    nextKey,
    mappingKeys,
  });
}

function addConditionBranch() {
  if (props.node.kind !== "condition") {
    return;
  }
  emit("add-condition-branch", {
    nodeId: props.nodeId,
  });
}

function removeConditionBranch(branchKey: string) {
  if (props.node.kind !== "condition") {
    return;
  }
  emit("remove-condition-branch", {
    nodeId: props.nodeId,
    branchKey,
  });
}

function toggleOutputPersist() {
  if (props.node.kind !== "output") {
    return;
  }
  emitOutputConfigPatch({ persistEnabled: !props.node.config.persistEnabled });
}

function updateOutputDisplayMode(displayMode: OutputNode["config"]["displayMode"]) {
  emitOutputConfigPatch({ displayMode });
}

function isOutputDisplayModeActive(displayMode: OutputNode["config"]["displayMode"]) {
  return props.node.kind === "output" && props.node.config.displayMode === displayMode;
}

function updateOutputPersistFormat(persistFormat: OutputNode["config"]["persistFormat"]) {
  emitOutputConfigPatch({ persistFormat });
}

function isOutputPersistFormatActive(persistFormat: OutputNode["config"]["persistFormat"]) {
  return props.node.kind === "output" && props.node.config.persistFormat === persistFormat;
}

function handleOutputFileNameInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  emitOutputConfigPatch({ fileNameTemplate: target.value });
}

function handleAgentTaskInstructionInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }
  emitAgentConfigPatch({ taskInstruction: target.value });
}

function updateAgentThinkingMode(thinkingMode: AgentNode["config"]["thinkingMode"]) {
  emitAgentConfigPatch({ thinkingMode });
}

function isAgentThinkingModeActive(thinkingMode: AgentNode["config"]["thinkingMode"]) {
  return props.node.kind === "agent" && props.node.config.thinkingMode === thinkingMode;
}

function handleAgentTemperatureInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const nextValue = target.value === "" ? DEFAULT_AGENT_TEMPERATURE : Number(target.value);
  if (!Number.isFinite(nextValue)) {
    return;
  }
  emitAgentConfigPatch({ temperature: normalizeAgentTemperature(nextValue) });
}

function handleInputValueInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }
  emitInputConfigPatch({ value: target.value });
}

function handleConditionLoopLimitInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionLoopLimitDraft.value = target.value;
}

function commitConditionLoopLimit() {
  if (props.node.kind !== "condition") {
    return;
  }

  const nextLoopLimit = parseConditionLoopLimitDraft(conditionLoopLimitDraft.value);
  if (nextLoopLimit === null) {
    conditionLoopLimitDraft.value = String(props.node.config.loopLimit ?? -1);
    return;
  }
  if (nextLoopLimit === props.node.config.loopLimit) {
    return;
  }

  emitConditionConfigPatch({ loopLimit: nextLoopLimit });
}

function handleConditionLoopLimitEnter(event: KeyboardEvent) {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) {
    target.blur();
  }
}

function updateConditionRule(patch: Partial<ConditionNode["config"]["rule"]>) {
  if (props.node.kind !== "condition") {
    return;
  }
  emitConditionConfigPatch({
    rule: {
      ...props.node.config.rule,
      ...patch,
    },
  });
}

function handleConditionRuleSourceChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  updateConditionRule({ source: target.value });
}

function handleConditionRuleOperatorChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  updateConditionRule({ operator: target.value });
}

function handleConditionRuleValueInput(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  updateConditionRule({ value: target.value });
}

function buildConditionBranchDrafts(node: ConditionNode) {
  return Object.fromEntries(
    node.config.branches.map((branchKey) => [
      branchKey,
      {
        branchKey,
        mappingText: listConditionBranchMappingKeys(node.config.branchMapping, branchKey).join(", "),
      },
    ]),
  );
}

function handleConditionBranchKeyInput(currentKey: string, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionBranchDrafts.value = {
    ...conditionBranchDrafts.value,
    [currentKey]: {
      branchKey: target.value,
      mappingText: conditionBranchDrafts.value[currentKey]?.mappingText ?? "",
    },
  };
}

function handleConditionBranchMappingInput(currentKey: string, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  conditionBranchDrafts.value = {
    ...conditionBranchDrafts.value,
    [currentKey]: {
      branchKey: conditionBranchDrafts.value[currentKey]?.branchKey ?? currentKey,
      mappingText: target.value,
    },
  };
}

function commitConditionBranch(currentKey: string) {
  if (props.node.kind !== "condition") {
    return;
  }

  const draft = conditionBranchDrafts.value[currentKey];
  if (!draft) {
    return;
  }

  const nextKey = draft.branchKey.trim();
  if (!nextKey) {
    conditionBranchDrafts.value = buildConditionBranchDrafts(props.node);
    return;
  }
  if (nextKey !== currentKey && props.node.config.branches.includes(nextKey)) {
    conditionBranchDrafts.value = buildConditionBranchDrafts(props.node);
    return;
  }

  const currentMappingKeys = listConditionBranchMappingKeys(props.node.config.branchMapping, currentKey);
  const nextMappingKeys = parseConditionBranchMappingDraft(draft.mappingText);
  const branchChanged = nextKey !== currentKey;
  const mappingChanged = JSON.stringify(currentMappingKeys) !== JSON.stringify(nextMappingKeys);

  if (!branchChanged && !mappingChanged) {
    return;
  }

  emitConditionBranchUpdate(currentKey, nextKey, nextMappingKeys);
}

function handleConditionBranchEnter(_currentKey: string, event: KeyboardEvent) {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) {
    target.blur();
  }
}
</script>

<style scoped>
.node-card {
  width: 460px;
  min-height: 260px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  box-shadow: 0 22px 40px rgba(60, 41, 20, 0.08);
  user-select: none;
}

.node-card--selected {
  border-color: rgba(154, 52, 18, 0.32);
  box-shadow: 0 22px 40px rgba(154, 52, 18, 0.14);
}

.node-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 24px 8px;
}

.node-card__eyebrow {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 0.86rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
  background: rgba(255, 255, 255, 0.78);
}

.node-card__title {
  margin: 0;
  font-size: 2rem;
  line-height: 1.15;
  color: #1f2937;
}

.node-card__description {
  margin: 0;
  padding: 0 24px 20px;
  font-size: 0.98rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.74);
}

.node-card__state-summary {
  display: grid;
  gap: 10px;
  padding: 0 24px 18px;
}

.node-card__state-group {
  display: grid;
  gap: 8px;
}

.node-card__state-group-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.node-card__state-token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.node-card__state-token {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  padding: 0 10px;
  font-size: 0.82rem;
  color: rgba(60, 41, 20, 0.82);
  background: rgba(255, 250, 241, 0.92);
}

.node-card__state-token--read {
  border-color: rgba(37, 99, 235, 0.18);
  color: rgba(37, 99, 235, 0.9);
  background: rgba(239, 246, 255, 0.9);
}

.node-card__state-token--write {
  border-color: rgba(217, 119, 6, 0.18);
  color: rgba(217, 119, 6, 0.92);
  background: rgba(255, 247, 237, 0.94);
}

.node-card__body {
  border-top: 1px solid rgba(154, 52, 18, 0.14);
  padding: 18px 24px 24px;
  display: grid;
  gap: 14px;
}

.node-card__port-row,
.node-card__port-grid {
  display: grid;
  align-items: center;
}

.node-card__port-row--single {
  grid-template-columns: minmax(0, 1fr) auto;
}

.node-card__port-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.node-card__port-column {
  display: grid;
  gap: 6px;
}

.node-card__port-column--right {
  text-align: right;
}

.node-card__port-stack {
  display: grid;
  gap: 3px;
}

.node-card__port-stack--right {
  justify-items: end;
}

.node-card__port-label-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-card__port-spacer {
  min-height: 1px;
}

.node-card__port-label {
  font-size: 1.08rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__port-meta {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.node-card__port-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 0 8px;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
  background: rgba(255, 248, 240, 0.9);
}

.node-card__chip-row,
.node-card__action-row,
.node-card__output-toolbar,
.node-card__condition-topline {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.node-card__chip-row {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.node-card__chip {
  display: inline-flex;
  align-items: center;
  min-height: 52px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 22px;
  padding: 0 18px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 1rem;
  color: #3c2914;
}

.node-card__chip--muted {
  color: rgba(60, 41, 20, 0.72);
  background: rgba(250, 243, 231, 0.9);
}

.node-card__action-row {
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.node-card__action-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  font-size: 0.92rem;
  font-weight: 500;
}

.node-card__action-pill--skill {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(239, 246, 255, 0.84);
}

.node-card__action-pill--input {
  color: #16a34a;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(220, 252, 231, 0.72);
}

.node-card__action-pill--output {
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.3);
  background: rgba(254, 243, 199, 0.72);
}

.node-card__surface {
  min-height: 120px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 24px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  line-height: 1.6;
  white-space: pre-wrap;
}

.node-card__surface--tall {
  min-height: 180px;
}

.node-card__surface--output {
  display: grid;
  gap: 14px;
}

.node-card__surface-textarea {
  resize: vertical;
  font: inherit;
}

.node-card__surface-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.88rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.node-card__preview {
  min-height: 146px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: rgba(248, 242, 234, 0.84);
  padding: 18px;
  text-align: center;
  font-size: 1.1rem;
}

.node-card__persist {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__persist-button {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.node-card__toggle {
  width: 56px;
  height: 32px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.18);
  padding: 4px;
  display: inline-flex;
  align-items: center;
}

.node-card__toggle--on {
  justify-content: flex-end;
  background: rgba(154, 52, 18, 0.72);
}

.node-card__toggle-thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
}

.node-card__advanced {
  display: flex;
  justify-content: center;
  font-size: 0.94rem;
  letter-spacing: 0.12em;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__advanced-panel {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.76);
  padding: 12px 14px;
}

.node-card__advanced-summary {
  cursor: pointer;
  list-style: none;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__advanced-summary::-webkit-details-marker {
  display: none;
}

.node-card__advanced-content {
  display: grid;
  gap: 12px;
  margin-top: 12px;
}

.node-card__control-row {
  display: grid;
  gap: 8px;
}

.node-card__control-label {
  font-size: 0.76rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.74);
}

.node-card__control-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.node-card__control-button {
  min-height: 30px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.8);
  color: rgba(60, 41, 20, 0.74);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__control-button--active {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(154, 52, 18, 0.12);
  color: rgba(154, 52, 18, 0.96);
}

.node-card__control-input {
  min-height: 36px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 0.82rem;
}

.node-card__control-select {
  min-height: 36px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 0.82rem;
}

.node-card__condition-editor {
  display: grid;
  gap: 12px;
  margin-bottom: 4px;
}

.node-card__condition-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.node-card__loop-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-card__loop-label {
  font-size: 0.76rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.74);
}

.node-card__loop-input {
  min-height: 36px;
  width: 88px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 0.84rem;
  text-align: right;
}

.node-card__condition-rule {
  font-size: 1rem;
  color: #1f2937;
}

.node-card__branch-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.node-card__branch-editor {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr) auto;
  gap: 10px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 12px;
  background: rgba(255, 248, 240, 0.84);
}

.node-card__branch-field {
  display: grid;
  gap: 6px;
}

.node-card__branch-field-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.node-card__branch-input {
  min-height: 38px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 12px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.88);
  color: #1f2937;
  font-size: 0.84rem;
}

.node-card__branch-input--mapping {
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

.node-card__branch-remove {
  align-self: end;
  min-height: 38px;
  border: 1px solid rgba(185, 28, 28, 0.16);
  border-radius: 12px;
  padding: 0 12px;
  background: rgba(254, 242, 242, 0.9);
  color: rgba(185, 28, 28, 0.9);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__branch-route {
  grid-column: 1 / -1;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.node-card__branch-route--unrouted {
  color: rgba(120, 53, 15, 0.54);
}

.node-card__branch-add {
  min-height: 40px;
  justify-self: end;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  border-radius: 999px;
  padding: 0 16px;
  background: rgba(255, 252, 245, 0.92);
  color: rgba(154, 52, 18, 0.9);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
</style>
