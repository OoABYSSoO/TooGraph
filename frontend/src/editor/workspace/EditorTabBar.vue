<template>
  <header class="editor-tab-bar">
    <div class="editor-tab-bar__inner">
      <div class="editor-tab-bar__tabs-shell" @wheel.prevent="handleTabsWheel" @dragleave="handleTabsShellDragLeave">
        <div class="editor-tab-bar__tabs">
          <div
            v-for="tab in tabs"
            :key="tab.tabId"
            class="editor-tab-bar__tab-shell"
            :ref="(element) => setTabShellRef(tab.tabId, element)"
            :class="{
              'editor-tab-bar__tab-shell--active': tab.tabId === activeTabId,
              'editor-tab-bar__tab-shell--dragging': tab.tabId === draggedTabId,
              'editor-tab-bar__tab-shell--drop-before': tab.tabId === dropTargetTabId && dropPlacement === 'before',
              'editor-tab-bar__tab-shell--drop-after': tab.tabId === dropTargetTabId && dropPlacement === 'after',
            }"
            draggable="true"
            @auxclick="handleTabAuxClick(tab, $event)"
            @dragstart="handleTabDragStart(tab, $event)"
            @dragover.prevent="handleTabDragOver(tab, $event)"
            @drop.prevent="handleTabDrop(tab, $event)"
            @dragend="handleTabDragEnd"
          >
            <input
              v-if="editingTabId === tab.tabId"
              :ref="setTabNameInput"
              v-model="draftGraphName"
              class="editor-tab-bar__tab-name-input"
              :aria-label="`重命名 ${tab.title}`"
              @blur="commitGraphName"
              @keydown.enter.prevent="commitGraphName"
              @keydown.esc.prevent="cancelGraphNameEdit"
            />
            <button
              v-else
              type="button"
              class="editor-tab-bar__tab-activate"
              :title="buildEditorTabHint(tab, copy)"
              @click="$emit('activate-tab', tab.tabId)"
              @dblclick="startTabRename(tab)"
            >
              <span class="editor-tab-bar__tab-title">{{ tab.title }}</span>
            </button>
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
          </div>
        </div>
      </div>

      <div class="editor-tab-bar__controls">
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
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import WorkspaceSelect from "./WorkspaceSelect.vue";
import { buildWorkspaceSelectOptions } from "./workspaceSelectModel";
import {
  buildEditorTabHint,
  resolveEditorTabBarSelectPlaceholders,
  resolveEditorTabDropPlacement,
  ZH_EDITOR_TAB_BAR_COPY,
} from "./editorTabBarModel";

const props = defineProps<{
  tabs: EditorWorkspaceTab[];
  activeTabId: string | null;
  templates: TemplateRecord[];
  graphs: GraphDocument[];
  activeStateCount: number;
  isStatePanelOpen: boolean;
}>();

const emit = defineEmits<{
  (event: "activate-tab", tabId: string): void;
  (event: "close-tab", tabId: string): void;
  (event: "reorder-tab", sourceTabId: string, targetTabId: string, placement: "before" | "after"): void;
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
const editingTabId = ref<string | null>(null);
const draftGraphName = ref("");
const tabNameInput = ref<HTMLInputElement | null>(null);
const draggedTabId = ref<string | null>(null);
const dropTargetTabId = ref<string | null>(null);
const dropPlacement = ref<"before" | "after" | null>(null);
const revealTabId = ref<string | null>(null);
const copy = ZH_EDITOR_TAB_BAR_COPY;
const tabShellRefs = new Map<string, HTMLElement>();

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

watch(
  () => props.activeTabId,
  (nextTabId) => {
    if (!nextTabId || revealTabId.value) {
      return;
    }
    void scrollTabIntoView(nextTabId);
  },
);

watch(
  () => editingTabId.value,
  (nextTabId) => {
    if (!nextTabId) {
      return;
    }
    void scrollTabIntoView(nextTabId);
  },
);

watch(
  () => props.tabs.map((tab) => tab.tabId).join("|"),
  (nextSignature, previousSignature) => {
    if (!revealTabId.value || nextSignature === previousSignature) {
      return;
    }
    const nextRevealTabId = revealTabId.value;
    revealTabId.value = null;
    void scrollTabIntoView(nextRevealTabId);
  },
);

function setTabNameInput(element: Element | ComponentPublicInstance | null) {
  tabNameInput.value = element instanceof HTMLInputElement ? element : null;
}

function setTabShellRef(tabId: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) {
    tabShellRefs.set(tabId, element);
    return;
  }

  tabShellRefs.delete(tabId);
}

async function scrollTabIntoView(tabId: string) {
  await nextTick();
  tabShellRefs.get(tabId)?.scrollIntoView({
    block: "nearest",
    inline: "center",
    behavior: "smooth",
  });
}

async function startTabRename(tab: EditorWorkspaceTab) {
  emit("activate-tab", tab.tabId);
  editingTabId.value = tab.tabId;
  draftGraphName.value = tab.title;
  await nextTick();
  tabNameInput.value?.focus();
  tabNameInput.value?.select();
}

function commitGraphName() {
  const editingTab = props.tabs.find((tab) => tab.tabId === editingTabId.value) ?? null;
  const nextName = draftGraphName.value.trim();
  if (editingTab && nextName && nextName !== editingTab.title) {
    emit("rename-active-graph", nextName);
  }
  editingTabId.value = null;
}

function cancelGraphNameEdit() {
  const editingTab = props.tabs.find((tab) => tab.tabId === editingTabId.value) ?? null;
  draftGraphName.value = editingTab?.title ?? "";
  editingTabId.value = null;
}

function handleTabAuxClick(tab: EditorWorkspaceTab, event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (event.button !== 1 || target?.closest(".editor-tab-bar__close")) {
    return;
  }

  event.preventDefault();
  emit("close-tab", tab.tabId);
}

function handleTabDragStart(tab: EditorWorkspaceTab, event: DragEvent) {
  if (editingTabId.value === tab.tabId) {
    event.preventDefault();
    return;
  }

  draggedTabId.value = tab.tabId;
  dropTargetTabId.value = null;
  dropPlacement.value = null;
  event.dataTransfer?.setData("text/plain", tab.tabId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleTabDragOver(tab: EditorWorkspaceTab, event: DragEvent) {
  if (!draggedTabId.value || draggedTabId.value === tab.tabId) {
    dropTargetTabId.value = null;
    dropPlacement.value = null;
    return;
  }

  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) {
    return;
  }

  const rect = currentTarget.getBoundingClientRect();
  dropTargetTabId.value = tab.tabId;
  dropPlacement.value = resolveEditorTabDropPlacement(event.clientX, rect.left, rect.width);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleTabDrop(tab: EditorWorkspaceTab, event: DragEvent) {
  if (!draggedTabId.value || draggedTabId.value === tab.tabId) {
    handleTabDragEnd();
    return;
  }

  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) {
    handleTabDragEnd();
    return;
  }

  const rect = currentTarget.getBoundingClientRect();
  const placement = resolveEditorTabDropPlacement(event.clientX, rect.left, rect.width);
  revealTabId.value = draggedTabId.value;
  emit("reorder-tab", draggedTabId.value, tab.tabId, placement);
  handleTabDragEnd();
}

function handleTabDragEnd() {
  draggedTabId.value = null;
  dropTargetTabId.value = null;
  dropPlacement.value = null;
}

function handleTabsShellDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget;
  const relatedTarget = event.relatedTarget;
  if (!(currentTarget instanceof HTMLElement) || (relatedTarget instanceof Node && currentTarget.contains(relatedTarget))) {
    return;
  }

  dropTargetTabId.value = null;
  dropPlacement.value = null;
}

function handleTabsWheel(event: WheelEvent) {
  const currentTarget = event.currentTarget;
  if (!(currentTarget instanceof HTMLElement)) {
    return;
  }

  currentTarget.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
}
</script>

<style scoped>
.editor-tab-bar {
  --editor-tab-rail-band-size: 4px;
  --editor-tab-body-height: 36px;
  --editor-tab-min-width: 168px;
  --editor-tab-max-width: 232px;
  position: relative;
  border-bottom: 1px solid rgba(154, 52, 18, 0.14);
  background:
    radial-gradient(circle at top left, rgba(191, 78, 39, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 10px 24px rgba(154, 52, 18, 0.08);
}

.editor-tab-bar::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: rgba(154, 52, 18, 0.12);
}

.editor-tab-bar__inner {
  display: flex;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: flex-end;
  gap: 14px;
  padding: 8px 16px 0;
}

.editor-tab-bar__tabs-shell {
  min-width: 0;
  flex: 1;
  overflow-x: auto;
  padding: var(--editor-tab-rail-band-size) 0;
  border-top: 1px solid rgba(132, 101, 72, 0.22);
  border-bottom: 1px solid rgba(78, 52, 30, 0.34);
  background: linear-gradient(180deg, rgba(122, 88, 58, 0.98) 0%, rgba(106, 74, 46, 0.98) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 246, 230, 0.08),
    inset 0 -1px 0 rgba(61, 39, 20, 0.22);
  scrollbar-width: none;
}

.editor-tab-bar__tabs-shell::-webkit-scrollbar,
.editor-tab-bar__controls::-webkit-scrollbar {
  display: none;
}

.editor-tab-bar__tabs {
  display: flex;
  min-width: max-content;
  align-items: flex-end;
  gap: 0;
  padding: 0 12px 0 0;
  min-height: var(--editor-tab-body-height);
}

.editor-tab-bar__tab-shell {
  position: relative;
  isolation: isolate;
  box-sizing: border-box;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: var(--editor-tab-min-width);
  max-width: var(--editor-tab-max-width);
  height: var(--editor-tab-body-height);
  padding: 0 16px 0 18px;
  overflow: visible;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 242, 226, 0.86);
  box-shadow: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.editor-tab-bar__tab-shell:not(.editor-tab-bar__tab-shell--active)::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 1px;
  height: 18px;
  background: rgba(154, 52, 18, 0.18);
  transform: translateY(-50%);
}

.editor-tab-bar__tab-shell:first-child:not(.editor-tab-bar__tab-shell--active)::before {
  content: none;
}

.editor-tab-bar__tab-shell:hover {
  color: rgba(37, 24, 14, 0.92);
}

.editor-tab-bar__tab-shell:not(.editor-tab-bar__tab-shell--active):hover {
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(240, 225, 206, 0.88) 0%, rgba(228, 206, 180, 0.84) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 250, 241, 0.56),
    0 2px 8px rgba(154, 52, 18, 0.05);
}

.editor-tab-bar__tab-shell:not(.editor-tab-bar__tab-shell--active):hover::before {
  opacity: 0;
}

.editor-tab-bar__tab-shell:hover + .editor-tab-bar__tab-shell::before {
  opacity: 0;
}

.editor-tab-bar__tab-shell--active + .editor-tab-bar__tab-shell::before {
  opacity: 0;
}

.editor-tab-bar__tab-shell--active {
  z-index: 2;
  height: var(--editor-tab-body-height);
  min-width: var(--editor-tab-min-width);
  margin: 0 8px 0 10px;
  padding: 0 16px 0 18px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-bottom: none;
  border-radius: 14px 14px 0 0;
  background: linear-gradient(180deg, rgba(255, 252, 247, 1) 0%, rgba(248, 237, 219, 0.99) 100%);
  color: #2d1f12;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 8px 18px rgba(154, 52, 18, 0.1);
}

.editor-tab-bar__tab-shell--active::before,
.editor-tab-bar__tab-shell--active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}

.editor-tab-bar__tab-shell--active::before {
  z-index: -1;
  left: -1px;
  right: -1px;
  bottom: calc(-1 * var(--editor-tab-rail-band-size));
  height: var(--editor-tab-rail-band-size);
  background: rgba(248, 237, 219, 0.99);
}

.editor-tab-bar__tab-shell--active::after {
  left: -14px;
  right: -14px;
  bottom: calc(-1 * var(--editor-tab-rail-band-size));
  height: 12px;
  background:
    radial-gradient(circle at left top, transparent 10px, rgba(248, 237, 219, 0.99) 10.5px) left top / 14px 12px no-repeat,
    radial-gradient(circle at right top, transparent 10px, rgba(248, 237, 219, 0.99) 10.5px) right top / 14px 12px no-repeat;
  pointer-events: none;
}

.editor-tab-bar__tab-shell--active:hover {
  transform: none;
}

.editor-tab-bar__tab-shell--dragging {
  opacity: 0.78;
  transform: scale(0.98);
}

.editor-tab-bar__tab-shell--drop-before {
  box-shadow: inset 3px 0 0 rgba(191, 78, 39, 0.96);
}

.editor-tab-bar__tab-shell--drop-after {
  box-shadow: inset -3px 0 0 rgba(191, 78, 39, 0.96);
}

.editor-tab-bar__tab-activate {
  display: inline-flex;
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
  align-items: center;
  border: none;
  background: transparent;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.editor-tab-bar__tab-name-input {
  min-width: 180px;
  width: 100%;
  position: relative;
  z-index: 1;
  border: 1px solid rgba(191, 78, 39, 0.28);
  border-radius: 12px;
  background: rgba(255, 252, 247, 0.98);
  padding: 5px 10px;
  color: inherit;
  font: inherit;
  outline: none;
  box-shadow: 0 0 0 3px rgba(191, 78, 39, 0.1);
}

.editor-tab-bar__tab-title {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.9rem;
  font-weight: 450;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-bar__tab-shell--active .editor-tab-bar__tab-title {
  font-weight: 500;
}

.editor-tab-bar__tab-status {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 22px;
  height: 22px;
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
  background: #c56b14;
  transform: translate(-50%, -50%);
  transition: opacity 150ms ease;
}

.editor-tab-bar__tab-shell:hover .editor-tab-bar__dirty-dot,
.editor-tab-bar__tab-shell--active .editor-tab-bar__dirty-dot {
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
  background: rgba(255, 252, 247, 0.22);
  color: rgba(88, 55, 30, 0.82);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.92);
  transition: opacity 150ms ease, transform 150ms ease, background-color 150ms ease;
}

.editor-tab-bar__tab-shell:hover .editor-tab-bar__close,
.editor-tab-bar__close--visible {
  opacity: 1;
  transform: scale(1);
}

.editor-tab-bar__close:hover {
  background: rgba(154, 52, 18, 0.12);
}

.editor-tab-bar__controls {
  display: flex;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding: 0 0 9px;
  scrollbar-width: none;
}

.editor-tab-bar__state-pill,
.editor-tab-bar__action {
  flex: 0 0 auto;
  min-height: 36px;
  border: 1px solid rgba(139, 120, 99, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  padding: 8px 13px;
  color: #3c2914;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 1px 0 rgba(255, 255, 255, 0.28);
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
  background: linear-gradient(180deg, rgba(191, 78, 39, 0.98) 0%, rgba(154, 52, 18, 0.98) 100%);
  color: rgba(255, 250, 241, 0.98);
  box-shadow: none;
}

.editor-tab-bar__action--primary:hover {
  background: linear-gradient(180deg, rgba(174, 65, 27, 0.98) 0%, rgba(141, 46, 14, 0.98) 100%);
}

@media (max-width: 1100px) {
  .editor-tab-bar__tab-name-input {
    min-width: 140px;
    width: 180px;
  }

  .editor-tab-bar__tab-shell {
    min-width: 146px;
    max-width: 190px;
  }
}
</style>
