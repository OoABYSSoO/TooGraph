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
          <select v-model="statusFilter">
            <option value="">all</option>
            <option value="pending">pending</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="paused">paused</option>
          </select>
        </label>
      </section>

      <section class="runs-page__list">
        <article v-if="loading" class="runs-page__empty">Loading runs…</article>
        <article v-else-if="error" class="runs-page__empty">加载失败：{{ error }}</article>
        <article v-else-if="runs.length === 0" class="runs-page__empty">当前没有运行记录。</article>
        <RouterLink v-for="run in runs" :key="run.run_id" class="runs-page__card" :to="`/runs/${run.run_id}`">
          <strong>{{ run.run_id }}</strong>
          <p>{{ run.graph_name }}</p>
          <div class="runs-page__badges">
            <span>{{ run.status }}</span>
            <span>revisions {{ run.revision_round }}</span>
            <span v-if="run.duration_ms">duration {{ run.duration_ms }}ms</span>
            <span v-if="run.final_score">score {{ run.final_score }}</span>
          </div>
        </RouterLink>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

import { fetchRuns } from "@/api/runs";
import AppShell from "@/layouts/AppShell.vue";
import type { RunSummary } from "@/types/run";

const runs = ref<RunSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const graphNameQuery = ref("");
const statusFilter = ref("");

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

.runs-page__filters input,
.runs-page__filters select {
  min-height: 42px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 16px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.82);
}

.runs-page__list {
  display: grid;
  gap: 12px;
}

.runs-page__card {
  display: block;
  padding: 18px;
  color: inherit;
  text-decoration: none;
}

.runs-page__card p,
.runs-page__empty {
  margin: 6px 0 0;
  color: rgba(60, 41, 20, 0.72);
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
