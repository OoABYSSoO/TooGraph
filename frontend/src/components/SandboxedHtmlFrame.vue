<template>
  <iframe
    class="sandboxed-html-frame"
    :srcdoc="source"
    sandbox=""
    referrerpolicy="no-referrer"
    :title="title || 'Sandboxed HTML preview'"
  />
</template>

<script setup lang="ts">
defineProps<{
  source: string;
  title?: string;
}>();
</script>

<style scoped>
.sandboxed-html-frame {
  display: block;
  width: 100%;
  height: 100%;
  min-height: inherit;
  border: 0;
  background: #ffffff;
}
</style>
