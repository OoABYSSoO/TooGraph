<template>
  <label class="workspace-search-field">
    <span class="workspace-search-field__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
    </span>
    <input
      :value="modelValue"
      :placeholder="placeholder"
      class="workspace-search-field__input"
      type="search"
      @input="handleInput"
    />
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  placeholder: string;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

function handleInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<style scoped>
.workspace-search-field {
  position: relative;
  display: block;
}

.workspace-search-field__icon {
  position: absolute;
  left: 14px;
  top: 50%;
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  color: rgba(60, 41, 20, 0.56);
  pointer-events: none;
}

.workspace-search-field__icon :deep(svg) {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.55;
}

.workspace-search-field__input {
  width: 100%;
  min-height: 46px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  padding: 0 16px 0 42px;
  color: #3c2914;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  outline: none;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

.workspace-search-field__input:hover {
  border-color: rgba(154, 52, 18, 0.22);
}

.workspace-search-field__input:focus {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 0 0 3px rgba(154, 52, 18, 0.08);
}
</style>
