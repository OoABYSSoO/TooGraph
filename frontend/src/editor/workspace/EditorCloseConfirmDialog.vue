<template>
  <ElDialog
    class="editor-close-dialog"
    :model-value="Boolean(tab)"
    :show-close="false"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :modal-class="'editor-close-dialog__overlay'"
    width="520px"
    append-to-body
    @update:model-value="handleOpenChange"
  >
    <div class="editor-close-dialog__content">
        <div class="editor-close-dialog__eyebrow">Tab</div>
        <h2 class="editor-close-dialog__title">关闭未保存的标签页？</h2>
        <p class="editor-close-dialog__body">
          这个标签页有未保存修改。你可以先保存，再关闭；也可以直接丢弃。
          <span class="editor-close-dialog__tab-title">{{ tab?.title }}</span>
        </p>

        <div v-if="error" class="editor-close-dialog__error">{{ error }}</div>

        <div class="editor-close-dialog__actions" :class="{ 'editor-close-dialog__actions--busy': busy }">
          <ElButton class="editor-close-dialog__button editor-close-dialog__button--ghost" @click="$emit('cancel')">
            取消
          </ElButton>

          <ElButton class="editor-close-dialog__button editor-close-dialog__button--ghost" @click="$emit('discard')">
            不保存，直接关闭
          </ElButton>

          <ElButton class="editor-close-dialog__button" type="primary" @click="$emit('save-and-close')">保存并关闭</ElButton>
        </div>
      </div>
  </ElDialog>
</template>

<script setup lang="ts">
import { ElButton, ElDialog } from "element-plus";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";

const props = defineProps<{
  tab: EditorWorkspaceTab | null;
  busy: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (event: "save-and-close"): void;
  (event: "discard"): void;
  (event: "cancel"): void;
}>();

function handleOpenChange(open: boolean) {
  if (!open && props.tab && !props.busy) {
    emit("cancel");
  }
}
</script>

<style scoped>
:deep(.editor-close-dialog__overlay) {
  background: rgba(66, 31, 17, 0.18);
  backdrop-filter: blur(8px);
}

.editor-close-dialog :deep(.el-dialog) {
  border-radius: 28px;
  padding: 0;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 28px 80px rgba(66, 31, 17, 0.18);
}

.editor-close-dialog :deep(.el-dialog__header) {
  display: none;
}

.editor-close-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.editor-close-dialog__content {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 28px;
  padding: 24px;
}

.editor-close-dialog__eyebrow {
  font-size: 0.76rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.9);
}

.editor-close-dialog__title {
  margin: 10px 0 8px;
  font-size: 1.9rem;
  line-height: 1.15;
  color: #1f2937;
}

.editor-close-dialog__body {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.76);
}

.editor-close-dialog__tab-title {
  margin-left: 4px;
  font-weight: 600;
  color: #3c2914;
}

.editor-close-dialog__error {
  margin-top: 16px;
  border: 1px solid rgba(191, 78, 39, 0.16);
  border-radius: 18px;
  padding: 12px 14px;
  background: rgba(255, 244, 238, 0.92);
  color: rgb(154, 52, 18);
}

.editor-close-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.editor-close-dialog__actions--busy {
  opacity: 0.8;
  pointer-events: none;
}

.editor-close-dialog__button {
  --el-button-border-color: rgba(154, 52, 18, 0.18);
  --el-button-bg-color: rgba(255, 248, 240, 0.96);
  --el-button-text-color: rgb(154, 52, 18);
  --el-button-hover-border-color: rgba(154, 52, 18, 0.24);
  --el-button-hover-bg-color: rgba(255, 244, 240, 0.96);
  --el-button-hover-text-color: rgb(154, 52, 18);
  --el-button-active-border-color: rgba(154, 52, 18, 0.24);
  --el-button-active-bg-color: rgba(255, 240, 232, 0.98);
  --el-button-active-text-color: rgb(154, 52, 18);
  border-radius: 999px;
  min-height: 40px;
  padding: 0 16px;
  transition: transform 140ms ease;
}

.editor-close-dialog__button:hover {
  transform: translateY(-1px);
}

.editor-close-dialog__button--ghost {
  --el-button-border-color: rgba(154, 52, 18, 0.14);
  --el-button-bg-color: rgba(255, 255, 255, 0.72);
  --el-button-text-color: rgba(60, 41, 20, 0.82);
  --el-button-hover-border-color: rgba(154, 52, 18, 0.18);
  --el-button-hover-bg-color: rgba(255, 250, 241, 0.9);
  --el-button-hover-text-color: rgba(60, 41, 20, 0.88);
  --el-button-active-border-color: rgba(154, 52, 18, 0.18);
  --el-button-active-bg-color: rgba(255, 248, 240, 0.92);
  --el-button-active-text-color: rgba(60, 41, 20, 0.88);
}
</style>
