<template>
  <div class="editor-action-capsule">
    <div class="editor-action-capsule__tools">
      <ElTooltip content="保存图" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" aria-label="保存图" @click="$emit('save-active-graph')">
          <ElIcon aria-hidden="true"><CollectionTag /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip content="校验图" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" aria-label="校验图" @click="$emit('validate-active-graph')">
          <ElIcon aria-hidden="true"><CircleCheck /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip content="导入 Python 图" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" aria-label="导入 Python 图" @click="$emit('import-python-graph')">
          <ElIcon aria-hidden="true"><Upload /></ElIcon>
        </button>
      </ElTooltip>
      <ElTooltip content="导出 Python 图" placement="bottom">
        <button type="button" class="editor-action-capsule__icon-button" aria-label="导出 Python 图" @click="$emit('export-active-graph')">
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
      <span>State</span>
      <span class="editor-action-capsule__state-count">{{ activeStateCount }}</span>
    </button>

    <button type="button" class="editor-action-capsule__run" @click="$emit('run-active-graph')">Run</button>
  </div>
</template>

<script setup lang="ts">
import { CircleCheck, CollectionTag, Download, Upload } from "@element-plus/icons-vue";
import { ElIcon, ElTooltip } from "element-plus";

defineProps<{
  activeStateCount: number;
  isStatePanelOpen: boolean;
}>();

defineEmits<{
  (event: "toggle-state-panel"): void;
  (event: "save-active-graph"): void;
  (event: "validate-active-graph"): void;
  (event: "import-python-graph"): void;
  (event: "export-active-graph"): void;
  (event: "run-active-graph"): void;
}>();
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
  padding: 6px;
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
  min-height: 36px;
  border-radius: 999px;
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease,
    transform 0.16s ease;
}

.editor-action-capsule__icon-button {
  width: 36px;
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
  border: 1px solid rgba(154, 52, 18, 0.9);
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  padding: 0 16px;
  font-weight: 700;
  cursor: pointer;
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
</style>
