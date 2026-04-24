<template>
  <AppShell>
    <section class="runs-page">
      <header class="runs-page__hero">
        <div class="runs-page__eyebrow">Runs</div>
        <h2 class="runs-page__title">运行记录</h2>
        <p class="runs-page__body">这里恢复旧前端的运行记录列表心智：搜索、筛选、列表，再进入详情。</p>
      </header>

      <section class="runs-page__filters">
        <label>
          <span>搜索图名</span>
          <input v-model="graphNameQuery" placeholder="输入图名" />
        </label>
        <label>
          <span>状态筛选</span>
          <ElSelect
            v-model="statusFilter"
            class="runs-page__select graphite-select"
            :teleported="false"
            popper-class="graphite-select-popper"
          >
            <ElOption label="all" value="" />
            <ElOption label="pending" value="pending" />
            <ElOption label="queued" value="queued" />
            <ElOption label="running" value="running" />
            <ElOption label="completed" value="completed" />
            <ElOption label="failed" value="failed" />
            <ElOption label="paused" value="paused" />
          </ElSelect>
        </label>
      </section>

      <section class="runs-page__list">
        <article v-if="loading" class="runs-page__empty">Loading runs…</article>
        <article v-else-if="error" class="runs-page__empty">加载失败：{{ error }}</article>
        <article v-else-if="runs.length === 0" class="runs-page__empty">
          <p>当前没有运行记录。</p>
          <RouterLink class="runs-page__empty-action" :to="runsEmptyAction.href">{{ runsEmptyAction.label }}</RouterLink>
        </article>
        <article v-for="run in runs" :key="run.run_id" class="runs-page__card">
          <div class="runs-page__card-header">
            <strong>{{ formatRunDisplayName(run) }}</strong>
            <div class="runs-page__card-actions">
              <RouterLink class="runs-page__detail-link" :to="`/runs/${run.run_id}`">{{ runCardDetail }}</RouterLink>
              <RouterLink v-if="canRestoreRunSummary(run)" class="runs-page__restore-link" :to="resolveRunRestoreUrl(run.run_id)">
                恢复编辑
              </RouterLink>
            </div>
          </div>
          <p>{{ run.run_id }}</p>
          <div class="runs-page__badges">
            <span>{{ run.status }}</span>
            <span>revisions {{ run.revision_round }}</span>
            <span v-if="run.duration_ms">duration {{ run.duration_ms }}ms</span>
            <span v-if="run.final_score">score {{ run.final_score }}</span>
          </div>
        </article>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { ElOption, ElSelect } from "element-plus";

import { fetchRuns } from "@/api/runs";
import { formatRunDisplayName } from "@/lib/run-display-name";
import { canRestoreRunSummary, resolveRunRestoreUrl } from "@/lib/run-restore";
import AppShell from "@/layouts/AppShell.vue";
import type { RunSummary } from "@/types/run";

import { resolveRunsCardDetail, resolveRunsEmptyAction } from "./runsPageModel.ts";

const runs = ref<RunSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const graphNameQuery = ref("");
const statusFilter = ref("");
const runsEmptyAction = resolveRunsEmptyAction();
const runCardDetail = resolveRunsCardDetail();

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

onMounted(loadRuns);
watch([graphNameQuery, statusFilter], loadRuns);
</script>

<style scoped>
.runs-page {
  display: grid;
  gap: 18px;
}

.runs-page__hero,
.runs-page__filters,
.runs-page__card,
.runs-page__empty {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.08);
}

.runs-page__hero,
.runs-page__filters,
.runs-page__empty {
  padding: 24px;
}

.runs-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.runs-page__title {
  margin: 8px 0 10px;
  font-size: 2rem;
}

.runs-page__body {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.76);
}

.runs-page__filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.runs-page__filters label {
  display: grid;
  gap: 8px;
  color: rgba(60, 41, 20, 0.72);
}

.runs-page__filters input {
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.82);
}

.runs-page__select {
  width: 100%;
}

.runs-page__list {
  display: grid;
  gap: 12px;
}

.runs-page__card {
  display: grid;
  gap: 8px;
  padding: 18px;
}

.runs-page__card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.runs-page__card-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.runs-page__detail-link,
.runs-page__restore-link {
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(154, 52, 18);
  text-decoration: none;
}

.runs-page__restore-link {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(255, 248, 240, 0.9);
}

.runs-page__card p,
.runs-page__empty p {
  margin: 6px 0 0;
  color: rgba(60, 41, 20, 0.72);
}

.runs-page__empty {
  display: grid;
  gap: 14px;
}

.runs-page__empty-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 10px 14px;
  color: rgb(154, 52, 18);
  text-decoration: none;
}

.runs-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.runs-page__badges span {
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-size: 0.84rem;
}

@media (max-width: 720px) {
  .runs-page__filters {
    grid-template-columns: 1fr;
  }
}
</style>
