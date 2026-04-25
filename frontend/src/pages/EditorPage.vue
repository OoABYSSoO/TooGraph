<template>
  <AppShell>
    <div v-if="!initialListsReady" class="editor-page__loading">{{ t("app.loadingWorkspace") }}</div>
    <EditorWorkspaceShell
      v-else
      :route-mode="routeMode"
      :route-graph-id="requestedGraphId"
      :default-template-id="requestedTemplateId"
      :restore-run-id="requestedRestoreRunId"
      :restore-snapshot-id="requestedRestoreSnapshotId"
      :templates="graphStore.templates"
      :graphs="graphStore.graphs"
    />
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";

import EditorWorkspaceShell from "@/editor/workspace/EditorWorkspaceShell.vue";
import AppShell from "@/layouts/AppShell.vue";
import { useGraphDocumentStore } from "@/stores/graphDocument";

const route = useRoute();
const graphStore = useGraphDocumentStore();
const initialListsReady = ref(false);
const { t } = useI18n();

const routeMode = computed<"root" | "new" | "existing">(() => {
  if (route.path === "/editor") {
    return "root";
  }
  if (route.path === "/editor/new") {
    return "new";
  }
  return "existing";
});
const requestedTemplateId = computed(() => asString(route.query.template));
const requestedRestoreRunId = computed(() => asString(route.query.restoreRun));
const requestedRestoreSnapshotId = computed(() => asString(route.query.snapshot));
const requestedGraphId = computed(() => asString(route.params.graphId));
function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

async function loadWorkspaceLists() {
  await Promise.all([graphStore.ensureTemplatesLoaded(), graphStore.ensureGraphsLoaded()]);
}

onMounted(async () => {
  await loadWorkspaceLists();
  initialListsReady.value = true;
});

watch(
  () => route.fullPath,
  async () => {
    if (!initialListsReady.value) {
      return;
    }
    await loadWorkspaceLists();
  },
);
</script>

<style scoped>
.editor-page__loading {
  box-sizing: border-box;
  width: min(720px, calc(100% - 24px));
  margin: 12px auto 0;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 24px;
  padding: 24px;
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.08);
  color: rgba(60, 41, 20, 0.72);
}
</style>
