<template>
  <aside class="editor-run-activity-panel">
    <div class="editor-run-activity-panel__surface">
      <header class="editor-run-activity-panel__header">
        <div>
          <div class="editor-run-activity-panel__eyebrow">{{ t("runActivity.eyebrow") }}</div>
          <h2 class="editor-run-activity-panel__title">{{ t("runActivity.title") }}</h2>
          <p class="editor-run-activity-panel__body">{{ t("runActivity.body") }}</p>
        </div>
        <button type="button" class="editor-run-activity-panel__collapse" :aria-label="t('runActivity.collapse')" @click="$emit('toggle')">
          <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
        </button>
      </header>

      <div class="editor-run-activity-panel__summary">
        <span>{{ runStatus || t("runActivity.noRun") }}</span>
        <strong>{{ entries.length }}</strong>
      </div>

      <div ref="activityScrollRef" class="editor-run-activity-panel__feed" @scroll="handleFeedScroll">
        <div v-if="entries.length === 0" class="editor-run-activity-panel__empty">{{ t("runActivity.empty") }}</div>

        <article
          v-for="entry in entries"
          :key="entry.id"
          class="editor-run-activity-panel__entry"
          :class="{
            'editor-run-activity-panel__entry--active': entry.active,
            [`editor-run-activity-panel__entry--${entry.kind}`]: true,
          }"
        >
          <button
            type="button"
            class="editor-run-activity-panel__entry-head"
            :aria-expanded="isEntryExpanded(entry.id)"
            @click="toggleEntry(entry.id)"
          >
            <span class="editor-run-activity-panel__entry-index">#{{ entry.sequence }}</span>
            <span class="editor-run-activity-panel__entry-title">{{ entry.title }}</span>
            <span class="editor-run-activity-panel__entry-time">{{ formatEntryTime(entry.createdAt) }}</span>
          </button>
          <pre class="editor-run-activity-panel__entry-preview">{{ entry.preview }}</pre>
          <pre v-if="isEntryExpanded(entry.id)" class="editor-run-activity-panel__entry-detail">{{ JSON.stringify(entry.detail, null, 2) }}</pre>
        </article>
      </div>

      <button v-if="!autoFollow" type="button" class="editor-run-activity-panel__back-to-latest" @click="backToLatest">
        {{ t("runActivity.backToLatest") }}
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ArrowRight } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { useI18n } from "vue-i18n";

import type { RunActivityEntry } from "./runActivityModel.ts";

const props = defineProps<{
  entries: RunActivityEntry[];
  runStatus?: string | null;
}>();

defineEmits<{
  (event: "toggle"): void;
}>();

const { t } = useI18n();
const activityScrollRef = ref<HTMLElement | null>(null);
const autoFollow = ref(true);
const expandedEntries = ref<Record<string, boolean>>({});

watch(
  () => getAutoScrollSignature(),
  () => {
    if (autoFollow.value) {
      void nextTick(scrollToLatest);
    }
  },
);

function getAutoScrollSignature() {
  const activeEntry = props.entries.find((entry) => entry.active);
  return `${props.entries.length}:${activeEntry?.id ?? ""}:${activeEntry?.preview.length ?? 0}:${activeEntry?.createdAt ?? ""}`;
}

function scrollToLatest() {
  const element = activityScrollRef.value;
  if (!element) {
    return;
  }
  element.scrollTop = element.scrollHeight;
}

function handleFeedScroll() {
  const element = activityScrollRef.value;
  if (!element) {
    return;
  }
  autoFollow.value = element.scrollHeight - element.scrollTop - element.clientHeight < 32;
}

function backToLatest() {
  autoFollow.value = true;
  void nextTick(scrollToLatest);
}

function isEntryExpanded(entryId: string) {
  return expandedEntries.value[entryId] ?? false;
}

function toggleEntry(entryId: string) {
  expandedEntries.value = {
    ...expandedEntries.value,
    [entryId]: !isEntryExpanded(entryId),
  };
}

function formatEntryTime(value: string) {
  const match = value.match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? value;
}
</script>

<style scoped>
.editor-run-activity-panel {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 12px;
  background: transparent;
}

.editor-run-activity-panel__surface {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 28px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow: var(--toograph-glass-shadow), var(--toograph-glass-highlight), var(--toograph-glass-rim);
  backdrop-filter: blur(34px) saturate(1.7) contrast(1.02);
}

.editor-run-activity-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 6px;
}

.editor-run-activity-panel__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.82);
}

.editor-run-activity-panel__title {
  margin: 2px 0 0;
  font-size: 1.1rem;
  line-height: 1.25;
}

.editor-run-activity-panel__body {
  margin: 4px 0 0;
  color: rgba(69, 45, 25, 0.74);
  font-size: 0.86rem;
  line-height: 1.45;
}

.editor-run-activity-panel__collapse {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.92);
  color: rgba(120, 53, 15, 0.92);
  cursor: pointer;
}

.editor-run-activity-panel__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 14px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.72);
  padding: 10px 12px;
  color: rgba(69, 45, 25, 0.82);
}

.editor-run-activity-panel__feed {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 0 14px 14px;
  scrollbar-gutter: stable;
}

.editor-run-activity-panel__empty {
  border: 1px dashed rgba(154, 52, 18, 0.16);
  border-radius: 18px;
  padding: 18px;
  color: rgba(69, 45, 25, 0.64);
  text-align: center;
}

.editor-run-activity-panel__entry {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.9);
  padding: 10px;
}

.editor-run-activity-panel__entry--active {
  border-color: rgba(37, 99, 235, 0.32);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.editor-run-activity-panel__entry-head {
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.editor-run-activity-panel__entry-index,
.editor-run-activity-panel__entry-time {
  color: rgba(120, 53, 15, 0.72);
  font-size: 0.78rem;
}

.editor-run-activity-panel__entry-title,
.editor-run-activity-panel__entry-preview {
  overflow-wrap: anywhere;
}

.editor-run-activity-panel__entry-preview,
.editor-run-activity-panel__entry-detail {
  margin: 8px 0 0;
  white-space: pre-wrap;
  font: inherit;
}

.editor-run-activity-panel__entry-preview {
  color: rgba(31, 41, 55, 0.9);
}

.editor-run-activity-panel__entry-detail {
  max-height: 220px;
  overflow: auto;
  border-radius: 12px;
  background: rgba(31, 41, 55, 0.06);
  padding: 10px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.78rem;
}

.editor-run-activity-panel__back-to-latest {
  position: absolute;
  right: 22px;
  bottom: 20px;
  border: 1px solid rgba(154, 52, 18, 0.22);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.96);
  padding: 8px 12px;
  color: rgba(120, 53, 15, 0.94);
  cursor: pointer;
}
</style>
