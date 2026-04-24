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
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(193, 151, 106, 0.22);
  border-radius: 999px;
  background: rgba(255, 250, 242, 0.88);
  padding: 6px;
  box-shadow: 0 10px 24px rgba(92, 58, 28, 0.1);
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

.editor-action-capsule__run {
  border: 1px solid rgba(154, 52, 18, 0.9);
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  padding: 0 16px;
  font-weight: 700;
  cursor: pointer;
}
</style>
