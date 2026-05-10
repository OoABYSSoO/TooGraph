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
                        :disabled="!item.canToggleCapabilityDiscoverable || isItemActionPending(item)"
                        :aria-label="capabilityDiscoverableToggleLabel(item)"
                        @change="setTemplateCapabilityDiscoverable(item, Boolean($event))"
                      />
                    </label>
                    <template v-if="item.canManage">
                      <button
                        v-if="item.kind === 'graph'"
                        type="button"
                        class="graph-library-page__action"
                        :disabled="isItemActionPending(item) || isGraphRevisionHistoryPending(item)"
                        :aria-label="t('graphLibrary.historyLabel', { name: item.title })"
                        :data-virtual-affordance-id="`library.graph.${item.id}.history`"
                        :data-virtual-affordance-label="t('graphLibrary.historyLabel', { name: item.title })"
                        data-virtual-affordance-role="button"
                        data-virtual-affordance-zone="library.catalog"
                        data-virtual-affordance-actions="click"
                        @click="openGraphRevisionHistory(item)"
                      >
                        {{
                          isGraphRevisionHistoryPending(item)
                            ? t("graphLibrary.loadingRevisions")
                            : t("graphLibrary.history")
                        }}
                      </button>
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

      <ElDialog
        v-model="graphRevisionDialogOpen"
        class="graph-library-page__revision-dialog"
        :title="revisionDialogTitle"
        width="min(720px, calc(100vw - 32px))"
        :modal-class="'graph-library-page__revision-dialog-overlay'"
        destroy-on-close
      >
        <section class="graph-library-page__revision-panel">
          <p class="graph-library-page__revision-body">{{ t("graphLibrary.revisionDialogBody") }}</p>
          <article v-if="graphRevisionLoading" class="graph-library-page__empty graph-library-page__empty--compact">
            {{ t("common.loading") }}
          </article>
          <article v-else-if="graphRevisionError" class="graph-library-page__notice">
            {{ t("common.failedToLoad", { error: graphRevisionError }) }}
          </article>
          <article v-else-if="graphRevisionRows.length === 0" class="graph-library-page__empty graph-library-page__empty--compact">
            {{ t("graphLibrary.noRevisions") }}
          </article>
          <div v-else class="graph-library-page__revision-list">
            <article v-for="row in graphRevisionRows" :key="row.revisionId" class="graph-library-page__revision-row">
              <div class="graph-library-page__revision-main">
                <div>
                  <div class="graph-library-page__id">{{ row.revisionId }}</div>
                  <h3>{{ row.reason || t("graphLibrary.revisionNoReason") }}</h3>
                  <p>{{ formatRevisionTimestamp(row.createdAt) }}</p>
                </div>
                <button
                  type="button"
                  class="graph-library-page__action graph-library-page__action--danger"
                  :disabled="restoreRevisionActionId === row.revisionId"
                  :data-virtual-affordance-id="`library.graph.${graphRevisionGraphId}.revision.${row.revisionId}.restore`"
                  :data-virtual-affordance-label="
                    row.restoresToDeletion
                      ? t('graphLibrary.restoreRevisionDeletesGraph')
                      : t('graphLibrary.restoreRevisionAction')
                  "
                  data-virtual-affordance-role="button"
                  data-virtual-affordance-zone="library.revisionHistory"
                  data-virtual-affordance-actions="click"
                  data-virtual-affordance-destructive="true"
                  data-virtual-affordance-requires-confirmation="true"
                  @click="restoreGraphRevisionFromHistory(row)"
                >
                  {{
                    row.restoresToDeletion
                      ? t("graphLibrary.restoreRevisionDeletesGraph")
                      : t("graphLibrary.restoreRevisionAction")
                  }}
                </button>
              </div>
              <div class="graph-library-page__revision-path">
                <span>
                  {{ t("graphLibrary.revisionRestoreTarget", { name: row.previousName || t("graphLibrary.deletedGraph") }) }}
                </span>
                <span>
                  {{ t("graphLibrary.revisionChangedTo", { name: row.nextName || t("graphLibrary.deletedGraph") }) }}
                </span>
              </div>
              <div class="graph-library-page__revision-meta">
                <span>{{ t("graphLibrary.revisionActor", { actor: row.actor || t("common.none") }) }}</span>
                <span>{{ t("graphLibrary.revisionDiffCount", { count: row.diffCount }) }}</span>
                <span v-if="row.runId">{{ t("graphLibrary.revisionRun", { runId: row.runId }) }}</span>
              </div>
            </article>
          </div>
        </section>
      </ElDialog>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElDialog, ElInput, ElMessage, ElMessageBox, ElSwitch } from "element-plus";
import { useI18n } from "vue-i18n";

import {
  deleteGraph,
  deleteTemplate,
  fetchGraphRevisions,
  fetchGraphs,
  fetchTemplates,
  importGraphFromPythonSource,
  restoreGraphRevision,
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
import type { GraphCatalogStatus, GraphDocument, GraphPayload, GraphRevisionRecord, TemplateRecord } from "@/types/node-system";

import {
  buildGraphRevisionHistoryRows,
  buildGraphLibraryItems,
  buildGraphLibraryOverview,
  filterGraphLibraryItems,
  splitGraphLibraryItems,
  type GraphRevisionHistoryRow,
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
const graphRevisionDialogOpen = ref(false);
const graphRevisionGraphId = ref("");
const graphRevisionGraphTitle = ref("");
const graphRevisionLoadingGraphId = ref("");
const graphRevisionLoading = ref(false);
const graphRevisionError = ref<string | null>(null);
const graphRevisions = ref<GraphRevisionRecord[]>([]);
const restoreRevisionActionId = ref("");
const query = ref("");
const statusFilter = ref<GraphLibraryStatusFilter>("all");
const { t, locale } = useI18n();
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
const graphRevisionRows = computed(() => buildGraphRevisionHistoryRows(graphRevisions.value));
const revisionDialogTitle = computed(() =>
  graphRevisionGraphTitle.value
    ? t("graphLibrary.revisionDialogTitle", { name: graphRevisionGraphTitle.value })
    : t("graphLibrary.history"),
);
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

function isGraphRevisionHistoryPending(item: GraphLibraryItem): boolean {
  return graphRevisionLoadingGraphId.value === item.id;
}

function capabilityDiscoverableToggleLabel(item: GraphLibraryItem): string {
  if (item.capabilityDiscoverableBlockedReason) {
    return t("graphLibrary.capabilityDiscoverableBlocked");
  }
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
  if (item.kind !== "template" || !item.canToggleCapabilityDiscoverable) {
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

async function openGraphRevisionHistory(item: GraphLibraryItem) {
  if (item.kind !== "graph") {
    return;
  }
  graphRevisionDialogOpen.value = true;
  graphRevisionGraphId.value = item.id;
  graphRevisionGraphTitle.value = item.title;
  await loadGraphRevisionHistory(item.id);
}

async function loadGraphRevisionHistory(graphId = graphRevisionGraphId.value) {
  if (!graphId) {
    return;
  }
  graphRevisionLoading.value = true;
  graphRevisionLoadingGraphId.value = graphId;
  graphRevisionError.value = null;
  try {
    graphRevisions.value = await fetchGraphRevisions(graphId);
  } catch (loadError) {
    graphRevisionError.value = loadError instanceof Error ? loadError.message : t("common.loading");
  } finally {
    graphRevisionLoading.value = false;
    graphRevisionLoadingGraphId.value = "";
  }
}

async function restoreGraphRevisionFromHistory(row: GraphRevisionHistoryRow) {
  if (!graphRevisionGraphId.value || restoreRevisionActionId.value) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      row.restoresToDeletion
        ? t("graphLibrary.restoreRevisionDeletesConfirm")
        : t("graphLibrary.restoreRevisionConfirm", { name: row.previousName || t("common.none") }),
      t("graphLibrary.restoreRevisionTitle"),
      {
        confirmButtonText: row.restoresToDeletion
          ? t("graphLibrary.restoreRevisionDeletesGraph")
          : t("graphLibrary.restoreRevisionAction"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      },
    );
  } catch {
    return;
  }

  restoreRevisionActionId.value = row.revisionId;
  actionError.value = null;
  graphRevisionError.value = null;
  try {
    const response = await restoreGraphRevision(graphRevisionGraphId.value, row.revisionId);
    if (response.graph) {
      replaceGraph(response.graph);
      graphRevisionGraphTitle.value = response.graph.name;
      await loadGraphRevisionHistory(response.graph.graph_id);
    } else {
      graphs.value = graphs.value.filter((graph) => graph.graph_id !== graphRevisionGraphId.value);
      graphRevisionDialogOpen.value = false;
      graphRevisions.value = [];
      graphRevisionGraphId.value = "";
      graphRevisionGraphTitle.value = "";
    }
    ElMessage.success(t("graphLibrary.revisionRestored", { revisionId: response.restored_revision_id }));
  } catch (restoreError) {
    const message = restoreError instanceof Error ? restoreError.message : t("common.failedToSave", { error: "" });
    actionError.value = message;
    graphRevisionError.value = message;
  } finally {
    restoreRevisionActionId.value = "";
  }
}

function formatRevisionTimestamp(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return createdAt || t("common.none");
  }
  return new Intl.DateTimeFormat(locale.value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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
  overflow-wrap: anywhere;
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
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
  box-sizing: border-box;
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
  flex-wrap: wrap;
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
  display: grid;
  flex: 1 1 160px;
  grid-template-columns: 1fr;
  min-width: 0;
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
}

.graph-library-page__open-hint {
  flex: 0 1 auto;
  margin-left: auto;
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

:global(.graph-library-page__revision-dialog-overlay.el-overlay) {
  background: rgba(42, 24, 14, 0.22);
  backdrop-filter: blur(8px) saturate(0.96);
}

:global(.graph-library-page__revision-dialog.el-dialog) {
  display: flex;
  max-height: calc(100vh - 64px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 22px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow:
    0 24px 72px rgba(66, 31, 17, 0.16),
    var(--toograph-glass-highlight),
    var(--toograph-glass-rim);
}

:global(.graph-library-page__revision-dialog.el-dialog .el-dialog__body) {
  overflow: auto;
  padding-top: 0;
}

.graph-library-page__revision-panel,
.graph-library-page__revision-list {
  display: grid;
  gap: 12px;
}

.graph-library-page__revision-body,
.graph-library-page__revision-row p,
.graph-library-page__revision-meta,
.graph-library-page__revision-path {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.55;
}

.graph-library-page__empty--compact {
  padding: 16px;
}

.graph-library-page__revision-row {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 252, 247, 0.82);
}

.graph-library-page__revision-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.graph-library-page__revision-main h3 {
  margin: 4px 0 4px;
  color: var(--toograph-text-strong);
  font-size: 0.98rem;
}

.graph-library-page__revision-path,
.graph-library-page__revision-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.86rem;
}

.graph-library-page__revision-path span,
.graph-library-page__revision-meta span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 9px;
  background: rgba(255, 248, 240, 0.68);
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
  .graph-library-page__card-bottom,
  .graph-library-page__revision-main {
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
