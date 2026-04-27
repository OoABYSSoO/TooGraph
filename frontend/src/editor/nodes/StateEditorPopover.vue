<template>
  <div class="node-card__state-editor node-state-editor" data-node-popup-surface="true">
    <div class="node-state-editor__title">{{ t("nodeCard.stateEditorTitle") }}</div>

    <div class="node-state-editor__grid">
      <div class="node-state-editor__field">
        <span class="node-state-editor__field-label">{{ t("nodeCard.name") }}</span>
        <ElInput :aria-label="t('nodeCard.name')" :model-value="draft.definition.name" @update:model-value="$emit('update:name', String($event ?? ''))" />
      </div>

      <div class="node-state-editor__field">
        <span class="node-state-editor__field-label">{{ t("nodeCard.type") }}</span>
        <ElSelect
          ref="typeSelectRef"
          class="node-state-editor__type-select graphite-select"
          :aria-label="t('nodeCard.type')"
          :model-value="draft.definition.type"
          :teleported="false"
          popper-class="graphite-select-popper node-state-editor__select-popper"
          @update:model-value="handleTypeSelect"
        >
          <ElOption v-for="typeOption in typeOptions" :key="typeOption" :label="typeOption" :value="typeOption" />
        </ElSelect>
      </div>

      <div class="node-state-editor__field">
        <span class="node-state-editor__field-label">{{ t("nodeCard.color") }}</span>
        <div class="node-state-editor__color-select-shell">
          <ElSelect
            ref="colorSelectRef"
            class="node-state-editor__color-select graphite-select"
            :aria-label="t('nodeCard.color')"
            :model-value="draft.definition.color"
            :teleported="false"
            popper-class="graphite-select-popper node-state-editor__select-popper"
            @update:model-value="handleColorSelect"
          >
            <template #label>
              <span class="node-state-editor__color-select-value">
                <span class="node-state-editor__color-dot" :style="selectedColorStyle" />
              </span>
            </template>
            <ElOption v-for="option in colorOptions" :key="option.value || option.label" :label="option.label" :value="option.value">
              <div class="node-state-editor__color-option">
                <span class="node-state-editor__color-dot" :style="{ backgroundColor: option.swatch }" />
                <span class="node-state-editor__color-option-label">{{ option.label }}</span>
              </div>
            </ElOption>
          </ElSelect>
        </div>
      </div>
    </div>

    <div class="node-state-editor__field node-state-editor__field--full">
      <span class="node-state-editor__field-label">{{ t("nodeCard.description") }}</span>
      <ElInput
        :aria-label="t('nodeCard.description')"
        type="textarea"
        :rows="2"
        :model-value="draft.definition.description"
        @update:model-value="$emit('update:description', String($event ?? ''))"
      />
    </div>

    <div v-if="error" class="node-state-editor__hint node-state-editor__hint--error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { ElInput, ElOption, ElSelect } from "element-plus";
import { useI18n } from "vue-i18n";

import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

const props = defineProps<{
  draft: StateFieldDraft;
  error: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
}>();

const emit = defineEmits<{
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
}>();

const { t } = useI18n();
const typeSelectRef = ref<{ blur?: () => void; toggleMenu?: () => void; expanded?: boolean } | null>(null);
const colorSelectRef = ref<{ blur?: () => void; toggleMenu?: () => void; expanded?: boolean } | null>(null);

const selectedColorStyle = computed(() => {
  const matched = props.colorOptions.find((option) => option.value === props.draft.definition.color);
  const selectedSwatch = matched?.swatch || props.draft.definition.color || "#d97706";
  return {
    backgroundColor: selectedSwatch,
  };
});

async function collapseSelectMenu(selectRef: typeof typeSelectRef) {
  await nextTick();
  if (selectRef.value?.expanded) {
    selectRef.value.toggleMenu?.();
  }
  selectRef.value?.blur?.();
}

async function handleTypeSelect(value: string | number | boolean | undefined) {
  emit("update:type", String(value ?? "text"));
  await collapseSelectMenu(typeSelectRef);
}

async function handleColorSelect(value: string | number | boolean | undefined) {
  emit("update:color", String(value ?? ""));
  await collapseSelectMenu(colorSelectRef);
}
</script>

<style scoped>
.node-state-editor {
  display: grid;
  gap: 10px;
  padding: 12px;
  color: #3c2914;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

.node-state-editor__title {
  font-size: 0.96rem;
  font-weight: 600;
  color: #2f2114;
}

.node-state-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.node-state-editor__field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.node-state-editor__field--full {
  grid-column: 1 / -1;
}

.node-state-editor__field-label {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.node-state-editor__type-select,
.node-state-editor__color-select {
  width: 100%;
}

.node-state-editor__color-select-shell {
  position: relative;
}

.node-state-editor__color-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-state-editor__color-option-label {
  font-size: 0.84rem;
  color: #3c2914;
}

.node-state-editor__color-select-value {
  display: inline-flex;
  align-items: center;
}

.node-state-editor__color-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid rgba(60, 41, 20, 0.16);
  flex: none;
}

.node-state-editor__hint {
  font-size: 0.76rem;
  line-height: 1.45;
  color: rgba(60, 41, 20, 0.68);
}

.node-state-editor__hint--error {
  color: rgb(153, 27, 27);
}

:deep(.node-state-editor .el-input__wrapper),
:deep(.node-state-editor .el-select__wrapper) {
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-state-editor .el-input__wrapper.is-focus),
:deep(.node-state-editor .el-select__wrapper.is-focused) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 3px rgba(201, 107, 31, 0.08);
}

:deep(.node-state-editor .el-select__wrapper) {
  padding-right: 28px;
}

:deep(.node-state-editor__color-select .el-select__wrapper) {
  padding-left: 14px;
}

:deep(.node-state-editor__color-select .el-select__selected-item),
:deep(.node-state-editor__color-select .el-select__selection-text) {
  display: inline-flex;
  align-items: center;
}

:deep(.node-state-editor .el-textarea__inner) {
  min-height: 84px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-state-editor__select-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.98);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

:deep(.node-state-editor__select-popper .el-select-dropdown__list) {
  padding: 8px;
}

:deep(.node-state-editor__select-popper .el-select-dropdown__item) {
  min-height: 36px;
  border-radius: 12px;
  color: #3c2914;
}

:deep(.node-state-editor__select-popper .el-select-dropdown__item.hover),
:deep(.node-state-editor__select-popper .el-select-dropdown__item:hover) {
  background: rgba(154, 52, 18, 0.08);
}

:deep(.node-state-editor__select-popper .el-select-dropdown__item.is-selected) {
  color: #9a3412;
  background: rgba(201, 107, 31, 0.1);
}
</style>
