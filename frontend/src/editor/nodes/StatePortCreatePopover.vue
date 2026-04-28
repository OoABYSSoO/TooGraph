<template>
  <div
    class="node-card__agent-create-port-popover node-card__port-picker"
    data-node-popup-surface="true"
    @pointerdown.stop
    @click.stop
  >
    <div class="node-card__port-picker-title">{{ title }}</div>
    <div class="node-card__port-picker-form">
      <div class="node-card__port-picker-grid">
        <label class="node-card__control-row">
          <span class="node-card__control-label">{{ t("nodeCard.name") }}</span>
          <ElInput
            :aria-label="t('nodeCard.name')"
            :model-value="draft.definition.name"
            @update:model-value="emit('update:name', $event)"
          />
        </label>
        <label class="node-card__control-row">
          <span class="node-card__control-label">{{ t("nodeCard.type") }}</span>
          <ElSelect
            class="node-card__control-select graphite-select"
            :model-value="draft.definition.type"
            :teleported="false"
            popper-class="graphite-select-popper node-card__port-picker-select-popper"
            @update:model-value="emit('update:type', $event)"
          >
            <ElOption v-for="typeOption in typeOptions" :key="typeOption" :label="typeOption" :value="typeOption" />
          </ElSelect>
        </label>
        <label class="node-card__control-row">
          <span class="node-card__control-label">{{ t("nodeCard.color") }}</span>
          <ElSelect
            class="node-card__control-select graphite-select"
            :model-value="draft.definition.color"
            :teleported="false"
            popper-class="graphite-select-popper node-card__port-picker-select-popper"
            @update:model-value="emit('update:color', $event)"
          >
            <template #label>
              <span class="node-card__port-picker-color-value">
                <span class="node-card__port-picker-color-dot" :style="selectedColorStyle" />
              </span>
            </template>
            <ElOption v-for="option in colorOptions" :key="option.value || option.label" :label="option.label" :value="option.value">
              <div class="node-card__port-picker-color-option">
                <span class="node-card__port-picker-color-dot" :style="{ backgroundColor: option.swatch }" />
                <span>{{ option.label }}</span>
              </div>
            </ElOption>
          </ElSelect>
        </label>
      </div>
      <label class="node-card__control-row">
        <span class="node-card__control-label">{{ t("nodeCard.description") }}</span>
        <ElInput
          :aria-label="t('nodeCard.description')"
          type="textarea"
          :rows="2"
          :model-value="draft.definition.description"
          @update:model-value="emit('update:description', $event)"
        />
      </label>
      <StateDefaultValueEditor
        :field="draft.definition"
        @update-value="emit('update:value', $event)"
      />
      <div class="node-card__port-picker-hint" :class="{ 'node-card__port-picker-hint--error': Boolean(error) }">
        {{ error ?? hint }}
      </div>
      <div class="node-card__port-picker-actions">
        <button
          type="button"
          class="node-card__port-picker-button"
          @pointerdown.stop
          @click.stop="emit('cancel')"
        >
          {{ t("common.cancel") }}
        </button>
        <button
          type="button"
          class="node-card__port-picker-button node-card__port-picker-button--primary"
          @pointerdown.stop
          @click.stop="emit('create')"
        >
          {{ t("nodeCard.create") }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElInput, ElOption, ElSelect } from "element-plus";
import { useI18n } from "vue-i18n";

import StateDefaultValueEditor from "@/editor/workspace/StateDefaultValueEditor.vue";
import { resolveStateColorOptions, type StateFieldDraft } from "@/editor/workspace/statePanelFields";

const props = defineProps<{
  draft: StateFieldDraft;
  title: string;
  error: string | null;
  hint: string;
  typeOptions: string[];
}>();

const emit = defineEmits<{
  (event: "update:name", value: string | number): void;
  (event: "update:type", value: string | number | boolean | undefined): void;
  (event: "update:color", value: string | number | boolean | undefined): void;
  (event: "update:description", value: string | number): void;
  (event: "update:value", value: unknown): void;
  (event: "cancel"): void;
  (event: "create"): void;
}>();

const { t } = useI18n();

const colorOptions = computed(() => resolveStateColorOptions(props.draft.definition.color ?? ""));
const selectedColorStyle = computed(() => {
  const selectedColor = props.draft.definition.color ?? "";
  const matchedOption = colorOptions.value.find((option) => option.value === selectedColor);
  return { backgroundColor: matchedOption?.swatch ?? selectedColor };
});
</script>

<style scoped>
.node-card__agent-create-port-popover {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
  color: #3c2914;
}

.node-card__port-picker {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  padding: 12px;
  background: rgba(255, 244, 232, 0.96);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

.node-card__port-picker-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__port-picker-form {
  display: grid;
  gap: 10px;
}

.node-card__port-picker-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.node-card__port-picker-color-value,
.node-card__port-picker-color-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.node-card__port-picker-color-dot {
  width: 10px;
  height: 10px;
  flex: none;
  border: 1px solid rgba(60, 41, 20, 0.16);
  border-radius: 999px;
}

.node-card__port-picker-hint {
  font-size: 0.76rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.68);
}

.node-card__port-picker-hint--error {
  color: rgb(153, 27, 27);
}

.node-card__port-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.node-card__port-picker-button {
  min-height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.88);
  color: rgba(60, 41, 20, 0.78);
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.node-card__port-picker-button--primary {
  border-color: rgba(21, 128, 61, 0.18);
  background: rgba(240, 253, 244, 0.92);
  color: #15803d;
}

.node-card__control-row {
  display: grid;
  gap: 6px;
}

.node-card__control-label {
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:deep(.node-card__agent-create-port-popover .el-input__wrapper),
:deep(.node-card__agent-create-port-popover .el-select__wrapper) {
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.node-card__agent-create-port-popover .el-input__wrapper.is-focus),
:deep(.node-card__agent-create-port-popover .el-select__wrapper.is-focused) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 2px rgba(201, 107, 31, 0.1);
}

:deep(.node-card__agent-create-port-popover .el-textarea__inner) {
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
  color: #3c2914;
}

:deep(.node-card__agent-create-port-popover .el-textarea__inner:focus) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 2px rgba(201, 107, 31, 0.1);
}
</style>
