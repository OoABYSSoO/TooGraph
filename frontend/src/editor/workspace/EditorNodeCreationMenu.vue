<template>
  <div
    v-if="open && position"
    class="editor-node-creation-menu"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
    }"
  >
    <div class="editor-node-creation-menu__header">
      <div>
        <div class="editor-node-creation-menu__eyebrow">Create Node</div>
        <p class="editor-node-creation-menu__summary">
          {{ context?.sourceValueType ? `Choose a node for ${context.sourceValueType} output` : "Choose a node to create" }}
        </p>
      </div>
      <button type="button" class="editor-node-creation-menu__close" @click="$emit('close')">Close</button>
    </div>

    <ElInput
      class="editor-node-creation-menu__search"
      :model-value="query"
      placeholder="Search nodes and presets"
      @update:model-value="$emit('update:query', String($event ?? ''))"
    />

    <div class="editor-node-creation-menu__entries">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="editor-node-creation-menu__entry"
        @click="$emit('select-entry', entry)"
      >
        <span class="editor-node-creation-menu__entry-family">{{ entry.family }}</span>
        <strong>{{ entry.label }}</strong>
        <p>{{ entry.description }}</p>
      </button>
      <div v-if="entries.length === 0" class="editor-node-creation-menu__empty">No matching nodes or presets.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElInput } from "element-plus";

import type { NodeCreationContext, NodeCreationEntry } from "@/types/node-system";

defineProps<{
  open: boolean;
  entries: NodeCreationEntry[];
  context: NodeCreationContext | null;
  query: string;
  position: { x: number; y: number } | null;
}>();

defineEmits<{
  (event: "update:query", value: string): void;
  (event: "select-entry", entry: NodeCreationEntry): void;
  (event: "close"): void;
}>();
</script>

<style scoped>
.editor-node-creation-menu {
  position: absolute;
  z-index: 20;
  width: 320px;
  transform: translate(-20px, -20px);
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 20px;
  background: rgba(255, 250, 241, 0.98);
  padding: 12px;
  box-shadow: 0 24px 48px rgba(60, 41, 20, 0.18);
}

.editor-node-creation-menu__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.editor-node-creation-menu__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.editor-node-creation-menu__summary {
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: rgba(60, 41, 20, 0.72);
}

.editor-node-creation-menu__close {
  border: 0;
  background: transparent;
  color: rgba(60, 41, 20, 0.7);
  cursor: pointer;
}

.editor-node-creation-menu__search {
  margin-top: 12px;
}

.editor-node-creation-menu__entries {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.editor-node-creation-menu__entry {
  display: grid;
  gap: 4px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  padding: 12px;
  text-align: left;
  cursor: pointer;
}

.editor-node-creation-menu__entry-family {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.76);
}

.editor-node-creation-menu__entry p,
.editor-node-creation-menu__empty {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
}
</style>
