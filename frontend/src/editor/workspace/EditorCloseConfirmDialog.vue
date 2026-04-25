<template>
  <ElDialog
    class="editor-close-dialog"
    :model-value="Boolean(tab)"
    :show-close="false"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :modal-class="'editor-close-dialog__overlay'"
    width="min(520px, calc(100vw - 32px))"
    append-to-body
    @update:model-value="handleOpenChange"
  >
    <div class="editor-close-dialog__content">
      <div class="editor-close-dialog__meta">
        <span class="editor-close-dialog__eyebrow">TAB</span>
        <span class="editor-close-dialog__status-pill">未保存</span>
      </div>

      <h2 class="editor-close-dialog__title">关闭未保存的标签页？</h2>
      <p class="editor-close-dialog__body">这个标签页有未保存修改。你可以先保存后关闭，也可以直接丢弃。</p>

      <div class="editor-close-dialog__tab-chip">{{ tab?.title }}</div>

      <div v-if="error" class="editor-close-dialog__error">{{ error }}</div>

      <div class="editor-close-dialog__actions" :class="{ 'editor-close-dialog__actions--busy': busy }">
        <ElButton class="editor-close-dialog__button editor-close-dialog__button--cancel" @click="$emit('cancel')">
          取消
        </ElButton>

        <ElButton class="editor-close-dialog__button editor-close-dialog__button--discard" @click="$emit('discard')">
          不保存，直接关闭
        </ElButton>

        <ElButton class="editor-close-dialog__button editor-close-dialog__button--primary" type="primary" @click="$emit('save-and-close')">
          保存并关闭
        </ElButton>
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
:global(.editor-close-dialog__overlay.el-overlay) {
  background: rgba(42, 24, 14, 0.24);
  backdrop-filter: blur(9px) saturate(0.95);
}

:global(.editor-close-dialog.el-dialog) {
  overflow: hidden;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 26px;
  padding: 0;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow:
    0 24px 70px rgba(66, 31, 17, 0.16),
    var(--graphite-glass-highlight),
    var(--graphite-glass-rim);
  backdrop-filter: blur(30px) saturate(1.55) contrast(1.02);
}

:global(.editor-close-dialog.el-dialog .el-dialog__header) {
  display: none;
}

:global(.editor-close-dialog.el-dialog .el-dialog__body) {
  padding: 0;
}

.editor-close-dialog__content {
  position: relative;
  isolation: isolate;
  padding: 26px;
}

.editor-close-dialog__content::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(circle at 16% 0%, rgba(255, 255, 255, 0.48), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.26), transparent 54%);
  content: "";
  pointer-events: none;
}

.editor-close-dialog__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-close-dialog__eyebrow {
  color: rgba(154, 52, 18, 0.78);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.editor-close-dialog__status-pill {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
  color: rgba(124, 45, 18, 0.86);
  font-size: 0.72rem;
  font-weight: 800;
  padding: 4px 9px;
}

.editor-close-dialog__title {
  margin: 14px 0 8px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 1.48rem;
  line-height: 1.2;
}

.editor-close-dialog__body {
  margin: 0;
  color: rgba(60, 41, 20, 0.68);
  line-height: 1.55;
}

.editor-close-dialog__tab-chip {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  margin-top: 14px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  color: rgba(60, 41, 20, 0.9);
  font-size: 0.84rem;
  font-weight: 800;
  padding: 7px 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.editor-close-dialog__actions--busy {
  opacity: 0.8;
  pointer-events: none;
}

.editor-close-dialog__button {
  min-height: 40px;
  border-radius: 999px;
  padding: 0 16px;
  font-weight: 800;
  transition: box-shadow 150ms ease, transform 150ms ease;
}

.editor-close-dialog__button:hover {
  transform: translateY(-1px);
}

.editor-close-dialog__button:active {
  transform: translateY(0) scale(0.98);
}

.editor-close-dialog__button--cancel {
  --el-button-border-color: transparent;
  --el-button-bg-color: transparent;
  --el-button-text-color: rgba(60, 41, 20, 0.62);
  --el-button-hover-border-color: transparent;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.28);
  --el-button-hover-text-color: rgba(60, 41, 20, 0.82);
  --el-button-active-border-color: transparent;
  --el-button-active-bg-color: rgba(255, 255, 255, 0.22);
  --el-button-active-text-color: rgba(60, 41, 20, 0.82);
}

.editor-close-dialog__button--discard {
  --el-button-border-color: rgba(154, 52, 18, 0.16);
  --el-button-bg-color: rgba(255, 255, 255, 0.34);
  --el-button-text-color: rgba(124, 45, 18, 0.9);
  --el-button-hover-border-color: rgba(154, 52, 18, 0.18);
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.5);
  --el-button-hover-text-color: rgba(124, 45, 18, 0.96);
  --el-button-active-border-color: rgba(154, 52, 18, 0.18);
  --el-button-active-bg-color: rgba(255, 248, 240, 0.58);
  --el-button-active-text-color: rgba(124, 45, 18, 0.96);
}

.editor-close-dialog__button--primary {
  --el-button-border-color: rgba(154, 52, 18, 0.86);
  --el-button-bg-color: rgb(154, 52, 18);
  --el-button-text-color: rgba(255, 250, 241, 0.98);
  --el-button-hover-border-color: rgba(124, 45, 18, 0.9);
  --el-button-hover-bg-color: rgb(124, 45, 18);
  --el-button-hover-text-color: rgba(255, 250, 241, 0.98);
  --el-button-active-border-color: rgba(124, 45, 18, 0.9);
  --el-button-active-bg-color: rgb(124, 45, 18);
  --el-button-active-text-color: rgba(255, 250, 241, 0.98);
  box-shadow: 0 10px 22px rgba(154, 52, 18, 0.18);
}

@media (max-width: 560px) {
  .editor-close-dialog__content {
    padding: 22px;
  }

  .editor-close-dialog__actions {
    justify-content: stretch;
  }

  .editor-close-dialog__button {
    flex: 1 1 auto;
  }
}
</style>
