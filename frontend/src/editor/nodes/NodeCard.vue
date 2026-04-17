<template>
  <article class="node-card" :class="{ 'node-card--selected': selected }">
    <div class="node-card__eyebrow">{{ node.kind }}</div>
    <h3 class="node-card__title">{{ node.name }}</h3>
    <p class="node-card__description">{{ node.description || "No description yet." }}</p>

    <dl class="node-card__stats">
      <div>
        <dt>Reads</dt>
        <dd>{{ node.reads.length }}</dd>
      </div>
      <div>
        <dt>Writes</dt>
        <dd>{{ node.writes.length }}</dd>
      </div>
      <div v-if="node.kind === 'condition'">
        <dt>Branches</dt>
        <dd>{{ node.config.branches.length }}</dd>
      </div>
    </dl>
  </article>
</template>

<script setup lang="ts">
import type { GraphNode } from "@/types/node-system";

defineProps<{
  nodeId: string;
  node: GraphNode;
  selected: boolean;
}>();
</script>

<style scoped>
.node-card {
  width: 260px;
  min-height: 160px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 22px;
  padding: 18px;
  background: rgba(255, 252, 247, 0.96);
  box-shadow: 0 18px 36px rgba(60, 41, 20, 0.08);
  cursor: grab;
  user-select: none;
}

.node-card--selected {
  border-color: rgba(154, 52, 18, 0.32);
  box-shadow: 0 18px 36px rgba(154, 52, 18, 0.16);
}

.node-card__eyebrow {
  font-size: 0.7rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.node-card__title {
  margin: 8px 0 10px;
  font-size: 1.25rem;
}

.node-card__description {
  margin: 0;
  min-height: 44px;
  line-height: 1.55;
  color: rgba(60, 41, 20, 0.74);
}

.node-card__stats {
  margin: 18px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
  gap: 10px;
}

.node-card__stats div {
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 16px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.8);
}

.node-card__stats dt {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.7);
}

.node-card__stats dd {
  margin: 8px 0 0;
  font-size: 1rem;
}
</style>
