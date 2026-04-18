<template>
  <SelectRoot :model-value="modelValue" @update:model-value="handleValueChange">
    <SelectTrigger class="workspace-select__trigger" :class="minWidthClassName" :disabled="disabled">
      <SelectValue :placeholder="placeholder" />
      <SelectIcon class="workspace-select__icon">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4.5 6 3.5 4 3.5-4" />
        </svg>
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent class="workspace-select__content" position="popper" :side-offset="8">
        <SelectViewport class="workspace-select__viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            class="workspace-select__item"
            :value="option.value"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="workspace-select__item-indicator">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";

import { hasWorkspaceSelectOptions, type WorkspaceSelectOption } from "./workspaceSelectModel";

const props = defineProps<{
  modelValue: string;
  placeholder: string;
  options: WorkspaceSelectOption[];
  minWidthClassName?: string;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

const disabled = computed(() => !hasWorkspaceSelectOptions(props.options));

function handleValueChange(value: string) {
  emit("update:modelValue", value);
}
</script>

<style scoped>
.workspace-select__trigger {
  position: relative;
  min-height: 38px;
  width: 100%;
  appearance: none;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  padding: 8px 40px 8px 14px;
  font-size: 0.875rem;
  color: #3c2914;
  text-align: left;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  outline: none;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.workspace-select__trigger:hover {
  border-color: rgba(154, 52, 18, 0.22);
}

.workspace-select__trigger[data-placeholder] {
  color: rgba(60, 41, 20, 0.72);
}

.workspace-select__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.workspace-select__icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: rgba(60, 41, 20, 0.62);
  pointer-events: none;
}

.workspace-select__icon :deep(svg) {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}

.workspace-select__content {
  z-index: 50;
  min-width: var(--reka-select-trigger-width);
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.18);
  backdrop-filter: blur(12px);
}

.workspace-select__viewport {
  display: grid;
  gap: 4px;
  padding: 4px;
}

.workspace-select__item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 0.875rem;
  color: #3c2914;
  outline: none;
  cursor: pointer;
  transition: background-color 140ms ease;
}

.workspace-select__item[data-highlighted] {
  background: rgba(154, 52, 18, 0.08);
}

.workspace-select__item[data-state='checked'] {
  background: rgba(154, 52, 18, 0.12);
  color: rgba(154, 52, 18, 0.96);
}

.workspace-select__item-indicator {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}

.workspace-select__item-indicator :deep(svg) {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}
</style>
