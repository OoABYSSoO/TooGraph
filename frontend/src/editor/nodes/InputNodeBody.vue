<template>
  <div class="node-card__input-body">
    <div class="node-card__port-row node-card__port-row--single node-card__port-row--input-boundary">
      <ElSegmented
        class="node-card__input-boundary-toggle"
        :model-value="inputBoundarySelection"
        :options="inputTypeOptions"
        :aria-label="t('nodeCard.inputBoundaryMode')"
        @pointerdown.stop
        @click.stop
        @update:model-value="emit('update:boundary-selection', $event)"
      >
        <template #default="{ item }">
          <span class="node-card__input-boundary-icon-wrap">
            <component :is="item.icon" class="node-card__input-boundary-icon" aria-hidden="true" />
            <span class="node-card__sr-only">{{ item.label }}</span>
          </span>
        </template>
      </ElSegmented>
      <slot name="primary-output" />
    </div>
    <div v-if="showLocalFolderInput" class="node-card__surface node-card__local-folder">
      <label class="node-card__control-row">
        <span class="node-card__control-label">{{ t("nodeCard.localFolder") }}</span>
        <div class="node-card__local-folder-path-row">
          <input
            class="node-card__local-folder-path-input"
            :value="localFolderRoot"
            :placeholder="t('nodeCard.localFolderPathPlaceholder')"
            @pointerdown.stop
            @click.stop
            @input="emit('local-folder-root-input', ($event.target as HTMLInputElement).value)"
          />
          <button
            type="button"
            class="node-card__local-folder-action"
            :disabled="localFolderLoading || !localFolderRoot.trim()"
            @pointerdown.stop
            @click.stop="emit('local-folder-refresh')"
          >
            {{ localFolderLoading ? t("nodeCard.localFolderLoading") : t("nodeCard.localFolderRefresh") }}
          </button>
        </div>
      </label>
      <div class="node-card__local-folder-toolbar">
        <span class="node-card__input-meta">{{ localFolderSummary }}</span>
        <div class="node-card__local-folder-actions">
          <button
            type="button"
            class="node-card__local-folder-link"
            :disabled="localFolderEntries.length === 0"
            @pointerdown.stop
            @click.stop="emit('local-folder-select-all')"
          >
            {{ t("nodeCard.localFolderSelectAll") }}
          </button>
          <button
            type="button"
            class="node-card__local-folder-link"
            :disabled="localFolderSelected.length === 0"
            @pointerdown.stop
            @click.stop="emit('local-folder-clear')"
          >
            {{ t("nodeCard.localFolderClear") }}
          </button>
        </div>
      </div>
      <div v-if="localFolderError" class="node-card__local-folder-error">
        {{ localFolderError }}
      </div>
      <div v-else class="node-card__local-folder-list" @pointerdown.stop @click.stop>
        <label
          v-for="entry in localFolderEntries"
          :key="entry.path"
          class="node-card__local-folder-entry"
          :class="{
            'node-card__local-folder-entry--directory': entry.type === 'directory',
            'node-card__local-folder-entry--file': entry.type === 'file',
          }"
        >
          <input
            v-if="entry.type === 'file'"
            class="node-card__local-folder-checkbox"
            type="checkbox"
            :checked="selectedLocalFolderPaths.has(entry.path)"
            @change="emit('local-folder-selection-toggle', entry.path, ($event.target as HTMLInputElement).checked)"
          />
          <span v-else class="node-card__local-folder-directory-spacer" />
          <span class="node-card__local-folder-entry-main">
            <span class="node-card__local-folder-entry-path">{{ entry.path }}</span>
            <span class="node-card__local-folder-entry-meta">
              {{ entry.type === "directory" ? t("nodeCard.localFolderDirectory") : `${entry.content_type} · ${entry.size} B` }}
            </span>
          </span>
        </label>
        <div v-if="!localFolderLoading && localFolderEntries.length === 0" class="node-card__input-meta">
          {{ localFolderRoot.trim() ? t("nodeCard.localFolderEmpty") : t("nodeCard.localFolderNeedsPath") }}
        </div>
      </div>
    </div>
    <div v-else-if="showAssetUploadInput" class="node-card__input-upload">
      <label
        v-if="!inputAssetEnvelope"
        class="node-card__asset-dropzone"
        role="button"
        tabindex="0"
        @pointerdown.stop
        @click.stop="handleAssetUploadSurfaceClick"
        @keydown.enter.prevent="openInputAssetPicker"
        @keydown.space.prevent="openInputAssetPicker"
        @dragover.prevent
        @drop.prevent="emit('asset-drop', $event)"
      >
        <input
          ref="inputAssetInputRef"
          class="node-card__asset-native-input"
          type="file"
          tabindex="-1"
          :accept="inputAssetAccept"
          :aria-label="`Upload ${inputAssetLabel}`"
          @pointerdown.stop
          @dragover.prevent
          @drop.prevent.stop="emit('asset-drop', $event)"
          @change="emit('asset-file-change', $event)"
        />
        <span class="node-card__asset-dropzone-title">Drop {{ inputAssetLabel }} here</span>
        <span class="node-card__asset-dropzone-copy">Or click to choose a file from your device.</span>
      </label>
      <div
        v-else
        class="node-card__asset-preview-card"
        @dragover.prevent
        @drop.prevent="emit('asset-drop', $event)"
      >
        <div class="node-card__asset-actions">
          <label
            class="node-card__asset-action"
            role="button"
            tabindex="0"
            @pointerdown.stop
            @click.stop="handleAssetUploadSurfaceClick"
            @keydown.enter.prevent="openInputAssetPicker"
            @keydown.space.prevent="openInputAssetPicker"
          >
            <input
              ref="inputAssetInputRef"
              class="node-card__asset-native-input node-card__asset-native-input--action"
              type="file"
              tabindex="-1"
              :accept="inputAssetAccept"
              aria-label="Replace uploaded file"
              @pointerdown.stop
              @change="emit('asset-file-change', $event)"
            />
            Replace
          </label>
          <button
            type="button"
            class="node-card__asset-action node-card__asset-action--danger"
            @pointerdown.stop
            @click.stop="emit('clear-asset')"
          >
            Remove
          </button>
        </div>

        <div
          v-if="inputAssetEnvelope.detectedType === 'image' && inputAssetPreviewUrl"
          class="node-card__asset-media-shell"
        >
          <img :src="inputAssetPreviewUrl" :alt="inputAssetEnvelope.name" class="node-card__asset-image" />
        </div>
        <div
          v-else-if="inputAssetEnvelope.detectedType === 'audio' && inputAssetPreviewUrl"
          class="node-card__asset-media-shell node-card__asset-media-shell--audio"
        >
          <audio controls class="node-card__asset-audio">
            <source :src="inputAssetPreviewUrl" :type="inputAssetEnvelope.mimeType" />
          </audio>
        </div>
        <div
          v-else-if="inputAssetEnvelope.detectedType === 'video' && inputAssetPreviewUrl"
          class="node-card__asset-media-shell"
        >
          <video controls class="node-card__asset-video">
            <source :src="inputAssetPreviewUrl" :type="inputAssetEnvelope.mimeType" />
          </video>
        </div>
        <div v-else class="node-card__asset-file">
          <div class="node-card__asset-name">{{ inputAssetEnvelope.name }}</div>
          <div class="node-card__asset-summary">{{ inputAssetSummary }}</div>
          <pre v-if="inputAssetTextPreview" class="node-card__asset-text">{{ inputAssetTextPreview }}</pre>
        </div>

        <div class="node-card__input-meta">
          {{ inputAssetDescription }}
        </div>
      </div>
      <div v-if="showLegacyUploadedAssetHint" class="node-card__input-meta">
        {{ t("nodeCard.rawTextUploadHint") }}
      </div>
    </div>
    <div
      v-else-if="inputPresentationControl === 'select'"
      class="node-card__surface node-card__presentation-control"
      @pointerdown.stop
      @click.stop
    >
      <label class="node-card__control-row">
        <span class="node-card__control-label">{{ t("nodeCard.enterInputValue") }}</span>
        <ToographSelect
          class="node-card__input-presentation-select"
          :model-value="inputPresentationSelectValue"
          popper-class="toograph-select-popper"
          remount-on-select
          @update:model-value="(value) => emit('update-input-value', value)"
        >
          <ElOption
            v-for="option in inputPresentationOptions"
            :key="String(option.value)"
            :label="option.label"
            :value="option.value"
          />
        </ToographSelect>
      </label>
    </div>
    <div
      v-else-if="inputPresentationControl === 'number'"
      class="node-card__surface node-card__presentation-control"
      @pointerdown.stop
      @click.stop
    >
      <label class="node-card__control-row">
        <span class="node-card__control-label">{{ t("nodeCard.enterInputValue") }}</span>
        <ElInputNumber
          class="node-card__input-presentation-number"
          :model-value="inputPresentationNumberValue"
          controls-position="right"
          @update:model-value="(value) => emit('update-input-value', Number(value ?? 0))"
        />
      </label>
    </div>
    <div
      v-else-if="inputPresentationControl === 'boolean'"
      class="node-card__surface node-card__presentation-control node-card__presentation-control--inline"
      @pointerdown.stop
      @click.stop
    >
      <span class="node-card__control-label">{{ t("nodeCard.enterInputValue") }}</span>
      <ElSwitch
        class="node-card__input-presentation-switch"
        :model-value="Boolean(inputRawValue)"
        :width="78"
        inline-prompt
        active-text="True"
        inactive-text="False"
        @update:model-value="(value) => emit('update-input-value', Boolean(value))"
      />
    </div>
    <div
      v-else-if="inputPresentationControl === 'object'"
      class="node-card__surface node-card__presentation-control"
      @pointerdown.stop
      @click.stop
    >
      <div class="node-card__presentation-object-grid">
        <label
          v-for="property in inputPresentationObjectProperties"
          :key="property.key"
          class="node-card__presentation-object-field"
        >
          <span class="node-card__control-label">{{ property.name || property.key }}</span>
          <ElInputNumber
            v-if="isNumberPresentationProperty(property)"
            class="node-card__input-presentation-number"
            :model-value="inputPresentationObjectNumberValue(property)"
            :min="property.min ?? undefined"
            :max="property.max ?? undefined"
            :step="property.step ?? 1"
            controls-position="right"
            @update:model-value="(value) => updateInputPresentationObjectProperty(property.key, Number(value ?? 0))"
          />
          <ToographSelect
            v-else-if="hasPresentationPropertyOptions(property)"
            class="node-card__input-presentation-select"
            :model-value="String(inputPresentationObjectPropertyValue(property) ?? '')"
            popper-class="toograph-select-popper"
            remount-on-select
            @update:model-value="(value) => updateInputPresentationObjectProperty(property.key, value)"
          >
            <ElOption
              v-for="option in property.options ?? []"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </ToographSelect>
          <ElSwitch
            v-else-if="isBooleanPresentationProperty(property)"
            class="node-card__input-presentation-switch"
            :model-value="Boolean(inputPresentationObjectPropertyValue(property))"
            :width="64"
            inline-prompt
            active-text="On"
            inactive-text="Off"
            @update:model-value="(value) => updateInputPresentationObjectProperty(property.key, Boolean(value))"
          />
          <ElInput
            v-else
            class="node-card__input-presentation-text"
            :model-value="String(inputPresentationObjectPropertyValue(property) ?? '')"
            @update:model-value="(value) => updateInputPresentationObjectProperty(property.key, String(value ?? ''))"
          />
        </label>
      </div>
    </div>
    <textarea
      v-else-if="isInputValueEditable"
      class="node-card__surface node-card__surface-textarea"
      :data-virtual-affordance-id="`editor.canvas.node.${nodeId}.input.value`"
      :data-virtual-affordance-label="`输入节点值：${nodeId}`"
      data-virtual-affordance-role="textbox"
      data-virtual-affordance-zone="editor-canvas.node"
      data-virtual-affordance-actions="focus,clear,type"
      data-virtual-affordance-input-kind="text"
      :data-virtual-affordance-value-preview="inputValueText"
      :value="inputValueText"
      :placeholder="t('nodeCard.enterInputValue')"
      @pointerdown.stop
      @click.stop
      @input="emit('input-value', $event)"
    />
    <div v-else class="node-card__surface node-card__surface--tall">{{ body.valueText || t("nodeCard.emptyInput") }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import { ElInput, ElInputNumber, ElOption, ElSegmented, ElSwitch } from "element-plus";
import { useI18n } from "vue-i18n";

import ToographSelect from "@/components/ToographSelect.vue";
import type { LocalFolderTreeEntry } from "@/api/localInputSources";
import type { NodeCardViewModel } from "./nodeCardViewModel";
import type { UploadedAssetEnvelope } from "./uploadedAssetModel";
import type { InputValuePresentation, InputValuePresentationProperty } from "@/types/node-system";

type InputBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "input" }>;

type InputTypeOption = {
  value: "text" | "file" | "folder";
  label: string;
  icon: Component;
};

const props = defineProps<{
  nodeId: string;
  body: InputBodyViewModel;
  inputBoundarySelection: "text" | "file" | "folder";
  inputTypeOptions: InputTypeOption[];
  inputAssetEnvelope: UploadedAssetEnvelope | null;
  inputAssetSummary: string;
  inputAssetTextPreview: string;
  inputAssetDescription: string;
  inputAssetPreviewUrl: string;
  inputAssetAccept: string;
  inputAssetLabel: string;
  localFolderRoot: string;
  localFolderEntries: LocalFolderTreeEntry[];
  localFolderSelected: string[];
  localFolderSummary: string;
  localFolderLoading: boolean;
  localFolderError: string;
  showLocalFolderInput: boolean;
  showAssetUploadInput: boolean;
  showLegacyUploadedAssetHint: boolean;
  isInputValueEditable: boolean;
  inputValueText: string;
  inputRawValue: unknown;
  inputValueType: string;
  inputValuePresentation: InputValuePresentation | null;
}>();

const emit = defineEmits<{
  (event: "update:boundary-selection", value: string | number | boolean): void;
  (event: "local-folder-root-input", value: string): void;
  (event: "local-folder-refresh"): void;
  (event: "local-folder-selection-toggle", path: string, selected: boolean): void;
  (event: "local-folder-select-all"): void;
  (event: "local-folder-clear"): void;
  (event: "asset-file-change", inputEvent: Event): void;
  (event: "asset-drop", dragEvent: DragEvent): void;
  (event: "clear-asset"): void;
  (event: "input-value", inputEvent: Event): void;
  (event: "update-input-value", value: unknown): void;
}>();

const { t } = useI18n();
const inputAssetInputRef = ref<HTMLInputElement | null>(null);
const selectedLocalFolderPaths = computed(() => new Set(props.localFolderSelected));
const inputPresentationControl = computed(() => {
  const control = props.inputValuePresentation?.control ?? null;
  if (control === "select" || control === "number" || control === "boolean" || control === "object") {
    return control;
  }
  const valueType = props.inputValueType.trim().toLowerCase();
  if (valueType === "number" || valueType === "integer") {
    return "number";
  }
  if (valueType === "boolean") {
    return "boolean";
  }
  return null;
});
const inputPresentationOptions = computed(() => props.inputValuePresentation?.options ?? []);
const inputPresentationSelectValue = computed(() => {
  const value = props.inputRawValue;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : "";
});
const inputPresentationNumberValue = computed(() => {
  const numericValue = Number(props.inputRawValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
});
const inputPresentationObjectValue = computed<Record<string, unknown>>(() => {
  if (isRecord(props.inputRawValue)) {
    return { ...props.inputRawValue };
  }
  if (isRecord(props.inputValuePresentation?.default)) {
    return { ...props.inputValuePresentation.default };
  }
  return {};
});
const inputPresentationObjectProperties = computed(() =>
  (props.inputValuePresentation?.properties ?? []).filter((property) => isPresentationObjectPropertyVisible(property)),
);

function isPresentationObjectPropertyVisible(property: InputValuePresentationProperty) {
  const condition = property.visibleWhen;
  if (!condition?.field) {
    return true;
  }
  if (!Object.prototype.hasOwnProperty.call(inputPresentationObjectValue.value, condition.field)) {
    return true;
  }
  return String(inputPresentationObjectValue.value[condition.field] ?? "") === String(condition.equals ?? "");
}

function inputPresentationObjectPropertyValue(property: InputValuePresentationProperty) {
  if (Object.prototype.hasOwnProperty.call(inputPresentationObjectValue.value, property.key)) {
    return inputPresentationObjectValue.value[property.key];
  }
  return defaultPresentationPropertyValue(property);
}

function inputPresentationObjectNumberValue(property: InputValuePresentationProperty) {
  const numericValue = Number(inputPresentationObjectPropertyValue(property));
  return Number.isFinite(numericValue) ? numericValue : Number(defaultPresentationPropertyValue(property) ?? 0);
}

function updateInputPresentationObjectProperty(propertyKey: string, value: unknown) {
  emit("update-input-value", {
    ...inputPresentationObjectValue.value,
    [propertyKey]: value,
  });
}

function hasPresentationPropertyOptions(property: InputValuePresentationProperty) {
  return (property.options?.length ?? 0) > 0;
}

function isBooleanPresentationProperty(property: InputValuePresentationProperty) {
  return property.valueType?.trim().toLowerCase() === "boolean";
}

function isNumberPresentationProperty(property: InputValuePresentationProperty) {
  const valueType = property.valueType?.trim().toLowerCase() ?? "";
  return valueType === "number" || valueType === "integer";
}

function defaultPresentationPropertyValue(property: InputValuePresentationProperty) {
  if (Object.prototype.hasOwnProperty.call(property, "default")) {
    return clonePresentationValue(property.default);
  }
  if (isBooleanPresentationProperty(property)) {
    return false;
  }
  if (isNumberPresentationProperty(property)) {
    return 0;
  }
  return "";
}

function clonePresentationValue(value: unknown): unknown {
  return value === undefined ? undefined : structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function handleAssetUploadSurfaceClick(event: MouseEvent) {
  if (event.target instanceof HTMLInputElement) {
    return;
  }
  openInputAssetPicker();
}

function openInputAssetPicker() {
  const input = inputAssetInputRef.value;
  if (!input) {
    return;
  }

  const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof pickerInput.showPicker === "function") {
    try {
      pickerInput.showPicker();
      return;
    } catch {
      // Fall back to the long-supported click path for browsers without showPicker support.
    }
  }

  input.click();
}
</script>

<style scoped>
.node-card__input-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.node-card__port-row {
  display: grid;
  align-items: center;
}

.node-card__port-row--single {
  grid-template-columns: minmax(0, 1fr) auto;
}

.node-card__port-row--input-boundary {
  gap: 16px;
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

.node-card__surface--tall {
  min-height: 180px;
}

.node-card__input-picker {
  display: grid;
  gap: 10px;
}

.node-card__input-upload {
  display: grid;
  gap: 10px;
}

.node-card__local-folder {
  display: grid;
  min-height: 220px;
  gap: 12px;
}

.node-card__local-folder-path-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.node-card__local-folder-path-input {
  min-width: 0;
  height: 38px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.94);
  color: #1f2937;
  font: inherit;
  outline: none;
}

.node-card__local-folder-path-input:focus {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.node-card__local-folder-action,
.node-card__local-folder-link {
  min-height: 32px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(239, 246, 255, 0.92);
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.node-card__local-folder-action:disabled,
.node-card__local-folder-link:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.node-card__local-folder-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.node-card__local-folder-actions {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
}

.node-card__local-folder-list {
  display: grid;
  max-height: 260px;
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.node-card__local-folder-entry {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 42px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.08);
  padding: 7px 10px;
  color: #1f2937;
}

.node-card__local-folder-entry:last-child {
  border-bottom: none;
}

.node-card__local-folder-entry--directory {
  background: rgba(255, 248, 240, 0.54);
}

.node-card__local-folder-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #2563eb;
}

.node-card__local-folder-directory-spacer {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: rgba(154, 52, 18, 0.12);
}

.node-card__local-folder-entry-main {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.node-card__local-folder-entry-path {
  overflow: hidden;
  color: #1f2937;
  font-size: 0.86rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__local-folder-entry-meta {
  overflow: hidden;
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__local-folder-error {
  border: 1px solid rgba(185, 28, 28, 0.18);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(254, 242, 242, 0.9);
  color: #991b1b;
  font-size: 0.82rem;
  line-height: 1.45;
}

.node-card__input-boundary-toggle {
  justify-self: start;
  min-width: 136px;
  --el-segmented-bg-color: rgba(255, 248, 240, 0.92);
  --el-segmented-item-selected-bg-color: rgba(255, 255, 255, 0.98);
  --el-segmented-item-selected-color: #8c4a14;
  --el-segmented-color: rgba(90, 58, 28, 0.82);
  --el-fill-color-light: rgba(255, 248, 240, 0.92);
  --el-border-radius-base: 999px;
  --el-border-radius-round: 999px;
  --el-border-color: rgba(154, 52, 18, 0.14);
  --el-color-primary: #c96b1f;
  --el-text-color-primary: rgba(90, 58, 28, 0.88);
}

.node-card__input-boundary-toggle :deep(.el-segmented) {
  padding: 4px;
  border-radius: 999px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.58),
    0 8px 18px rgba(120, 53, 15, 0.06);
}

.node-card__input-boundary-toggle :deep(.el-segmented__group) {
  gap: 4px;
}

.node-card__input-boundary-toggle :deep(.el-segmented__item) {
  min-height: 30px;
  min-width: 38px;
  border-radius: 999px;
}

.node-card__input-boundary-toggle :deep(.el-segmented__item-label) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 100%;
  line-height: 1;
}

.node-card__input-boundary-toggle :deep(.el-segmented__item-selected) {
  box-shadow: 0 6px 14px rgba(120, 53, 15, 0.1);
}

.node-card__input-boundary-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.node-card__input-boundary-icon {
  width: 18px;
  height: 18px;
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

.node-card__control-select {
  width: 100%;
}

.node-card__input-select {
  min-height: 48px;
}

.node-card__presentation-control {
  display: grid;
  gap: 10px;
  min-height: 0;
}

.node-card__presentation-control--inline {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.node-card__input-presentation-select,
.node-card__input-presentation-number,
.node-card__input-presentation-text {
  width: 100%;
}

.node-card__presentation-object-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.node-card__presentation-object-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.node-card__input-presentation-switch {
  justify-self: start;
}

.node-card__input-meta {
  font-size: 0.84rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.7);
}

.node-card__asset-dropzone {
  position: relative;
  display: grid;
  min-height: 176px;
  place-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  border-radius: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.84);
  color: #3c2914;
  text-align: center;
  cursor: pointer;
  touch-action: manipulation;
}

.node-card__asset-native-input {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  pointer-events: auto;
}

.node-card__asset-dropzone-title {
  font-size: 1rem;
  font-weight: 600;
}

.node-card__asset-dropzone-copy {
  font-size: 0.84rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.node-card__asset-preview-card {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 24px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.node-card__asset-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.node-card__asset-action {
  position: relative;
  overflow: hidden;
  min-height: 30px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 250, 241, 0.92);
  color: rgba(60, 41, 20, 0.78);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  touch-action: manipulation;
}

.node-card__asset-native-input--action {
  border-radius: inherit;
}

.node-card__asset-action--danger {
  border-color: rgba(185, 28, 28, 0.2);
  color: rgb(153, 27, 27);
  background: rgba(254, 242, 242, 0.94);
}

.node-card__asset-media-shell {
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  background: rgba(248, 242, 234, 0.84);
}

.node-card__asset-media-shell--audio {
  padding: 14px;
  background: rgba(255, 255, 255, 0.9);
}

.node-card__asset-image,
.node-card__asset-video {
  display: block;
  max-height: 240px;
  width: 100%;
  object-fit: contain;
}

.node-card__asset-audio {
  width: 100%;
}

.node-card__asset-file {
  display: grid;
  gap: 8px;
}

.node-card__asset-name {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__asset-summary {
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.node-card__asset-text {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  border-radius: 16px;
  background: rgba(248, 242, 234, 0.84);
  padding: 14px;
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1f2937;
}

.node-card__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
