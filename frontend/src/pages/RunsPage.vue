<template>
  <AppShell>
    <section class="runs-page">
      <header class="runs-page__header">
        <div>
          <div class="runs-page__eyebrow">Runs</div>
          <h2 class="runs-page__title">运行记录</h2>
          <p class="runs-page__body">按状态、图名和时间快速定位一次运行，再进入详情查看产出与节点过程。</p>
        </div>
        <button type="button" class="runs-page__refresh" :disabled="loading" @click="loadRuns">
          {{ loading ? "刷新中" : "刷新" }}
        </button>
      </header>

      <section class="runs-page__overview" aria-label="运行概览">
        <article v-for="item in runOverview" :key="item.key" class="runs-page__overview-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="runs-page__toolbar" aria-label="运行筛选">
        <label class="runs-page__search-field">
          <span>搜索图名</span>
          <ElInput v-model="graphNameQuery" class="runs-page__search" placeholder="输入图名" clearable />
        </label>
        <div class="runs-page__status-filter">
          <span>状态</span>
          <ElSegmented v-model="statusFilter" class="runs-page__segments" :options="statusOptions" />
        </div>
      </section>

      <section class="runs-page__list">
        <article v-if="loading" class="runs-page__empty">Loading runs…</article>
        <article v-else-if="error" class="runs-page__empty">加载失败：{{ error }}</article>
        <article v-else-if="runs.length === 0" class="runs-page__empty">
          <p>当前没有运行记录。</p>
          <RouterLink class="runs-page__empty-action" :to="runsEmptyAction.href">{{ runsEmptyAction.label }}</RouterLink>
        </article>
        <article
          v-for="run in runs"
          v-else
          :key="run.run_id"
          class="runs-page__run-row"
          role="link"
          tabindex="0"
          :aria-label="`查看运行 ${formatRunDisplayName(run)}`"
          @click="openRunDetail(run.run_id)"
          @keydown="handleRunRowKeydown($event, run.run_id)"
        >
          <span class="runs-page__status-rail" :class="statusBadgeClass(run.status)" aria-hidden="true"></span>
          <div class="runs-page__run-main">
            <div class="runs-page__run-heading">
              <strong>{{ formatRunDisplayName(run) }}</strong>
              <span :class="statusBadgeClass(run.status)">{{ run.status }}</span>
            </div>
            <p class="runs-page__run-id">{{ run.run_id }}</p>
          </div>
          <div class="runs-page__run-meta">
            <span>{{ formatRunDisplayTimestamp(run.started_at) }}</span>
            <span>耗时 {{ formatRunDuration(run.duration_ms) }}</span>
            <span>修订 {{ run.revision_round }}</span>
            <span v-if="run.final_score">score {{ run.final_score }}</span>
          </div>
          <div class="runs-page__card-actions" @click.stop>
            <button type="button" class="runs-page__detail-link" @click="openRunDetail(run.run_id)">{{ runCardDetail }}</button>
            <RouterLink v-if="canRestoreRunSummary(run)" class="runs-page__restore-link" :to="resolveRunRestoreUrl(run.run_id)">
              恢复编辑
            </RouterLink>
          </div>
        </article>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElInput, ElSegmented } from "element-plus";

import { fetchRuns } from "@/api/runs";
import { formatRunDisplayName, formatRunDisplayTimestamp, formatRunDuration } from "@/lib/run-display-name";
import { canRestoreRunSummary, resolveRunRestoreUrl } from "@/lib/run-restore";
import AppShell from "@/layouts/AppShell.vue";
import type { RunSummary } from "@/types/run";

import { RUN_STATUS_FILTER_OPTIONS, buildRunStatusOverview, resolveRunsCardDetail, resolveRunsEmptyAction } from "./runsPageModel.ts";

const router = useRouter();
const runs = ref<RunSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const graphNameQuery = ref("");
const statusFilter = ref("");
const statusOptions = RUN_STATUS_FILTER_OPTIONS;
const runsEmptyAction = resolveRunsEmptyAction();
const runCardDetail = resolveRunsCardDetail();
const runOverview = computed(() => buildRunStatusOverview(runs.value));
let searchTimer: number | null = null;

async function loadRuns() {
  loading.value = true;
  try {
    runs.value = await fetchRuns({
      graphName: graphNameQuery.value,
      status: statusFilter.value,
    });
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : "Failed to load runs.";
  } finally {
    loading.value = false;
  }
}

function scheduleRunsLoad() {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
  }
  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    void loadRuns();
  }, 240);
}

function openRunDetail(runId: string) {
  void router.push(`/runs/${runId}`);
}

function handleRunRowKeydown(event: KeyboardEvent, runId: string) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  openRunDetail(runId);
}

onMounted(loadRuns);
watch(graphNameQuery, scheduleRunsLoad);
watch(statusFilter, loadRuns);

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
  }
});

function statusBadgeClass(status: string) {
  return `graphite-status-badge graphite-status-badge--${status.replaceAll("_", "-")}`;
}
</script>

<style scoped>
.runs-page {
  display: grid;
  gap: 16px;
}

.runs-page__header,
.runs-page__toolbar,
.runs-page__overview-card,
.runs-page__run-row,
.runs-page__empty {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  box-shadow: var(--graphite-shadow-card);
}

.runs-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px;
  background: var(--graphite-surface-panel);
}

.runs-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.runs-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.runs-page__body {
  margin: 0;
  max-width: 62ch;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.72);
}

.runs-page__refresh,
.runs-page__detail-link,
.runs-page__restore-link,
.runs-page__empty-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.9);
  text-decoration: none;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.runs-page__refresh {
  min-height: 38px;
  padding: 0 16px;
  font-weight: 700;
}

.runs-page__refresh:hover,
.runs-page__detail-link:hover,
.runs-page__restore-link:hover,
.runs-page__empty-action:hover {
  border-color: rgba(154, 52, 18, 0.3);
  background: rgba(255, 244, 232, 0.98);
  transform: translateY(-1px);
}

.runs-page__refresh:disabled {
  cursor: progress;
  opacity: 0.68;
  transform: none;
}

.runs-page__overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.runs-page__overview-card {
  display: grid;
  gap: 8px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.runs-page__overview-card span {
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.78rem;
}

.runs-page__overview-card strong {
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 1.7rem;
  line-height: 1;
}

.runs-page__toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: end;
  padding: 16px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
  backdrop-filter: blur(22px) saturate(1.35);
}

.runs-page__search-field,
.runs-page__status-filter {
  display: grid;
  gap: 8px;
  min-width: 0;
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.82rem;
  font-weight: 700;
}

.runs-page__search :deep(.el-input__wrapper) {
  min-height: 40px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.1);
}

.runs-page__segments {
  --el-segmented-bg-color: rgba(255, 248, 240, 0.72);
  --el-segmented-item-selected-bg-color: rgba(255, 255, 255, 0.96);
  --el-segmented-item-selected-color: var(--graphite-accent-strong);
  --el-segmented-color: rgba(90, 58, 28, 0.74);
  width: 100%;
  overflow-x: auto;
}

.runs-page__segments :deep(.el-segmented) {
  min-height: 40px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 999px;
  padding: 4px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.runs-page__segments :deep(.el-segmented__item) {
  border-radius: 999px;
}

.runs-page__segments :deep(.el-segmented__group) {
  min-width: max-content;
}

.runs-page__segments :deep(.el-segmented__item-label) {
  padding: 0 10px;
  font-weight: 700;
}

.runs-page__list {
  display: grid;
  gap: 10px;
}

.runs-page__run-row {
  position: relative;
  display: grid;
  grid-template-columns: 5px minmax(0, 1.25fr) minmax(260px, 0.9fr) auto;
  gap: 16px;
  align-items: center;
  min-height: 96px;
  overflow: hidden;
  padding: 18px;
  background: rgba(255, 253, 249, 0.86);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background-color 160ms ease;
}

.runs-page__run-row:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 253, 249, 0.96);
  box-shadow: var(--graphite-shadow-hover);
  transform: translateY(-1px);
}

.runs-page__run-row:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3), var(--graphite-shadow-hover);
}

.runs-page__status-rail {
  width: 5px;
  align-self: stretch;
  border-radius: 999px;
  background: var(--graphite-status-fg, rgb(154, 52, 18));
}

.runs-page__run-main {
  min-width: 0;
}

.runs-page__run-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.runs-page__run-heading strong {
  min-width: 0;
  overflow: hidden;
  color: var(--graphite-text-strong);
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runs-page__run-heading span,
.runs-page__badges span {
  border: 1px solid var(--graphite-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--graphite-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--graphite-status-fg, rgb(154, 52, 18));
  font-family: var(--graphite-font-mono);
  font-size: 0.78rem;
}

.runs-page__run-id {
  margin: 8px 0 0;
  overflow: hidden;
  color: rgba(60, 41, 20, 0.58);
  font-family: var(--graphite-font-mono);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runs-page__run-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: rgba(60, 41, 20, 0.64);
  font-size: 0.82rem;
}

.runs-page__run-meta span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 5px 9px;
  background: rgba(255, 248, 240, 0.68);
}

.runs-page__card-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.runs-page__detail-link,
.runs-page__restore-link {
  min-height: 30px;
  padding: 0 12px;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.runs-page__empty {
  display: grid;
  gap: 14px;
  padding: 24px;
  background: var(--graphite-surface-panel);
}

.runs-page__empty p {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
}

.runs-page__empty-action {
  width: fit-content;
  min-height: 38px;
  padding: 0 14px;
}

@media (max-width: 1120px) {
  .runs-page__run-row {
    grid-template-columns: 5px minmax(0, 1fr);
  }

  .runs-page__run-meta,
  .runs-page__card-actions {
    grid-column: 2;
  }

  .runs-page__card-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 820px) {
  .runs-page__header {
    display: grid;
  }

  .runs-page__overview,
  .runs-page__toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .runs-page__overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .runs-page__run-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
