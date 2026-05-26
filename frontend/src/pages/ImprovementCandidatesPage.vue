<template>
  <AppShell>
    <section class="improvements-page">
      <header class="improvements-page__header">
        <div>
          <div class="improvements-page__eyebrow">{{ t("improvements.eyebrow") }}</div>
          <h2 class="improvements-page__title">{{ t("improvements.title") }}</h2>
          <p class="improvements-page__body">{{ t("improvements.body") }}</p>
        </div>
        <ElButton
          class="improvements-page__refresh"
          :loading="loading"
          :disabled="Boolean(pendingActionKey)"
          data-virtual-affordance-id="improvements.action.refresh"
          :data-virtual-affordance-label="t('improvements.refresh')"
          data-virtual-affordance-role="button"
          data-virtual-affordance-zone="improvements.header"
          data-virtual-affordance-actions="click"
          @click="loadCandidates"
        >
          <ElIcon aria-hidden="true"><Refresh /></ElIcon>
          <span>{{ loading ? t("improvements.refreshing") : t("improvements.refresh") }}</span>
        </ElButton>
      </header>

      <section class="improvements-page__overview" :aria-label="t('improvements.overviewLabel')">
        <article v-for="item in overview" :key="item.key" class="improvements-page__metric">
          <span>{{ t(item.labelKey) }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </section>

      <article v-if="error" class="improvements-page__notice">{{ t("common.failedToLoad", { error }) }}</article>

      <section class="improvements-page__toolbar" :aria-label="t('improvements.filterLabel')">
        <label class="improvements-page__search-field">
          <span>{{ t("improvements.searchLabel") }}</span>
          <ElInput
            v-model="query"
            class="improvements-page__search"
            :placeholder="t('improvements.searchPlaceholder')"
            clearable
          >
            <template #prefix>
              <ElIcon aria-hidden="true"><Search /></ElIcon>
            </template>
          </ElInput>
        </label>
        <div class="improvements-page__status-filter">
          <span>{{ t("improvements.statusFilter") }}</span>
          <div class="improvements-page__filter-tabs" role="tablist" :aria-label="t('improvements.statusFilter')">
            <button
              v-for="option in statusOptions"
              :key="option.value || 'all'"
              type="button"
              class="improvements-page__filter-tab"
              :class="{ 'improvements-page__filter-tab--active': statusFilter === option.value }"
              role="tab"
              :aria-selected="statusFilter === option.value"
              @click="statusFilter = option.value"
            >
              {{ t(option.labelKey) }}
            </button>
          </div>
        </div>
      </section>

      <section class="improvements-page__workspace">
        <aside class="improvements-page__queue" :aria-label="t('improvements.queueLabel')">
          <div class="improvements-page__panel-heading">
            <div>
              <span>{{ t("improvements.queueLabel") }}</span>
              <h3>{{ t("improvements.candidateCount", { count: visibleCandidates.length }) }}</h3>
            </div>
          </div>

          <article v-if="loading" class="improvements-page__empty">{{ t("common.loading") }}</article>
          <article v-else-if="visibleCandidates.length === 0" class="improvements-page__empty">{{ t("improvements.empty") }}</article>
          <div v-else class="improvements-page__candidate-list">
            <button
              v-for="candidate in visibleCandidates"
              :key="candidate.candidate_id"
              type="button"
              class="improvements-page__candidate"
              :class="{ 'improvements-page__candidate--active': selectedCandidate?.candidate_id === candidate.candidate_id }"
              @click="selectedCandidateId = candidate.candidate_id"
            >
              <span :class="statusClass(candidate.status)">{{ candidate.status }}</span>
              <strong>{{ candidate.proposed_change_summary || candidate.candidate_id }}</strong>
              <small>{{ candidate.candidate_id }}</small>
              <div class="improvements-page__badges">
                <span>{{ candidate.kind || t("common.none") }}</span>
                <span>{{ candidate.risk_level || t("common.none") }}</span>
              </div>
            </button>
          </div>
        </aside>

        <article class="improvements-page__detail" :aria-label="t('improvements.detailLabel')">
          <template v-if="selectedCandidate">
            <header class="improvements-page__detail-header">
              <div>
                <span class="improvements-page__id">{{ selectedCandidate.candidate_id }}</span>
                <h3>{{ selectedCandidate.proposed_change_summary || selectedCandidate.candidate_id }}</h3>
                <p v-if="selectedCandidate.expected_benefit">{{ selectedCandidate.expected_benefit }}</p>
              </div>
              <span :class="statusClass(selectedCandidate.status)">{{ selectedCandidate.status }}</span>
            </header>

            <div class="improvements-page__actions" :aria-label="t('improvements.detailLabel')">
              <ElButton
                v-if="canValidateImprovementCandidate(selectedCandidate)"
                size="small"
                :loading="pendingActionKey === `${selectedCandidate.candidate_id}:validate`"
                :disabled="Boolean(pendingActionKey)"
                @click="startCandidateValidation(selectedCandidate)"
              >
                <ElIcon aria-hidden="true"><VideoPlay /></ElIcon>
                <span>{{ t("improvements.validate") }}</span>
              </ElButton>
              <ElButton
                v-if="selectedCandidate.validation_run_id"
                size="small"
                :loading="pendingActionKey === `${selectedCandidate.candidate_id}:sync`"
                :disabled="Boolean(pendingActionKey)"
                @click="syncCandidateValidation(selectedCandidate)"
              >
                <ElIcon aria-hidden="true"><Refresh /></ElIcon>
                <span>{{ t("improvements.syncValidation") }}</span>
              </ElButton>
              <ElButton
                v-if="canApproveImprovementCandidate(selectedCandidate)"
                size="small"
                type="success"
                :loading="pendingActionKey === `${selectedCandidate.candidate_id}:approve`"
                :disabled="Boolean(pendingActionKey)"
                @click="decideCandidate(selectedCandidate, 'approve')"
              >
                <ElIcon aria-hidden="true"><Check /></ElIcon>
                <span>{{ t("improvements.approve") }}</span>
              </ElButton>
              <ElButton
                v-if="canRejectImprovementCandidate(selectedCandidate)"
                size="small"
                type="danger"
                plain
                :loading="pendingActionKey === `${selectedCandidate.candidate_id}:reject`"
                :disabled="Boolean(pendingActionKey)"
                @click="decideCandidate(selectedCandidate, 'reject')"
              >
                <ElIcon aria-hidden="true"><Close /></ElIcon>
                <span>{{ t("improvements.reject") }}</span>
              </ElButton>
              <ElButton
                v-if="canApplyImprovementCandidate(selectedCandidate)"
                size="small"
                type="success"
                :loading="pendingActionKey === `${selectedCandidate.candidate_id}:apply`"
                :disabled="Boolean(pendingActionKey)"
                @click="applyCandidate(selectedCandidate)"
              >
                <ElIcon aria-hidden="true"><Promotion /></ElIcon>
                <span>{{ t("improvements.apply") }}</span>
              </ElButton>
            </div>

            <div class="improvements-page__facts">
              <section>
                <span>{{ t("improvements.kind") }}</span>
                <strong>{{ selectedCandidate.kind || t("common.none") }}</strong>
              </section>
              <section>
                <span>{{ t("improvements.risk") }}</span>
                <strong>{{ selectedCandidate.risk_level || t("common.none") }}</strong>
              </section>
              <section>
                <span>{{ t("common.status") }}</span>
                <strong>{{ selectedCandidate.status }}</strong>
              </section>
              <section>
                <span>{{ t("improvements.updatedAt") }}</span>
                <strong>{{ selectedCandidate.updated_at || t("common.none") }}</strong>
              </section>
            </div>

            <section class="improvements-page__links">
              <div>
                <span>{{ t("improvements.sourceRun") }}</span>
                <RouterLink v-if="selectedCandidate.source_run_id" :to="runHref(selectedCandidate.source_run_id)">
                  {{ selectedCandidate.source_run_id }}
                </RouterLink>
                <strong v-else>{{ t("common.none") }}</strong>
              </div>
              <div>
                <span>{{ t("improvements.reviewRun") }}</span>
                <RouterLink v-if="selectedCandidate.review_run_id" :to="runHref(selectedCandidate.review_run_id)">
                  {{ selectedCandidate.review_run_id }}
                </RouterLink>
                <strong v-else>{{ t("common.none") }}</strong>
              </div>
              <div>
                <span>{{ t("improvements.validationRun") }}</span>
                <RouterLink v-if="selectedCandidate.validation_run_id" :to="runHref(selectedCandidate.validation_run_id)">
                  {{ selectedCandidate.validation_run_id }}
                </RouterLink>
                <strong v-else>{{ t("common.none") }}</strong>
              </div>
              <div>
                <span>{{ t("improvements.appliedRevision") }}</span>
                <strong>{{ selectedCandidate.applied_revision_id || t("common.none") }}</strong>
              </div>
            </section>

            <p v-if="selectedCandidate.status_reason" class="improvements-page__reason">
              <strong>{{ t("improvements.statusReason") }}</strong>
              <span>{{ selectedCandidate.status_reason }}</span>
            </p>

            <div class="improvements-page__json-grid">
              <section>
                <h4>{{ t("improvements.targetRef") }}</h4>
                <pre>{{ JSON.stringify(selectedCandidate.target_ref, null, 2) }}</pre>
              </section>
              <section>
                <h4>{{ t("improvements.evidenceRefs") }}</h4>
                <pre>{{ JSON.stringify(selectedCandidate.evidence_refs, null, 2) }}</pre>
              </section>
              <section class="improvements-page__json-wide">
                <h4>{{ t("improvements.validationResult") }}</h4>
                <pre>{{ JSON.stringify(selectedCandidate.validation_result, null, 2) }}</pre>
              </section>
            </div>
          </template>
          <article v-else class="improvements-page__empty">{{ t("improvements.noSelection") }}</article>
        </article>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { Check, Close, Promotion, Refresh, Search, VideoPlay } from "@element-plus/icons-vue";
import { ElButton, ElIcon, ElInput, ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";

import {
  applyBuddyImprovementCandidate,
  decideBuddyImprovementCandidate,
  fetchBuddyImprovementCandidates,
  linkBuddyImprovementCandidateValidationRun,
  syncBuddyImprovementCandidateValidationStatus,
} from "@/api/buddy";
import { fetchTemplate, runGraph } from "@/api/graphs";
import { buildBuddyImprovementReviewGraph, BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID } from "@/buddy/buddyImprovementReviewGraph";
import AppShell from "@/layouts/AppShell.vue";
import type { BuddyImprovementCandidate } from "@/types/buddy";

import {
  buildImprovementCandidateOverview,
  buildImprovementCandidateStatusOptions,
  canApplyImprovementCandidate,
  canApproveImprovementCandidate,
  canRejectImprovementCandidate,
  canValidateImprovementCandidate,
  filterImprovementCandidates,
  sortImprovementCandidates,
} from "./improvementCandidatesPageModel.ts";

type CandidateDecision = "approve" | "reject";

const router = useRouter();
const { t, locale } = useI18n();
const candidates = ref<BuddyImprovementCandidate[]>([]);
const loading = ref(false);
const error = ref("");
const query = ref("");
const statusFilter = ref("");
const selectedCandidateId = ref("");
const pendingActionKey = ref("");

const statusOptions = computed(() => {
  locale.value;
  return buildImprovementCandidateStatusOptions();
});
const overview = computed(() => {
  locale.value;
  return buildImprovementCandidateOverview(candidates.value);
});
const filteredCandidates = computed(() => filterImprovementCandidates(candidates.value, { status: statusFilter.value, query: query.value }));
const visibleCandidates = computed(() => sortImprovementCandidates(filteredCandidates.value));
const selectedCandidate = computed(() => visibleCandidates.value.find((candidate) => candidate.candidate_id === selectedCandidateId.value) ?? null);

watch(visibleCandidates, (nextCandidates) => {
  if (nextCandidates.some((candidate) => candidate.candidate_id === selectedCandidateId.value)) {
    return;
  }
  selectedCandidateId.value = nextCandidates[0]?.candidate_id ?? "";
}, { immediate: true });

onMounted(() => {
  void loadCandidates();
});

async function loadCandidates() {
  loading.value = true;
  error.value = "";
  try {
    candidates.value = await fetchBuddyImprovementCandidates();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError);
  } finally {
    loading.value = false;
  }
}

async function startCandidateValidation(candidate: BuddyImprovementCandidate) {
  if (pendingActionKey.value) {
    return;
  }
  pendingActionKey.value = `${candidate.candidate_id}:validate`;
  try {
    const template = await fetchTemplate(BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID);
    const graph = buildBuddyImprovementReviewGraph(template, {
      candidate: candidate.payload,
      sourceRunId: candidate.source_run_id,
    });
    const response = await runGraph(graph);
    const updated = await linkBuddyImprovementCandidateValidationRun(candidate.candidate_id, response.run_id);
    replaceCandidate(updated);
    ElMessage.success(t("improvements.validationQueued", { runId: response.run_id }));
    await router.push(runHref(response.run_id));
  } catch (validationError) {
    ElMessage.error(validationError instanceof Error ? validationError.message : t("common.failedToSave", { error: "" }));
  } finally {
    pendingActionKey.value = "";
  }
}

async function syncCandidateValidation(candidate: BuddyImprovementCandidate) {
  if (pendingActionKey.value) {
    return;
  }
  pendingActionKey.value = `${candidate.candidate_id}:sync`;
  try {
    const updated = await syncBuddyImprovementCandidateValidationStatus(candidate.candidate_id);
    replaceCandidate(updated);
    ElMessage.success(t("improvements.validationSynced"));
  } catch (syncError) {
    ElMessage.error(syncError instanceof Error ? syncError.message : t("common.failedToSave", { error: "" }));
  } finally {
    pendingActionKey.value = "";
  }
}

async function decideCandidate(candidate: BuddyImprovementCandidate, decision: CandidateDecision) {
  if (pendingActionKey.value) {
    return;
  }
  const candidateId = candidate.candidate_id;
  const approve = decision === "approve";
  try {
    await ElMessageBox.confirm(
      t(approve ? "improvements.confirmApprove" : "improvements.confirmReject", { candidateId }),
      t(approve ? "improvements.confirmApproveTitle" : "improvements.confirmRejectTitle"),
      {
        confirmButtonText: t(approve ? "improvements.approve" : "improvements.reject"),
        cancelButtonText: t("common.cancel"),
        type: approve ? "success" : "warning",
      },
    );
  } catch {
    return;
  }
  pendingActionKey.value = `${candidateId}:${decision}`;
  try {
    const updated = await decideBuddyImprovementCandidate(
      candidate.candidate_id,
      decision,
      t(approve ? "improvements.approveReason" : "improvements.rejectReason"),
    );
    replaceCandidate(updated);
    ElMessage.success(t(approve ? "improvements.candidateApproved" : "improvements.candidateRejected", { candidateId }));
  } catch (decisionError) {
    ElMessage.error(decisionError instanceof Error ? decisionError.message : t("common.failedToSave", { error: "" }));
  } finally {
    pendingActionKey.value = "";
  }
}

async function applyCandidate(candidate: BuddyImprovementCandidate) {
  if (pendingActionKey.value) {
    return;
  }
  const candidateId = candidate.candidate_id;
  try {
    await ElMessageBox.confirm(
      t("improvements.confirmApply", { candidateId }),
      t("improvements.confirmApplyTitle"),
      {
        confirmButtonText: t("improvements.apply"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      },
    );
  } catch {
    return;
  }
  pendingActionKey.value = `${candidateId}:apply`;
  try {
    const updated = await applyBuddyImprovementCandidate(candidate.candidate_id, t("improvements.applyReason"));
    replaceCandidate(updated);
    ElMessage.success(t("improvements.candidateApplied", { candidateId }));
  } catch (applyError) {
    ElMessage.error(applyError instanceof Error ? applyError.message : t("common.failedToSave", { error: "" }));
  } finally {
    pendingActionKey.value = "";
  }
}

function replaceCandidate(updated: BuddyImprovementCandidate) {
  const index = candidates.value.findIndex((candidate) => candidate.candidate_id === updated.candidate_id);
  if (index === -1) {
    candidates.value = [updated, ...candidates.value];
    selectedCandidateId.value = updated.candidate_id;
    return;
  }
  candidates.value = candidates.value.map((candidate, candidateIndex) => candidateIndex === index ? updated : candidate);
  selectedCandidateId.value = updated.candidate_id;
}

function runHref(runId: string) {
  return `/runs/${encodeURIComponent(runId)}`;
}

function statusClass(status: string) {
  return ["improvements-page__status", `improvements-page__status--${status || "unknown"}`];
}
</script>

<style scoped>
.improvements-page {
  --improvements-panel-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  --improvements-card-shadow: 0 12px 28px rgba(15, 23, 42, 0.07);
  box-sizing: border-box;
  width: min(1360px, 100%);
  min-width: 0;
  margin: 0 auto;
  padding: 32px 28px 48px;
  color: #28140f;
}

.improvements-page__header,
.improvements-page__toolbar,
.improvements-page__overview,
.improvements-page__workspace {
  min-width: 0;
}

.improvements-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.improvements-page__eyebrow {
  margin-bottom: 8px;
  color: #9a3412;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.improvements-page__title {
  margin: 0;
  color: #1f130f;
  font-size: clamp(1.7rem, 2vw, 2.3rem);
  line-height: 1.1;
  letter-spacing: 0;
}

.improvements-page__body {
  max-width: 720px;
  margin: 10px 0 0;
  color: rgba(72, 45, 34, 0.72);
  line-height: 1.6;
}

.improvements-page__refresh {
  flex: 0 0 auto;
}

.improvements-page__overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.improvements-page__metric,
.improvements-page__queue,
.improvements-page__detail,
.improvements-page__toolbar {
  border: 1px solid rgba(120, 53, 15, 0.12);
  border-radius: 8px;
  background: rgba(255, 252, 248, 0.88);
  box-shadow: var(--improvements-card-shadow);
}

.improvements-page__metric {
  padding: 14px 16px;
}

.improvements-page__metric span,
.improvements-page__facts span,
.improvements-page__links span,
.improvements-page__panel-heading span {
  color: rgba(72, 45, 34, 0.64);
  font-size: 0.8rem;
  font-weight: 700;
}

.improvements-page__metric strong {
  display: block;
  margin-top: 4px;
  color: #1f130f;
  font-size: 1.55rem;
}

.improvements-page__notice,
.improvements-page__empty {
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 8px;
  background: rgba(255, 247, 237, 0.9);
  color: #7c2d12;
  padding: 14px;
}

.improvements-page__toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 18px;
  padding: 14px;
  margin-bottom: 16px;
  box-shadow: var(--improvements-panel-shadow);
}

.improvements-page__search-field {
  display: grid;
  gap: 6px;
  flex: 1 1 360px;
  min-width: 220px;
  font-weight: 700;
  color: rgba(72, 45, 34, 0.72);
}

.improvements-page__search {
  max-width: 520px;
}

.improvements-page__status-filter {
  display: grid;
  gap: 6px;
  flex: 1 1 520px;
  min-width: 0;
}

.improvements-page__filter-tabs {
  display: flex;
  flex-wrap: wrap;
  max-width: 100%;
  padding: 4px;
  border-radius: 8px;
  background: rgba(255, 247, 237, 0.72);
}

.improvements-page__filter-tab {
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(72, 45, 34, 0.72);
  cursor: pointer;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  padding: 7px 10px;
  transition: background 0.16s ease, color 0.16s ease;
}

.improvements-page__filter-tab--active {
  background: #9a3412;
  color: #fffaf5;
}

.improvements-page__workspace {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  gap: 16px;
}

.improvements-page__queue,
.improvements-page__detail {
  min-width: 0;
  padding: 16px;
}

.improvements-page__panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.improvements-page__panel-heading h3,
.improvements-page__detail-header h3 {
  margin: 2px 0 0;
  color: #1f130f;
  font-size: 1rem;
  letter-spacing: 0;
}

.improvements-page__candidate-list {
  display: grid;
  gap: 10px;
  max-height: 680px;
  overflow: auto;
}

.improvements-page__candidate {
  display: grid;
  gap: 6px;
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  color: inherit;
  cursor: pointer;
  padding: 12px;
  text-align: left;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.improvements-page__candidate--active {
  border-color: rgba(154, 52, 18, 0.42);
  background: rgba(255, 247, 237, 0.9);
}

.improvements-page__candidate strong,
.improvements-page__candidate small,
.improvements-page__id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.improvements-page__candidate small,
.improvements-page__id {
  color: rgba(72, 45, 34, 0.58);
}

.improvements-page__badges,
.improvements-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.improvements-page__badges span {
  border: 1px solid rgba(120, 53, 15, 0.12);
  border-radius: 999px;
  background: rgba(255, 248, 240, 0.96);
  color: rgba(72, 45, 34, 0.72);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 8px;
}

.improvements-page__detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.improvements-page__detail-header p {
  margin: 8px 0 0;
  color: rgba(72, 45, 34, 0.7);
  line-height: 1.55;
}

.improvements-page__actions {
  margin-bottom: 16px;
}

.improvements-page__facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.improvements-page__facts section,
.improvements-page__links div,
.improvements-page__reason {
  min-width: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.68);
  padding: 10px;
}

.improvements-page__facts strong,
.improvements-page__links a,
.improvements-page__links strong {
  display: block;
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: #1f130f;
  font-size: 0.88rem;
}

.improvements-page__links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.improvements-page__links a {
  color: #9a3412;
  font-weight: 700;
  text-decoration: none;
}

.improvements-page__reason {
  display: grid;
  gap: 4px;
  margin: 0 0 14px;
  color: rgba(72, 45, 34, 0.72);
  line-height: 1.5;
}

.improvements-page__json-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.improvements-page__json-grid section {
  min-width: 0;
}

.improvements-page__json-grid h4 {
  margin: 0 0 6px;
  color: rgba(72, 45, 34, 0.72);
  font-size: 0.85rem;
}

.improvements-page__json-grid pre {
  max-height: 260px;
  overflow: auto;
  margin: 0;
  border: 1px solid rgba(120, 53, 15, 0.1);
  border-radius: 8px;
  background: rgba(43, 25, 18, 0.94);
  color: #fff7ed;
  font-size: 0.78rem;
  line-height: 1.55;
  padding: 12px;
}

.improvements-page__json-wide {
  grid-column: 1 / -1;
}

.improvements-page__status {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  border-radius: 999px;
  background: rgba(120, 113, 108, 0.12);
  color: #57534e;
  font-size: 0.78rem;
  font-weight: 800;
  padding: 4px 8px;
}

.improvements-page__status--approved,
.improvements-page__status--validated {
  background: rgba(22, 163, 74, 0.14);
  color: #166534;
}

.improvements-page__status--applied {
  background: rgba(37, 99, 235, 0.14);
  color: #1d4ed8;
}

.improvements-page__status--waiting_for_approval,
.improvements-page__status--validating {
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
}

.improvements-page__status--failed,
.improvements-page__status--rejected {
  background: rgba(220, 38, 38, 0.12);
  color: #991b1b;
}

@media (max-width: 980px) {
  .improvements-page {
    width: 100%;
    padding-inline: 12px;
    padding-top: 22px;
  }

  .improvements-page__header,
  .improvements-page__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .improvements-page__overview,
  .improvements-page__facts,
  .improvements-page__links,
  .improvements-page__workspace {
    grid-template-columns: 1fr;
  }

  .improvements-page__candidate-list {
    max-height: none;
  }
}
</style>
