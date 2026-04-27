<template>
  <aside class="editor-state-panel" @pointerdown.capture="handleStatePanelPointerDown">
    <div class="editor-state-panel__surface">
      <header class="editor-state-panel__inspector-header">
        <div>
          <div class="editor-state-panel__eyebrow">{{ t("statePanel.eyebrow") }}</div>
          <h2 class="editor-state-panel__title">{{ t("statePanel.title") }}</h2>
          <p class="editor-state-panel__body">{{ t("statePanel.body") }}</p>
        </div>
        <div class="editor-state-panel__header-tools">
          <span class="editor-state-panel__header-count">{{ view.count }}</span>
          <button type="button" class="editor-state-panel__collapse" :aria-label="t('statePanel.collapse')" @click="$emit('toggle')">
            <ElIcon class="editor-state-panel__collapse-icon" aria-hidden="true"><ArrowRight /></ElIcon>
          </button>
        </div>
      </header>

      <div class="editor-state-panel__summary">
        <div class="editor-state-panel__summary-stats" :aria-label="t('statePanel.summary')">
          <div class="editor-state-panel__summary-stat">
            <span>{{ t("statePanel.states") }}</span>
            <strong>{{ view.count }}</strong>
          </div>
          <div class="editor-state-panel__summary-stat">
            <span>{{ t("statePanel.reads") }}</span>
            <strong>{{ readerTotal }}</strong>
          </div>
          <div class="editor-state-panel__summary-stat">
            <span>{{ t("statePanel.writes") }}</span>
            <strong>{{ writerTotal }}</strong>
          </div>
        </div>
        <button type="button" class="editor-state-panel__quick-action" @click="$emit('add-state')">
          <ElIcon aria-hidden="true"><CirclePlus /></ElIcon>
          <span>{{ t("statePanel.add") }}</span>
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
        <div
          class="editor-state-panel__state-row-head"
          role="button"
          tabindex="0"
          :aria-expanded="isStateRowExpanded(row.key)"
          @click="toggleStateRow(row.key)"
          @keydown.enter.prevent="toggleStateRow(row.key)"
          @keydown.space.prevent="toggleStateRow(row.key)"
        >
          <ElIcon
            class="editor-state-panel__expand-indicator"
            :class="{ 'editor-state-panel__expand-indicator--open': isStateRowExpanded(row.key) }"
            aria-hidden="true"
          >
            <ArrowDown />
          </ElIcon>
          <div class="editor-state-panel__state-main">
            <span class="editor-state-panel__state-dot" aria-hidden="true" />
            <div class="editor-state-panel__state-copy">
              <div class="editor-state-panel__card-title">{{ row.title }}</div>
            </div>
          </div>
          <div class="editor-state-panel__state-counts">
            <span class="editor-state-panel__binding-chip editor-state-panel__binding-chip--readers">{{ row.readerCount }}r</span>
            <span class="editor-state-panel__binding-chip editor-state-panel__binding-chip--writers">{{ row.writerCount }}w</span>
          </div>
          <div class="editor-state-panel__state-actions">
            <span class="editor-state-panel__card-type">{{ row.typeLabel }}</span>
            <ElPopover
              :visible="isStateDeleteConfirmOpen(row.key)"
              placement="top-end"
              :show-arrow="false"
              :popper-style="stateConfirmPopoverStyle"
              popper-class="editor-state-panel__confirm-popover editor-state-panel__confirm-popover--delete"
            >
              <template #reference>
                <button
                  type="button"
                  data-state-delete-surface="true"
                  class="editor-state-panel__card-delete"
                  :class="{ 'editor-state-panel__card-delete--confirm': isStateDeleteConfirmOpen(row.key) }"
                  :aria-label="isStateDeleteConfirmOpen(row.key) ? t('statePanel.confirmDeleteState') : t('statePanel.deleteState')"
                  @pointerdown.stop
                  @click.stop="handleStateDeleteActionClick(row.key)"
                >
                  <ElIcon v-if="isStateDeleteConfirmOpen(row.key)" aria-hidden="true"><Check /></ElIcon>
                  <ElIcon v-else aria-hidden="true"><Delete /></ElIcon>
                </button>
              </template>
              <div class="editor-state-panel__confirm-hint editor-state-panel__confirm-hint--delete">{{ t("statePanel.deleteStateQuestion") }}</div>
            </ElPopover>
          </div>
        </div>

        <div v-if="isStateRowExpanded(row.key)" class="editor-state-panel__details-card">
            <div class="editor-state-panel__details-title">{{ t("statePanel.definition") }}</div>

            <div class="editor-state-panel__field-grid">
              <div class="editor-state-panel__field">
                <span class="editor-state-panel__field-label">{{ t("nodeCard.key") }}</span>
                <ElInput
                  :aria-label="t('nodeCard.key')"
                  :model-value="row.key"
                  @change="commitStateRename(row.key, String($event ?? ''))"
                />
              </div>

              <div class="editor-state-panel__field">
                <span class="editor-state-panel__field-label">{{ t("nodeCard.name") }}</span>
                <ElInput
                  :aria-label="t('nodeCard.name')"
                  :model-value="stateDefinition(row.key)?.name ?? ''"
                  @update:model-value="
                    $emit('update-state', {
                      stateKey: row.key,
                      patch: { name: String($event ?? '') },
                    })
                  "
                />
              </div>
            </div>

            <div class="editor-state-panel__field-grid">
              <div class="editor-state-panel__field">
                <span class="editor-state-panel__field-label">{{ t("nodeCard.type") }}</span>
                <ElSelect
                  class="editor-state-panel__select graphite-select"
                  :aria-label="t('nodeCard.type')"
                  :model-value="stateDefinition(row.key)?.type ?? 'text'"
                  :teleported="false"
                  popper-class="graphite-select-popper editor-state-panel__select-popper"
                  @update:model-value="handleStateTypeSelect(row.key, $event)"
                >
                  <ElOption v-for="typeOption in STATE_FIELD_TYPE_OPTIONS" :key="typeOption" :label="typeOption" :value="typeOption" />
                </ElSelect>
              </div>

              <div class="editor-state-panel__field">
                <span class="editor-state-panel__field-label">{{ t("nodeCard.color") }}</span>
                <ElSelect
                  class="editor-state-panel__color-select graphite-select"
                  :aria-label="t('nodeCard.color')"
                  :model-value="stateDefinition(row.key)?.color ?? ''"
                  :teleported="false"
                  popper-class="graphite-select-popper editor-state-panel__select-popper"
                  @update:model-value="handleStateColorSelect(row.key, $event)"
                >
                  <template #label>
                    <span class="editor-state-panel__color-select-value">
                      <span class="editor-state-panel__color-dot" :style="selectedStateColorStyle(row.key)" />
                    </span>
                  </template>
                  <ElOption v-for="option in stateColorOptions(row.key)" :key="option.value || option.label" :label="option.label" :value="option.value">
                    <div class="editor-state-panel__color-option">
                      <span class="editor-state-panel__color-dot" :style="{ backgroundColor: option.swatch }" />
                      <span class="editor-state-panel__color-option-label">{{ option.label }}</span>
                    </div>
                  </ElOption>
                </ElSelect>
              </div>
            </div>

            <div class="editor-state-panel__field editor-state-panel__field--full">
              <span class="editor-state-panel__field-label">{{ t("nodeCard.description") }}</span>
              <ElInput
                :aria-label="t('nodeCard.description')"
                type="textarea"
                :rows="2"
                :model-value="stateDefinition(row.key)?.description ?? ''"
                @update:model-value="
                  $emit('update-state', {
                    stateKey: row.key,
                    patch: { description: String($event ?? '') },
                  })
                "
              />
            </div>

            <div class="editor-state-panel__card-value">
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

            <div class="editor-state-panel__binding-groups">
              <div class="editor-state-panel__binding-group">
                <div class="editor-state-panel__binding-group-head">
                  <div class="editor-state-panel__binding-group-title">{{ t("statePanel.reads") }}</div>
                  <button type="button" class="editor-state-panel__binding-group-action" @click="toggleBindingForm(row.key, 'read')">
                    {{ isBindingFormOpen(row.key, 'read') ? t("common.close") : t("statePanel.addReader") }}
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
                      <span class="editor-state-panel__binding-port-detail">{{ t("statePanel.inputPort", { port: binding.portLabel }) }}</span>
                    </button>
                    <button
                      type="button"
                      class="editor-state-panel__binding-remove"
                      :aria-label="t('statePanel.removeReader')"
                      @click="$emit('remove-reader', { stateKey: row.key, nodeId: binding.nodeId })"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div v-else class="editor-state-panel__binding-empty">{{ t("statePanel.noReaders") }}</div>

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
                  <div class="editor-state-panel__binding-group-title">{{ t("statePanel.writes") }}</div>
                  <button type="button" class="editor-state-panel__binding-group-action" @click="toggleBindingForm(row.key, 'write')">
                    {{ isBindingFormOpen(row.key, 'write') ? t("common.close") : t("statePanel.addWriter") }}
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
                      <span class="editor-state-panel__binding-port-detail">{{ t("statePanel.outputPort", { port: binding.portLabel }) }}</span>
                    </button>
                    <button
                      type="button"
                      class="editor-state-panel__binding-remove"
                      :aria-label="t('statePanel.removeWriter')"
                      @click="$emit('remove-writer', { stateKey: row.key, nodeId: binding.nodeId })"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div v-else class="editor-state-panel__binding-empty">{{ t("statePanel.noWriters") }}</div>

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

            <section class="editor-state-panel__timeline">
              <button
                type="button"
                class="editor-state-panel__timeline-toggle"
                :aria-expanded="isTimelineSectionExpanded(row.key)"
                @click="toggleTimelineSection(row.key)"
              >
                <div class="editor-state-panel__timeline-toggle-copy">
                  <span class="editor-state-panel__timeline-title">{{ t("statePanel.timeline") }}</span>
                  <span class="editor-state-panel__timeline-summary">{{ row.timelineSummary }}</span>
                </div>
                <ElIcon
                  class="editor-state-panel__timeline-toggle-indicator"
                  :class="{ 'editor-state-panel__timeline-toggle-indicator--open': isTimelineSectionExpanded(row.key) }"
                  aria-hidden="true"
                >
                  <ArrowDown />
                </ElIcon>
              </button>

              <div v-if="isTimelineSectionExpanded(row.key)" class="editor-state-panel__timeline-body">
                <div v-if="row.timelineEntries.length === 0" class="editor-state-panel__timeline-empty">
                  {{ row.timelineEmptyBody }}
                </div>

                <ol v-else class="editor-state-panel__timeline-list">
                  <li v-for="entry in row.timelineEntries" :key="`${row.key}-${entry.sequence}-${entry.nodeId}`" class="editor-state-panel__timeline-entry">
                    <div class="editor-state-panel__timeline-entry-head">
                      <button
                        type="button"
                        class="editor-state-panel__timeline-node"
                        :class="{ 'editor-state-panel__timeline-node--active': props.focusedNodeId === entry.nodeId }"
                        @click="$emit('focus-node', entry.nodeId)"
                      >
                        <span class="editor-state-panel__timeline-node-kind">{{ entry.nodeKindLabel }}</span>
                        <span class="editor-state-panel__timeline-node-label">{{ entry.nodeLabel }}</span>
                      </button>
                      <div class="editor-state-panel__timeline-meta">
                        <span class="editor-state-panel__timeline-meta-chip">#{{ entry.sequence }}</span>
                        <span class="editor-state-panel__timeline-meta-chip">{{ entry.outputKey }}</span>
                        <span class="editor-state-panel__timeline-meta-chip">{{ entry.modeLabel }}</span>
                        <span v-if="entry.createdAtLabel" class="editor-state-panel__timeline-meta-time">{{ entry.createdAtLabel }}</span>
                      </div>
                    </div>

                    <div class="editor-state-panel__timeline-entry-value-change">
                      <template v-if="entry.previousValuePreview !== null">
                        <div class="editor-state-panel__timeline-value-block">
                          <span class="editor-state-panel__timeline-value-label">{{ t("statePanel.before") }}</span>
                          <span class="editor-state-panel__timeline-value">{{ entry.previousValuePreview }}</span>
                        </div>
                        <span class="editor-state-panel__timeline-arrow" aria-hidden="true">→</span>
                      </template>
                      <div class="editor-state-panel__timeline-value-block">
                        <span class="editor-state-panel__timeline-value-label">
                          {{ entry.previousValuePreview !== null ? t("statePanel.after") : t("statePanel.setTo") }}
                        </span>
                        <span class="editor-state-panel__timeline-value">{{ entry.valuePreview }}</span>
                      </div>
                    </div>
                  </li>
                </ol>
              </div>
            </section>
          </div>
        </article>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElIcon, ElInput, ElOption, ElPopover, ElSelect } from "element-plus";
import { ArrowDown, ArrowRight, Check, CirclePlus, Delete } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import StateDefaultValueEditor from "./StateDefaultValueEditor.vue";
import StateBindingCreateForm from "./StateBindingCreateForm.vue";
import { listStateBindingNodeOptions, type StateBindingMode } from "./statePanelBindings.ts";
import {
  defaultValueForStateType,
  resolveStateColorOptions,
  STATE_FIELD_TYPE_OPTIONS,
  type StateFieldType,
} from "./statePanelFields.ts";
import { buildStatePanelViewModel } from "./statePanelViewModel";
import type { GraphDocument, GraphPayload, StateDefinition } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

const props = defineProps<{
  document: GraphPayload | GraphDocument;
  run?: RunDetail | null;
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

const { t, locale } = useI18n();
const view = computed(() => {
  locale.value;
  return buildStatePanelViewModel(props.document, props.run ?? null);
});
const readerTotal = computed(() => view.value.rows.reduce((total, row) => total + row.readerCount, 0));
const writerTotal = computed(() => view.value.rows.reduce((total, row) => total + row.writerCount, 0));
const expandedStateKeys = ref<Record<string, boolean>>({});
const expandedTimelineKeys = ref<Record<string, boolean>>({});
const readerFormOpenByKey = ref<Record<string, boolean>>({});
const writerFormOpenByKey = ref<Record<string, boolean>>({});
const activeStateDeleteKey = ref<string | null>(null);
const stateDeleteConfirmTimeoutRef = ref<number | null>(null);
const stateConfirmPopoverStyle = {
  padding: "0",
  border: "none",
  background: "transparent",
  boxShadow: "none",
};

onBeforeUnmount(() => {
  clearStateDeleteConfirmTimeout();
});

watch(
  () => Object.keys(props.document.state_schema).join("\u0000"),
  () => {
    if (activeStateDeleteKey.value && !props.document.state_schema[activeStateDeleteKey.value]) {
      clearStateDeleteConfirmState();
    }
  },
);

function isStateRowExpanded(stateKey: string) {
  return expandedStateKeys.value[stateKey] ?? false;
}

function toggleStateRow(stateKey: string) {
  expandedStateKeys.value = {
    ...expandedStateKeys.value,
    [stateKey]: !isStateRowExpanded(stateKey),
  };
}

function isTimelineSectionExpanded(stateKey: string) {
  return expandedTimelineKeys.value[stateKey] ?? false;
}

function toggleTimelineSection(stateKey: string) {
  expandedTimelineKeys.value = {
    ...expandedTimelineKeys.value,
    [stateKey]: !isTimelineSectionExpanded(stateKey),
  };
}

function isStateDeleteConfirmOpen(stateKey: string) {
  return activeStateDeleteKey.value === stateKey;
}

function clearStateDeleteConfirmTimeout() {
  if (stateDeleteConfirmTimeoutRef.value !== null) {
    window.clearTimeout(stateDeleteConfirmTimeoutRef.value);
    stateDeleteConfirmTimeoutRef.value = null;
  }
}

function clearStateDeleteConfirmState() {
  clearStateDeleteConfirmTimeout();
  activeStateDeleteKey.value = null;
}

function startStateDeleteConfirmWindow(stateKey: string) {
  clearStateDeleteConfirmTimeout();
  activeStateDeleteKey.value = stateKey;
  stateDeleteConfirmTimeoutRef.value = window.setTimeout(() => {
    stateDeleteConfirmTimeoutRef.value = null;
    if (activeStateDeleteKey.value === stateKey) {
      activeStateDeleteKey.value = null;
    }
  }, 2000);
}

function handleStateDeleteActionClick(stateKey: string) {
  if (activeStateDeleteKey.value === stateKey) {
    confirmStateDelete(stateKey);
    return;
  }
  startStateDeleteConfirmWindow(stateKey);
}

function confirmStateDelete(stateKey: string) {
  clearStateDeleteConfirmState();
  emit("delete-state", stateKey);
}

function handleStatePanelPointerDown(event: PointerEvent) {
  if (!activeStateDeleteKey.value) {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("[data-state-delete-surface='true']")) {
    return;
  }
  clearStateDeleteConfirmState();
}

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

function stateColorOptions(stateKey: string) {
  return resolveStateColorOptions(stateDefinition(stateKey)?.color ?? "");
}

function selectedStateColorStyle(stateKey: string) {
  const definition = stateDefinition(stateKey);
  const matchedOption = stateColorOptions(stateKey).find((option) => option.value === definition?.color);
  return {
    backgroundColor: matchedOption?.swatch || definition?.color || "#d97706",
  };
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

function handleStateColorSelect(stateKey: string, value: string | number | boolean | undefined) {
  emit("update-state", {
    stateKey,
    patch: {
      color: String(value ?? ""),
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
  padding: 12px;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.editor-state-panel__surface {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 28px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(34px) saturate(1.7) contrast(1.02);
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
  font-family: var(--graphite-font-display);
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
  overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 0 2px 2px;
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
  box-sizing: border-box;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 24px;
  background: var(--graphite-surface-card);
  padding: 8px;
  display: grid;
  gap: 8px;
  box-shadow:
    0 14px 30px rgba(60, 41, 20, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.72) inset;
  transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.editor-state-panel__state-row:hover {
  border-color: rgba(154, 52, 18, 0.26);
  background: rgba(255, 252, 247, 0.98);
  box-shadow:
    0 16px 34px rgba(60, 41, 20, 0.1),
    0 1px 0 rgba(255, 255, 255, 0.76) inset;
}

.editor-state-panel__state-row-head {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  min-height: 40px;
  padding: 0 2px 0 4px;
  overflow: hidden;
  cursor: pointer;
}

.editor-state-panel__expand-indicator {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.86);
  color: rgba(154, 52, 18, 0.8);
  transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease;
}

.editor-state-panel__expand-indicator--open {
  transform: rotate(180deg);
  border-color: rgba(217, 119, 6, 0.24);
  background: rgba(255, 247, 237, 0.96);
}

.editor-state-panel__state-main {
  display: flex;
  align-items: center;
  flex: 1 1 160px;
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
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.editor-state-panel__state-counts {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.editor-state-panel__state-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
}

.editor-state-panel__card-title {
  min-width: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-state-panel__card-bindings {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.editor-state-panel__details-card {
  box-sizing: border-box;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 22px;
  background: rgba(255, 252, 247, 0.94);
  padding: 12px;
  display: grid;
  gap: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
}

.editor-state-panel__field {
  display: grid;
  gap: 6px;
  font-size: 0.78rem;
  color: rgba(60, 41, 20, 0.72);
}

.editor-state-panel__field--full {
  min-width: 0;
}

.editor-state-panel__field-label {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.editor-state-panel__input,
.editor-state-panel__textarea {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  padding: 10px 12px;
  font-size: 0.9rem;
  color: #1f2937;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.editor-state-panel__select,
.editor-state-panel__color-select {
  min-width: 0;
  width: 100%;
}

.editor-state-panel__color-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.editor-state-panel__color-option-label {
  font-size: 0.84rem;
  color: #3c2914;
}

.editor-state-panel__color-select-value {
  display: inline-flex;
  align-items: center;
}

.editor-state-panel__color-dot {
  width: 10px;
  height: 10px;
  border: 1px solid rgba(60, 41, 20, 0.16);
  border-radius: 999px;
  flex: none;
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
  box-sizing: border-box;
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

.editor-state-panel__timeline {
  display: grid;
  gap: 10px;
  border-top: 1px solid rgba(154, 52, 18, 0.12);
  padding-top: 12px;
}

.editor-state-panel__timeline-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.72);
  padding: 10px 12px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.editor-state-panel__timeline-toggle-copy {
  display: grid;
  gap: 4px;
}

.editor-state-panel__timeline-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.editor-state-panel__timeline-summary {
  font-size: 0.84rem;
  color: rgba(60, 41, 20, 0.78);
}

.editor-state-panel__timeline-toggle-indicator {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  background: rgba(255, 252, 247, 0.92);
  color: rgba(154, 52, 18, 0.78);
  transition: transform 160ms ease;
}

.editor-state-panel__timeline-toggle-indicator--open {
  transform: rotate(180deg);
}

.editor-state-panel__timeline-body {
  display: grid;
  gap: 10px;
}

.editor-state-panel__timeline-empty {
  border: 1px dashed rgba(154, 52, 18, 0.18);
  border-radius: 16px;
  background: rgba(255, 250, 241, 0.66);
  padding: 12px;
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.7);
}

.editor-state-panel__timeline-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.editor-state-panel__timeline-entry {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  background: rgba(255, 252, 247, 0.9);
  padding: 10px;
}

.editor-state-panel__timeline-entry-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.editor-state-panel__timeline-node {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.94);
  padding: 6px 10px;
  color: #1f2937;
  cursor: pointer;
}

.editor-state-panel__timeline-node--active {
  border-color: rgba(217, 119, 6, 0.28);
  background: rgba(255, 247, 237, 0.96);
}

.editor-state-panel__timeline-node-kind {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.editor-state-panel__timeline-node-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
  font-weight: 600;
}

.editor-state-panel__timeline-meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.editor-state-panel__timeline-meta-chip,
.editor-state-panel__timeline-meta-time {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  background: rgba(255, 250, 241, 0.86);
  padding: 0 8px;
  font-size: 0.72rem;
  color: rgba(60, 41, 20, 0.7);
}

.editor-state-panel__timeline-entry-value-change {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.editor-state-panel__timeline-value-block {
  display: grid;
  gap: 4px;
  min-width: 0;
  flex: 1 1 180px;
}

.editor-state-panel__timeline-value-label {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.68);
}

.editor-state-panel__timeline-value {
  display: block;
  min-width: 0;
  border-radius: 12px;
  background: rgba(255, 248, 240, 0.82);
  padding: 8px 10px;
  color: #1f2937;
  font-size: 0.82rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.editor-state-panel__timeline-arrow {
  color: rgba(154, 52, 18, 0.58);
  font-size: 0.9rem;
}

.editor-state-panel__binding-group {
  display: grid;
  gap: 6px;
}

.editor-state-panel__binding-group-head {
  display: flex;
  flex-wrap: wrap;
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
  min-width: 0;
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
  flex-wrap: wrap;
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
  overflow-wrap: anywhere;
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
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.92);
  color: rgba(60, 41, 20, 0.62);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.editor-state-panel__card-delete:hover {
  border-color: rgba(185, 28, 28, 0.22);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(185, 28, 28);
}

.editor-state-panel__card-delete--confirm,
.editor-state-panel__card-delete--confirm:hover,
.editor-state-panel__card-delete--confirm:focus-visible {
  border-color: rgba(185, 28, 28, 0.3);
  background: rgb(185, 28, 28);
  color: #fff;
}

.editor-state-panel__confirm-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  padding: 6px 14px;
  color: rgb(153, 27, 27);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  box-shadow: 0 14px 32px rgba(60, 41, 20, 0.14);
}

:deep(.editor-state-panel__confirm-popover.el-popper) {
  min-width: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

:deep(.editor-state-panel__confirm-popover .el-popover) {
  min-width: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
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

.editor-state-panel__card-value-preview {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.55;
  color: #1f2937;
}

:deep(.editor-state-panel .el-input__wrapper),
:deep(.editor-state-panel .el-select__wrapper) {
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.editor-state-panel .el-input__wrapper.is-focus),
:deep(.editor-state-panel .el-select__wrapper.is-focused) {
  border-color: rgba(201, 107, 31, 0.28);
  box-shadow: 0 0 0 3px rgba(201, 107, 31, 0.08);
}

:deep(.editor-state-panel .el-select__wrapper) {
  padding-right: 28px;
}

:deep(.editor-state-panel__color-select .el-select__wrapper) {
  padding-left: 14px;
}

:deep(.editor-state-panel__color-select .el-select__selected-item),
:deep(.editor-state-panel__color-select .el-select__selection-text) {
  display: inline-flex;
  align-items: center;
}

:deep(.editor-state-panel .el-textarea__inner) {
  min-height: 84px;
  border-radius: 12px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 251, 246, 0.88);
  box-shadow: none;
}

:deep(.editor-state-panel__select-popper.el-popper) {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.98);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.12);
}

:deep(.editor-state-panel__select-popper .el-select-dropdown__list) {
  padding: 8px;
}

:deep(.editor-state-panel__select-popper .el-select-dropdown__item) {
  min-height: 36px;
  border-radius: 12px;
  color: #3c2914;
}

:deep(.editor-state-panel__select-popper .el-select-dropdown__item.hover),
:deep(.editor-state-panel__select-popper .el-select-dropdown__item:hover) {
  background: rgba(154, 52, 18, 0.08);
}

:deep(.editor-state-panel__select-popper .el-select-dropdown__item.is-selected) {
  background: rgba(201, 107, 31, 0.1);
  color: #9a3412;
}
</style>
