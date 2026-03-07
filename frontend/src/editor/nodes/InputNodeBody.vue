<template>
  <div class="node-card__input-body">
    <div class="node-card__port-row node-card__port-row--single node-card__port-row--input-boundary">
      <ElSegmented
        class="node-card__input-boundary-toggle"
        :model-value="inputBoundarySelection"
        :options="inputTypeOptions"
        :aria-label="t('nodeCard.inputBoundaryMode')"
        :disabled="Boolean(inputAssetEnvelope)"
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
    <div v-if="showKnowledgeBaseInput" class="node-card__surface node-card__input-picker">
      <label class="node-card__control-row">
        <span class="node-card__control-label">{{ t("nodeCard.knowledgeBase") }}</span>
        <ElSelect
          class="node-card__control-select node-card__input-select graphite-select"
          :model-value="inputKnowledgeBaseValue || undefined"
          :placeholder="inputKnowledgeBaseOptions.length === 0 ? t('nodeCard.noKnowledgeBases') : t('nodeCard.selectKnowledgeBase')"
          :disabled="inputKnowledgeBaseOptions.length === 0"
          :teleported="false"
          popper-class="graphite-select-popper"
          @pointerdown.stop
          @click.stop
          @update:model-value="emit('update:knowledge-base', $event)"
        >
          <ElOption v-for="option in inputKnowledgeBaseOptions" :key="option.value" :label="option.label" :value="option.value" />
        </ElSelect>
      </label>
      <div class="node-card__input-meta">
        {{ selectedKnowledgeBaseDescription }}
      </div>
    </div>
    <div v-else-if="showAssetUploadInput" class="node-card__input-upload">
      <input
        ref="inputAssetInputRef"
        class="node-card__sr-only"
        type="file"
        :accept="inputAssetAccept"
        @change="emit('asset-file-change', $event)"
      />
      <button
        v-if="!inputAssetEnvelope"
        type="button"
        class="node-card__asset-dropzone"
        @pointerdown.stop
        @click.stop="openInputAssetPicker"
        @dragover.prevent
        @drop.prevent="emit('asset-drop', $event)"
      >
        <span class="node-card__asset-dropzone-title">Drop {{ inputAssetLabel }} here</span>
        <span class="node-card__asset-dropzone-copy">Or click to choose a file from your device.</span>
      </button>
      <div
        v-else
        class="node-card__asset-preview-card"
        @dragover.prevent
        @drop.prevent="emit('asset-drop', $event)"
      >
        <div class="node-card__asset-actions">
          <button
            type="button"
            class="node-card__asset-action"
            @pointerdown.stop
            @click.stop="openInputAssetPicker"
          >
            Replace
          </button>
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
          v-if="inputAssetEnvelope.detectedType === 'image' && inputAssetEnvelope.encoding === 'data_url'"
          class="node-card__asset-media-shell"
        >
          <img :src="inputAssetEnvelope.content" :alt="inputAssetEnvelope.name" class="node-card__asset-image" />
        </div>
        <div
          v-else-if="inputAssetEnvelope.detectedType === 'audio' && inputAssetEnvelope.encoding === 'data_url'"
          class="node-card__asset-media-shell node-card__asset-media-shell--audio"
        >
          <audio controls class="node-card__asset-audio">
            <source :src="inputAssetEnvelope.content" :type="inputAssetEnvelope.mimeType" />
          </audio>
        </div>
        <div
          v-else-if="inputAssetEnvelope.detectedType === 'video' && inputAssetEnvelope.encoding === 'data_url'"
          class="node-card__asset-media-shell"
        >
          <video controls class="node-card__asset-video">
            <source :src="inputAssetEnvelope.content" :type="inputAssetEnvelope.mimeType" />
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
    <textarea
      v-else-if="isInputValueEditable"
      class="node-card__surface node-card__surface-textarea"
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
import { ref, type Component } from "vue";
import { ElOption, ElSegmented, ElSelect } from "element-plus";
import { useI18n } from "vue-i18n";

import type { InputKnowledgeBaseOption } from "./inputKnowledgeBaseModel";
import type { NodeCardViewModel } from "./nodeCardViewModel";
import type { UploadedAssetEnvelope } from "./uploadedAssetModel";

type InputBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "input" }>;

type InputTypeOption = {
  value: "text" | "file" | "knowledge_base";
  label: string;
  icon: Component;
};

defineProps<{
  body: InputBodyViewModel;
  inputBoundarySelection: "text" | "file" | "knowledge_base";
  inputTypeOptions: InputTypeOption[];
  inputAssetEnvelope: UploadedAssetEnvelope | null;
  inputAssetSummary: string;
  inputAssetTextPreview: string;
  inputAssetDescription: string;
  inputAssetAccept: string;
  inputAssetLabel: string;
  inputKnowledgeBaseOptions: InputKnowledgeBaseOption[];
  inputKnowledgeBaseValue: string;
  selectedKnowledgeBaseDescription: string;
  showKnowledgeBaseInput: boolean;
  showAssetUploadInput: boolean;
  showLegacyUploadedAssetHint: boolean;
  isInputValueEditable: boolean;
  inputValueText: string;
}>();

const emit = defineEmits<{
  (event: "update:boundary-selection", value: string | number | boolean): void;
  (event: "update:knowledge-base", value: string | number | boolean | undefined): void;
  (event: "asset-file-change", inputEvent: Event): void;
  (event: "asset-drop", dragEvent: DragEvent): void;
  (event: "clear-asset"): void;
  (event: "input-value", inputEvent: Event): void;
}>();

const { t } = useI18n();
const inputAssetInputRef = ref<HTMLInputElement | null>(null);

function openInputAssetPicker() {
  inputAssetInputRef.value?.click();
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

.node-card__input-meta {
  font-size: 0.84rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.7);
}

.node-card__asset-dropzone {
  display: grid;
  min-height: 176px;
  place-items: center;
  gap: 8px;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  border-radius: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.84);
  color: #3c2914;
  text-align: center;
  cursor: pointer;
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
