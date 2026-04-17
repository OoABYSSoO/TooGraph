<template>
  <article class="node-card" :class="{ 'node-card--selected': selected }">
    <header class="node-card__header">
      <div class="node-card__eyebrow">{{ view.kindLabel }}</div>
      <h3 class="node-card__title">{{ view.title }}</h3>
    </header>

    <p class="node-card__description">{{ view.description }}</p>

    <section v-if="view.body.kind === 'input'" class="node-card__body node-card__body--input">
      <div class="node-card__port-row node-card__port-row--single">
        <span class="node-card__port-spacer" />
        <span class="node-card__port-label">{{ view.body.primaryOutput?.label }}</span>
      </div>
      <div class="node-card__surface node-card__surface--tall">{{ view.body.valueText || "Empty input" }}</div>
    </section>

    <section v-else-if="view.body.kind === 'agent'" class="node-card__body node-card__body--agent">
      <div class="node-card__port-grid">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-label">{{ port.label }}</div>
        </div>
        <div class="node-card__port-column node-card__port-column--right">
          <div v-for="port in view.outputs" :key="port.key" class="node-card__port-label">{{ port.label }}</div>
        </div>
      </div>
      <div class="node-card__chip-row">
        <span class="node-card__chip">{{ view.body.modelLabel }}</span>
        <span class="node-card__chip">{{ view.body.thinkingLabel }}</span>
      </div>
      <div class="node-card__action-row">
        <span class="node-card__action-pill node-card__action-pill--skill">+ skill</span>
        <span class="node-card__action-pill node-card__action-pill--input">+ input</span>
        <span class="node-card__action-pill node-card__action-pill--output">+ output</span>
      </div>
      <div class="node-card__surface">{{ view.body.taskInstruction }}</div>
      <div class="node-card__advanced">▸ ADVANCED</div>
    </section>

    <section v-else-if="view.body.kind === 'output'" class="node-card__body node-card__body--output">
      <div class="node-card__output-toolbar">
        <span class="node-card__port-label">{{ view.body.connectedStateLabel ?? "Unbound" }}</span>
        <span class="node-card__persist">
          <span>Save</span>
          <span class="node-card__toggle" :class="{ 'node-card__toggle--on': view.body.persistEnabled }">
            <span class="node-card__toggle-thumb" />
          </span>
        </span>
      </div>
      <div class="node-card__surface node-card__surface--output">
        <div class="node-card__surface-meta">
          <span>{{ view.body.previewTitle.toUpperCase() }}</span>
          <span>{{ view.body.displayModeLabel }}</span>
        </div>
        <div class="node-card__preview">{{ view.body.previewText || `Connected to ${view.body.connectedStateLabel ?? "state"}` }}</div>
      </div>
      <div class="node-card__advanced">▸ ADVANCED</div>
    </section>

    <section v-else class="node-card__body node-card__body--condition">
      <div class="node-card__condition-topline">
        <div class="node-card__port-column">
          <div v-for="port in view.inputs" :key="port.key" class="node-card__port-label">{{ port.label }}</div>
        </div>
        <span class="node-card__loop">{{ view.body.loopLimitLabel }}</span>
      </div>
      <div class="node-card__surface">
        <div class="node-card__condition-rule">{{ view.body.ruleSummary }}</div>
        <div class="node-card__branch-list">
          <div v-for="branch in view.body.branchMappings" :key="branch.branch" class="node-card__branch-chip">
            <span>{{ branch.branch }}</span>
            <small v-if="branch.matchValues.length">{{ branch.matchValues.join(', ') }}</small>
          </div>
        </div>
      </div>
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { GraphNode, StateDefinition } from "@/types/node-system";

import { buildNodeCardViewModel } from "./nodeCardViewModel";

const props = defineProps<{
  nodeId: string;
  node: GraphNode;
  stateSchema: Record<string, StateDefinition>;
  selected: boolean;
}>();

const view = computed(() => buildNodeCardViewModel(props.nodeId, props.node, props.stateSchema));
</script>

<style scoped>
.node-card {
  width: 460px;
  min-height: 260px;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  box-shadow: 0 22px 40px rgba(60, 41, 20, 0.08);
  user-select: none;
}

.node-card--selected {
  border-color: rgba(154, 52, 18, 0.32);
  box-shadow: 0 22px 40px rgba(154, 52, 18, 0.14);
}

.node-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 24px 8px;
}

.node-card__eyebrow {
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 0.86rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.84);
  background: rgba(255, 255, 255, 0.78);
}

.node-card__title {
  margin: 0;
  font-size: 2rem;
  line-height: 1.15;
  color: #1f2937;
}

.node-card__description {
  margin: 0;
  padding: 0 24px 20px;
  font-size: 0.98rem;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.74);
}

.node-card__body {
  border-top: 1px solid rgba(154, 52, 18, 0.14);
  padding: 18px 24px 24px;
  display: grid;
  gap: 14px;
}

.node-card__port-row,
.node-card__port-grid {
  display: grid;
  align-items: center;
}

.node-card__port-row--single {
  grid-template-columns: minmax(0, 1fr) auto;
}

.node-card__port-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.node-card__port-column {
  display: grid;
  gap: 6px;
}

.node-card__port-column--right {
  text-align: right;
}

.node-card__port-spacer {
  min-height: 1px;
}

.node-card__port-label {
  font-size: 1.08rem;
  font-weight: 600;
  color: #1f2937;
}

.node-card__chip-row,
.node-card__action-row,
.node-card__output-toolbar,
.node-card__condition-topline {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}

.node-card__chip-row {
  justify-content: flex-start;
}

.node-card__chip {
  display: inline-flex;
  align-items: center;
  min-height: 52px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 22px;
  padding: 0 18px;
  background: rgba(255, 255, 255, 0.9);
  font-size: 1rem;
  color: #3c2914;
}

.node-card__action-row {
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.node-card__action-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 8px 16px;
  border: 1px dashed rgba(154, 52, 18, 0.24);
  font-size: 0.92rem;
  font-weight: 500;
}

.node-card__action-pill--skill {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.28);
  background: rgba(239, 246, 255, 0.84);
}

.node-card__action-pill--input {
  color: #16a34a;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(220, 252, 231, 0.72);
}

.node-card__action-pill--output {
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.3);
  background: rgba(254, 243, 199, 0.72);
}

.node-card__surface {
  min-height: 120px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 24px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  line-height: 1.6;
  white-space: pre-wrap;
}

.node-card__surface--tall {
  min-height: 180px;
}

.node-card__surface--output {
  display: grid;
  gap: 14px;
}

.node-card__surface-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.88rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.node-card__preview {
  min-height: 146px;
  display: grid;
  place-items: center;
  border-radius: 20px;
  background: rgba(248, 242, 234, 0.84);
  padding: 18px;
  text-align: center;
  font-size: 1.1rem;
}

.node-card__persist {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__toggle {
  width: 56px;
  height: 32px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.18);
  padding: 4px;
  display: inline-flex;
  align-items: center;
}

.node-card__toggle--on {
  justify-content: flex-end;
  background: rgba(154, 52, 18, 0.72);
}

.node-card__toggle-thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
}

.node-card__advanced {
  display: flex;
  justify-content: center;
  font-size: 0.94rem;
  letter-spacing: 0.12em;
  color: rgba(60, 41, 20, 0.8);
}

.node-card__loop {
  font-size: 0.86rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.node-card__condition-rule {
  font-size: 1rem;
  color: #1f2937;
}

.node-card__branch-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.node-card__branch-chip {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 16px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.84);
  color: rgba(154, 52, 18, 0.92);
}

.node-card__branch-chip small {
  font-size: 0.78rem;
  color: rgba(60, 41, 20, 0.7);
}
</style>
