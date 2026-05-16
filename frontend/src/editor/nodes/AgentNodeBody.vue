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
    :confirm-popover-style="confirmPopoverStyle"
    @model-visible-change="emit('model-visible-change', $event)"
    @update:model-value="emit('update:model-value', $event)"
    @update:thinking-mode="emit('update:thinking-mode', $event)"
  />
  <AgentSkillPicker
    :selected-skill-key="selectedSkillKey"
    :loading="skillDefinitionsLoading"
    :error="skillDefinitionsError"
    :available-skill-definitions="availableSkillDefinitions"
    :breakpoint-enabled="breakpointEnabled"
    :confirm-popover-style="confirmPopoverStyle"
    @update:selected-skill="emit('select-skill', $event)"
    @update:breakpoint-enabled="emit('update:breakpoint-enabled', $event)"
  />
  <div class="node-card__surface node-card__prompt-surface">
    <div v-if="skillInstructionBlocks.length > 0" class="node-card__skill-instruction-capsules">
      <ElPopover
        v-for="block in skillInstructionBlocks"
        :key="block.skillKey"
        placement="top-start"
        :width="380"
        trigger="click"
        :show-arrow="false"
        :popper-style="agentAddPopoverStyle"
        popper-class="node-card__agent-add-popover-popper"
      >
        <template #reference>
          <button
            type="button"
            class="node-card__skill-instruction-capsule"
            :title="block.title"
            @pointerdown.stop
            @click.stop
          >
            {{ block.title }}
          </button>
        </template>
        <div class="node-card__skill-instruction-editor" data-node-popup-surface="true" @pointerdown.stop @click.stop>
          <div class="node-card__skill-instruction-editor-title">{{ block.title }}</div>
          <ElInput
            :model-value="block.content"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 10 }"
            @update:model-value="emit('update-skill-instruction', { skillKey: block.skillKey, content: String($event) })"
          />
        </div>
      </ElPopover>
    </div>
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
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { ElInput, ElPopover } from "element-plus";
import { useI18n } from "vue-i18n";

import AgentRuntimeControls from "./AgentRuntimeControls.vue";
import AgentSkillPicker from "./AgentSkillPicker.vue";
import StatePortList from "./StatePortList.vue";
import type { AgentThinkingControlMode } from "./agentConfigModel";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
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

const props = defineProps<{
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
  selectedSkillKey: string;
  skillDefinitionsLoading: boolean;
  skillDefinitionsError: string | null;
  availableSkillDefinitions: SkillDefinition[];
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
  (event: "select-skill", skillKey: string): void;
  (event: "update-skill-instruction", payload: { skillKey: string; content: string }): void;
  (event: "task-input", inputEvent: Event): void;
}>();

const { t } = useI18n();
const runtimeControlsRef = ref<{ collapseModelSelect?: () => void } | null>(null);
const skillInstructionBlocks = computed(() =>
  Object.values(props.body.skillInstructionBlocks ?? {}).filter((block) => block.content.trim() || block.title.trim()),
);

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
  resize: none;
  font: inherit;
  color: inherit;
  outline: none;
}

.node-card__prompt-surface {
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: text;
}

.node-card__skill-instruction-capsules {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  cursor: default;
}

.node-card__skill-instruction-capsule {
  max-width: 100%;
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 999px;
  padding: 5px 10px;
  background: rgba(239, 246, 255, 0.88);
  color: #2563eb;
  font: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.node-card__skill-instruction-capsule:hover,
.node-card__skill-instruction-capsule:focus-visible {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.96);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.12);
  outline: none;
}

.node-card__skill-instruction-editor {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.14);
}

.node-card__skill-instruction-editor-title {
  color: #1f2937;
  font-size: 0.86rem;
  font-weight: 700;
}

.node-card__skill-instruction-editor :deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(154, 52, 18, 0.16);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.08);
}
</style>
