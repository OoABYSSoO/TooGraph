<template>
  <div class="workspace-select" :class="minWidthClassName">
    <ElSelect
      class="workspace-select__trigger"
      :model-value="modelValue || undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      popper-class="workspace-select__popper"
      @update:model-value="handleValueChange"
    >
      <ElOption
        v-for="option in options"
        :key="option.value"
        :label="option.label"
        :value="option.value"
      />
    </ElSelect>
  </div>
</template>

<script setup lang="ts">
import { ElOption, ElSelect } from "element-plus";
import { computed } from "vue";

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

function handleValueChange(value: string | number | boolean | undefined) {
  emit("update:modelValue", typeof value === "string" ? value : "");
}
</script>

<style scoped>
.workspace-select {
  width: 100%;
}

.workspace-select__trigger {
  width: 100%;
}

.workspace-select__trigger :deep(.el-select__wrapper) {
  min-height: 38px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.14) inset,
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
  padding: 8px 14px;
  transition: box-shadow 160ms ease, background-color 160ms ease;
}

.workspace-select__trigger :deep(.el-select__wrapper:hover) {
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.22) inset,
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.workspace-select__trigger :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px rgba(154, 52, 18, 0.26) inset,
    0 0 0 3px rgba(201, 107, 31, 0.12);
}

.workspace-select__trigger :deep(.el-select__placeholder) {
  color: rgba(60, 41, 20, 0.72);
}

.workspace-select__trigger :deep(.el-select__selected-item),
.workspace-select__trigger :deep(.el-select__input-text) {
  font-size: 0.875rem;
  color: #3c2914;
}

.workspace-select__trigger :deep(.el-select__caret) {
  color: rgba(60, 41, 20, 0.62);
}

.workspace-select__trigger :deep(.is-disabled .el-select__wrapper) {
  cursor: not-allowed;
  opacity: 0.6;
}

:deep(.workspace-select__popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 20px 40px rgba(60, 41, 20, 0.18);
  backdrop-filter: blur(12px);
}

:deep(.workspace-select__popper .el-select-dropdown__list) {
  padding: 4px;
}

:deep(.workspace-select__popper .el-select-dropdown__item) {
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 0.875rem;
  color: #3c2914;
  transition: background-color 140ms ease;
}

:deep(.workspace-select__popper .el-select-dropdown__item.hover),
:deep(.workspace-select__popper .el-select-dropdown__item:hover) {
  background: rgba(154, 52, 18, 0.08);
}

:deep(.workspace-select__popper .el-select-dropdown__item.is-selected) {
  background: rgba(154, 52, 18, 0.12);
  color: rgba(154, 52, 18, 0.96);
}
</style>
