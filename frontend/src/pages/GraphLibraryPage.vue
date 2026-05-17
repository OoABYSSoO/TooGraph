<template>
  <AppShell>
    <input
      ref="pythonGraphImportInput"
      class="graph-library-page__file-input"
      type="file"
      accept=".py,text/x-python,text/plain"
      @change="handlePythonGraphImportSelection"
    />
    <section class="graph-library-page">
      <header class="graph-library-page__hero">
        <div>
          <div class="graph-library-page__eyebrow">{{ t("graphLibrary.eyebrow") }}</div>
          <h2 class="graph-library-page__title">{{ t("graphLibrary.title") }}</h2>
          <p class="graph-library-page__body">{{ t("graphLibrary.body") }}</p>
        </div>
        <div class="graph-library-page__quick-actions" role="group" :aria-label="t('graphLibrary.quickActions')">
          <button
            type="button"
            class="graph-library-page__primary-action"
            data-virtual-affordance-id="library.action.newBlankGraph"
            :data-virtual-affordance-label="t('graphLibrary.newBlankGraph')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="library.quickActions"
            data-virtual-affordance-actions="click"
            @click="openBlankEditorGraph"
          >
            {{ t("graphLibrary.newBlankGraph") }}
          </button>
          <button
            type="button"
            class="graph-library-page__secondary-action"
            data-virtual-affordance-id="library.action.importPython"
            :data-virtual-affordance-label="t('graphLibrary.importPython')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="library.quickActions"
            data-virtual-affordance-actions="click"
            @click="openPythonGraphImportDialog"
          >
            {{ t("graphLibrary.importPython") }}
          </button>
          <button type="button" class="graph-library-page__secondary-action" :disabled="loading" @click="loadCatalog">
            {{ loading ? t("graphLibrary.refreshing") : t("graphLibrary.refresh") }}
          </button>
        </div>
      </header>

      <section class="graph-library-page__overview" :aria-label="t('graphLibrary.overviewLabel')">
        <article class="graph-library-page__metric">
          <span>{{ t("graphLibrary.total") }}</span>
          <strong>{{ overview.total }}</strong>
        </article>
        <article class="graph-library-page__metric">
          <span>{{ t("graphLibrary.graphs") }}</span>
          <strong>{{ overview.graphs }}</strong>
        </article>
        <article class="graph-library-page__metric">
          <span>{{ t("graphLibrary.templates") }}</span>
          <strong>{{ overview.templates }}</strong>
        </article>
        <article class="graph-library-page__metric">
          <span>{{ t("graphLibrary.officialTemplates") }}</span>
          <strong>{{ overview.officialTemplates }}</strong>
        </article>
        <article class="graph-library-page__metric">
          <span>{{ t("graphLibrary.disabled") }}</span>
          <strong>{{ overview.disabled }}</strong>
        </article>
      </section>

      <section class="graph-library-page__toolbar" :aria-label="t('graphLibrary.filterLabel')">
        <label class="graph-library-page__search-field">
          <span>{{ t("common.search") }}</span>
          <ElInput
            v-model="query"
            class="graph-library-page__search"
            :placeholder="t('graphLibrary.searchPlaceholder')"
            clearable
            data-virtual-affordance-id="library.search.query"
            :data-virtual-affordance-label="t('common.search')"
            data-virtual-affordance-role="textbox"
            data-virtual-affordance-zone="library.toolbar"
            data-virtual-affordance-actions="focus,clear,type,press"
            data-virtual-affordance-input-kind="text"
            :data-virtual-affordance-value-preview="query"
          />
        </label>
        <div class="graph-library-page__filter-group">
          <span>{{ t("graphLibrary.statusFilter") }}</span>
          <div role="tablist" class="graph-library-page__filter-tabs" :aria-label="t('graphLibrary.statusFilter')">
            <button
              v-for="option in statusOptions"
              :key="option.value"
              type="button"
              role="tab"
              class="graph-library-page__filter-tab"
              :class="{ 'graph-library-page__filter-tab--active': statusFilter === option.value }"
              :aria-selected="statusFilter === option.value"
              :tabindex="statusFilter === option.value ? 0 : -1"
              :data-virtual-affordance-id="`library.filter.status.${option.value}`"
              :data-virtual-affordance-label="option.label"
              data-virtual-affordance-role="tab"
              data-virtual-affordance-zone="library.toolbar"
              data-virtual-affordance-actions="click"
              :data-virtual-affordance-current="statusFilter === option.value ? 'true' : undefined"
              @click="statusFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="graph-library-page__list">
        <article v-if="actionError" class="graph-library-page__notice">
          {{ t("graphLibrary.actionFailed", { error: actionError }) }}
        </article>
        <article v-if="loading" class="graph-library-page__empty">{{ t("common.loading") }}</article>
        <article v-else-if="error" class="graph-library-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
        <article v-else-if="filteredItems.length === 0" class="graph-library-page__empty">
          <p>{{ t("graphLibrary.empty") }}</p>
          <RouterLink class="graph-library-page__empty-action" to="/editor">{{ t("graphLibrary.openEditor") }}</RouterLink>
        </article>
        <template v-else>
          <div class="graph-library-page__result-count">{{ t("graphLibrary.resultCount", { count: filteredItems.length }) }}</div>
          <div class="graph-library-page__columns">
            <section
              v-for="column in libraryColumns"
              :key="column.key"
              class="graph-library-page__column"
              :class="column.className"
            >
              <div class="graph-library-page__column-header">
                <h3>{{ column.title }}</h3>
                <span>{{ t("graphLibrary.resultCount", { count: column.items.length }) }}</span>
              </div>
              <div class="graph-library-page__column-list">
                <article v-if="column.items.length === 0" class="graph-library-page__empty graph-library-page__empty--column">
                  {{ t("graphLibrary.empty") }}
                </article>
                <article v-for="item in column.items" :key="itemKey(item)" class="graph-library-page__card">
                  <button
                    type="button"
                    class="graph-library-page__card-open"
                    :aria-label="openItemLabel(item)"
                    :data-virtual-affordance-id="item.kind === 'template' ? `library.template.${item.id}.open` : `library.graph.${item.id}.open`"
                    :data-virtual-affordance-label="openItemLabel(item)"
                    data-virtual-affordance-role="button"
                    data-virtual-affordance-zone="library.catalog"
                    data-virtual-affordance-actions="click"
                    @click="openLibraryItem(item)"
                  >
                    <div class="graph-library-page__card-heading">
                      <div>
                        <div class="graph-library-page__id">{{ item.id }}</div>
                        <h3>{{ item.title }}</h3>
                        <p>{{ item.description || t("common.none") }}</p>
                      </div>
                      <div class="graph-library-page__badges">
                        <span>{{ t(`graphLibrary.${item.kind}`) }}</span>
                        <span>{{ t(`graphLibrary.${item.source}`) }}</span>
                        <span>{{ t(`graphLibrary.${item.status}`) }}</span>
                        <span v-if="!item.canManage" class="graph-library-page__badge--readonly">
                          {{ t("graphLibrary.readOnlyOfficial") }}
                        </span>
                      </div>
                    </div>

                    <div class="graph-library-page__card-bottom">
                      <div class="graph-library-page__meta">
                        <span>{{ t("graphLibrary.nodes", { count: item.nodeCount }) }}</span>
                        <span>{{ t("graphLibrary.edges", { count: item.edgeCount }) }}</span>
                        <span>{{ t("graphLibrary.states", { count: item.stateCount }) }}</span>
                      </div>
                      <span class="graph-library-page__open-hint">{{ openItemHint(item) }}</span>
                    </div>
                  </button>

                  <div class="graph-library-page__actions" role="group" :aria-label="t('graphLibrary.actions')" @click.stop>
                    <label v-if="item.kind === 'template'" class="graph-library-page__toggle">
                      <span>
                        {{
                          item.capabilityDiscoverable && item.status === "active"
                            ? t("graphLibrary.capabilityDiscoverableOn")
                            : t("graphLibrary.capabilityDiscoverableOff")
                        }}
                      </span>
                      <ElSwitch
                        :model-value="item.status === 'active' && item.capabilityDiscoverable"
                        :disabled="item.status !== 'active' || isItemActionPending(item)"
                        :aria-label="capabilityDiscoverableToggleLabel(item)"
                        @change="setTemplateCapabilityDiscoverable(item, Boolean($event))"
                      />
                    </label>
                    <template v-if="item.canManage">
                      <label class="graph-library-page__toggle">
                        <span>
                          {{ item.status === "active" ? t("graphLibrary.enabledStatus") : t("graphLibrary.disabledStatus") }}
                        </span>
                        <ElSwitch
                          :model-value="item.status === 'active'"
                          :disabled="isItemActionPending(item)"
                          :aria-label="enabledToggleLabel(item)"
                          @change="setItemEnabled(item, Boolean($event))"
                        />
                      </label>
                      <button
                        type="button"
                        class="graph-library-page__action"
                        :class="{ 'graph-library-page__action--danger': confirmingDeleteKey === itemKey(item) }"
                        :disabled="isItemActionPending(item)"
                        data-virtual-affordance-destructive="true"
                        data-virtual-affordance-requires-confirmation="true"
                        @click="deleteItemFromCatalog(item)"
                      >
                        {{ confirmingDeleteKey === itemKey(item) ? t("graphLibrary.confirmDelete") : t("graphLibrary.delete") }}
                      </button>
                    </template>
                    <span v-else class="graph-library-page__readonly-note">{{ t("graphLibrary.officialReadOnly") }}</span>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </template>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElInput, ElSwitch } from "element-plus";
import { useI18n } from "vue-i18n";

import {
  deleteGraph,
  deleteTemplate,
  fetchGraphs,
  fetchTemplates,
  importGraphFromPythonSource,
  updateGraphStatus,
  updateTemplateCapabilityDiscoverable,
  updateTemplateStatus,
} from "@/api/graphs";
import { isTooGraphPythonExportSource } from "@/editor/workspace/pythonImportModel";
import AppShell from "@/layouts/AppShell.vue";
import { cloneGraphDocument, createDraftFromTemplate } from "@/lib/graph-document";
import {
  createUnsavedWorkspaceTab,
  readPersistedEditorWorkspace,
  writePersistedEditorDocumentDraft,
  writePersistedEditorWorkspace,
} from "@/lib/editor-workspace";
import type { GraphCatalogStatus, GraphDocument, GraphPayload, TemplateRecord } from "@/types/node-system";

import {
  buildGraphLibraryItems,
  buildGraphLibraryOverview,
  filterGraphLibraryItems,
  splitGraphLibraryItems,
  type GraphLibraryItem,
  type GraphLibraryStatusFilter,
} from "./graphLibraryPageModel.ts";

const graphs = ref<GraphDocument[]>([]);
const templates = ref<TemplateRecord[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionItemKey = ref<string | null>(null);
const confirmingDeleteKey = ref<string | null>(null);
const pythonGraphImportInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const statusFilter = ref<GraphLibraryStatusFilter>("all");
const { t } = useI18n();
const router = useRouter();

const items = computed(() => buildGraphLibraryItems(graphs.value, templates.value));
const overview = computed(() => buildGraphLibraryOverview(items.value));
const filteredItems = computed(() =>
  filterGraphLibraryItems(items.value, { query: query.value, kind: "all", status: statusFilter.value }),
);
const filteredColumns = computed(() => splitGraphLibraryItems(filteredItems.value));
const libraryColumns = computed(() => [
  {
    key: "templates",
    className: "graph-library-page__column--templates",
    title: t("graphLibrary.templates"),
    items: filteredColumns.value.templates,
  },
  {
    key: "graphs",
    className: "graph-library-page__column--graphs",
    title: t("graphLibrary.graphs"),
    items: filteredColumns.value.graphs,
  },
]);
const statusOptions = computed(() =>
  (["all", "active", "disabled"] satisfies GraphLibraryStatusFilter[]).map((value) => ({
    value,
    label: value === "all" ? t("graphLibrary.allStatus") : t(`graphLibrary.${value}`),
  })),
);

async function loadCatalog() {
  loading.value = true;
  try {
    const [nextGraphs, nextTemplates] = await Promise.all([
      fetchGraphs({ includeDisabled: true }),
      fetchTemplates({ includeDisabled: true }),
    ]);
    graphs.value = nextGraphs;
    templates.value = nextTemplates;
    error.value = null;
    actionError.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loading");
  } finally {
    loading.value = false;
  }
}

function itemKey(item: GraphLibraryItem): string {
  return `${item.kind}:${item.id}`;
}

function enabledToggleLabel(item: GraphLibraryItem): string {
  return item.status === "active" ? t("graphLibrary.disable") : t("graphLibrary.enable");
}

function capabilityActionKey(item: GraphLibraryItem): string {
  return `capability:${itemKey(item)}`;
}

function isItemActionPending(item: GraphLibraryItem): boolean {
  return actionItemKey.value === itemKey(item) || actionItemKey.value === capabilityActionKey(item);
}

function capabilityDiscoverableToggleLabel(item: GraphLibraryItem): string {
  return item.capabilityDiscoverable && item.status === "active"
    ? t("graphLibrary.disableCapabilityDiscovery")
    : t("graphLibrary.enableCapabilityDiscovery");
}

function openBlankEditorGraph() {
  void router.push("/editor/new");
}

function openLibraryItem(item: GraphLibraryItem) {
  if (item.kind === "graph") {
    void router.push(`/editor/${encodeURIComponent(item.id)}`);
    return;
  }
  const template = templates.value.find((candidate) => candidate.template_id === item.id) ?? null;
  if (!template) {
    return;
  }
  openTemplateDraft(template);
  void router.push(`/editor/new?template=${encodeURIComponent(item.id)}`);
}

function openItemLabel(item: GraphLibraryItem): string {
  return item.kind === "graph"
    ? t("graphLibrary.openGraphLabel", { name: item.title })
    : t("graphLibrary.openTemplateLabel", { name: item.title });
}

function openItemHint(item: GraphLibraryItem): string {
  return item.kind === "graph" ? t("graphLibrary.openGraph") : t("graphLibrary.useTemplate");
}

function openPythonGraphImportDialog() {
  pythonGraphImportInput.value?.click();
}

async function handlePythonGraphImportSelection(event: Event) {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  const file = target?.files?.[0] ?? null;
  if (target) {
    target.value = "";
  }
  if (!file) {
    return;
  }

  actionError.value = null;
  try {
    const source = await file.text();
    if (!isTooGraphPythonExportSource(source)) {
      actionError.value = t("graphLibrary.importPythonNotExport", { file: file.name });
      return;
    }
    openImportedGraphDraft(await importGraphFromPythonSource(source), file.name);
    void router.push("/editor/new");
  } catch (importError) {
    actionError.value = importError instanceof Error ? importError.message : t("graphLibrary.importPythonFailed");
  }
}

function openImportedGraphDraft(graph: GraphPayload, fileName: string) {
  const importedGraph = cloneGraphDocument({
    ...graph,
    graph_id: null,
    name: graph.name?.trim() || fileName.replace(/\.py$/i, "") || "Imported Graph",
  });
  const tab = {
    ...createUnsavedWorkspaceTab({
      kind: "new",
      title: importedGraph.name,
    }),
    dirty: true,
  };
  const workspace = readPersistedEditorWorkspace();
  writePersistedEditorDocumentDraft(tab.tabId, importedGraph);
  writePersistedEditorWorkspace({
    activeTabId: tab.tabId,
    tabs: [...workspace.tabs, tab],
  });
}

function openTemplateDraft(template: TemplateRecord) {
  const draft = createDraftFromTemplate(template);
  const tab = createUnsavedWorkspaceTab({
    kind: "template",
    title: template.label,
    templateId: template.template_id,
    defaultTemplateId: template.template_id,
  });
  const workspace = readPersistedEditorWorkspace();
  writePersistedEditorDocumentDraft(tab.tabId, draft);
  writePersistedEditorWorkspace({
    activeTabId: tab.tabId,
    tabs: [...workspace.tabs, tab],
  });
}

function replaceGraph(updatedGraph: GraphDocument) {
  graphs.value = graphs.value.map((graph) => (graph.graph_id === updatedGraph.graph_id ? updatedGraph : graph));
}

function replaceTemplate(updatedTemplate: TemplateRecord) {
  templates.value = templates.value.map((template) =>
    template.template_id === updatedTemplate.template_id ? updatedTemplate : template,
  );
}

async function setItemEnabled(item: GraphLibraryItem, enabled: boolean) {
  if (!item.canManage) {
    return;
  }
  const nextStatus: GraphCatalogStatus = enabled ? "active" : "disabled";
  actionItemKey.value = itemKey(item);
  actionError.value = null;
  confirmingDeleteKey.value = null;
  try {
    if (item.kind === "graph") {
      replaceGraph(await updateGraphStatus(item.id, nextStatus));
    } else {
      replaceTemplate(await updateTemplateStatus(item.id, nextStatus));
    }
  } catch (updateError) {
    actionError.value = updateError instanceof Error ? updateError.message : t("common.loading");
  } finally {
    actionItemKey.value = null;
  }
}

async function setTemplateCapabilityDiscoverable(item: GraphLibraryItem, capabilityDiscoverable: boolean) {
  if (item.kind !== "template" || item.status !== "active") {
    return;
  }
  actionItemKey.value = capabilityActionKey(item);
  actionError.value = null;
  confirmingDeleteKey.value = null;
  try {
    replaceTemplate(await updateTemplateCapabilityDiscoverable(item.id, capabilityDiscoverable));
  } catch (updateError) {
    actionError.value = updateError instanceof Error ? updateError.message : t("common.loading");
  } finally {
    actionItemKey.value = null;
  }
}

async function deleteItemFromCatalog(item: GraphLibraryItem) {
  if (!item.canManage) {
    return;
  }
  const key = itemKey(item);
  if (confirmingDeleteKey.value !== key) {
    confirmingDeleteKey.value = key;
    return;
  }
  actionItemKey.value = key;
  actionError.value = null;
  try {
    if (item.kind === "graph") {
      await deleteGraph(item.id);
      graphs.value = graphs.value.filter((graph) => graph.graph_id !== item.id);
    } else {
      await deleteTemplate(item.id);
      templates.value = templates.value.filter((template) => template.template_id !== item.id);
    }
    confirmingDeleteKey.value = null;
  } catch (deleteError) {
    actionError.value = deleteError instanceof Error ? deleteError.message : t("common.loading");
  } finally {
    actionItemKey.value = null;
  }
}

onMounted(loadCatalog);
</script>

<style scoped>
.graph-library-page {
  --graph-library-panel-shadow: 0 10px 24px rgba(61, 43, 24, 0.04);
  --graph-library-card-shadow: 0 4px 12px rgba(61, 43, 24, 0.026);

  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.graph-library-page__file-input {
  display: none;
}

.graph-library-page__hero,
.graph-library-page__toolbar,
.graph-library-page__metric,
.graph-library-page__card,
.graph-library-page__empty,
.graph-library-page__notice {
  min-width: 0;
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-panel);
  box-shadow: var(--graph-library-panel-shadow);
}

.graph-library-page__hero > *,
.graph-library-page__search-field,
.graph-library-page__filter-group,
.graph-library-page__card-open,
.graph-library-page__card-heading > * {
  min-width: 0;
}

.graph-library-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.graph-library-page__eyebrow,
.graph-library-page__id {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.graph-library-page__title {
  margin: 8px 0 10px;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 2rem;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.graph-library-page__body,
.graph-library-page__card p,
.graph-library-page__meta,
.graph-library-page__empty,
.graph-library-page__notice,
.graph-library-page__result-count,
.graph-library-page__readonly-note {
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.graph-library-page__body,
.graph-library-page__card p {
  margin: 0;
  overflow-wrap: anywhere;
}

.graph-library-page__quick-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.graph-library-page__primary-action,
.graph-library-page__secondary-action,
.graph-library-page__empty-action,
.graph-library-page__action {
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
  font: inherit;
  text-decoration: none;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.graph-library-page__primary-action {
  background: rgb(154, 52, 18);
  color: rgb(255, 252, 247);
  box-shadow: 0 10px 20px rgba(154, 52, 18, 0.14);
}

.graph-library-page__primary-action:hover {
  border-color: rgba(154, 52, 18, 0.4);
  background: rgb(132, 45, 16);
  transform: translateY(-1px);
}

.graph-library-page__secondary-action:hover,
.graph-library-page__empty-action:hover,
.graph-library-page__action:hover {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 250, 242, 1);
  transform: translateY(-1px);
}

.graph-library-page__secondary-action:disabled,
.graph-library-page__action:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.graph-library-page__action--danger {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(255, 245, 242, 0.96);
  color: rgb(153, 27, 27);
}

.graph-library-page__primary-action:focus-visible,
.graph-library-page__secondary-action:focus-visible,
.graph-library-page__empty-action:focus-visible,
.graph-library-page__action:focus-visible,
.graph-library-page__card-open:focus-visible,
.graph-library-page__filter-tab:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.graph-library-page__overview {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.graph-library-page__metric {
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: var(--graph-library-card-shadow);
}

.graph-library-page__metric span {
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.84rem;
}

.graph-library-page__metric strong {
  display: block;
  margin-top: 8px;
  color: var(--toograph-text-strong);
  font-size: 1.35rem;
}

.graph-library-page__toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 14px;
  align-items: end;
  padding: 16px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
}

.graph-library-page__search-field,
.graph-library-page__filter-group {
  display: grid;
  gap: 8px;
  color: rgba(60, 41, 20, 0.72);
}

.graph-library-page__search {
  width: 100%;
}

.graph-library-page__filter-tabs {
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

.graph-library-page__filter-tab {
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

.graph-library-page__filter-tab:hover {
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.68);
}

.graph-library-page__filter-tab--active {
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.1), 0 4px 10px rgba(154, 52, 18, 0.06);
}

.graph-library-page__list {
  display: grid;
  gap: 12px;
}

.graph-library-page__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.graph-library-page__column,
.graph-library-page__column-list {
  display: grid;
  min-width: 0;
}

.graph-library-page__column {
  gap: 12px;
}

.graph-library-page__column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 0 2px;
}

.graph-library-page__column-header h3 {
  margin: 0;
  color: var(--toograph-text-strong);
  font-size: 1rem;
}

.graph-library-page__column-header span {
  flex: 0 0 auto;
  color: rgba(60, 41, 20, 0.62);
  font-family: var(--toograph-font-mono);
  font-size: 0.78rem;
}

.graph-library-page__column-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.graph-library-page__empty,
.graph-library-page__notice {
  padding: 24px;
}

.graph-library-page__empty--column {
  min-height: 112px;
}

.graph-library-page__card {
  display: grid;
  gap: 10px;
  padding: 0;
  background: var(--toograph-surface-card);
  box-shadow: var(--graph-library-card-shadow);
  overflow: hidden;
}

.graph-library-page__card-open {
  display: grid;
  gap: 14px;
  width: 100%;
  border: 0;
  padding: 18px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background-color 160ms ease;
}

.graph-library-page__card-open:hover {
  background: rgba(255, 248, 240, 0.5);
}

.graph-library-page__card-open:active {
  background: rgba(255, 245, 234, 0.72);
}

.graph-library-page__card-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.graph-library-page__card h3 {
  margin: 6px 0 8px;
  color: var(--toograph-text-strong);
}

.graph-library-page__card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.graph-library-page__badges,
.graph-library-page__meta,
.graph-library-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.graph-library-page__badges {
  justify-content: flex-end;
  align-content: flex-start;
}

.graph-library-page__badges span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
}

.graph-library-page__badges .graph-library-page__badge--readonly {
  border-color: rgba(100, 116, 139, 0.16);
  background: rgba(248, 250, 252, 0.88);
  color: rgb(71, 85, 105);
}

.graph-library-page__meta {
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
}

.graph-library-page__open-hint {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(154, 52, 18, 0.08);
  color: rgb(154, 52, 18);
  font-size: 0.82rem;
}

.graph-library-page__actions {
  align-items: center;
  border-top: 1px solid rgba(154, 52, 18, 0.08);
  padding: 10px 18px 14px;
  background: rgba(255, 255, 255, 0.28);
}

.graph-library-page__toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 14px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.54);
  color: rgba(60, 41, 20, 0.72);
}

.graph-library-page__readonly-note {
  border: 1px solid rgba(100, 116, 139, 0.14);
  border-radius: 14px;
  padding: 8px 12px;
  background: rgba(248, 250, 252, 0.72);
}

@media (max-width: 1280px) {
  .graph-library-page__column-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .graph-library-page__overview {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .graph-library-page__toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .graph-library-page__columns {
    grid-template-columns: 1fr;
  }

  .graph-library-page__column-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .graph-library-page__hero,
  .graph-library-page__card-heading,
  .graph-library-page__card-bottom {
    display: grid;
  }

  .graph-library-page__quick-actions,
  .graph-library-page__primary-action,
  .graph-library-page__secondary-action {
    width: 100%;
  }

  .graph-library-page__overview {
    grid-template-columns: 1fr;
  }

  .graph-library-page__column-list {
    grid-template-columns: 1fr;
  }

  .graph-library-page {
    max-width: calc(100vw - var(--app-sidebar-width) - 56px);
  }
}
</style>
