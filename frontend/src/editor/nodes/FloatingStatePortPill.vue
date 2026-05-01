<template>
  <Teleport to="body">
    <span
      v-if="floatingPort"
      class="node-card__port-pill node-card__port-pill--floating node-card__port-pill--removable"
      :class="{
        'node-card__port-pill--input': floatingPort.side === 'input',
        'node-card__port-pill--output': floatingPort.side === 'output',
      }"
      :style="floatingStyle"
      aria-hidden="true"
    >
      <span
        v-if="floatingPort.side === 'input'"
        class="node-card__port-pill-anchor-slot node-card__port-pill-anchor-slot--leading"
      />
      <span class="node-card__port-pill-label">
        <span class="node-card__port-pill-label-text">{{ floatingPort.port.label }}</span>
      </span>
      <span
        v-if="floatingPort.side === 'output'"
        class="node-card__port-pill-anchor-slot"
      />
    </span>
  </Teleport>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

import type { NodePortViewModel } from "./nodeCardViewModel";

defineProps<{
  floatingPort: { side: "input" | "output"; port: NodePortViewModel } | null;
  floatingStyle: CSSProperties;
}>();
</script>

<style scoped>
.node-card__port-pill {
  --node-card-port-accent: rgba(217, 119, 6, 0.92);
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  min-height: 34px;
  min-width: 132px;
  max-width: min(100%, var(--node-card-port-pill-max-width, 240px));
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  padding: 5px 10px;
  box-shadow: none;
  cursor: pointer;
}

.node-card__port-pill--floating {
  position: fixed;
  z-index: 5000;
  margin: 0;
  pointer-events: none;
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--node-card-port-accent) 42%, transparent);
  background: rgba(255, 250, 241, 0.97);
  box-shadow: 0 16px 34px rgba(60, 41, 20, 0.16);
  transform: translateZ(0);
}

.node-card__port-pill--output {
  color: #1f2937;
}

.node-card__port-pill--input {
  justify-content: flex-start;
  color: #1f2937;
}

.node-card__port-pill--removable.node-card__port-pill--input {
  padding-right: 39px;
}

.node-card__port-pill--removable.node-card__port-pill--output {
  padding-left: 39px;
}

.node-card__port-pill-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding-inline: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
}

.node-card__port-pill-label-text {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.node-card__port-pill-anchor-slot {
  flex: none;
  width: 14px;
  height: 14px;
}

.node-card__port-pill-anchor-slot--leading {
  order: -1;
}
</style>
