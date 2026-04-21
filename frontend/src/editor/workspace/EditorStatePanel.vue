<template>
  <aside class="editor-state-panel" :class="{ 'editor-state-panel--open': open }">
    <button
      v-if="!open"
      type="button"
      class="editor-state-panel__collapsed"
      aria-label="Open state panel"
      @click="$emit('toggle')"
    >
      <span class="editor-state-panel__collapsed-label">State</span>
      <span class="editor-state-panel__collapsed-count">{{ view.count }}</span>
    </button>

    <template v-else>
      <header class="editor-state-panel__header">
        <div>
          <div class="editor-state-panel__eyebrow">Graph State</div>
          <h2 class="editor-state-panel__title">State Panel</h2>
          <p class="editor-state-panel__body">Browse the graph-level state objects that travel through the workflow.</p>
        </div>
        <button type="button" class="editor-state-panel__collapse" aria-label="Collapse state panel" @click="$emit('toggle')">
          <svg viewBox="0 0 16 16" class="editor-state-panel__collapse-icon" aria-hidden="true">
            <path d="M10.5 3.5 5.5 8l5 4.5" />
          </svg>
        </button>
      </header>

      <div class="editor-state-panel__summary">
        <div>
          <div class="editor-state-panel__summary-title">{{ view.count }} state objects</div>
          <div class="editor-state-panel__summary-body">These values are stored with the graph and restored in the editor.</div>
        </div>
        <button type="button" class="editor-state-panel__summary-action" @click="$emit('add-state')">Add State</button>
      </div>

      <div class="editor-state-panel__content">
        <div v-if="view.rows.length === 0" class="editor-state-panel__empty">
          <div class="editor-state-panel__empty-title">{{ view.emptyTitle }}</div>
          <div class="editor-state-panel__empty-body">{{ view.emptyBody }}</div>
        </div>

        <article v-for="row in view.rows" :key="row.key" class="editor-state-panel__card">
          <div class="editor-state-panel__card-head">
            <div class="editor-state-panel__card-main">
              <div class="editor-state-panel__card-title">{{ row.title }}</div>
              <div class="editor-state-panel__card-key">{{ row.key }}</div>
            </div>
            <div class="editor-state-panel__card-head-actions">
              <span class="editor-state-panel__card-type">{{ row.typeLabel }}</span>
              <button
                type="button"
                class="editor-state-panel__card-delete"
                aria-label="Delete state"
                @click="$emit('delete-state', row.key)"
              >
                ×
              </button>
            </div>
          </div>

          <div class="editor-state-panel__field-grid">
            <label class="editor-state-panel__field">
              <span>Key</span>
              <input
                class="editor-state-panel__input"
                :value="row.key"
                @blur="commitStateRename(row.key, ($event.target as HTMLInputElement).value)"
                @keydown.enter="commitStateRename(row.key, ($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="editor-state-panel__field">
              <span>Name</span>
              <input
                class="editor-state-panel__input"
                :value="stateDefinition(row.key)?.name ?? ''"
                @input="
                  $emit('update-state', {
                    stateKey: row.key,
                    patch: { name: ($event.target as HTMLInputElement).value },
                  })
                "
              />
            </label>
          </div>

          <label class="editor-state-panel__field">
            <span>Description</span>
            <textarea
              class="editor-state-panel__textarea"
              rows="2"
              :value="stateDefinition(row.key)?.description ?? ''"
              @input="
                $emit('update-state', {
                  stateKey: row.key,
                  patch: { description: ($event.target as HTMLTextAreaElement).value },
                })
              "
            />
          </label>

          <div class="editor-state-panel__field-grid">
            <label class="editor-state-panel__field">
              <span>Type</span>
              <ElSelect
                class="editor-state-panel__select graphite-select"
                :model-value="row.typeLabel"
                :teleported="false"
                popper-class="graphite-select-popper"
                @update:model-value="handleStateTypeSelect(row.key, $event)"
              >
                <ElOption v-for="typeOption in STATE_FIELD_TYPE_OPTIONS" :key="typeOption" :label="typeOption" :value="typeOption" />
              </ElSelect>
            </label>

            <label class="editor-state-panel__field">
              <span>Color</span>
              <input
                class="editor-state-panel__input"
                :value="stateDefinition(row.key)?.color ?? ''"
                placeholder="#d97706"
                @input="
                  $emit('update-state', {
                    stateKey: row.key,
                    patch: { color: ($event.target as HTMLInputElement).value },
                  })
                "
              />
            </label>
          </div>

          <div class="editor-state-panel__card-bindings">
            <span class="editor-state-panel__binding-chip editor-state-panel__binding-chip--readers">{{ row.readerCount }} readers</span>
            <span class="editor-state-panel__binding-chip editor-state-panel__binding-chip--writers">{{ row.writerCount }} writers</span>
          </div>

          <div class="editor-state-panel__binding-groups">
            <div class="editor-state-panel__binding-group">
              <div class="editor-state-panel__binding-group-head">
                <div class="editor-state-panel__binding-group-title">Readers</div>
                <button type="button" class="editor-state-panel__binding-group-action" @click="toggleBindingForm(row.key, 'read')">
                  {{ isBindingFormOpen(row.key, 'read') ? "Close" : "Add Reader" }}
                </button>
              </div>

              <div v-if="row.readers.length > 0" class="editor-state-panel__binding-list">
                <div v-for="binding in row.readers" :key="`reader-${binding.nodeId}`" class="editor-state-panel__binding-item">
                  <button
                    type="button"
                    class="editor-state-panel__binding-token"
                    :class="{ 'editor-state-panel__binding-token--active': props.focusedNodeId === binding.nodeId }"
                    @click="$emit('focus-node', binding.nodeId)"
                  >
                    <span class="editor-state-panel__binding-token-head">
                      <span class="editor-state-panel__binding-kind">{{ binding.nodeKindLabel }}</span>
                      <span class="editor-state-panel__binding-node-label">{{ binding.nodeLabel }}</span>
                    </span>
                    <span class="editor-state-panel__binding-port-detail">Input: {{ binding.portLabel }}</span>
                  </button>
                  <button
                    type="button"
                    class="editor-state-panel__binding-remove"
                    aria-label="Remove reader"
                    @click="$emit('remove-reader', { stateKey: row.key, nodeId: binding.nodeId })"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div v-else class="editor-state-panel__binding-empty">No readers yet.</div>

              <StateBindingCreateForm
                v-if="isBindingFormOpen(row.key, 'read')"
                mode="read"
                :options="bindingOptions(row.key, 'read')"
                @add="
                  $emit('add-reader', { stateKey: row.key, nodeId: $event });
                  closeBindingForm(row.key, 'read');
                "
                @cancel="closeBindingForm(row.key, 'read')"
              />
            </div>

            <div class="editor-state-panel__binding-group">
              <div class="editor-state-panel__binding-group-head">
                <div class="editor-state-panel__binding-group-title">Writers</div>
                <button type="button" class="editor-state-panel__binding-group-action" @click="toggleBindingForm(row.key, 'write')">
                  {{ isBindingFormOpen(row.key, 'write') ? "Close" : "Add Writer" }}
                </button>
              </div>

              <div v-if="row.writers.length > 0" class="editor-state-panel__binding-list">
                <div v-for="binding in row.writers" :key="`writer-${binding.nodeId}`" class="editor-state-panel__binding-item">
                  <button
                    type="button"
                    class="editor-state-panel__binding-token"
                    :class="{ 'editor-state-panel__binding-token--active': props.focusedNodeId === binding.nodeId }"
                    @click="$emit('focus-node', binding.nodeId)"
                  >
                    <span class="editor-state-panel__binding-token-head">
                      <span class="editor-state-panel__binding-kind">{{ binding.nodeKindLabel }}</span>
                      <span class="editor-state-panel__binding-node-label">{{ binding.nodeLabel }}</span>
                    </span>
                    <span class="editor-state-panel__binding-port-detail">Output: {{ binding.portLabel }}</span>
                  </button>
                  <button
                    type="button"
                    class="editor-state-panel__binding-remove"
                    aria-label="Remove writer"
                    @click="$emit('remove-writer', { stateKey: row.key, nodeId: binding.nodeId })"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div v-else class="editor-state-panel__binding-empty">No writers yet.</div>

              <StateBindingCreateForm
                v-if="isBindingFormOpen(row.key, 'write')"
                mode="write"
                :options="bindingOptions(row.key, 'write')"
                @add="
                  $emit('add-writer', { stateKey: row.key, nodeId: $event });
                  closeBindingForm(row.key, 'write');
                "
                @cancel="closeBindingForm(row.key, 'write')"
              />
            </div>
          </div>

          <div class="editor-state-panel__card-value">
            <div class="editor-state-panel__card-value-label">Value</div>
            <StateDefaultValueEditor
              v-if="stateDefinition(row.key)"
              :field="stateDefinition(row.key)!"
              @update-value="
                $emit('update-state', {
                  stateKey: row.key,
                  patch: { value: $event },
                })
              "
            />
          </div>
        </article>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElOption, ElSelect } from "element-plus";

import StateDefaultValueEditor from "./StateDefaultValueEditor.vue";
import StateBindingCreateForm from "./StateBindingCreateForm.vue";
import { listStateBindingNodeOptions, type StateBindingMode } from "./statePanelBindings.ts";
import { defaultValueForStateType, STATE_FIELD_TYPE_OPTIONS, type StateFieldType } from "./statePanelFields.ts";
import { buildStatePanelViewModel } from "./statePanelViewModel";
import type { GraphDocument, GraphPayload, StateDefinition } from "@/types/node-system";

const props = defineProps<{
  open: boolean;
  document: GraphPayload | GraphDocument;
  focusedNodeId?: string | null;
}>();

const emit = defineEmits<{
  (event: "toggle"): void;
  (event: "focus-node", nodeId: string): void;
  (event: "add-state"): void;
  (event: "delete-state", stateKey: string): void;
  (event: "rename-state", payload: { currentKey: string; nextKey: string }): void;
  (event: "update-state", payload: { stateKey: string; patch: Partial<StateDefinition> }): void;
  (event: "add-reader", payload: { stateKey: string; nodeId: string }): void;
  (event: "remove-reader", payload: { stateKey: string; nodeId: string }): void;
  (event: "add-writer", payload: { stateKey: string; nodeId: string }): void;
  (event: "remove-writer", payload: { stateKey: string; nodeId: string }): void;
}>();

const view = computed(() => buildStatePanelViewModel(props.document));
const readerFormOpenByKey = ref<Record<string, boolean>>({});
const writerFormOpenByKey = ref<Record<string, boolean>>({});

function isBindingFormOpen(stateKey: string, mode: StateBindingMode) {
  return mode === "read" ? readerFormOpenByKey.value[stateKey] ?? false : writerFormOpenByKey.value[stateKey] ?? false;
}

function toggleBindingForm(stateKey: string, mode: StateBindingMode) {
  if (mode === "read") {
    readerFormOpenByKey.value = {
      ...readerFormOpenByKey.value,
      [stateKey]: !isBindingFormOpen(stateKey, mode),
    };
    return;
  }

  writerFormOpenByKey.value = {
    ...writerFormOpenByKey.value,
    [stateKey]: !isBindingFormOpen(stateKey, mode),
  };
}

function closeBindingForm(stateKey: string, mode: StateBindingMode) {
  if (mode === "read") {
    readerFormOpenByKey.value = {
      ...readerFormOpenByKey.value,
      [stateKey]: false,
    };
    return;
  }

  writerFormOpenByKey.value = {
    ...writerFormOpenByKey.value,
    [stateKey]: false,
  };
}

function bindingOptions(stateKey: string, mode: StateBindingMode) {
  return listStateBindingNodeOptions(props.document, stateKey, mode);
}

function stateDefinition(stateKey: string) {
  return props.document.state_schema[stateKey];
}

function commitStateRename(currentKey: string, nextKey: string) {
  const normalizedNextKey = nextKey.trim();
  if (!normalizedNextKey || normalizedNextKey === currentKey) {
    return;
  }
  emit("rename-state", { currentKey, nextKey: normalizedNextKey });
}

function handleStateTypeSelect(stateKey: string, value: string | number | boolean | undefined) {
  const nextType = String(value ?? "text");
  emit("update-state", {
    stateKey,
    patch: {
      type: nextType,
      value: defaultValueForStateType(nextType as StateFieldType),
    },
  });
}
</script>

<style scoped>
.editor-state-panel {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-left: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 250, 241, 0.78);
  backdrop-filter: blur(20px);
  overflow: hidden;
}

.editor-state-panel--open {
  display: flex;
  flex-direction: column;
}

.editor-state-panel__collapsed {
  display: flex;
  height: 100%;
  width: 100%;
  min-height: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border: none;
  background: transparent;
  cursor: pointer;
}

.editor-state-panel__collapsed-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
}

.editor-state-panel__collapsed-count {
  display: inline-flex;
  min-width: 24px;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  padding: 2px 8px;
  font-size: 0.68rem;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.14);
  padding: 16px;
}

.editor-state-panel__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.editor-state-panel__title {
  margin: 8px 0 0;
  font-size: 1.3rem;
  color: #1f2937;
}

.editor-state-panel__body {
  margin: 8px 0 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__collapse {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.92);
  color: rgba(60, 41, 20, 0.72);
  cursor: pointer;
}

.editor-state-panel__collapse-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}

.editor-state-panel__summary {
  margin: 16px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.82);
  padding: 14px;
  box-shadow: 0 10px 24px rgba(60, 41, 20, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-state-panel__summary-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1f2937;
}

.editor-state-panel__summary-body {
  margin-top: 6px;
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.editor-state-panel__summary-action {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 244, 240, 0.94);
  padding: 8px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.94);
}

.editor-state-panel__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: grid;
  gap: 14px;
  align-content: start;
}

.editor-state-panel__empty {
  display: grid;
  place-items: center;
  min-height: 240px;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  border-radius: 28px;
  background: rgba(255, 250, 241, 0.72);
  padding: 24px;
  text-align: center;
}

.editor-state-panel__empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.editor-state-panel__empty-body {
  margin-top: 8px;
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__card {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.82);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.editor-state-panel__card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.editor-state-panel__card-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-state-panel__card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
}

.editor-state-panel__card-key {
  margin-top: 4px;
  font-size: 0.82rem;
  color: rgba(60, 41, 20, 0.62);
}

.editor-state-panel__card-bindings {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.editor-state-panel__field-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.editor-state-panel__field {
  display: grid;
  gap: 6px;
  font-size: 0.78rem;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__input,
.editor-state-panel__textarea {
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  padding: 10px 12px;
  font-size: 0.9rem;
  color: #1f2937;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.editor-state-panel__select {
  width: 100%;
}

.editor-state-panel__textarea {
  resize: vertical;
  min-height: 68px;
}

.editor-state-panel__textarea--value {
  min-height: 120px;
  white-space: pre-wrap;
}

.editor-state-panel__binding-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  padding: 0 10px;
  font-size: 0.78rem;
  color: rgba(60, 41, 20, 0.72);
  background: rgba(255, 250, 241, 0.92);
}

.editor-state-panel__binding-chip--readers {
  border-color: rgba(37, 99, 235, 0.16);
  color: rgba(37, 99, 235, 0.88);
  background: rgba(239, 246, 255, 0.9);
}

.editor-state-panel__binding-chip--writers {
  border-color: rgba(217, 119, 6, 0.16);
  color: rgba(217, 119, 6, 0.9);
  background: rgba(255, 247, 237, 0.92);
}

.editor-state-panel__binding-groups {
  display: grid;
  gap: 10px;
}

.editor-state-panel__binding-group {
  display: grid;
  gap: 6px;
}

.editor-state-panel__binding-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-state-panel__binding-group-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.74);
}

.editor-state-panel__binding-group-action {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 244, 240, 0.94);
  padding: 6px 10px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.94);
}

.editor-state-panel__binding-list {
  display: grid;
  gap: 8px;
}

.editor-state-panel__binding-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-state-panel__binding-token {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 4px;
  min-height: 48px;
  border-radius: 14px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  padding: 9px 10px;
  font-size: 0.82rem;
  color: rgba(60, 41, 20, 0.82);
  background: rgba(255, 250, 241, 0.92);
  cursor: pointer;
  text-align: left;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.editor-state-panel__binding-token:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 248, 240, 0.98);
  transform: translateY(-1px);
}

.editor-state-panel__binding-token--active {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 244, 240, 0.96);
}

.editor-state-panel__binding-token-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.editor-state-panel__binding-kind {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
  background: rgba(255, 250, 241, 0.92);
}

.editor-state-panel__binding-node-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  font-weight: 600;
  color: #1f2937;
}

.editor-state-panel__binding-port-detail {
  font-size: 0.74rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.editor-state-panel__binding-remove {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.92);
  color: rgba(60, 41, 20, 0.62);
  font-size: 1rem;
  line-height: 1;
}

.editor-state-panel__binding-empty {
  border: 1px dashed rgba(154, 52, 18, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.74);
  padding: 10px 12px;
  font-size: 0.82rem;
  color: rgba(60, 41, 20, 0.68);
}

.editor-state-panel__card-type {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.editor-state-panel__card-delete {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.92);
  color: rgba(60, 41, 20, 0.62);
  font-size: 1rem;
  line-height: 1;
}

.editor-state-panel__card-description {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__card-value {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  background: rgba(248, 242, 234, 0.72);
  padding: 12px 14px;
  display: grid;
  gap: 10px;
}

.editor-state-panel__card-value-label {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.8);
}

.editor-state-panel__card-value-preview {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.55;
  color: #1f2937;
}
</style>
