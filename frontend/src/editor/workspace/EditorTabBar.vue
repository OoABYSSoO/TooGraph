<template>
  <header class="editor-tab-bar">
    <div class="editor-tab-bar__inner">
      <div class="editor-tab-bar__tabs-shell">
        <div class="editor-tab-bar__tabs">
          <button
            v-for="tab in tabs"
            :key="tab.tabId"
            type="button"
            class="editor-tab-bar__tab"
            :class="{ 'editor-tab-bar__tab--active': tab.tabId === activeTabId }"
            :title="buildEditorTabHint(tab, copy)"
            @click="$emit('activate-tab', tab.tabId)"
          >
            <span class="editor-tab-bar__tab-title">{{ tab.title }}</span>
            <span class="editor-tab-bar__tab-status">
              <span v-if="tab.dirty" class="editor-tab-bar__dirty-dot" />
              <button
                type="button"
                class="editor-tab-bar__close"
                :class="{ 'editor-tab-bar__close--visible': tab.tabId === activeTabId }"
                aria-label="关闭标签页"
                @click.stop="$emit('close-tab', tab.tabId)"
              >
                ×
              </button>
            </span>
          </button>
        </div>
      </div>

      <div class="editor-tab-bar__controls">
        <input
          v-if="isEditingGraphName"
          ref="graphNameInput"
          v-model="draftGraphName"
          class="editor-tab-bar__name-input"
          @blur="commitGraphName"
          @keydown.enter.prevent="commitGraphName"
          @keydown.esc.prevent="cancelGraphNameEdit"
        />
        <button v-else type="button" class="editor-tab-bar__graph-name" :title="activeGraphName" @dblclick="startGraphNameEdit">
          <span class="editor-tab-bar__graph-name-label">{{ activeGraphName }}</span>
        </button>

        <button
          type="button"
          class="editor-tab-bar__state-pill"
          :class="{ 'editor-tab-bar__state-pill--active': isStatePanelOpen }"
          @click="$emit('toggle-state-panel')"
        >
          <span>{{ copy.state }}</span>
          <span class="editor-tab-bar__state-count">{{ activeStateCount }}</span>
        </button>

        <button type="button" class="editor-tab-bar__action" @click="$emit('create-new')">{{ copy.newGraph }}</button>

        <WorkspaceSelect
          v-model="selectedTemplateId"
          :options="templateOptions"
          :placeholder="selectPlaceholders.template"
          min-width-class-name="editor-tab-bar__select"
        />

        <WorkspaceSelect
          v-model="selectedGraphId"
          :options="graphOptions"
          :placeholder="selectPlaceholders.graph"
          min-width-class-name="editor-tab-bar__select editor-tab-bar__select--wide"
        />

        <button type="button" class="editor-tab-bar__action" @click="$emit('save-active-graph')">{{ copy.save }}</button>
        <button type="button" class="editor-tab-bar__action" @click="$emit('validate-active-graph')">{{ copy.validate }}</button>
        <button type="button" class="editor-tab-bar__action editor-tab-bar__action--primary" @click="$emit('run-active-graph')">
          {{ copy.run }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import WorkspaceSelect from "./WorkspaceSelect.vue";
import { buildWorkspaceSelectOptions } from "./workspaceSelectModel";
import { buildEditorTabHint, resolveEditorTabBarSelectPlaceholders, ZH_EDITOR_TAB_BAR_COPY } from "./editorTabBarModel";

const props = defineProps<{
  tabs: EditorWorkspaceTab[];
  activeTabId: string | null;
  templates: TemplateRecord[];
  graphs: GraphDocument[];
  activeGraphName: string;
  activeStateCount: number;
  isStatePanelOpen: boolean;
}>();

const emit = defineEmits<{
  (event: "activate-tab", tabId: string): void;
  (event: "close-tab", tabId: string): void;
  (event: "create-new"): void;
  (event: "create-from-template", templateId: string): void;
  (event: "open-graph", graphId: string): void;
  (event: "rename-active-graph", name: string): void;
  (event: "toggle-state-panel"): void;
  (event: "save-active-graph"): void;
  (event: "validate-active-graph"): void;
  (event: "run-active-graph"): void;
}>();

const selectedTemplateId = ref("");
const selectedGraphId = ref("");
const isEditingGraphName = ref(false);
const draftGraphName = ref(props.activeGraphName);
const graphNameInput = ref<HTMLInputElement | null>(null);
const copy = ZH_EDITOR_TAB_BAR_COPY;

const templateOptions = computed(() =>
  buildWorkspaceSelectOptions(
    props.templates.map((template) => ({
      value: template.template_id,
      label: template.label,
    })),
  ),
);

const graphOptions = computed(() =>
  buildWorkspaceSelectOptions(
    props.graphs.map((graph) => ({
      value: graph.graph_id,
      label: graph.name,
    })),
  ),
);

const selectPlaceholders = computed(() =>
  resolveEditorTabBarSelectPlaceholders({
    templateCount: templateOptions.value.length,
    graphCount: graphOptions.value.length,
    copy,
  }),
);

watch(
  () => props.activeGraphName,
  (nextName) => {
    if (!isEditingGraphName.value) {
      draftGraphName.value = nextName;
    }
  },
);

watch(selectedTemplateId, (nextValue) => {
  if (!nextValue) {
    return;
  }
  emit("create-from-template", nextValue);
  selectedTemplateId.value = "";
});

watch(selectedGraphId, (nextValue) => {
  if (!nextValue) {
    return;
  }
  emit("open-graph", nextValue);
  selectedGraphId.value = "";
});

async function startGraphNameEdit() {
  isEditingGraphName.value = true;
  await nextTick();
  graphNameInput.value?.focus();
  graphNameInput.value?.select();
}

function commitGraphName() {
  const nextName = draftGraphName.value.trim();
  if (nextName && nextName !== props.activeGraphName) {
    emit("rename-active-graph", nextName);
  }
  isEditingGraphName.value = false;
}

function cancelGraphNameEdit() {
  draftGraphName.value = props.activeGraphName;
  isEditingGraphName.value = false;
}
</script>

<style scoped>
.editor-tab-bar {
  border-bottom: 1px solid rgba(154, 52, 18, 0.14);
  background: rgba(255, 250, 241, 0.9);
  box-shadow: 0 10px 24px rgba(154, 52, 18, 0.05);
}

.editor-tab-bar__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
}

.editor-tab-bar__tabs-shell {
  min-width: 0;
  flex: 1;
  overflow-x: auto;
}

.editor-tab-bar__tabs {
  display: flex;
  min-width: max-content;
  align-items: center;
  gap: 6px;
}

.editor-tab-bar__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 0 14px;
  background: rgba(255, 250, 241, 0.64);
  color: #3c2914;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}

.editor-tab-bar__tab:hover {
  background: rgba(255, 255, 255, 0.84);
}

.editor-tab-bar__tab--active {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 18px rgba(154, 52, 18, 0.08);
}

.editor-tab-bar__tab-title {
  max-width: 220px;
  overflow: hidden;
  color: #3c2914;
  font-size: 0.92rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-bar__tab-status {
  position: relative;
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.editor-tab-bar__dirty-dot {
  pointer-events: none;
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(154, 52, 18);
  transform: translate(-50%, -50%);
  transition: opacity 150ms ease;
}

.editor-tab-bar__tab:hover .editor-tab-bar__dirty-dot,
.editor-tab-bar__tab--active .editor-tab-bar__dirty-dot {
  opacity: 0;
}

.editor-tab-bar__close {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: rgb(154, 52, 18);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.92);
  transition: opacity 150ms ease, transform 150ms ease, background-color 150ms ease;
}

.editor-tab-bar__tab:hover .editor-tab-bar__close,
.editor-tab-bar__close--visible {
  opacity: 1;
  transform: scale(1);
}

.editor-tab-bar__close:hover {
  background: rgba(154, 52, 18, 0.08);
}

.editor-tab-bar__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.editor-tab-bar__graph-name,
.editor-tab-bar__name-input,
.editor-tab-bar__state-pill,
.editor-tab-bar__action {
  min-height: 38px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  padding: 8px 14px;
  color: #3c2914;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.editor-tab-bar__graph-name,
.editor-tab-bar__name-input {
  min-width: 220px;
  text-align: left;
}

.editor-tab-bar__graph-name {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}

.editor-tab-bar__graph-name:hover {
  border-color: rgba(154, 52, 18, 0.2);
}

.editor-tab-bar__graph-name-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-bar__name-input {
  outline: none;
}

.editor-tab-bar__state-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.editor-tab-bar__state-pill:hover {
  background: white;
}

.editor-tab-bar__state-pill--active {
  border-color: rgba(217, 119, 6, 0.26);
  background: rgba(255, 244, 240, 0.94);
  color: rgba(154, 52, 18, 0.94);
}

.editor-tab-bar__state-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 2px 8px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 250, 241, 0.92);
  color: rgba(60, 41, 20, 0.72);
  font-size: 0.68rem;
}

.editor-tab-bar__select {
  min-width: 180px;
}

.editor-tab-bar__select--wide {
  min-width: 200px;
}

.editor-tab-bar__action {
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.editor-tab-bar__action:hover {
  background: white;
}

.editor-tab-bar__action--primary {
  border-color: rgba(154, 52, 18, 0.92);
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 241, 0.96);
  box-shadow: none;
}

.editor-tab-bar__action--primary:hover {
  background: rgba(131, 43, 14, 0.96);
}

@media (max-width: 1100px) {
  .editor-tab-bar__graph-name,
  .editor-tab-bar__name-input {
    min-width: 180px;
  }
}
</style>
