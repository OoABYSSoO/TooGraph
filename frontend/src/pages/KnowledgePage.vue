<template>
  <AppShell>
    <section class="knowledge-page">
      <header class="knowledge-page__header">
        <div>
          <div class="knowledge-page__eyebrow">{{ t("knowledge.eyebrow") }}</div>
          <h2 class="knowledge-page__title">{{ t("knowledge.title") }}</h2>
          <p class="knowledge-page__body">{{ t("knowledge.body") }}</p>
        </div>
        <div class="knowledge-page__header-actions">
          <ElButton
            class="knowledge-page__action"
            :loading="loading"
            data-virtual-affordance-id="knowledge.action.refresh"
            :data-virtual-affordance-label="t('knowledge.refresh')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="knowledge.header"
            data-virtual-affordance-actions="click"
            @click="loadKnowledgeWorkspace"
          >
            <ElIcon aria-hidden="true"><Refresh /></ElIcon>
            <span>{{ t("knowledge.refresh") }}</span>
          </ElButton>
        </div>
      </header>

      <section class="knowledge-page__overview" :aria-label="t('knowledge.overviewLabel')">
        <article v-for="item in overview" :key="item.key" class="knowledge-page__metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <article v-if="error" class="knowledge-page__notice">
        {{ t("common.failedToLoad", { error }) }}
      </article>
      <article v-if="actionError" class="knowledge-page__notice">
        {{ t("knowledge.actionFailed", { error: actionError }) }}
      </article>

      <section class="knowledge-page__layout">
        <aside class="knowledge-page__base-panel" :aria-label="t('knowledge.baseList')">
          <div class="knowledge-page__panel-heading">
            <div>
              <span class="knowledge-page__section-kicker">{{ t("knowledge.baseList") }}</span>
              <h3>{{ t("knowledge.baseCount", { count: bases.length }) }}</h3>
            </div>
          </div>

          <article v-if="loading" class="knowledge-page__empty">{{ t("common.loading") }}</article>
          <article v-else-if="bases.length === 0" class="knowledge-page__empty">{{ t("knowledge.noBases") }}</article>
          <div v-else class="knowledge-page__base-list">
            <article
              v-for="base in bases"
              :key="base.collection_id"
              class="knowledge-page__base-card"
              :class="{ 'knowledge-page__base-card--active': selectedCollectionId === base.collection_id }"
            >
              <button type="button" class="knowledge-page__base-card-main" @click="selectKnowledgeBase(base.collection_id)">
                <div class="knowledge-page__base-card-heading">
                  <strong>{{ base.name || base.collection_id }}</strong>
                  <span class="knowledge-page__status" :class="knowledgeStatusClass(base)">
                    {{ knowledgeStatusLabel(base) }}
                  </span>
                </div>
                <span class="knowledge-page__id" :title="base.collection_id">{{ base.collection_id }}</span>
                <div class="knowledge-page__mini-progress">
                  <ElProgress :percentage="knowledgeProgressPercent(base)" :show-text="false" :stroke-width="4" />
                  <span>{{ t("knowledge.indexingProgress", { percent: knowledgeProgressPercent(base) }) }}</span>
                </div>
                <div class="knowledge-page__badges">
                  <span>{{ t("knowledge.documents", { count: base.document_count }) }}</span>
                  <span>{{ t("knowledge.chunks", { count: base.chunk_count }) }}</span>
                </div>
              </button>
            </article>
          </div>
        </aside>

        <section class="knowledge-page__detail-panel">
          <article class="knowledge-page__import-panel">
            <div class="knowledge-page__panel-heading">
              <div>
                <span class="knowledge-page__section-kicker">{{ t("knowledge.importFolder") }}</span>
                <h3>{{ t("knowledge.importAndIngest") }}</h3>
                <p class="knowledge-page__muted">{{ t("knowledge.importFolderBody") }}</p>
              </div>
            </div>

            <ElForm class="knowledge-page__form" label-position="top" @submit.prevent>
              <div class="knowledge-page__form-grid">
                <ElFormItem :label="t('knowledge.knowledgeName')" required>
                  <ElInput v-model="importDraft.name" :placeholder="t('knowledge.knowledgeNamePlaceholder')" />
                </ElFormItem>
                <ElFormItem :label="t('knowledge.collectionId')">
                  <ElInput v-model="importDraft.collection_id" :placeholder="t('knowledge.collectionIdPlaceholder')" />
                </ElFormItem>
                <ElFormItem class="knowledge-page__form-field--wide" :label="t('knowledge.sourcePath')" required>
                  <div class="knowledge-page__path-control">
                    <ElInput
                      v-model="importDraft.source_path"
                      :placeholder="t('knowledge.sourcePathPlaceholder')"
                    />
                    <ElButton
                      class="knowledge-page__action"
                      type="default"
                      data-virtual-affordance-id="knowledge.action.openFolder"
                      :data-virtual-affordance-label="t('knowledge.openFolder')"
                      data-virtual-affordance-role="button"
                      data-virtual-affordance-zone="knowledge.import"
                      data-virtual-affordance-actions="click"
                      @click="openFolderPicker"
                    >
                      <ElIcon aria-hidden="true"><FolderOpened /></ElIcon>
                      <span>{{ t("knowledge.openFolder") }}</span>
                    </ElButton>
                  </div>
                </ElFormItem>
                <ElFormItem class="knowledge-page__form-field--wide" :label="t('knowledge.template')" required>
                  <div class="knowledge-page__template-control">
                    <ElSelect
                      v-model="importDraft.template_id"
                      class="knowledge-page__select toograph-select"
                      popper-class="toograph-select-popper"
                      filterable
                      :loading="templatesLoading"
                      :placeholder="t('knowledge.templatePlaceholder')"
                      @change="selectIngestionTemplate"
                    >
                      <ElOption
                        v-for="option in templateOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                        :disabled="option.disabled"
                      >
                        <span class="knowledge-page__template-option">
                          <strong>{{ option.name }}</strong>
                          <small>{{ option.disabledReason || option.value }}</small>
                        </span>
                      </ElOption>
                    </ElSelect>
                    <ElButton
                      class="knowledge-page__action"
                      :disabled="templatesLoading"
                      @click="resetTemplateBindingToDefault"
                    >
                      {{ t("knowledge.resetDefaultBinding") }}
                    </ElButton>
                  </div>
                </ElFormItem>
                <ElFormItem class="knowledge-page__form-field--wide" :label="t('knowledge.folderInput')" required>
                  <ElSelect
                    v-model="selectedFolderInputNodeId"
                    class="knowledge-page__select toograph-select"
                    popper-class="toograph-select-popper"
                    filterable
                    :disabled="!selectedImportTemplate || folderInputNodeOptions.length === 0"
                    :placeholder="t('knowledge.folderInputPlaceholder')"
                  >
                    <ElOption
                      v-for="option in folderInputNodeOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                      :disabled="option.disabled"
                    >
                      <span
                        class="knowledge-page__binding-option"
                        :class="{ 'knowledge-page__binding-option--disabled': option.disabled }"
                      >
                        <span class="knowledge-page__binding-option-main">
                          <strong>{{ option.nodeName }}</strong>
                          <small>{{ option.stateName || t("common.state") }}</small>
                        </span>
                        <code>{{ option.stateKey || option.value }}</code>
                        <small v-if="option.disabledReason" class="knowledge-page__binding-option-reason">
                          {{ option.disabledReason }}
                        </small>
                      </span>
                    </ElOption>
                  </ElSelect>
                  <div
                    v-if="selectedFolderInputOption"
                    class="knowledge-page__binding-state-card"
                    aria-live="polite"
                  >
                    <span>{{ t("knowledge.selectedFolderInput") }}</span>
                    <strong>{{ selectedFolderInputOption.stateName || t("common.state") }}</strong>
                    <code>{{ selectedFolderInputOption.stateKey }}</code>
                  </div>
                  <div v-else class="knowledge-page__binding-state-card knowledge-page__binding-state-card--empty">
                    <span>{{ t("knowledge.selectedFolderInput") }}</span>
                    <strong>{{ t("knowledge.noFolderInput") }}</strong>
                  </div>
                </ElFormItem>
              </div>

              <div class="knowledge-page__save-row">
                <ElButton
                  type="primary"
                  class="knowledge-page__action"
                  :loading="importing"
                  data-virtual-affordance-id="knowledge.action.importFolder"
                  :data-virtual-affordance-label="t('knowledge.importAndIngest')"
                  data-virtual-affordance-role="button"
                  data-virtual-affordance-zone="knowledge.import"
                  data-virtual-affordance-actions="click"
                  @click="importFolderAndRunIngestion"
                >
                  <ElIcon aria-hidden="true"><FolderOpened /></ElIcon>
                  <span>{{ t("knowledge.importAndIngest") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>

          <article v-if="!selectedBase" class="knowledge-page__empty">{{ t("knowledge.noBases") }}</article>
          <template v-else>
            <section class="knowledge-page__facts">
              <article>
                <span>{{ t("knowledge.managedSource") }}</span>
                <strong>{{ selectedBase.source_root || t("common.none") }}</strong>
              </article>
              <article>
                <span>{{ t("knowledge.copiedSource") }}</span>
                <strong>{{ selectedBase.original_path || t("common.none") }}</strong>
              </article>
              <article>
                <span>{{ t("knowledge.template") }}</span>
                <strong>{{ selectedBase.template_id || t("common.none") }}</strong>
              </article>
              <article>
                <span>{{ t("scheduler.lastRun") }}</span>
                <RouterLink
                  v-if="selectedBase.last_run_id"
                  class="knowledge-page__run-link"
                  :to="`/runs/${encodeURIComponent(selectedBase.last_run_id)}`"
                >
                  {{ shortId(selectedBase.last_run_id) }}
                </RouterLink>
                <strong v-else>{{ t("common.none") }}</strong>
              </article>
            </section>

            <section class="knowledge-page__operation-panel">
              <div class="knowledge-page__operation-heading">
                <div>
                  <span class="knowledge-page__section-kicker">{{ t("knowledge.indexingProgress", { percent: selectedBaseProgress }) }}</span>
                  <h3>{{ knowledgeStatusLabel(selectedBase) }}</h3>
                  <p class="knowledge-page__muted">{{ t("knowledge.modelSettingsHint") }}</p>
                </div>
                <strong class="knowledge-page__progress-percent">{{ selectedBaseProgress }}%</strong>
              </div>

              <ElProgress class="knowledge-page__progress" :percentage="selectedBaseProgress" :stroke-width="8" />

              <div class="knowledge-page__job-grid" :aria-label="t('knowledge.indexingProgress', { percent: selectedBaseProgress })">
                <article v-for="job in selectedBaseJobStats" :key="job.key">
                  <span>{{ job.label }}</span>
                  <strong>{{ job.value }}</strong>
                </article>
              </div>

              <dl class="knowledge-page__operation-meta">
                <div>
                  <dt>{{ t("knowledge.operationStatus") }}</dt>
                  <dd>{{ selectedBase.current_operation?.status || selectedBase.indexing_status || t("common.none") }}</dd>
                </div>
                <div>
                  <dt>{{ t("knowledge.operationStage") }}</dt>
                  <dd>{{ selectedBase.current_operation?.stage || t("common.none") }}</dd>
                </div>
                <div>
                  <dt>{{ t("knowledge.operationId") }}</dt>
                  <dd :title="selectedBase.current_operation?.operation_id || ''">
                    {{ selectedBase.current_operation?.operation_id ? shortId(selectedBase.current_operation.operation_id) : t("common.none") }}
                  </dd>
                </div>
              </dl>

              <article v-if="selectedOperationError" class="knowledge-page__operation-alert">
                <div>
                  <span class="knowledge-page__section-kicker">{{ t("knowledge.lastIndexingError") }}</span>
                  <strong>{{ selectedOperationError.message }}</strong>
                  <small v-if="selectedOperationError.type">{{ selectedOperationError.type }}</small>
                  <small v-if="selectedOperationError.nextRetryAt">
                    {{ t("knowledge.nextRetryAt", { value: selectedOperationError.nextRetryAt }) }}
                  </small>
                </div>
              </article>

              <div class="knowledge-page__operation-actions">
                <ElButton
                  class="knowledge-page__action"
                  :loading="operationActionLoading === 'retry'"
                  :disabled="!canRetrySelectedOperation || Boolean(operationActionLoading)"
                  @click="retrySelectedOperation"
                >
                  {{ t("knowledge.retryNow") }}
                </ElButton>
                <ElButton
                  class="knowledge-page__action"
                  :loading="operationActionLoading === 'pause'"
                  :disabled="!canPauseSelectedOperation || Boolean(operationActionLoading)"
                  @click="pauseSelectedOperation"
                >
                  {{ t("knowledge.pauseIndexing") }}
                </ElButton>
                <ElButton
                  class="knowledge-page__action"
                  :loading="operationActionLoading === 'resume'"
                  :disabled="!canResumeSelectedOperation || Boolean(operationActionLoading)"
                  @click="resumeSelectedOperation"
                >
                  {{ t("knowledge.resumeIndexing") }}
                </ElButton>
                <RouterLink class="knowledge-page__settings-link" to="/settings/model-providers">
                  {{ t("knowledge.openModelSettings") }}
                </RouterLink>
              </div>
            </section>
          </template>
        </section>
      </section>

      <ElDialog
        v-model="folderPickerOpen"
        class="knowledge-page__folder-picker"
        :title="t('knowledge.folderPickerTitle')"
        width="720px"
      >
        <div class="knowledge-page__folder-picker-body">
          <div class="knowledge-page__folder-picker-toolbar">
            <div class="knowledge-page__folder-picker-path">
              <span class="knowledge-page__section-kicker">{{ t("knowledge.selectedSourcePath") }}</span>
              <strong>{{ folderPickerListing?.path || importDraft.source_path || t("localFiles.pickerDefaultLocation") }}</strong>
            </div>
            <div class="knowledge-page__folder-picker-actions">
              <ElButton
                class="knowledge-page__icon-action"
                :aria-label="t('localFiles.openParent')"
                :title="t('localFiles.openParent')"
                :disabled="!folderPickerListing?.parent || folderPickerLoading"
                @click="openFolderPickerParent"
              >
                <ElIcon aria-hidden="true"><ArrowUp /></ElIcon>
              </ElButton>
              <ElButton
                class="knowledge-page__icon-action"
                :aria-label="t('knowledge.refreshFolderPicker')"
                :title="t('knowledge.refreshFolderPicker')"
                :loading="folderPickerLoading"
                @click="refreshFolderPicker"
              >
                <ElIcon aria-hidden="true"><Refresh /></ElIcon>
              </ElButton>
            </div>
          </div>

          <article v-if="folderPickerError" class="knowledge-page__notice">
            {{ t("common.failedToLoad", { error: folderPickerError }) }}
          </article>

          <div class="knowledge-page__folder-picker-list" role="list" :aria-label="t('knowledge.folderPickerTitle')">
            <article v-if="folderPickerLoading" class="knowledge-page__empty">{{ t("common.loading") }}</article>
            <article v-else-if="!folderPickerListing?.entries.length" class="knowledge-page__empty">{{ t("localFiles.empty") }}</article>
            <template v-else>
              <button
                v-for="entry in folderPickerListing?.entries || []"
                :key="entry.path"
                type="button"
                class="knowledge-page__folder-picker-entry"
                :class="{ 'knowledge-page__folder-picker-entry--file': entry.kind === 'file' }"
                role="listitem"
                @click="openFolderPickerEntry(entry)"
              >
                <ElIcon class="knowledge-page__folder-picker-icon" aria-hidden="true">
                  <FolderOpened v-if="entry.kind === 'directory'" />
                  <Document v-else />
                </ElIcon>
                <span>
                  <strong>{{ entry.name }}</strong>
                  <small>{{ entry.kind === "directory" ? t("localFiles.folderBadge") : t("localFiles.fileBadge") }}</small>
                </span>
              </button>
            </template>
          </div>
        </div>

        <template #footer>
          <div class="knowledge-page__folder-picker-footer">
            <span>{{ folderPickerListing?.path || "" }}</span>
            <div class="knowledge-page__actions">
              <ElButton @click="folderPickerOpen = false">{{ t("common.cancel") }}</ElButton>
              <ElButton
                type="primary"
                :disabled="!folderPickerListing?.path"
                @click="selectPickerFolder"
              >
                {{ t("knowledge.selectFolder") }}
              </ElButton>
            </div>
          </div>
        </template>
      </ElDialog>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { ElMessage } from "element-plus";
import { ArrowUp, Document, FolderOpened, Refresh } from "@element-plus/icons-vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import AppShell from "@/layouts/AppShell.vue";
import { fetchTemplate, fetchTemplates, runGraph } from "@/api/graphs";
import {
  fetchKnowledgeBases,
  importKnowledgeFolder,
  pauseKnowledgeOperation,
  recordKnowledgeBaseRun,
  resumeKnowledgeOperation,
  retryKnowledgeOperation,
  type KnowledgeBase,
  type LocalFolderPackage,
} from "@/api/knowledge";
import {
  fetchLocalPickerDirectoryEntries,
  type LocalDirectoryEntries,
  type LocalDirectoryEntry,
} from "@/api/localInputSources";
import type { GraphNode, GraphPayload, InputNode, TemplateRecord, ToolNode } from "@/types/node-system";

const DEFAULT_INGESTION_TEMPLATE_ID = "knowledge_folder_retrieval_ingestion";

const { t } = useI18n();
const bases = ref<KnowledgeBase[]>([]);
const templates = ref<TemplateRecord[]>([]);
const selectedCollectionId = ref("");
const loading = ref(false);
const templatesLoading = ref(false);
const importing = ref(false);
const error = ref("");
const actionError = ref("");
const operationActionLoading = ref<"retry" | "pause" | "resume" | "">("");
const folderPickerOpen = ref(false);
const folderPickerListing = ref<LocalDirectoryEntries | null>(null);
const folderPickerLoading = ref(false);
const folderPickerError = ref("");
const selectedFolderInputNodeId = ref("");

const importDraft = ref({
  name: "",
  source_path: "",
  collection_id: "",
  template_id: DEFAULT_INGESTION_TEMPLATE_ID,
});

type FolderInputNodeOption = {
  value: string;
  label: string;
  nodeName: string;
  stateName: string;
  stateKey: string;
  stateType: string;
  disabled: boolean;
  disabledReason: string;
};

const templateOptions = computed(() =>
  templates.value.map((template) => {
    const disabledReason =
      template.status === "disabled"
        ? t("knowledge.templateDisabled")
        : template.hasBreakpointMetadata || template.capabilityDiscoverableBlockedReason === "breakpoint_metadata"
          ? t("knowledge.templateBreakpointBlocked")
          : "";
    return {
      label: `${template.label || template.template_id} (${template.template_id})`,
      name: template.label || template.template_id,
      value: template.template_id,
      disabled: Boolean(disabledReason),
      disabledReason,
    };
  }),
);

const selectedImportTemplate = computed(() => templates.value.find((template) => template.template_id === importDraft.value.template_id) ?? null);
const folderInputNodeOptions = computed(() => buildFolderInputNodeOptions(selectedImportTemplate.value));
const selectedFolderInputOption = computed(
  () => folderInputNodeOptions.value.find((option) => option.value === selectedFolderInputNodeId.value) ?? null,
);

const selectedBase = computed(() => bases.value.find((base) => base.collection_id === selectedCollectionId.value) ?? bases.value[0] ?? null);
const selectedBaseProgress = computed(() => (selectedBase.value ? knowledgeProgressPercent(selectedBase.value) : 0));
const canRetrySelectedOperation = computed(() => Boolean(selectedBase.value && canRetryKnowledgeOperation(selectedBase.value)));
const canPauseSelectedOperation = computed(() => Boolean(selectedBase.value && canPauseKnowledgeOperation(selectedBase.value)));
const canResumeSelectedOperation = computed(() => Boolean(selectedBase.value && canResumeKnowledgeOperation(selectedBase.value)));
const selectedBaseJobStats = computed(() => {
  const base = selectedBase.value;
  if (!base) {
    return [];
  }
  return [
    { key: "completed", label: t("knowledge.completedJobs"), value: base.completed_embedding_job_count },
    { key: "pending", label: t("knowledge.pendingJobs"), value: base.pending_embedding_job_count },
    { key: "running", label: t("knowledge.runningJobs"), value: base.running_embedding_job_count },
    { key: "retry_wait", label: t("knowledge.retryWaitJobs"), value: base.retry_wait_embedding_job_count },
    { key: "blocked", label: t("knowledge.blockedJobs"), value: base.blocked_embedding_job_count },
    { key: "failed", label: t("knowledge.failedJobs"), value: base.failed_embedding_job_count },
  ];
});
const selectedOperationError = computed(() => {
  const base = selectedBase.value;
  if (!base) {
    return null;
  }
  const operation = base.current_operation;
  const message = operation?.last_error || base.last_error || "";
  if (!message) {
    return null;
  }
  return {
    message,
    type: operation?.last_error_type || base.last_error_type || "",
    nextRetryAt: operation?.next_retry_at || base.next_retry_at || "",
  };
});

const overview = computed(() => [
  { key: "bases", label: t("knowledge.basesMetric"), value: bases.value.length },
  { key: "documents", label: t("knowledge.documentsMetric"), value: sumMetric("document_count") },
  { key: "chunks", label: t("knowledge.chunksMetric"), value: sumMetric("chunk_count") },
  { key: "pending", label: t("knowledge.pendingJobsMetric"), value: sumMetric("pending_embedding_job_count") },
  { key: "vectors", label: t("knowledge.vectorsMetric"), value: sumMetric("embedding_vector_count") },
]);

async function loadKnowledgeWorkspace() {
  loading.value = true;
  error.value = "";
  try {
    const response = await fetchKnowledgeBases();
    bases.value = response.bases;
    if (!selectedCollectionId.value && response.bases[0]) {
      selectedCollectionId.value = response.bases[0].collection_id;
    }
  } catch (err) {
    error.value = formatError(err);
  } finally {
    loading.value = false;
  }
}

async function loadIngestionTemplates() {
  templatesLoading.value = true;
  try {
    templates.value = await fetchTemplates();
    if (!templates.value.some((template) => template.template_id === importDraft.value.template_id)) {
      importDraft.value.template_id = templates.value[0]?.template_id ?? DEFAULT_INGESTION_TEMPLATE_ID;
    }
    syncSelectedFolderInputNode();
  } finally {
    templatesLoading.value = false;
  }
}

async function importFolderAndRunIngestion() {
  actionError.value = "";
  if (
    !importDraft.value.name.trim()
    || !importDraft.value.source_path.trim()
    || !importDraft.value.template_id.trim()
    || !selectedFolderInputNodeId.value
  ) {
    actionError.value = t("common.required");
    return;
  }
  importing.value = true;
  try {
    const imported = await importKnowledgeSource();
    const template = await fetchTemplate(importDraft.value.template_id.trim());
    const graph = buildKnowledgeIngestionGraph(
      template,
      imported.knowledge_base,
      imported.folder_package,
      imported.operation.operation_id,
      selectedFolderInputNodeId.value,
    );
    const run = await runGraph(graph);
    const updatedBase = await recordKnowledgeBaseRun(imported.knowledge_base.collection_id, {
      run_id: run.run_id,
      template_id: importDraft.value.template_id.trim(),
      operation_id: imported.operation.operation_id,
    });
    mergeKnowledgeBase(updatedBase);
    selectedCollectionId.value = updatedBase.collection_id;
    ElMessage.success(t("knowledge.graphRunQueued", { runId: shortId(run.run_id) }));
    resetImportDraft();
    void loadKnowledgeWorkspace();
  } catch (err) {
    actionError.value = formatError(err);
    ElMessage.error(t("knowledge.actionFailed", { error: actionError.value }));
  } finally {
    importing.value = false;
  }
}

async function retrySelectedOperation() {
  await runSelectedOperationAction("retry", retryKnowledgeOperation, "knowledge.retryRequested");
}

async function pauseSelectedOperation() {
  await runSelectedOperationAction("pause", pauseKnowledgeOperation, "knowledge.pauseRequested");
}

async function resumeSelectedOperation() {
  await runSelectedOperationAction("resume", resumeKnowledgeOperation, "knowledge.resumeRequested");
}

async function runSelectedOperationAction(
  action: "retry" | "pause" | "resume",
  handler: (collectionId: string, operationId: string) => Promise<KnowledgeBase>,
  successKey: "knowledge.retryRequested" | "knowledge.pauseRequested" | "knowledge.resumeRequested",
) {
  const base = selectedBase.value;
  const operation = base?.current_operation;
  if (!base || !operation) {
    actionError.value = t("knowledge.operationRecovery");
    return;
  }
  if (operationActionLoading.value) {
    return;
  }
  if (!canRunKnowledgeOperationAction(base, action)) {
    actionError.value = t("knowledge.operationRecovery");
    return;
  }
  actionError.value = "";
  operationActionLoading.value = action;
  try {
    const updated = await handler(base.collection_id, operation.operation_id);
    mergeKnowledgeBase(updated);
    selectedCollectionId.value = updated.collection_id;
    ElMessage.success(t(successKey));
  } catch (err) {
    actionError.value = formatError(err);
    ElMessage.error(t("knowledge.actionFailed", { error: actionError.value }));
  } finally {
    operationActionLoading.value = "";
  }
}

async function importKnowledgeSource() {
  const basePayload = {
    name: importDraft.value.name.trim(),
    collection_id: importDraft.value.collection_id.trim() || null,
    template_id: importDraft.value.template_id.trim(),
  };
  return importKnowledgeFolder({
    ...basePayload,
    source_path: importDraft.value.source_path.trim(),
  });
}

function buildKnowledgeIngestionGraph(
  template: TemplateRecord,
  base: KnowledgeBase,
  folderPackage: LocalFolderPackage,
  operationId: string,
  folderInputNodeId: string,
): GraphPayload {
  const folderBinding = resolveFolderInputBinding(template, folderInputNodeId);
  if (!folderBinding) {
    throw new Error(t("knowledge.noFolderInput"));
  }
  const graph: GraphPayload = {
    graph_id: null,
    name: `${base.name || base.collection_id} retrieval ingestion`,
    state_schema: clone(template.state_schema),
    nodes: clone(template.nodes),
    edges: clone(template.edges),
    conditional_edges: clone(template.conditional_edges),
    metadata: {
      ...clone(template.metadata),
      template_id: template.template_id,
      knowledge_collection_id: base.collection_id,
      knowledge_operation_id: operationId,
      knowledge_base_name: base.name,
      knowledge_folder_input_node_id: folderInputNodeId,
      knowledge_folder_state: folderBinding.stateKey,
    },
  };
  if (graph.state_schema[folderBinding.stateKey]) {
    graph.state_schema[folderBinding.stateKey] = {
      ...graph.state_schema[folderBinding.stateKey],
      value: folderPackage,
    };
  }
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.kind === "input" && nodeId === folderInputNodeId) {
      node.config.value = folderPackage;
      node.config.boundaryType = "file";
    }
    if (isToolNode(node)) {
      patchKnowledgeToolNode(node, base, operationId);
    }
  }
  return graph;
}

function buildFolderInputNodeOptions(template: TemplateRecord | null): FolderInputNodeOption[] {
  if (!template) {
    return [];
  }
  return Object.entries(template.nodes)
    .filter((entry): entry is [string, InputNode] => entry[1].kind === "input")
    .map(([nodeId, node]) => {
      const write = node.writes.length === 1 ? node.writes[0] : null;
      const state = write ? template.state_schema[write.state] : null;
      const disabledReason = resolveFolderInputDisabledReason(node, state, write?.state);
      const stateKey = write && state ? write.state : "";
      const nodeName = node.name || nodeId;
      const stateName = state?.name ?? "";
      return {
        value: nodeId,
        label: `${nodeName} / ${stateName || t("common.state")} (${stateKey || nodeId})`,
        nodeName,
        stateName,
        stateKey,
        stateType: state?.type ?? "",
        disabled: Boolean(disabledReason),
        disabledReason,
      };
    });
}

function resolveFolderInputDisabledReason(node: InputNode, state: unknown, stateKey: string | undefined) {
  if (node.writes.length !== 1) {
    return t("knowledge.inputMustWriteSingleState");
  }
  if (!stateKey || !state) {
    return t("knowledge.inputMissingState");
  }
  return "";
}

function resolveFolderInputBinding(template: TemplateRecord, folderInputNodeId: string) {
  const node = template.nodes[folderInputNodeId];
  if (!node || node.kind !== "input" || node.writes.length !== 1) {
    return null;
  }
  const stateKey = node.writes[0]?.state ?? "";
  if (!stateKey || !template.state_schema[stateKey]) {
    return null;
  }
  return { node, stateKey };
}

function syncSelectedFolderInputNode() {
  const options = folderInputNodeOptions.value.filter((option) => !option.disabled);
  if (options.some((option) => option.value === selectedFolderInputNodeId.value)) {
    return;
  }
  const preferredOption = options.find((option) => option.stateKey === "knowledge_folder") ?? options[0];
  selectedFolderInputNodeId.value = preferredOption?.value ?? "";
}

function selectIngestionTemplate(value: unknown) {
  importDraft.value.template_id = String(value || "");
  selectedFolderInputNodeId.value = "";
  syncSelectedFolderInputNode();
}

function resetTemplateBindingToDefault() {
  importDraft.value.template_id = DEFAULT_INGESTION_TEMPLATE_ID;
  selectedFolderInputNodeId.value = "";
  syncSelectedFolderInputNode();
}

function openFolderPicker() {
  folderPickerOpen.value = true;
  void loadFolderPickerDirectory(importDraft.value.source_path.trim());
}

async function loadFolderPickerDirectory(path = "") {
  folderPickerLoading.value = true;
  folderPickerError.value = "";
  try {
    folderPickerListing.value = await fetchLocalPickerDirectoryEntries(path);
  } catch (err) {
    folderPickerError.value = formatError(err);
  } finally {
    folderPickerLoading.value = false;
  }
}

function refreshFolderPicker() {
  void loadFolderPickerDirectory(folderPickerListing.value?.path || importDraft.value.source_path.trim());
}

function openFolderPickerParent() {
  const parent = folderPickerListing.value?.parent;
  if (!parent) {
    return;
  }
  void loadFolderPickerDirectory(parent);
}

function openFolderPickerEntry(entry: LocalDirectoryEntry) {
  if (entry.kind !== "directory") {
    return;
  }
  void loadFolderPickerDirectory(entry.path);
}

function selectPickerFolder() {
  const path = folderPickerListing.value?.path || "";
  if (!path) {
    return;
  }
  importDraft.value.source_path = path;
  folderPickerOpen.value = false;
}

function patchKnowledgeToolNode(node: ToolNode, base: KnowledgeBase, operationId: string) {
  const staticInputs = { ...(node.config.staticInputs ?? {}) };
  if (node.config.toolKey === "knowledge_folder_normalizer") {
    staticInputs.collection = base.collection_id;
    staticInputs.metadata = {
      ...asPlainRecord(staticInputs.metadata),
      collection: base.collection_id,
      knowledge_base_name: base.name,
    };
  }
  if (node.config.toolKey === "retrieval_ingestion_writer") {
    staticInputs.source_kind = "knowledge_document";
    staticInputs.sync_mode = "sync_scope";
    staticInputs.operation_id = operationId;
    staticInputs.scope = {
      ...asPlainRecord(staticInputs.scope),
      collection: base.collection_id,
    };
    staticInputs.metadata = {
      ...asPlainRecord(staticInputs.metadata),
      collection: base.collection_id,
      knowledge_base_name: base.name,
    };
  }
  node.config.staticInputs = staticInputs;
}

function isToolNode(node: GraphNode): node is ToolNode {
  return node.kind === "tool";
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeKnowledgeBase(base: KnowledgeBase) {
  bases.value = [base, ...bases.value.filter((existing) => existing.collection_id !== base.collection_id)];
}

function knowledgeProgressPercent(base: KnowledgeBase) {
  const total = Math.max(
    Number(base.embedding_job_count || 0),
    Number(base.completed_embedding_job_count || 0)
      + Number(base.pending_embedding_job_count || 0)
      + Number(base.running_embedding_job_count || 0)
      + Number(base.retry_wait_embedding_job_count || 0)
      + Number(base.blocked_embedding_job_count || 0)
      + Number(base.failed_embedding_job_count || 0),
  );
  if (total <= 0) {
    return base.indexing_status === "ready" || base.indexing_status === "partially_ready" ? 100 : 0;
  }
  return clampPercent(Math.round((Number(base.completed_embedding_job_count || 0) / total) * 100));
}

function knowledgeStatusLabel(base: KnowledgeBase) {
  if (isOperationPaused(base)) {
    return t("knowledge.statusPaused");
  }
  const status = base.indexing_status || "";
  if (status === "indexing" || status === "ingesting") {
    return t("knowledge.statusIndexing");
  }
  if (status === "paused_retrying") {
    return t("knowledge.statusPausedRetrying");
  }
  if (status === "needs_attention") {
    return t("knowledge.statusNeedsAttention");
  }
  if (status === "partially_ready") {
    return t("knowledge.statusPartiallyReady");
  }
  if (status === "ready") {
    return t("knowledge.statusReady");
  }
  if (status === "failed") {
    return t("knowledge.statusFailed");
  }
  if (isOperationInFlight(base)) {
    return t("knowledge.statusIndexing");
  }
  if (base.running_embedding_job_count > 0 || base.pending_embedding_job_count > 0) {
    return t("knowledge.statusIndexing");
  }
  if (base.retry_wait_embedding_job_count > 0) {
    return t("knowledge.statusPausedRetrying");
  }
  if (base.blocked_embedding_job_count > 0 || base.failed_embedding_job_count > 0 || base.last_error) {
    return t("knowledge.statusNeedsAttention");
  }
  if (base.completed_embedding_job_count > 0 && knowledgeProgressPercent(base) < 100) {
    return t("knowledge.statusPartiallyReady");
  }
  if (base.document_count > 0 || base.chunk_count > 0 || base.completed_embedding_job_count > 0) {
    return t("knowledge.statusReady");
  }
  return t("knowledge.statusEmpty");
}

function knowledgeStatusClass(base: KnowledgeBase) {
  if (isOperationPaused(base)) {
    return "knowledge-page__status--paused";
  }
  const status = base.indexing_status || "";
  if (status === "ready") {
    return "knowledge-page__status--ready";
  }
  if (
    status === "indexing"
    || status === "ingesting"
    || isOperationInFlight(base)
    || base.running_embedding_job_count > 0
    || base.pending_embedding_job_count > 0
  ) {
    return "knowledge-page__status--indexing";
  }
  if (status === "paused_retrying" || base.retry_wait_embedding_job_count > 0) {
    return "knowledge-page__status--retry";
  }
  if (status === "needs_attention" || status === "failed" || base.blocked_embedding_job_count > 0 || base.failed_embedding_job_count > 0 || base.last_error) {
    return "knowledge-page__status--attention";
  }
  if (status === "partially_ready" || base.completed_embedding_job_count > 0) {
    return "knowledge-page__status--partial";
  }
  return "knowledge-page__status--empty";
}

function isOperationPaused(base: KnowledgeBase) {
  return base.current_operation?.status === "paused";
}

function isOperationInFlight(base: KnowledgeBase) {
  const operation = base.current_operation;
  if (!operation) {
    return false;
  }
  const status = String(operation.status || "");
  const stage = String(operation.stage || "");
  return status === "ingesting"
    || status === "embedding"
    || stage === "source_imported"
    || stage === "embedding_queued"
    || stage === "retry_requested"
    || stage === "user_resumed";
}

function activeEmbeddingJobCount(base: KnowledgeBase) {
  return Number(base.pending_embedding_job_count || 0)
    + Number(base.running_embedding_job_count || 0)
    + Number(base.retry_wait_embedding_job_count || 0);
}

function canRetryKnowledgeOperation(base: KnowledgeBase) {
  if (!base.current_operation) {
    return false;
  }
  return base.indexing_status === "needs_attention"
    || base.indexing_status === "failed"
    || base.indexing_status === "paused_retrying"
    || Number(base.failed_embedding_job_count || 0) > 0
    || Number(base.blocked_embedding_job_count || 0) > 0
    || Number(base.retry_wait_embedding_job_count || 0) > 0
    || Boolean(base.current_operation.last_error || base.last_error);
}

function canPauseKnowledgeOperation(base: KnowledgeBase) {
  if (!base.current_operation || isOperationPaused(base)) {
    return false;
  }
  return activeEmbeddingJobCount(base) > 0 || (isOperationInFlight(base) && base.indexing_status !== "ready");
}

function canResumeKnowledgeOperation(base: KnowledgeBase) {
  return Boolean(base.current_operation && isOperationPaused(base));
}

function canRunKnowledgeOperationAction(base: KnowledgeBase, action: "retry" | "pause" | "resume") {
  if (action === "retry") {
    return canRetryKnowledgeOperation(base);
  }
  if (action === "pause") {
    return canPauseKnowledgeOperation(base);
  }
  return canResumeKnowledgeOperation(base);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function selectKnowledgeBase(collectionId: string) {
  selectedCollectionId.value = collectionId;
}

function resetImportDraft() {
  importDraft.value = {
    name: "",
    source_path: "",
    collection_id: "",
    template_id: importDraft.value.template_id || DEFAULT_INGESTION_TEMPLATE_ID,
  };
  syncSelectedFolderInputNode();
}

function sumMetric(key: "document_count" | "chunk_count" | "pending_embedding_job_count" | "embedding_vector_count") {
  return bases.value.reduce((total, base) => total + Number(base[key] || 0), 0);
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatError(err: unknown) {
  return err instanceof Error ? err.message : String(err || t("knowledge.actionFailedFallback"));
}

onMounted(() => {
  void loadKnowledgeWorkspace();
  void loadIngestionTemplates();
});
</script>

<style scoped>
.knowledge-page {
  min-height: 100%;
  display: grid;
  gap: 18px;
  padding: 24px;
}

.knowledge-page__header,
.knowledge-page__overview,
.knowledge-page__base-panel,
.knowledge-page__detail-panel {
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  border: 1px solid rgba(120, 53, 15, 0.1);
  box-shadow: 0 18px 46px rgba(30, 41, 59, 0.08);
  backdrop-filter: blur(18px) saturate(1.15);
}

.knowledge-page__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 22px;
  border-radius: 8px;
}

.knowledge-page__eyebrow,
.knowledge-page__section-kicker {
  color: var(--toograph-accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.knowledge-page__title {
  margin: 4px 0 8px;
  color: var(--toograph-text-strong);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  letter-spacing: 0;
}

.knowledge-page__body,
.knowledge-page__muted {
  margin: 0;
  color: var(--toograph-text-muted);
  line-height: 1.65;
}

.knowledge-page__header-actions,
.knowledge-page__badges,
.knowledge-page__save-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.knowledge-page__overview {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
}

.knowledge-page__metric {
  min-width: 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.knowledge-page__metric span,
.knowledge-page__facts span {
  display: block;
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.knowledge-page__metric strong,
.knowledge-page__facts strong {
  display: block;
  margin-top: 5px;
  overflow-wrap: anywhere;
  color: var(--toograph-text-strong);
  font-size: 1.08rem;
}

.knowledge-page__notice,
.knowledge-page__empty {
  padding: 16px;
  border: 1px solid rgba(180, 83, 9, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--toograph-text-muted);
}

.knowledge-page__layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.34fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.knowledge-page__base-panel,
.knowledge-page__detail-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
}

.knowledge-page__panel-heading,
.knowledge-page__base-card-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.knowledge-page__base-card-heading strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.knowledge-page__panel-heading h3 {
  margin: 3px 0 0;
  color: var(--toograph-text-strong);
  letter-spacing: 0;
}

.knowledge-page__base-list,
.knowledge-page__form,
.knowledge-page__detail-panel {
  display: grid;
  gap: 12px;
}

.knowledge-page__base-list {
  margin-top: 14px;
}

.knowledge-page__base-card,
.knowledge-page__import-panel,
.knowledge-page__facts article {
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
}

.knowledge-page__base-card {
  display: grid;
  width: 100%;
  padding: 13px;
  color: inherit;
}

.knowledge-page__base-card:hover,
.knowledge-page__base-card--active {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 255, 255, 0.86);
}

.knowledge-page__base-card-main {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.knowledge-page__base-card-main:focus-visible {
  border-radius: 8px;
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 3px;
}

.knowledge-page__id,
.knowledge-page__option-id {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-muted);
  font-family: var(--toograph-font-mono);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__badges span,
.knowledge-page__status {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 999px;
  padding: 3px 9px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--toograph-text-muted);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.2;
}

.knowledge-page__status--completed,
.knowledge-page__status--ready {
  border-color: rgba(22, 101, 52, 0.18);
  background: rgba(220, 252, 231, 0.76);
  color: #166534;
}

.knowledge-page__status--running,
.knowledge-page__status--indexing {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(219, 234, 254, 0.78);
  color: #1d4ed8;
}

.knowledge-page__status--retry {
  border-color: rgba(217, 119, 6, 0.22);
  background: rgba(254, 243, 199, 0.78);
  color: #92400e;
}

.knowledge-page__status--attention {
  border-color: rgba(185, 28, 28, 0.2);
  background: rgba(254, 226, 226, 0.78);
  color: #991b1b;
}

.knowledge-page__status--paused {
  border-color: rgba(88, 28, 135, 0.16);
  background: rgba(243, 232, 255, 0.78);
  color: #6b21a8;
}

.knowledge-page__status--partial {
  border-color: rgba(15, 118, 110, 0.18);
  background: rgba(204, 251, 241, 0.68);
  color: #0f766e;
}

.knowledge-page__status--empty {
  border-color: rgba(100, 116, 139, 0.16);
  background: rgba(248, 250, 252, 0.76);
  color: #475569;
}

.knowledge-page__mini-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.knowledge-page__mini-progress :deep(.el-progress) {
  min-width: 0;
}

.knowledge-page__mini-progress span {
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}

.knowledge-page__import-panel {
  display: grid;
  gap: 14px;
  padding: 14px;
}

.knowledge-page__form :deep(.el-select) {
  width: 100%;
}

.knowledge-page__path-control,
.knowledge-page__template-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.knowledge-page__icon-action {
  width: 40px;
  min-width: 40px;
  min-height: 40px;
  padding: 0;
}

.knowledge-page__folder-picker-body {
  display: grid;
  gap: 12px;
}

.knowledge-page__folder-picker-toolbar,
.knowledge-page__folder-picker-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.knowledge-page__folder-picker-path {
  min-width: 0;
  display: grid;
  gap: 3px;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 9px 10px;
  background: rgba(255, 255, 255, 0.68);
}

.knowledge-page__folder-picker-path strong,
.knowledge-page__folder-picker-footer span {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__folder-picker-actions,
.knowledge-page__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.knowledge-page__folder-picker-list {
  max-height: 390px;
  overflow: auto;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.62);
}

.knowledge-page__folder-picker-entry {
  min-width: 0;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 9px 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.knowledge-page__folder-picker-entry:hover {
  border-color: rgba(154, 52, 18, 0.14);
  background: rgba(154, 52, 18, 0.07);
}

.knowledge-page__folder-picker-entry--file {
  cursor: default;
  opacity: 0.68;
}

.knowledge-page__folder-picker-entry--file:hover {
  border-color: transparent;
  background: transparent;
}

.knowledge-page__folder-picker-entry span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.knowledge-page__folder-picker-entry strong,
.knowledge-page__folder-picker-entry small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__folder-picker-entry strong {
  color: var(--toograph-text-strong);
  font-size: 0.84rem;
}

.knowledge-page__folder-picker-entry small {
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.knowledge-page__folder-picker-icon {
  color: var(--toograph-accent-strong);
}

.knowledge-page__binding-state-card code,
.knowledge-page__binding-option code {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-accent-strong);
  font-family: var(--toograph-font-mono);
  font-size: 0.74rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__template-option,
.knowledge-page__binding-option {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.knowledge-page__template-option strong,
.knowledge-page__binding-option strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__template-option small,
.knowledge-page__binding-option small,
.knowledge-page__binding-option-reason {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__binding-option-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.knowledge-page__binding-option--disabled {
  opacity: 0.62;
}

.knowledge-page__binding-state-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(160px, auto);
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-radius: 8px;
  padding: 9px 10px;
  background: rgba(239, 246, 255, 0.62);
}

.knowledge-page__binding-state-card span {
  color: var(--toograph-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.knowledge-page__binding-state-card strong {
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-size: 0.84rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__binding-state-card--empty {
  border-color: rgba(180, 83, 9, 0.14);
  background: rgba(255, 247, 237, 0.74);
}

.knowledge-page__form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.knowledge-page__form-field--wide {
  grid-column: 1 / -1;
}

.knowledge-page__save-row {
  justify-content: flex-end;
}

.knowledge-page__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.knowledge-page__facts article {
  padding: 12px;
}

.knowledge-page__run-link {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  border: 1px solid rgba(120, 53, 15, 0.14);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--toograph-accent-strong);
  font-size: 0.78rem;
  font-weight: 800;
  text-decoration: none;
}

.knowledge-page__run-link:hover {
  background: rgba(254, 243, 199, 0.72);
}

.knowledge-page__operation-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.68);
}

.knowledge-page__operation-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.knowledge-page__operation-heading h3 {
  margin: 3px 0 2px;
  color: var(--toograph-text-strong);
  font-size: 1.04rem;
  letter-spacing: 0;
}

.knowledge-page__progress-percent {
  color: var(--toograph-accent-strong);
  font-family: var(--toograph-font-mono);
  font-size: 1.36rem;
  line-height: 1;
}

.knowledge-page__progress {
  min-width: 0;
}

.knowledge-page__job-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.knowledge-page__job-grid article {
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.58);
}

.knowledge-page__job-grid span,
.knowledge-page__operation-meta dt {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__job-grid strong,
.knowledge-page__operation-meta dd {
  margin: 3px 0 0;
  min-width: 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-mono);
  font-size: 0.9rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-page__operation-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.knowledge-page__operation-meta div {
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.5);
}

.knowledge-page__operation-alert {
  min-width: 0;
  border: 1px solid rgba(185, 28, 28, 0.18);
  border-radius: 8px;
  padding: 11px 12px;
  background: rgba(254, 242, 242, 0.8);
  color: #991b1b;
}

.knowledge-page__operation-alert div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.knowledge-page__operation-alert strong,
.knowledge-page__operation-alert small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.knowledge-page__operation-alert strong {
  color: #7f1d1d;
  font-size: 0.88rem;
}

.knowledge-page__operation-alert small {
  color: #991b1b;
  font-size: 0.76rem;
  font-weight: 700;
}

.knowledge-page__operation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.knowledge-page__settings-link {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  border: 1px solid rgba(37, 99, 235, 0.14);
  border-radius: 8px;
  padding: 6px 10px;
  background: rgba(239, 246, 255, 0.68);
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 800;
  text-decoration: none;
}

.knowledge-page__settings-link:hover {
  background: rgba(219, 234, 254, 0.82);
}

@media (max-width: 1100px) {
  .knowledge-page__layout,
  .knowledge-page__form-grid,
  .knowledge-page__facts,
  .knowledge-page__operation-heading,
  .knowledge-page__operation-meta,
  .knowledge-page__path-control,
  .knowledge-page__template-control,
  .knowledge-page__binding-state-card {
    grid-template-columns: 1fr;
  }

  .knowledge-page__job-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .knowledge-page {
    padding: 16px;
  }

  .knowledge-page__header {
    grid-template-columns: 1fr;
  }

  .knowledge-page__overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .knowledge-page__header-actions,
  .knowledge-page__header-actions > *,
  .knowledge-page__save-row > *,
  .knowledge-page__operation-actions > * {
    width: 100%;
  }

  .knowledge-page__job-grid,
  .knowledge-page__mini-progress {
    grid-template-columns: 1fr;
  }

  .knowledge-page__mini-progress span {
    white-space: normal;
  }
}
</style>
