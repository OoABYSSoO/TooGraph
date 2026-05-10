<template>
  <header class="editor-tab-bar">
    <div class="editor-tab-bar__inner">
      <div class="editor-tab-bar__strip">
        <div
          ref="tabsShell"
          class="editor-tab-bar__tabs-shell"
          @wheel="handleTabsWheel"
          @dragleave="handleTabsShellDragLeave"
        >
          <div ref="tabsScroller" class="editor-tab-bar__tabs-scroller">
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
                      'editor-tab-bar__tab-shell--subgraph': tab.kind === 'subgraph',
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
                      :aria-label="t('tab.rename', { title: tab.title })"
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
                      <span v-if="tab.kind === 'subgraph'" class="editor-tab-bar__tab-kind">SUB</span>
                      <span class="editor-tab-bar__tab-title">{{ tab.title }}</span>
                    </div>

                    <span class="editor-tab-bar__tab-status">
                      <span v-if="tab.dirty" class="editor-tab-bar__dirty-dot" />
                      <button
                        type="button"
                        class="editor-tab-bar__close"
                        :aria-label="t('tab.close')"
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
        </div>

        <ElPopover
          v-model:visible="launcherPopoverOpen"
          trigger="click"
          placement="bottom-start"
          :width="352"
          popper-class="editor-tab-bar__launcher-popper"
        >
          <template #reference>
            <button type="button" class="editor-tab-bar__add-tab" :aria-label="t('tab.add')">
              <ElIcon aria-hidden="true"><Plus /></ElIcon>
            </button>
          </template>

          <EditorTabLauncherPanel
            :open="launcherPopoverOpen"
            :template-options="templateOptions"
            :graph-options="graphOptions"
            :template-placeholder="selectPlaceholders.template"
            :graph-placeholder="selectPlaceholders.graph"
            @create-new="handleLauncherCreateNew"
            @create-from-template="handleLauncherCreateFromTemplate"
            @open-graph="handleLauncherOpenGraph"
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
import { useI18n } from "vue-i18n";

import type { EditorWorkspaceTab } from "@/lib/editor-workspace";
import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import EditorTabLauncherPanel from "./EditorTabLauncherPanel.vue";
import {
  buildEditorTabHint,
  buildEditorTabBarCopy,
  resolveEditorTabBarSelectPlaceholders,
  resolveEditorTabDropPlacement,
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
const tabsShell = ref<HTMLElement | null>(null);
const tabsScroller = ref<HTMLElement | null>(null);
const launcherPopoverOpen = ref(false);
const draggedTabId = ref<string | null>(null);
const dropTargetTabId = ref<string | null>(null);
const dropPlacement = ref<"before" | "after" | null>(null);
const revealTabId = ref<string | null>(null);
const { t, locale } = useI18n();
const copy = computed(() => {
  locale.value;
  return buildEditorTabBarCopy();
});
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
    copy: copy.value,
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

function handleLauncherCreateNew() {
  launcherPopoverOpen.value = false;
  emit("create-new");
}

function handleLauncherCreateFromTemplate(templateId: string) {
  launcherPopoverOpen.value = false;
  emit("create-from-template", templateId);
}

function handleLauncherOpenGraph(graphId: string) {
  launcherPopoverOpen.value = false;
  emit("open-graph", graphId);
}

async function startTabRename(tab: EditorWorkspaceTab) {
  emit("activate-tab", tab.tabId);
  editingTabId.value = tab.tabId;
  draftGraphName.value = tab.kind === "subgraph" ? tab.subgraphSource?.nodeName ?? tab.title : tab.title;
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

  const scrollContainer = resolveTabsScrollContainer(currentTarget);
  if (!scrollContainer) {
    return;
  }

  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) {
    return;
  }

  const nextScrollLeft = clampTabsScrollLeft(scrollContainer.scrollLeft + delta, scrollContainer);
  if (Math.abs(nextScrollLeft - scrollContainer.scrollLeft) < 1) {
    return;
  }

  event.preventDefault();
  scrollContainer.scrollLeft = nextScrollLeft;
}

function resolveTabsScrollContainer(root: HTMLElement | null) {
  const scrollContainer = root?.querySelector(".editor-tab-bar__tabs-scroller") ?? tabsScroller.value;
  return scrollContainer instanceof HTMLElement ? scrollContainer : null;
}

function clampTabsScrollLeft(value: number, scrollContainer: HTMLElement) {
  return Math.min(Math.max(value, 0), resolveTabsMaxScrollLeft(scrollContainer));
}

function resolveTabsMaxScrollLeft(scrollContainer: HTMLElement) {
  return Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
}
</script>

<style scoped>
.editor-tab-bar {
  --editor-tab-strip-max-width: 100%;
  --editor-tab-width: 176px;
  --editor-tab-height: 40px;
  --editor-tab-gap: 12px;
  --editor-tab-bar-paper: var(--toograph-glass-bg);
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
}

.editor-tab-bar__inner {
  box-sizing: border-box;
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 12px 0 0 12px;
}

.editor-tab-bar__strip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.editor-tab-bar__tabs-shell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: auto;
  max-width: var(--editor-tab-strip-max-width);
  flex: 1 1 auto;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 20px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--editor-tab-bar-paper);
  background-blend-mode: screen, screen, normal;
  padding: 8px;
  box-shadow:
    var(--toograph-glass-shadow),
    var(--toograph-glass-highlight),
    var(--toograph-glass-rim);
  backdrop-filter: blur(28px) saturate(1.65) contrast(1.02);
}

.editor-tab-bar__tabs-scroller {
  flex: 1 1 auto;
  min-width: 0;
  margin: -6px 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 6px 0;
  scrollbar-color: rgba(154, 52, 18, 0.28) transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.editor-tab-bar__tabs-scroller::-webkit-scrollbar {
  height: 8px;
}

.editor-tab-bar__tabs-scroller::-webkit-scrollbar-track {
  background: transparent;
}

.editor-tab-bar__tabs-scroller::-webkit-scrollbar-thumb {
  border: 2px solid rgba(236, 219, 190, 0.95);
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.28);
}

.editor-tab-bar__add-tab {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 14px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  color: rgba(111, 52, 22, 0.94);
  box-shadow: var(--toograph-glass-highlight), var(--toograph-glass-rim);
  backdrop-filter: blur(24px) saturate(1.55) contrast(1.02);
  cursor: pointer;
}

:global(.editor-tab-bar__launcher-popper.el-popper) {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:global(.editor-tab-bar__launcher-popper .el-popper__arrow) {
  display: none;
}

.editor-tab-bar__tabs {
  width: max-content;
  min-width: 100%;
  max-width: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: none;
  width: max-content;
  min-width: 100%;
  max-width: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__content) {
  display: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap),
.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap.is-scrollable) {
  width: max-content;
  max-width: none;
  overflow: visible;
  padding: 10px var(--editor-tab-gap);
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-wrap::after),
.editor-tab-bar__tabs :deep(.el-tabs__nav-prev),
.editor-tab-bar__tabs :deep(.el-tabs__nav-next) {
  display: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav-scroll) {
  overflow: visible;
  width: max-content;
  max-width: none;
}

.editor-tab-bar__tabs :deep(.el-tabs__nav) {
  display: flex;
  align-items: center;
  gap: var(--editor-tab-gap);
  width: max-content;
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
  border: 1px solid rgba(213, 184, 146, 0.62);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.28);
  color: rgba(88, 61, 39, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 251, 244, 0.48),
    0 1px 1px rgba(92, 58, 28, 0.03);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease,
    opacity 160ms ease;
}

.editor-tab-bar__tab-shell:hover {
  background: rgba(255, 255, 255, 0.38);
  border-color: rgba(177, 105, 46, 0.32);
  color: rgba(104, 55, 24, 0.98);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.66),
    0 4px 10px rgba(92, 58, 28, 0.08);
  transform: none;
}

.editor-tab-bar__tab-shell--active {
  z-index: 2;
  border-color: rgba(154, 52, 18, 0.52);
  background: rgba(255, 255, 255, 0.5);
  color: rgba(111, 52, 22, 1);
  box-shadow:
    inset 0 3px 0 rgba(154, 52, 18, 0.72),
    inset 0 1px 0 rgba(255, 255, 255, 0.94),
    inset 0 -1px 0 rgba(154, 52, 18, 0.06),
    inset 0 0 0 1px rgba(154, 52, 18, 0.12);
  transform: none;
}

.editor-tab-bar__tab-shell--active:hover {
  transform: none;
}

.editor-tab-bar__tab-shell--subgraph {
  border-color: rgba(13, 148, 136, 0.32);
  background: rgba(240, 253, 250, 0.38);
  color: rgba(15, 118, 110, 0.96);
}

.editor-tab-bar__tab-shell--subgraph.editor-tab-bar__tab-shell--active {
  border-color: rgba(13, 148, 136, 0.48);
  color: rgba(15, 118, 110, 1);
  box-shadow:
    inset 0 3px 0 rgba(13, 148, 136, 0.58),
    inset 0 1px 0 rgba(255, 255, 255, 0.94),
    inset 0 -1px 0 rgba(13, 148, 136, 0.08),
    inset 0 0 0 1px rgba(13, 148, 136, 0.12);
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
  gap: 6px;
  cursor: pointer;
}

.editor-tab-bar__tab-kind {
  flex: 0 0 auto;
  border: 1px solid rgba(13, 148, 136, 0.24);
  border-radius: 999px;
  padding: 2px 5px;
  background: rgba(240, 253, 250, 0.78);
  color: rgba(15, 118, 110, 0.9);
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0;
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
  font-weight: 700;
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
.editor-tab-bar__tab-shell:focus-within .editor-tab-bar__dirty-dot {
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
  pointer-events: none;
  transform: scale(0.92);
  transition: opacity 150ms ease, transform 150ms ease, background-color 150ms ease, color 150ms ease;
}

.editor-tab-bar__tab-shell:hover .editor-tab-bar__close,
.editor-tab-bar__tab-shell:focus-within .editor-tab-bar__close {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}

.editor-tab-bar__close:hover {
  background: rgba(246, 211, 184, 0.56);
  color: rgba(124, 45, 18, 0.96);
}

@media (max-width: 1100px) {
  .editor-tab-bar {
    --editor-tab-width: 156px;
  }
}

@media (max-width: 920px) {
  .editor-tab-bar {
    max-width: 100%;
  }

  .editor-tab-bar__inner {
    padding: 0;
  }

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
