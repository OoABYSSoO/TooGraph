<template>
  <div v-if="options.length === 0" class="state-binding-create-form__empty">
    No eligible nodes are available for this relation.
  </div>

  <div v-else class="state-binding-create-form">
    <label class="state-binding-create-form__field">
      <span>{{ mode === "read" ? "Reader Node" : "Writer Node" }}</span>
      <WorkspaceSelect v-model="selectedNodeId" :options="selectOptions" placeholder="Choose a node" />
    </label>

    <div class="state-binding-create-form__actions">
      <button type="button" class="state-binding-create-form__cancel" @click="$emit('cancel')">Cancel</button>
      <button
        type="button"
        class="state-binding-create-form__submit"
        :disabled="!selectedNodeId"
        @click="selectedNodeId && $emit('add', selectedNodeId)"
      >
        {{ mode === "read" ? "Add Reader" : "Add Writer" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import WorkspaceSelect from "./WorkspaceSelect.vue";
import type { StateBindingMode, StateBindingNodeOption } from "./statePanelBindings.ts";

const props = defineProps<{
  mode: StateBindingMode;
  options: StateBindingNodeOption[];
}>();

defineEmits<{
  (event: "add", nodeId: string): void;
  (event: "cancel"): void;
}>();

const selectedNodeId = ref("");

watch(
  () => props.options,
  (nextOptions) => {
    if (!nextOptions.some((option) => option.nodeId === selectedNodeId.value)) {
      selectedNodeId.value = nextOptions[0]?.nodeId ?? "";
    }
  },
  { immediate: true, deep: true },
);

const selectOptions = computed(() =>
  props.options.map((option) => ({
    value: option.nodeId,
    label: `${option.nodeLabel} · ${option.kind}`,
  })),
);
</script>

<style scoped>
.state-binding-create-form {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  padding: 12px;
  box-shadow: 0 10px 24px rgba(60, 41, 20, 0.06);
}

.state-binding-create-form__empty {
  border: 1px dashed rgba(154, 52, 18, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.74);
  padding: 12px 14px;
  font-size: 0.84rem;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.72);
}

.state-binding-create-form__field {
  display: grid;
  gap: 6px;
  font-size: 0.84rem;
  color: rgba(60, 41, 20, 0.72);
}

.state-binding-create-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.state-binding-create-form__cancel,
.state-binding-create-form__submit {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition: background-color 160ms ease, border-color 160ms ease, opacity 160ms ease;
}

.state-binding-create-form__cancel {
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 252, 247, 0.92);
  color: rgba(60, 41, 20, 0.72);
}

.state-binding-create-form__submit {
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 244, 240, 0.94);
  color: rgba(154, 52, 18, 0.94);
}

.state-binding-create-form__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
