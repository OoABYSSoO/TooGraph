<template>
  <div class="subgraph-node-body">
    <div class="subgraph-node-body__ports">
      <StatePortList
        side="input"
        :ports="orderedInputPorts"
        :node-id="nodeId"
        :popover-style="stateEditorPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :type-options="typeOptions"
        :color-options="colorOptions"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        :is-port-reordering="isPortReordering"
        :is-port-reorder-placeholder="isPortReorderPlaceholder"
        :create-visible="false"
        :create-open="false"
        create-accent-color="#16a34a"
        create-label="+ input"
        create-anchor-state-key=""
        :create-draft="null"
        :create-title="''"
        :create-error="null"
        :create-hint="''"
        :create-type-options="typeOptions"
        :create-popover-style="agentAddPopoverStyle"
        @pointer-enter="emit('pointer-enter', $event)"
        @pointer-leave="emit('pointer-leave', $event)"
        @reorder-pointer-down="(side, stateKey, pointerEvent) => emit('reorder-pointer-down', side, stateKey, pointerEvent)"
        @port-click="(anchorId, stateKey) => emit('port-click', anchorId, stateKey)"
        @remove-click="(anchorId, side, stateKey) => emit('remove-click', anchorId, side, stateKey)"
        @update:name="emit('update:name', $event)"
        @update:type="emit('update:type', $event)"
        @update:color="emit('update:color', $event)"
        @update:description="emit('update:description', $event)"
      />

      <div class="subgraph-node-body__thumbnail" aria-label="Subgraph preview">
        <div class="subgraph-node-body__summary">
          <span>{{ body.inputCount }} in</span>
          <span>{{ body.outputCount }} out</span>
        </div>
        <div class="subgraph-node-body__mini-flow">
          <span
            v-for="item in body.thumbnailNodes"
            :key="item.id"
            class="subgraph-node-body__mini-node"
            :class="`subgraph-node-body__mini-node--${item.kind}`"
          >
            {{ item.label }}
          </span>
        </div>
        <div v-if="body.capabilities.length > 0" class="subgraph-node-body__capabilities">
          <span v-for="capability in body.capabilities" :key="capability">{{ capability }}</span>
        </div>
      </div>

      <StatePortList
        side="output"
        :ports="orderedOutputPorts"
        :node-id="nodeId"
        :popover-style="stateEditorPopoverStyle"
        :state-editor-draft="stateEditorDraft"
        :state-editor-error="stateEditorError"
        :type-options="typeOptions"
        :color-options="colorOptions"
        :is-state-editor-open="isStateEditorOpen"
        :is-state-editor-confirm-open="isStateEditorConfirmOpen"
        :is-remove-port-state-confirm-open="isRemovePortStateConfirmOpen"
        :is-state-editor-pill-revealed="isStateEditorPillRevealed"
        :is-port-reordering="isPortReordering"
        :is-port-reorder-placeholder="isPortReorderPlaceholder"
        :create-visible="false"
        :create-open="false"
        create-accent-color="#9a3412"
        create-label="+ output"
        create-anchor-state-key=""
        :create-draft="null"
        :create-title="''"
        :create-error="null"
        :create-hint="''"
        :create-type-options="typeOptions"
        :create-popover-style="agentAddPopoverStyle"
        @pointer-enter="emit('pointer-enter', $event)"
        @pointer-leave="emit('pointer-leave', $event)"
        @reorder-pointer-down="(side, stateKey, pointerEvent) => emit('reorder-pointer-down', side, stateKey, pointerEvent)"
        @port-click="(anchorId, stateKey) => emit('port-click', anchorId, stateKey)"
        @remove-click="(anchorId, side, stateKey) => emit('remove-click', anchorId, side, stateKey)"
        @update:name="emit('update:name', $event)"
        @update:type="emit('update:type', $event)"
        @update:color="emit('update:color', $event)"
        @update:description="emit('update:description', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

import StatePortList from "./StatePortList.vue";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type SubgraphBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "subgraph" }>;

defineProps<{
  nodeId: string;
  body: SubgraphBodyViewModel;
  orderedInputPorts: NodePortViewModel[];
  orderedOutputPorts: NodePortViewModel[];
  stateEditorPopoverStyle: CSSProperties;
  agentAddPopoverStyle: CSSProperties;
  stateEditorDraft: StateFieldDraft | null;
  stateEditorError: string | null;
  typeOptions: StateFieldType[];
  colorOptions: StateColorOption[];
  isStateEditorOpen: (anchorId: string) => boolean;
  isStateEditorConfirmOpen: (anchorId: string) => boolean;
  isRemovePortStateConfirmOpen: (anchorId: string) => boolean;
  isStateEditorPillRevealed: (anchorId: string) => boolean;
  isPortReordering: (side: "input" | "output", stateKey: string) => boolean;
  isPortReorderPlaceholder: (side: "input" | "output", stateKey: string) => boolean;
}>();

const emit = defineEmits<{
  (event: "pointer-enter", anchorId: string): void;
  (event: "pointer-leave", anchorId: string): void;
  (event: "reorder-pointer-down", side: "input" | "output", stateKey: string, pointerEvent: PointerEvent): void;
  (event: "port-click", anchorId: string, stateKey: string): void;
  (event: "remove-click", anchorId: string, side: "input" | "output", stateKey: string): void;
  (event: "update:name", value: string): void;
  (event: "update:type", value: string): void;
  (event: "update:color", value: string): void;
  (event: "update:description", value: string): void;
}>();
</script>

<style scoped>
.subgraph-node-body {
  display: grid;
  gap: 12px;
}

.subgraph-node-body__ports {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(180px, 1.4fr) minmax(120px, 1fr);
  align-items: center;
  gap: 16px;
}

.subgraph-node-body__thumbnail {
  min-height: 150px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgba(154, 52, 18, 0.055) 1px, transparent 1px),
    linear-gradient(rgba(154, 52, 18, 0.055) 1px, transparent 1px),
    rgba(255, 253, 248, 0.78);
  background-size: 18px 18px;
  padding: 12px;
  display: grid;
  align-content: start;
  gap: 10px;
  overflow: hidden;
}

.subgraph-node-body__summary,
.subgraph-node-body__capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.subgraph-node-body__summary span,
.subgraph-node-body__capabilities span {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #9a3412;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 6px 8px;
}

.subgraph-node-body__mini-flow {
  display: grid;
  gap: 8px;
}

.subgraph-node-body__mini-node {
  min-width: 0;
  border: 1px solid rgba(180, 83, 9, 0.18);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  color: #3f2a1d;
  font-size: 12px;
  line-height: 1.2;
  padding: 8px 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subgraph-node-body__mini-node--agent {
  border-color: rgba(37, 99, 235, 0.2);
}

.subgraph-node-body__mini-node--condition {
  border-color: rgba(220, 38, 38, 0.2);
}
</style>
