<template>
  <AppShell>
    <section class="model-logs-page">
      <header class="model-logs-page__header">
        <div>
          <div class="model-logs-page__eyebrow">{{ t("modelLogs.eyebrow") }}</div>
          <h2 class="model-logs-page__title">{{ t("modelLogs.title") }}</h2>
          <p class="model-logs-page__body">{{ t("modelLogs.body") }}</p>
        </div>
        <button type="button" class="model-logs-page__refresh" :disabled="loading" @click="loadLogs">
          <ElIcon aria-hidden="true"><Refresh /></ElIcon>
          <span>{{ loading ? t("modelLogs.refreshing") : t("modelLogs.refresh") }}</span>
        </button>
      </header>

      <section class="model-logs-page__toolbar" :aria-label="t('modelLogs.searchLabel')">
        <label class="model-logs-page__search-field">
          <span>{{ t("modelLogs.searchLabel") }}</span>
          <ElInput v-model="query" class="model-logs-page__search" :placeholder="t('modelLogs.searchPlaceholder')" clearable />
        </label>
        <div class="model-logs-page__overview" aria-live="polite">
          <span>{{ total }} total</span>
          <span>{{ errorCount }} errors</span>
          <span>{{ currentPage }} / {{ pageCount || 1 }}</span>
        </div>
      </section>

      <section class="model-logs-page__workspace">
        <section class="model-logs-page__entry-list">
          <article v-if="loading && logs.length === 0" class="model-logs-page__empty">{{ t("common.loadingModelLogs") }}</article>
          <article v-else-if="error" class="model-logs-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
          <article v-else-if="logs.length === 0" class="model-logs-page__empty">{{ t("modelLogs.empty") }}</article>
          <button
            v-for="entry in logs"
            v-else
            :key="entry.id"
            type="button"
            class="model-logs-page__entry"
            :class="{ 'model-logs-page__entry--active': selectedLog?.id === entry.id, 'model-logs-page__entry--error': Boolean(entry.error) }"
            @click="selectLog(entry.id)"
          >
            <span class="model-logs-page__entry-rail" aria-hidden="true"></span>
            <span class="model-logs-page__entry-main">
              <span class="model-logs-page__entry-heading">
                <strong>{{ entry.model || entry.provider_id }}</strong>
                <span class="model-logs-page__entry-kind">{{ entry.request_kind }}</span>
              </span>
              <span class="model-logs-page__entry-meta">
                <span>{{ formatTimestamp(entry.timestamp) }}</span>
                <span>{{ formatDuration(entry.duration_ms) }}</span>
                <span>{{ entry.provider_id }}</span>
              </span>
              <span class="model-logs-page__entry-path">{{ entry.path }}</span>
            </span>
          </button>
        </section>

        <section v-if="selectedLog" class="model-logs-page__detail">
          <header class="model-logs-page__detail-header">
            <div>
              <div class="model-logs-page__detail-eyebrow">{{ selectedLog.provider_id }}</div>
              <h3>{{ selectedLog.model || selectedLog.transport }}</h3>
            </div>
            <div class="model-logs-page__detail-actions">
              <span v-if="selectedStreamSummary" class="model-logs-page__stream-badge">
                {{ t("modelLogs.streamMerged", { count: selectedStreamSummary.eventCount }) }}
              </span>
              <span class="model-logs-page__status" :class="{ 'model-logs-page__status--error': Boolean(selectedLog.error) }">
                {{ selectedLog.error ? t("modelLogs.error") : selectedLog.status_code || "OK" }}
              </span>
            </div>
          </header>

          <div class="model-logs-page__meta-grid">
            <span>{{ formatTimestamp(selectedLog.timestamp) }}</span>
            <span>{{ formatDuration(selectedLog.duration_ms) }}</span>
            <span>{{ selectedLog.transport }}</span>
            <span>{{ selectedLog.path }}</span>
          </div>

          <section class="model-logs-page__section">
            <h4>{{ t("modelLogs.messages") }}</h4>
            <div v-if="selectedLog.messages.length > 0" class="model-logs-page__messages">
              <article v-for="message in selectedLog.messages" :key="`${message.role}-${message.body.slice(0, 24)}`" class="model-logs-page__message">
                <span>{{ message.role }}</span>
                <p>{{ message.body || t("common.noSummary") }}</p>
              </article>
            </div>
            <p v-else class="model-logs-page__muted">{{ t("common.noSummary") }}</p>
          </section>

          <section v-if="formatReadableReasoning(selectedLog)" class="model-logs-page__section">
            <div class="model-logs-page__section-heading">
              <h4>{{ t("modelLogs.reasoning") }}</h4>
              <span v-if="selectedStreamSummary?.reasoningChunks.length" class="model-logs-page__section-pill">
                {{ t("modelLogs.streamChunks", { count: selectedStreamSummary.reasoningChunks.length }) }}
              </span>
            </div>
            <pre class="model-logs-page__text-block">{{ formatReadableReasoning(selectedLog) }}</pre>
          </section>

          <section v-if="formatReadableContent(selectedLog)" class="model-logs-page__section">
            <div class="model-logs-page__section-heading">
              <h4>{{ t("modelLogs.output") }}</h4>
              <span v-if="selectedStreamSummary?.outputChunks.length" class="model-logs-page__section-pill">
                {{ t("modelLogs.streamChunks", { count: selectedStreamSummary.outputChunks.length }) }}
              </span>
            </div>
            <pre class="model-logs-page__text-block">{{ formatReadableContent(selectedLog) }}</pre>
          </section>

          <section class="model-logs-page__raw-grid">
            <details class="model-logs-page__raw-panel model-logs-page__request-raw">
              <summary class="model-logs-page__raw-summary">
                <span>{{ t("modelLogs.rawRequest") }}</span>
                <small>{{ t("modelLogs.rawRequestHint") }}</small>
              </summary>
              <pre v-html="highlightJson(formatRequestRaw(selectedLog))"></pre>
            </details>
            <details class="model-logs-page__raw-panel model-logs-page__response-raw">
              <summary class="model-logs-page__raw-summary">
                <span>{{ t("modelLogs.rawResponse") }}</span>
                <small>{{ t("modelLogs.rawResponseHint") }}</small>
              </summary>
              <pre v-if="hasStreamRaw(selectedLog)" class="model-logs-page__raw-text">{{ formatResponseRaw(selectedLog) }}</pre>
              <pre v-else v-html="highlightJson(formatResponseRaw(selectedLog))"></pre>
            </details>
          </section>
        </section>

        <section v-else class="model-logs-page__detail model-logs-page__detail--empty">
          {{ t("modelLogs.detailEmpty") }}
        </section>
      </section>

      <section v-if="total > pageSize" class="model-logs-page__pagination" :aria-label="t('modelLogs.paginationLabel')">
        <ElPagination
          v-model:current-page="currentPage"
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="total"
          :pager-count="7"
          :hide-on-single-page="true"
        />
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { Refresh } from "@element-plus/icons-vue";
import { ElIcon, ElInput, ElPagination } from "element-plus";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { fetchModelLogs } from "@/api/modelLogs";
import AppShell from "@/layouts/AppShell.vue";
import type { ModelLogEntry } from "@/types/model-log";
import { highlightJson } from "./modelLogsJsonHighlight.ts";

const { t } = useI18n();
const pageSize = 12;
const currentPage = ref(1);
const total = ref(0);
const pageCount = ref(0);
const logs = ref<ModelLogEntry[]>([]);
const selectedLogId = ref<string | null>(null);
const query = ref("");
const loading = ref(true);
const error = ref<string | null>(null);
let searchTimer: number | null = null;

const selectedLog = computed(() => {
  if (!logs.value.length) {
    return null;
  }
  return logs.value.find((entry) => entry.id === selectedLogId.value) ?? logs.value[0];
});

const errorCount = computed(() => logs.value.filter((entry) => Boolean(entry.error)).length);
const selectedStreamSummary = computed(() => (selectedLog.value ? getStreamSummary(selectedLog.value) : null));

type StreamSummary = {
  eventCount: number;
  outputChunks: string[];
  reasoningChunks: string[];
  rawText: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getStreamSummary(log: ModelLogEntry): StreamSummary | null {
  const stream = log.response_raw._stream;
  if (!isRecord(stream)) {
    return null;
  }
  return {
    eventCount: typeof stream.event_count === "number" ? stream.event_count : Array.isArray(stream.events) ? stream.events.length : 0,
    outputChunks: getStringArray(stream.output_chunks),
    reasoningChunks: getStringArray(stream.reasoning_chunks),
    rawText: typeof stream.raw_text === "string" ? stream.raw_text : "",
  };
}

function formatReadableReasoning(log: ModelLogEntry) {
  return log.reasoning || getStreamSummary(log)?.reasoningChunks.join("") || "";
}

function formatReadableContent(log: ModelLogEntry) {
  return log.content || getStreamSummary(log)?.outputChunks.join("") || "";
}

function hasStreamRaw(log: ModelLogEntry) {
  return Boolean(getStreamSummary(log)?.rawText);
}

async function loadLogs() {
  loading.value = true;
  try {
    const page = await fetchModelLogs({
      page: currentPage.value,
      size: pageSize,
      query: query.value,
    });
    logs.value = page.entries;
    total.value = page.total;
    currentPage.value = page.page;
    pageCount.value = page.pages;
    if (!logs.value.some((entry) => entry.id === selectedLogId.value)) {
      selectedLogId.value = logs.value[0]?.id ?? null;
    }
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loadingModelLogs");
  } finally {
    loading.value = false;
  }
}

function selectLog(logId: string) {
  selectedLogId.value = logId;
}

function scheduleLogsLoad() {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    void loadLogs();
  }, 240);
}

function formatTimestamp(timestamp: string) {
  if (!timestamp) {
    return t("common.none");
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return t("common.ms", { value: durationMs });
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatRequestRaw(selectedLog: ModelLogEntry) {
  return JSON.stringify(selectedLog.request_raw, null, 2);
}

function formatResponseRaw(selectedLog: ModelLogEntry) {
  const streamRawText = getStreamSummary(selectedLog)?.rawText;
  if (streamRawText) {
    return streamRawText;
  }
  return JSON.stringify(selectedLog.response_raw, null, 2);
}

watch(query, () => {
  currentPage.value = 1;
  scheduleLogsLoad();
});

watch(currentPage, () => {
  void loadLogs();
});

onMounted(loadLogs);

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
  }
});
</script>

<style scoped>
.model-logs-page {
  display: grid;
  gap: 16px;
}

.model-logs-page__header,
.model-logs-page__toolbar,
.model-logs-page__entry-list,
.model-logs-page__detail,
.model-logs-page__pagination {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  box-shadow: var(--graphite-shadow-card);
}

.model-logs-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px;
  background: var(--graphite-surface-panel);
}

.model-logs-page__eyebrow,
.model-logs-page__detail-eyebrow {
  color: rgba(154, 52, 18, 0.78);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.model-logs-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.model-logs-page__body {
  max-width: 62ch;
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.model-logs-page__refresh {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 0 16px;
  background: rgba(255, 248, 240, 0.9);
  color: rgb(154, 52, 18);
  cursor: pointer;
  font-weight: 700;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.model-logs-page__refresh:hover {
  border-color: rgba(154, 52, 18, 0.3);
  background: rgba(255, 244, 232, 0.98);
  transform: translateY(-1px);
}

.model-logs-page__refresh:disabled {
  cursor: progress;
  opacity: 0.68;
  transform: none;
}

.model-logs-page__toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 16px;
  align-items: end;
  padding: 16px;
  background: rgba(255, 255, 255, 0.58);
}

.model-logs-page__search-field {
  display: grid;
  gap: 8px;
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.78rem;
  font-weight: 700;
}

.model-logs-page__overview {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.model-logs-page__overview span,
.model-logs-page__status,
.model-logs-page__entry-kind {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  padding: 5px 10px;
  background: rgba(255, 248, 240, 0.9);
  color: rgba(120, 53, 15, 0.76);
  font-family: var(--graphite-font-mono);
  font-size: 0.76rem;
  white-space: nowrap;
}

.model-logs-page__workspace {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.model-logs-page__entry-list {
  display: grid;
  gap: 10px;
  max-height: calc(100vh - 260px);
  min-height: 420px;
  overflow: auto;
  padding: 12px;
  background: rgba(255, 255, 255, 0.52);
}

.model-logs-page__entry {
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 12px;
  background: rgba(255, 253, 249, 0.82);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.model-logs-page__entry:hover,
.model-logs-page__entry--active {
  border-color: rgba(154, 52, 18, 0.26);
  background: rgba(255, 248, 240, 0.98);
  box-shadow: 0 12px 24px rgba(61, 43, 24, 0.08);
  transform: translateY(-1px);
}

.model-logs-page__entry--error {
  border-color: rgba(220, 38, 38, 0.16);
}

.model-logs-page__entry-rail {
  align-self: stretch;
  border-radius: 999px;
  background: rgb(37, 99, 235);
}

.model-logs-page__entry--error .model-logs-page__entry-rail {
  background: rgb(220, 38, 38);
}

.model-logs-page__entry-main,
.model-logs-page__entry-heading {
  display: grid;
  min-width: 0;
}

.model-logs-page__entry-heading {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.model-logs-page__entry-heading strong {
  overflow: hidden;
  color: var(--graphite-text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-logs-page__entry-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 8px;
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.78rem;
}

.model-logs-page__entry-path {
  margin-top: 8px;
  overflow: hidden;
  color: rgba(60, 41, 20, 0.56);
  font-family: var(--graphite-font-mono);
  font-size: 0.74rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-logs-page__empty {
  display: grid;
  min-height: 180px;
  align-items: center;
  justify-items: center;
  border-radius: 18px;
  padding: 24px;
  background: rgba(255, 253, 249, 0.72);
  color: rgba(60, 41, 20, 0.62);
}

.model-logs-page__detail {
  min-width: 0;
  padding: 18px;
  background: var(--graphite-surface-panel);
}

.model-logs-page__detail--empty {
  display: grid;
  min-height: 420px;
  place-items: center;
  color: rgba(60, 41, 20, 0.62);
}

.model-logs-page__detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.1);
  padding-bottom: 14px;
}

.model-logs-page__detail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.model-logs-page__detail-header h3 {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 1.35rem;
}

.model-logs-page__status {
  color: rgb(4, 120, 87);
  background: rgba(236, 253, 245, 0.9);
}

.model-logs-page__stream-badge,
.model-logs-page__section-pill {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  border: 1px solid rgba(37, 99, 235, 0.16);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(239, 246, 255, 0.88);
  color: rgb(37, 99, 235);
  font-family: var(--graphite-font-mono);
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}

.model-logs-page__status--error {
  color: rgb(185, 28, 28);
  background: rgba(254, 242, 242, 0.92);
}

.model-logs-page__meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.model-logs-page__meta-grid span {
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.46);
  color: rgba(60, 41, 20, 0.68);
  font-family: var(--graphite-font-mono);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-logs-page__section {
  margin-top: 16px;
}

.model-logs-page__section-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.model-logs-page__section h4,
.model-logs-page__raw-summary span {
  margin: 0;
  color: var(--graphite-text-strong);
  font-size: 0.88rem;
  font-weight: 800;
}

.model-logs-page__section h4 {
  margin: 0;
}

.model-logs-page__messages {
  display: grid;
  gap: 8px;
}

.model-logs-page__message {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.48);
}

.model-logs-page__message span {
  color: rgb(37, 99, 235);
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
  font-weight: 800;
}

.model-logs-page__message p {
  display: -webkit-box;
  max-height: 5.7em;
  margin: 0;
  overflow: hidden;
  color: rgba(60, 41, 20, 0.78);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-wrap;
}

.model-logs-page__muted {
  margin: 0;
  color: rgba(60, 41, 20, 0.58);
}

.model-logs-page__text-block,
.model-logs-page__raw-panel pre {
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  margin: 0;
  background: rgba(255, 253, 249, 0.76);
  color: rgba(31, 23, 15, 0.82);
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.model-logs-page__text-block {
  max-height: 260px;
  padding: 12px;
}

.model-logs-page__raw-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.model-logs-page__raw-panel {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  background: rgba(255, 253, 249, 0.6);
}

.model-logs-page__raw-summary {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 20px;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  list-style: none;
}

.model-logs-page__raw-summary::-webkit-details-marker {
  display: none;
}

.model-logs-page__raw-summary::after {
  display: inline-grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  color: rgb(154, 52, 18);
  content: "+";
  font-family: var(--graphite-font-mono);
  font-size: 0.8rem;
  font-weight: 800;
}

.model-logs-page__raw-panel[open] .model-logs-page__raw-summary::after {
  content: "-";
}

.model-logs-page__raw-summary small {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.75rem;
  white-space: nowrap;
}

.model-logs-page__raw-panel pre {
  border: 0;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 0;
  max-height: 460px;
  padding: 12px;
}

.model-logs-page__raw-text {
  color: rgba(31, 23, 15, 0.82);
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-key) {
  color: rgb(37, 99, 235);
  font-weight: 800;
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-string) {
  color: rgb(4, 120, 87);
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-string--multiline) {
  display: inline-grid;
  max-width: min(100%, 78ch);
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  vertical-align: top;
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-string-quote) {
  color: rgba(4, 120, 87, 0.62);
  font-weight: 700;
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-string-lines) {
  display: grid;
  min-width: 0;
  border-left: 1px solid rgba(4, 120, 87, 0.18);
  margin: 0 2px;
  padding-left: 8px;
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-string-line) {
  display: block;
  min-height: 1.45em;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-number) {
  color: rgb(147, 51, 234);
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-boolean) {
  color: rgb(194, 65, 12);
  font-weight: 800;
}

.model-logs-page__raw-panel pre :deep(.model-logs-page__json-null) {
  color: rgba(60, 41, 20, 0.48);
  font-style: italic;
}

.model-logs-page__pagination {
  display: flex;
  justify-content: center;
  padding: 14px;
  background: rgba(255, 255, 255, 0.52);
}

@media (max-width: 1180px) {
  .model-logs-page__workspace {
    grid-template-columns: 1fr;
  }

  .model-logs-page__entry-list {
    max-height: none;
    min-height: 0;
  }
}

@media (max-width: 980px) {
  .model-logs-page__toolbar,
  .model-logs-page__meta-grid {
    grid-template-columns: 1fr;
  }

  .model-logs-page__overview {
    justify-content: flex-start;
  }

  .model-logs-page__raw-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .model-logs-page__header,
  .model-logs-page__detail-header {
    display: grid;
  }

  .model-logs-page__message {
    grid-template-columns: 1fr;
  }
}
</style>
