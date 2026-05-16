<template>
  <AppShell>
    <section class="actions-page">
      <header class="actions-page__hero">
        <div>
          <div class="actions-page__eyebrow">{{ t("actions.eyebrow") }}</div>
          <h2 class="actions-page__title">{{ t("actions.title") }}</h2>
          <p class="actions-page__body">{{ t("actions.body") }}</p>
        </div>
        <div class="actions-page__hero-actions">
          <button type="button" class="actions-page__action" :disabled="importMode !== null" @click="actionArchiveInput?.click()">
            {{ importMode === "archive" ? t("actions.importing") : t("actions.importArchive") }}
          </button>
          <button type="button" class="actions-page__action" :disabled="importMode !== null" @click="actionDirectoryInput?.click()">
            {{ importMode === "folder" ? t("actions.importing") : t("actions.importFolder") }}
          </button>
          <button type="button" class="actions-page__refresh" :disabled="loading" @click="loadActions">
            {{ loading ? t("actions.refreshing") : t("actions.refresh") }}
          </button>
          <input
            ref="actionArchiveInput"
            class="actions-page__file-input"
            type="file"
            accept=".zip,application/zip"
            @change="importUploadedAction($event, 'archive')"
          />
          <input
            ref="actionDirectoryInput"
            class="actions-page__file-input"
            type="file"
            webkitdirectory
            directory
            multiple
            @change="importUploadedAction($event, 'folder')"
          />
        </div>
      </header>

      <section class="actions-page__overview" :aria-label="t('actions.overviewLabel')">
        <article class="actions-page__metric">
          <span>{{ t("actions.total") }}</span>
          <strong>{{ overview.total }}</strong>
        </article>
        <article class="actions-page__metric">
          <span>{{ t("actions.active") }}</span>
          <strong>{{ overview.active }}</strong>
        </article>
        <article class="actions-page__metric">
          <span>{{ t("actions.visibleActions") }}</span>
          <strong>{{ overview.visibleActions }}</strong>
        </article>
      </section>

      <section class="actions-page__toolbar" :aria-label="t('actions.filterLabel')">
        <label class="actions-page__search-field">
          <span>{{ t("common.search") }}</span>
          <ElInput v-model="query" class="actions-page__search" :placeholder="t('actions.searchPlaceholder')" clearable />
        </label>
        <div class="actions-page__status-filter">
          <span>{{ t("actions.statusFilter") }}</span>
          <div role="tablist" class="actions-page__filter-tabs" :aria-label="t('actions.statusFilter')">
            <button
              v-for="option in statusOptions"
              :key="option.value"
              type="button"
              class="actions-page__filter-tab"
              :class="{ 'actions-page__filter-tab--active': statusFilter === option.value }"
              role="tab"
              :aria-selected="statusFilter === option.value"
              @click="statusFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="actions-page__list">
        <article v-if="actionError" class="actions-page__notice">{{ t("actions.actionFailed", { error: actionError }) }}</article>
        <article v-if="loading" class="actions-page__empty">{{ t("common.loading") }}</article>
        <article v-else-if="error" class="actions-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
        <article v-else-if="filteredActions.length === 0" class="actions-page__empty">{{ t("actions.empty") }}</article>
        <section v-else class="actions-page__workspace">
          <aside class="actions-page__selector" :aria-label="t('actions.selectorLabel')">
            <div class="actions-page__result-count">{{ t("actions.resultCount", { count: filteredActions.length }) }}</div>
            <div
              v-for="action in filteredActions"
              :key="action.actionKey"
              class="actions-page__selector-item"
              :class="{ 'actions-page__selector-item--active': selectedActionKey === action.actionKey }"
            >
              <button
                type="button"
                class="actions-page__selector-button"
                :aria-pressed="selectedActionKey === action.actionKey"
                @click="selectAction(action.actionKey)"
              >
                <span>{{ action.name }}</span>
              </button>
              <ElSwitch
                :model-value="action.status === 'active'"
                :disabled="busyActionKey === action.actionKey"
                :aria-label="enabledToggleLabel(action)"
                @change="setActionEnabled(action, Boolean($event))"
              />
            </div>
          </aside>

          <article v-if="selectedAction" class="actions-page__detail" :aria-label="t('actions.detailLabel')">
            <header class="actions-page__detail-header">
              <div>
                <div class="actions-page__id">{{ selectedAction.actionKey }}</div>
                <h3>{{ selectedAction.name }}</h3>
                <p>{{ selectedAction.description }}</p>
              </div>
            </header>

            <div class="actions-page__actions" :aria-label="t('actions.actions')">
              <button
                v-if="selectedAction.canManage"
                type="button"
                class="actions-page__action"
                :class="{ 'actions-page__action--danger': confirmingActionDeleteKey === selectedAction.actionKey }"
                :disabled="busyActionKey === selectedAction.actionKey"
                @click="deleteActionFromCatalog(selectedAction)"
              >
                {{ confirmingActionDeleteKey === selectedAction.actionKey ? t("actions.confirmDelete") : t("actions.delete") }}
              </button>
            </div>

            <div class="actions-page__source">
              <span>{{ t("actions.source") }}: {{ t(`actions.sourceScope.${selectedAction.sourceScope}`) }}</span>
              <code>{{ selectedAction.sourcePath }}</code>
            </div>

            <div class="actions-page__taxonomy">
              <section>
                <h4>{{ t("actions.version") }}</h4>
                <div class="actions-page__badges">
                  <span>{{ selectedAction.version || t("common.none") }}</span>
                </div>
              </section>
            </div>

            <div class="actions-page__columns">
              <section>
                <h4>{{ t("actions.stateInputSchema") }}</h4>
                <div class="actions-page__schema-list">
                  <span v-for="field in selectedAction.stateInputSchema ?? []" :key="`state-in-${field.key}`">
                    {{ field.key }} · {{ field.valueType }}
                  </span>
                  <span v-if="(selectedAction.stateInputSchema ?? []).length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("actions.llmOutputSchema") }}</h4>
                <div class="actions-page__schema-list">
                  <span v-for="field in selectedAction.llmOutputSchema" :key="`llm-in-${field.key}`">
                    {{ field.key }} · {{ field.valueType }}
                  </span>
                  <span v-if="selectedAction.llmOutputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("actions.stateOutputSchema") }}</h4>
                <div class="actions-page__schema-list">
                  <span v-for="field in selectedAction.stateOutputSchema" :key="`out-${field.key}`">
                    {{ field.key }} · {{ field.valueType }}
                  </span>
                  <span v-if="selectedAction.stateOutputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("actions.permissions") }}</h4>
                <div class="actions-page__badges">
                  <span v-for="permission in selectedAction.permissions" :key="permission">{{ permission }}</span>
                  <span v-if="selectedAction.permissions.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("actions.llmInstruction") }}</h4>
                <p class="actions-page__instruction">{{ selectedAction.llmInstruction || t("common.none") }}</p>
              </section>
            </div>

            <section class="actions-page__file-browser" :aria-label="t('actions.fileBrowser')">
              <div class="actions-page__file-tree">
                <h4>{{ t("actions.fileTree") }}</h4>
                <div v-if="actionFilesLoading" class="actions-page__file-state">{{ t("actions.fileLoading") }}</div>
                <div v-else-if="actionFilesError" class="actions-page__file-state">{{ actionFilesError }}</div>
                <div v-else-if="flattenedActionFiles.length === 0" class="actions-page__file-state">{{ t("actions.fileEmpty") }}</div>
                <template v-else>
                  <button
                    v-for="file in flattenedActionFiles"
                    :key="file.path"
                    type="button"
                    class="actions-page__file-tree-button"
                    :class="{
                      'actions-page__file-tree-button--active': selectedFilePath === file.path,
                      'actions-page__file-tree-button--directory': file.type === 'directory',
                    }"
                    :style="{ paddingLeft: `${12 + file.depth * 14}px` }"
                    :disabled="file.type === 'directory'"
                    @click="selectActionFile(file.path)"
                  >
                    <span>{{ file.name }}</span>
                    <small v-if="file.type === 'file'">{{ formatFileSize(file.size) }}</small>
                  </button>
                </template>
              </div>

              <div class="actions-page__file-preview">
                <header>
                  <div>
                    <h4>{{ t("actions.filePreview") }}</h4>
                    <p v-if="selectedFile">{{ selectedFile.path }}</p>
                    <p v-else>{{ t("actions.fileSelectHint") }}</p>
                  </div>
                  <span v-if="selectedFile?.executable" class="actions-page__file-pill">{{ t("actions.fileExecutable") }}</span>
                </header>
                <div v-if="actionFileContentLoading" class="actions-page__file-state">{{ t("actions.fileContentLoading") }}</div>
                <div v-else-if="actionFileContentError" class="actions-page__file-state">{{ actionFileContentError }}</div>
                <div v-else-if="!selectedFilePath" class="actions-page__file-state">{{ t("actions.fileSelectHint") }}</div>
                <div v-else-if="actionFileContent?.encoding === 'too_large'" class="actions-page__file-state">
                  {{ t("actions.fileTooLarge") }}
                </div>
                <div v-else-if="actionFileContent?.encoding === 'binary'" class="actions-page__file-state">
                  {{ t("actions.fileBinary") }}
                </div>
                <pre v-else-if="actionFileContent?.content != null" class="actions-page__file-code"><code>{{ actionFileContent?.content }}</code></pre>
                <div v-else class="actions-page__file-state">{{ t("actions.fileUnavailable") }}</div>
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
  deleteAction,
  fetchActionCatalog,
  fetchActionFileContent,
  fetchActionFiles,
  importActionUpload,
  updateActionStatus,
} from "@/api/actions";
import AppShell from "@/layouts/AppShell.vue";
import type { ActionDefinition, ActionFileContentResponse, ActionFileNode, ActionFileTreeResponse } from "@/types/actions";

import {
  buildActionOverview,
  buildActionStatusOptions,
  filterActionsForManagement,
  type ActionStatusFilter,
} from "./actionsPageModel.ts";

type FlatActionFileNode = ActionFileNode & {
  depth: number;
};

const actions = ref<ActionDefinition[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busyActionKey = ref<string | null>(null);
const confirmingActionDeleteKey = ref<string | null>(null);
const importMode = ref<"archive" | "folder" | null>(null);
const actionArchiveInput = ref<HTMLInputElement | null>(null);
const actionDirectoryInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const statusFilter = ref<ActionStatusFilter>("all");
const selectedActionKey = ref("");
const actionFileTree = ref<ActionFileTreeResponse | null>(null);
const actionFilesLoading = ref(false);
const actionFilesError = ref<string | null>(null);
const selectedFilePath = ref("");
const actionFileContent = ref<ActionFileContentResponse | null>(null);
const actionFileContentLoading = ref(false);
const actionFileContentError = ref<string | null>(null);
const { t } = useI18n();

let fileTreeRequestId = 0;
let fileContentRequestId = 0;

const overview = computed(() => buildActionOverview(actions.value));
const filteredActions = computed(() => filterActionsForManagement(actions.value, { query: query.value, status: statusFilter.value }));
const selectedAction = computed(() => filteredActions.value.find((action) => action.actionKey === selectedActionKey.value) ?? null);
const flattenedActionFiles = computed<FlatActionFileNode[]>(() => flattenActionFiles(actionFileTree.value?.root.children ?? []));
const selectedFile = computed(() => flattenedActionFiles.value.find((file) => file.path === selectedFilePath.value) ?? null);
const statusOptions = computed(() =>
  buildActionStatusOptions().map((value) => ({
    value,
    label: t(`actions.${value}`),
  })),
);

watch(
  filteredActions,
  (availableActions) => {
    if (availableActions.some((action) => action.actionKey === selectedActionKey.value)) {
      return;
    }
    selectedActionKey.value = availableActions[0]?.actionKey ?? "";
  },
  { immediate: true },
);

watch(selectedActionKey, (actionKey) => {
  void loadActionFilesForSelection(actionKey);
});

async function loadActions() {
  loading.value = true;
  try {
    actions.value = await fetchActionCatalog({ includeDisabled: true });
    error.value = null;
    actionError.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loading");
  } finally {
    loading.value = false;
  }
}

function replaceAction(updatedAction: ActionDefinition) {
  actions.value = actions.value.map((action) => (action.actionKey === updatedAction.actionKey ? updatedAction : action));
}

function selectAction(actionKey: string) {
  selectedActionKey.value = actionKey;
  confirmingActionDeleteKey.value = null;
}

function enabledToggleLabel(action: ActionDefinition) {
  return action.status === "active" ? t("actions.disable") : t("actions.enable");
}

async function importUploadedAction(event: Event, mode: "archive" | "folder") {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) {
    return;
  }
  const relativePaths = mode === "folder" ? files.map((file) => file.webkitRelativePath || file.name) : [];
  importMode.value = mode;
  actionError.value = null;
  confirmingActionDeleteKey.value = null;
  try {
    await importActionUpload(files, relativePaths);
    await loadActions();
  } catch (uploadError) {
    actionError.value = uploadError instanceof Error ? uploadError.message : t("common.loading");
  } finally {
    importMode.value = null;
    input.value = "";
  }
}

async function setActionEnabled(action: ActionDefinition, enabled: boolean) {
  await setActionStatus(action, enabled ? "active" : "disabled");
}

async function setActionStatus(action: ActionDefinition, status: ActionDefinition["status"]) {
  busyActionKey.value = action.actionKey;
  actionError.value = null;
  confirmingActionDeleteKey.value = null;
  try {
    replaceAction(await updateActionStatus(action.actionKey, status));
  } catch (updateError) {
    actionError.value = updateError instanceof Error ? updateError.message : t("common.loading");
  } finally {
    busyActionKey.value = null;
  }
}

async function deleteActionFromCatalog(action: ActionDefinition) {
  if (confirmingActionDeleteKey.value !== action.actionKey) {
    confirmingActionDeleteKey.value = action.actionKey;
    return;
  }
  busyActionKey.value = action.actionKey;
  actionError.value = null;
  try {
    await deleteAction(action.actionKey);
    actions.value = actions.value.filter((item) => item.actionKey !== action.actionKey);
    confirmingActionDeleteKey.value = null;
  } catch (deleteError) {
    actionError.value = deleteError instanceof Error ? deleteError.message : t("common.loading");
  } finally {
    busyActionKey.value = null;
  }
}

async function loadActionFilesForSelection(actionKey: string) {
  const requestId = ++fileTreeRequestId;
  ++fileContentRequestId;
  actionFileTree.value = null;
  selectedFilePath.value = "";
  actionFileContent.value = null;
  actionFileContentError.value = null;
  actionFilesError.value = null;

  if (!actionKey) {
    actionFilesLoading.value = false;
    return;
  }

  actionFilesLoading.value = true;
  try {
    const tree = await fetchActionFiles(actionKey);
    if (requestId !== fileTreeRequestId) {
      return;
    }
    actionFileTree.value = tree;
    const initialFilePath = pickInitialFilePath(tree.root);
    if (initialFilePath) {
      selectedFilePath.value = initialFilePath;
      await loadActionFileContent(actionKey, initialFilePath);
    }
  } catch (fileError) {
    if (requestId === fileTreeRequestId) {
      actionFilesError.value = fileError instanceof Error ? fileError.message : t("common.loading");
    }
  } finally {
    if (requestId === fileTreeRequestId) {
      actionFilesLoading.value = false;
    }
  }
}

async function selectActionFile(path: string) {
  if (!selectedAction.value || selectedFilePath.value === path) {
    return;
  }
  selectedFilePath.value = path;
  await loadActionFileContent(selectedAction.value.actionKey, path);
}

async function loadActionFileContent(actionKey: string, path: string) {
  const requestId = ++fileContentRequestId;
  actionFileContent.value = null;
  actionFileContentError.value = null;
  actionFileContentLoading.value = true;
  try {
    const content = await fetchActionFileContent(actionKey, path);
    if (requestId !== fileContentRequestId || selectedActionKey.value !== actionKey || selectedFilePath.value !== path) {
      return;
    }
    actionFileContent.value = content;
  } catch (contentError) {
    if (requestId === fileContentRequestId) {
      actionFileContentError.value = contentError instanceof Error ? contentError.message : t("common.loading");
    }
  } finally {
    if (requestId === fileContentRequestId) {
      actionFileContentLoading.value = false;
    }
  }
}

function flattenActionFiles(nodes: ActionFileNode[], depth = 0): FlatActionFileNode[] {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flattenActionFiles(node.children, depth + 1)]);
}

function pickInitialFilePath(root: ActionFileNode): string {
  const files = flattenActionFiles(root.children).filter((file) => file.type === "file");
  return (
    files.find((file) => file.name === "action.json")?.path ??
    files.find((file) => file.name === "ACTION.md")?.path ??
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

onMounted(loadActions);
</script>

<style scoped>
.actions-page {
  --actions-page-panel-shadow: 0 10px 24px rgba(61, 43, 24, 0.04);
  --actions-page-card-shadow: 0 4px 12px rgba(61, 43, 24, 0.026);

  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.actions-page__hero,
.actions-page__toolbar,
.actions-page__empty,
.actions-page__notice {
  min-width: 0;
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-panel);
  box-shadow: var(--actions-page-panel-shadow);
}

.actions-page__metric,
.actions-page__selector,
.actions-page__detail {
  box-shadow: var(--actions-page-card-shadow);
}

.actions-page__hero > *,
.actions-page__search-field,
.actions-page__status-filter,
.actions-page__hero-actions,
.actions-page__selector,
.actions-page__detail,
.actions-page__detail-header > *,
.actions-page__taxonomy section,
.actions-page__columns section,
.actions-page__file-tree,
.actions-page__file-preview {
  min-width: 0;
}

.actions-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.actions-page__hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.actions-page__file-input {
  display: none;
}

.actions-page__eyebrow,
.actions-page__id {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.actions-page__title {
  margin: 8px 0 10px;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 2rem;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.actions-page__body,
.actions-page__detail-header p,
.actions-page__empty,
.actions-page__notice,
.actions-page__result-count,
.actions-page__source,
.actions-page__file-preview p,
.actions-page__file-state {
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.actions-page__body,
.actions-page__detail-header p,
.actions-page__file-preview p {
  margin: 0;
  overflow-wrap: anywhere;
}

.actions-page__refresh,
.actions-page__action {
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
  font: inherit;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.actions-page__refresh:hover,
.actions-page__action:hover {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 250, 242, 1);
  transform: translateY(-1px);
}

.actions-page__refresh:disabled,
.actions-page__action:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.actions-page__action--danger {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(255, 245, 242, 0.96);
  color: rgb(153, 27, 27);
}

.actions-page__refresh:focus-visible,
.actions-page__action:focus-visible,
.actions-page__selector-button:focus-visible,
.actions-page__file-tree-button:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.actions-page__overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.actions-page__metric {
  min-width: 0;
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.actions-page__metric span {
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.84rem;
}

.actions-page__metric strong {
  display: block;
  margin-top: 8px;
  color: var(--toograph-text-strong);
  font-size: 1.35rem;
}

.actions-page__toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 14px;
  align-items: end;
  padding: 16px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
}

.actions-page__search-field,
.actions-page__status-filter {
  display: grid;
  gap: 8px;
  color: rgba(60, 41, 20, 0.72);
}

.actions-page__search {
  width: 100%;
}

.actions-page__filter-tabs {
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

.actions-page__filter-tab {
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

.actions-page__filter-tab:hover {
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.68);
}

.actions-page__filter-tab--active {
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.1), 0 4px 10px rgba(154, 52, 18, 0.06);
}

.actions-page__filter-tab:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.actions-page__list {
  display: grid;
  gap: 12px;
}

.actions-page__empty,
.actions-page__notice {
  padding: 24px;
}

.actions-page__workspace {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  min-width: 0;
}

.actions-page__selector,
.actions-page__detail {
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-card);
}

.actions-page__selector {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 6px;
  max-height: calc(100vh - 120px);
  overflow: auto;
  padding: 12px;
}

.actions-page__result-count {
  padding: 4px 4px 8px;
  font-size: 0.84rem;
}

.actions-page__selector-item {
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

.actions-page__selector-item--active {
  border-color: rgba(154, 52, 18, 0.18);
  background: rgba(255, 248, 240, 0.96);
}

.actions-page__selector-button {
  min-width: 0;
  border: 0;
  padding: 6px 0;
  background: transparent;
  color: var(--toograph-text-strong);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.actions-page__selector-button span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-page__detail {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.actions-page__detail-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

.actions-page__detail-header h3,
.actions-page__detail h4,
.actions-page__file-preview h4 {
  margin: 0;
}

.actions-page__detail-header h3 {
  margin: 6px 0 8px;
  color: var(--toograph-text-strong);
  font-size: 1.28rem;
}

.actions-page__detail h4,
.actions-page__file-preview h4 {
  color: rgba(60, 41, 20, 0.76);
  font-size: 0.86rem;
}

.actions-page__actions,
.actions-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.actions-page__actions {
  margin-top: -4px;
}

.actions-page__taxonomy {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.actions-page__badges span,
.actions-page__schema-list span,
.actions-page__file-pill {
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

.actions-page__source {
  display: grid;
  gap: 4px;
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
}

.actions-page__source code {
  word-break: break-all;
}

.actions-page__instruction {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  font-size: 0.88rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.actions-page__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.actions-page__taxonomy section,
.actions-page__columns section,
.actions-page__schema-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.actions-page__file-browser {
  display: grid;
  grid-template-columns: minmax(210px, 0.38fr) minmax(0, 1fr);
  gap: 12px;
  border-top: 1px solid rgba(154, 52, 18, 0.08);
  padding-top: 16px;
}

.actions-page__file-tree,
.actions-page__file-preview {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 240px;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.36);
  padding: 12px;
}

.actions-page__file-tree {
  max-height: 520px;
  overflow: auto;
}

.actions-page__file-tree-button {
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

.actions-page__file-tree-button:hover:not(:disabled),
.actions-page__file-tree-button--active {
  border-color: rgba(154, 52, 18, 0.12);
  background: rgba(255, 248, 240, 0.9);
  color: rgb(154, 52, 18);
}

.actions-page__file-tree-button:disabled {
  cursor: default;
  opacity: 0.78;
}

.actions-page__file-tree-button--directory {
  color: rgba(60, 41, 20, 0.58);
  font-weight: 600;
}

.actions-page__file-tree-button span,
.actions-page__file-tree-button small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-page__file-tree-button small {
  color: rgba(60, 41, 20, 0.48);
  font-family: var(--toograph-font-mono);
  font-size: 0.72rem;
}

.actions-page__file-preview header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.actions-page__file-code {
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

.actions-page__file-state {
  display: grid;
  place-items: center;
  min-height: 150px;
  border: 1px dashed rgba(154, 52, 18, 0.12);
  border-radius: 14px;
  padding: 16px;
  text-align: center;
}

@media (max-width: 1180px) {
  .actions-page__detail-header,
  .actions-page__file-browser {
    grid-template-columns: 1fr;
  }

  .actions-page__taxonomy {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  .actions-page__workspace {
    grid-template-columns: 1fr;
  }

  .actions-page__selector {
    position: static;
    max-height: 360px;
  }

  .actions-page__toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .actions-page__hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .actions-page__hero-actions,
  .actions-page__refresh {
    width: 100%;
  }

  .actions-page__hero-actions {
    display: grid;
    grid-template-columns: 1fr;
    justify-content: stretch;
  }

  .actions-page__action {
    width: 100%;
  }

  .actions-page__title {
    font-size: 1.6rem;
  }

  .actions-page {
    max-width: 100%;
  }

  .actions-page__overview,
  .actions-page__taxonomy,
  .actions-page__columns {
    grid-template-columns: 1fr;
  }

  .actions-page__detail,
  .actions-page__selector {
    border-radius: 18px;
  }
}
</style>
