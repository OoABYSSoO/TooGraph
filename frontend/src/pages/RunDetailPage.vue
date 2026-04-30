<template>
  <AppShell>
    <section class="run-detail">
      <header class="run-detail__hero">
        <div class="run-detail__hero-top">
          <div>
            <div class="run-detail__eyebrow">{{ t("runDetail.eyebrow") }}</div>
            <h2 class="run-detail__title">{{ runDisplayName }}</h2>
            <p class="run-detail__body">{{ t("runDetail.body") }}</p>
          </div>
        </div>

        <div v-if="viewedRun" class="run-detail__status-console" :aria-label="t('runDetail.statusSummary')">
          <article v-for="fact in runStatusFacts" :key="fact.key" class="run-detail__metric">
            <span>{{ fact.label }}</span>
            <strong
              class="run-detail__metric-value"
              :class="fact.tone === 'status' ? statusBadgeClass(fact.value) : undefined"
            >
              {{ fact.value }}
            </strong>
          </article>
          <article class="run-detail__metric">
            <span>{{ t("common.startedAt") }}</span>
            <strong class="run-detail__metric-value">{{ viewedRun ? formatRunDisplayTimestamp(viewedRun.started_at) : "—" }}</strong>
          </article>
        </div>

        <div v-if="snapshotOptions.length > 0 || canRestore" class="run-detail__restore-toolbar">
          <div v-if="snapshotOptions.length > 0" class="run-detail__snapshot-switcher">
            <button
              v-for="option in snapshotOptions"
              :key="option.snapshotId"
              class="run-detail__snapshot-chip"
              :class="{ 'run-detail__snapshot-chip--active': option.snapshotId === selectedSnapshotId }"
              type="button"
              @click="selectSnapshot(option.snapshotId)"
            >
              <span>{{ option.label }}</span>
              <small>{{ option.statusLabel }}</small>
            </button>
          </div>
          <RouterLink v-if="canRestore" class="run-detail__restore-link" :to="restoreEditorHref">
            <ElIcon class="run-detail__restore-icon" aria-hidden="true"><Promotion /></ElIcon>
            <span>{{ t("common.restoreEdit") }}</span>
          </RouterLink>
        </div>
      </header>

      <article v-if="error" class="run-detail__empty">
        <p>{{ t("common.failedToLoad", { error }) }}</p>
        <button type="button" class="run-detail__retry" @click="loadRun(runId)">{{ t("common.retry") }}</button>
      </article>
      <article v-else-if="loading" class="run-detail__empty">{{ t("common.loadingRun") }}</article>
      <article v-else-if="!run" class="run-detail__empty">{{ t("runDetail.noRun") }}</article>
      <template v-else>
        <article class="run-detail__panel run-detail__panel--result">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.primaryOutput") }}</span>
              <h3>{{ t("runDetail.finalResult") }}</h3>
            </div>
            <button type="button" class="run-detail__content-toggle" @click="toggleContentExpansion('final-result')">
              {{ isContentExpanded("final-result") ? t("common.collapse") : t("common.expandAll") }}
            </button>
          </div>
          <pre
            class="run-detail__content run-detail__content--result"
            :class="{ 'run-detail__content--expanded': isContentExpanded('final-result') }"
          >{{ viewedRun?.final_result || t("common.none") }}</pre>
        </article>

        <article v-if="liveStreamingOutputItems.length > 0" class="run-detail__panel run-detail__panel--live">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.liveOutput") }}</span>
              <h3>{{ t("runDetail.liveOutputTitle") }}</h3>
            </div>
          </div>
          <div class="run-detail__live-list">
            <section v-for="stream in liveStreamingOutputItems" :key="stream.nodeId" class="run-detail__live-card">
              <div class="run-detail__live-heading">
                <strong>{{ stream.nodeId }}</strong>
                <span>{{ stream.completed ? t("runDetail.liveOutputComplete") : t("runDetail.liveOutputStreaming") }}</span>
              </div>
              <pre class="run-detail__live-content">{{ stream.text || t("common.none") }}</pre>
              <div class="run-detail__badges">
                <span>{{ t("runDetail.liveOutputChunks", { count: stream.chunkCount }) }}</span>
                <span v-for="key in stream.outputKeys" :key="`${stream.nodeId}-${key}`">{{ key }}</span>
              </div>
            </section>
          </div>
        </article>

        <section class="run-detail__grid">
          <article v-if="cycleVisualization.hasCycle" class="run-detail__panel">
            <div class="run-detail__panel-heading">
              <div>
                <span class="run-detail__section-kicker">{{ t("runDetail.loop") }}</span>
                <h3>{{ t("runDetail.cycleSummary") }}</h3>
              </div>
            </div>
            <div class="run-detail__badges">
                <span>{{ t("common.iterations", { count: cycleVisualization.summary?.iteration_count ?? cycleVisualization.iterations.length }) }}</span>
                <span>{{ t("common.max", { value: cycleVisualization.summary?.max_iterations === -1 ? t("common.unlimited") : cycleVisualization.summary?.max_iterations }) }}</span>
              <span v-if="cycleVisualization.summary?.stop_reason">{{ formatCycleStopReason(cycleVisualization.summary.stop_reason) }}</span>
              <span v-for="edge in cycleVisualization.backEdges" :key="edge">{{ edge }}</span>
            </div>
            <p v-if="describeCycleStopReason(cycleVisualization.summary?.stop_reason)" class="run-detail__muted">
              {{ describeCycleStopReason(cycleVisualization.summary?.stop_reason) }}
            </p>
          </article>

          <article class="run-detail__panel">
            <div class="run-detail__panel-heading">
              <div>
                <span class="run-detail__section-kicker">{{ t("runDetail.context") }}</span>
                <h3>{{ t("runDetail.supportingArtifacts") }}</h3>
              </div>
            </div>
            <div class="run-detail__info-grid">
              <div class="run-detail__info">
                <span>{{ t("runDetail.knowledge") }}</span>
                <strong class="run-detail__content">{{ viewedRun?.knowledge_summary || t("common.none") }}</strong>
              </div>
              <div class="run-detail__info">
                <span>{{ t("runDetail.memory") }}</span>
                <strong class="run-detail__content">{{ viewedRun?.memory_summary || t("common.none") }}</strong>
              </div>
            </div>
          </article>
        </section>

        <article v-if="outputArtifacts.length > 0" class="run-detail__panel">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.exports") }}</span>
              <h3>{{ t("runDetail.outputArtifacts") }}</h3>
            </div>
          </div>
          <div class="run-detail__artifacts">
            <div v-for="artifact in outputArtifacts" :key="artifact.key" class="run-detail__subcard">
              <div class="run-detail__subcard-heading">
                <strong>{{ artifact.title }}</strong>
                <button type="button" class="run-detail__content-toggle" @click="toggleContentExpansion(artifact.key)">
                  {{ isContentExpanded(artifact.key) ? t("common.collapse") : t("common.expand") }}
                </button>
              </div>
              <pre class="run-detail__content" :class="{ 'run-detail__content--expanded': isContentExpanded(artifact.key) }">{{
                artifact.text || t("common.none")
              }}</pre>
              <div class="run-detail__badges">
                <span>{{ artifact.displayMode }}</span>
                <span>{{ artifact.persistLabel }}</span>
                <span v-if="artifact.fileName">{{ artifact.fileName }}</span>
              </div>
            </div>
          </div>
        </article>

        <article v-if="cycleVisualization.hasCycle && cycleVisualization.iterations.length > 0" class="run-detail__panel">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.loopDetail") }}</span>
              <h3>{{ t("runDetail.cycleIterations") }}</h3>
            </div>
          </div>
          <div class="run-detail__list">
            <details v-for="iteration in cycleVisualization.iterations" :key="iteration.iteration" class="run-detail__subcard">
              <summary>
                <strong>{{ t("common.iteration", { value: iteration.iteration }) }}</strong>
                <span>{{ t("common.nodesCount", { count: iteration.executedNodeIds.length }) }} · {{ t("common.edgesCount", { count: iteration.activatedEdgeIds.length }) }}</span>
              </summary>
              <div class="run-detail__meta-groups">
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.executed") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.executedNodeIds.length === 0">{{ t("common.none") }}</span>
                    <span v-for="nodeId in iteration.executedNodeIds" v-else :key="`executed-${iteration.iteration}-${nodeId}`">{{ nodeId }}</span>
                  </div>
                </div>
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.activatedEdges") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.activatedEdgeIds.length === 0">{{ t("common.none") }}</span>
                    <span v-for="edgeId in iteration.activatedEdgeIds" v-else :key="`edge-${iteration.iteration}-${edgeId}`">{{ edgeId }}</span>
                  </div>
                </div>
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.incomingEdges") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.incomingEdgeIds.length === 0">{{ t("common.none") }}</span>
                    <span v-for="edgeId in iteration.incomingEdgeIds" v-else :key="`incoming-${iteration.iteration}-${edgeId}`">{{ edgeId }}</span>
                  </div>
                </div>
                <div class="run-detail__meta-group">
                  <span class="run-detail__meta-title">{{ t("runDetail.nextIteration") }}</span>
                  <div class="run-detail__badges">
                    <span v-if="iteration.nextIterationEdgeIds.length === 0">{{ t("runDetail.loopExitsHere") }}</span>
                    <span v-for="edgeId in iteration.nextIterationEdgeIds" v-else :key="`next-${iteration.iteration}-${edgeId}`">{{ edgeId }}</span>
                  </div>
                </div>
              </div>
            </details>
          </div>
        </article>

        <article class="run-detail__panel">
          <div class="run-detail__panel-heading">
            <div>
              <span class="run-detail__section-kicker">{{ t("runDetail.nodeTimeline") }}</span>
              <h3>{{ t("runDetail.timeline") }}</h3>
            </div>
          </div>
          <div class="run-detail__timeline">
            <div
              v-for="execution in run.node_executions"
              :key="`${execution.node_id}-${execution.artifacts.iteration ?? 1}-${execution.status}`"
              class="run-detail__timeline-item"
            >
              <span class="run-detail__timeline-rail" :class="statusBadgeClass(execution.status)" aria-hidden="true"></span>
              <div class="run-detail__timeline-body">
                <div class="run-detail__timeline-heading">
                  <strong>{{ execution.node_id }}</strong>
                  <span :class="statusBadgeClass(execution.status)">{{ execution.status }}</span>
                </div>
                <p>{{ execution.output_summary || execution.input_summary || t("common.noSummary") }}</p>
                <div class="run-detail__badges">
                  <span>{{ t("common.ms", { value: execution.duration_ms }) }}</span>
                  <span v-if="execution.artifacts.iteration">{{ t("common.iteration", { value: execution.artifacts.iteration }) }}</span>
                  <span v-if="execution.artifacts.selected_branch">{{ execution.artifacts.selected_branch }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </template>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { Promotion } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

import { fetchRun } from "@/api/runs";
import {
  buildLiveStreamingOutput,
  buildRunEventStreamUrl,
  parseRunEventPayloadData,
  resolveRunEventNodeId,
  shouldPollRunStatus,
  type LiveStreamingOutput,
} from "@/lib/run-event-stream";
import { formatRunDisplayName, formatRunDisplayTimestamp } from "@/lib/run-display-name";
import AppShell from "@/layouts/AppShell.vue";
import { buildCycleVisualization, describeCycleStopReason, formatCycleStopReason } from "@/lib/run-cycle-visualization";
import { buildSnapshotScopedRun, canRestoreRunDetail, resolveRunRestoreUrl, resolveRunSnapshot } from "@/lib/run-restore";
import type { RunDetail } from "@/types/run";

import { buildRunStatusFacts, listRunOutputArtifacts } from "./runDetailModel.ts";

const route = useRoute();
const { t, locale } = useI18n();
const run = ref<RunDetail | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedSnapshotIdDraft = ref<string | null>(null);
const expandedContentKeys = ref<Set<string>>(new Set());
const liveStreamingOutputs = ref<Record<string, LiveStreamingOutput>>({});
const runId = computed(() => String(route.params.runId ?? ""));
const runDetailRequestTimeoutMs = 10_000;
const snapshotOptions = computed(() => {
  const snapshots = Array.isArray(run.value?.run_snapshots) ? run.value.run_snapshots : [];
  if (snapshots.length <= 1) {
    return [];
  }
  return snapshots.map((snapshot, index) => ({
    snapshotId: snapshot.snapshot_id,
    label: snapshotLabel(snapshot.kind, index + 1),
    statusLabel: snapshotStatusLabel(snapshot.status),
  }));
});
const selectedSnapshotId = computed(() => {
  const draft = selectedSnapshotIdDraft.value?.trim() || null;
  if (!run.value) {
    return draft;
  }
  if (draft && snapshotOptions.value.some((option) => option.snapshotId === draft)) {
    return draft;
  }
  return resolveRunSnapshot(run.value)?.snapshot_id ?? null;
});
const runDisplayName = computed(() => (run.value ? formatRunDisplayName(run.value) : runId.value));
const viewedRun = computed(() => (run.value ? buildSnapshotScopedRun(run.value, selectedSnapshotId.value) : null));
const runStatusFacts = computed(() => {
  locale.value;
  return viewedRun.value ? buildRunStatusFacts(viewedRun.value) : [];
});
const cycleVisualization = computed(() =>
  viewedRun.value ? buildCycleVisualization(viewedRun.value) : { hasCycle: false, summary: null, backEdges: [], iterations: [] },
);
const outputArtifacts = computed(() => (viewedRun.value ? listRunOutputArtifacts(viewedRun.value) : []));
const liveStreamingOutputItems = computed(() =>
  Object.values(liveStreamingOutputs.value).sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
);
const canRestore = computed(() => (run.value ? canRestoreRunDetail(run.value) : false));
const restoreEditorHref = computed(() => (run.value ? resolveRunRestoreUrl(run.value.run_id, selectedSnapshotId.value) : "/editor/new"));
let pollTimer: number | null = null;
let activeRunRequestId = 0;
let activeRunController: AbortController | null = null;
let activeRunTimeout: number | null = null;
let runEventSource: EventSource | null = null;

function selectSnapshot(snapshotId: string) {
  selectedSnapshotIdDraft.value = snapshotId;
  expandedContentKeys.value = new Set();
}

function toggleContentExpansion(key: string) {
  const nextKeys = new Set(expandedContentKeys.value);
  if (nextKeys.has(key)) {
    nextKeys.delete(key);
  } else {
    nextKeys.add(key);
  }
  expandedContentKeys.value = nextKeys;
}

function isContentExpanded(key: string) {
  return expandedContentKeys.value.has(key);
}

function clearRunPollTimer() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function clearPendingRunRequest() {
  activeRunController?.abort();
  activeRunController = null;
  if (activeRunTimeout !== null) {
    window.clearTimeout(activeRunTimeout);
    activeRunTimeout = null;
  }
}

function closeRunEventStream() {
  runEventSource?.close();
  runEventSource = null;
}

function parseRunEventPayload(event: Event) {
  return event instanceof MessageEvent ? parseRunEventPayloadData(event.data) : null;
}

function updateLiveStreamingOutput(payload: Record<string, unknown>, completed = false) {
  const currentNodeId = resolveRunEventNodeId(payload);
  const nextOutput = buildLiveStreamingOutput(liveStreamingOutputs.value[currentNodeId], payload, completed);
  if (!nextOutput) {
    return;
  }
  liveStreamingOutputs.value = {
    ...liveStreamingOutputs.value,
    [nextOutput.nodeId]: nextOutput,
  };
}

function startRunEventStream(nextRunId: string) {
  closeRunEventStream();
  const normalizedRunId = nextRunId.trim();
  const streamUrl = buildRunEventStreamUrl(nextRunId);
  if (!streamUrl || typeof EventSource === "undefined") {
    return;
  }

  const source = new EventSource(streamUrl);
  runEventSource = source;
  source.addEventListener("node.output.delta", (event) => {
    const payload = parseRunEventPayload(event);
    if (payload) {
      updateLiveStreamingOutput(payload);
    }
  });
  source.addEventListener("node.output.completed", (event) => {
    const payload = parseRunEventPayload(event);
    if (payload) {
      updateLiveStreamingOutput(payload, true);
    }
  });
  source.addEventListener("run.completed", () => {
    void loadRun(normalizedRunId);
    closeRunEventStream();
  });
  source.addEventListener("run.failed", () => {
    void loadRun(normalizedRunId);
    closeRunEventStream();
  });
  source.onerror = () => {
    if (runEventSource === source) {
      closeRunEventStream();
    }
  };
}

function resolveRunFetchErrorMessage(fetchError: unknown) {
  if (fetchError instanceof Error && fetchError.name === "AbortError") {
    return t("runDetail.loadTimeout");
  }
  return fetchError instanceof Error ? fetchError.message : t("common.loadingRun");
}

async function loadRun(nextRunId = runId.value) {
  const requestId = activeRunRequestId + 1;
  activeRunRequestId = requestId;
  clearRunPollTimer();
  clearPendingRunRequest();

  const normalizedRunId = nextRunId.trim();
  if (!normalizedRunId) {
    run.value = null;
    loading.value = false;
    error.value = t("runDetail.missingRunId");
    return;
  }

  const controller = new AbortController();
  activeRunController = controller;
  activeRunTimeout = window.setTimeout(() => {
    controller.abort();
  }, runDetailRequestTimeoutMs);

  loading.value = !run.value;
  error.value = null;

  try {
    const nextRun = await fetchRun(normalizedRunId, { signal: controller.signal });
    if (requestId !== activeRunRequestId) {
      return;
    }
    run.value = nextRun;
    error.value = null;
    if (shouldPollRunStatus(nextRun.status)) {
      pollTimer = window.setTimeout(() => {
        void loadRun(normalizedRunId);
      }, 750);
    } else {
      closeRunEventStream();
    }
  } catch (fetchError) {
    if (requestId !== activeRunRequestId) {
      return;
    }
    run.value = null;
    error.value = resolveRunFetchErrorMessage(fetchError);
  } finally {
    if (requestId === activeRunRequestId) {
      loading.value = false;
      if (activeRunController === controller) {
        activeRunController = null;
      }
      if (activeRunTimeout !== null) {
        window.clearTimeout(activeRunTimeout);
        activeRunTimeout = null;
      }
    }
  }
}

watch(
  runId,
  (nextRunId) => {
    resetRunView();
    startRunEventStream(nextRunId);
    void loadRun(nextRunId);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  activeRunRequestId += 1;
  clearRunPollTimer();
  clearPendingRunRequest();
  closeRunEventStream();
});

function resetRunView() {
  run.value = null;
  error.value = null;
  selectedSnapshotIdDraft.value = null;
  expandedContentKeys.value = new Set();
  liveStreamingOutputs.value = {};
}

function snapshotLabel(kind: string, order: number) {
  if (kind === "pause") {
    return t("runDetail.pauseResult", { order });
  }
  if (kind === "completed") {
    return t("runDetail.finalResult");
  }
  if (kind === "failed") {
    return t("runDetail.failedResult");
  }
  return t("runDetail.snapshot", { order });
}

function snapshotStatusLabel(status: string) {
  if (status === "awaiting_human") {
    return t("runDetail.waitingHuman");
  }
  if (status === "completed") {
    return t("status.completed");
  }
  if (status === "failed") {
    return t("status.failed");
  }
  return status;
}

function statusBadgeClass(status: string) {
  return `graphite-status-badge graphite-status-badge--${status.replaceAll("_", "-")}`;
}
</script>

<style scoped>
.run-detail {
  display: grid;
  gap: 18px;
}

.run-detail__hero,
.run-detail__panel,
.run-detail__empty {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.run-detail__hero,
.run-detail__empty {
  padding: 24px;
}

.run-detail__empty {
  display: grid;
  gap: 12px;
}

.run-detail__empty p {
  margin: 0;
}

.run-detail__hero {
  display: grid;
  gap: 18px;
}

.run-detail__hero-top,
.run-detail__panel-heading,
.run-detail__subcard-heading,
.run-detail__timeline-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.run-detail__restore-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 22px;
  background: rgba(255, 252, 247, 0.68);
  padding: 8px;
}

.run-detail__panel {
  display: grid;
  gap: 16px;
  background: rgba(255, 253, 249, 0.86);
  padding: 20px;
}

.run-detail__panel--result {
  background: rgba(255, 253, 249, 0.94);
}

.run-detail__panel--live {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(247, 251, 255, 0.92);
}

.run-detail__eyebrow,
.run-detail__section-kicker {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.run-detail__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.run-detail__body,
.run-detail__muted,
.run-detail__timeline-body p,
.run-detail__empty {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.72);
}

.run-detail__restore-link,
.run-detail__snapshot-chip,
.run-detail__content-toggle,
.run-detail__retry {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.9);
  text-decoration: none;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.run-detail__restore-link,
.run-detail__content-toggle,
.run-detail__retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  font-size: 0.82rem;
  font-weight: 800;
}

.run-detail__restore-link {
  flex: none;
  border-color: rgba(154, 52, 18, 0.76);
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  box-shadow: 0 12px 22px rgba(120, 53, 15, 0.13);
}

.run-detail__restore-icon {
  margin-right: 7px;
  font-size: 0.96rem;
}

.run-detail__restore-link:hover,
.run-detail__snapshot-chip:hover,
.run-detail__content-toggle:hover,
.run-detail__retry:hover {
  border-color: rgba(154, 52, 18, 0.3);
  background: rgba(255, 244, 232, 0.98);
  transform: translateY(-1px);
}

.run-detail__restore-link:hover {
  border-color: rgba(131, 43, 13, 0.96);
  background: rgba(131, 43, 13, 0.96);
  color: rgba(255, 250, 242, 0.98);
}

.run-detail__status-console {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.run-detail__metric {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.58);
}

.run-detail__metric span {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.76rem;
}

.run-detail__metric-value {
  min-width: 0;
  overflow: hidden;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-mono);
  font-size: 0.95rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-detail__metric-value.graphite-status-badge {
  width: fit-content;
  border: 1px solid var(--graphite-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--graphite-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--graphite-status-fg, rgb(154, 52, 18));
}

.run-detail__snapshot-switcher {
  display: flex;
  flex-wrap: wrap;
  flex: 1;
  gap: 10px;
}

.run-detail__snapshot-chip {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  border-radius: 18px;
  padding: 10px 14px;
  text-align: left;
}

.run-detail__snapshot-chip small {
  color: rgba(154, 52, 18, 0.76);
  font-size: 0.74rem;
}

.run-detail__snapshot-chip--active {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(252, 239, 226, 0.96);
  box-shadow: 0 12px 22px rgba(60, 41, 20, 0.08);
}

.run-detail__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.run-detail__panel-heading h3 {
  margin: 4px 0 0;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 1.18rem;
}

.run-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.run-detail__badges span {
  border: 1px solid var(--graphite-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--graphite-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--graphite-status-fg, rgb(154, 52, 18));
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

.run-detail__timeline-heading span {
  border: 1px solid var(--graphite-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--graphite-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--graphite-status-fg, rgb(154, 52, 18));
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

.run-detail__list,
.run-detail__artifacts,
.run-detail__live-list,
.run-detail__timeline,
.run-detail__info-grid,
.run-detail__meta-groups {
  display: grid;
  gap: 12px;
}

.run-detail__subcard,
.run-detail__live-card,
.run-detail__info,
.run-detail__timeline-item {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.72);
}

.run-detail__live-card {
  border-color: rgba(37, 99, 235, 0.16);
  background: rgba(255, 255, 255, 0.76);
}

.run-detail__live-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.run-detail__live-heading strong {
  color: var(--graphite-text-strong);
}

.run-detail__live-heading span {
  border: 1px solid rgba(37, 99, 235, 0.18);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(219, 234, 254, 0.72);
  color: rgb(29, 78, 216);
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
}

.run-detail__info {
  display: grid;
  gap: 8px;
}

.run-detail__info span,
.run-detail__meta-title {
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.run-detail__content {
  max-height: 180px;
  overflow: hidden;
  margin: 0;
  color: rgba(60, 41, 20, 0.78);
  font-family: var(--graphite-font-mono);
  font-size: 0.86rem;
  line-height: 1.65;
  white-space: pre-wrap;
}

.run-detail__content--result {
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.74);
  color: rgba(32, 23, 15, 0.9);
  font-size: 0.92rem;
}

.run-detail__live-content {
  max-height: 260px;
  overflow: auto;
  margin: 14px 0 0;
  border: 1px solid rgba(37, 99, 235, 0.12);
  border-left: 4px solid rgba(37, 99, 235, 0.72);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.9);
  color: rgba(17, 24, 39, 0.9);
  font-family: var(--graphite-font-mono);
  font-size: 0.9rem;
  line-height: 1.7;
  padding: 16px;
  white-space: pre-wrap;
}

.run-detail__content--expanded {
  max-height: none;
}

.run-detail__subcard summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.run-detail__subcard summary span {
  color: rgba(60, 41, 20, 0.6);
  font-size: 0.82rem;
}

.run-detail__meta-groups {
  margin-top: 14px;
}

.run-detail__timeline-item {
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr);
  gap: 14px;
}

.run-detail__timeline-rail {
  width: 5px;
  border-radius: 999px;
  background: var(--graphite-status-fg, rgb(154, 52, 18));
}

.run-detail__timeline-body {
  min-width: 0;
}

.run-detail__timeline-heading strong {
  color: var(--graphite-text-strong);
}

@media (max-width: 1120px) {
  .run-detail__status-console {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .run-detail__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .run-detail__hero-top,
  .run-detail__restore-toolbar,
  .run-detail__panel-heading,
  .run-detail__subcard-heading,
  .run-detail__timeline-heading {
    display: grid;
  }

  .run-detail__status-console {
    grid-template-columns: 1fr;
  }
}
</style>
