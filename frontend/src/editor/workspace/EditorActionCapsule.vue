<template>
  <div class="editor-action-capsule">
    <div class="editor-action-capsule__tools">
      <ElTooltip :content="resolvedSaveGraphLabel" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" :aria-label="resolvedSaveGraphLabel" @click="$emit('save-active-graph')">
          <ElIcon aria-hidden="true"><CollectionTag /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip v-if="showSaveAsGraph" :content="resolvedSaveAsGraphLabel" placement="bottom">
        <button
          type="button"
          class="editor-action-capsule__icon-button editor-action-capsule__icon-button--save-as"
          :aria-label="resolvedSaveAsGraphLabel"
          @click="$emit('save-active-graph-as-new')"
        >
          <ElIcon aria-hidden="true"><CollectionTag /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip :content="t('editor.saveAsTemplate')" placement="bottom">
        <button
          type="button"
          class="editor-action-capsule__icon-button editor-action-capsule__icon-button--save-template"
          :aria-label="t('editor.saveAsTemplate')"
          @click="$emit('save-active-graph-as-template')"
        >
          <ElIcon aria-hidden="true"><CollectionTag /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip :content="t('editor.validateGraph')" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" :aria-label="t('editor.validateGraph')" @click="$emit('validate-active-graph')">
          <ElIcon aria-hidden="true"><CircleCheck /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip :content="t('editor.importPythonGraph')" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" :aria-label="t('editor.importPythonGraph')" @click="$emit('import-python-graph')">
          <ElIcon aria-hidden="true"><Upload /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip :content="t('editor.exportPythonGraph')" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" :aria-label="t('editor.exportPythonGraph')" @click="$emit('export-active-graph')">
          <ElIcon aria-hidden="true"><Download /></ElIcon>
        </button>
      </ElTooltip>
    </div>

    <button
      type="button"
      class="editor-action-capsule__state-pill"
      :class="{ 'editor-action-capsule__state-pill--active': isStatePanelOpen }"
      @click="$emit('toggle-state-panel')"
    >
      <span>{{ t("editor.statePanel") }}</span>
      <span class="editor-action-capsule__state-count">{{ activeStateCount }}</span>
    </button>

    <button
      type="button"
      class="editor-action-capsule__state-pill"
      :class="{
        'editor-action-capsule__state-pill--active': isRunActivityPanelOpen,
        'editor-action-capsule__state-pill--hint': hasRunActivityHint && !isRunActivityPanelOpen,
      }"
      @click="$emit('toggle-run-activity-panel')"
    >
      <span>{{ t("editor.runActivityPanel") }}</span>
    </button>

    <button type="button" class="editor-action-capsule__run" @click="$emit('run-active-graph')">
      <ElIcon class="editor-action-capsule__run-icon" aria-hidden="true"><VideoPlay /></ElIcon>
      <span>{{ t("editor.runGraph") }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { CircleCheck, CollectionTag, Download, Upload, VideoPlay } from "@element-plus/icons-vue";
import { ElIcon, ElTooltip } from "element-plus";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  activeStateCount: number;
  isStatePanelOpen: boolean;
  isRunActivityPanelOpen: boolean;
  hasRunActivityHint: boolean;
  saveGraphLabel?: string;
  showSaveAsGraph?: boolean;
  saveAsGraphLabel?: string;
}>();

defineEmits<{
  (event: "toggle-state-panel"): void;
  (event: "toggle-run-activity-panel"): void;
  (event: "save-active-graph"): void;
  (event: "save-active-graph-as-new"): void;
  (event: "save-active-graph-as-template"): void;
  (event: "validate-active-graph"): void;
  (event: "import-python-graph"): void;
  (event: "export-active-graph"): void;
  (event: "run-active-graph"): void;
}>();

const { t } = useI18n();
const resolvedSaveGraphLabel = computed(() => props.saveGraphLabel ?? t("editor.saveGraph"));
const resolvedSaveAsGraphLabel = computed(() => props.saveAsGraphLabel ?? t("editor.saveAsGraph"));
</script>

<style scoped>
.editor-action-capsule {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 999px;
  background: var(--graphite-glass-bg);
  padding: 8px;
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(28px) saturate(1.65) contrast(1.02);
}

.editor-action-capsule::before {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens);
  mix-blend-mode: screen;
  opacity: 0.62;
}

.editor-action-capsule > * {
  position: relative;
  z-index: 1;
}

.editor-action-capsule__tools {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.editor-action-capsule__icon-button,
.editor-action-capsule__state-pill,
.editor-action-capsule__run {
  min-height: 40px;
  border-radius: 999px;
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease,
    transform 0.16s ease;
}

.editor-action-capsule__icon-button {
  width: 40px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(90, 58, 34, 0.94);
  cursor: pointer;
}

.editor-action-capsule__state-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 252, 247, 0.92);
  padding: 0 14px;
  color: rgba(120, 53, 15, 0.92);
  cursor: pointer;
}

.editor-action-capsule__state-pill--active {
  border-color: rgba(154, 52, 18, 0.44);
  background: rgba(255, 238, 222, 0.98);
  color: rgba(126, 46, 11, 0.98);
}

.editor-action-capsule__state-pill--hint {
  border-color: rgba(37, 99, 235, 0.42);
  background: rgba(239, 246, 255, 0.96);
  color: rgba(30, 64, 175, 0.96);
  animation: editor-action-capsule-run-activity-pulse 1.1s ease-in-out infinite;
}

.editor-action-capsule__state-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  min-height: 22px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.12);
  padding: 0 7px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.editor-action-capsule__run {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(154, 52, 18, 0.9);
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  padding: 0 16px;
  font-weight: 700;
  cursor: pointer;
}

.editor-action-capsule__run-icon {
  font-size: 0.95rem;
}

.editor-action-capsule__icon-button:hover {
  border-color: rgba(193, 151, 106, 0.34);
  background: rgba(255, 245, 232, 0.96);
}

.editor-action-capsule__state-pill:hover {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 246, 237, 0.98);
}

.editor-action-capsule__state-pill--active:hover {
  border-color: rgba(154, 52, 18, 0.44);
  background: rgba(255, 238, 222, 0.98);
  color: rgba(126, 46, 11, 0.98);
}

.editor-action-capsule__state-pill--hint:hover {
  border-color: rgba(37, 99, 235, 0.5);
  background: rgba(219, 234, 254, 0.98);
  color: rgba(30, 64, 175, 0.98);
}

.editor-action-capsule__run:hover {
  border-color: rgba(131, 43, 13, 0.96);
  background: rgba(131, 43, 13, 0.96);
  transform: translateY(-1px);
}

.editor-action-capsule__icon-button:focus-visible,
.editor-action-capsule__state-pill:focus-visible,
.editor-action-capsule__run:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

@keyframes editor-action-capsule-run-activity-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.16);
  }

  50% {
    box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.18);
  }
}

@media (prefers-reduced-motion: reduce) {
  .editor-action-capsule__state-pill--hint {
    animation: none;
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
  }
}
</style>
