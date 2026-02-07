<template>
  <div v-if="tab" class="editor-close-dialog__backdrop">
    <div class="editor-close-dialog">
      <div class="editor-close-dialog__eyebrow">Tab</div>
      <h2 class="editor-close-dialog__title">关闭未保存的标签页？</h2>
      <p class="editor-close-dialog__body">
        这个标签页有未保存修改。你可以先保存，再关闭；也可以直接丢弃。
        <span class="editor-close-dialog__tab-title">{{ tab.title }}</span>
      </p>
      <div v-if="error" class="editor-close-dialog__error">{{ error }}</div>
      <div class="editor-close-dialog__actions" :class="{ 'editor-close-dialog__actions--busy': busy }">
        <button type="button" class="editor-close-dialog__button editor-close-dialog__button--ghost" @click="$emit('cancel')">
          取消
        </button>
        <button type="button" class="editor-close-dialog__button editor-close-dialog__button--ghost" @click="$emit('discard')">
          不保存，直接关闭
        </button>
        <button type="button" class="editor-close-dialog__button" @click="$emit('save-and-close')">保存并关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EditorWorkspaceTab } from "@/lib/editor-workspace";

defineProps<{
  tab: EditorWorkspaceTab | null;
  busy: boolean;
  error?: string | null;
}>();

defineEmits<{
  (event: "save-and-close"): void;
  (event: "discard"): void;
  (event: "cancel"): void;
}>();
</script>

<style scoped>
.editor-close-dialog__backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(66, 31, 17, 0.18);
  backdrop-filter: blur(6px);
}

.editor-close-dialog {
  width: min(100%, 520px);
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 28px;
  padding: 24px;
  background: rgba(255, 250, 241, 0.98);
  box-shadow: 0 28px 80px rgba(66, 31, 17, 0.18);
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
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 10px 16px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
}

.editor-close-dialog__button--ghost {
  background: rgba(255, 255, 255, 0.72);
  color: rgba(60, 41, 20, 0.82);
}
</style>
