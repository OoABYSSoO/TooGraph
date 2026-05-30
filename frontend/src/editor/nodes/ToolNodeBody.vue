<template>
  <div class="tool-node-body">
    <div class="tool-node-body__controls">
      <label class="tool-node-body__tool-field">
        <span class="tool-node-body__field-label">Tool</span>
        <ToographSelect
          class="tool-node-body__tool-select"
          :model-value="selectedToolKey"
          :placeholder="toolPlaceholder"
          :disabled="toolSelectDisabled"
          filterable
          remount-on-select
          popper-class="tool-node-body__tool-popper"
          @update:model-value="emit('select-tool', String($event ?? ''))"
        >
          <ElOption label="No tool" value="" />
          <ElOption
            v-if="selectedToolMissing"
            :label="selectedToolKey"
            :value="selectedToolKey"
            disabled
          />
          <ElOption
            v-for="definition in availableToolDefinitions"
            :key="definition.toolKey"
            :label="definition.name"
            :value="definition.toolKey"
          />
        </ToographSelect>
      </label>
      <label v-if="showsTargetAgentSelect" class="tool-node-body__tool-field">
        <span class="tool-node-body__field-label">Target LLM</span>
        <ToographSelect
          class="tool-node-body__tool-select"
          :model-value="targetAgentNodeId"
          placeholder="Select LLM node"
          :disabled="targetAgentNodeOptions.length === 0"
          filterable
          remount-on-select
          popper-class="tool-node-body__tool-popper"
          @update:model-value="emit('update-target-agent-node', String($event ?? ''))"
        >
          <ElOption label="No target" value="" />
          <ElOption
            v-for="option in targetAgentNodeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </ToographSelect>
      </label>
    </div>

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
          :create-visible="false"
          :create-open="false"
          create-accent-color="#16a34a"
          create-label="+ input"
          create-anchor-state-key="__toograph_virtual_any_input__"
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
          @open-create="emit('open-create', $event)"
          @update:name="emit('update:name', $event)"
          @update:type="emit('update:type', $event)"
          @update:color="emit('update:color', $event)"
          @update:description="emit('update:description', $event)"
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
          @open-create="emit('open-create', $event)"
          @update:name="emit('update:name', $event)"
          @update:type="emit('update:type', $event)"
          @update:color="emit('update:color', $event)"
          @update:description="emit('update:description', $event)"
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

    <div v-if="toolDefinitionsLoading" class="tool-node-body__message">Loading tools</div>
    <div v-else-if="toolDefinitionsError" class="tool-node-body__message tool-node-body__message--error">
      {{ toolDefinitionsError }}
    </div>
    <div v-else-if="body.toolDescription" class="tool-node-body__description">
      {{ body.toolDescription }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { ElOption } from "element-plus";

import ToographSelect from "@/components/ToographSelect.vue";
import StatePortList from "./StatePortList.vue";
import type { StatePortExistingStateOption } from "./statePortCreateModel";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { ToolDefinition } from "@/types/tools";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type ToolBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "tool" }>;

const props = defineProps<{
  nodeId: string;
  body: ToolBodyViewModel;
  selectedToolKey: string;
  targetAgentNodeId: string;
  targetAgentNodeOptions: Array<{ value: string; label: string }>;
  toolDefinitions: ToolDefinition[];
  toolDefinitionsLoading: boolean;
  toolDefinitionsError: string | null;
  orderedInputPorts: NodePortViewModel[];
  orderedOutputPorts: NodePortViewModel[];
  stateEditorPopoverStyle: CSSProperties;
  agentAddPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  createDraft: StateFieldDraft | null;
  createTitle: string;
  createError: string | null;
  createHint: string;
  createSelectionValue: string;
  createExistingStateOptions: StatePortExistingStateOption[];
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
  isPortReordering: (side: "input" | "output", stateKey: string) => boolean;
  isPortReorderPlaceholder: (side: "input" | "output", stateKey: string) => boolean;
}>();

const emit = defineEmits<{
  (event: "select-tool", toolKey: string): void;
  (event: "update-target-agent-node", nodeId: string): void;
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "reorder-pointer-down", side: "input" | "output", stateKey: string, pointerEvent: PointerEvent): void;
  (event: "port-click", anchorId: string, stateKey: string): void;
  (event: "remove-click", anchorId: string, side: "input" | "output", stateKey: string): void;
  (event: "open-create", side: "input" | "output"): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
  (event: "update:create-selection", value: string): void;
  (event: "update:create-name", value: string | number): void;
  (event: "update:create-type", value: string | number | boolean | undefined): void;
  (event: "update:create-color", value: string | number | boolean | undefined): void;
  (event: "update:create-description", value: string | number): void;
  (event: "update:create-value", value: unknown): void;
  (event: "cancel-create"): void;
  (event: "commit-create"): void;
}>();

const availableToolDefinitions = computed(() =>
  props.toolDefinitions.filter((definition) => definition.status !== "disabled"),
);
const selectedToolMissing = computed(
  () => Boolean(props.selectedToolKey) && !availableToolDefinitions.value.some((definition) => definition.toolKey === props.selectedToolKey),
);
const toolSelectDisabled = computed(() => props.toolDefinitionsLoading || Boolean(props.toolDefinitionsError));
const toolPlaceholder = computed(() => {
  if (props.toolDefinitionsLoading) {
    return "Loading tools";
  }
  if (props.toolDefinitionsError) {
    return "Tool catalog unavailable";
  }
  return props.selectedToolKey ? "Select tool" : "No tool";
});
const showsTargetAgentSelect = computed(() => props.selectedToolKey === "buddy_context_pressure_check");
</script>

<style scoped>
.tool-node-body {
  display: grid;
  gap: 12px;
}

.tool-node-body__controls {
  display: grid;
  gap: 8px;
}

.tool-node-body__tool-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.tool-node-body__field-label {
  color: #3b82f6;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tool-node-body__tool-select {
  width: 100%;
  --el-color-primary: #2563eb;
  --el-border-radius-base: 16px;
}

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

.tool-node-body__description,
.tool-node-body__message {
  border-radius: 14px;
  background: rgba(255, 250, 241, 0.74);
  color: #6b5a48;
  font-size: 12px;
  line-height: 1.45;
  padding: 9px 11px;
}

.tool-node-body__message--error {
  color: #b91c1c;
}
</style>
