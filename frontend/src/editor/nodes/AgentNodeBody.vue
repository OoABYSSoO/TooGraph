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
        :create-visible="outputCreateVisible"
        :create-open="outputCreateOpen"
        :create-accent-color="outputCreateAccentColor"
        :create-label="outputCreateLabel"
        :create-anchor-state-key="outputCreateAnchorStateKey"
        :create-draft="createDraft"
        :create-title="createTitle"
        :create-error="createError"
        :create-hint="createHint"
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
    :breakpoint-enabled="breakpointEnabled"
    :confirm-popover-style="confirmPopoverStyle"
    @model-visible-change="emit('model-visible-change', $event)"
    @update:model-value="emit('update:model-value', $event)"
    @update:thinking-mode="emit('update:thinking-mode', $event)"
    @update:breakpoint-enabled="emit('update:breakpoint-enabled', $event)"
  />
  <AgentSkillPicker
    :open="skillPickerOpen"
    :show-trigger="showSkillPickerTrigger"
    :loading="skillDefinitionsLoading"
    :error="skillDefinitionsError"
    :available-skill-definitions="availableSkillDefinitions"
    :attached-skill-badges="attachedSkillBadges"
    :popover-style="agentAddPopoverStyle"
    @toggle="emit('toggle-skill-picker')"
    @attach="emit('attach-skill', $event)"
    @remove="emit('remove-skill', $event)"
  />
  <textarea
    class="node-card__surface node-card__surface-textarea"
    :value="body.taskInstruction"
    :placeholder="t('nodeCard.nodePromptPlaceholder')"
    @pointerdown.stop
    @click.stop
    @input="emit('task-input', $event)"
  />
</template>

<script setup lang="ts">
import { ref, type CSSProperties } from "vue";
import { useI18n } from "vue-i18n";

import AgentRuntimeControls from "./AgentRuntimeControls.vue";
import AgentSkillPicker from "./AgentSkillPicker.vue";
import StatePortList from "./StatePortList.vue";
import type { AgentThinkingControlMode } from "./agentConfigModel";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { AttachedSkillBadge } from "./skillPickerModel";
import type { SkillDefinition } from "@/types/skills";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type AgentBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "agent" }>;

type AgentModelOption = {
  value: string;
  label: string;
};

type AgentThinkingOption = {
  value: AgentThinkingControlMode;
  label: string;
};

defineProps<{
  nodeId: string;
  body: AgentBodyViewModel;
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
  outputCreateVisible: boolean;
  outputCreateOpen: boolean;
  outputCreateAccentColor: string;
  outputCreateLabel: string;
  outputCreateAnchorStateKey: string;
  createDraft: StateFieldDraft | null;
  createTitle: string;
  createError: string | null;
  createHint: string;
  modelValue?: string;
  modelOptions: AgentModelOption[];
  globalModelRef: string;
  thinkingModeValue: AgentThinkingControlMode;
  thinkingOptions: AgentThinkingOption[];
  thinkingEnabled: boolean;
  breakpointEnabled: boolean;
  skillPickerOpen: boolean;
  showSkillPickerTrigger: boolean;
  skillDefinitionsLoading: boolean;
  skillDefinitionsError: string | null;
  availableSkillDefinitions: SkillDefinition[];
  attachedSkillBadges: AttachedSkillBadge[];
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
  (event: "update:breakpoint-enabled", value: string | number | boolean): void;
  (event: "toggle-skill-picker"): void;
  (event: "attach-skill", skillKey: string): void;
  (event: "remove-skill", skillKey: string): void;
  (event: "task-input", inputEvent: Event): void;
}>();

const { t } = useI18n();
const runtimeControlsRef = ref<{ collapseModelSelect?: () => void } | null>(null);

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
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  width: 100%;
  gap: 8px;
}

.node-card__port-column {
  display: grid;
  min-width: 0;
  width: 100%;
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
  resize: none;
  font: inherit;
}
</style>
