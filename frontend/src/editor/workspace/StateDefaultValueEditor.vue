<template>
  <label v-if="editor.mode === 'boolean'" class="state-default-value-editor__field">
    <span>Value</span>
    <button
      type="button"
      class="state-default-value-editor__toggle"
      :class="{ 'state-default-value-editor__toggle--on': Boolean(field.value) }"
      @click="$emit('update-value', !field.value)"
    >
      <span class="state-default-value-editor__toggle-label">{{ Boolean(field.value) ? "true" : "false" }}</span>
      <span class="state-default-value-editor__toggle-track">
        <span class="state-default-value-editor__toggle-thumb" />
      </span>
    </button>
  </label>

  <label v-else-if="editor.mode === 'number'" class="state-default-value-editor__field">
    <span>Value</span>
    <input
      type="number"
      class="state-default-value-editor__input"
      :value="typeof field.value === 'number' ? String(field.value) : ''"
      :placeholder="editor.placeholder"
      @input="$emit('update-value', numberValue(($event.target as HTMLInputElement).value))"
    />
  </label>

  <div v-else-if="editor.mode === 'structured'" class="state-default-value-editor__structured">
    <label class="state-default-value-editor__field">
      <span>Value</span>
      <textarea
        v-model="structuredDraft"
        class="state-default-value-editor__textarea"
        :rows="editor.rows"
        :placeholder="editor.placeholder"
      />
    </label>
    <div class="state-default-value-editor__structured-footer">
      <div class="state-default-value-editor__hint" :class="{ 'state-default-value-editor__hint--error': Boolean(structuredError) }">
        {{ structuredError ?? "Apply JSON to sync the structured value." }}
      </div>
      <button type="button" class="state-default-value-editor__apply" @click="applyStructuredDraft">Apply JSON</button>
    </div>
  </div>

  <label v-else class="state-default-value-editor__field">
    <span>Value</span>
    <textarea
      class="state-default-value-editor__textarea"
      :rows="editor.rows"
      :value="typeof field.value === 'string' ? field.value : String(field.value ?? '')"
      :placeholder="editor.placeholder"
      @input="$emit('update-value', ($event.target as HTMLTextAreaElement).value)"
    />
  </label>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { type StateFieldType } from "./statePanelFields.ts";
import {
  parseStructuredStateDraft,
  resolveStateDefaultValueEditorConfig,
  stringifyStructuredStateValue,
} from "./stateDefaultValueModel.ts";
import type { StateDefinition } from "@/types/node-system";

const props = defineProps<{
  field: StateDefinition;
}>();

const emit = defineEmits<{
  (event: "update-value", value: unknown): void;
}>();

const editor = computed(() => resolveStateDefaultValueEditorConfig(props.field.type as StateFieldType));
const structuredDraft = ref(stringifyStructuredStateValue(props.field.type as StateFieldType, props.field.value));
const structuredError = ref<string | null>(null);

watch(
  () => [props.field.type, props.field.value] as const,
  ([type, value]) => {
    structuredDraft.value = stringifyStructuredStateValue(type as StateFieldType, value);
    structuredError.value = null;
  },
  { immediate: true },
);

function applyStructuredDraft() {
  const parsed = parseStructuredStateDraft(props.field.type as StateFieldType, structuredDraft.value);
  if (!parsed.ok) {
    structuredError.value = parsed.error;
    return;
  }
  structuredError.value = null;
  emit("update-value", parsed.value);
}

function numberValue(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}
</script>

<style scoped>
.state-default-value-editor__field,
.state-default-value-editor__structured {
  display: grid;
  gap: 6px;
}

.state-default-value-editor__field > span {
  font-size: 0.78rem;
  color: rgba(60, 41, 20, 0.72);
}

.state-default-value-editor__input,
.state-default-value-editor__textarea {
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  padding: 10px 12px;
  font-size: 0.9rem;
  color: #1f2937;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.state-default-value-editor__textarea {
  resize: vertical;
  min-height: 72px;
  white-space: pre-wrap;
}

.state-default-value-editor__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  padding: 6px 8px 6px 12px;
}

.state-default-value-editor__toggle-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1f2937;
}

.state-default-value-editor__toggle-track {
  display: inline-flex;
  align-items: center;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.18);
  padding: 3px;
}

.state-default-value-editor__toggle--on .state-default-value-editor__toggle-track {
  justify-content: flex-end;
  background: rgba(154, 52, 18, 0.72);
}

.state-default-value-editor__toggle-thumb {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
}

.state-default-value-editor__structured-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.state-default-value-editor__hint {
  font-size: 0.76rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.68);
}

.state-default-value-editor__hint--error {
  color: rgb(153, 27, 27);
}

.state-default-value-editor__apply {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 255, 255, 0.9);
  padding: 6px 10px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.92);
}
</style>
