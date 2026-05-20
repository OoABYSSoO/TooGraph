<template>
  <section
    class="buddy-widget__run-trace"
    :class="`buddy-widget__run-trace--${segment.status}`"
  >
    <div class="buddy-widget__run-trace-summary-row">
      <button
        type="button"
        class="buddy-widget__run-trace-summary"
        :aria-expanded="expanded"
        :aria-label="expanded ? collapseLabel : expandLabel"
        @click="emit('toggle')"
      >
        <span
          class="buddy-widget__run-trace-dot"
          :class="`buddy-widget__run-trace-dot--${segment.status}`"
          aria-hidden="true"
        />
        <span class="buddy-widget__run-trace-title">
          {{ summary }}
        </span>
        <span class="buddy-widget__run-trace-duration">
          {{ durationLabel }}
        </span>
        <span
          class="buddy-widget__run-trace-chevron"
          :class="{ 'buddy-widget__run-trace-chevron--expanded': expanded }"
          aria-hidden="true"
        />
      </button>
    </div>
    <div
      v-if="expanded"
      class="buddy-widget__run-trace-detail"
    >
      <p v-if="loading" class="buddy-widget__run-trace-state">
        {{ loadingLabel }}
      </p>
      <p v-else-if="errorLabel" class="buddy-widget__run-trace-state">
        {{ errorLabel }}
      </p>
      <ol class="buddy-widget__run-trace-list" role="tree">
        <li
          v-for="row in rows"
          :key="row.rowId"
          class="buddy-widget__run-trace-row"
          :class="[
            `buddy-widget__run-trace-row--${row.kind}`,
            { 'buddy-widget__run-trace-row--nested': row.depth > 0 },
          ]"
          :style="traceTreeRowStyle(row)"
          role="treeitem"
          :aria-level="row.depth + 1"
        >
          <span
            class="buddy-widget__run-trace-dot buddy-widget__run-trace-dot--small"
            :class="`buddy-widget__run-trace-dot--${row.status}`"
            aria-hidden="true"
          />
          <span class="buddy-widget__run-trace-row-main">
            <span class="buddy-widget__run-trace-row-label">{{ row.label }}</span>
            <span v-if="row.artifactLabels.length > 0" class="buddy-widget__run-trace-row-evidence">
              <span v-for="label in row.artifactLabels" :key="`${row.rowId}-${label}`">{{ label }}</span>
            </span>
          </span>
          <button
            v-if="row.evidenceRunId"
            type="button"
            class="buddy-widget__run-trace-row-evidence-open"
            :title="openEvidenceLabel"
            :aria-label="openEvidenceLabel"
            @click="emit('openEvidenceRun', row.evidenceRunId)"
          >
            <ElIcon><Promotion /></ElIcon>
          </button>
          <button
            v-if="row.graphRevision"
            type="button"
            class="buddy-widget__run-trace-row-revision-restore"
            :disabled="Boolean(restoringRowId)"
            :aria-busy="restoringRowId === row.rowId"
            :title="restoreRevisionLabel"
            :aria-label="restoreRevisionLabel"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="buddy.trace.graphRevision"
            data-virtual-affordance-actions="click"
            :data-virtual-affordance-id="`buddy.trace.graphRevision.restore.${row.graphRevision.revisionId}`"
            @click="emit('restoreRevision', row)"
          >
            <ElIcon><RefreshLeft /></ElIcon>
          </button>
          <button
            v-if="row.playbackTarget && canOpenPlayback"
            type="button"
            class="buddy-widget__run-trace-row-open"
            :title="openPlaybackLabel"
            :aria-label="openPlaybackLabel"
            @click="emit('openPlayback', row)"
          >
            <ElIcon><Promotion /></ElIcon>
          </button>
          <span class="buddy-widget__run-trace-row-duration">
            {{ formatRowDuration(row) }}
          </span>
        </li>
      </ol>
      <div class="buddy-widget__run-trace-total">
        <span>{{ totalLabel }}</span>
        <strong>{{ totalDurationLabel }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Promotion, RefreshLeft } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";

import type { BuddyOutputTraceSegment } from "./buddyOutputTrace.ts";
import type { BuddyOutputTraceTreeRow } from "./buddyOutputTraceTree.ts";

defineProps<{
  segment: BuddyOutputTraceSegment;
  expanded: boolean;
  summary: string;
  durationLabel: string;
  rows: BuddyOutputTraceTreeRow[];
  loading: boolean;
  loadingLabel: string;
  errorLabel: string;
  collapseLabel: string;
  expandLabel: string;
  openEvidenceLabel: string;
  restoreRevisionLabel: string;
  openPlaybackLabel: string;
  totalLabel: string;
  totalDurationLabel: string;
  restoringRowId: string | null;
  canOpenPlayback: boolean;
  formatRowDuration: (row: BuddyOutputTraceTreeRow) => string;
}>();

const emit = defineEmits<{
  toggle: [];
  openEvidenceRun: [runId: string];
  restoreRevision: [row: BuddyOutputTraceTreeRow];
  openPlayback: [row: BuddyOutputTraceTreeRow];
}>();

function traceTreeRowStyle(row: BuddyOutputTraceTreeRow) {
  return {
    "--buddy-run-trace-depth": String(Math.max(0, row.depth)),
  };
}
</script>

<style scoped>
.buddy-widget__run-trace {
  width: min(100%, 330px);
  display: grid;
  gap: 7px;
}

.buddy-widget__run-trace-summary-row {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.buddy-widget__run-trace-summary {
  min-height: 34px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  padding: 6px 9px;
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 999px;
  background: rgba(247, 255, 250, 0.88);
  color: rgba(45, 32, 21, 0.86);
  box-shadow: 0 10px 26px rgba(24, 105, 70, 0.1);
  cursor: pointer;
}

.buddy-widget__run-trace-summary:hover {
  border-color: rgba(16, 185, 129, 0.34);
  background: rgba(244, 255, 248, 0.98);
}

.buddy-widget__run-trace-summary:focus-visible,
.buddy-widget__run-trace-row-open:focus-visible,
.buddy-widget__run-trace-row-evidence-open:focus-visible,
.buddy-widget__run-trace-row-revision-restore:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

.buddy-widget__run-trace-row-open,
.buddy-widget__run-trace-row-evidence-open,
.buddy-widget__run-trace-row-revision-restore {
  appearance: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  color: rgba(154, 52, 18, 0.82);
  background: rgba(255, 248, 240, 0.9);
  cursor: pointer;
  flex: 0 0 auto;
}

.buddy-widget__run-trace-row-open:hover,
.buddy-widget__run-trace-row-evidence-open:hover,
.buddy-widget__run-trace-row-revision-restore:hover {
  border-color: rgba(154, 52, 18, 0.3);
  background: rgba(255, 247, 237, 0.98);
}

.buddy-widget__run-trace-row-revision-restore:disabled {
  cursor: progress;
  opacity: 0.62;
}

.buddy-widget__run-trace-title {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__run-trace-duration,
.buddy-widget__run-trace-row-duration {
  color: rgba(70, 53, 38, 0.66);
  font-family: var(--toograph-font-mono);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.buddy-widget__run-trace-chevron {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid rgba(70, 53, 38, 0.58);
  border-bottom: 1.5px solid rgba(70, 53, 38, 0.58);
  transform: rotate(45deg) translateY(-1px);
  transition: transform 140ms ease;
}

.buddy-widget__run-trace-chevron--expanded {
  transform: rotate(225deg) translateY(-1px);
}

.buddy-widget__run-trace-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}

.buddy-widget__run-trace-dot--small {
  width: 7px;
  height: 7px;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
}

.buddy-widget__run-trace-dot--running {
  animation: buddy-run-trace-pulse 1.25s ease-in-out infinite;
}

.buddy-widget__run-trace-dot--failed {
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

.buddy-widget__run-trace-detail {
  display: grid;
  gap: 8px;
  max-width: 100%;
  padding: 10px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.78);
  box-shadow: 0 14px 34px rgba(60, 41, 20, 0.08);
}

.buddy-widget__run-trace-state {
  margin: 0;
  color: rgba(70, 53, 38, 0.66);
  font-size: 12px;
  line-height: 1.4;
}

.buddy-widget__run-trace-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.buddy-widget__run-trace-row {
  --buddy-run-trace-depth: 0;
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) repeat(4, auto);
  align-items: center;
  gap: 8px;
  padding-left: calc(var(--buddy-run-trace-depth) * 16px);
  color: rgba(45, 32, 21, 0.82);
}

.buddy-widget__run-trace-row--nested::before {
  content: "";
  position: absolute;
  left: calc((var(--buddy-run-trace-depth) - 1) * 16px + 4px);
  top: -7px;
  bottom: -7px;
  width: 10px;
  border-left: 1px solid rgba(154, 52, 18, 0.14);
  border-bottom: 1px solid rgba(154, 52, 18, 0.14);
  border-bottom-left-radius: 6px;
  pointer-events: none;
}

.buddy-widget__run-trace-row--root,
.buddy-widget__run-trace-row--subgraph {
  color: rgba(45, 32, 21, 0.9);
}

.buddy-widget__run-trace-row--root .buddy-widget__run-trace-row-label,
.buddy-widget__run-trace-row--subgraph .buddy-widget__run-trace-row-label {
  font-weight: 800;
}

.buddy-widget__run-trace-row-label {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__run-trace-row-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.buddy-widget__run-trace-row-evidence {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.buddy-widget__run-trace-row-evidence span {
  max-width: 100%;
  overflow: hidden;
  padding: 2px 5px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  background: rgba(255, 247, 237, 0.72);
  color: rgba(108, 82, 62, 0.78);
  font-family: var(--toograph-font-mono);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__run-trace-total {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding-top: 7px;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  color: rgba(108, 82, 62, 0.72);
  font-size: 11px;
  font-weight: 700;
}

.buddy-widget__run-trace-total strong {
  color: rgba(45, 32, 21, 0.82);
  font-family: var(--toograph-font-mono);
  font-size: 11px;
}

@keyframes buddy-run-trace-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.02);
    transform: scale(1.12);
  }
}
</style>
