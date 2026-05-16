<template>
  <AppShell>
    <section class="runs-page">
      <header class="runs-page__header">
        <div>
          <div class="runs-page__eyebrow">{{ t("runs.eyebrow") }}</div>
          <h2 class="runs-page__title">{{ t("runs.title") }}</h2>
          <p class="runs-page__body">{{ t("runs.body") }}</p>
        </div>
        <button
          type="button"
          class="runs-page__refresh"
          :disabled="loading"
          data-virtual-affordance-id="runs.action.refresh"
          :data-virtual-affordance-label="loading ? t('runs.refreshing') : t('runs.refresh')"
          data-virtual-affordance-role="button"
          data-virtual-affordance-zone="runs.header"
          data-virtual-affordance-actions="click"
          @click="loadRuns"
        >
          {{ loading ? t("runs.refreshing") : t("runs.refresh") }}
        </button>
      </header>

      <section class="runs-page__overview" :aria-label="t('runs.overviewLabel')">
        <article v-for="item in runOverview" :key="item.key" class="runs-page__overview-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <section class="runs-page__toolbar" :aria-label="t('runs.filterLabel')">
        <label class="runs-page__search-field">
          <span>{{ t("runs.searchGraphName") }}</span>
          <ElInput
            v-model="graphNameQuery"
            class="runs-page__search"
            :placeholder="t('runs.searchPlaceholder')"
            clearable
            data-virtual-affordance-id="runs.search.graphName"
            :data-virtual-affordance-label="t('runs.searchGraphName')"
            data-virtual-affordance-role="textbox"
            data-virtual-affordance-zone="runs.toolbar"
            data-virtual-affordance-actions="focus,clear,type,press"
            data-virtual-affordance-input-kind="text"
            :data-virtual-affordance-value-preview="graphNameQuery"
          />
        </label>
        <div class="runs-page__status-filter">
          <span>{{ t("runs.statusFilter") }}</span>
          <div class="runs-page__segments" role="tablist" :aria-label="t('runs.statusFilter')">
            <button
              v-for="option in statusOptions"
              :key="option.value || 'all'"
              type="button"
              class="runs-page__segment"
              :class="{ 'runs-page__segment--active': statusFilter === option.value }"
              role="tab"
              :aria-selected="statusFilter === option.value"
              :tabindex="statusFilter === option.value ? 0 : -1"
              :data-virtual-affordance-id="`runs.filter.status.${option.value || 'all'}`"
              :data-virtual-affordance-label="option.label"
              data-virtual-affordance-role="tab"
              data-virtual-affordance-zone="runs.toolbar"
              data-virtual-affordance-actions="click"
              :data-virtual-affordance-current="statusFilter === option.value ? 'true' : undefined"
              @click="statusFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="runs-page__list">
        <article v-if="loading" class="runs-page__empty">{{ t("common.loadingRuns") }}</article>
        <article v-else-if="error" class="runs-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
        <article v-else-if="runs.length === 0" class="runs-page__empty">
          <p>{{ t("runs.empty") }}</p>
          <RouterLink class="runs-page__empty-action" :to="runsEmptyAction.href">{{ runsEmptyAction.label }}</RouterLink>
        </article>
        <article
          v-for="run in paginatedRuns"
          v-else
          :key="run.run_id"
          class="runs-page__run-row"
          role="link"
          tabindex="0"
          :aria-label="t('runs.detailAria', { name: formatRunDisplayName(run) })"
          :data-virtual-affordance-id="`runs.run.${run.run_id}.openDetail`"
          :data-virtual-affordance-label="t('runs.detailAria', { name: formatRunDisplayName(run) })"
          data-virtual-affordance-role="navigation-link"
          data-virtual-affordance-zone="runs.list"
          data-virtual-affordance-actions="click"
          @click="openRunDetail(run.run_id)"
          @keydown="handleRunRowKeydown($event, run.run_id)"
        >
          <span class="runs-page__status-rail" :class="statusBadgeClass(run.status)" aria-hidden="true"></span>
          <div class="runs-page__run-main">
            <div class="runs-page__run-heading">
              <strong>{{ formatRunDisplayName(run) }}</strong>
              <span :class="statusBadgeClass(run.status)">{{ run.status }}</span>
            </div>
            <p class="runs-page__run-meta">
              <span>{{ formatRunDisplayTimestamp(run.started_at) }}</span>
              <span>{{ t("runs.elapsed", { duration: formatRunDuration(run.duration_ms) }) }}</span>
              <span v-if="run.revision_round > 0">{{ t("runs.revision", { revision: run.revision_round }) }}</span>
              <span v-if="run.final_score">{{ t("common.score") }} {{ run.final_score }}</span>
            </p>
            <p class="runs-page__run-id">{{ run.run_id }}</p>
          </div>
          <div class="runs-page__card-actions">
            <div v-if="restoreTargetsForRun(run).length > 1" class="runs-page__restore-switch" :aria-label="t('runs.restoreSnapshotAria')">
              <button
                v-for="target in restoreTargetsForRun(run)"
                :key="target.key"
                type="button"
                class="runs-page__restore-target"
                :class="{ 'runs-page__restore-target--active': target.key === selectedRestoreTargetKey(run) }"
                :title="target.detail"
                :data-virtual-affordance-id="`runs.run.${run.run_id}.restoreTarget.${target.key}`"
                :data-virtual-affordance-label="target.label"
                data-virtual-affordance-role="button"
                data-virtual-affordance-zone="runs.restore"
                data-virtual-affordance-actions="click"
                :data-virtual-affordance-current="target.key === selectedRestoreTargetKey(run) ? 'true' : undefined"
                @click.stop="selectRestoreTarget(run.run_id, target.key)"
              >
                {{ target.label }}
              </button>
            </div>
            <button type="button" class="runs-page__detail-link" @click.stop="openRunDetail(run.run_id)">{{ runCardDetail }}</button>
            <RouterLink
              v-if="canRestoreRunSummary(run)"
              class="runs-page__restore-link"
              :data-virtual-affordance-id="`runs.run.${run.run_id}.restoreEdit`"
              :data-virtual-affordance-label="t('common.restoreEdit')"
              data-virtual-affordance-role="navigation-link"
              data-virtual-affordance-zone="runs.restore"
              data-virtual-affordance-actions="click"
              @click.stop
              :to="restoreUrlForRun(run)"
            >
              <ElIcon class="runs-page__restore-icon" aria-hidden="true"><Promotion /></ElIcon>
              <span>{{ t("common.restoreEdit") }}</span>
            </RouterLink>
          </div>
        </article>
      </section>

      <section v-if="runs.length > RUNS_PAGE_SIZE" class="runs-page__pagination" :aria-label="t('runs.paginationLabel')">
        <ElPagination
          v-model:current-page="currentPage"
          background
          layout="prev, pager, next"
          :page-size="RUNS_PAGE_SIZE"
          :total="runs.length"
          :pager-count="7"
          :hide-on-single-page="true"
        />
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { Promotion } from "@element-plus/icons-vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElIcon, ElInput, ElPagination } from "element-plus";
import { useI18n } from "vue-i18n";

import { fetchRuns } from "@/api/runs";
import { formatRunDisplayName, formatRunDisplayTimestamp, formatRunDuration } from "@/lib/run-display-name";
import { canRestoreRunSummary, resolveRunRestoreUrl } from "@/lib/run-restore";
import AppShell from "@/layouts/AppShell.vue";
import type { RunSummary } from "@/types/run";

import {
  RUNS_PAGE_SIZE,
  buildRunStatusFilterOptions,
  buildRunRestoreTargets,
  buildRunStatusOverview,
  clampRunsPage,
  paginateRuns,
  resolveRunsCardDetail,
  resolveRunsEmptyAction,
} from "./runsPageModel.ts";

const router = useRouter();
const { t, locale } = useI18n();
const runs = ref<RunSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const graphNameQuery = ref("");
const statusFilter = ref("");
const currentPage = ref(1);
const statusOptions = computed(() => {
  locale.value;
  return buildRunStatusFilterOptions();
});
const selectedRestoreTargetByRunId = ref<Record<string, string>>({});
const runsEmptyAction = computed(() => {
  locale.value;
  return resolveRunsEmptyAction();
});
const runCardDetail = computed(() => {
  locale.value;
  return resolveRunsCardDetail();
});
const runOverview = computed(() => {
  locale.value;
  return buildRunStatusOverview(runs.value);
});
const paginatedRuns = computed(() => paginateRuns(runs.value, currentPage.value));
let searchTimer: number | null = null;

async function loadRuns() {
  loading.value = true;
  try {
    const fetchedRuns = await fetchRuns({
      graphName: graphNameQuery.value,
      status: statusFilter.value,
    });
    runs.value = fetchedRuns;
    currentPage.value = clampRunsPage(currentPage.value, fetchedRuns.length);
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loadingRuns");
  } finally {
    loading.value = false;
  }
}

function resetRunsPagination() {
  currentPage.value = 1;
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

function restoreTargetsForRun(run: RunSummary) {
  return buildRunRestoreTargets(run);
}

function selectedRestoreTargetKey(run: RunSummary) {
  const targets = restoreTargetsForRun(run);
  const selectedKey = selectedRestoreTargetByRunId.value[run.run_id];
  if (selectedKey && targets.some((target) => target.key === selectedKey)) {
    return selectedKey;
  }
  return targets[0]?.key ?? "current";
}

function selectRestoreTarget(runId: string, targetKey: string) {
  selectedRestoreTargetByRunId.value = {
    ...selectedRestoreTargetByRunId.value,
    [runId]: targetKey,
  };
}

function restoreUrlForRun(run: RunSummary) {
  const selectedKey = selectedRestoreTargetKey(run);
  const target = restoreTargetsForRun(run).find((candidate) => candidate.key === selectedKey) ?? null;
  return resolveRunRestoreUrl(run.run_id, target?.snapshotId ?? null);
}

onMounted(loadRuns);
watch(graphNameQuery, () => {
  resetRunsPagination();
  scheduleRunsLoad();
});
watch(statusFilter, () => {
  resetRunsPagination();
  void loadRuns();
});

onBeforeUnmount(() => {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
  }
});

function statusBadgeClass(status: string) {
  return `toograph-status-badge toograph-status-badge--${status.replaceAll("_", "-")}`;
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
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  box-shadow: var(--toograph-shadow-card);
}

.runs-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px;
  background: var(--toograph-surface-panel);
}

.runs-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.runs-page__title {
  margin: 8px 0 10px;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
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
.runs-page__restore-target,
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
.runs-page__restore-target:hover,
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
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 1.7rem;
  line-height: 1;
}

.runs-page__toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
  gap: 16px;
  align-items: end;
  padding: 16px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
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
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  width: 100%;
  overflow-x: auto;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 999px;
  background: rgba(255, 248, 240, 0.72);
  padding: 4px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.runs-page__segment {
  flex: 0 0 auto;
  min-height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  padding: 0 12px;
  color: rgba(90, 58, 28, 0.74);
  font-weight: 700;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.runs-page__segment:not(.runs-page__segment--active):hover {
  background: rgba(255, 255, 255, 0.56);
  color: rgba(124, 45, 18, 0.92);
}

.runs-page__segment--active {
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 255, 255, 0.96);
  color: var(--toograph-accent-strong);
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(120, 53, 15, 0.1);
}

.runs-page__segment:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

.runs-page__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 14px;
}

.runs-page__pagination {
  display: flex;
  justify-content: center;
  padding: 2px 0 8px;
}

.runs-page__pagination :deep(.el-pagination) {
  --el-pagination-button-bg-color: rgba(255, 248, 240, 0.9);
  --el-pagination-button-disabled-bg-color: rgba(255, 252, 247, 0.72);
  --el-pagination-hover-color: rgb(154, 52, 18);
  --el-color-primary: rgb(154, 52, 18);
  gap: 6px;
}

.runs-page__pagination :deep(.btn-prev),
.runs-page__pagination :deep(.btn-next),
.runs-page__pagination :deep(.el-pager li) {
  min-width: 32px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.runs-page__pagination :deep(.el-pager li.is-active) {
  border-color: rgba(154, 52, 18, 0.72);
  color: rgba(255, 250, 242, 0.98);
  box-shadow: 0 8px 16px rgba(120, 53, 15, 0.12);
}

.runs-page__run-row {
  position: relative;
  display: grid;
  grid-template-columns: 5px minmax(0, 1fr) auto;
  gap: 10px 14px;
  align-items: center;
  overflow: hidden;
  padding: 16px 18px;
  background: rgba(255, 253, 249, 0.86);
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, background-color 160ms ease;
}

.runs-page__run-row:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 253, 249, 0.96);
  box-shadow: var(--toograph-shadow-hover);
  transform: translateY(-1px);
}

.runs-page__run-row:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3), var(--toograph-shadow-hover);
}

.runs-page__status-rail {
  width: 5px;
  align-self: stretch;
  border-radius: 999px;
  background: var(--toograph-status-fg, rgb(154, 52, 18));
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
  color: var(--toograph-text-strong);
  font-size: 1rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runs-page__run-heading span,
.runs-page__badges span {
  border: 1px solid var(--toograph-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--toograph-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--toograph-status-fg, rgb(154, 52, 18));
  font-family: var(--toograph-font-mono);
  font-size: 0.78rem;
}

.runs-page__run-id {
  margin: 6px 0 0;
  overflow: hidden;
  color: rgba(60, 41, 20, 0.58);
  font-family: var(--toograph-font-mono);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runs-page__run-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin: 7px 0 0;
  color: rgba(60, 41, 20, 0.6);
  font-size: 0.8rem;
  line-height: 1.4;
}

.runs-page__run-meta span {
  min-width: 0;
}

.runs-page__card-actions {
  align-self: center;
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

.runs-page__restore-switch {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.72);
  padding: 3px;
}

.runs-page__restore-target {
  max-width: 150px;
  min-height: 28px;
  overflow: hidden;
  border-color: transparent;
  background: transparent;
  padding: 0 10px;
  color: rgba(120, 53, 15, 0.76);
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runs-page__restore-target--active,
.runs-page__restore-target--active:hover {
  border-color: rgba(154, 52, 18, 0.2);
  background: rgba(255, 244, 232, 0.98);
  color: rgba(126, 46, 11, 0.98);
  box-shadow: 0 8px 16px rgba(120, 53, 15, 0.08);
  transform: none;
}

.runs-page__restore-link {
  border-color: rgba(154, 52, 18, 0.72);
  background: rgba(154, 52, 18, 0.9);
  color: rgba(255, 250, 242, 0.98);
  box-shadow: 0 10px 18px rgba(120, 53, 15, 0.12);
}

.runs-page__restore-link:hover {
  border-color: rgba(131, 43, 13, 0.94);
  background: rgba(131, 43, 13, 0.96);
  color: rgba(255, 250, 242, 0.98);
}

.runs-page__restore-icon {
  margin-right: 6px;
  font-size: 0.92rem;
}

.runs-page__empty {
  grid-column: 1 / -1;
  display: grid;
  gap: 14px;
  padding: 24px;
  background: var(--toograph-surface-panel);
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

@media (max-width: 980px) {
  .runs-page__list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1120px) {
  .runs-page__run-row {
    grid-template-columns: 5px minmax(0, 1fr);
  }

  .runs-page__status-rail {
    grid-row: 1 / span 2;
  }

  .runs-page__card-actions {
    grid-column: 2;
    align-self: start;
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
