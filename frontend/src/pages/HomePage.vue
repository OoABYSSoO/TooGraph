<template>
  <AppShell>
    <section class="home-hero">
      <div class="home-hero__eyebrow">Workspace</div>
      <h2 class="home-hero__title">GraphiteUI 工作台</h2>
      <p class="home-hero__body">这里保留原来首页的工作台心智：最近运行、模板入口和最近的图都应该在这里汇合。</p>
      <div class="home-hero__actions">
        <RouterLink class="home-hero__action home-hero__action--primary" to="/editor/new">新建图</RouterLink>
        <RouterLink class="home-hero__action" to="/editor">打开编排器</RouterLink>
      </div>
    </section>

    <section class="home-dashboard">
      <article class="home-panel">
        <div class="home-panel__header">
          <h3>最近运行记录</h3>
          <RouterLink to="/runs">查看全部</RouterLink>
        </div>
        <div class="home-panel__body">
          <div v-if="error" class="home-empty">加载失败：{{ error }}</div>
          <div v-else-if="runs.length === 0" class="home-empty">
            <p>还没有运行记录。</p>
            <RouterLink class="home-empty__action" :to="runsEmptyAction.href">{{ runsEmptyAction.label }}</RouterLink>
          </div>
          <RouterLink v-for="run in runs.slice(0, 5)" :key="run.run_id" class="home-card" :to="`/runs/${run.run_id}`">
            <div class="home-card__header">
              <strong>{{ formatRunDisplayName(run) }}</strong>
              <span class="home-card__detail">{{ runCardDetail }}</span>
            </div>
            <p class="home-card__identifier">{{ run.run_id }}</p>
            <div class="home-badges">
              <span :class="statusBadgeClass(run.status)">{{ run.status }}</span>
              <span>revisions {{ run.revision_round }}</span>
            </div>
          </RouterLink>
        </div>
      </article>

      <article class="home-panel">
        <div class="home-panel__header">
          <h3>模板选择</h3>
          <RouterLink to="/editor">更多模板</RouterLink>
        </div>
        <div class="home-panel__body">
          <div v-if="error" class="home-empty">加载失败：{{ error }}</div>
          <div v-else-if="templates.length === 0" class="home-empty">
            <p>当前没有模板。</p>
            <RouterLink class="home-empty__action" :to="templatesEmptyAction.href">{{ templatesEmptyAction.label }}</RouterLink>
          </div>
          <RouterLink
            v-for="template in templates"
            :key="template.template_id"
            class="home-card"
            :to="`/editor/new?template=${template.template_id}`"
          >
            <div class="home-card__eyebrow">{{ template.template_id }}</div>
            <strong>{{ template.label }}</strong>
            <p>{{ template.description }}</p>
          </RouterLink>
        </div>
      </article>

      <article class="home-panel">
        <div class="home-panel__header">
          <h3>最近的图</h3>
          <RouterLink to="/editor">打开编排器</RouterLink>
        </div>
        <div class="home-panel__body">
          <div v-if="error" class="home-empty">加载失败：{{ error }}</div>
          <div v-else-if="graphs.length === 0" class="home-empty">
            <p>当前还没有已保存图。</p>
            <RouterLink class="home-empty__action" :to="graphsEmptyAction.href">{{ graphsEmptyAction.label }}</RouterLink>
          </div>
          <RouterLink v-for="graph in graphs.slice(0, 5)" :key="graph.graph_id" class="home-card" :to="`/editor/${graph.graph_id}`">
            <div class="home-card__header">
              <strong>{{ graph.name }}</strong>
              <span class="home-card__detail">{{ graphCardDetail }}</span>
            </div>
            <p class="home-card__identifier">{{ graph.graph_id }}</p>
            <div class="home-badges">
              <span>{{ Object.keys(graph.nodes).length }} nodes</span>
              <span>{{ countGraphEdgeTotal(graph) }} edges</span>
            </div>
          </RouterLink>
        </div>
      </article>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

import { fetchGraphs, fetchTemplates } from "@/api/graphs";
import { fetchRuns } from "@/api/runs";
import { formatRunDisplayName } from "@/lib/run-display-name";
import AppShell from "@/layouts/AppShell.vue";
import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import type { RunSummary } from "@/types/run";

import { countGraphEdgeTotal, resolveWorkspaceCardDetail, resolveWorkspaceEmptyAction } from "./workspaceDashboardModel.ts";

const graphs = ref<GraphDocument[]>([]);
const templates = ref<TemplateRecord[]>([]);
const runs = ref<RunSummary[]>([]);
const error = ref<string | null>(null);
const runsEmptyAction = resolveWorkspaceEmptyAction("runs");
const templatesEmptyAction = resolveWorkspaceEmptyAction("templates");
const graphsEmptyAction = resolveWorkspaceEmptyAction("graphs");
const runCardDetail = resolveWorkspaceCardDetail("runs");
const graphCardDetail = resolveWorkspaceCardDetail("graphs");

onMounted(async () => {
  try {
    const [graphPayload, runPayload, templatePayload] = await Promise.all([fetchGraphs(), fetchRuns(), fetchTemplates()]);
    graphs.value = graphPayload;
    runs.value = runPayload;
    templates.value = templatePayload;
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : "Failed to load workspace data.";
  }
});

function statusBadgeClass(status: string) {
  return `graphite-status-badge graphite-status-badge--${status.replaceAll("_", "-")}`;
}
</script>

<style scoped>
.home-hero,
.home-panel {
  border: 1px solid var(--graphite-border);
  border-radius: 28px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.home-hero {
  background: var(--graphite-surface-hero);
  padding: 24px;
}

.home-hero__eyebrow,
.home-card__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.home-hero__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.home-hero__body {
  margin: 0;
  max-width: 65ch;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.76);
}

.home-hero__actions {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.home-hero__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 12px 18px;
  color: rgb(154, 52, 18);
  text-decoration: none;
}

.home-hero__action--primary {
  background: rgb(154, 52, 18);
  color: rgba(255, 250, 241, 0.96);
}

.home-dashboard {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 18px;
}

.home-panel {
  padding: 20px;
}

.home-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.home-panel__header h3 {
  margin: 0 0 12px;
}

.home-panel__header a {
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(154, 52, 18);
  text-decoration: none;
}

.home-panel__body {
  display: grid;
  gap: 12px;
}

.home-card,
.home-empty {
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 16px;
  background: var(--graphite-surface-card);
}

.home-card {
  color: inherit;
  text-decoration: none;
}

.home-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.home-card__detail {
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(154, 52, 18);
}

.home-card p,
.home-empty p {
  margin: 6px 0 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.5;
}

.home-card__identifier {
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

.home-empty {
  display: grid;
  gap: 14px;
}

.home-empty__action {
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

.home-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.home-badges span {
  border: 1px solid var(--graphite-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--graphite-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--graphite-status-fg, rgb(154, 52, 18));
  font-family: var(--graphite-font-mono);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .home-dashboard {
    grid-template-columns: 1fr;
  }
}
</style>
