<template>
  <AppShell>
    <section class="evals-page">
      <header class="evals-page__header">
        <div>
          <div class="evals-page__eyebrow">{{ t("evals.eyebrow") }}</div>
          <h2 class="evals-page__title">{{ t("evals.title") }}</h2>
          <p class="evals-page__body">{{ t("evals.body") }}</p>
        </div>
        <div class="evals-page__header-actions">
          <ElButton
            class="evals-page__action"
            :loading="loading"
            data-virtual-affordance-id="evals.action.refresh"
            :data-virtual-affordance-label="t('evals.refresh')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="evals.header"
            data-virtual-affordance-actions="click"
            @click="loadEvalWorkspace"
          >
            <ElIcon aria-hidden="true"><Refresh /></ElIcon>
            <span>{{ t("evals.refresh") }}</span>
          </ElButton>
          <ElButton
            type="primary"
            class="evals-page__primary-action"
            :disabled="!selectedSuite || creatingRun"
            :loading="creatingRun"
            data-virtual-affordance-id="evals.action.createRun"
            :data-virtual-affordance-label="t('evals.createRun')"
            data-virtual-affordance-role="button"
            data-virtual-affordance-zone="evals.header"
            data-virtual-affordance-actions="click"
            @click="createSelectedSuiteRun"
          >
            <ElIcon aria-hidden="true"><CirclePlus /></ElIcon>
            <span>{{ t("evals.createRun") }}</span>
          </ElButton>
        </div>
      </header>

      <section class="evals-page__overview" :aria-label="t('evals.overviewLabel')">
        <article v-for="item in overview" :key="item.key" class="evals-page__metric">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <article v-if="error" class="evals-page__notice">
        {{ t("common.failedToLoad", { error }) }}
      </article>
      <article v-if="actionError" class="evals-page__notice">
        {{ t("evals.actionFailed", { error: actionError }) }}
      </article>

      <section class="evals-page__layout">
        <aside class="evals-page__suite-panel" :aria-label="t('evals.suiteList')">
          <div class="evals-page__panel-heading">
            <div>
              <span class="evals-page__section-kicker">{{ t("evals.suites") }}</span>
              <h3>{{ t("evals.suiteList") }}</h3>
            </div>
            <span>{{ t("evals.suiteCount", { count: suites.length }) }}</span>
          </div>

          <article v-if="loading" class="evals-page__empty">{{ t("common.loading") }}</article>
          <article v-else-if="suites.length === 0" class="evals-page__empty">{{ t("evals.emptySuites") }}</article>
          <div v-else class="evals-page__suite-list">
            <button
              v-for="suite in suites"
              :key="suite.suite_id"
              type="button"
              class="evals-page__suite-card"
              :class="{ 'evals-page__suite-card--active': selectedSuiteId === suite.suite_id }"
              @click="selectedSuiteId = suite.suite_id"
            >
              <strong>{{ suite.name || suite.suite_id }}</strong>
              <small>{{ formatEvalTarget(suite) }}</small>
              <span>{{ t("evals.caseCount", { count: suite.case_count }) }}</span>
              <span class="evals-page__suite-id evals-page__suite-id--compact" :title="suite.suite_id">{{ suite.suite_id }}</span>
            </button>
          </div>
        </aside>

        <section class="evals-page__detail-panel" :aria-label="t('evals.selectedSuite')">
          <div class="evals-page__panel-heading">
            <div>
              <span class="evals-page__section-kicker">{{ selectedSuite?.suite_id || t("common.none") }}</span>
              <h3>{{ selectedSuite?.name || t("evals.selectedSuite") }}</h3>
            </div>
            <div class="evals-page__run-picker" role="tablist" :aria-label="t('evals.runList')">
              <button
                v-for="run in runs"
                :key="run.eval_run_id"
                type="button"
                class="evals-page__run-chip"
                :class="{ 'evals-page__run-chip--active': selectedRun?.eval_run_id === run.eval_run_id }"
                role="tab"
                :aria-selected="selectedRun?.eval_run_id === run.eval_run_id"
                @click="selectedRunId = run.eval_run_id"
              >
                <span>{{ run.status }}</span>
                <small>{{ shortRunId(run.eval_run_id) }}</small>
              </button>
            </div>
          </div>
          <div v-if="selectedRun" class="evals-page__batch-actions">
            <label class="evals-page__judge-toggle">
              <span>{{ t("evals.llmJudge") }}</span>
              <ElSwitch
                v-model="runLlmJudgeOnCollect"
                size="small"
                :aria-label="t('evals.llmJudge')"
                data-virtual-affordance-id="evals.action.llmJudgeToggle"
                :data-virtual-affordance-label="t('evals.llmJudge')"
                data-virtual-affordance-role="switch"
                data-virtual-affordance-zone="evals.run"
                data-virtual-affordance-actions="toggle"
              />
            </label>
            <ElButton
              size="small"
              :loading="pendingActionKey === 'runAll'"
              :disabled="Boolean(pendingActionKey)"
              data-virtual-affordance-id="evals.action.runAllCases"
              :data-virtual-affordance-label="t('evals.runAllCases')"
              data-virtual-affordance-role="button"
              data-virtual-affordance-zone="evals.run"
              data-virtual-affordance-actions="click"
              @click="runSelectedRunCases"
            >
              <ElIcon aria-hidden="true"><VideoPlay /></ElIcon>
              <span>{{ t("evals.runAllCases") }}</span>
            </ElButton>
            <ElButton
              size="small"
              :loading="pendingActionKey === 'collectAll'"
              :disabled="Boolean(pendingActionKey)"
              data-virtual-affordance-id="evals.action.collectAllCases"
              :data-virtual-affordance-label="t('evals.collectAllCases')"
              data-virtual-affordance-role="button"
              data-virtual-affordance-zone="evals.run"
              data-virtual-affordance-actions="click"
              @click="collectSelectedRunCases"
            >
              <ElIcon aria-hidden="true"><Files /></ElIcon>
              <span>{{ t("evals.collectAllCases") }}</span>
            </ElButton>
          </div>

          <article v-if="detailLoading" class="evals-page__empty">{{ t("common.loading") }}</article>
          <article v-else-if="!selectedSuite" class="evals-page__empty">{{ t("evals.emptySuites") }}</article>
          <article v-else-if="!selectedRun" class="evals-page__empty">
            <p>{{ t("evals.emptyRuns") }}</p>
            <ElButton type="primary" :loading="creatingRun" @click="createSelectedSuiteRun">
              <ElIcon aria-hidden="true"><CirclePlus /></ElIcon>
              <span>{{ t("evals.createRun") }}</span>
            </ElButton>
          </article>
          <template v-else>
            <div class="evals-page__run-summary">
              <div>
                <span>{{ t("evals.selectedRun") }}</span>
                <strong>{{ selectedRun.eval_run_id }}</strong>
              </div>
              <div>
                <span>{{ t("common.status") }}</span>
                <strong :class="statusBadgeClass(selectedRun.status)">{{ selectedRun.status }}</strong>
              </div>
              <div>
                <span>{{ t("evals.caseStatusSummary") }}</span>
                <strong>{{ caseStatusSummary }}</strong>
              </div>
            </div>

            <section class="evals-page__case-grid">
              <article v-for="card in caseCards" :key="card.caseId" class="evals-page__case-card">
                <div class="evals-page__case-heading">
                  <div>
                    <span class="evals-page__suite-id">{{ card.caseId }}</span>
                    <h4>{{ card.title }}</h4>
                  </div>
                  <span :class="statusBadgeClass(card.status)">{{ card.status }}</span>
                </div>
                <p v-if="card.description" class="evals-page__muted">{{ card.description }}</p>
                <div class="evals-page__badges">
                  <span>{{ t("evals.checkCount", { count: card.checkCount }) }}</span>
                  <span>{{ t("evals.failedCheckCount", { count: card.failedCheckCount }) }}</span>
                  <span>{{ t("evals.artifactCount", { count: card.artifactCount }) }}</span>
                </div>
                <p v-if="card.error && card.failureDiagnostics.length === 0" class="evals-page__error">{{ card.error }}</p>
                <pre v-if="card.finalOutputPreview" class="evals-page__preview">{{ card.finalOutputPreview }}</pre>
                <div v-if="card.checks.length > 0" class="evals-page__check-list">
                  <span v-for="(check, index) in card.checks" :key="`${card.caseId}-${index}`" :class="statusBadgeClass(check.status)">
                    {{ check.kind || check.name || t("evals.check") }} · {{ check.status }}
                  </span>
                </div>
                <section v-if="card.failureDiagnostics.length > 0" class="evals-page__failure-diagnostics">
                  <div class="evals-page__failure-summary">
                    <span>{{ t("evals.failureDiagnostics") }}</span>
                    <strong>{{ card.primaryFailure }}</strong>
                  </div>
                  <div class="evals-page__failure-list">
                    <div
                      v-for="diagnostic in card.failureDiagnostics"
                      :key="diagnostic.key"
                      class="evals-page__failure-row"
                      :class="`evals-page__failure-row--${diagnostic.kind}`"
                    >
                      <div class="evals-page__failure-row-heading">
                        <strong>{{ diagnostic.label }}</strong>
                        <span :class="statusBadgeClass(diagnostic.status)">{{ diagnostic.status }}</span>
                      </div>
                      <p>{{ diagnostic.message }}</p>
                      <pre v-if="diagnostic.detailPreview">{{ diagnostic.detailPreview }}</pre>
                    </div>
                  </div>
                </section>
                <details
                  v-if="card.expectedPreview || card.actualPreview || card.checkComparisons.length > 0"
                  class="evals-page__comparison"
                  open
                >
                  <summary>{{ t("evals.comparison") }}</summary>
                  <div class="evals-page__comparison-grid">
                    <section>
                      <span>{{ t("evals.expected") }}</span>
                      <pre>{{ card.expectedPreview || t("common.none") }}</pre>
                    </section>
                    <section>
                      <span>{{ t("evals.actual") }}</span>
                      <pre>{{ card.actualPreview || t("common.none") }}</pre>
                    </section>
                  </div>
                  <div v-if="card.checkComparisons.length > 0" class="evals-page__check-comparison-list">
                    <section
                      v-for="comparison in card.checkComparisons"
                      :key="comparison.key"
                      class="evals-page__check-comparison"
                    >
                      <div class="evals-page__check-comparison-heading">
                        <strong>{{ comparison.label }}</strong>
                        <span :class="statusBadgeClass(comparison.status)">{{ comparison.status }}</span>
                      </div>
                      <p v-if="comparison.message" class="evals-page__muted">{{ comparison.message }}</p>
                      <div class="evals-page__comparison-grid">
                        <section>
                          <span>{{ t("evals.expected") }}</span>
                          <pre>{{ comparison.expectedPreview || t("common.none") }}</pre>
                        </section>
                        <section>
                          <span>{{ t("evals.actual") }}</span>
                          <pre>{{ comparison.actualPreview || t("common.none") }}</pre>
                        </section>
                      </div>
                    </section>
                  </div>
                </details>
                <div class="evals-page__case-actions">
                  <ElButton
                    size="small"
                    :loading="pendingActionKey === `run:${card.caseId}`"
                    :disabled="Boolean(pendingActionKey)"
                    :data-virtual-affordance-id="`evals.case.${card.caseId}.run`"
                    :data-virtual-affordance-label="t('evals.runCase')"
                    data-virtual-affordance-role="button"
                    data-virtual-affordance-zone="evals.case"
                    data-virtual-affordance-actions="click"
                    @click="startEvalCase(card.caseId)"
                  >
                    <ElIcon aria-hidden="true"><VideoPlay /></ElIcon>
                    <span>{{ card.graphRunId ? t("evals.rerunCase") : t("evals.runCase") }}</span>
                  </ElButton>
                  <ElButton
                    size="small"
                    :loading="pendingActionKey === `collect:${card.caseId}`"
                    :disabled="Boolean(pendingActionKey) || !card.graphRunId"
                    :data-virtual-affordance-id="`evals.case.${card.caseId}.collect`"
                    :data-virtual-affordance-label="t('evals.collectCase')"
                    data-virtual-affordance-role="button"
                    data-virtual-affordance-zone="evals.case"
                    data-virtual-affordance-actions="click"
                    @click="collectEvalCase(card.caseId)"
                  >
                    <ElIcon aria-hidden="true"><Files /></ElIcon>
                    <span>{{ t("evals.collectCase") }}</span>
                  </ElButton>
                  <RouterLink v-if="card.graphRunId" class="evals-page__run-link" :to="`/runs/${encodeURIComponent(card.graphRunId)}`">
                    {{ t("evals.openGraphRun") }}
                  </RouterLink>
                </div>
              </article>
            </section>
          </template>
        </section>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
// 开发者内部遗留页面：当前冻结，保留现有内部工具兼容。
import { CirclePlus, Files, Refresh, VideoPlay } from "@element-plus/icons-vue";
import { ElButton, ElIcon, ElSwitch } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  fetchEvalSuites,
  fetchEvalCases,
  fetchEvalRuns,
  createEvalRun,
  runEvalCase,
  runEvalRunCases,
  collectEvalCaseResult,
  collectEvalRunCases,
} from "@/api/evals";
import AppShell from "@/layouts/AppShell.vue";
import type { EvalCase, EvalRun, EvalSuite } from "@/types/eval";

import {
  buildEvalCaseCards,
  buildEvalOverview,
  chooseInitialEvalSuiteId,
  countEvalCaseStatuses,
  formatEvalTarget,
  latestEvalRun,
} from "./evalsPageModel.ts";

const { t, locale } = useI18n();
const suites = ref<EvalSuite[]>([]);
const cases = ref<EvalCase[]>([]);
const runs = ref<EvalRun[]>([]);
const selectedSuiteId = ref("");
const selectedRunId = ref("");
const loading = ref(true);
const detailLoading = ref(false);
const creatingRun = ref(false);
const pendingActionKey = ref("");
const runLlmJudgeOnCollect = ref(false);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);

const selectedSuite = computed(() => suites.value.find((suite) => suite.suite_id === selectedSuiteId.value) ?? null);
const selectedRun = computed(() => runs.value.find((run) => run.eval_run_id === selectedRunId.value) ?? latestEvalRun(runs.value));
const overview = computed(() => {
  locale.value;
  return buildEvalOverview(suites.value, runs.value);
});
const caseCards = computed(() => buildEvalCaseCards(cases.value, selectedRun.value));
const caseStatusSummary = computed(() => {
  locale.value;
  const counts = countEvalCaseStatuses(selectedRun.value?.case_results ?? []);
  return t("evals.caseStatusCounts", counts);
});

async function loadEvalWorkspace() {
  loading.value = true;
  try {
    suites.value = await fetchEvalSuites();
    selectedSuiteId.value = chooseInitialEvalSuiteId(suites.value, selectedSuiteId.value);
    error.value = null;
    await loadSelectedSuiteDetail();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : t("common.loading");
  } finally {
    loading.value = false;
  }
}

async function loadSelectedSuiteDetail() {
  if (!selectedSuiteId.value) {
    cases.value = [];
    runs.value = [];
    selectedRunId.value = "";
    return;
  }
  detailLoading.value = true;
  try {
    const [nextCases, nextRuns] = await Promise.all([
      fetchEvalCases(selectedSuiteId.value),
      fetchEvalRuns(selectedSuiteId.value),
    ]);
    cases.value = nextCases;
    runs.value = nextRuns;
    selectedRunId.value = latestEvalRun(nextRuns)?.eval_run_id ?? "";
    actionError.value = null;
  } catch (loadError) {
    actionError.value = loadError instanceof Error ? loadError.message : t("common.loading");
  } finally {
    detailLoading.value = false;
  }
}

async function createSelectedSuiteRun() {
  if (!selectedSuiteId.value) {
    return;
  }
  creatingRun.value = true;
  try {
    const createdRun = await createEvalRun(selectedSuiteId.value);
    runs.value = [createdRun, ...runs.value.filter((run) => run.eval_run_id !== createdRun.eval_run_id)];
    selectedRunId.value = createdRun.eval_run_id;
    actionError.value = null;
  } catch (runError) {
    actionError.value = runError instanceof Error ? runError.message : t("evals.actionFailedFallback");
  } finally {
    creatingRun.value = false;
  }
}

async function startEvalCase(caseId: string) {
  if (!selectedRun.value) {
    return;
  }
  pendingActionKey.value = `run:${caseId}`;
  try {
    const result = await runEvalCase(selectedRun.value.eval_run_id, caseId);
    mergeCaseResult(result);
    actionError.value = null;
  } catch (runError) {
    actionError.value = runError instanceof Error ? runError.message : t("evals.actionFailedFallback");
  } finally {
    pendingActionKey.value = "";
  }
}

async function runSelectedRunCases() {
  if (!selectedRun.value) {
    return;
  }
  pendingActionKey.value = "runAll";
  try {
    const batch = await runEvalRunCases(selectedRun.value.eval_run_id);
    mergeCaseResults(batch.results);
    actionError.value = batch.errors.length > 0 ? t("evals.batchPartialFailure", { count: batch.errors.length }) : null;
  } catch (runError) {
    actionError.value = runError instanceof Error ? runError.message : t("evals.actionFailedFallback");
  } finally {
    pendingActionKey.value = "";
  }
}

async function collectEvalCase(caseId: string) {
  if (!selectedRun.value) {
    return;
  }
  pendingActionKey.value = `collect:${caseId}`;
  try {
    const result = await collectEvalCaseResult(selectedRun.value.eval_run_id, caseId, {
      runLlmJudge: runLlmJudgeOnCollect.value,
    });
    mergeCaseResult(result);
    actionError.value = null;
  } catch (collectError) {
    actionError.value = collectError instanceof Error ? collectError.message : t("evals.actionFailedFallback");
  } finally {
    pendingActionKey.value = "";
  }
}

async function collectSelectedRunCases() {
  if (!selectedRun.value) {
    return;
  }
  pendingActionKey.value = "collectAll";
  try {
    const batch = await collectEvalRunCases(selectedRun.value.eval_run_id, {
      runLlmJudge: runLlmJudgeOnCollect.value,
    });
    mergeCaseResults(batch.results);
    actionError.value = batch.errors.length > 0 ? t("evals.batchPartialFailure", { count: batch.errors.length }) : null;
  } catch (collectError) {
    actionError.value = collectError instanceof Error ? collectError.message : t("evals.actionFailedFallback");
  } finally {
    pendingActionKey.value = "";
  }
}

function mergeCaseResult(result: EvalRun["case_results"][number]) {
  mergeCaseResults([result]);
}

function mergeCaseResults(results: EvalRun["case_results"]) {
  if (results.length === 0) {
    return;
  }
  const resultsByRunId = new Map<string, EvalRun["case_results"]>();
  for (const result of results) {
    const runResults = resultsByRunId.get(result.eval_run_id) ?? [];
    runResults.push(result);
    resultsByRunId.set(result.eval_run_id, runResults);
  }
  runs.value = runs.value.map((run) => {
    const nextResults = resultsByRunId.get(run.eval_run_id);
    if (!nextResults) {
      return run;
    }
    const nextResultsByCaseId = new Map(nextResults.map((nextResult) => [nextResult.case_id, nextResult]));
    const caseResults = run.case_results.map((caseResult) => nextResultsByCaseId.get(caseResult.case_id) ?? caseResult);
    const nextRunStatus = caseResults.some((caseResult) => caseResult.status === "failed" || caseResult.status === "error")
      ? "failed"
      : caseResults.every((caseResult) => caseResult.status === "passed")
        ? "passed"
        : caseResults.some((caseResult) => caseResult.status === "running")
          ? "running"
          : run.status;
    return { ...run, status: nextRunStatus, case_results: caseResults };
  });
}

function shortRunId(runId: string) {
  return runId.length > 16 ? `${runId.slice(0, 12)}...` : runId;
}

function statusBadgeClass(status: string) {
  const normalized = status || "pending";
  if (normalized === "passed" || normalized === "completed") {
    return "evals-page__status evals-page__status--passed";
  }
  if (normalized === "failed" || normalized === "error") {
    return "evals-page__status evals-page__status--failed";
  }
  if (normalized === "running") {
    return "evals-page__status evals-page__status--running";
  }
  return "evals-page__status evals-page__status--pending";
}

watch(selectedSuiteId, () => {
  void loadSelectedSuiteDetail();
});

onMounted(() => {
  void loadEvalWorkspace();
});
</script>

<style scoped>
.evals-page {
  min-height: 100%;
  display: grid;
  gap: 18px;
  padding: 24px;
}

.evals-page__header,
.evals-page__overview,
.evals-page__suite-panel,
.evals-page__detail-panel {
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  border: 1px solid rgba(120, 53, 15, 0.1);
  box-shadow: 0 18px 46px rgba(30, 41, 59, 0.08);
  backdrop-filter: blur(18px) saturate(1.15);
}

.evals-page__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 22px;
  border-radius: 8px;
}

.evals-page__eyebrow,
.evals-page__section-kicker {
  color: var(--toograph-accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.evals-page__title {
  margin: 4px 0 8px;
  color: var(--toograph-text-strong);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  letter-spacing: 0;
}

.evals-page__body,
.evals-page__muted {
  margin: 0;
  color: var(--toograph-text-muted);
  line-height: 1.65;
}

.evals-page__header-actions,
.evals-page__batch-actions,
.evals-page__case-actions,
.evals-page__badges,
.evals-page__check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.evals-page__overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
}

.evals-page__metric {
  min-width: 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.evals-page__metric span,
.evals-page__run-summary span {
  display: block;
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.evals-page__metric strong,
.evals-page__run-summary strong {
  display: block;
  margin-top: 5px;
  color: var(--toograph-text-strong);
  font-size: 1.25rem;
}

.evals-page__notice,
.evals-page__empty {
  padding: 16px;
  border: 1px solid rgba(180, 83, 9, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--toograph-text-muted);
}

.evals-page__layout {
  display: grid;
  grid-template-columns: minmax(260px, 0.34fr) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.evals-page__suite-panel,
.evals-page__detail-panel {
  min-width: 0;
  border-radius: 8px;
  padding: 16px;
}

.evals-page__panel-heading,
.evals-page__case-heading,
.evals-page__run-summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.evals-page__panel-heading h3,
.evals-page__case-heading h4 {
  margin: 3px 0 0;
  color: var(--toograph-text-strong);
  letter-spacing: 0;
}

.evals-page__suite-list,
.evals-page__case-grid {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.evals-page__suite-card,
.evals-page__case-card {
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
}

.evals-page__suite-card {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 13px;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.evals-page__suite-card:hover,
.evals-page__suite-card--active {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 255, 255, 0.86);
}

.evals-page__suite-id {
  overflow-wrap: anywhere;
  color: var(--toograph-text-muted);
  font-family: var(--toograph-font-mono);
  font-size: 0.76rem;
}

.evals-page__suite-id--compact {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evals-page__run-picker {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.evals-page__run-chip {
  display: grid;
  gap: 2px;
  padding: 7px 10px;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  color: var(--toograph-text-muted);
  cursor: pointer;
}

.evals-page__run-chip--active {
  background: rgba(254, 243, 199, 0.88);
  color: var(--toograph-accent-strong);
}

.evals-page__run-summary {
  margin: 14px 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);
}

.evals-page__batch-actions {
  justify-content: flex-end;
  margin-top: 12px;
}

.evals-page__judge-toggle {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 999px;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--toograph-text-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.evals-page__case-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.evals-page__case-card {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.evals-page__badges span,
.evals-page__check-list span,
.evals-page__status {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--toograph-status-bg, rgba(148, 163, 184, 0.16));
  color: var(--toograph-status-fg, var(--toograph-text-muted));
  font-size: 0.76rem;
  font-weight: 700;
}

.evals-page__status--passed {
  --toograph-status-bg: rgba(16, 185, 129, 0.12);
  --toograph-status-fg: #047857;
}

.evals-page__status--failed {
  --toograph-status-bg: rgba(239, 68, 68, 0.12);
  --toograph-status-fg: #b91c1c;
}

.evals-page__status--running {
  --toograph-status-bg: rgba(59, 130, 246, 0.12);
  --toograph-status-fg: #1d4ed8;
}

.evals-page__status--pending {
  --toograph-status-bg: rgba(148, 163, 184, 0.16);
  --toograph-status-fg: #475569;
}

.evals-page__error {
  margin: 0;
  color: #b91c1c;
  font-weight: 700;
}

.evals-page__preview {
  max-height: 150px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--toograph-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.evals-page__failure-diagnostics {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(239, 68, 68, 0.16);
  border-left-width: 3px;
  border-radius: 8px;
  padding: 10px;
  background: rgba(254, 242, 242, 0.72);
}

.evals-page__failure-summary {
  display: grid;
  gap: 4px;
}

.evals-page__failure-summary span {
  color: #991b1b;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.evals-page__failure-summary strong {
  color: var(--toograph-text-strong);
  font-size: 0.9rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.evals-page__failure-list {
  display: grid;
  gap: 8px;
}

.evals-page__failure-row {
  display: grid;
  gap: 6px;
  min-width: 0;
  border-top: 1px solid rgba(239, 68, 68, 0.12);
  padding-top: 8px;
}

.evals-page__failure-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.evals-page__failure-row-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.evals-page__failure-row-heading strong {
  min-width: 0;
  color: var(--toograph-text-strong);
  overflow-wrap: anywhere;
}

.evals-page__failure-row p {
  margin: 0;
  color: #991b1b;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.evals-page__failure-row pre {
  max-height: 96px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--toograph-text);
  font-size: 0.76rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.evals-page__run-link {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  color: var(--toograph-accent-strong);
  font-weight: 800;
  text-decoration: none;
}

.evals-page__comparison {
  border: 1px solid rgba(120, 53, 15, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.46);
}

.evals-page__comparison summary {
  cursor: pointer;
  padding: 9px 10px;
  color: var(--toograph-text-strong);
  font-weight: 800;
}

.evals-page__comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 10px 10px;
}

.evals-page__comparison-grid section {
  min-width: 0;
}

.evals-page__comparison-grid span {
  display: block;
  margin-bottom: 4px;
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.evals-page__comparison-grid pre {
  min-height: 42px;
  max-height: 120px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.04);
  color: var(--toograph-text);
  font-size: 0.76rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.evals-page__check-comparison-list {
  display: grid;
  gap: 8px;
  padding: 0 10px 10px;
}

.evals-page__check-comparison {
  border-top: 1px solid rgba(120, 53, 15, 0.08);
  padding-top: 8px;
}

.evals-page__check-comparison-heading {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

@media (max-width: 1180px) {
  .evals-page__case-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1020px) {
  .evals-page {
    padding: 16px;
  }

  .evals-page__header,
  .evals-page__layout {
    grid-template-columns: 1fr;
  }

  .evals-page__overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .evals-page__overview,
  .evals-page__comparison-grid {
    grid-template-columns: 1fr;
  }

  .evals-page__panel-heading,
  .evals-page__case-heading,
  .evals-page__run-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .evals-page__run-picker {
    justify-content: flex-start;
  }

  .evals-page__header-actions,
  .evals-page__batch-actions,
  .evals-page__case-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .evals-page__judge-toggle {
    justify-content: space-between;
  }
}
</style>
