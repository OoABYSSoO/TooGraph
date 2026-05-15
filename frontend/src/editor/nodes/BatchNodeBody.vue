<template>
  <div class="batch-node-body">
    <div class="batch-node-body__controls">
      <label class="batch-node-body__worker-field">
        <span class="batch-node-body__field-label">{{ t("nodeCard.batchWorker") }}</span>
        <ToographSelect
          class="batch-node-body__worker-select"
          :model-value="body.workerValue"
          size="small"
          remount-on-select
          @update:model-value="emit('update-worker', String($event))"
        >
          <ElOption :label="t('nodeCard.batchDefaultWorker')" value="default_llm" />
          <ElOptionGroup
            v-if="templateOptions.length > 0"
            :label="t('nodeCard.batchTemplateWorkers')"
          >
            <ElOption
              v-for="option in templateOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </ElOptionGroup>
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
          :create-visible="isDefaultWorker ? inputCreateVisible : orderedInputPorts.length === 0"
          :create-open="inputCreateOpen"
          :create-accent-color="isDefaultWorker ? inputCreateAccentColor : '#16a34a'"
          :create-label="isDefaultWorker ? inputCreateLabel : '+ input'"
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
          @update-batch-mode="(stateKey, mode) => emit('update-input-mode', stateKey, mode)"
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
          :create-visible="isDefaultWorker ? outputCreateVisible : orderedOutputPorts.length === 0"
          :create-open="outputCreateOpen"
          :create-accent-color="isDefaultWorker ? outputCreateAccentColor : '#9a3412'"
          :create-label="isDefaultWorker ? outputCreateLabel : '+ output'"
          :create-anchor-state-key="outputCreateAnchorStateKey"
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

    <AgentRuntimeControls
      v-if="isDefaultWorker"
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

    <div v-if="isDefaultWorker" class="node-card__surface node-card__prompt-surface">
      <textarea
        class="node-card__surface-textarea"
        :data-virtual-affordance-id="`editor.canvas.node.${nodeId}.taskInstruction`"
        :data-virtual-affordance-label="`Agent prompt：${nodeId}`"
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { ElOption, ElOptionGroup } from "element-plus";
import { useI18n } from "vue-i18n";

import ToographSelect from "@/components/ToographSelect.vue";
import AgentRuntimeControls from "./AgentRuntimeControls.vue";
import StatePortList from "./StatePortList.vue";
import type { AgentThinkingControlMode } from "./agentConfigModel";
import type { StatePortExistingStateOption } from "./statePortCreateModel";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type BatchBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "batch" }>;

type BatchTemplateOption = {
  value: string;
  label: string;
  description?: string;
};

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
  body: BatchBodyViewModel;
  templateOptions: BatchTemplateOption[];
  orderedInputPorts: NodePortViewModel[];
  orderedOutputPorts: NodePortViewModel[];
  stateEditorPopoverStyle: CSSProperties;
  agentAddPopoverStyle: CSSProperties;
  confirmPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  inputCreateVisible: boolean;
  inputCreateOpen: boolean;
  inputCreateAccentColor: string;
  inputCreateLabel: string;
  inputCreateAnchorStateKey: string;
  outputCreateVisible: boolean;
  outputCreateOpen: boolean;
  outputCreateAccentColor: string;
  outputCreateLabel: string;
  outputCreateAnchorStateKey: string;
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
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
  isPortReordering: (side: "input" | "output", stateKey: string) => boolean;
  isPortReorderPlaceholder: (side: "input" | "output", stateKey: string) => boolean;
}>();

const emit = defineEmits<{
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
  (event: "update-worker", value: string): void;
  (event: "update-input-mode", stateKey: string, mode: "shared" | "batch"): void;
  (event: "model-visible-change", visible: boolean): void;
  (event: "update:model-value", value: string | number | boolean | undefined): void;
  (event: "update:thinking-mode", value: string | number | boolean | undefined): void;
  (event: "task-input", inputEvent: Event): void;
}>();

const { t } = useI18n();
const runtimeControlsRef = ref<{ collapseModelSelect?: () => void } | null>(null);
const isDefaultWorker = computed(() => props.body.workerValue === "default_llm");

function collapseModelSelect() {
  runtimeControlsRef.value?.collapseModelSelect?.();
}

defineExpose({
  collapseModelSelect,
});
</script>

<style scoped>
.batch-node-body {
  display: grid;
  gap: 14px;
}

.batch-node-body__controls {
  display: grid;
  grid-template-columns: minmax(220px, 340px);
  align-items: end;
}

.batch-node-body__worker-field {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.batch-node-body__field-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(59, 130, 246, 0.78);
}

.batch-node-body__worker-select {
  min-width: 0;
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

.node-card__surface-textarea {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  outline: none;
  resize: none;
}

.node-card__surface-textarea::placeholder {
  color: rgba(63, 48, 34, 0.46);
}

@media (max-width: 640px) {
  .batch-node-body__controls {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }
}
</style>
