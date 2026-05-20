import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { Router } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";

import { restoreGraphRevision } from "../api/graphs.ts";
import { fetchRun, fetchRunTree } from "../api/runs.ts";
import { formatRunDuration } from "../lib/run-display-name.ts";
import { resolveRunRestoreUrl } from "../lib/run-restore.ts";
import {
  advanceSmoothNumberDisplay,
  isSmoothNumberDisplaySettled,
  type SmoothNumberDisplayState,
} from "../lib/smoothNumberDisplay.ts";
import type { RunDetail, RunTreeNode } from "../types/run.ts";
import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";
import {
  buildBuddyOutputTraceTreeRows,
  type BuddyOutputTraceTreeRow,
} from "./buddyOutputTraceTree.ts";

type BuddyRunTraceDisplayMessage = {
  id: string;
  runId?: string | null;
  outputTrace?: BuddyOutputTraceSegment;
};

type TraceDurationTarget = {
  durationMs: number;
  animateInitial: boolean;
};

type BuddyRunTraceDisplayOptions<Message extends BuddyRunTraceDisplayMessage> = {
  messages: Ref<Message[]>;
  router: Router;
  t: (key: string, params?: Record<string, unknown>) => string;
  shouldRenderMessage: (message: Message) => boolean;
};

const TRACE_DURATION_SMOOTH_OPTIONS = {
  timeConstantMs: 180,
  snapEpsilon: 8,
} as const;

export function useBuddyRunTraceDisplay<Message extends BuddyRunTraceDisplayMessage>({
  messages,
  router,
  t,
  shouldRenderMessage,
}: BuddyRunTraceDisplayOptions<Message>) {
  const traceClockNowMs = ref(Date.now());
  const traceDurationDisplayByKey = ref<Record<string, SmoothNumberDisplayState>>({});
  const expandedTraceMessageIds = ref<Set<string>>(new Set());
  const traceRunTreeByRunId = ref<Record<string, RunTreeNode>>({});
  const traceRunDetailByRunId = ref<Record<string, RunDetail>>({});
  const traceRunTreeLoadingByRunId = ref<Record<string, boolean>>({});
  const traceRunTreeErrorByRunId = ref<Record<string, string>>({});
  const restoringTraceGraphRevisionRowId = ref<string | null>(null);
  const hasRunningTraceSegment = computed(() =>
    messages.value.some((message) => shouldRenderMessage(message) && message.outputTrace?.status === "running"),
  );
  let traceClockTimerId: number | null = null;

  watch(hasRunningTraceSegment, refreshTraceClockTimer);

  onBeforeUnmount(() => {
    clearTraceClockTimer();
  });

  function isTraceMessageExpanded(messageId: string) {
    return expandedTraceMessageIds.value.has(messageId);
  }

  function toggleTraceMessage(messageId: string, runId?: string | null) {
    const next = new Set(expandedTraceMessageIds.value);
    if (next.has(messageId)) {
      next.delete(messageId);
    } else {
      next.add(messageId);
      void ensureTraceRunTreeLoaded(runId);
    }
    expandedTraceMessageIds.value = next;
  }

  function buildTraceTreeRows(segment: BuddyOutputTraceSegment, runId?: string | null) {
    return buildBuddyOutputTraceTreeRows(segment, {
      rootLabel: t("buddy.runTraceMainGraph"),
      runTree: resolveTraceRunTree(runId),
      childRunDetailsByRunId: traceRunDetailByRunId.value,
    });
  }

  async function ensureTraceRunTreeLoaded(runId: string | null | undefined) {
    const normalizedRunId = String(runId ?? "").trim();
    if (!normalizedRunId || traceRunTreeByRunId.value[normalizedRunId] || traceRunTreeLoadingByRunId.value[normalizedRunId]) {
      return;
    }
    traceRunTreeLoadingByRunId.value = {
      ...traceRunTreeLoadingByRunId.value,
      [normalizedRunId]: true,
    };
    traceRunTreeErrorByRunId.value = {
      ...traceRunTreeErrorByRunId.value,
      [normalizedRunId]: "",
    };
    try {
      const tree = await fetchRunTree(normalizedRunId);
      traceRunTreeByRunId.value = {
        ...traceRunTreeByRunId.value,
        [normalizedRunId]: tree,
      };
      await ensureTraceChildRunDetailsLoaded(tree);
    } catch (treeError) {
      traceRunTreeErrorByRunId.value = {
        ...traceRunTreeErrorByRunId.value,
        [normalizedRunId]: treeError instanceof Error ? treeError.message : String(treeError),
      };
    } finally {
      traceRunTreeLoadingByRunId.value = {
        ...traceRunTreeLoadingByRunId.value,
        [normalizedRunId]: false,
      };
    }
  }

  async function ensureTraceChildRunDetailsLoaded(tree: RunTreeNode) {
    const runIds = listTraceChildRunIds(tree).filter((runId) => !traceRunDetailByRunId.value[runId]);
    if (runIds.length === 0) {
      return;
    }
    const detailEntries = await Promise.all(
      runIds.map(async (runId) => {
        try {
          return [runId, await fetchRun(runId)] as const;
        } catch {
          return null;
        }
      }),
    );
    const nextDetails = { ...traceRunDetailByRunId.value };
    let changed = false;
    for (const entry of detailEntries) {
      if (!entry) {
        continue;
      }
      nextDetails[entry[0]] = entry[1];
      changed = true;
    }
    if (changed) {
      traceRunDetailByRunId.value = nextDetails;
    }
  }

  function listTraceChildRunIds(tree: RunTreeNode) {
    const result: string[] = [];
    const stack = [...(tree.children ?? [])];
    while (stack.length > 0) {
      const node = stack.shift();
      const runId = String(node?.run_id ?? "").trim();
      if (runId && !result.includes(runId)) {
        result.push(runId);
      }
      stack.push(...(node?.children ?? []));
    }
    return result;
  }

  function resolveTraceRunTree(runId: string | null | undefined) {
    const normalizedRunId = String(runId ?? "").trim();
    return normalizedRunId ? traceRunTreeByRunId.value[normalizedRunId] ?? null : null;
  }

  function isTraceRunTreeLoading(runId: string | null | undefined) {
    const normalizedRunId = String(runId ?? "").trim();
    return normalizedRunId ? Boolean(traceRunTreeLoadingByRunId.value[normalizedRunId]) : false;
  }

  function traceRunTreeError(runId: string | null | undefined) {
    const normalizedRunId = String(runId ?? "").trim();
    return normalizedRunId ? traceRunTreeErrorByRunId.value[normalizedRunId] ?? "" : "";
  }

  function openTraceTreeRowPlayback(runId: string | null | undefined, row: BuddyOutputTraceTreeRow) {
    if (!row.playbackTarget) {
      return;
    }
    openRunPlayback(row.evidenceRunId || runId);
  }

  function openRunPlayback(runId: string | null | undefined) {
    const normalizedRunId = String(runId ?? "").trim();
    if (!normalizedRunId) {
      return;
    }
    void router.push(resolveRunRestoreUrl(normalizedRunId));
  }

  function openTraceEvidenceRun(runId: string | null | undefined) {
    const normalizedRunId = String(runId ?? "").trim();
    if (!normalizedRunId) {
      return;
    }
    void router.push(`/runs/${encodeURIComponent(normalizedRunId)}`);
  }

  async function restoreTraceGraphRevision(row: BuddyOutputTraceTreeRow) {
    if (!row.graphRevision || restoringTraceGraphRevisionRowId.value) {
      return;
    }
    try {
      await ElMessageBox.confirm(
        t("graphLibrary.restoreRevisionConfirm", { name: `${row.graphRevision.graphId} / ${row.graphRevision.revisionId}` }),
        t("graphLibrary.restoreRevisionTitle"),
        {
          confirmButtonText: t("graphLibrary.restoreRevisionAction"),
          cancelButtonText: t("common.cancel"),
          type: "warning",
        },
      );
    } catch {
      return;
    }

    restoringTraceGraphRevisionRowId.value = row.rowId;
    try {
      const response = await restoreGraphRevision(row.graphRevision.graphId, row.graphRevision.revisionId);
      ElMessage.success(t("graphLibrary.revisionRestored", { revisionId: response.restored_revision_id }));
    } catch (restoreError) {
      ElMessage.error(restoreError instanceof Error ? restoreError.message : t("common.failedToSave", { error: "" }));
    } finally {
      restoringTraceGraphRevisionRowId.value = null;
    }
  }

  function resolveTraceSegmentSummary(segment: BuddyOutputTraceSegment) {
    if (segment.status === "running") {
      return findCurrentTraceRecord(segment)?.label ?? segment.boundaryLabel;
    }
    if (segment.status === "failed") {
      return t("buddy.runTraceFailed", { count: segment.records.length });
    }
    return t("buddy.runTraceCompleted", { count: segment.records.length });
  }

  function findCurrentTraceRecord(segment: BuddyOutputTraceSegment) {
    return [...segment.records].reverse().find((record) => record.status === "running") ?? segment.records.at(-1) ?? null;
  }

  function resolveTraceSegmentDurationMs(segment: BuddyOutputTraceSegment) {
    return resolveTraceSegmentDurationMsAt(segment, traceClockNowMs.value);
  }

  function resolveTraceTreeRowDurationMs(row: BuddyOutputTraceTreeRow) {
    return resolveTraceTreeRowDurationMsAt(row, traceClockNowMs.value);
  }

  function resolveTraceSegmentDurationMsAt(segment: BuddyOutputTraceSegment, nowMs: number) {
    if (segment.durationMs !== null) {
      return segment.durationMs;
    }
    if (segment.status === "running" && segment.startedAtMs !== null) {
      return Math.max(0, nowMs - segment.startedAtMs);
    }
    return null;
  }

  function resolveTraceTreeRowDurationMsAt(row: BuddyOutputTraceTreeRow, nowMs: number) {
    if (row.durationMs !== null) {
      return row.durationMs;
    }
    if (row.status === "running" && row.startedAtMs !== null) {
      return Math.max(0, nowMs - row.startedAtMs);
    }
    return null;
  }

  function buildTraceSegmentDurationKey(messageId: string) {
    return `segment:${messageId}`;
  }

  function buildTraceTreeRowDurationKey(messageId: string, row: BuddyOutputTraceTreeRow) {
    return `tree:${messageId}:${row.rowId}`;
  }

  function collectTraceDurationTargets(nowMs: number) {
    const targets: Record<string, TraceDurationTarget> = {};
    for (const message of messages.value) {
      if (!shouldRenderMessage(message) || !message.outputTrace) {
        continue;
      }
      const segmentDurationMs = resolveTraceSegmentDurationMsAt(message.outputTrace, nowMs);
      if (segmentDurationMs !== null) {
        targets[buildTraceSegmentDurationKey(message.id)] = {
          durationMs: segmentDurationMs,
          animateInitial: message.outputTrace.status === "running",
        };
      }
      for (const row of buildTraceTreeRows(message.outputTrace, message.runId)) {
        const rowDurationMs = resolveTraceTreeRowDurationMsAt(row, nowMs);
        if (rowDurationMs !== null) {
          targets[buildTraceTreeRowDurationKey(message.id, row)] = {
            durationMs: rowDurationMs,
            animateInitial: row.status === "running",
          };
        }
      }
    }
    return targets;
  }

  function updateTraceDurationDisplays(nowMs: number) {
    traceClockNowMs.value = nowMs;
    const previousDisplays = traceDurationDisplayByKey.value;
    const targets = collectTraceDurationTargets(nowMs);
    const nextDisplays: Record<string, SmoothNumberDisplayState> = {};
    for (const [key, target] of Object.entries(targets)) {
      nextDisplays[key] = advanceSmoothNumberDisplay(previousDisplays[key], target.durationMs, nowMs, {
        ...TRACE_DURATION_SMOOTH_OPTIONS,
        initialValue: target.animateInitial ? 0 : target.durationMs,
      });
    }
    traceDurationDisplayByKey.value = nextDisplays;
  }

  function hasUnsettledTraceDurationDisplay() {
    return Object.values(traceDurationDisplayByKey.value).some(
      (display) => !isSmoothNumberDisplaySettled(display, TRACE_DURATION_SMOOTH_OPTIONS),
    );
  }

  function refreshTraceClockTimer() {
    updateTraceDurationDisplays(Date.now());
    if (hasRunningTraceSegment.value || hasUnsettledTraceDurationDisplay()) {
      startTraceClockTimer();
      return;
    }
    clearTraceClockTimer();
  }

  function startTraceClockTimer() {
    if (traceClockTimerId !== null || typeof window === "undefined") {
      return;
    }
    const tick = () => {
      updateTraceDurationDisplays(Date.now());
      if (hasRunningTraceSegment.value || hasUnsettledTraceDurationDisplay()) {
        traceClockTimerId = window.requestAnimationFrame(tick);
        return;
      }
      traceClockTimerId = null;
    };
    traceClockTimerId = window.requestAnimationFrame(tick);
  }

  function clearTraceClockTimer() {
    if (traceClockTimerId === null || typeof window === "undefined") {
      traceClockTimerId = null;
      return;
    }
    window.cancelAnimationFrame(traceClockTimerId);
    traceClockTimerId = null;
  }

  function formatTraceDuration(displayKey: string, durationMs: number | null | undefined) {
    const display = traceDurationDisplayByKey.value[displayKey];
    return formatRunDuration(display?.value ?? durationMs ?? undefined, { secondsFractionDigits: 2 });
  }

  function formatTraceSegmentDurationForMessage(messageId: string, segment: BuddyOutputTraceSegment) {
    return formatTraceDuration(buildTraceSegmentDurationKey(messageId), resolveTraceSegmentDurationMs(segment));
  }

  function formatTraceTreeRowDurationForMessage(messageId: string, row: BuddyOutputTraceTreeRow) {
    return formatTraceDuration(buildTraceTreeRowDurationKey(messageId, row), resolveTraceTreeRowDurationMs(row));
  }

  return {
    restoringTraceGraphRevisionRowId,
    isTraceMessageExpanded,
    toggleTraceMessage,
    buildTraceTreeRows,
    isTraceRunTreeLoading,
    traceRunTreeError,
    openTraceTreeRowPlayback,
    openTraceEvidenceRun,
    restoreTraceGraphRevision,
    resolveTraceSegmentSummary,
    formatTraceSegmentDurationForMessage,
    formatTraceTreeRowDurationForMessage,
  };
}
