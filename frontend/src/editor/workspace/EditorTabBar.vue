<template>
  <header class="editor-tab-bar">
    <div class="editor-tab-bar__inner">
      <div class="editor-tab-bar__strip">
        <div class="editor-tab-bar__tabs-shell" @wheel.prevent="handleTabsWheel" @dragleave="handleTabsShellDragLeave">
          <ElTabs
            class="editor-tab-bar__tabs"
            type="card"
            :model-value="activeTabId ?? undefined"
            @tab-change="handleTabChange"
          >
            <ElTabPane v-for="tab in tabs" :key="tab.tabId" :name="tab.tabId">
              <template #label>
                <div
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
                    @click.stop
                    @blur="commitGraphName"
                    @keydown.enter.prevent="commitGraphName"
                    @keydown.esc.prevent="cancelGraphNameEdit"
                  />

                  <div
                    v-else
                    class="editor-tab-bar__tab-activate"
                    :title="buildEditorTabHint(tab, copy)"
                    @dblclick.stop="startTabRename(tab)"
                  >
                    <span class="editor-tab-bar__tab-title">{{ tab.title }}</span>
                  </div>

                  <span class="editor-tab-bar__tab-status">
                    <span v-if="tab.dirty" class="editor-tab-bar__dirty-dot" />
                    <button
                      type="button"
                      class="editor-tab-bar__close"
                      :class="{ 'editor-tab-bar__close--visible': tab.tabId === activeTabId }"
                      aria-label="关闭标签页"
                      @mousedown.stop.prevent
                      @click.stop="$emit('close-tab', tab.tabId)"
                    >
                      ×
                    </button>
                  </span>
                </div>
              </template>
            </ElTabPane>
          </ElTabs>
        </div>

        <ElPopover trigger="click" placement="bottom-start" :width="352" popper-class="editor-tab-bar__launcher-popper">
          <template #reference>
            <button type="button" class="editor-tab-bar__add-tab" aria-label="新建或打开图">
              <ElIcon aria-hidden="true"><Plus /></ElIcon>
            </button>
          </template>

          <EditorTabLauncherPanel
            :template-options="templateOptions"
            :graph-options="graphOptions"
            :template-placeholder="selectPlaceholders.template"
            :graph-placeholder="selectPlaceholders.graph"
            @create-new="$emit('create-new')"
            @create-from-template="$emit('create-from-template', $event)"
            @open-graph="$emit('open-graph', $event)"
          />
        </ElPopover>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Plus } from "@element-plus/icons-vue";
import { ElIcon, ElPopover, ElTabPane, ElTabs } from "element-plus";
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import EditorTabLauncherPanel from "./EditorTabLauncherPanel.vue";
import {
  buildEditorTabHint,
  resolveEditorTabBarSelectPlaceholders,
  resolveEditorTabDropPlacement,
  ZH_EDITOR_TAB_BAR_COPY,
} from "./editorTabBarModel";
import { buildWorkspaceSelectOptions } from "./workspaceSelectModel";

const props = defineProps<{
  tabs: EditorWorkspaceTab[];
  activeTabId: string | null;
  templates: TemplateRecord[];
  graphs: GraphDocument[];
}>();

const emit = defineEmits<{
  (event: "activate-tab", tabId: string): void;
  (event: "close-tab", tabId: string): void;
  (event: "reorder-tab", sourceTabId: string, targetTabId: string, placement: "before" | "after"): void;
  (event: "create-new"): void;
  (event: "create-from-template", templateId: string): void;
  (event: "open-graph", graphId: string): void;
  (event: "rename-active-graph", name: string): void;
}>();

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

function handleTabChange(value: string | number) {
  if (typeof value === "string") {
    emit("activate-tab", value);
  }
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

  const scrollContainer = currentTarget.querySelector(".el-tabs__nav-wrap");
  if (!(scrollContainer instanceof HTMLElement)) {
    return;
  }

  scrollContainer.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
}
</script>

<style scoped>
.editor-tab-bar {
  --editor-tab-width: 176px;
  --editor-tab-height: 40px;
  --editor-tab-gap: 12px;
  --editor-tab-bar-paper: rgba(244, 237, 225, 0.98);
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  background: transparent;
  box-shadow: none;
}

.editor-tab-bar__inner {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 12px 12px 0;
}

.editor-tab-bar__strip {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.editor-tab-bar__tabs-shell {
  min-width: 0;
  max-width: 100%;
  flex: 1 1 auto;
}

.editor-tab-bar__add-tab {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(208, 177, 138, 0.88);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 250, 242, 0.98) 0%, rgba(245, 233, 212, 0.95) 100%);
  color: rgba(111, 52, 22, 0.94);
  cursor: pointer;
}

.editor-tab-bar__tabs {
  flex: 1 1 auto;
  min-width: 0;
}

.editor-tab-bar__tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__content) {
  display: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap),
.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap.is-scrollable) {
  overflow: auto;
  padding: 8px var(--editor-tab-gap);
  border: 1px solid rgba(208, 177, 138, 0.88);
  border-radius: 20px;
  background: rgba(236, 219, 190, 0.95);
  box-shadow:
    inset 0 1px 0 rgba(255, 252, 247, 0.58),
    0 1px 0 rgba(255, 255, 255, 0.2);
  scrollbar-width: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap::-webkit-scrollbar) {
  display: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap::after),
.editor-tab-bar__tabs :deep(.el-tabs__nav-prev),
.editor-tab-bar__tabs :deep(.el-tabs__nav-next) {
  display: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-scroll) {
  overflow: visible;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav) {
  display: flex;
  align-items: center;
  gap: var(--editor-tab-gap);
  border: none;
  padding: 0;
}

.editor-tab-bar__tabs :deep(.el-tabs__item) {
  box-sizing: border-box;
  display: block;
  width: var(--editor-tab-width);
  min-width: var(--editor-tab-width);
  max-width: var(--editor-tab-width);
  flex: 0 0 var(--editor-tab-width);
  height: auto;
  line-height: normal;
  padding: 0 !important;
  margin: 0 !important;
  border: none;
  background: transparent !important;
  color: inherit;
  overflow: visible;
}

.editor-tab-bar__tabs :deep(.el-tabs__item:nth-child(2)),
.editor-tab-bar__tabs :deep(.el-tabs__item:last-child) {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.editor-tab-bar__tabs :deep(.el-tabs__item:hover) {
  color: inherit;
}

.editor-tab-bar__tabs :deep(.el-tabs__item.is-active) {
  color: inherit;
}

.editor-tab-bar__tab-shell {
  position: relative;
  box-sizing: border-box;
  display: inline-grid;
  grid-template-columns: minmax(0, 1fr) 22px;
  width: var(--editor-tab-width);
  min-width: var(--editor-tab-width);
  max-width: var(--editor-tab-width);
  height: var(--editor-tab-height);
  align-items: center;
  gap: 10px;
  padding: 0 14px 0 16px;
  border: 1px solid rgba(208, 177, 138, 0.88);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(250, 242, 228, 0.98) 0%, rgba(245, 233, 212, 0.95) 100%);
  color: rgba(96, 63, 36, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 251, 244, 0.58),
    0 1px 0 rgba(92, 58, 28, 0.04);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease,
    opacity 160ms ease;
}

.editor-tab-bar__tab-shell:hover {
  background: linear-gradient(180deg, rgba(255, 248, 237, 0.99) 0%, rgba(249, 237, 218, 0.97) 100%);
  border-color: rgba(177, 105, 46, 0.22);
  color: rgba(104, 55, 24, 0.98);
  transform: none;
}

.editor-tab-bar__tab-shell--active {
  z-index: 1;
  border-color: rgba(154, 52, 18, 0.3);
  background: linear-gradient(180deg, rgba(255, 250, 242, 1) 0%, rgba(250, 236, 214, 1) 100%);
  color: rgba(111, 52, 22, 1);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 8px 18px rgba(154, 52, 18, 0.13),
    0 0 0 1px rgba(255, 242, 224, 0.55);
}

.editor-tab-bar__tab-shell--active:hover {
  transform: none;
}

.editor-tab-bar__tab-shell--dragging {
  opacity: 0.78;
  transform: scale(0.98);
}

.editor-tab-bar__tab-shell--drop-before {
  box-shadow:
    inset 3px 0 0 rgba(154, 52, 18, 0.72),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.editor-tab-bar__tab-shell--drop-after {
  box-shadow:
    inset -3px 0 0 rgba(154, 52, 18, 0.72),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.editor-tab-bar__tab-activate {
  display: inline-flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  cursor: pointer;
}

.editor-tab-bar__tab-name-input {
  min-width: 0;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 10px;
  background: rgba(255, 250, 241, 0.98);
  padding: 5px 10px;
  color: inherit;
  font: inherit;
  outline: none;
  box-shadow: 0 0 0 3px rgba(246, 211, 184, 0.35);
}

.editor-tab-bar__tab-title {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.88rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-bar__tab-shell--active .editor-tab-bar__tab-title {
  font-weight: 600;
}

.editor-tab-bar__tab-status {
  position: relative;
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
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
  background: #9a3412;
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
  background: rgba(246, 211, 184, 0.34);
  color: rgba(124, 45, 18, 0.76);
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
  background: rgba(246, 211, 184, 0.56);
}

@media (max-width: 1100px) {
  .editor-tab-bar {
    --editor-tab-width: 156px;
  }
}

@media (max-width: 920px) {
  .editor-tab-bar__strip {
    gap: 8px;
  }
}

@media (max-width: 640px) {
  .editor-tab-bar {
    --editor-tab-width: 132px;
    --editor-tab-height: 36px;
    --editor-tab-gap: 8px;
  }

  .editor-tab-bar__strip {
    gap: 6px;
  }
}
</style>
