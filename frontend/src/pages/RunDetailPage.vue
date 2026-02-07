<template>
  <AppShell>
    <section class="run-detail">
      <header class="run-detail__hero">
        <div class="run-detail__eyebrow">Run Detail</div>
        <h2 class="run-detail__title">运行详情 {{ runId }}</h2>
        <p class="run-detail__body">这里保留旧前端的运行详情结构：状态、循环摘要、节点时间线和最终产出。</p>
      </header>

      <article v-if="error" class="run-detail__empty">加载失败：{{ error }}</article>
      <article v-else-if="!run" class="run-detail__empty">Loading run…</article>
      <template v-else>
        <section class="run-detail__grid">
          <article class="run-detail__panel">
            <h3>Status</h3>
            <div class="run-detail__badges">
              <span>{{ run.status }}</span>
              <span>{{ run.current_node_id ?? "completed" }}</span>
              <span>revisions {{ run.revision_round }}</span>
              <span v-if="run.final_score">score {{ run.final_score }}</span>
            </div>
          </article>

          <article v-if="cycleVisualization.hasCycle" class="run-detail__panel">
            <h3>Cycle Summary</h3>
            <div class="run-detail__badges">
              <span>{{ cycleVisualization.summary?.iteration_count ?? cycleVisualization.iterations.length }} iterations</span>
              <span>max {{ cycleVisualization.summary?.max_iterations === -1 ? "unlimited" : cycleVisualization.summary?.max_iterations }}</span>
              <span v-if="cycleVisualization.summary?.stop_reason">{{ formatCycleStopReason(cycleVisualization.summary.stop_reason) }}</span>
              <span v-for="edge in cycleVisualization.backEdges" :key="edge">{{ edge }}</span>
            </div>
            <p v-if="describeCycleStopReason(cycleVisualization.summary?.stop_reason)" class="run-detail__muted">
              {{ describeCycleStopReason(cycleVisualization.summary?.stop_reason) }}
            </p>
          </article>
        </section>

        <article v-if="cycleVisualization.hasCycle && cycleVisualization.iterations.length > 0" class="run-detail__panel">
          <h3>Cycle Iterations</h3>
          <div class="run-detail__list">
            <div v-for="iteration in cycleVisualization.iterations" :key="iteration.iteration" class="run-detail__subcard">
              <strong>Iteration {{ iteration.iteration }}</strong>
              <div class="run-detail__badges">
                <span>{{ iteration.executedNodeIds.length }} nodes</span>
                <span>{{ iteration.activatedEdgeIds.length }} edges</span>
                <span v-if="iteration.stopReason">{{ formatCycleStopReason(iteration.stopReason) }}</span>
              </div>
            </div>
          </div>
        </article>

        <article class="run-detail__panel">
          <h3>Artifacts</h3>
          <div class="run-detail__info"><span>Knowledge</span><strong>{{ run.knowledge_summary || "None" }}</strong></div>
          <div class="run-detail__info"><span>Memory</span><strong>{{ run.memory_summary || "None" }}</strong></div>
          <div class="run-detail__info"><span>Final Result</span><strong>{{ run.final_result || "None" }}</strong></div>
        </article>

        <article class="run-detail__panel">
          <h3>Timeline</h3>
          <div class="run-detail__list">
            <div v-for="execution in run.node_executions" :key="`${execution.node_id}-${execution.artifacts.iteration ?? 1}-${execution.status}`" class="run-detail__subcard">
              <strong>{{ execution.node_id }} → {{ execution.status }}</strong>
              <p>{{ execution.output_summary }}</p>
              <div class="run-detail__badges">
                <span>{{ execution.duration_ms }}ms</span>
                <span v-if="execution.artifacts.iteration">iteration {{ execution.artifacts.iteration }}</span>
                <span v-if="execution.artifacts.selected_branch">{{ execution.artifacts.selected_branch }}</span>
              </div>
            </div>
          </div>
        </article>
      </template>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { fetchRun } from "@/api/runs";
import AppShell from "@/layouts/AppShell.vue";
import { buildCycleVisualization, describeCycleStopReason, formatCycleStopReason } from "@/lib/run-cycle-visualization";
import type { RunDetail } from "@/types/run";

const route = useRoute();
const run = ref<RunDetail | null>(null);
const error = ref<string | null>(null);
const runId = computed(() => String(route.params.runId ?? ""));
const cycleVisualization = computed(() => (run.value ? buildCycleVisualization(run.value) : { hasCycle: false, summary: null, backEdges: [], iterations: [] }));

onMounted(async () => {
  try {
    run.value = await fetchRun(runId.value);
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : "Failed to load run detail.";
  }
});
</script>

<style scoped>
.run-detail {
  display: grid;
  gap: 18px;
}

.run-detail__hero,
.run-detail__panel,
.run-detail__empty {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.08);
}

.run-detail__hero,
.run-detail__empty {
  padding: 24px;
}

.run-detail__panel {
  padding: 20px;
}

.run-detail__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.run-detail__title {
  margin: 8px 0 10px;
  font-size: 2rem;
}

.run-detail__body,
.run-detail__muted,
.run-detail__subcard p,
.run-detail__empty {
  margin: 0;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.76);
}

.run-detail__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.run-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.run-detail__badges span {
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-size: 0.84rem;
}

.run-detail__list {
  display: grid;
  gap: 12px;
}

.run-detail__subcard,
.run-detail__info {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.8);
}

.run-detail__info {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

@media (max-width: 960px) {
  .run-detail__grid {
    grid-template-columns: 1fr;
  }
}
</style>
