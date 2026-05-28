<template>
  <AppShell>
    <section class="tools-page">
      <header class="tools-page__hero">
        <div>
          <div class="tools-page__eyebrow">{{ t("tools.eyebrow") }}</div>
          <h2 class="tools-page__title">{{ t("tools.title") }}</h2>
          <p class="tools-page__body">{{ t("tools.body") }}</p>
        </div>
        <div class="tools-page__hero-actions">
          <button type="button" class="tools-page__action" :disabled="importMode !== null" @click="toolArchiveInput?.click()">
            {{ importMode === "archive" ? t("tools.importing") : t("tools.importArchive") }}
          </button>
          <button type="button" class="tools-page__action" :disabled="importMode !== null" @click="toolDirectoryInput?.click()">
            {{ importMode === "folder" ? t("tools.importing") : t("tools.importFolder") }}
          </button>
          <button type="button" class="tools-page__refresh" :disabled="loading" @click="loadTools">
            {{ loading ? t("tools.refreshing") : t("tools.refresh") }}
          </button>
          <input
            ref="toolArchiveInput"
            class="tools-page__file-input"
            type="file"
            accept=".zip,application/zip"
            @change="importUploadedTool($event, 'archive')"
          />
          <input
            ref="toolDirectoryInput"
            class="tools-page__file-input"
            type="file"
            webkitdirectory
            directory
            multiple
            @change="importUploadedTool($event, 'folder')"
          />
        </div>
      </header>

      <section class="tools-page__overview" :aria-label="t('tools.overviewLabel')">
        <article class="tools-page__metric">
          <span>{{ t("tools.total") }}</span>
          <strong>{{ overview.total }}</strong>
        </article>
        <article class="tools-page__metric">
          <span>{{ t("tools.active") }}</span>
          <strong>{{ overview.active }}</strong>
        </article>
        <article class="tools-page__metric">
          <span>{{ t("tools.visibleTools") }}</span>
          <strong>{{ overview.visibleTools }}</strong>
        </article>
        <article class="tools-page__metric">
          <span>{{ t("tools.userTools") }}</span>
          <strong>{{ overview.userTools }}</strong>
        </article>
        <article class="tools-page__metric">
          <span>{{ t("tools.officialTools") }}</span>
          <strong>{{ overview.officialTools }}</strong>
        </article>
      </section>

      <section class="tools-page__toolbar" :aria-label="t('tools.filterLabel')">
        <label class="tools-page__search-field">
          <span>{{ t("common.search") }}</span>
          <ElInput v-model="query" class="tools-page__search" :placeholder="t('tools.searchPlaceholder')" clearable />
        </label>
        <div class="tools-page__status-filter">
          <span>{{ t("tools.statusFilter") }}</span>
          <div role="tablist" class="tools-page__filter-tabs" :aria-label="t('tools.statusFilter')">
            <button
              v-for="option in statusOptions"
              :key="option.value"
              type="button"
              class="tools-page__filter-tab"
              :class="{ 'tools-page__filter-tab--active': statusFilter === option.value }"
              role="tab"
              :aria-selected="statusFilter === option.value"
              @click="statusFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="tools-page__source-filter">
          <span>{{ t("tools.sourceFilter") }}</span>
          <div role="tablist" class="tools-page__filter-tabs" :aria-label="t('tools.sourceFilter')">
            <button
              v-for="option in sourceOptions"
              :key="option.value"
              type="button"
              class="tools-page__filter-tab"
              :class="{ 'tools-page__filter-tab--active': sourceFilter === option.value }"
              role="tab"
              :aria-selected="sourceFilter === option.value"
              @click="sourceFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="tools-page__list">
        <article v-if="toolError" class="tools-page__notice">{{ t("tools.actionFailed", { error: toolError }) }}</article>
        <article v-if="loading" class="tools-page__empty">{{ t("common.loading") }}</article>
        <article v-else-if="error" class="tools-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
        <article v-else-if="filteredTools.length === 0" class="tools-page__empty">{{ t("tools.empty") }}</article>
        <section v-else class="tools-page__workspace">
          <aside class="tools-page__selector" :aria-label="t('tools.selectorLabel')">
            <div class="tools-page__result-count">{{ t("tools.resultCount", { count: filteredTools.length }) }}</div>
            <div
              v-for="tool in filteredTools"
              :key="tool.toolKey"
              class="tools-page__selector-item"
              :class="{ 'tools-page__selector-item--active': selectedToolKey === tool.toolKey }"
            >
              <button
                type="button"
                class="tools-page__selector-button"
                :aria-pressed="selectedToolKey === tool.toolKey"
                @click="selectTool(tool.toolKey)"
              >
                <span>{{ tool.name }}</span>
              </button>
              <ElSwitch
                :model-value="tool.status === 'active'"
                :disabled="busyToolKey === tool.toolKey"
                :aria-label="enabledToggleLabel(tool)"
                @change="setToolEnabled(tool, Boolean($event))"
              />
            </div>
          </aside>

          <article v-if="selectedTool" class="tools-page__detail" :aria-label="t('tools.detailLabel')">
            <header class="tools-page__detail-header">
              <div>
                <div class="tools-page__id">{{ selectedTool.toolKey }}</div>
                <h3>{{ selectedTool.name }}</h3>
                <p>{{ selectedTool.description }}</p>
              </div>
            </header>

            <div class="tools-page__actions" :aria-label="t('tools.actions')">
              <button
                v-if="selectedTool.canManage"
                type="button"
                class="tools-page__action"
                :class="{ 'tools-page__action--danger': confirmingToolDeleteKey === selectedTool.toolKey }"
                :disabled="busyToolKey === selectedTool.toolKey"
                @click="deleteToolFromCatalog(selectedTool)"
              >
                {{ confirmingToolDeleteKey === selectedTool.toolKey ? t("tools.confirmDelete") : t("tools.delete") }}
              </button>
            </div>

            <div class="tools-page__source">
              <span>{{ t("tools.source") }}: {{ t(`tools.sourceScope.${selectedTool.sourceScope}`) }}</span>
              <code>{{ selectedTool.sourcePath }}</code>
            </div>

            <div class="tools-page__taxonomy">
              <section>
                <h4>{{ t("tools.version") }}</h4>
                <div class="tools-page__badges">
                  <span>{{ selectedTool.version || t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("tools.runtime") }}</h4>
                <div class="tools-page__badges">
                  <span>{{ selectedTool.runtime.type || t("common.none") }}</span>
                  <span v-if="selectedTool.runtime.entrypoint">{{ selectedTool.runtime.entrypoint }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("common.status") }}</h4>
                <div class="tools-page__badges">
                  <span>{{ selectedTool.status === "active" ? t("tools.active") : t("tools.disabled") }}</span>
                  <span>{{ selectedTool.runtimeReady ? t("tools.runtimeReady") : t("tools.runtimePending") }}</span>
                  <span>{{ selectedTool.runtimeRegistered ? t("tools.runtimeRegistered") : t("tools.runtimeNotRegistered") }}</span>
                </div>
              </section>
            </div>

            <div class="tools-page__columns">
              <section>
                <h4>{{ t("tools.inputSchema") }}</h4>
                <div class="tools-page__schema-list">
                  <span v-for="field in selectedTool.inputSchema" :key="`in-${field.key}`">
                    {{ field.key }} · {{ field.valueType }}
                  </span>
                  <span v-if="selectedTool.inputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("tools.outputSchema") }}</h4>
                <div class="tools-page__schema-list">
                  <span v-for="field in selectedTool.outputSchema" :key="`out-${field.key}`">
                    {{ field.key }} · {{ field.valueType }}
                  </span>
                  <span v-if="selectedTool.outputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("tools.permissions") }}</h4>
                <div class="tools-page__badges">
                  <span v-for="permission in selectedTool.permissions" :key="permission">{{ permission }}</span>
                  <span v-if="selectedTool.permissions.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
            </div>

            <section class="tools-page__file-browser" :aria-label="t('tools.fileBrowser')">
              <div class="tools-page__file-tree">
                <h4>{{ t("tools.fileTree") }}</h4>
                <div v-if="toolFilesLoading" class="tools-page__file-state">{{ t("tools.fileLoading") }}</div>
                <div v-else-if="toolFilesError" class="tools-page__file-state">{{ toolFilesError }}</div>
                <div v-else-if="flattenedToolFiles.length === 0" class="tools-page__file-state">{{ t("tools.fileEmpty") }}</div>
                <template v-else>
                  <button
                    v-for="file in flattenedToolFiles"
                    :key="file.path"
                    type="button"
                    class="tools-page__file-tree-button"
                    :class="{
                      'tools-page__file-tree-button--active': selectedFilePath === file.path,
                      'tools-page__file-tree-button--directory': file.type === 'directory',
                    }"
                    :style="{ paddingLeft: `${12 + file.depth * 14}px` }"
                    :disabled="file.type === 'directory'"
                    @click="selectToolFile(file.path)"
                  >
                    <span>{{ file.name }}</span>
                    <small v-if="file.type === 'file'">{{ formatFileSize(file.size) }}</small>
                  </button>
                </template>
              </div>

              <div class="tools-page__file-preview">
                <header>
                  <div>
                    <h4>{{ t("tools.filePreview") }}</h4>
                    <p v-if="selectedFile">{{ selectedFile.path }}</p>
                    <p v-else>{{ t("tools.fileSelectHint") }}</p>
                  </div>
                  <span v-if="selectedFile?.executable" class="tools-page__file-pill">{{ t("tools.fileExecutable") }}</span>
                </header>
                <div v-if="toolFileContentLoading" class="tools-page__file-state">{{ t("tools.fileContentLoading") }}</div>
                <div v-else-if="toolFileContentError" class="tools-page__file-state">{{ toolFileContentError }}</div>
                <div v-else-if="!selectedFilePath" class="tools-page__file-state">{{ t("tools.fileSelectHint") }}</div>
                <div v-else-if="toolFileContent?.encoding === 'too_large'" class="tools-page__file-state">
                  {{ t("tools.fileTooLarge") }}
                </div>
                <div v-else-if="toolFileContent?.encoding === 'binary'" class="tools-page__file-state">
                  {{ t("tools.fileBinary") }}
                </div>
                <pre v-else-if="toolFileContent?.content != null" class="tools-page__file-code"><code>{{ toolFileContent?.content }}</code></pre>
                <div v-else class="tools-page__file-state">{{ t("tools.fileUnavailable") }}</div>
              </div>
            </section>
          </article>
        </section>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElInput, ElSwitch } from "element-plus";
import { useI18n } from "vue-i18n";

import {
  deleteTool,
  fetchToolCatalog,
  fetchToolFileContent,
  fetchToolFiles,
  importToolUpload,
  updateToolStatus,
} from "@/api/tools";
import AppShell from "@/layouts/AppShell.vue";
import type { ToolDefinition, ToolFileContentResponse, ToolFileNode, ToolFileTreeResponse } from "@/types/tools";

import {
  buildToolOverview,
  buildToolSourceOptions,
  buildToolStatusOptions,
  filterToolsForManagement,
  type ToolSourceFilter,
  type ToolStatusFilter,
} from "./toolsPageModel.ts";

type FlatToolFileNode = ToolFileNode & {
  depth: number;
};

const tools = ref<ToolDefinition[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const toolError = ref<string | null>(null);
const busyToolKey = ref<string | null>(null);
const confirmingToolDeleteKey = ref<string | null>(null);
const importMode = ref<"archive" | "folder" | null>(null);
const toolArchiveInput = ref<HTMLInputElement | null>(null);
const toolDirectoryInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const statusFilter = ref<ToolStatusFilter>("all");
const sourceFilter = ref<ToolSourceFilter>("all");
const selectedToolKey = ref("");
const toolFileTree = ref<ToolFileTreeResponse | null>(null);
const toolFilesLoading = ref(false);
const toolFilesError = ref<string | null>(null);
const selectedFilePath = ref("");
const toolFileContent = ref<ToolFileContentResponse | null>(null);
const toolFileContentLoading = ref(false);
const toolFileContentError = ref<string | null>(null);
const { t } = useI18n();

let fileTreeRequestId = 0;
let fileContentRequestId = 0;

const overview = computed(() => buildToolOverview(tools.value));
const filteredTools = computed(() => filterToolsForManagement(tools.value, { query: query.value, status: statusFilter.value, source: sourceFilter.value }));
const selectedTool = computed(() => filteredTools.value.find((tool) => tool.toolKey === selectedToolKey.value) ?? null);
const flattenedToolFiles = computed<FlatToolFileNode[]>(() => flattenToolFiles(toolFileTree.value?.root.children ?? []));
const selectedFile = computed(() => flattenedToolFiles.value.find((file) => file.path === selectedFilePath.value) ?? null);
const statusOptions = computed(() =>
  buildToolStatusOptions().map((value) => ({
    value,
    label: t(`tools.${value}`),
  })),
);
const sourceOptions = computed(() =>
  buildToolSourceOptions().map((value) => {
    const option = { value };
    return {
      value: option.value,
      label: t(`tools.sourceFilterOptions.${option.value}`),
    };
  }),
);

watch(
  filteredTools,
  (availableTools) => {
    if (availableTools.some((tool) => tool.toolKey === selectedToolKey.value)) {
      return;
    }
    selectedToolKey.value = availableTools[0]?.toolKey ?? "";
  },
  { immediate: true },
);

watch(selectedToolKey, (toolKey) => {
  void loadToolFilesForSelection(toolKey);
});

async function loadTools() {
  loading.value = true;
  try {
    tools.value = await fetchToolCatalog({ includeDisabled: true });
    error.value = null;
    toolError.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loading");
  } finally {
    loading.value = false;
  }
}

function replaceTool(updatedTool: ToolDefinition) {
  tools.value = tools.value.map((tool) => (tool.toolKey === updatedTool.toolKey ? updatedTool : tool));
}

function selectTool(toolKey: string) {
  selectedToolKey.value = toolKey;
  confirmingToolDeleteKey.value = null;
}

function enabledToggleLabel(tool: ToolDefinition) {
  return tool.status === "active" ? t("tools.disable") : t("tools.enable");
}

async function importUploadedTool(event: Event, mode: "archive" | "folder") {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) {
    return;
  }
  const relativePaths = mode === "folder" ? files.map((file) => file.webkitRelativePath || file.name) : [];
  importMode.value = mode;
  toolError.value = null;
  confirmingToolDeleteKey.value = null;
  try {
    await importToolUpload(files, relativePaths);
    await loadTools();
  } catch (uploadError) {
    toolError.value = uploadError instanceof Error ? uploadError.message : t("common.loading");
  } finally {
    importMode.value = null;
    input.value = "";
  }
}

async function setToolEnabled(tool: ToolDefinition, enabled: boolean) {
  await setToolStatus(tool, enabled ? "active" : "disabled");
}

async function setToolStatus(tool: ToolDefinition, status: ToolDefinition["status"]) {
  busyToolKey.value = tool.toolKey;
  toolError.value = null;
  confirmingToolDeleteKey.value = null;
  try {
    replaceTool(await updateToolStatus(tool.toolKey, status));
  } catch (updateError) {
    toolError.value = updateError instanceof Error ? updateError.message : t("common.loading");
  } finally {
    busyToolKey.value = null;
  }
}

async function deleteToolFromCatalog(tool: ToolDefinition) {
  if (confirmingToolDeleteKey.value !== tool.toolKey) {
    confirmingToolDeleteKey.value = tool.toolKey;
    return;
  }
  busyToolKey.value = tool.toolKey;
  toolError.value = null;
  try {
    await deleteTool(tool.toolKey);
    tools.value = tools.value.filter((item) => item.toolKey !== tool.toolKey);
    confirmingToolDeleteKey.value = null;
  } catch (deleteError) {
    toolError.value = deleteError instanceof Error ? deleteError.message : t("common.loading");
  } finally {
    busyToolKey.value = null;
  }
}

async function loadToolFilesForSelection(toolKey: string) {
  const requestId = ++fileTreeRequestId;
  ++fileContentRequestId;
  toolFileTree.value = null;
  selectedFilePath.value = "";
  toolFileContent.value = null;
  toolFileContentError.value = null;
  toolFilesError.value = null;

  if (!toolKey) {
    toolFilesLoading.value = false;
    return;
  }

  toolFilesLoading.value = true;
  try {
    const tree = await fetchToolFiles(toolKey);
    if (requestId !== fileTreeRequestId) {
      return;
    }
    toolFileTree.value = tree;
    const initialFilePath = pickInitialFilePath(tree.root);
    if (initialFilePath) {
      selectedFilePath.value = initialFilePath;
      await loadToolFileContent(toolKey, initialFilePath);
    }
  } catch (fileError) {
    if (requestId === fileTreeRequestId) {
      toolFilesError.value = fileError instanceof Error ? fileError.message : t("common.loading");
    }
  } finally {
    if (requestId === fileTreeRequestId) {
      toolFilesLoading.value = false;
    }
  }
}

async function selectToolFile(path: string) {
  if (!selectedTool.value || selectedFilePath.value === path) {
    return;
  }
  selectedFilePath.value = path;
  await loadToolFileContent(selectedTool.value.toolKey, path);
}

async function loadToolFileContent(toolKey: string, path: string) {
  const requestId = ++fileContentRequestId;
  toolFileContent.value = null;
  toolFileContentError.value = null;
  toolFileContentLoading.value = true;
  try {
    const content = await fetchToolFileContent(toolKey, path);
    if (requestId !== fileContentRequestId || selectedToolKey.value !== toolKey || selectedFilePath.value !== path) {
      return;
    }
    toolFileContent.value = content;
  } catch (contentError) {
    if (requestId === fileContentRequestId) {
      toolFileContentError.value = contentError instanceof Error ? contentError.message : t("common.loading");
    }
  } finally {
    if (requestId === fileContentRequestId) {
      toolFileContentLoading.value = false;
    }
  }
}

function flattenToolFiles(nodes: ToolFileNode[], depth = 0): FlatToolFileNode[] {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flattenToolFiles(node.children, depth + 1)]);
}

function pickInitialFilePath(root: ToolFileNode): string {
  const files = flattenToolFiles(root.children).filter((file) => file.type === "file");
  return (
    files.find((file) => file.name === "tool.json")?.path ??
    files.find((file) => file.name.toLowerCase() === "readme.md")?.path ??
    files.find((file) => file.previewable)?.path ??
    files[0]?.path ??
    ""
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

onMounted(loadTools);
</script>

<style scoped>
.tools-page {
  --tools-page-panel-shadow: 0 10px 24px rgba(61, 43, 24, 0.04);
  --tools-page-card-shadow: 0 4px 12px rgba(61, 43, 24, 0.026);

  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.tools-page__hero,
.tools-page__toolbar,
.tools-page__empty,
.tools-page__notice {
  min-width: 0;
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-panel);
  box-shadow: var(--tools-page-panel-shadow);
}

.tools-page__metric,
.tools-page__selector,
.tools-page__detail {
  box-shadow: var(--tools-page-card-shadow);
}

.tools-page__hero > *,
.tools-page__search-field,
.tools-page__status-filter,
.tools-page__source-filter,
.tools-page__hero-actions,
.tools-page__selector,
.tools-page__detail,
.tools-page__detail-header > *,
.tools-page__taxonomy section,
.tools-page__columns section,
.tools-page__file-tree,
.tools-page__file-preview {
  min-width: 0;
}

.tools-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.tools-page__hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.tools-page__file-input {
  display: none;
}

.tools-page__eyebrow,
.tools-page__id {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.tools-page__title {
  margin: 8px 0 10px;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 2rem;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.tools-page__body,
.tools-page__detail-header p,
.tools-page__empty,
.tools-page__notice,
.tools-page__result-count,
.tools-page__source,
.tools-page__file-preview p,
.tools-page__file-state {
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.tools-page__body,
.tools-page__detail-header p,
.tools-page__file-preview p {
  margin: 0;
  overflow-wrap: anywhere;
}

.tools-page__refresh,
.tools-page__action {
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
  font: inherit;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.tools-page__refresh:hover,
.tools-page__action:hover {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 250, 242, 1);
  transform: translateY(-1px);
}

.tools-page__refresh:disabled,
.tools-page__action:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.tools-page__action--danger {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(255, 245, 242, 0.96);
  color: rgb(153, 27, 27);
}

.tools-page__refresh:focus-visible,
.tools-page__action:focus-visible,
.tools-page__selector-button:focus-visible,
.tools-page__file-tree-button:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.tools-page__overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.tools-page__metric {
  min-width: 0;
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.tools-page__metric span {
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.84rem;
}

.tools-page__metric strong {
  display: block;
  margin-top: 8px;
  color: var(--toograph-text-strong);
  font-size: 1.35rem;
}

.tools-page__toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto;
  gap: 14px;
  align-items: end;
  padding: 16px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
}

.tools-page__search-field,
.tools-page__status-filter,
.tools-page__source-filter {
  display: grid;
  gap: 8px;
  color: rgba(60, 41, 20, 0.72);
}

.tools-page__search {
  width: 100%;
}

.tools-page__filter-tabs {
  display: flex;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 14px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.42);
}

.tools-page__filter-tab {
  flex: 0 0 auto;
  border: 0;
  border-radius: 10px;
  padding: 6px 10px;
  background: transparent;
  color: rgba(60, 41, 20, 0.68);
  cursor: pointer;
  font: inherit;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.tools-page__filter-tab:hover {
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.68);
}

.tools-page__filter-tab--active {
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.1), 0 4px 10px rgba(154, 52, 18, 0.06);
}

.tools-page__filter-tab:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.tools-page__list {
  display: grid;
  gap: 12px;
}

.tools-page__empty,
.tools-page__notice {
  padding: 24px;
}

.tools-page__workspace {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  min-width: 0;
}

.tools-page__selector,
.tools-page__detail {
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-card);
}

.tools-page__selector {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 6px;
  max-height: calc(100vh - 120px);
  overflow: auto;
  padding: 12px;
}

.tools-page__result-count {
  padding: 4px 4px 8px;
  font-size: 0.84rem;
}

.tools-page__selector-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 6px 8px 6px 10px;
  background: rgba(255, 255, 255, 0.36);
  transition: background-color 160ms ease, border-color 160ms ease;
}

.tools-page__selector-item--active {
  border-color: rgba(154, 52, 18, 0.18);
  background: rgba(255, 248, 240, 0.96);
}

.tools-page__selector-button {
  min-width: 0;
  border: 0;
  padding: 6px 0;
  background: transparent;
  color: var(--toograph-text-strong);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.tools-page__selector-button span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tools-page__detail {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.tools-page__detail-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.tools-page__detail-header h3,
.tools-page__detail h4,
.tools-page__file-preview h4 {
  margin: 0;
}

.tools-page__detail-header h3 {
  margin: 6px 0 8px;
  color: var(--toograph-text-strong);
  font-size: 1.28rem;
}

.tools-page__detail h4,
.tools-page__file-preview h4 {
  color: rgba(60, 41, 20, 0.76);
  font-size: 0.86rem;
}

.tools-page__actions,
.tools-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.tools-page__actions {
  margin-top: -4px;
}

.tools-page__taxonomy {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.tools-page__badges span,
.tools-page__schema-list span,
.tools-page__file-pill {
  display: inline-block;
  max-width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
  white-space: normal;
}

.tools-page__source {
  display: grid;
  gap: 4px;
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
}

.tools-page__source code {
  word-break: break-all;
}

.tools-page__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.tools-page__taxonomy section,
.tools-page__columns section,
.tools-page__schema-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.tools-page__file-browser {
  display: grid;
  grid-template-columns: minmax(210px, 0.38fr) minmax(0, 1fr);
  gap: 12px;
  border-top: 1px solid rgba(154, 52, 18, 0.08);
  padding-top: 16px;
}

.tools-page__file-tree,
.tools-page__file-preview {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 240px;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.36);
  padding: 12px;
}

.tools-page__file-tree {
  max-height: 520px;
  overflow: auto;
}

.tools-page__file-tree-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 7px 10px;
  background: transparent;
  color: rgba(60, 41, 20, 0.82);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.tools-page__file-tree-button:hover:not(:disabled),
.tools-page__file-tree-button--active {
  border-color: rgba(154, 52, 18, 0.12);
  background: rgba(255, 248, 240, 0.9);
  color: rgb(154, 52, 18);
}

.tools-page__file-tree-button:disabled {
  cursor: default;
  opacity: 0.78;
}

.tools-page__file-tree-button--directory {
  color: rgba(60, 41, 20, 0.58);
  font-weight: 600;
}

.tools-page__file-tree-button span,
.tools-page__file-tree-button small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tools-page__file-tree-button small {
  color: rgba(60, 41, 20, 0.48);
  font-family: var(--toograph-font-mono);
  font-size: 0.72rem;
}

.tools-page__file-preview header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.tools-page__file-code {
  max-height: 460px;
  margin: 0;
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 14px;
  padding: 12px;
  background: rgba(39, 29, 20, 0.92);
  color: rgba(255, 248, 240, 0.92);
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
  line-height: 1.55;
  white-space: pre;
}

.tools-page__file-state {
  display: grid;
  place-items: center;
  min-height: 150px;
  border: 1px dashed rgba(154, 52, 18, 0.12);
  border-radius: 14px;
  padding: 16px;
  text-align: center;
}

@media (max-width: 1180px) {
  .tools-page__detail-header,
  .tools-page__file-browser {
    grid-template-columns: 1fr;
  }

  .tools-page__taxonomy {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  .tools-page__workspace {
    grid-template-columns: 1fr;
  }

  .tools-page__selector {
    position: static;
    max-height: 360px;
  }

  .tools-page__toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .tools-page__hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .tools-page__hero-actions,
  .tools-page__refresh {
    width: 100%;
  }

  .tools-page__hero-actions {
    display: grid;
    grid-template-columns: 1fr;
    justify-content: stretch;
  }

  .tools-page__taxonomy {
    grid-template-columns: 1fr;
  }
}
</style>
