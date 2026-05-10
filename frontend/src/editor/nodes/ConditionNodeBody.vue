<template>
  <div class="node-card__surface node-card__surface--condition">
    <div class="node-card__condition-panel">
      <div class="node-card__condition-source-row">
        <span class="node-card__control-label">{{ t("nodeCard.source") }}</span>
        <div v-if="body.primaryInput" class="node-card__port-pill-row node-card__port-pill-row--condition-source">
          <ElPopover
            :visible="
              body.primaryInput.virtual
                ? isPortCreateOpen('input')
                : isStateEditorOpen(conditionInputAnchorId) ||
                  isStateEditorConfirmOpen(conditionInputAnchorId) ||
                  isRemovePortStateConfirmOpen(conditionInputAnchorId)
            "
            :placement="body.primaryInput.virtual || isStateEditorOpen(conditionInputAnchorId) ? 'bottom-start' : 'top-start'"
            :width="body.primaryInput.virtual ? 376 : isStateEditorOpen(conditionInputAnchorId) ? 320 : undefined"
            :show-arrow="false"
            :popper-style="body.primaryInput.virtual ? agentAddPopoverStyle : stateEditorPopoverStyle"
            :popper-class="body.primaryInput.virtual ? 'node-card__agent-add-popover-popper' : 'node-card__state-editor-popper'"
          >
            <template #reference>
              <span
                class="node-card__port-pill node-card__port-pill--input node-card__port-pill--dock-start"
                :class="{
                  'node-card__port-pill--condition-source': !body.primaryInput.virtual,
                  'node-card__port-pill--create': body.primaryInput.virtual,
                  'node-card__port-pill--removable': !body.primaryInput.virtual,
                  'node-card__port-pill--revealed': !body.primaryInput.virtual && isStateEditorPillRevealed(conditionInputAnchorId),
                  'node-card__port-pill--confirm': !body.primaryInput.virtual && isStateEditorConfirmOpen(conditionInputAnchorId),
                }"
                :style="{ '--node-card-port-accent': body.primaryInput.stateColor }"
                data-state-editor-trigger="true"
                data-anchor-hitarea="true"
                @pointerenter="emit('pointer-enter', conditionInputAnchorId)"
                @pointerleave="emit('pointer-leave', conditionInputAnchorId)"
                @pointerdown.stop
                @click.stop="body.primaryInput.virtual ? emit('open-create', 'input') : emit('source-click', conditionInputAnchorId, body.primaryInput.key)"
              >
                <span
                  class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
                  :data-anchor-slot-id="`${nodeId}:state-in:${body.primaryInput.key}`"
                  aria-hidden="true"
                />
                <span
                  class="node-card__port-pill-label"
                  :class="{ 'node-card__port-pill-label--confirm': isStateEditorConfirmOpen(conditionInputAnchorId) }"
                >
                  <span class="node-card__port-pill-label-text">{{ body.primaryInput.label }}</span>
                  <ElIcon class="node-card__port-pill-confirm-icon"><Check /></ElIcon>
                </span>
                <button
                  v-if="!body.primaryInput.virtual"
                  type="button"
                  class="node-card__port-pill-remove node-card__port-pill-remove--trailing"
                  :class="{ 'node-card__port-pill-remove--confirm': isRemovePortStateConfirmOpen(conditionInputAnchorId) }"
                  :aria-label="t('nodeCard.removeSourceBinding')"
                  @pointerdown.stop
                  @click.stop="emit('remove-source-click', conditionInputAnchorId, 'input', body.primaryInput.key)"
                >
                  <ElIcon v-if="isRemovePortStateConfirmOpen(conditionInputAnchorId)"><Check /></ElIcon>
                  <ElIcon v-else><Delete /></ElIcon>
                </button>
              </span>
            </template>
            <StatePortCreatePopover
              v-if="body.primaryInput.virtual && isPortCreateOpen('input') && portStateDraft"
              :draft="portStateDraft"
              :title="portPickerTitle"
              :error="portStateError"
              :hint="t('nodeCard.createStateBindHint')"
              :type-options="stateTypeOptions"
              @update:name="emit('update:create-name', $event)"
              @update:type="emit('update:create-type', $event)"
              @update:color="emit('update:create-color', $event)"
              @update:description="emit('update:create-description', $event)"
              @update:value="emit('update:create-value', $event)"
              @cancel="emit('cancel-create')"
              @create="emit('commit-create')"
            />
            <div v-else-if="isRemovePortStateConfirmOpen(conditionInputAnchorId)" class="node-card__confirm-hint node-card__confirm-hint--remove">{{ t("nodeCard.removeStateQuestion") }}</div>
            <div v-else-if="isStateEditorConfirmOpen(conditionInputAnchorId)" class="node-card__confirm-hint node-card__confirm-hint--state">{{ t("nodeCard.editStateQuestion") }}</div>
            <StateEditorPopover
              v-else-if="stateEditorDraft"
              class="node-card__state-editor"
              :draft="stateEditorDraft"
              :error="stateEditorError"
              :type-options="typeOptions"
              :color-options="colorOptions"
              @update:name="emit('update:name', $event)"
              @update:type="emit('update:type', $event)"
              @update:color="emit('update:color', $event)"
              @update:description="emit('update:description', $event)"
            />
          </ElPopover>
        </div>
        <div v-else class="node-card__condition-source-empty">{{ t("nodeCard.connectSourceState") }}</div>
      </div>
      <div class="node-card__condition-controls-row">
        <label class="node-card__control-row">
          <span class="node-card__control-label">{{ t("nodeCard.operator") }}</span>
          <ElSelect
            class="node-card__control-select node-card__condition-operator-select toograph-select"
            :model-value="ruleOperatorValue"
            :title="body.operatorLabel"
            :teleported="false"
            popper-class="toograph-select-popper"
            @pointerdown.stop
            @click.stop
            @update:model-value="emit('update:operator', $event)"
          >
            <ElOption v-for="option in conditionRuleOperatorOptions" :key="option.value" :label="option.label" :value="option.value" />
          </ElSelect>
        </label>
        <label class="node-card__control-row">
          <span class="node-card__control-label">{{ t("nodeCard.value") }}</span>
          <input
            class="node-card__control-input"
            type="text"
            :value="conditionRuleValueDraft"
            :placeholder="body.valueLabel"
            :disabled="conditionRuleValueDisabled"
            @pointerdown.stop
            @click.stop
            @input="emit('rule-value-input', $event)"
            @blur="emit('commit-rule-value')"
            @keydown.enter.prevent="emit('rule-value-enter', $event)"
          />
        </label>
        <label class="node-card__control-row node-card__control-row--loop-limit">
          <span class="node-card__control-label">{{ t("nodeCard.maxLoops") }}</span>
          <ElInputNumber
            class="node-card__condition-loop-limit-input"
            :model-value="conditionLoopLimitValue"
            :min="CONDITION_LOOP_LIMIT_MIN"
            :max="CONDITION_LOOP_LIMIT_MAX"
            :step="1"
            :controls="false"
            @pointerdown.stop
            @click.stop
            @update:model-value="emit('update:loop-limit', $event)"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { ElIcon, ElInputNumber, ElOption, ElPopover, ElSelect } from "element-plus";
import { Check, Delete } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import StateEditorPopover from "./StateEditorPopover.vue";
import StatePortCreatePopover from "./StatePortCreatePopover.vue";
import { CONDITION_LOOP_LIMIT_MAX, CONDITION_LOOP_LIMIT_MIN } from "./conditionLoopLimit";
import type { NodeCardViewModel } from "./nodeCardViewModel";
import type { ConditionNode } from "@/types/node-system";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type ConditionBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "condition" }>;
type ConditionRuleOperatorOption = {
  value: ConditionNode["config"]["rule"]["operator"];
  label: string;
};

const props = defineProps<{
  body: ConditionBodyViewModel;
  nodeId: string;
  ruleOperatorValue: ConditionNode["config"]["rule"]["operator"] | "";
  conditionRuleValueDraft: string;
  conditionRuleValueDisabled: boolean;
  conditionLoopLimitValue: number;
  conditionRuleOperatorOptions: ConditionRuleOperatorOption[];
  stateEditorPopoverStyle: CSSProperties;
  agentAddPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  portStateDraft: StateFieldDraft | null;
  portPickerTitle: string;
  portStateError: string | null;
  stateTypeOptions: string[];
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  isPortCreateOpen: (side: "input" | "output") => boolean;
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
}>();

const emit = defineEmits<{
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "open-create", side: "input" | "output"): void;
  (event: "source-click", anchorId: string, stateKey: string): void;
  (event: "remove-source-click", anchorId: string, side: "input" | "output", stateKey: string): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
  (event: "update:create-name", value: string | number): void;
  (event: "update:create-type", value: string | number | boolean | undefined): void;
  (event: "update:create-color", value: string | number | boolean | undefined): void;
  (event: "update:create-description", value: string | number): void;
  (event: "update:create-value", value: unknown): void;
  (event: "cancel-create"): void;
  (event: "commit-create"): void;
  (event: "update:operator", value: string | number | boolean | undefined): void;
  (event: "update:loop-limit", value: number | undefined): void;
  (event: "rule-value-input", inputEvent: Event): void;
  (event: "commit-rule-value"): void;
  (event: "rule-value-enter", keyboardEvent: KeyboardEvent): void;
}>();

const { t } = useI18n();

const conditionInputAnchorId = computed(() =>
  props.body.primaryInput ? `condition-input:${props.body.primaryInput.key}` : "",
);
</script>

<style scoped>
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

.node-card__surface--condition {
  display: grid;
  gap: 14px;
}

.node-card__condition-panel {
  --node-card-condition-loop-column: 104px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--node-card-condition-loop-column);
  gap: 14px;
  align-items: stretch;
}

.node-card__condition-source-row {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.node-card__port-pill-row {
  display: flex;
  align-items: center;
  min-height: 34px;
  gap: 10px;
}

.node-card__port-pill-row--condition-source {
  width: 100%;
  min-width: 0;
}

.node-card__condition-source-empty {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  width: 100%;
  border: 1px dashed rgba(154, 52, 18, 0.2);
  border-radius: 18px;
  padding: 0 14px;
  background: rgba(255, 252, 245, 0.86);
  color: rgba(120, 53, 15, 0.72);
  font-size: 0.84rem;
}

.node-card__condition-controls-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--node-card-condition-loop-column);
  gap: 12px;
  align-items: end;
}

.node-card__condition-controls-row > .node-card__control-row {
  min-width: 0;
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

.node-card__condition-loop-limit-input {
  width: 100%;
}

.node-card__control-select {
  width: 100%;
}

.node-card__port-pill {
  --node-card-port-accent: rgba(217, 119, 6, 0.92);
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  min-height: 34px;
  min-width: 132px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  padding: 5px 10px;
  box-shadow: none;
  color: #1f2937;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.node-card__port-pill--condition-source {
  min-width: 260px;
}

.node-card__port-pill:focus-visible,
.node-card__port-pill--revealed {
  border-color: rgba(154, 52, 18, 0.14);
  background: rgba(255, 250, 241, 0.94);
  box-shadow: 0 10px 22px rgba(60, 41, 20, 0.08);
}

.node-card__port-pill--create {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--node-card-port-accent) 38%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 10%, transparent);
  color: var(--node-card-port-accent);
  box-shadow: none;
}

.node-card__port-pill--create:focus-visible {
  border-color: color-mix(in srgb, var(--node-card-port-accent) 48%, transparent);
  background: color-mix(in srgb, var(--node-card-port-accent) 14%, transparent);
}

.node-card__port-pill--dock-start {
  margin-left: calc(var(--node-card-inline-padding) * -1 - 10px);
}

.node-card__port-pill--removable.node-card__port-pill--input {
  padding-right: 39px;
}

.node-card__port-pill--confirm {
  border-color: rgba(59, 130, 246, 0.56);
  background: rgba(59, 130, 246, 0.96);
  box-shadow: none;
  color: #eff6ff;
}

.node-card__port-pill--confirm .node-card__port-pill-anchor-slot {
  opacity: 0;
}

.node-card__port-pill-label {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-width: 0;
  padding-inline: 0;
  white-space: nowrap;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.node-card__port-pill-label-text {
  display: block;
  min-width: 0;
  white-space: nowrap;
  line-height: 1.2;
  transition: opacity 140ms ease;
}

.node-card__port-pill-label--confirm .node-card__port-pill-label-text {
  opacity: 0;
}

.node-card__port-pill-confirm-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  font-size: 1.08rem;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: opacity 140ms ease;
  pointer-events: none;
}

.node-card__port-pill-label--confirm .node-card__port-pill-confirm-icon {
  opacity: 1;
}

.node-card__port-pill-anchor-slot {
  flex: none;
  width: 14px;
  height: 14px;
}

.node-card__port-pill-anchor-slot--leading {
  order: -1;
}

.node-card__port-pill-remove {
  position: absolute;
  top: 50%;
  right: 7px;
  z-index: 2;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.88);
  color: rgba(154, 52, 18, 0.74);
  opacity: 0;
  pointer-events: none;
  appearance: none;
  transform: translateY(-50%);
  transition:
    opacity 140ms ease,
    border-color 140ms ease,
    background 140ms ease,
    color 140ms ease;
}

.node-card__port-pill--revealed .node-card__port-pill-remove,
.node-card__port-pill:focus-visible .node-card__port-pill-remove {
  opacity: 1;
  pointer-events: auto;
}

.node-card__port-pill-remove:hover,
.node-card__port-pill-remove:focus-visible {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(254, 242, 242, 0.98);
  color: rgba(185, 28, 28, 0.88);
}

.node-card__port-pill-remove--confirm,
.node-card__port-pill-remove--confirm:hover,
.node-card__port-pill-remove--confirm:focus-visible {
  border-color: rgba(185, 28, 28, 0.28);
  background: rgb(185, 28, 28);
  color: #fff;
}

.node-card__port-pill--confirm .node-card__port-pill-remove {
  opacity: 1;
  pointer-events: auto;
}

.node-card__state-editor {
  display: grid;
  gap: 12px;
}

.node-card__confirm-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 6px 14px;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  box-shadow: 0 14px 32px rgba(60, 41, 20, 0.14);
}

.node-card__confirm-hint--state {
  padding: 5px 10px;
  letter-spacing: 0.12em;
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(239, 246, 255, 0.98);
  color: rgb(37, 99, 235);
}

.node-card__confirm-hint--remove {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(153, 27, 27);
}
</style>
