<template>
  <aside class="editor-human-review-panel">
      <header class="editor-human-review-panel__header">
        <div>
          <div class="editor-human-review-panel__eyebrow">Human Review</div>
          <h2 class="editor-human-review-panel__title">Paused Run</h2>
          <p class="editor-human-review-panel__body">
            Review the checkpoint state, adjust values, then continue the run.
          </p>
        </div>
        <button type="button" class="editor-human-review-panel__collapse" aria-label="Collapse human review panel" @click="$emit('toggle')">
          <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
        </button>
      </header>

      <section v-if="run" class="editor-human-review-panel__run-card">
        <span class="editor-human-review-panel__status">{{ run.status }}</span>
        <strong>{{ pausedNodeLabel }}</strong>
        <p>{{ pauseReason }}</p>
      </section>

      <div v-if="reviewRows.length === 0" class="editor-human-review-panel__empty">
        No checkpoint state is available for review yet.
      </div>

      <div v-else class="editor-human-review-panel__content">
        <article
          v-for="row in reviewRows"
          :key="row.key"
          class="editor-human-review-panel__state-card"
          :style="{ '--human-review-accent': row.color }"
        >
          <div class="editor-human-review-panel__state-head">
            <span class="editor-human-review-panel__state-dot" aria-hidden="true" />
            <div>
              <div class="editor-human-review-panel__state-label">{{ row.label }}</div>
              <div class="editor-human-review-panel__state-key">{{ row.key }} · {{ row.type }}</div>
            </div>
          </div>
          <p v-if="row.description" class="editor-human-review-panel__state-description">{{ row.description }}</p>
          <textarea
            class="editor-human-review-panel__textarea"
            rows="4"
            :value="draftFor(row.key)"
            @input="updateDraft(row.key, ($event.target as HTMLTextAreaElement).value)"
          />
        </article>
      </div>

      <footer class="editor-human-review-panel__footer">
        <p v-if="error" class="editor-human-review-panel__error">{{ error }}</p>
        <button
          type="button"
          class="editor-human-review-panel__resume"
          :disabled="busy || !run || run.status !== 'awaiting_human'"
          @click="$emit('resume', buildResumePayload())"
        >
          {{ busy ? "Continuing..." : "Continue Run" }}
        </button>
      </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElIcon } from "element-plus";
import { ArrowRight } from "@element-plus/icons-vue";

import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import {
  buildHumanReviewResumePayload,
  buildHumanReviewRows,
} from "./humanReviewPanelModel.ts";

const props = defineProps<{
  run?: RunDetail | null;
  document: GraphPayload | GraphDocument;
  focusedNodeId?: string | null;
  busy?: boolean;
  error?: string | null;
}>();

defineEmits<{
  (event: "toggle"): void;
  (event: "focus-node", nodeId: string): void;
  (event: "resume", payload: Record<string, unknown>): void;
}>();

const draftsByKey = ref<Record<string, string>>({});
const reviewRows = computed(() => buildHumanReviewRows(props.run ?? null, props.document));
const pausedNodeLabel = computed(() => {
  const nodeId = props.run?.current_node_id ?? props.focusedNodeId ?? "";
  if (!nodeId) {
    return "No paused node";
  }
  return props.document.nodes[nodeId]?.name?.trim() || nodeId;
});
const pauseReason = computed(() => props.run?.lifecycle.pause_reason || "Waiting for human review.");

watch(
  reviewRows,
  (rows) => {
    draftsByKey.value = Object.fromEntries(rows.map((row) => [row.key, row.draft]));
  },
  { immediate: true },
);

function draftFor(stateKey: string) {
  return draftsByKey.value[stateKey] ?? "";
}

function updateDraft(stateKey: string, value: string) {
  draftsByKey.value = {
    ...draftsByKey.value,
    [stateKey]: value,
  };
}

function buildResumePayload() {
  return buildHumanReviewResumePayload(reviewRows.value, draftsByKey.value);
}
</script>

<style scoped>
.editor-human-review-panel {
  min-width: 0;
  height: 100%;
}

.editor-human-review-panel__header,
.editor-human-review-panel__run-card,
.editor-human-review-panel__state-card {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 22px;
  background: rgba(255, 250, 241, 0.82);
}

.editor-human-review-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.editor-human-review-panel__eyebrow,
.editor-human-review-panel__status,
.editor-human-review-panel__state-key {
  color: #9a3412;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.editor-human-review-panel__title {
  margin: 4px 0;
  color: #1f2933;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.15rem;
}

.editor-human-review-panel__body,
.editor-human-review-panel__run-card p,
.editor-human-review-panel__state-description,
.editor-human-review-panel__empty {
  margin: 0;
  color: rgba(74, 60, 45, 0.74);
  font-size: 0.86rem;
  line-height: 1.45;
}

.editor-human-review-panel__collapse {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.9);
  color: rgba(120, 53, 15, 0.8);
  cursor: pointer;
}

.editor-human-review-panel__run-card {
  margin-top: 10px;
  padding: 12px 14px;
}

.editor-human-review-panel__content {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  overflow: auto;
}

.editor-human-review-panel__state-card {
  padding: 12px;
}

.editor-human-review-panel__state-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editor-human-review-panel__state-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--human-review-accent, #d97706);
}

.editor-human-review-panel__state-label {
  color: #1f2933;
  font-weight: 800;
}

.editor-human-review-panel__state-description {
  margin-top: 8px;
}

.editor-human-review-panel__textarea {
  width: 100%;
  box-sizing: border-box;
  margin-top: 10px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.76);
  color: #1f2933;
  font: inherit;
  line-height: 1.45;
  padding: 10px;
  resize: vertical;
}

.editor-human-review-panel__empty {
  margin-top: 10px;
  padding: 14px;
}

.editor-human-review-panel__footer {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.editor-human-review-panel__resume {
  border: 1px solid rgba(217, 119, 6, 0.28);
  border-radius: 999px;
  background: #d97706;
  color: #fff;
  cursor: pointer;
  font-weight: 800;
  padding: 11px 16px;
}

.editor-human-review-panel__resume:disabled {
  cursor: wait;
  opacity: 0.72;
}

.editor-human-review-panel__error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.82rem;
}
</style>
