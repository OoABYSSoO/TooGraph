<template>
  <AppShell>
    <section class="editor-page">
      <header class="editor-page__hero">
        <div class="editor-page__eyebrow">Editor</div>
        <h2 class="editor-page__title">{{ heading }}</h2>
        <p class="editor-page__body">{{ description }}</p>
      </header>

      <section class="editor-page__workspace">
        <aside class="editor-page__sidebar">
          <div class="editor-page__sidebar-header">
            <h3>{{ listTitle }}</h3>
            <span>{{ listCount }}</span>
          </div>

          <p v-if="graphStore.isLoading" class="editor-page__meta">Loading…</p>
          <p v-else-if="graphStore.error" class="editor-page__meta editor-page__meta--error">
            {{ graphStore.error }}
          </p>

          <div v-else-if="isTemplateRoute" class="editor-page__list">
            <button
              v-for="template in graphStore.templates"
              :key="template.template_id"
              type="button"
              class="editor-page__list-item"
              :class="{ 'editor-page__list-item--active': workspaceStore.activeTemplateId === template.template_id }"
              @click="openTemplate(template.template_id)"
            >
              <span class="editor-page__list-item-id">{{ template.template_id }}</span>
              <strong>{{ template.label }}</strong>
              <p>{{ template.description }}</p>
            </button>
          </div>

          <div v-else class="editor-page__list">
            <button
              v-for="graph in graphStore.graphs"
              :key="graph.graph_id"
              type="button"
              class="editor-page__list-item"
              :class="{ 'editor-page__list-item--active': workspaceStore.activeGraphId === graph.graph_id }"
              @click="openGraph(graph.graph_id)"
            >
              <span class="editor-page__list-item-id">{{ graph.graph_id }}</span>
              <strong>{{ graph.name }}</strong>
              <p>{{ graphSummary(graph) }}</p>
            </button>
          </div>
        </aside>

        <article class="editor-page__preview">
          <template v-if="graphStore.activeDocument">
            <div class="editor-page__preview-eyebrow">
              {{ graphStore.activeDocument.source === "template" ? "Template Draft" : "Saved Graph" }}
            </div>
            <h3 class="editor-page__preview-title">
              {{ graphStore.activeDocument.source === "template" ? graphStore.activeDocument.draft.name : graphStore.activeDocument.graph.name }}
            </h3>
            <p class="editor-page__preview-body">
              {{ activeDescription }}
            </p>

            <dl class="editor-page__stats">
              <div>
                <dt>States</dt>
                <dd>{{ activeStateCount }}</dd>
              </div>
              <div>
                <dt>Nodes</dt>
                <dd>{{ activeNodeCount }}</dd>
              </div>
              <div>
                <dt>Edges</dt>
                <dd>{{ activeEdgeCount }}</dd>
              </div>
              <div>
                <dt>Conditional</dt>
                <dd>{{ activeConditionalEdgeCount }}</dd>
              </div>
            </dl>

            <div class="editor-page__document">
              <section class="editor-page__document-section">
                <h4>States</h4>
                <ul>
                  <li v-for="[stateKey, definition] in activeStateEntries" :key="stateKey">
                    <strong>{{ stateKey }}</strong>
                    <span>{{ definition.type }}</span>
                  </li>
                </ul>
              </section>

              <section class="editor-page__document-section">
                <h4>Nodes</h4>
                <ul>
                  <li v-for="[nodeKey, node] in activeNodeEntries" :key="nodeKey">
                    <strong>{{ nodeKey }}</strong>
                    <span>{{ node.kind }}</span>
                  </li>
                </ul>
              </section>
            </div>

            <div class="editor-page__canvas-shell">
              <EditorCanvas :document="canvasDocument" @update:node-position="handleNodePositionUpdate" />
            </div>
          </template>

          <template v-else>
            <div class="editor-page__preview-eyebrow">Workspace</div>
            <h3 class="editor-page__preview-title">{{ emptyTitle }}</h3>
            <p class="editor-page__preview-body">{{ emptyDescription }}</p>
          </template>
        </article>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import EditorCanvas from "@/editor/canvas/EditorCanvas.vue";
import AppShell from "@/layouts/AppShell.vue";
import { useEditorWorkspaceStore } from "@/stores/editorWorkspace";
import { useGraphDocumentStore } from "@/stores/graphDocument";
import type { GraphDocument } from "@/types/node-system";

const route = useRoute();
const router = useRouter();
const workspaceStore = useEditorWorkspaceStore();
const graphStore = useGraphDocumentStore();

const isTemplateRoute = computed(() => route.path === "/editor/new");
const requestedTemplateId = computed(() => asString(route.query.template));
const requestedGraphId = computed(() => asString(route.query.graph));

const heading = computed(() => (isTemplateRoute.value ? "Create from template" : "Open existing graph"));
const description = computed(() =>
  isTemplateRoute.value
    ? "Templates now come straight from the current backend. Selecting one creates an active draft in Pinia that the custom Vue canvas will attach to next."
    : "Saved graphs now come straight from the current backend. Opening one promotes it to the active graph document for the Vue editor workspace.",
);
const listTitle = computed(() => (isTemplateRoute.value ? "Templates" : "Graphs"));
const listCount = computed(() =>
  String(isTemplateRoute.value ? graphStore.templates.length : graphStore.graphs.length),
);
const emptyTitle = computed(() =>
  isTemplateRoute.value ? "Choose a template to start a new graph." : "Choose an existing graph to continue editing.",
);
const emptyDescription = computed(() =>
  isTemplateRoute.value
    ? "The next phase will replace this preview card with the custom canvas, but the draft document is already being built from the backend template payload."
    : "The next phase will replace this preview card with the custom canvas, but the graph document is already loading from the current backend contract.",
);
const activeStateEntries = computed(() => {
  if (!graphStore.activeDocument) {
    return [];
  }
  const stateSchema =
    graphStore.activeDocument.source === "template"
      ? graphStore.activeDocument.draft.state_schema
      : graphStore.activeDocument.graph.state_schema;
  return Object.entries(stateSchema);
});
const activeNodeEntries = computed(() => {
  if (!graphStore.activeDocument) {
    return [];
  }
  const nodes =
    graphStore.activeDocument.source === "template"
      ? graphStore.activeDocument.draft.nodes
      : graphStore.activeDocument.graph.nodes;
  return Object.entries(nodes);
});
const activeStateCount = computed(() => activeStateEntries.value.length);
const activeNodeCount = computed(() => activeNodeEntries.value.length);
const activeEdgeCount = computed(() => {
  if (!graphStore.activeDocument) {
    return 0;
  }
  return graphStore.activeDocument.source === "template"
    ? graphStore.activeDocument.draft.edges.length
    : graphStore.activeDocument.graph.edges.length;
});
const activeConditionalEdgeCount = computed(() => {
  if (!graphStore.activeDocument) {
    return 0;
  }
  return graphStore.activeDocument.source === "template"
    ? graphStore.activeDocument.draft.conditional_edges.length
    : graphStore.activeDocument.graph.conditional_edges.length;
});
const activeDescription = computed(() => {
  if (!graphStore.activeDocument) {
    return "";
  }
  return graphStore.activeDocument.source === "template"
    ? graphStore.activeDocument.template.description
    : `Graph ${graphStore.activeDocument.graph.graph_id}`;
});
const canvasDocument = computed(() => {
  const document = graphStore.currentDocument;
  if (!document) {
    throw new Error("Canvas document requested before an active document exists.");
  }
  return document;
});

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function graphSummary(graph: GraphDocument): string {
  return `${Object.keys(graph.nodes).length} nodes / ${graph.edges.length} edges`;
}

async function syncRouteState() {
  if (isTemplateRoute.value) {
    workspaceStore.showTemplates(requestedTemplateId.value);
    await graphStore.ensureTemplatesLoaded();
    if (requestedTemplateId.value) {
      await graphStore.selectTemplate(requestedTemplateId.value);
      return;
    }
    graphStore.clearActiveDocument();
    return;
  }

  workspaceStore.showGraphs(requestedGraphId.value);
  await graphStore.ensureGraphsLoaded();
  if (requestedGraphId.value) {
    await graphStore.loadGraph(requestedGraphId.value);
    return;
  }
  graphStore.clearActiveDocument();
}

async function openTemplate(templateId: string) {
  workspaceStore.openTemplate(templateId);
  await router.replace({
    path: "/editor/new",
    query: {
      template: templateId,
    },
  });
}

async function openGraph(graphId: string) {
  workspaceStore.openGraph(graphId);
  await router.replace({
    path: "/editor",
    query: {
      graph: graphId,
    },
  });
}

function handleNodePositionUpdate(payload: { nodeId: string; position: { x: number; y: number } }) {
  graphStore.updateNodePosition(payload.nodeId, payload.position);
}

onMounted(async () => {
  await syncRouteState();
});

watch(
  () => route.fullPath,
  async () => {
    await syncRouteState();
  },
);
</script>

<style scoped>
.editor-page {
  display: grid;
  gap: 24px;
}

.editor-page__hero,
.editor-page__sidebar,
.editor-page__preview {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 24px;
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.08);
}

.editor-page__hero {
  padding: 24px;
}

.editor-page__workspace {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 24px;
}

.editor-page__sidebar,
.editor-page__preview {
  padding: 24px;
}

.editor-page__eyebrow,
.editor-page__preview-eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.editor-page__title,
.editor-page__preview-title {
  margin: 8px 0 10px;
  font-size: 2rem;
}

.editor-page__preview-title {
  font-size: 1.6rem;
}

.editor-page__body,
.editor-page__preview-body {
  margin: 0;
  max-width: 65ch;
  line-height: 1.6;
  color: rgba(60, 41, 20, 0.78);
}

.editor-page__sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.editor-page__sidebar-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.editor-page__sidebar-header span {
  font-size: 0.9rem;
  color: rgba(60, 41, 20, 0.6);
}

.editor-page__meta {
  margin: 0 0 16px;
  color: rgba(60, 41, 20, 0.72);
}

.editor-page__meta--error {
  color: rgb(153, 27, 27);
}

.editor-page__list {
  display: grid;
  gap: 12px;
}

.editor-page__list-item {
  text-align: left;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.78);
  color: inherit;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.editor-page__list-item:hover {
  transform: translateY(-1px);
  border-color: rgba(154, 52, 18, 0.26);
  background: rgba(255, 248, 240, 0.94);
}

.editor-page__list-item--active {
  border-color: rgba(154, 52, 18, 0.34);
  background: rgba(255, 245, 236, 0.96);
}

.editor-page__list-item-id {
  display: block;
  margin-bottom: 6px;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.editor-page__list-item strong {
  display: block;
  margin-bottom: 4px;
  font-size: 1rem;
}

.editor-page__list-item p {
  margin: 0;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.72);
}

.editor-page__stats {
  margin: 20px 0 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.editor-page__stats div {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.78);
}

.editor-page__stats dt {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.72);
}

.editor-page__stats dd {
  margin: 8px 0 0;
  font-size: 1.15rem;
}

.editor-page__document {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.editor-page__canvas-shell {
  margin-top: 20px;
}

.editor-page__document-section {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.78);
}

.editor-page__document-section h4 {
  margin: 0 0 12px;
  font-size: 1rem;
}

.editor-page__document-section ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.editor-page__document-section li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(154, 52, 18, 0.08);
  padding-bottom: 10px;
}

.editor-page__document-section li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.editor-page__document-section span {
  color: rgba(60, 41, 20, 0.62);
}

@media (max-width: 1100px) {
  .editor-page__workspace {
    grid-template-columns: 1fr;
  }

  .editor-page__stats,
  .editor-page__document {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .editor-page__stats,
  .editor-page__document {
    grid-template-columns: 1fr;
  }
}
</style>
