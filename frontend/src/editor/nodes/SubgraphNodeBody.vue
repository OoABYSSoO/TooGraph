<template>
  <div class="subgraph-node-body">
    <div class="subgraph-node-body__ports">
      <div class="subgraph-node-body__port-rail subgraph-node-body__port-rail--input">
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
      </div>

      <div class="subgraph-node-body__port-rail subgraph-node-body__port-rail--output">
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

      <div class="subgraph-node-body__thumbnail" aria-label="Subgraph preview">
        <div class="subgraph-node-body__summary">
          <span>{{ body.inputCount }} in</span>
          <span>{{ body.outputCount }} out</span>
          <span
            v-if="body.runtimeSummary"
            class="subgraph-node-body__runtime"
            :class="`subgraph-node-body__runtime--${body.runtimeSummary.tone}`"
          >
            {{ runtimeSummaryText }}
          </span>
        </div>
        <SubgraphMiniMap
          :nodes="body.thumbnailNodes"
          :edges="body.thumbnailEdges"
        />
        <div v-if="body.capabilities.length > 0" class="subgraph-node-body__capabilities">
          <span v-for="capability in body.capabilities" :key="capability">{{ capability }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CSSProperties } from "vue";

import StatePortList from "./StatePortList.vue";
import SubgraphMiniMap from "./SubgraphMiniMap.vue";
import type { NodeCardViewModel, NodePortViewModel } from "./nodeCardViewModel";
import type { StateColorOption, StateFieldDraft, StateFieldType } from "@/editor/workspace/statePanelFields";

type SubgraphBodyViewModel = Extract<NodeCardViewModel["body"], { kind: "subgraph" }>;

const props = defineProps<{
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

const runtimeSummaryText = computed(() => {
  const summary = props.body.runtimeSummary;
  if (!summary) {
    return "";
  }
  const progress = `${summary.completedCount}/${summary.totalCount}`;
  if (summary.currentNodeLabel) {
    return `Running ${progress} - ${summary.currentNodeLabel}`;
  }
  if (summary.failedCount > 0) {
    return `Failed ${summary.failedCount} - ${progress}`;
  }
  if (summary.tone === "success") {
    return `Done ${progress}`;
  }
  return `Progress ${progress}`;
});

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
  grid-template-areas:
    "input output"
    "thumbnail thumbnail";
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 14px 18px;
}

.subgraph-node-body__port-rail {
  min-width: 0;
  width: min(260px, 100%);
}

.subgraph-node-body__port-rail--input {
  grid-area: input;
  justify-self: start;
}

.subgraph-node-body__port-rail--output {
  grid-area: output;
  justify-self: end;
}

.subgraph-node-body__thumbnail {
  grid-area: thumbnail;
  min-height: 210px;
  padding: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  overflow: hidden;
}

.subgraph-node-body__summary,
.subgraph-node-body__capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.subgraph-node-body__summary {
  justify-content: center;
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

.subgraph-node-body__runtime--running {
  border-color: rgba(37, 99, 235, 0.18);
  color: #1d4ed8;
}

.subgraph-node-body__runtime--success {
  border-color: rgba(22, 163, 74, 0.18);
  color: #15803d;
}

.subgraph-node-body__runtime--failed {
  border-color: rgba(220, 38, 38, 0.18);
  color: #b91c1c;
}

.subgraph-node-body__runtime--paused {
  border-color: rgba(217, 119, 6, 0.18);
  color: #b45309;
}
</style>
