<template>
  <div class="editor-tab-launcher-panel">
    <template v-if="activeView === 'root'">
      <div class="editor-tab-launcher-panel__header">
        <div class="editor-tab-launcher-panel__eyebrow">新建图</div>
        <div class="editor-tab-launcher-panel__hint">选择一个入口开始编辑</div>
      </div>

      <button type="button" class="editor-tab-launcher-panel__entry" @click="$emit('create-new')">
        <span class="editor-tab-launcher-panel__entry-icon" aria-hidden="true">
          <ElIcon><DocumentAdd /></ElIcon>
        </span>
        <div class="editor-tab-launcher-panel__entry-copy">
          <div class="editor-tab-launcher-panel__entry-title">新建空白图</div>
          <div class="editor-tab-launcher-panel__entry-meta">从空白工作流开始</div>
        </div>
        <ElIcon class="editor-tab-launcher-panel__entry-arrow" aria-hidden="true"><ArrowRight /></ElIcon>
      </button>

      <button type="button" class="editor-tab-launcher-panel__entry" @click="openSecondaryView('template')">
        <span class="editor-tab-launcher-panel__entry-icon" aria-hidden="true">
          <ElIcon><CollectionTag /></ElIcon>
        </span>
        <div class="editor-tab-launcher-panel__entry-copy">
          <div class="editor-tab-launcher-panel__entry-title">从模板新建</div>
          <div class="editor-tab-launcher-panel__entry-meta">选择预设模板作为起点</div>
        </div>
        <ElIcon class="editor-tab-launcher-panel__entry-arrow" aria-hidden="true"><ArrowRight /></ElIcon>
      </button>

      <button type="button" class="editor-tab-launcher-panel__entry" @click="openSecondaryView('graph')">
        <span class="editor-tab-launcher-panel__entry-icon" aria-hidden="true">
          <ElIcon><FolderOpened /></ElIcon>
        </span>
        <div class="editor-tab-launcher-panel__entry-copy">
          <div class="editor-tab-launcher-panel__entry-title">打开已有图</div>
          <div class="editor-tab-launcher-panel__entry-meta">继续编辑已保存工作流</div>
        </div>
        <ElIcon class="editor-tab-launcher-panel__entry-arrow" aria-hidden="true"><ArrowRight /></ElIcon>
      </button>
    </template>

    <template v-else>
      <div class="editor-tab-launcher-panel__secondary-header">
        <button type="button" class="editor-tab-launcher-panel__back" @click="returnToRoot">
          <ElIcon aria-hidden="true"><ArrowLeft /></ElIcon>
          <span>返回</span>
        </button>
        <div>
          <div class="editor-tab-launcher-panel__eyebrow">{{ activeTitle }}</div>
          <div class="editor-tab-launcher-panel__hint">{{ activeHint }}</div>
        </div>
      </div>

      <div class="editor-tab-launcher-panel__option-list" role="listbox" :aria-label="activeTitle">
        <button
          v-for="option in activePageItems"
          :key="option.value"
          type="button"
          class="editor-tab-launcher-panel__option"
          @click="selectActiveOption(option.value)"
        >
          <span class="editor-tab-launcher-panel__option-label">{{ option.label }}</span>
          <span class="editor-tab-launcher-panel__option-meta">{{ option.value }}</span>
        </button>
        <div v-if="activeOptions.length === 0" class="editor-tab-launcher-panel__empty">
          {{ activePlaceholder }}
        </div>
      </div>

      <div v-if="activePageModel.hasPagination" class="editor-tab-launcher-panel__pager">
        <button type="button" :disabled="activePageModel.page === 0" @click="goToPreviousPage">上一页</button>
        <span>{{ activePageModel.page + 1 }} / {{ activePageModel.pageCount }}</span>
        <button type="button" :disabled="activePageModel.page >= activePageModel.pageCount - 1" @click="goToNextPage">下一页</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, CollectionTag, DocumentAdd, FolderOpened } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { computed, ref, watch } from "vue";

import { paginateWorkspaceOptions, type WorkspaceSelectOption } from "./workspaceSelectModel";

const props = defineProps<{
  open: boolean;
  templateOptions: WorkspaceSelectOption[];
  graphOptions: WorkspaceSelectOption[];
  templatePlaceholder: string;
  graphPlaceholder: string;
}>();

const emit = defineEmits<{
  (event: "create-new"): void;
  (event: "create-from-template", templateId: string): void;
  (event: "open-graph", graphId: string): void;
}>();

const activeView = ref<"root" | "template" | "graph">("root");
const activePage = ref(0);
const optionPageSize = 5;

const activeOptions = computed(() => (activeView.value === "template" ? props.templateOptions : props.graphOptions));
const activePageModel = computed(() => paginateWorkspaceOptions(activeOptions.value, activePage.value, optionPageSize));
const activePageItems = computed(() => activePageModel.value.items);
const activeTitle = computed(() => (activeView.value === "template" ? "从模板新建" : "打开已有图"));
const activeHint = computed(() => (activeOptions.value.length > 0 ? `${activeOptions.value.length} 个可选项` : activePlaceholder.value));
const activePlaceholder = computed(() => (activeView.value === "template" ? props.templatePlaceholder : props.graphPlaceholder));

watch(
  () => props.open,
  (nextOpen) => {
    if (!nextOpen) {
      returnToRoot();
    }
  },
);

function openSecondaryView(view: "template" | "graph") {
  activeView.value = view;
  activePage.value = 0;
}

function returnToRoot() {
  activeView.value = "root";
  activePage.value = 0;
}

function goToPreviousPage() {
  activePage.value = Math.max(0, activePageModel.value.page - 1);
}

function goToNextPage() {
  activePage.value = Math.min(activePageModel.value.pageCount - 1, activePageModel.value.page + 1);
}

function selectActiveOption(optionId: string) {
  if (activeView.value === "template") {
    emit("create-from-template", optionId);
  }
  if (activeView.value === "graph") {
    emit("open-graph", optionId);
  }
  returnToRoot();
}
</script>

<style scoped>
.editor-tab-launcher-panel {
  box-sizing: border-box;
  width: min(336px, calc(100vw - 32px));
  overflow: hidden;
  isolation: isolate;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 22px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow:
    var(--graphite-glass-shadow),
    var(--graphite-glass-highlight),
    var(--graphite-glass-rim);
  backdrop-filter: blur(26px) saturate(1.55) contrast(1.01);
  padding: 8px;
  display: grid;
  gap: 8px;
}

.editor-tab-launcher-panel__header,
.editor-tab-launcher-panel__secondary-header {
  display: grid;
  gap: 2px;
  padding: 4px 8px 2px;
}

.editor-tab-launcher-panel__secondary-header {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.editor-tab-launcher-panel__eyebrow {
  color: rgba(124, 45, 18, 0.96);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.editor-tab-launcher-panel__hint {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.78rem;
}

.editor-tab-launcher-panel__entry {
  box-sizing: border-box;
  width: 100%;
  min-height: 68px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(213, 184, 146, 0.5);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    0 1px 1px rgba(92, 58, 28, 0.03);
  padding: 10px;
  color: rgba(72, 48, 29, 0.92);
  text-align: left;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.editor-tab-launcher-panel__entry:hover {
  border-color: rgba(177, 105, 46, 0.36);
  background: rgba(255, 255, 255, 0.48);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 6px 16px rgba(92, 58, 28, 0.055);
  color: rgba(104, 55, 24, 0.98);
  transform: translateY(-1px);
}

.editor-tab-launcher-panel__entry:active {
  transform: translateY(0) scale(0.99);
}

.editor-tab-launcher-panel__entry:focus-visible,
.editor-tab-launcher-panel__back:focus-visible,
.editor-tab-launcher-panel__pager button:focus-visible {
  outline: none;
  border-color: rgba(154, 52, 18, 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 0 0 3px rgba(201, 107, 31, 0.14);
}

.editor-tab-launcher-panel__entry-icon,
.editor-tab-launcher-panel__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(213, 184, 146, 0.52);
  background: rgba(255, 255, 255, 0.48);
  color: rgba(154, 52, 18, 0.92);
  box-shadow: var(--graphite-glass-highlight);
}

.editor-tab-launcher-panel__entry-icon {
  width: 40px;
  height: 40px;
  border-radius: 14px;
}

.editor-tab-launcher-panel__back {
  gap: 4px;
  min-height: 34px;
  border-radius: 999px;
  padding: 0 10px;
  cursor: pointer;
}

.editor-tab-launcher-panel__entry-arrow {
  justify-self: end;
  color: rgba(124, 45, 18, 0.46);
  transition: color 160ms ease, transform 160ms ease;
}

.editor-tab-launcher-panel__entry:hover .editor-tab-launcher-panel__entry-arrow {
  color: rgba(124, 45, 18, 0.76);
  transform: translateX(2px);
}

.editor-tab-launcher-panel__option-list {
  max-height: min(260px, 42vh);
  display: grid;
  gap: 6px;
  overflow-y: auto;
  padding: 2px 4px;
  scrollbar-color: rgba(154, 52, 18, 0.28) transparent;
  scrollbar-width: thin;
}

.editor-tab-launcher-panel__option-list::-webkit-scrollbar {
  width: 8px;
}

.editor-tab-launcher-panel__option-list::-webkit-scrollbar-track {
  background: transparent;
}

.editor-tab-launcher-panel__option-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.28);
  background-clip: content-box;
}

.editor-tab-launcher-panel__option {
  display: grid;
  gap: 2px;
  width: 100%;
  border: 1px solid rgba(213, 184, 146, 0.42);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.28);
  padding: 9px 11px;
  color: rgba(72, 48, 29, 0.9);
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease;
}

.editor-tab-launcher-panel__option:hover,
.editor-tab-launcher-panel__option:focus-visible {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(255, 255, 255, 0.48);
  color: rgba(111, 52, 22, 1);
  outline: none;
  transform: translateX(2px);
}

.editor-tab-launcher-panel__option:active {
  transform: translateX(1px) scale(0.99);
}

.editor-tab-launcher-panel__option-label {
  overflow: hidden;
  font-size: 0.84rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-launcher-panel__option-meta {
  overflow: hidden;
  color: rgba(60, 41, 20, 0.5);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-tab-launcher-panel__empty {
  border: 1px dashed rgba(213, 184, 146, 0.52);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.24);
  padding: 12px;
  color: rgba(60, 41, 20, 0.55);
  font-size: 0.78rem;
}

.editor-tab-launcher-panel__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 0;
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.76rem;
}

.editor-tab-launcher-panel__pager button {
  min-height: 28px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
  color: rgba(124, 45, 18, 0.86);
  cursor: pointer;
}

.editor-tab-launcher-panel__pager button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.editor-tab-launcher-panel__entry-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: currentColor;
}

.editor-tab-launcher-panel__entry-meta {
  margin-top: 4px;
  font-size: 0.78rem;
  color: rgba(60, 41, 20, 0.58);
  line-height: 1.35;
}

@media (max-width: 420px) {
  .editor-tab-launcher-panel__entry {
    grid-template-columns: 36px minmax(0, 1fr) 18px;
    gap: 10px;
  }

  .editor-tab-launcher-panel__entry-icon {
    width: 36px;
    height: 36px;
  }
}
</style>
