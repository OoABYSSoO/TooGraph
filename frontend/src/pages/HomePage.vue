<template>
  <AppShell>
    <section class="home-hero">
      <div class="home-hero__eyebrow">{{ t("home.eyebrow") }}</div>
      <h2 class="home-hero__title">{{ t("home.title") }}</h2>
      <p class="home-hero__body">{{ t("home.body") }}</p>
      <div class="home-hero__actions">
        <RouterLink class="home-hero__action home-hero__action--primary" to="/editor/new">{{ t("home.createGraph") }}</RouterLink>
        <RouterLink class="home-hero__action" to="/editor">{{ t("home.openEditor") }}</RouterLink>
      </div>
    </section>

    <section class="home-dashboard">
      <article class="home-panel">
        <div class="home-panel__header">
          <h3>{{ t("home.recentRuns") }}</h3>
          <RouterLink to="/runs">{{ t("home.viewAll") }}</RouterLink>
        </div>
        <div class="home-panel__body">
          <div v-if="error" class="home-empty">{{ t("common.failedToLoad", { error }) }}</div>
          <div v-else-if="runs.length === 0" class="home-empty">
            <p>{{ t("home.noRuns") }}</p>
            <RouterLink class="home-empty__action" :to="runsEmptyAction.href">{{ runsEmptyAction.label }}</RouterLink>
          </div>
          <RouterLink v-for="run in visibleRunPage.items" :key="run.run_id" class="home-card" :to="`/runs/${run.run_id}`">
            <div class="home-card__header">
              <strong>{{ formatRunDisplayName(run) }}</strong>
              <span class="home-card__detail">{{ runCardDetail }}</span>
            </div>
            <p class="home-card__identifier">{{ run.run_id }}</p>
            <div class="home-badges">
              <span :class="statusBadgeClass(run.status)">{{ run.status }}</span>
              <span>{{ formatRunDisplayTimestamp(run.started_at) }}</span>
              <span v-if="run.revision_round > 0">{{ t("common.revisionsCount", { count: run.revision_round }) }}</span>
            </div>
          </RouterLink>
          <div v-if="visibleRunPage.hasPagination" class="home-panel__pager">
            <button type="button" :disabled="visibleRunPage.page === 0" @click="setRunPage(visibleRunPage.page - 1)">{{ t("common.pagePrevious") }}</button>
            <span>{{ visibleRunPage.page + 1 }} / {{ visibleRunPage.pageCount }}</span>
            <button type="button" :disabled="visibleRunPage.page >= visibleRunPage.pageCount - 1" @click="setRunPage(visibleRunPage.page + 1)">
              {{ t("common.pageNext") }}
            </button>
          </div>
        </div>
      </article>

      <article class="home-panel">
        <div class="home-panel__header">
          <h3>{{ t("home.templates") }}</h3>
          <RouterLink to="/editor">{{ t("home.moreTemplates") }}</RouterLink>
        </div>
        <div class="home-panel__body">
          <div v-if="error" class="home-empty">{{ t("common.failedToLoad", { error }) }}</div>
          <div v-else-if="templates.length === 0" class="home-empty">
            <p>{{ t("home.noTemplates") }}</p>
            <RouterLink class="home-empty__action" :to="templatesEmptyAction.href">{{ templatesEmptyAction.label }}</RouterLink>
          </div>
          <RouterLink
            v-for="template in visibleTemplatePage.items"
            :key="template.template_id"
            class="home-card"
            :to="`/editor/new?template=${template.template_id}`"
          >
            <div class="home-card__eyebrow">{{ template.template_id }}</div>
            <strong>{{ template.label }}</strong>
            <p>{{ template.description }}</p>
          </RouterLink>
          <div v-if="visibleTemplatePage.hasPagination" class="home-panel__pager">
            <button type="button" :disabled="visibleTemplatePage.page === 0" @click="setTemplatePage(visibleTemplatePage.page - 1)">{{ t("common.pagePrevious") }}</button>
            <span>{{ visibleTemplatePage.page + 1 }} / {{ visibleTemplatePage.pageCount }}</span>
            <button
              type="button"
              :disabled="visibleTemplatePage.page >= visibleTemplatePage.pageCount - 1"
              @click="setTemplatePage(visibleTemplatePage.page + 1)"
            >
              {{ t("common.pageNext") }}
            </button>
          </div>
        </div>
      </article>

      <article class="home-panel">
        <div class="home-panel__header">
          <h3>{{ t("home.recentGraphs") }}</h3>
          <RouterLink to="/editor">{{ t("home.openEditor") }}</RouterLink>
        </div>
        <div class="home-panel__body">
          <div v-if="error" class="home-empty">{{ t("common.failedToLoad", { error }) }}</div>
          <div v-else-if="graphs.length === 0" class="home-empty">
            <p>{{ t("home.noGraphs") }}</p>
            <RouterLink class="home-empty__action" :to="graphsEmptyAction.href">{{ graphsEmptyAction.label }}</RouterLink>
          </div>
          <RouterLink v-for="graph in visibleGraphPage.items" :key="graph.graph_id" class="home-card" :to="`/editor/${graph.graph_id}`">
            <div class="home-card__header">
              <strong>{{ graph.name }}</strong>
              <span class="home-card__detail">{{ graphCardDetail }}</span>
            </div>
            <p class="home-card__identifier">{{ graph.graph_id }}</p>
            <div class="home-badges">
              <span>{{ t("common.nodesCount", { count: Object.keys(graph.nodes).length }) }}</span>
              <span>{{ t("common.edgesCount", { count: countGraphEdgeTotal(graph) }) }}</span>
            </div>
          </RouterLink>
          <div v-if="visibleGraphPage.hasPagination" class="home-panel__pager">
            <button type="button" :disabled="visibleGraphPage.page === 0" @click="setGraphPage(visibleGraphPage.page - 1)">{{ t("common.pagePrevious") }}</button>
            <span>{{ visibleGraphPage.page + 1 }} / {{ visibleGraphPage.pageCount }}</span>
            <button
              type="button"
              :disabled="visibleGraphPage.page >= visibleGraphPage.pageCount - 1"
              @click="setGraphPage(visibleGraphPage.page + 1)"
            >
              {{ t("common.pageNext") }}
            </button>
          </div>
        </div>
      </article>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { fetchGraphs, fetchTemplates } from "@/api/graphs";
import { fetchRuns } from "@/api/runs";
import { formatRunDisplayName, formatRunDisplayTimestamp } from "@/lib/run-display-name";
import AppShell from "@/layouts/AppShell.vue";
import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import type { RunSummary } from "@/types/run";

import {
  countGraphEdgeTotal,
  paginateWorkspacePanelItems,
  resolveWorkspaceCardDetail,
  resolveWorkspaceEmptyAction,
} from "./workspaceDashboardModel.ts";

const graphs = ref<GraphDocument[]>([]);
const templates = ref<TemplateRecord[]>([]);
const runs = ref<RunSummary[]>([]);
const error = ref<string | null>(null);
const runPage = ref(0);
const templatePage = ref(0);
const graphPage = ref(0);
const { t, locale } = useI18n();
const runsEmptyAction = computed(() => {
  locale.value;
  return resolveWorkspaceEmptyAction("runs");
});
const templatesEmptyAction = computed(() => {
  locale.value;
  return resolveWorkspaceEmptyAction("templates");
});
const graphsEmptyAction = computed(() => {
  locale.value;
  return resolveWorkspaceEmptyAction("graphs");
});
const runCardDetail = computed(() => {
  locale.value;
  return resolveWorkspaceCardDetail("runs");
});
const graphCardDetail = computed(() => {
  locale.value;
  return resolveWorkspaceCardDetail("graphs");
});
const visibleRunPage = computed(() => paginateWorkspacePanelItems(runs.value, runPage.value));
const visibleTemplatePage = computed(() => paginateWorkspacePanelItems(templates.value, templatePage.value));
const visibleGraphPage = computed(() => paginateWorkspacePanelItems(graphs.value, graphPage.value));

onMounted(async () => {
  try {
    const [graphPayload, runPayload, templatePayload] = await Promise.all([fetchGraphs(), fetchRuns(), fetchTemplates()]);
    graphs.value = graphPayload;
    runs.value = runPayload;
    templates.value = templatePayload;
    error.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loading");
  }
});

function statusBadgeClass(status: string) {
  return `toograph-status-badge toograph-status-badge--${status.replaceAll("_", "-")}`;
}

function setRunPage(nextPage: number) {
  runPage.value = nextPage;
}

function setTemplatePage(nextPage: number) {
  templatePage.value = nextPage;
}

function setGraphPage(nextPage: number) {
  graphPage.value = nextPage;
}
</script>

<style scoped>
.home-hero,
.home-panel {
  border: 1px solid var(--toograph-border);
  border-radius: 28px;
  background: var(--toograph-surface-panel);
  box-shadow: var(--toograph-shadow-panel);
}

.home-hero {
  background: var(--toograph-surface-hero);
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
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
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

.home-panel__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: rgba(60, 41, 20, 0.58);
  font-size: 0.78rem;
}

.home-panel__pager button {
  min-height: 30px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 248, 240, 0.82);
  color: rgb(154, 52, 18);
  cursor: pointer;
  transition: border-color 150ms ease, background-color 150ms ease, transform 150ms ease;
}

.home-panel__pager button:not(:disabled):hover {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 244, 232, 0.98);
}

.home-panel__pager button:not(:disabled):active {
  transform: scale(0.98);
}

.home-panel__pager button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.home-card,
.home-empty {
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  padding: 16px;
  background: var(--toograph-surface-card);
}

.home-card {
  color: inherit;
  text-decoration: none;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.home-card:hover,
.home-card:focus-visible {
  border-color: rgba(154, 52, 18, 0.2);
  background: rgba(255, 253, 249, 0.96);
  box-shadow: var(--toograph-shadow-hover);
  outline: none;
  transform: translateY(-1px);
}

.home-card:active {
  transform: translateY(0) scale(0.995);
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
  font-family: var(--toograph-font-mono);
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
  border: 1px solid var(--toograph-status-border, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--toograph-status-bg, rgba(255, 248, 240, 0.92));
  color: var(--toograph-status-fg, rgb(154, 52, 18));
  font-family: var(--toograph-font-mono);
  font-size: 0.84rem;
}

@media (max-width: 1100px) {
  .home-dashboard {
    grid-template-columns: 1fr;
  }
}
</style>
