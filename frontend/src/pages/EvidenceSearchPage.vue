<template>
  <AppShell>
    <section class="evidence-search-page">
      <header class="evidence-search-page__header">
        <div>
          <div class="evidence-search-page__eyebrow">{{ t("evidenceSearch.eyebrow") }}</div>
          <h2 class="evidence-search-page__title">{{ t("evidenceSearch.title") }}</h2>
          <p class="evidence-search-page__body">{{ t("evidenceSearch.body") }}</p>
        </div>
      </header>

      <section class="evidence-search-page__overview" :aria-label="t('evidenceSearch.overviewLabel')">
        <article class="evidence-search-page__metric">
          <span>{{ t("evidenceSearch.sessionHits") }}</span>
          <strong>{{ sessionResult?.hit_count ?? 0 }}</strong>
        </article>
        <article class="evidence-search-page__metric">
          <span>{{ t("evidenceSearch.sessionCount") }}</span>
          <strong>{{ sessionResult?.session_count ?? sessionRows.length }}</strong>
        </article>
        <article class="evidence-search-page__metric">
          <span>{{ t("evidenceSearch.contextMatches") }}</span>
          <strong>{{ runContextResult?.match_count ?? runContextMatches.length }}</strong>
        </article>
        <article class="evidence-search-page__metric">
          <span>{{ t("evidenceSearch.memoryMatches") }}</span>
          <strong>{{ memoryResult?.match_count ?? memoryRows.length }}</strong>
        </article>
      </section>

      <section class="evidence-search-page__workspace">
        <section class="evidence-search-page__panel" :aria-label="t('evidenceSearch.sessionPanel')">
          <div class="evidence-search-page__panel-heading">
            <div>
              <span>{{ t("evidenceSearch.sessionEyebrow") }}</span>
              <h3>{{ t("evidenceSearch.sessionPanel") }}</h3>
            </div>
          </div>

          <div class="evidence-search-page__search-bar">
            <ElInput
              v-model="sessionQuery"
              :placeholder="t('evidenceSearch.sessionQueryPlaceholder')"
              :aria-label="t('evidenceSearch.sessionQuery')"
              data-virtual-affordance-id="evidenceSearch.session.query"
              data-virtual-affordance-role="textbox"
              data-virtual-affordance-zone="evidenceSearch.session"
              data-virtual-affordance-actions="type"
              clearable
              @keyup.enter="runSessionSearch"
            >
              <template #prefix>
                <ElIcon aria-hidden="true"><Search /></ElIcon>
              </template>
            </ElInput>
            <ElSelect
              v-model="sessionEmbeddingModelRef"
              class="evidence-search-page__session-select toograph-select"
              :placeholder="t('evidenceSearch.memoryEmbeddingModelPlaceholder')"
              :aria-label="t('evidenceSearch.memoryEmbeddingModel')"
              popper-class="toograph-select-popper"
              data-virtual-affordance-id="evidenceSearch.session.embeddingModel"
              data-virtual-affordance-role="combobox"
              data-virtual-affordance-zone="evidenceSearch.session"
              data-virtual-affordance-actions="select"
              clearable
              filterable
            >
              <ElOption :label="t('evidenceSearch.memoryEmbeddingKeywordOnly')" value="" />
              <ElOption
                v-for="model in embeddingModelOptions"
                :key="model.model_ref"
                :label="formatEmbeddingModelOption(model)"
                :value="model.model_ref"
              />
            </ElSelect>
            <ElButton
              type="primary"
              :loading="sessionLoading"
              data-virtual-affordance-id="evidenceSearch.session.search"
              :data-virtual-affordance-label="t('evidenceSearch.searchSessions')"
              data-virtual-affordance-role="button"
              data-virtual-affordance-zone="evidenceSearch.session"
              data-virtual-affordance-actions="click"
              @click="runSessionSearch"
            >
              <ElIcon aria-hidden="true"><Search /></ElIcon>
              <span>{{ t("evidenceSearch.searchSessions") }}</span>
            </ElButton>
          </div>

          <article v-if="sessionError" class="evidence-search-page__notice">
            {{ t("evidenceSearch.searchFailed", { error: sessionError }) }}
          </article>
          <article
            v-if="formatRetrievalRankingReport(sessionResult?.report?.ranking_reports)"
            class="evidence-search-page__notice"
          >
            {{ t("evidenceSearch.rankingReport") }}
            {{ formatRetrievalRankingReport(sessionResult?.report?.ranking_reports) }}
          </article>

          <article v-if="sessionLoading && sessionRows.length === 0" class="evidence-search-page__empty">
            {{ t("common.loading") }}
          </article>
          <article v-else-if="sessionRows.length === 0" class="evidence-search-page__empty">
            <p>{{ t("evidenceSearch.emptySessions") }}</p>
            <span>{{ t("evidenceSearch.emptySessionsHint") }}</span>
          </article>
          <div v-else class="evidence-search-page__result-list">
            <article
              v-for="session in sessionRows"
              :key="`${session.session_id}:${session.match_message_id || ''}`"
              class="evidence-search-page__result-card"
            >
              <header class="evidence-search-page__result-heading">
                <div>
                  <span class="evidence-search-page__id">{{ session.session_id }}</span>
                  <h4>{{ session.title || t("common.noSummary") }}</h4>
                </div>
                <span>{{ session.source || t("common.none") }}</span>
              </header>

              <p class="evidence-search-page__snippet">{{ formatSnippet(session.snippet) }}</p>

              <div class="evidence-search-page__meta-grid">
                <span>{{ t("evidenceSearch.lineageRoot") }} {{ session.lineage_root_session_id || t("common.none") }}</span>
                <span>{{ t("evidenceSearch.matchMessage") }} {{ session.match_message_id || t("common.none") }}</span>
                <span>{{ t("evidenceSearch.hitMessages") }} {{ formatIdList(session.hit_message_ids) }}</span>
                <span v-if="formatSessionRetrieval(session)">
                  {{ t("evidenceSearch.retrievalMode") }} {{ formatSessionRetrieval(session) }}
                </span>
                <span v-if="formatSessionSourceRefs(session.source_refs)">
                  {{ t("evidenceSearch.source") }} {{ formatSessionSourceRefs(session.source_refs) }}
                </span>
                <span v-if="formatSessionSourceRefs(session.summary_refs)">
                  {{ t("evidenceSearch.summaryRefs") }} {{ formatSessionSourceRefs(session.summary_refs) }}
                </span>
              </div>

              <section class="evidence-search-page__message-window">
                <h5>{{ t("evidenceSearch.messagesWindow") }}</h5>
                <article
                  v-for="message in getSessionWindow(session)"
                  :key="message.message_id"
                  class="evidence-search-page__message"
                  :class="{ 'evidence-search-page__message--hit': isHitMessage(session, message.message_id) }"
                >
                  <span>{{ message.role }}</span>
                  <p>{{ message.content || t("common.noSummary") }}</p>
                  <small>
                    <span>{{ message.message_id }}</span>
                    <RouterLink v-if="message.run_id" :to="runDetailPath(message.run_id)">
                      {{ message.run_id }}
                    </RouterLink>
                  </small>
                </article>
              </section>
            </article>
          </div>
        </section>

        <section class="evidence-search-page__panel" :aria-label="t('evidenceSearch.runContextPanel')">
          <div class="evidence-search-page__panel-heading">
            <div>
              <span>{{ t("evidenceSearch.runContextEyebrow") }}</span>
              <h3>{{ t("evidenceSearch.runContextPanel") }}</h3>
            </div>
          </div>

          <div class="evidence-search-page__run-search">
            <ElInput
              v-model="runId"
              :placeholder="t('evidenceSearch.runIdPlaceholder')"
              :aria-label="t('evidenceSearch.runId')"
              data-virtual-affordance-id="evidenceSearch.runContext.runId"
              data-virtual-affordance-role="textbox"
              data-virtual-affordance-zone="evidenceSearch.runContext"
              data-virtual-affordance-actions="type"
              clearable
              @keyup.enter="runRunContextSearch"
            />
            <ElInput
              v-model="runContextQuery"
              :placeholder="t('evidenceSearch.runContextQueryPlaceholder')"
              :aria-label="t('evidenceSearch.runContextQuery')"
              data-virtual-affordance-id="evidenceSearch.runContext.query"
              data-virtual-affordance-role="textbox"
              data-virtual-affordance-zone="evidenceSearch.runContext"
              data-virtual-affordance-actions="type"
              clearable
              @keyup.enter="runRunContextSearch"
            >
              <template #prefix>
                <ElIcon aria-hidden="true"><Search /></ElIcon>
              </template>
            </ElInput>
            <ElButton
              type="primary"
              :loading="runContextLoading"
              data-virtual-affordance-id="evidenceSearch.runContext.search"
              :data-virtual-affordance-label="t('evidenceSearch.searchRunContext')"
              data-virtual-affordance-role="button"
              data-virtual-affordance-zone="evidenceSearch.runContext"
              data-virtual-affordance-actions="click"
              @click="runRunContextSearch"
            >
              <ElIcon aria-hidden="true"><Connection /></ElIcon>
              <span>{{ t("evidenceSearch.searchRunContext") }}</span>
            </ElButton>
          </div>

          <article v-if="runContextError" class="evidence-search-page__notice">
            {{ t("evidenceSearch.searchFailed", { error: runContextError }) }}
          </article>

          <article v-if="runContextLoading && runContextMatches.length === 0" class="evidence-search-page__empty">
            {{ t("common.loading") }}
          </article>
          <article v-else-if="runContextMatches.length === 0" class="evidence-search-page__empty">
            <p>{{ t("evidenceSearch.emptyRunContext") }}</p>
            <span>{{ t("evidenceSearch.emptyRunContextHint") }}</span>
          </article>
          <div v-else class="evidence-search-page__result-list">
            <article
              v-for="match in runContextMatches"
              :key="`${match.run_id}:${match.state_key}:${match.source_id}:${match.assembly_id}`"
              class="evidence-search-page__result-card"
            >
              <header class="evidence-search-page__result-heading">
                <div>
                  <span class="evidence-search-page__id">{{ match.state_key }}</span>
                  <h4>{{ match.label || match.target_state_key || match.output_key }}</h4>
                </div>
                <RouterLink :to="runDetailPath(match.run_id)">
                  {{ t("evidenceSearch.openRun") }}
                </RouterLink>
              </header>

              <p class="evidence-search-page__snippet">{{ formatSnippet(match.snippet) }}</p>

              <div class="evidence-search-page__meta-grid">
                <span>{{ t("evidenceSearch.source") }} {{ formatSource(match) }}</span>
                <span>{{ t("evidenceSearch.assembly") }} {{ match.assembly_id || t("common.none") }}</span>
                <span>{{ t("evidenceSearch.targetState") }} {{ match.target_state_key || t("common.none") }}</span>
                <span>{{ t("evidenceSearch.authority") }} {{ match.authority || t("common.none") }}</span>
                <span>{{ t("evidenceSearch.renderer") }} {{ formatRenderer(match) }}</span>
                <span>{{ t("evidenceSearch.sourceRevision") }} {{ match.source_revision_id || t("common.none") }}</span>
              </div>

              <section class="evidence-search-page__metadata">
                <h5>{{ t("evidenceSearch.metadata") }}</h5>
                <pre class="evidence-search-page__json" v-html="highlightJson(formatMetadata(match.metadata))"></pre>
              </section>
            </article>
          </div>
        </section>

        <section
          class="evidence-search-page__panel evidence-search-page__panel--memory"
          :aria-label="t('evidenceSearch.memoryPanel')"
        >
          <div class="evidence-search-page__panel-heading">
            <div>
              <span>{{ t("evidenceSearch.memoryEyebrow") }}</span>
              <h3>{{ t("evidenceSearch.memoryPanel") }}</h3>
            </div>
            <div class="evidence-search-page__panel-actions">
              <RouterLink
                v-if="embeddingMaintenanceRunId"
                class="evidence-search-page__run-link"
                :to="runDetailPath(embeddingMaintenanceRunId)"
              >
                {{ t("evidenceSearch.openEmbeddingMaintenanceRun") }}
              </RouterLink>
              <ElButton
                :loading="embeddingMaintenanceLoading"
                data-virtual-affordance-id="evidenceSearch.embeddingMaintenance.runNow"
                :data-virtual-affordance-label="t('evidenceSearch.runEmbeddingMaintenance')"
                data-virtual-affordance-role="button"
                data-virtual-affordance-zone="evidenceSearch.memory"
                data-virtual-affordance-actions="click"
                @click="runEmbeddingMaintenance()"
              >
                <ElIcon aria-hidden="true"><Refresh /></ElIcon>
                <span>{{ t("evidenceSearch.runEmbeddingMaintenance") }}</span>
              </ElButton>
              <ElButton
                :loading="embeddingMaintenanceLoading"
                data-virtual-affordance-id="evidenceSearch.embeddingMaintenance.retryFailed"
                :data-virtual-affordance-label="t('evidenceSearch.retryFailedEmbeddings')"
                data-virtual-affordance-role="button"
                data-virtual-affordance-zone="evidenceSearch.memory"
                data-virtual-affordance-actions="click"
                @click="runEmbeddingMaintenance({ retryFailed: true })"
              >
                <ElIcon aria-hidden="true"><Refresh /></ElIcon>
                <span>{{ t("evidenceSearch.retryFailedEmbeddings") }}</span>
              </ElButton>
            </div>
          </div>

          <div class="evidence-search-page__memory-search">
            <ElInput
              v-model="memoryQuery"
              :placeholder="t('evidenceSearch.memoryQueryPlaceholder')"
              :aria-label="t('evidenceSearch.memoryQuery')"
              data-virtual-affordance-id="evidenceSearch.memory.query"
              data-virtual-affordance-role="textbox"
              data-virtual-affordance-zone="evidenceSearch.memory"
              data-virtual-affordance-actions="type"
              clearable
              @keyup.enter="runMemorySearch"
            >
              <template #prefix>
                <ElIcon aria-hidden="true"><Search /></ElIcon>
              </template>
            </ElInput>
            <ElSelect
              v-model="memoryEmbeddingModelRef"
              class="evidence-search-page__memory-select toograph-select"
              :placeholder="t('evidenceSearch.memoryEmbeddingModelPlaceholder')"
              :aria-label="t('evidenceSearch.memoryEmbeddingModel')"
              popper-class="toograph-select-popper"
              data-virtual-affordance-id="evidenceSearch.memory.embeddingModel"
              data-virtual-affordance-role="combobox"
              data-virtual-affordance-zone="evidenceSearch.memory"
              data-virtual-affordance-actions="select"
              clearable
              filterable
            >
              <ElOption :label="t('evidenceSearch.memoryEmbeddingKeywordOnly')" value="" />
              <ElOption
                v-for="model in embeddingModelOptions"
                :key="model.model_ref"
                :label="formatEmbeddingModelOption(model)"
                :value="model.model_ref"
              />
            </ElSelect>
            <ElButton
              type="primary"
              :loading="memoryLoading"
              data-virtual-affordance-id="evidenceSearch.memory.search"
              :data-virtual-affordance-label="t('evidenceSearch.searchMemories')"
              data-virtual-affordance-role="button"
              data-virtual-affordance-zone="evidenceSearch.memory"
              data-virtual-affordance-actions="click"
              @click="runMemorySearch"
            >
              <ElIcon aria-hidden="true"><Search /></ElIcon>
              <span>{{ t("evidenceSearch.searchMemories") }}</span>
            </ElButton>
          </div>

          <article v-if="memoryError" class="evidence-search-page__notice">
            {{ t("evidenceSearch.searchFailed", { error: memoryError }) }}
          </article>
          <article
            v-if="noEmbeddingModelConfigured"
            class="evidence-search-page__notice evidence-search-page__notice--keyword-only"
          >
            {{ t("evidenceSearch.embeddingKeywordOnlyNotice") }}
          </article>
          <article
            v-if="formatRetrievalRankingReport(memoryResult?.report?.ranking_reports)"
            class="evidence-search-page__notice"
          >
            {{ t("evidenceSearch.rankingReport") }}
            {{ formatRetrievalRankingReport(memoryResult?.report?.ranking_reports) }}
          </article>

          <article v-if="memoryLoading && memoryRows.length === 0" class="evidence-search-page__empty">
            {{ t("common.loading") }}
          </article>
          <article v-else-if="memoryRows.length === 0" class="evidence-search-page__empty">
            <p>{{ t("evidenceSearch.emptyMemories") }}</p>
            <span>{{ t("evidenceSearch.emptyMemoriesHint") }}</span>
          </article>
          <div v-else class="evidence-search-page__result-list">
            <article
              v-for="memory in memoryRows"
              :key="memory.memory_id"
              class="evidence-search-page__result-card"
            >
              <header class="evidence-search-page__result-heading">
                <div>
                  <span class="evidence-search-page__id">{{ memory.memory_id }}</span>
                  <h4>{{ memory.title || t("common.noSummary") }}</h4>
                </div>
                <span>{{ memory.status || t("common.none") }}</span>
              </header>

              <p class="evidence-search-page__snippet">
                {{ formatSnippet(memory.snippet || memory.content) }}
              </p>

              <div class="evidence-search-page__meta-grid">
                <span>{{ t("evidenceSearch.memoryScope") }} {{ formatMemoryScope(memory) }}</span>
                <span>{{ t("evidenceSearch.memoryType") }} {{ memory.layer }} / {{ memory.memory_type }}</span>
                <span>{{ t("evidenceSearch.confidence") }} {{ formatScore(memory.confidence) }}</span>
                <span>{{ t("evidenceSearch.salience") }} {{ formatScore(memory.salience) }}</span>
                <span>{{ t("evidenceSearch.latestRevision") }} {{ memory.latest_revision_id || t("common.none") }}</span>
                <span>{{ t("evidenceSearch.score") }} {{ formatScore(memory.score) }}</span>
              </div>

              <section class="evidence-search-page__source-list">
                <h5>{{ t("evidenceSearch.memorySources") }}</h5>
                <div v-if="memory.sources.length > 0">
                  <span
                    v-for="source in memory.sources"
                    :key="`${memory.memory_id}:${source.source_kind}:${source.source_id}:${source.source_revision_id}`"
                  >
                    {{ formatMemorySource(source) }}
                  </span>
                </div>
                <p v-else>{{ t("common.none") }}</p>
              </section>

              <section class="evidence-search-page__metadata">
                <h5>{{ t("evidenceSearch.retrievalAudit") }}</h5>
                <div class="evidence-search-page__meta-grid">
                  <span>{{ t("evidenceSearch.retrievalMode") }} {{ getRetrievalField(memory, "mode") }}</span>
                  <span>{{ t("evidenceSearch.lexicalScore") }} {{ formatScore(memory.retrieval?.lexical_score) }}</span>
                  <span>{{ t("evidenceSearch.vectorScore") }} {{ formatScore(memory.retrieval?.vector_score) }}</span>
                  <span>{{ t("evidenceSearch.queryId") }} {{ getRetrievalField(memory, "query_id") }}</span>
                </div>
              </section>

              <section class="evidence-search-page__metadata">
                <h5>{{ t("evidenceSearch.metadata") }}</h5>
                <pre class="evidence-search-page__json" v-html="highlightJson(formatMetadata(memory.metadata))"></pre>
              </section>
            </article>
          </div>
        </section>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { Connection, Refresh, Search } from "@element-plus/icons-vue";
import { ElButton, ElIcon, ElInput, ElMessage, ElOption, ElSelect } from "element-plus";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { searchBuddyChatSessions, searchBuddyMemories, searchBuddyRunContext } from "@/api/buddy";
import { fetchTemplate, runGraph } from "@/api/graphs";
import AppShell from "@/layouts/AppShell.vue";
import type {
  BuddyChatMessageRecord,
  BuddyMemorySearchEntry,
  BuddyMemorySearchResult,
  BuddyRunContextSearchMatch,
  BuddyRunContextSearchResult,
  BuddySessionSearchResult,
} from "@/types/buddy";

import { highlightJson } from "./modelLogsJsonHighlight";
import { buildEmbeddingMaintenanceGraph, EMBEDDING_MAINTENANCE_TEMPLATE_ID } from "./evidenceSearchPageModel";

type SessionSearchRow = BuddySessionSearchResult["sessions"][number];
type EmbeddingModelOption = BuddyMemorySearchResult["embedding_models"][number];
type MemorySource = BuddyMemorySearchEntry["sources"][number];

const { t } = useI18n();

const sessionQuery = ref("");
const sessionEmbeddingModelRef = ref("");
const sessionLoading = ref(false);
const sessionError = ref("");
const sessionResult = ref<BuddySessionSearchResult | null>(null);

const runId = ref("");
const runContextQuery = ref("");
const runContextLoading = ref(false);
const runContextError = ref("");
const runContextResult = ref<BuddyRunContextSearchResult | null>(null);

const memoryQuery = ref("");
const memoryEmbeddingModelRef = ref("");
const memoryLoading = ref(false);
const memoryError = ref("");
const memoryResult = ref<BuddyMemorySearchResult | null>(null);
const embeddingMaintenanceLoading = ref(false);
const embeddingMaintenanceRunId = ref("");

const sessionRows = computed(() => sessionResult.value?.sessions ?? []);
const runContextMatches = computed(() => runContextResult.value?.matches ?? []);
const memoryRows = computed(() => memoryResult.value?.memories ?? []);
const embeddingModelOptions = computed(() => memoryResult.value?.embedding_models ?? []);
const noEmbeddingModelConfigured = computed(
  () => Boolean(memoryResult.value) && embeddingModelOptions.value.length === 0,
);

onMounted(() => {
  void runMemorySearch();
});

async function runSessionSearch() {
  sessionLoading.value = true;
  sessionError.value = "";
  try {
    sessionResult.value = await searchBuddyChatSessions({
      query: sessionQuery.value.trim(),
      embeddingModelRef: sessionEmbeddingModelRef.value,
      limit: 10,
      window: 2,
      sort: "newest",
    });
  } catch (error) {
    sessionError.value = formatError(error);
  } finally {
    sessionLoading.value = false;
  }
}

async function runRunContextSearch() {
  const trimmedRunId = runId.value.trim();
  runContextError.value = "";
  if (!trimmedRunId) {
    runContextError.value = t("evidenceSearch.requiredRunId");
    return;
  }

  runContextLoading.value = true;
  try {
    runContextResult.value = await searchBuddyRunContext({
      runId: trimmedRunId,
      query: runContextQuery.value.trim(),
      limit: 20,
    });
  } catch (error) {
    runContextError.value = formatError(error);
  } finally {
    runContextLoading.value = false;
  }
}

async function runMemorySearch() {
  memoryLoading.value = true;
  memoryError.value = "";
  try {
    memoryResult.value = await searchBuddyMemories({
      query: memoryQuery.value.trim(),
      embeddingModelRef: memoryEmbeddingModelRef.value,
      status: "active",
      limit: 10,
    });
  } catch (error) {
    memoryError.value = formatError(error);
  } finally {
    memoryLoading.value = false;
  }
}

async function runEmbeddingMaintenance(options: { retryFailed?: boolean } = {}) {
  if (embeddingMaintenanceLoading.value) {
    return;
  }
  const retryFailed = Boolean(options.retryFailed);
  embeddingMaintenanceLoading.value = true;
  try {
    const template = await fetchTemplate(EMBEDDING_MAINTENANCE_TEMPLATE_ID);
    const graph = buildEmbeddingMaintenanceGraph(template, {
      modelRef: memoryEmbeddingModelRef.value || sessionEmbeddingModelRef.value,
      jobLimit: 50,
      retryFailed,
    });
    const response = await runGraph(graph);
    embeddingMaintenanceRunId.value = response.run_id;
    ElMessage.success(
      t(retryFailed ? "evidenceSearch.embeddingRetryQueued" : "evidenceSearch.embeddingMaintenanceQueued", {
        runId: response.run_id,
      }),
    );
  } catch (error) {
    ElMessage.error(t("evidenceSearch.embeddingMaintenanceFailed", { error: formatError(error) }));
  } finally {
    embeddingMaintenanceLoading.value = false;
  }
}

function formatSnippet(value?: string) {
  const cleaned = (value || "").replace(/>{3}|<{3}/g, "").replace(/\s+/g, " ").trim();
  return cleaned || t("common.noSummary");
}

function formatIdList(values?: string[]) {
  return values?.length ? values.join(", ") : t("common.none");
}

function getSessionWindow(session: SessionSearchRow): BuddyChatMessageRecord[] {
  return [
    ...(session.bookend_start ?? []),
    ...(session.messages ?? []),
    ...(session.bookend_end ?? []),
  ];
}

function isHitMessage(session: SessionSearchRow, messageId: string) {
  return Boolean(session.hit_message_ids?.includes(messageId) || session.match_message_id === messageId);
}

function runDetailPath(value: string) {
  return `/runs/${encodeURIComponent(value)}`;
}

function formatSource(match: BuddyRunContextSearchMatch) {
  const source = [match.source_kind, match.source_id].filter(Boolean).join(":");
  return source || t("common.none");
}

function formatSessionRetrieval(session: SessionSearchRow) {
  const retrieval = session.retrieval ?? {};
  const mode = typeof retrieval.mode === "string" ? retrieval.mode : "";
  if (!mode) {
    return "";
  }
  const lexicalScore = formatScore(retrieval.lexical_score);
  const vectorScore = formatScore(retrieval.vector_score);
  return `${mode} · lexical ${lexicalScore} · vector ${vectorScore}`;
}

function formatSessionSourceRefs(sourceRefs?: Array<Record<string, unknown>>) {
  const labels = (sourceRefs ?? [])
    .map((sourceRef) => [sourceRef.source_kind, sourceRef.source_id].filter(Boolean).join(":"))
    .filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "";
}

function formatRenderer(match: BuddyRunContextSearchMatch) {
  return [match.renderer_key, match.renderer_version].filter(Boolean).join("@") || t("common.none");
}

function formatMetadata(value: Record<string, unknown>) {
  return JSON.stringify(value || {}, null, 2);
}

function formatMemoryScope(memory: BuddyMemorySearchEntry) {
  return [memory.scope_kind, memory.scope_id].filter(Boolean).join(":") || t("common.none");
}

function formatMemorySource(source: MemorySource) {
  const sourceId = [source.source_kind, source.source_id].filter(Boolean).join(":");
  const revision = source.source_revision_id ? ` @ ${source.source_revision_id}` : "";
  return `${sourceId || t("common.none")}${revision}`;
}

function formatScore(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(3).replace(/\.?0+$/, "") : t("common.none");
}

function getRetrievalField(memory: BuddyMemorySearchEntry, key: string) {
  const value = memory.retrieval?.[key];
  if (value === null || value === undefined || value === "") {
    return t("common.none");
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

function formatEmbeddingModelOption(model: EmbeddingModelOption) {
  const label = [model.provider_key, model.model].filter(Boolean).join(" / ");
  return label ? `${label} (${model.model_ref})` : model.model_ref;
}

function formatRetrievalRankingReport(reports?: Array<Record<string, unknown>>) {
  const report = reports?.[0];
  if (!report) {
    return "";
  }
  const queryId = String(report.query_id || "");
  const resultCount = Number(report.result_count || 0);
  const rankedResults = Array.isArray(report.ranked_results) ? report.ranked_results : [];
  const topResult = rankedResults[0] instanceof Object ? rankedResults[0] as Record<string, unknown> : {};
  const topSource = formatRankingSource(topResult.source_ref);
  const finalScore = formatScore(topResult.final_score);
  return [
    queryId ? `${t("evidenceSearch.queryId")} ${queryId}` : "",
    `${t("evidenceSearch.resultCount")} ${resultCount}`,
    topSource ? `${t("evidenceSearch.topSource")} ${topSource}` : "",
    topResult.final_score !== undefined ? `${t("evidenceSearch.score")} ${finalScore}` : "",
  ].filter(Boolean).join(" · ");
}

function formatRankingSource(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return [source.source_kind, source.source_id].filter(Boolean).join(":");
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error || t("common.noSummary"));
}
</script>

<style scoped>
.evidence-search-page {
  display: grid;
  gap: 20px;
  color: var(--toograph-text);
}

.evidence-search-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.evidence-search-page__eyebrow,
.evidence-search-page__panel-heading span,
.evidence-search-page__metric span,
.evidence-search-page__id,
.evidence-search-page__message span,
.evidence-search-page__metadata h5,
.evidence-search-page__source-list h5,
.evidence-search-page__message-window h5 {
  color: var(--toograph-text-muted);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1.25;
  text-transform: uppercase;
}

.evidence-search-page__title {
  margin: 6px 0 0;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 1.95rem;
  line-height: 1.1;
}

.evidence-search-page__body {
  max-width: 760px;
  margin: 10px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.94rem;
  line-height: 1.65;
}

.evidence-search-page__overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.evidence-search-page__metric {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  padding: 14px 16px;
  background: rgba(255, 252, 247, 0.72);
  box-shadow: var(--toograph-glass-highlight);
}

.evidence-search-page__metric strong {
  color: var(--toograph-text-strong);
  font-size: 1.45rem;
  line-height: 1;
}

.evidence-search-page__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.evidence-search-page__panel {
  display: grid;
  gap: 14px;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  padding: 16px;
  background: rgba(255, 252, 247, 0.7);
  box-shadow: var(--toograph-glass-highlight);
}

.evidence-search-page__panel--memory {
  grid-column: 1 / -1;
}

.evidence-search-page__panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.evidence-search-page__panel-heading h3 {
  margin: 4px 0 0;
  color: var(--toograph-text-strong);
  font-size: 1.05rem;
  line-height: 1.2;
}

.evidence-search-page__panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.evidence-search-page__run-link {
  color: rgb(154, 52, 18);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

.evidence-search-page__search-bar,
.evidence-search-page__run-search,
.evidence-search-page__memory-search {
  display: grid;
  gap: 10px;
}

.evidence-search-page__search-bar {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.5fr) auto;
}

.evidence-search-page__run-search {
  grid-template-columns: 1fr;
}

.evidence-search-page__memory-search {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.5fr) auto;
}

.evidence-search-page__notice,
.evidence-search-page__empty {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  padding: 14px;
  background: rgba(255, 248, 240, 0.82);
  color: var(--toograph-text-muted);
  line-height: 1.55;
}

.evidence-search-page__notice {
  border-color: rgba(180, 83, 9, 0.22);
  color: rgb(146, 64, 14);
}

.evidence-search-page__notice--keyword-only {
  border-color: rgba(37, 99, 235, 0.18);
  background: rgba(239, 246, 255, 0.7);
  color: rgb(30, 64, 175);
}

.evidence-search-page__empty p {
  margin: 0;
  color: var(--toograph-text-strong);
  font-weight: 700;
}

.evidence-search-page__empty span {
  display: block;
  margin-top: 6px;
}

.evidence-search-page__result-list {
  display: grid;
  gap: 12px;
}

.evidence-search-page__result-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.7);
}

.evidence-search-page__result-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.evidence-search-page__result-heading div {
  min-width: 0;
}

.evidence-search-page__result-heading h4 {
  margin: 4px 0 0;
  color: var(--toograph-text-strong);
  font-size: 0.98rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.evidence-search-page__result-heading > span,
.evidence-search-page__result-heading a {
  flex: 0 0 auto;
  color: rgb(154, 52, 18);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

.evidence-search-page__snippet {
  margin: 0;
  color: var(--toograph-text);
  font-size: 0.9rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.evidence-search-page__meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.evidence-search-page__meta-grid span {
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 248, 240, 0.62);
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.evidence-search-page__message-window,
.evidence-search-page__metadata,
.evidence-search-page__source-list {
  display: grid;
  gap: 8px;
}

.evidence-search-page__message-window h5,
.evidence-search-page__metadata h5,
.evidence-search-page__source-list h5 {
  margin: 0;
}

.evidence-search-page__source-list > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.evidence-search-page__source-list span,
.evidence-search-page__source-list p {
  min-width: 0;
  margin: 0;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  padding: 7px 9px;
  background: rgba(255, 248, 240, 0.62);
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.evidence-search-page__message {
  display: grid;
  gap: 6px;
  border-left: 3px solid rgba(154, 52, 18, 0.12);
  padding: 8px 10px;
  background: rgba(255, 252, 247, 0.82);
}

.evidence-search-page__message--hit {
  border-left-color: rgba(154, 52, 18, 0.72);
  background: rgba(255, 248, 240, 0.96);
}

.evidence-search-page__message p {
  margin: 0;
  color: var(--toograph-text);
  font-size: 0.86rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.evidence-search-page__message small {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
}

.evidence-search-page__message a {
  color: rgb(154, 52, 18);
  text-decoration: none;
}

.evidence-search-page__json {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  padding: 10px;
  background: rgba(39, 28, 20, 0.92);
  color: #fff7ed;
  font-size: 0.78rem;
  line-height: 1.5;
}

@media (max-width: 1120px) {
  .evidence-search-page__workspace,
  .evidence-search-page__overview {
    grid-template-columns: 1fr;
  }

  .evidence-search-page__run-search,
  .evidence-search-page__search-bar,
  .evidence-search-page__memory-search {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .evidence-search-page__meta-grid {
    grid-template-columns: 1fr;
  }

  .evidence-search-page__result-heading {
    display: grid;
  }

  .evidence-search-page__panel-heading {
    display: grid;
  }

  .evidence-search-page__panel-actions {
    justify-content: flex-start;
  }
}
</style>
