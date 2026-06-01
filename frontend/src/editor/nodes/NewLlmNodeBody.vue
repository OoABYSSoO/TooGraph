<template>
  <div class="node-card__port-grid">
    <div class="node-card__port-column">
      <StatePortList
        side="input"
        :ports="orderedInputPorts"
        :node-id="nodeId"
        :popover-style="stateEditorPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :type-options="typeOptions"
        :color-options="colorOptions"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        :is-port-reordering="isPortReordering"
        :is-port-reorder-placeholder="isPortReorderPlaceholder"
        :create-visible="inputCreateVisible"
        :create-open="inputCreateOpen"
        :create-accent-color="inputCreateAccentColor"
        :create-label="inputCreateLabel"
        :create-anchor-state-key="inputCreateAnchorStateKey"
        :create-draft="createDraft"
        :create-title="createTitle"
        :create-error="createError"
        :create-hint="createHint"
        :create-selection-value="createSelectionValue"
        :create-existing-state-options="createExistingStateOptions"
        :create-type-options="typeOptions"
        :create-popover-style="agentAddPopoverStyle"
        @pointer-enter="emit('pointer-enter', $event)"
        @pointer-leave="emit('pointer-leave', $event)"
        @reorder-pointer-down="(side, stateKey, pointerEvent) => emit('reorder-pointer-down', side, stateKey, pointerEvent)"
        @port-click="(anchorId, stateKey) => emit('port-click', anchorId, stateKey)"
        @remove-click="(anchorId, side, stateKey) => emit('remove-click', anchorId, side, stateKey)"
        @update:name="emit('update:name', $event)"
        @update:type="emit('update:type', $event)"
        @update:color="emit('update:color', $event)"
        @update:description="emit('update:description', $event)"
        @open-create="emit('open-create', $event)"
        @update:create-selection="emit('update:create-selection', $event)"
        @update:create-name="emit('update:create-name', $event)"
        @update:create-type="emit('update:create-type', $event)"
        @update:create-color="emit('update:create-color', $event)"
        @update:create-description="emit('update:create-description', $event)"
        @update:create-value="emit('update:create-value', $event)"
        @cancel-create="emit('cancel-create')"
        @commit-create="emit('commit-create')"
      />
    </div>
    <div class="node-card__port-column node-card__port-column--right">
      <StatePortList
        side="output"
        :ports="orderedOutputPorts"
        :node-id="nodeId"
        :popover-style="stateEditorPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :type-options="typeOptions"
        :color-options="colorOptions"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        :is-port-reordering="isPortReordering"
        :is-port-reorder-placeholder="isPortReorderPlaceholder"
        :create-visible="false"
        :create-open="false"
        create-accent-color="#9a3412"
        create-label="+ output"
        create-anchor-state-key="__toograph_virtual_any_output__"
        :create-draft="createDraft"
        :create-title="createTitle"
        :create-error="createError"
        :create-hint="createHint"
        :create-selection-value="createSelectionValue"
        :create-existing-state-options="createExistingStateOptions"
        :create-type-options="typeOptions"
        :create-popover-style="agentAddPopoverStyle"
        @pointer-enter="emit('pointer-enter', $event)"
        @pointer-leave="emit('pointer-leave', $event)"
        @reorder-pointer-down="(side, stateKey, pointerEvent) => emit('reorder-pointer-down', side, stateKey, pointerEvent)"
        @port-click="(anchorId, stateKey) => emit('port-click', anchorId, stateKey)"
        @remove-click="(anchorId, side, stateKey) => emit('remove-click', anchorId, side, stateKey)"
        @update:name="emit('update:name', $event)"
        @update:type="emit('update:type', $event)"
        @update:color="emit('update:color', $event)"
        @update:description="emit('update:description', $event)"
        @open-create="emit('open-create', $event)"
        @update:create-selection="emit('update:create-selection', $event)"
        @update:create-name="emit('update:create-name', $event)"
        @update:create-type="emit('update:create-type', $event)"
        @update:create-color="emit('update:create-color', $event)"
        @update:create-description="emit('update:create-description', $event)"
        @update:create-value="emit('update:create-value', $event)"
        @cancel-create="emit('cancel-create')"
        @commit-create="emit('commit-create')"
      />
    </div>
  </div>

  <AgentRuntimeControls
    ref="runtimeControlsRef"
    :model-value="modelValue"
    :model-options="modelOptions"
    :global-model-ref="globalModelRef"
    :thinking-mode-value="thinkingModeValue"
    :thinking-options="thinkingOptions"
    :thinking-enabled="thinkingEnabled"
    :confirm-popover-style="confirmPopoverStyle"
    @model-visible-change="emit('model-visible-change', $event)"
    @update:model-value="emit('update:model-value', $event)"
    @update:thinking-mode="emit('update:thinking-mode', $event)"
  />

  <section class="new-llm-node-body__tool-panel" aria-label="Available tools">
    <header class="new-llm-node-body__tool-header">
      <span>Tools</span>
      <strong>{{ selectedToolKeys.length }}</strong>
    </header>
    <div v-if="toolDefinitionsLoading" class="new-llm-node-body__tool-state">Loading tools</div>
    <div v-else-if="toolDefinitionsError" class="new-llm-node-body__tool-state new-llm-node-body__tool-state--error">
      {{ toolDefinitionsError }}
    </div>
    <div v-else-if="toolGroups.length === 0" class="new-llm-node-body__tool-state">No active tools</div>
    <div v-else class="new-llm-node-body__tool-groups">
      <section v-for="group in toolGroups" :key="group.key" class="new-llm-node-body__tool-group">
        <div class="new-llm-node-body__tool-group-label">{{ group.label }}</div>
        <button
          v-for="tool in group.tools"
          :key="tool.toolKey"
          type="button"
          class="new-llm-node-body__tool-option"
          :class="{ 'new-llm-node-body__tool-option--selected': selectedToolKeySet.has(tool.toolKey) }"
          :aria-pressed="selectedToolKeySet.has(tool.toolKey)"
          @pointerdown.stop
          @click.stop="toggleTool(tool.toolKey)"
        >
          <span>{{ tool.name }}</span>
          <small>{{ tool.toolKey }}</small>
        </button>
      </section>
    </div>
  </section>

  <div class="node-card__surface node-card__prompt-surface">
    <textarea
      class="node-card__surface-textarea"
      :data-virtual-affordance-id="`editor.canvas.node.${nodeId}.taskInstruction`"
      :data-virtual-affordance-label="`New LLM prompt：${nodeId}`"
      data-virtual-affordance-role="textbox"
      data-virtual-affordance-zone="editor-canvas.node"
      data-virtual-affordance-actions="type"
      :value="body.taskInstruction"
      :placeholder="t('nodeCard.nodePromptPlaceholder')"
      @pointerdown.stop
      @click.stop
      @input="emit('task-input', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { useI18n } from "vue-i18n";

import AgentRuntimeControls from "./AgentRuntimeControls.vue";
import StatePortList from "./StatePortList.vue";
import type { AgentThinkingControlMode } from "./agentConfigModel";
import type { StatePortExistingStateOption } from "./statePortCreateModel";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { ToolDefinition } from "@/types/tools";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type NewLlmBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "new_llm" }>;

type AgentModelOption = {
  value: string;
  label: string;
};

type AgentThinkingOption = {
  value: AgentThinkingControlMode;
  label: string;
};

const props = defineProps<{
  nodeId: string;
  body: NewLlmBodyViewModel;
  selectedToolKeys: string[];
  toolDefinitions: ToolDefinition[];
  toolDefinitionsLoading: boolean;
  toolDefinitionsError: string | null;
  orderedInputPorts: NodePortViewModel[];
  orderedOutputPorts: NodePortViewModel[];
  stateEditorPopoverStyle: CSSProperties;
  agentAddPopoverStyle: CSSProperties;
  confirmPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
  isPortReordering: (side: "input" | "output", stateKey: string) => boolean;
  isPortReorderPlaceholder: (side: "input" | "output", stateKey: string) => boolean;
  inputCreateVisible: boolean;
  inputCreateOpen: boolean;
  inputCreateAccentColor: string;
  inputCreateLabel: string;
  inputCreateAnchorStateKey: string;
  createDraft: StateFieldDraft | null;
  createTitle: string;
  createError: string | null;
  createHint: string;
  createSelectionValue: string;
  createExistingStateOptions: StatePortExistingStateOption[];
  modelValue?: string;
  modelOptions: AgentModelOption[];
  globalModelRef: string;
  thinkingModeValue: AgentThinkingControlMode;
  thinkingOptions: AgentThinkingOption[];
  thinkingEnabled: boolean;
}>();

const emit = defineEmits<{
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "reorder-pointer-down", side: "input" | "output", stateKey: string, pointerEvent: PointerEvent): void;
  (event: "port-click", anchorId: string, stateKey: string): void;
  (event: "remove-click", anchorId: string, side: "input" | "output", stateKey: string): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
  (event: "open-create", side: "input" | "output"): void;
  (event: "update:create-selection", value: string): void;
  (event: "update:create-name", value: string | number): void;
  (event: "update:create-type", value: string | number | boolean | undefined): void;
  (event: "update:create-color", value: string | number | boolean | undefined): void;
  (event: "update:create-description", value: string | number): void;
  (event: "update:create-value", value: unknown): void;
  (event: "cancel-create"): void;
  (event: "commit-create"): void;
  (event: "model-visible-change", visible: boolean): void;
  (event: "update:model-value", value: string | number | boolean | undefined): void;
  (event: "update:thinking-mode", value: string | number | boolean | undefined): void;
  (event: "update-tool-keys", toolKeys: string[]): void;
  (event: "task-input", inputEvent: Event): void;
}>();

const { t } = useI18n();
const runtimeControlsRef = ref<{ collapseModelSelect?: () => void } | null>(null);
const selectedToolKeySet = computed(() => new Set(props.selectedToolKeys));
const activeToolDefinitions = computed(() =>
  props.toolDefinitions.filter((tool) => tool.status === "active"),
);
const toolGroups = computed(() => {
  const groups = new Map<string, { key: string; label: string; tools: ToolDefinition[] }>();
  for (const tool of activeToolDefinitions.value) {
    const key = tool.sourceScope || "installed";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatToolGroupLabel(key),
        tools: [],
      });
    }
    groups.get(key)?.tools.push(tool);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    tools: group.tools.sort((left, right) => left.name.localeCompare(right.name)),
  }));
});

function formatToolGroupLabel(sourceScope: string) {
  if (sourceScope === "official") {
    return "Official";
  }
  if (sourceScope === "user") {
    return "User";
  }
  return "Installed";
}

function toggleTool(toolKey: string) {
  const next = new Set(props.selectedToolKeys);
  if (next.has(toolKey)) {
    next.delete(toolKey);
  } else {
    next.add(toolKey);
  }
  emit("update-tool-keys", [...next]);
}

function collapseModelSelect() {
  runtimeControlsRef.value?.collapseModelSelect?.();
}

defineExpose({
  collapseModelSelect,
});
</script>

<style scoped>
.node-card__port-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  width: 100%;
  column-gap: 24px;
}

.node-card__port-column {
  display: grid;
  min-width: 0;
  width: 100%;
  gap: 6px;
}

.node-card__port-column--right {
  justify-items: end;
}

.new-llm-node-body__tool-panel {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(37, 99, 235, 0.14);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.86);
  padding: 10px;
}

.new-llm-node-body__tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.new-llm-node-body__tool-header strong {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 12px;
  letter-spacing: 0;
}

.new-llm-node-body__tool-groups {
  display: grid;
  gap: 8px;
  max-height: 168px;
  overflow: auto;
  padding-right: 2px;
}

.new-llm-node-body__tool-group {
  display: grid;
  gap: 6px;
}

.new-llm-node-body__tool-group-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.new-llm-node-body__tool-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  width: 100%;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  color: #334155;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.new-llm-node-body__tool-option:hover,
.new-llm-node-body__tool-option:focus-visible {
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(239, 246, 255, 0.92);
  outline: none;
}

.new-llm-node-body__tool-option--selected {
  border-color: rgba(37, 99, 235, 0.36);
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.new-llm-node-body__tool-option span,
.new-llm-node-body__tool-option small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-llm-node-body__tool-option span {
  font-size: 12px;
  font-weight: 750;
}

.new-llm-node-body__tool-option small {
  color: #64748b;
  font-size: 11px;
}

.new-llm-node-body__tool-state {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.76);
  color: #64748b;
  font-size: 12px;
  padding: 9px 10px;
}

.new-llm-node-body__tool-state--error {
  color: #b91c1c;
}

.node-card__surface {
  display: flex;
  min-height: 132px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.62);
  overflow: hidden;
}

.node-card__surface-textarea {
  flex: 1 1 auto;
  width: 100%;
  min-height: 132px;
  border: 0;
  background: transparent;
  color: #3c2914;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  outline: none;
  padding: 16px;
  resize: none;
}
</style>
