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
      <header class="editor-state-panel__inspector-header">
        <div>
          <div class="editor-state-panel__eyebrow">Graph State</div>
          <h2 class="editor-state-panel__title">Graph Inspector</h2>
          <p class="editor-state-panel__body">Track state objects, bindings, and defaults in one compact panel.</p>
        </div>
        <div class="editor-state-panel__header-tools">
          <span class="editor-state-panel__header-count">{{ view.count }}</span>
          <button type="button" class="editor-state-panel__collapse" aria-label="Collapse state panel" @click="$emit('toggle')">
            <ElIcon class="editor-state-panel__collapse-icon" aria-hidden="true"><ArrowRight /></ElIcon>
          </button>
        </div>
      </header>

      <div class="editor-state-panel__summary">
        <div class="editor-state-panel__summary-stats" aria-label="State summary">
          <div class="editor-state-panel__summary-stat">
            <span>States</span>
            <strong>{{ view.count }}</strong>
          </div>
          <div class="editor-state-panel__summary-stat">
            <span>Reads</span>
            <strong>{{ readerTotal }}</strong>
          </div>
          <div class="editor-state-panel__summary-stat">
            <span>Writes</span>
            <strong>{{ writerTotal }}</strong>
          </div>
        </div>
        <button type="button" class="editor-state-panel__quick-action" @click="$emit('add-state')">
          <ElIcon aria-hidden="true"><CirclePlus /></ElIcon>
          <span>Add</span>
        </button>
      </div>

      <div class="editor-state-panel__content">
        <div v-if="view.rows.length === 0" class="editor-state-panel__empty">
          <div class="editor-state-panel__empty-title">{{ view.emptyTitle }}</div>
          <div class="editor-state-panel__empty-body">{{ view.emptyBody }}</div>
        </div>

        <article
          v-for="row in view.rows"
          :key="row.key"
          class="editor-state-panel__state-row"
          :style="{ '--state-panel-row-accent': stateDefinition(row.key)?.color ?? '#d97706' }"
        >
          <div class="editor-state-panel__state-row-head">
            <div class="editor-state-panel__state-main">
              <span class="editor-state-panel__state-dot" aria-hidden="true" />
              <div class="editor-state-panel__state-copy">
                <div class="editor-state-panel__card-title">{{ row.title }}</div>
                <div class="editor-state-panel__card-key">{{ row.key }}</div>
              </div>
            </div>
            <div class="editor-state-panel__state-actions">
              <span class="editor-state-panel__card-type">{{ row.typeLabel }}</span>
              <button
                type="button"
                class="editor-state-panel__card-delete"
                aria-label="Delete state"
                @click="$emit('delete-state', row.key)"
              >
                <ElIcon aria-hidden="true"><Delete /></ElIcon>
              </button>
            </div>
          </div>

          <div class="editor-state-panel__details-card">
            <div class="editor-state-panel__details-title">Definition</div>

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
          </div>
        </article>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElIcon, ElOption, ElSelect } from "element-plus";
import { ArrowRight, CirclePlus, Delete } from "@element-plus/icons-vue";

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
const readerTotal = computed(() => view.value.rows.reduce((total, row) => total + row.readerCount, 0));
const writerTotal = computed(() => view.value.rows.reduce((total, row) => total + row.writerCount, 0));
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

.editor-state-panel__inspector-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
}

.editor-state-panel__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.editor-state-panel__title {
  margin: 6px 0 0;
  font-size: 1.12rem;
  color: #1f2937;
}

.editor-state-panel__body {
  margin: 6px 0 0;
  line-height: 1.45;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__header-tools {
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
}

.editor-state-panel__header-count {
  display: inline-flex;
  min-width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.88);
  color: rgba(124, 45, 18, 0.86);
  font-size: 0.72rem;
  font-weight: 700;
}

.editor-state-panel__collapse {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.68);
  color: rgba(60, 41, 20, 0.72);
  cursor: pointer;
}

.editor-state-panel__collapse-icon {
  width: 15px;
  height: 15px;
}

.editor-state-panel__summary {
  margin: 0 12px 12px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 20px;
  background: rgba(255, 250, 241, 0.62);
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.editor-state-panel__summary-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  flex: 1;
  gap: 4px;
}

.editor-state-panel__summary-stat {
  display: grid;
  gap: 2px;
  border-radius: 14px;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.48);
}

.editor-state-panel__summary-stat span {
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(60, 41, 20, 0.68);
}

.editor-state-panel__summary-stat strong {
  font-size: 0.92rem;
  color: #1f2937;
}

.editor-state-panel__quick-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 252, 247, 0.88);
  padding: 8px 10px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.94);
  cursor: pointer;
}

.editor-state-panel__content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px 14px;
  display: grid;
  gap: 10px;
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

.editor-state-panel__state-row {
  border: 1px solid transparent;
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.66);
  padding: 8px;
  display: grid;
  gap: 8px;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.editor-state-panel__state-row:hover {
  border-color: rgba(154, 52, 18, 0.1);
  background: rgba(255, 252, 247, 0.88);
}

.editor-state-panel__state-row-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  min-height: 40px;
  padding: 0 2px 0 4px;
}

.editor-state-panel__state-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.editor-state-panel__state-dot {
  display: inline-flex;
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--state-panel-row-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--state-panel-row-accent) 14%, transparent);
}

.editor-state-panel__state-copy {
  min-width: 0;
}

.editor-state-panel__state-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 140ms ease;
}

.editor-state-panel__state-row:hover .editor-state-panel__state-actions {
  opacity: 1;
}

@media (hover: none) {
  .editor-state-panel__state-actions {
    opacity: 1;
  }
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

.editor-state-panel__details-card {
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 22px;
  background: rgba(255, 250, 241, 0.72);
  padding: 12px;
  display: grid;
  gap: 12px;
}

.editor-state-panel__details-title {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.76);
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
