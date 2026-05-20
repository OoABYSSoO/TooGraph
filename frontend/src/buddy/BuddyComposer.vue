<template>
  <form class="buddy-widget__form" @submit.prevent="emit('submit')">
    <textarea
      :value="modelValue"
      class="buddy-widget__input"
      rows="2"
      :placeholder="placeholder"
      @input="handleInput"
      @keydown.enter.exact.prevent="emit('submit')"
    />
    <button
      type="submit"
      class="buddy-widget__send"
      :disabled="!modelValue.trim()"
      :title="sendLabel"
      :aria-label="sendLabel"
    >
      <ElIcon><Promotion /></ElIcon>
    </button>
  </form>
</template>

<script setup lang="ts">
import { Promotion } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";

defineProps<{
  modelValue: string;
  placeholder: string;
  sendLabel: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

function handleInput(event: Event) {
  emit("update:modelValue", event.target instanceof HTMLTextAreaElement ? event.target.value : "");
}
</script>

<style scoped>
.buddy-widget__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  background: rgba(255, 248, 240, 0.56);
}

.buddy-widget__input {
  width: 100%;
  min-height: 42px;
  max-height: 96px;
  resize: vertical;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.74);
  color: var(--toograph-text-strong);
  padding: 9px 10px;
  font-size: 13px;
  line-height: 1.45;
}

.buddy-widget__input:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.buddy-widget__send {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background: rgba(154, 52, 18, 0.1);
  color: var(--toograph-accent-strong);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.buddy-widget__send:hover {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 248, 240, 0.92);
  transform: translateY(-1px);
}

.buddy-widget__send:disabled {
  cursor: not-allowed;
  opacity: 0.54;
  transform: none;
}

.buddy-widget__send:focus-visible,
.buddy-widget__input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}
</style>
