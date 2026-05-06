<template>
  <div
    class="node-card__top-actions"
    :class="{ 'node-card__top-actions--visible': isTopActionVisible }"
    data-top-action-surface="true"
    @pointerdown.stop
    @click.stop
  >
    <ElButton
      v-if="humanReviewPending"
      round
      data-top-action-surface="true"
      data-human-review-action="true"
      class="node-card__human-review-button"
      @click.stop="emit('human-review')"
    >
      {{ t("nodeCard.humanReview") }}
    </ElButton>
    <ElPopover
      v-if="hasAdvancedSettings"
      :visible="activeTopAction === 'advanced'"
      placement="bottom-end"
      :width="advancedPopoverWidth"
      :show-arrow="false"
      :popper-style="actionPopoverStyle"
      popper-class="node-card__action-popover"
    >
      <template #reference>
        <ElButton round class="node-card__top-action-button node-card__top-action-button--advanced" @click.stop="emit('toggle-advanced')">
          <ElIcon><Operation /></ElIcon>
        </ElButton>
      </template>
      <div class="node-card__top-popover" data-node-popup-surface="true">
        <div class="node-card__top-popover-title">{{ t("nodeCard.advanced") }}</div>
        <div v-if="bodyKind === 'agent'" class="node-card__advanced-popover-content">
          <label class="node-card__control-row">
            <span class="node-card__control-label">{{ t("nodeCard.temperature") }}</span>
            <ElInput
              :model-value="agentTemperatureInput"
              type="number"
              inputmode="decimal"
              @update:model-value="emit('update:agent-temperature', $event)"
            />
          </label>
          <label class="node-card__control-row">
            <span class="node-card__control-label">{{ t("nodeCard.breakpoint") }}</span>
            <ElSelect
              class="node-card__breakpoint-timing-select graphite-select"
              :model-value="agentBreakpointTimingValue"
              popper-class="graphite-select-popper node-card__breakpoint-timing-popper"
              @update:model-value="emit('update:agent-breakpoint-timing', $event)"
            >
              <ElOption :label="t('nodeCard.runAfter')" value="after" />
              <ElOption :label="t('nodeCard.runBefore')" value="before" />
            </ElSelect>
          </label>
        </div>
        <div v-else-if="bodyKind === 'output'" class="node-card__advanced-popover-content">
          <div class="node-card__control-row">
            <span class="node-card__control-label">{{ t("nodeCard.display") }}</span>
            <div class="node-card__control-list">
              <button
                v-for="option in outputDisplayModeOptions"
                :key="option.value"
                type="button"
                class="node-card__control-button"
                :class="{ 'node-card__control-button--active': isOutputDisplayModeActive(option.value) }"
                @pointerdown.stop
                @click.stop="emit('update:output-display-mode', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <div class="node-card__control-row">
            <span class="node-card__control-label">{{ t("nodeCard.format") }}</span>
            <div class="node-card__control-list">
              <button
                v-for="option in outputPersistFormatOptions"
                :key="option.value"
                type="button"
                class="node-card__control-button"
                :class="{ 'node-card__control-button--active': isOutputPersistFormatActive(option.value) }"
                @pointerdown.stop
                @click.stop="emit('update:output-persist-format', option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <label class="node-card__control-row">
            <span class="node-card__control-label">{{ t("nodeCard.fileName") }}</span>
            <ElInput
              :model-value="outputFileNameTemplate"
              :placeholder="outputFileNamePlaceholder"
              @update:model-value="emit('update:output-file-name', $event)"
            />
          </label>
        </div>
      </div>
    </ElPopover>
    <ElPopover
      v-if="canSavePreset"
      :visible="activeTopAction === 'preset'"
      placement="top"
      :show-arrow="false"
      :popper-style="confirmPopoverStyle"
      popper-class="node-card__confirm-popover node-card__confirm-popover--preset"
    >
      <template #reference>
        <ElButton
          round
          data-top-action-surface="true"
          class="node-card__top-action-button node-card__top-action-button--preset"
          :class="{ 'node-card__top-action-button--confirm node-card__top-action-button--confirm-success': activeTopAction === 'preset' }"
          @click.stop="emit('preset-action')"
        >
          <ElIcon v-if="activeTopAction === 'preset'"><Check /></ElIcon>
          <ElIcon v-else><CollectionTag /></ElIcon>
        </ElButton>
      </template>
      <div class="node-card__confirm-hint node-card__confirm-hint--preset">{{ t("nodeCard.savePresetQuestion") }}</div>
    </ElPopover>
    <ElPopover
      :visible="activeTopAction === 'delete'"
      placement="top"
      :show-arrow="false"
      :popper-style="confirmPopoverStyle"
      popper-class="node-card__confirm-popover node-card__confirm-popover--delete"
    >
      <template #reference>
        <ElButton
          round
          data-top-action-surface="true"
          class="node-card__top-action-button node-card__top-action-button--delete"
          :class="{ 'node-card__top-action-button--confirm node-card__top-action-button--confirm-danger': activeTopAction === 'delete' }"
          @click.stop="emit('delete-action')"
        >
          <ElIcon v-if="activeTopAction === 'delete'"><Check /></ElIcon>
          <ElIcon v-else><Delete /></ElIcon>
        </ElButton>
      </template>
      <div class="node-card__confirm-hint node-card__confirm-hint--delete">{{ t("nodeCard.deleteNodeQuestion") }}</div>
    </ElPopover>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { ElButton, ElIcon, ElInput, ElOption, ElPopover, ElSelect } from "element-plus";
import { Check, CollectionTag, Delete, Operation } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import type { NodeTopAction } from "./useNodeFloatingPanels";
import type { OutputNode } from "@/types/node-system";

type BodyKind = "input" | "agent" | "output" | "condition" | "subgraph";
type OutputDisplayModeOption = {
  value: OutputNode["config"]["displayMode"];
  label: string;
};
type OutputPersistFormatOption = {
  value: OutputNode["config"]["persistFormat"];
  label: string;
};

defineProps<{
  bodyKind: BodyKind;
  activeTopAction: NodeTopAction | null;
  isTopActionVisible: boolean;
  humanReviewPending: boolean;
  hasAdvancedSettings: boolean;
  canSavePreset: boolean;
  advancedPopoverWidth: number;
  actionPopoverStyle: CSSProperties;
  confirmPopoverStyle: CSSProperties;
  agentTemperatureInput: string;
  agentBreakpointTimingValue: "before" | "after";
  outputDisplayModeOptions: OutputDisplayModeOption[];
  outputPersistFormatOptions: OutputPersistFormatOption[];
  outputFileNameTemplate: string;
  outputFileNamePlaceholder: string;
  isOutputDisplayModeActive: (displayMode: OutputNode["config"]["displayMode"]) => boolean;
  isOutputPersistFormatActive: (persistFormat: OutputNode["config"]["persistFormat"]) => boolean;
}>();

const emit = defineEmits<{
  (event: "toggle-advanced"): void;
  (event: "preset-action"): void;
  (event: "delete-action"): void;
  (event: "human-review"): void;
  (event: "update:agent-temperature", value: string | number): void;
  (event: "update:agent-breakpoint-timing", value: string | number | boolean | undefined): void;
  (event: "update:output-display-mode", value: OutputNode["config"]["displayMode"]): void;
  (event: "update:output-persist-format", value: OutputNode["config"]["persistFormat"]): void;
  (event: "update:output-file-name", value: string | number): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.node-card__top-actions {
  position: absolute;
  top: 0;
  right: 18px;
  z-index: 12;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: var(--graphite-glass-bg);
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(24px) saturate(1.6) contrast(1.02);
  opacity: 0;
  pointer-events: none;
  transform: translateY(calc(-100% - 8px));
  transition: opacity 160ms ease, transform 160ms ease;
}

.node-card__top-actions::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens);
  mix-blend-mode: screen;
  opacity: 0.5;
}

.node-card__top-actions::after {
  content: "";
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: -12px;
  height: 12px;
}

:global(.node-card:hover) .node-card__top-actions,
:global(.node-card--selected) .node-card__top-actions,
.node-card__top-actions--visible {
  opacity: 1;
  pointer-events: auto;
}

.node-card__top-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

.node-card__top-action-button {
  --el-color-primary: #c96b1f;
  position: relative;
  z-index: 1;
  width: 56px;
  height: 40px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 252, 247, 0.94);
  color: rgba(90, 58, 28, 0.82);
  border-radius: 999px;
  box-shadow: none;
}

.node-card__top-action-button :deep(.el-icon) {
  font-size: 1.18rem;
}

.node-card__human-review-button {
  min-width: 118px;
  height: 40px;
  border: 1px solid rgba(217, 119, 6, 0.26);
  border-radius: 999px;
  background: rgba(217, 119, 6, 0.12);
  color: #9a3412;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow: none;
}

.node-card__human-review-button:hover {
  border-color: rgba(217, 119, 6, 0.34);
  background: rgba(217, 119, 6, 0.18);
  color: #7c2d12;
}

.node-card__top-action-button:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 255, 255, 0.98);
  color: #9a3412;
}

.node-card__top-action-button--delete:hover {
  color: rgb(185, 28, 28);
}

.node-card__top-action-button--confirm {
  color: #fff;
}

.node-card__top-action-button--confirm:hover {
  color: #fff;
}

.node-card__top-action-button--confirm-success,
.node-card__top-action-button--confirm-success:hover {
  border-color: rgba(34, 197, 94, 0.34);
  background: rgb(34, 197, 94);
  color: #fff;
}

.node-card__top-action-button--confirm-danger,
.node-card__top-action-button--confirm-danger:hover {
  border-color: rgba(185, 28, 28, 0.3);
  background: rgb(185, 28, 28);
  color: #fff;
}

.node-card__top-popover {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

.node-card__top-popover-title {
  font-size: 0.96rem;
  font-weight: 600;
  color: #2f2114;
}

.node-card__advanced-popover-content {
  display: grid;
  gap: 10px;
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

.node-card__breakpoint-timing-select {
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 12px;
}

.node-card__breakpoint-timing-select :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
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

.node-card__confirm-hint--preset {
  border-color: rgba(34, 197, 94, 0.16);
  background: rgba(220, 252, 231, 0.98);
  color: rgb(22, 163, 74);
}

.node-card__confirm-hint--delete {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(153, 27, 27);
}

:deep(.node-card__action-popover.el-popper) {
  border: none;
  border-radius: 16px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__action-popover .el-popover) {
  padding: 0;
  border-radius: 16px;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__action-popover .el-input__wrapper) {
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-card__action-popover .el-input__wrapper.is-focus) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 3px rgba(201, 107, 31, 0.08);
}

:deep(.node-card__confirm-popover.el-popper) {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:deep(.node-card__confirm-popover .el-popover) {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

:deep(.node-card__breakpoint-timing-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 14px;
  background: rgba(255, 250, 241, 0.98);
}
</style>
