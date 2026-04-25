<template>
  <aside class="editor-human-review-panel">
    <div class="editor-human-review-panel__surface">
      <header class="editor-human-review-panel__action-bar">
        <button
          type="button"
          class="editor-human-review-panel__resume"
          :disabled="busy || !run || run.status !== 'awaiting_human'"
          @click="handleResumeClick"
        >
          {{ busy ? "Continuing..." : "Continue Run" }}
        </button>
        <div class="editor-human-review-panel__action-tools">
          <button
            v-if="currentFocusNodeId"
            type="button"
            class="editor-human-review-panel__focus"
            @click="$emit('focus-node', currentFocusNodeId)"
          >
            聚焦
          </button>
          <button
            type="button"
            class="editor-human-review-panel__collapse"
            aria-label="Collapse human review panel"
            @click="$emit('toggle')"
          >
            <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
          </button>
        </div>
      </header>

      <p class="editor-human-review-panel__summary">{{ panelModel.summaryText }}</p>
      <p v-if="resumeGuardMessage" class="editor-human-review-panel__guard">{{ resumeGuardMessage }}</p>

      <div v-if="panelModel.requiredNow.length === 0" class="editor-human-review-panel__empty">
        当前断点后没有需要人工补充的输入。
      </div>

      <section v-else class="editor-human-review-panel__required-section">
        <article
          v-for="row in panelModel.requiredNow"
          :key="row.key"
          class="editor-human-review-panel__state-card editor-human-review-panel__state-card--required"
          :style="{ '--human-review-accent': row.color }"
        >
          <div class="editor-human-review-panel__state-head">
            <span class="editor-human-review-panel__state-dot" aria-hidden="true" />
            <div>
              <div class="editor-human-review-panel__state-label">{{ row.label }}</div>
              <div class="editor-human-review-panel__state-meta">{{ row.key }}</div>
            </div>
            <span v-if="draftFor(row.key).trim().length === 0" class="editor-human-review-panel__required-badge">
              待填写
            </span>
          </div>
          <p v-if="row.description" class="editor-human-review-panel__state-description">{{ row.description }}</p>
          <textarea
            :ref="(element) => setRequiredFieldRef(row.key, element)"
            class="editor-human-review-panel__textarea"
            rows="4"
            :value="draftFor(row.key)"
            @input="updateDraft(row.key, ($event.target as HTMLTextAreaElement).value)"
          />
        </article>
      </section>

      <section class="editor-human-review-panel__other-section">
        <button
          type="button"
          class="editor-human-review-panel__other-toggle"
          :disabled="panelModel.otherRows.length === 0"
          @click="otherRowsExpanded = !otherRowsExpanded"
        >
          其他 state ({{ panelModel.otherRows.length }})
        </button>
        <div v-if="otherRowsExpanded && panelModel.otherRows.length > 0" class="editor-human-review-panel__other-list">
          <article
            v-for="row in panelModel.otherRows"
            :key="row.key"
            class="editor-human-review-panel__state-card"
            :style="{ '--human-review-accent': row.color }"
          >
            <div class="editor-human-review-panel__state-head">
              <span class="editor-human-review-panel__state-dot" aria-hidden="true" />
              <div>
                <div class="editor-human-review-panel__state-label">{{ row.label }}</div>
                <div class="editor-human-review-panel__state-meta">{{ row.key }}</div>
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
      </section>

      <p v-if="error" class="editor-human-review-panel__error">{{ error }}</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ArrowRight } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";

import type { GraphDocument, GraphPayload } from "@/types/node-system";
import type { RunDetail } from "@/types/run";

import {
  buildHumanReviewPanelModel,
  buildHumanReviewResumePayload,
} from "./humanReviewPanelModel.ts";

const props = defineProps<{
  run?: RunDetail | null;
  document: GraphPayload | GraphDocument;
  focusedNodeId?: string | null;
  busy?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (event: "toggle"): void;
  (event: "focus-node", nodeId: string): void;
  (event: "resume", payload: Record<string, unknown>): void;
}>();

const draftsByKey = ref<Record<string, string>>({});
const otherRowsExpanded = ref(false);
const resumeGuardMessage = ref<string | null>(null);
const lastPauseContextKey = ref<string | null>(null);
const requiredFieldRefs = new Map<string, HTMLTextAreaElement>();

const panelModel = computed(() => buildHumanReviewPanelModel(props.run ?? null, props.document));
const currentFocusNodeId = computed(() => props.run?.current_node_id ?? props.focusedNodeId ?? null);
const pauseContextKey = computed(() => {
  const runId = props.run?.run_id ?? "no-run";
  const nodeId = props.run?.current_node_id ?? props.focusedNodeId ?? "no-node";
  const checkpointId = props.run?.checkpoint_metadata?.checkpoint_id ?? "no-checkpoint";
  const pausedAt = props.run?.lifecycle?.paused_at ?? "no-paused-at";
  const threadId = props.run?.checkpoint_metadata?.thread_id ?? "no-thread";
  const checkpointNamespace = props.run?.checkpoint_metadata?.checkpoint_ns ?? "no-checkpoint-ns";
  const resumeCount = String(props.run?.lifecycle?.resume_count ?? "no-resume-count");
  return `${runId}::${nodeId}::${checkpointId}::${pausedAt}::${threadId}::${checkpointNamespace}::${resumeCount}`;
});
const remainingEmptyRequiredDraftCount = computed(
  () => panelModel.value.requiredNow.filter((row) => draftFor(row.key).trim().length === 0).length,
);
const firstBlockingDraftKey = computed(
  () => panelModel.value.requiredNow.find((row) => draftFor(row.key).trim().length === 0)?.key ?? null,
);
const hasBlockingRequiredDraft = computed(() => remainingEmptyRequiredDraftCount.value > 0);

watch(
  [pauseContextKey, () => panelModel.value.allRows] as const,
  ([contextKey, rows]) => {
    const contextChanged = lastPauseContextKey.value !== contextKey;
    const previousDrafts = draftsByKey.value;
    draftsByKey.value = Object.fromEntries(
      rows.map((row) => [row.key, contextChanged ? row.draft : previousDrafts[row.key] ?? row.draft]),
    );
    if (contextChanged) {
      resumeGuardMessage.value = null;
      otherRowsExpanded.value = false;
      lastPauseContextKey.value = contextKey;
    }
  },
  { immediate: true },
);

function draftFor(stateKey: string) {
  return draftsByKey.value[stateKey] ?? "";
}

function updateDraft(stateKey: string, value: string) {
  resumeGuardMessage.value = null;
  draftsByKey.value = {
    ...draftsByKey.value,
    [stateKey]: value,
  };
}

function setRequiredFieldRef(stateKey: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLTextAreaElement) {
    requiredFieldRefs.set(stateKey, element);
    return;
  }
  requiredFieldRefs.delete(stateKey);
}

async function focusFirstBlockingField() {
  const blockingKey = firstBlockingDraftKey.value;
  if (!blockingKey) {
    return;
  }
  await nextTick();
  const field = requiredFieldRefs.get(blockingKey);
  field?.scrollIntoView({ block: "center", behavior: "smooth" });
  field?.focus();
}

function handleResumeClick() {
  if (hasBlockingRequiredDraft.value) {
    resumeGuardMessage.value = `还有 ${remainingEmptyRequiredDraftCount.value} 项需要填写`;
    void focusFirstBlockingField();
    return;
  }
  resumeGuardMessage.value = null;
  emit("resume", buildHumanReviewResumePayload(panelModel.value.allRows, draftsByKey.value));
}
</script>

<style scoped>
.editor-human-review-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 12px;
  background: transparent;
}

.editor-human-review-panel__surface {
  box-sizing: border-box;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--graphite-border);
  border-radius: 28px;
  background: var(--graphite-surface-panel);
  box-shadow: none;
  backdrop-filter: none;
}

.editor-human-review-panel__action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-human-review-panel__action-tools {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.editor-human-review-panel__summary,
.editor-human-review-panel__guard {
  margin: 0;
  padding: 0 4px;
  font-size: 0.84rem;
  line-height: 1.45;
  color: rgba(74, 60, 45, 0.78);
}

.editor-human-review-panel__guard {
  color: #b45309;
}

.editor-human-review-panel__required-section,
.editor-human-review-panel__other-list {
  display: grid;
  gap: 10px;
}

.editor-human-review-panel__other-section {
  display: grid;
  gap: 8px;
}

.editor-human-review-panel__resume {
  min-height: 38px;
  border: 1px solid rgba(217, 119, 6, 0.28);
  border-radius: 999px;
  background: #d97706;
  color: #fff;
  cursor: pointer;
  font-weight: 800;
  padding: 0 16px;
}

.editor-human-review-panel__resume:disabled {
  cursor: wait;
  opacity: 0.72;
}

.editor-human-review-panel__other-toggle,
.editor-human-review-panel__focus {
  min-height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 252, 247, 0.92);
  color: rgba(120, 53, 15, 0.88);
  padding: 0 12px;
  cursor: pointer;
}

.editor-human-review-panel__other-toggle:disabled {
  cursor: default;
  opacity: 0.56;
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

.editor-human-review-panel__state-card {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 22px;
  background: var(--graphite-surface-card);
  padding: 12px;
}

.editor-human-review-panel__state-card--required {
  border-color: rgba(217, 119, 6, 0.22);
  background: rgba(255, 250, 241, 0.94);
}

.editor-human-review-panel__state-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editor-human-review-panel__state-dot {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 999px;
  background: var(--human-review-accent, #d97706);
}

.editor-human-review-panel__state-label {
  color: #1f2933;
  font-weight: 800;
}

.editor-human-review-panel__state-meta {
  color: rgba(154, 52, 18, 0.7);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.editor-human-review-panel__required-badge {
  margin-left: auto;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.18);
  background: rgba(255, 247, 237, 0.92);
  color: rgba(154, 52, 18, 0.9);
  padding: 2px 8px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.editor-human-review-panel__state-description,
.editor-human-review-panel__empty {
  margin: 0;
  color: rgba(74, 60, 45, 0.74);
  font-size: 0.86rem;
  line-height: 1.45;
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
  padding: 0 4px;
}

.editor-human-review-panel__error {
  margin: 0;
  padding: 0 4px;
  color: #b91c1c;
  font-size: 0.82rem;
}
</style>
