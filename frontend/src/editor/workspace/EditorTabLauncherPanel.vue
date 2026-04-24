<template>
  <div class="editor-tab-launcher-panel">
    <button type="button" class="editor-tab-launcher-panel__entry" @click="$emit('create-new')">
      <div class="editor-tab-launcher-panel__entry-copy">
        <div class="editor-tab-launcher-panel__entry-title">新建空白图</div>
        <div class="editor-tab-launcher-panel__entry-meta">从空白工作流开始</div>
      </div>
    </button>

    <div class="editor-tab-launcher-panel__section">
      <button type="button" class="editor-tab-launcher-panel__entry" @click="toggleSection('template')">
        <div class="editor-tab-launcher-panel__entry-copy">
          <div class="editor-tab-launcher-panel__entry-title">从模板新建</div>
          <div class="editor-tab-launcher-panel__entry-meta">选择预设模板作为起点</div>
        </div>
      </button>
      <div v-if="expandedSection === 'template'" class="editor-tab-launcher-panel__picker">
        <WorkspaceSelect v-model="selectedTemplateId" :options="templateOptions" :placeholder="templatePlaceholder" />
      </div>
    </div>

    <div class="editor-tab-launcher-panel__section">
      <button type="button" class="editor-tab-launcher-panel__entry" @click="toggleSection('graph')">
        <div class="editor-tab-launcher-panel__entry-copy">
          <div class="editor-tab-launcher-panel__entry-title">打开已有图</div>
          <div class="editor-tab-launcher-panel__entry-meta">继续编辑已保存工作流</div>
        </div>
      </button>
      <div v-if="expandedSection === 'graph'" class="editor-tab-launcher-panel__picker">
        <WorkspaceSelect v-model="selectedGraphId" :options="graphOptions" :placeholder="graphPlaceholder" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

import WorkspaceSelect from "./WorkspaceSelect.vue";
import type { WorkspaceSelectOption } from "./workspaceSelectModel";

const props = defineProps<{
  templateOptions: WorkspaceSelectOption[];
  graphOptions: WorkspaceSelectOption[];
  templatePlaceholder: string;
  graphPlaceholder: string;
}>();

const emit = defineEmits<{
  (event: "create-new"): void;
  (event: "create-from-template", templateId: string): void;
  (event: "open-graph", graphId: string): void;
}>();

const expandedSection = ref<"template" | "graph" | null>(null);
const selectedTemplateId = ref("");
const selectedGraphId = ref("");

function toggleSection(section: "template" | "graph") {
  expandedSection.value = expandedSection.value === section ? null : section;
}

watch(selectedTemplateId, (nextValue) => {
  if (!nextValue) {
    return;
  }
  emit("create-from-template", nextValue);
  selectedTemplateId.value = "";
  expandedSection.value = null;
});

watch(selectedGraphId, (nextValue) => {
  if (!nextValue) {
    return;
  }
  emit("open-graph", nextValue);
  selectedGraphId.value = "";
  expandedSection.value = null;
});
</script>

<style scoped>
.editor-tab-launcher-panel {
  width: min(320px, calc(100vw - 32px));
  display: grid;
  gap: 10px;
}

.editor-tab-launcher-panel__section {
  display: grid;
  gap: 8px;
}

.editor-tab-launcher-panel__entry {
  width: 100%;
  border: 1px solid rgba(193, 151, 106, 0.2);
  border-radius: 16px;
  background: rgba(255, 250, 242, 0.96);
  padding: 12px;
  text-align: left;
  cursor: pointer;
}

.editor-tab-launcher-panel__picker {
  padding: 0 4px 4px;
}

.editor-tab-launcher-panel__entry-title {
  font-weight: 700;
  color: rgba(96, 63, 36, 0.96);
}

.editor-tab-launcher-panel__entry-meta {
  margin-top: 4px;
  font-size: 0.78rem;
  color: rgba(120, 88, 58, 0.82);
}
</style>
