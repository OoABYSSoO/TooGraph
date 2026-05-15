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
          'node-card__preview--html': outputPreviewContent.kind === 'html',
          'node-card__preview--json': outputPreviewContent.kind === 'json',
          'node-card__preview--documents': outputPreviewContent.kind === 'documents',
          'node-card__preview--package': outputPreviewContent.kind === 'package',
          'node-card__preview--empty': outputPreviewContent.isEmpty,
        }"
        @pointerdown.stop
        @click.stop
      >
        <div v-if="outputPreviewContent.kind === 'package'" class="node-card__preview-package">
          <div class="node-card__preview-package-tabs" role="tablist" aria-label="Result package outputs">
            <button
              v-for="(page, index) in packagePages"
              :key="page.key"
              type="button"
              class="node-card__preview-package-tab"
              :class="{ 'node-card__preview-package-tab--active': activePackagePageIndex === index }"
              role="tab"
              :aria-selected="activePackagePageIndex === index"
              @pointerdown.stop
              @click.stop="activePackagePageIndex = index"
            >
              {{ page.title }}
            </button>
          </div>
          <div
            v-if="activePackagePage"
            class="node-card__preview-package-page"
            :class="{
              'node-card__preview-package-page--json': activePackagePage.kind === 'json',
              'node-card__preview-package-page--html': activePackagePage.kind === 'html',
              'node-card__preview-package-page--documents': activePackagePage.kind === 'documents',
            }"
            role="tabpanel"
          >
            <div class="node-card__preview-package-meta">
              <span>{{ activePackagePage.valueType.toUpperCase() }}</span>
              <span>{{ activePackagePage.key }}</span>
            </div>
            <p v-if="activePackagePage.description" class="node-card__preview-package-description">
              {{ activePackagePage.description }}
            </p>
            <OutputDocumentPager
              v-if="activePackagePage.kind === 'documents' && activePackagePage.documentRefs.length > 0"
              :documents="activePackagePage.documentRefs"
            />
            <SandboxedHtmlFrame
              v-else-if="activePackagePage.kind === 'html'"
              class="node-card__preview-html-frame"
              :source="activePackagePage.html"
              title="HTML output preview"
            />
            <div
              v-else-if="activePackagePage.kind === 'markdown'"
              class="node-card__preview-markdown"
              v-html="activePackagePage.html"
            />
            <pre v-else class="node-card__preview-text"><OutputLinkedText :text="activePackagePage.text" /></pre>
          </div>
        </div>
        <OutputDocumentPager
          v-else-if="outputPreviewContent.kind === 'documents' && outputPreviewContent.documentRefs.length > 0"
          :documents="outputPreviewContent.documentRefs"
        />
        <SandboxedHtmlFrame
          v-else-if="outputPreviewContent.kind === 'html'"
          class="node-card__preview-html-frame"
          :source="outputPreviewContent.html"
          title="HTML output preview"
        />
        <div
          v-else-if="outputPreviewContent.kind === 'markdown'"
          class="node-card__preview-markdown"
          v-html="outputPreviewContent.html"
        />
        <pre v-else class="node-card__preview-text"><OutputLinkedText :text="outputPreviewContent.text" /></pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElSwitch } from "element-plus";
import { DocumentChecked } from "@element-plus/icons-vue";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { NodeCardViewModel } from "./nodeCardViewModel";
import SandboxedHtmlFrame from "@/components/SandboxedHtmlFrame.vue";
import OutputDocumentPager from "./OutputDocumentPager.vue";
import OutputLinkedText from "./OutputLinkedText.vue";
import type { OutputPreviewContent } from "./outputPreviewContentModel";

type OutputBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "output" }>;

const props = defineProps<{
  body: OutputBodyViewModel;
  outputPreviewContent: OutputPreviewContent;
}>();

const emit = defineEmits<{
  (event: "update:persist-enabled", value: string | number | boolean): void;
}>();

const { t } = useI18n();
const activePackagePageIndex = ref(0);
const packagePages = computed(() => props.outputPreviewContent.packagePages ?? []);
const activePackagePage = computed(() => {
  const index = Math.min(activePackagePageIndex.value, Math.max(packagePages.value.length - 1, 0));
  return packagePages.value[index] ?? null;
});

watch(
  () => props.outputPreviewContent.text,
  () => {
    activePackagePageIndex.value = 0;
  },
);

watch(
  () => packagePages.value.length,
  (length) => {
    if (activePackagePageIndex.value >= length) {
      activePackagePageIndex.value = Math.max(length - 1, 0);
    }
  },
);
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

.node-card__preview,
.node-card__preview *,
.node-card__preview :deep(*) {
  user-select: text;
  -webkit-user-select: text;
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

.node-card__preview--html {
  padding: 10px;
  background: rgba(255, 255, 255, 0.92);
}

.node-card__preview-html-frame {
  min-height: 280px;
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 12px;
}

.node-card__preview--package {
  display: flex;
  flex-direction: column;
}

.node-card__preview-package {
  display: grid;
  min-height: 0;
  gap: 12px;
}

.node-card__preview-package-tabs {
  display: flex;
  min-width: 0;
  gap: 8px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(154, 52, 18, 0.12);
  padding-bottom: 8px;
}

.node-card__preview-package-tab {
  flex: none;
  max-width: 180px;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: rgba(30, 64, 175, 0.78);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  padding: 8px 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__preview-package-tab--active {
  border-color: rgba(37, 99, 235, 0.38);
  background: rgba(219, 234, 254, 0.78);
  color: rgb(29, 78, 216);
}

.node-card__preview-package-page {
  display: grid;
  min-height: 0;
  gap: 10px;
}

.node-card__preview-package-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 7px;
}

.node-card__preview-package-meta span {
  max-width: 100%;
  overflow: hidden;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.5);
  color: rgb(29, 78, 216);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__preview-package-description {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: rgba(55, 65, 81, 0.78);
  font-size: 0.84rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
}

.node-card__preview-package-page--json .node-card__preview-text {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.84rem;
  line-height: 1.55;
}

.node-card__preview-package-page--documents .node-card__preview-text {
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
  white-space: normal;
}

.node-card__preview-markdown :deep(h1),
.node-card__preview-markdown :deep(h2),
.node-card__preview-markdown :deep(h3),
.node-card__preview-markdown :deep(h4),
.node-card__preview-markdown :deep(h5),
.node-card__preview-markdown :deep(h6),
.node-card__preview-markdown :deep(p),
.node-card__preview-markdown :deep(ul),
.node-card__preview-markdown :deep(ol),
.node-card__preview-markdown :deep(blockquote),
.node-card__preview-markdown :deep(pre) {
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

.node-card__preview-markdown :deep(h4),
.node-card__preview-markdown :deep(h5),
.node-card__preview-markdown :deep(h6) {
  font-size: 0.94rem;
  line-height: 1.35;
}

.node-card__preview-markdown :deep(ul),
.node-card__preview-markdown :deep(ol) {
  display: grid;
  gap: 0.35rem;
}

.node-card__preview-markdown :deep(ul) {
  padding-left: 1.1rem;
}

.node-card__preview-markdown :deep(ol) {
  padding-left: 1.35rem;
}

.node-card__preview-markdown :deep(blockquote) {
  border-left: 3px solid rgba(37, 99, 235, 0.34);
  border-radius: 10px;
  padding: 0.35rem 0.85rem;
  background: rgba(239, 246, 255, 0.62);
  color: rgba(30, 64, 175, 0.9);
}

.node-card__preview-markdown :deep(hr) {
  width: 100%;
  border: 0;
  border-top: 1px solid rgba(154, 52, 18, 0.18);
}

.node-card__preview-markdown :deep(a) {
  color: #1d4ed8;
  font-weight: 650;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
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

.node-card__preview-markdown :deep(pre) {
  position: relative;
  overflow-x: auto;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  padding: 2.1rem 1rem 1rem;
  background: rgba(255, 252, 247, 0.96);
  color: #1f2937;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 10px 22px rgba(60, 41, 20, 0.06);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.84rem;
  line-height: 1.58;
  white-space: pre;
}

.node-card__preview-markdown :deep(pre:not([data-language])) {
  padding-top: 1rem;
}

.node-card__preview-markdown :deep(pre[data-language]::before) {
  content: attr(data-language);
  position: absolute;
  top: 0.54rem;
  right: 0.7rem;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 0.08rem 0.45rem;
  background: rgba(255, 244, 232, 0.92);
  color: rgba(154, 52, 18, 0.74);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.node-card__preview-markdown :deep(pre code) {
  display: block;
  overflow: visible;
  border-radius: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  white-space: pre;
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
