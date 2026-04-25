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
          <ElIcon class="editor-human-review-panel__resume-icon" aria-hidden="true"><VideoPlay /></ElIcon>
          <span>{{ busy ? t("humanReview.continuing") : t("humanReview.continueRun") }}</span>
        </button>
        <div class="editor-human-review-panel__action-tools">
          <button
            v-if="currentFocusNodeId"
            type="button"
            class="editor-human-review-panel__focus"
            @click="$emit('focus-node', currentFocusNodeId)"
          >
            <ElIcon class="editor-human-review-panel__focus-icon" aria-hidden="true"><Coordinate /></ElIcon>
            <span>{{ t("common.focus") }}</span>
          </button>
          <button
            v-if="!isPausedReview"
            type="button"
            class="editor-human-review-panel__collapse"
            :aria-label="t('humanReview.collapse')"
            @click="$emit('toggle')"
          >
            <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
          </button>
        </div>
      </header>

      <p class="editor-human-review-panel__summary">{{ panelModel.summaryText }}</p>
      <p v-if="resumeGuardMessage" class="editor-human-review-panel__guard">{{ resumeGuardMessage }}</p>

      <div v-if="panelModel.requiredNow.length === 0" class="editor-human-review-panel__empty">
        {{ t("humanReview.empty") }}
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
              {{ t("common.required") }}
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
          {{ t("common.otherState", { count: panelModel.otherRows.length }) }}
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
import { ArrowRight, Coordinate, VideoPlay } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue";
import { useI18n } from "vue-i18n";

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
const { t, locale } = useI18n();

const panelModel = computed(() => {
  locale.value;
  return buildHumanReviewPanelModel(props.run ?? null, props.document);
});
const isPausedReview = computed(() => props.run?.status === "awaiting_human");
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
    resumeGuardMessage.value = t("humanReview.guard", { count: remainingEmptyRequiredDraftCount.value });
    void focusFirstBlockingField();
    return;
  }
  resumeGuardMessage.value = null;
  emit("resume", buildHumanReviewResumePayload(panelModel.value.allRows, draftsByKey.value));
}
</script>

<style scoped>
.editor-human-review-panel {
  box-sizing: border-box;
  width: 100%;
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
  border: 1px solid var(--graphite-glass-border);
  border-radius: 28px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(34px) saturate(1.7) contrast(1.02);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 38px;
  border: 1px solid rgba(126, 46, 11, 0.34);
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  cursor: pointer;
  font-weight: 800;
  padding: 0 17px 0 15px;
  box-shadow: 0 10px 22px rgba(126, 46, 11, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  white-space: nowrap;
}

.editor-human-review-panel__resume-icon {
  font-size: 0.94rem;
}

.editor-human-review-panel__resume:not(:disabled):hover {
  border-color: rgba(120, 53, 15, 0.46);
  background: rgba(131, 43, 13, 0.95);
  box-shadow: 0 12px 24px rgba(126, 46, 11, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.26);
  transform: translateY(-1px);
}

.editor-human-review-panel__resume:disabled {
  cursor: wait;
  opacity: 0.72;
}

.editor-human-review-panel__resume:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.32), 0 10px 22px rgba(126, 46, 11, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.editor-human-review-panel__focus {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  border-radius: 999px;
  background: rgba(255, 250, 242, 0.68);
  color: rgba(120, 53, 15, 0.88);
  padding: 0 11px 0 10px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.34);
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  white-space: nowrap;
}

.editor-human-review-panel__focus-icon {
  font-size: 0.9rem;
}

.editor-human-review-panel__focus:hover {
  border-color: rgba(154, 52, 18, 0.26);
  background: rgba(255, 245, 232, 0.88);
  box-shadow: 0 8px 18px rgba(126, 46, 11, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
}

.editor-human-review-panel__focus:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.34);
}

.editor-human-review-panel__other-toggle {
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
