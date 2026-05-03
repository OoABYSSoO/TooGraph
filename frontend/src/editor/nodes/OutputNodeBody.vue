<template>
  <div class="node-card__output-body">
    <div class="node-card__output-toolbar">
      <slot name="primary-input" />
      <div class="node-card__output-persist-card">
        <span
          class="node-card__output-persist-icon"
          :class="{ 'node-card__output-persist-icon--enabled': body.persistEnabled }"
          aria-hidden="true"
        >
          <DocumentChecked />
        </span>
        <ElSwitch
          class="node-card__output-persist-switch"
          :model-value="body.persistEnabled"
          :width="56"
          inline-prompt
          active-text="ON"
          inactive-text="OFF"
          :aria-label="t('nodeCard.toggleOutputPersistence')"
          @pointerdown.stop
          @click.stop
          @update:model-value="emit('update:persist-enabled', $event)"
        />
      </div>
    </div>
    <div class="node-card__surface node-card__surface--output">
      <div class="node-card__surface-meta">
        <span>{{ body.previewTitle.toUpperCase() }}</span>
        <span>{{ body.displayModeLabel }}</span>
      </div>
      <div
        class="node-card__preview"
        :class="{
          'node-card__preview--plain': outputPreviewContent.kind === 'plain',
          'node-card__preview--markdown': outputPreviewContent.kind === 'markdown',
          'node-card__preview--json': outputPreviewContent.kind === 'json',
          'node-card__preview--documents': outputPreviewContent.kind === 'documents',
          'node-card__preview--empty': outputPreviewContent.isEmpty,
        }"
      >
        <div
          v-if="outputPreviewContent.kind === 'markdown'"
          class="node-card__preview-markdown"
          v-html="outputPreviewContent.html"
        />
        <pre v-else class="node-card__preview-text">{{ outputPreviewContent.text }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElSwitch } from "element-plus";
import { DocumentChecked } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import type { NodeCardViewModel } from "./nodeCardViewModel";
import type { OutputPreviewContent } from "./outputPreviewContentModel";

type OutputBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "output" }>;

defineProps<{
  body: OutputBodyViewModel;
  outputPreviewContent: OutputPreviewContent;
}>();

const emit = defineEmits<{
  (event: "update:persist-enabled", value: string | number | boolean): void;
}>();

const { t } = useI18n();
</script>

<style scoped>
.node-card__output-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.node-card__output-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
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

.node-card__surface--output {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.node-card__surface-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.88rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.node-card__preview {
  flex: 1 1 auto;
  min-height: 0;
  display: block;
  overflow: auto;
  border-radius: 20px;
  background: rgba(248, 242, 234, 0.84);
  padding: 18px;
  text-align: left;
  font-size: 0.95rem;
  line-height: 1.62;
  color: #1f2937;
}

.node-card__preview--empty {
  display: grid;
  place-items: center;
  text-align: center;
  color: rgba(31, 41, 55, 0.82);
}

.node-card__preview-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
}

.node-card__preview--json .node-card__preview-text {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.84rem;
  line-height: 1.55;
}

.node-card__preview--documents .node-card__preview-text {
  border-left: 3px solid rgba(37, 99, 235, 0.46);
  padding-left: 12px;
  color: rgba(30, 64, 175, 0.92);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.84rem;
  line-height: 1.58;
}

.node-card__preview-markdown {
  display: grid;
  gap: 0.65rem;
}

.node-card__preview-markdown :deep(h1),
.node-card__preview-markdown :deep(h2),
.node-card__preview-markdown :deep(h3),
.node-card__preview-markdown :deep(p),
.node-card__preview-markdown :deep(ul) {
  margin: 0;
}

.node-card__preview-markdown :deep(h1) {
  font-size: 1.22rem;
  line-height: 1.25;
}

.node-card__preview-markdown :deep(h2) {
  font-size: 1.08rem;
  line-height: 1.3;
}

.node-card__preview-markdown :deep(h3) {
  font-size: 1rem;
  line-height: 1.35;
}

.node-card__preview-markdown :deep(ul) {
  display: grid;
  gap: 0.35rem;
  padding-left: 1.1rem;
}

.node-card__preview-markdown :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.88rem;
  white-space: normal;
}

.node-card__preview-markdown :deep(th),
.node-card__preview-markdown :deep(td) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 0.42rem 0.58rem;
  vertical-align: top;
}

.node-card__preview-markdown :deep(th) {
  background: rgba(154, 52, 18, 0.08);
  color: rgba(69, 45, 25, 0.92);
  font-weight: 700;
}

.node-card__preview-markdown :deep(code) {
  border-radius: 6px;
  background: rgba(154, 52, 18, 0.08);
  padding: 0.08rem 0.28rem;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.88em;
}

.node-card__output-persist-card {
  display: grid;
  grid-template-columns: auto 56px;
  align-items: center;
  justify-self: end;
  min-height: 48px;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__output-persist-card:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 252, 247, 0.94);
}

.node-card__output-persist-card:focus-within {
  border-color: rgba(201, 107, 31, 0.32);
  box-shadow:
    0 0 0 3px rgba(201, 107, 31, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.node-card__output-persist-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: max-content;
  color: rgba(111, 67, 30, 0.72);
  font-size: 0.84rem;
  font-weight: 600;
  transition: color 140ms ease;
}

.node-card__output-persist-icon::after {
  content: "Save";
  margin-left: 7px;
}

.node-card__output-persist-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.node-card__output-persist-icon--enabled {
  color: #b45309;
}

.node-card__output-persist-switch {
  justify-self: end;
  --el-switch-on-color: #c96b1f;
  --el-switch-off-color: rgba(154, 52, 18, 0.24);
}
</style>
