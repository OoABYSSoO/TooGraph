<template>
  <span class="node-card__linked-text">
    <template v-for="(segment, index) in segments" :key="index">
      <a
        v-if="segment.kind === 'link'"
        :href="segment.href"
        target="_blank"
        rel="noreferrer noopener"
        @pointerdown.stop
        @click.stop
      >
        {{ segment.text }}
      </a>
      <span v-else>{{ segment.text }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { linkifyOutputText } from "./outputPreviewContentModel";

const props = defineProps<{
  text: string;
}>();

const segments = computed(() => linkifyOutputText(props.text));
</script>

<style scoped>
.node-card__linked-text {
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
  user-select: text;
  -webkit-user-select: text;
}

.node-card__linked-text a {
  color: #1d4ed8;
  font-weight: 650;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  user-select: text;
  -webkit-user-select: text;
}
</style>
