<template>
  <div class="node-card__agent-runtime-row">
    <div class="node-card__agent-model-select-shell" @pointerdown.stop @click.stop>
      <ElSelect
        ref="agentModelSelectRef"
        class="node-card__agent-model-select graphite-select"
        :model-value="modelValue"
        :placeholder="modelOptions.length === 0 ? t('nodeCard.noConfiguredModels') : t('nodeCard.selectModel')"
        :disabled="modelOptions.length === 0"
        popper-class="graphite-select-popper node-card__agent-model-popper"
        @visible-change="emit('model-visible-change', $event)"
        @update:model-value="emit('update:model-value', $event)"
      >
        <ElOption
          v-for="option in modelOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </ElSelect>
    </div>
    <ElPopover
      trigger="hover"
      placement="top-start"
      :show-arrow="false"
      :popper-style="confirmPopoverStyle"
      popper-class="node-card__agent-toggle-hint-popper"
    >
      <template #reference>
        <div
          class="node-card__agent-toggle-card node-card__agent-toggle-card--thinking"
          :class="{ 'node-card__agent-toggle-card--enabled': thinkingEnabled }"
          @pointerdown.stop
          @click.stop
        >
          <span
            class="node-card__agent-thinking-icon"
            :class="{ 'node-card__agent-thinking-icon--enabled': thinkingEnabled }"
            aria-hidden="true"
          >
            <Opportunity />
          </span>
          <ElSelect
            class="node-card__agent-thinking-select graphite-select"
            :model-value="thinkingModeValue"
            :teleported="false"
            popper-class="graphite-select-popper node-card__agent-thinking-popper"
            :aria-label="t('nodeCard.toggleThinking')"
            @pointerdown.stop
            @click.stop
            @update:model-value="emit('update:thinking-mode', $event)"
          >
            <ElOption v-for="option in thinkingOptions" :key="option.value" :label="option.label" :value="option.value" />
          </ElSelect>
        </div>
      </template>
      <div class="node-card__confirm-hint node-card__confirm-hint--toggle">{{ t("nodeCard.thinkingMode") }}</div>
    </ElPopover>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";
import { ref } from "vue";
import { ElOption, ElPopover, ElSelect } from "element-plus";
import { Opportunity } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import type { AgentThinkingControlMode } from "./agentConfigModel";

type AgentModelOption = {
  value: string;
  label: string;
};

type AgentThinkingOption = {
  value: AgentThinkingControlMode;
  label: string;
};

defineProps<{
  modelValue?: string;
  modelOptions: AgentModelOption[];
  globalModelRef: string;
  thinkingModeValue: AgentThinkingControlMode;
  thinkingOptions: AgentThinkingOption[];
  thinkingEnabled: boolean;
  confirmPopoverStyle: CSSProperties;
}>();

const emit = defineEmits<{
  (event: "model-visible-change", visible: boolean): void;
  (event: "update:model-value", value: string | number | boolean | undefined): void;
  (event: "update:thinking-mode", value: string | number | boolean | undefined): void;
}>();

const { t } = useI18n();
const agentModelSelectRef = ref<{ blur?: () => void; toggleMenu?: () => void; expanded?: boolean } | null>(null);

function collapseModelSelect() {
  if (agentModelSelectRef.value?.expanded) {
    agentModelSelectRef.value.toggleMenu?.();
  }
  agentModelSelectRef.value?.blur?.();
}

defineExpose({
  collapseModelSelect,
});
</script>

<style scoped>
.node-card__agent-runtime-row {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(132px, 0.65fr);
  gap: 10px;
  align-items: center;
  justify-content: stretch;
}

.node-card__agent-model-select {
  width: 100%;
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 16px;
  --el-border-color: rgba(154, 52, 18, 0.14);
  --el-text-color-primary: #3c2914;
}

.node-card__agent-model-select-shell {
  width: 100%;
  min-width: 0;
}

.node-card__agent-model-select :deep(.el-select__wrapper) {
  min-height: 48px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  padding: 0 14px;
}

.node-card__agent-model-select :deep(.el-select__wrapper:hover) {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__agent-model-select :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__agent-model-select :deep(.el-select__placeholder) {
  color: rgba(60, 41, 20, 0.48);
}

.node-card__agent-model-select :deep(.el-select__selected-item),
.node-card__agent-model-select :deep(.el-select__input-text),
.node-card__agent-model-select :deep(.el-select__selection .el-tag) {
  color: #3c2914;
  font-size: 0.92rem;
}

.node-card__agent-model-select :deep(.is-disabled .el-select__wrapper) {
  opacity: 0.62;
  background: rgba(250, 243, 231, 0.78);
}

:deep(.node-card__agent-model-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.12);
}

:deep(.node-card__agent-model-popper .el-select-dropdown__list) {
  padding: 8px;
}

:deep(.node-card__agent-model-popper .el-select-dropdown__item) {
  min-height: 38px;
  border-radius: 12px;
  color: #3c2914;
}

:deep(.node-card__agent-model-popper .el-select-dropdown__item.hover),
:deep(.node-card__agent-model-popper .el-select-dropdown__item:hover) {
  background: rgba(154, 52, 18, 0.08);
}

:deep(.node-card__agent-model-popper .el-select-dropdown__item.is-selected) {
  color: #9a3412;
  background: rgba(154, 52, 18, 0.12);
}

.node-card__agent-toggle-card {
  display: grid;
  grid-template-columns: 20px 56px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  transition:
    border-color 140ms ease,
    background 140ms ease,
    box-shadow 140ms ease;
}

.node-card__agent-toggle-card--thinking {
  grid-template-columns: 20px minmax(0, 1fr);
}

.node-card__agent-toggle-card:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__agent-toggle-card:focus-within {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__agent-toggle-card--enabled {
  border-color: rgba(201, 107, 31, 0.28);
  background: rgba(201, 107, 31, 0.1);
}

.node-card__agent-thinking-icon {
  width: 20px;
  height: 20px;
}

.node-card__agent-thinking-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(111, 67, 30, 0.72);
  transition: color 140ms ease;
}

.node-card__agent-thinking-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.node-card__agent-thinking-icon--enabled {
  color: #b45309;
}

.node-card__agent-thinking-select {
  width: 100%;
  min-width: 0;
  --el-color-primary: #c96b1f;
  --el-border-radius-base: 999px;
}

.node-card__agent-thinking-select :deep(.el-select__wrapper) {
  min-height: 32px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 0 0 1px rgba(154, 52, 18, 0.12) inset;
}

.node-card__agent-thinking-select :deep(.el-select__placeholder) {
  color: #7c3d12;
  font-size: 12px;
  font-weight: 700;
}

:deep(.node-card__agent-toggle-hint-popper.el-popper) {
  border: 0;
  background: transparent;
  box-shadow: none;
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

.node-card__confirm-hint--toggle {
  border-color: rgba(201, 107, 31, 0.24);
  background: rgb(255, 247, 237);
  color: rgb(154, 52, 18);
}
</style>
