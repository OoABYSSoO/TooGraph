<template>
  <section class="editor-welcome">
    <header class="editor-welcome__hero">
      <div class="editor-welcome__eyebrow">Workspace</div>
      <h2 class="editor-welcome__title">从空白图、模板或已有图开始。</h2>
      <p class="editor-welcome__body">
        这里不是目录页，而是编排器真正的工作台。选择模板或已有图后，我们会直接进入新的 Vue 编辑器画布。
      </p>
      <div class="editor-welcome__actions">
        <button type="button" class="editor-welcome__primary" @click="$emit('create-new')">新建图</button>
        <button type="button" class="editor-welcome__secondary" @click="$emit('import-python-graph')">导入 Py 图</button>
      </div>
    </header>

    <section class="editor-welcome__grid">
      <article class="editor-welcome__panel">
        <div class="editor-welcome__panel-header">
          <h3>从模板创建</h3>
          <span>{{ filteredTemplates.length }} / {{ templates.length }}</span>
        </div>
        <WorkspaceSearchField v-model="templateQuery" placeholder="搜索模板名、描述或 template_id" />
        <div class="editor-welcome__panel-body">
          <button
            v-for="template in filteredTemplates"
            :key="template.template_id"
            type="button"
            class="editor-welcome__card"
            @click="$emit('open-template', template.template_id)"
          >
            <div class="editor-welcome__card-copy">
              <span class="editor-welcome__card-id">{{ template.template_id }}</span>
              <strong>{{ template.label }}</strong>
              <p>{{ template.description }}</p>
            </div>
            <span class="editor-welcome__card-action">打开模板</span>
          </button>
          <div v-if="templates.length === 0" class="editor-welcome__empty">当前没有可用模板。</div>
          <div v-else-if="filteredTemplates.length === 0" class="editor-welcome__empty">没有匹配的模板结果。</div>
        </div>
      </article>

      <article class="editor-welcome__panel">
        <div class="editor-welcome__panel-header">
          <h3>打开已有图</h3>
          <span>{{ filteredGraphs.length }} / {{ graphs.length }}</span>
        </div>
        <WorkspaceSearchField v-model="graphQuery" placeholder="搜索图名或 graph_id" />
        <div class="editor-welcome__panel-body">
          <button
            v-for="graph in filteredGraphs"
            :key="graph.graph_id"
            type="button"
            class="editor-welcome__card"
            @click="$emit('open-graph', graph.graph_id)"
          >
            <div class="editor-welcome__graph-head">
              <div>
                <strong>{{ graph.name }}</strong>
                <p class="editor-welcome__graph-id">{{ graph.graph_id }}</p>
              </div>
              <span>{{ graphNodeCount(graph) }} nodes / {{ graphEdgeCount(graph) }} edges</span>
            </div>
            <span class="editor-welcome__card-action">打开图</span>
          </button>
          <div v-if="graphs.length === 0" class="editor-welcome__empty">当前没有已保存图。</div>
          <div v-else-if="filteredGraphs.length === 0" class="editor-welcome__empty">没有匹配的图结果。</div>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import type { GraphDocument, TemplateRecord } from "@/types/node-system";
import {
  EDITOR_WELCOME_SEARCH_DEBOUNCE_MS,
  filterWelcomeGraphs,
  filterWelcomeTemplates,
} from "./editorWelcomeSearch";
import WorkspaceSearchField from "./WorkspaceSearchField.vue";

const props = defineProps<{
  templates: TemplateRecord[];
  graphs: GraphDocument[];
}>();

defineEmits<{
  (event: "create-new"): void;
  (event: "import-python-graph"): void;
  (event: "open-template", templateId: string): void;
  (event: "open-graph", graphId: string): void;
}>();

const templateQuery = ref("");
const graphQuery = ref("");
const debouncedTemplateQuery = ref("");
const debouncedGraphQuery = ref("");

watch(templateQuery, (nextValue, _previousValue, onCleanup) => {
  const timeoutId = window.setTimeout(() => {
    debouncedTemplateQuery.value = nextValue;
  }, EDITOR_WELCOME_SEARCH_DEBOUNCE_MS);

  onCleanup(() => window.clearTimeout(timeoutId));
});

watch(graphQuery, (nextValue, _previousValue, onCleanup) => {
  const timeoutId = window.setTimeout(() => {
    debouncedGraphQuery.value = nextValue;
  }, EDITOR_WELCOME_SEARCH_DEBOUNCE_MS);

  onCleanup(() => window.clearTimeout(timeoutId));
});

const filteredTemplates = computed(() => filterWelcomeTemplates(props.templates, debouncedTemplateQuery.value));
const filteredGraphs = computed(() => filterWelcomeGraphs(props.graphs, debouncedGraphQuery.value));

function graphNodeCount(graph: GraphDocument) {
  return Object.keys(graph.nodes).length;
}

function graphEdgeCount(graph: GraphDocument) {
  return graph.edges.length + graph.conditional_edges.reduce((count, edge) => count + Object.keys(edge.branches).length, 0);
}
</script>

<style scoped>
.editor-welcome {
  display: grid;
  gap: 24px;
}

.editor-welcome__hero,
.editor-welcome__panel {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.editor-welcome__hero {
  background: var(--graphite-surface-hero);
  padding: 24px;
}

.editor-welcome__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.editor-welcome__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.editor-welcome__body {
  margin: 0;
  max-width: 65ch;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.76);
}

.editor-welcome__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.editor-welcome__primary,
.editor-welcome__secondary {
  border: 1px solid rgba(154, 52, 18, 0.22);
  border-radius: 999px;
  padding: 10px 18px;
  cursor: pointer;
}

.editor-welcome__primary {
  background: rgba(255, 248, 240, 0.95);
  color: rgb(154, 52, 18);
}

.editor-welcome__secondary {
  background: rgba(255, 252, 247, 0.86);
  color: rgba(90, 58, 34, 0.92);
}

.editor-welcome__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}

.editor-welcome__panel {
  padding: 24px;
  display: grid;
  min-height: 520px;
}

.editor-welcome__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-welcome__panel-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.editor-welcome__panel-header span {
  color: rgba(60, 41, 20, 0.62);
}

.editor-welcome__panel-body {
  margin-top: 16px;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-content: start;
}

.editor-welcome__card,
.editor-welcome__empty {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: var(--graphite-surface-card);
}

.editor-welcome__card {
  display: grid;
  align-content: space-between;
  gap: 16px;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
}

.editor-welcome__card:hover {
  transform: translateY(-1px);
  border-color: rgba(154, 52, 18, 0.2);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 24px rgba(154, 52, 18, 0.08);
}

.editor-welcome__card-id {
  display: block;
  margin-bottom: 6px;
  font-family: var(--graphite-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.editor-welcome__card strong {
  display: block;
  margin-bottom: 4px;
}

.editor-welcome__card p,
.editor-welcome__empty {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.5;
}

.editor-welcome__graph-id {
  margin-top: 4px;
}

.editor-welcome__graph-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.editor-welcome__graph-head span {
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.88rem;
}

.editor-welcome__card-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(154, 52, 18, 0.88);
  font-size: 0.9rem;
}

.editor-welcome__card-action::after {
  content: "→";
}

.editor-welcome__graph-id {
  margin-top: 6px;
  font-size: 0.88rem;
}

@media (max-width: 1100px) {
  .editor-welcome__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .editor-welcome__panel-body {
    grid-template-columns: 1fr;
  }
}
</style>
