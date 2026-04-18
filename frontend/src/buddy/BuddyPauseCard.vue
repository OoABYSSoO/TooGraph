<template>
  <section v-if="run" class="buddy-widget__pause-card">
    <div class="buddy-widget__pause-header">
      <div>
        <strong>{{ t("buddy.pause.title") }}</strong>
        <small v-if="pausedBuddyScopeText">{{ pausedBuddyScopeText }}</small>
      </div>
      <span>{{ t("status.awaitingHuman") }}</span>
    </div>
    <p class="buddy-widget__pause-summary">
      {{ pausedBuddyReviewModel?.summaryText || t("buddy.pause.body") }}
    </p>
    <div class="buddy-widget__pause-mode-tabs" role="tablist" :aria-label="t('buddy.pause.actionLabel')">
      <button
        type="button"
        class="buddy-widget__pause-mode"
        :class="{ 'buddy-widget__pause-mode--active': pausedBuddyActionMode === 'execute' }"
        :disabled="!pausedBuddyCanExecuteAction"
        @click="setPausedBuddyActionMode('execute')"
      >
        {{ t("buddy.pause.executeAction") }}
      </button>
      <button
        v-if="pausedBuddyRequiredRows.length > 0"
        type="button"
        class="buddy-widget__pause-mode"
        :class="{ 'buddy-widget__pause-mode--active': pausedBuddyActionMode === 'supplement' }"
        @click="setPausedBuddyActionMode('supplement')"
      >
        {{ t("buddy.pause.supplementAction") }}
      </button>
    </div>
    <div v-if="pausedBuddyPermissionApproval" class="buddy-widget__pause-section">
      <strong>{{ t("buddy.pause.permissionTitle") }}</strong>
      <div class="buddy-widget__pause-row">
        <span>{{ pausedBuddyPermissionApproval.skillName }}</span>
        <small>{{ pausedBuddyPermissionApproval.skillKey }}</small>
        <div class="buddy-widget__pause-permissions">
          <span v-for="permission in pausedBuddyPermissionApproval.permissions" :key="permission">
            {{ permission }}
          </span>
        </div>
        <small v-if="pausedBuddyPermissionApproval.reason">{{ pausedBuddyPermissionApproval.reason }}</small>
        <template v-if="pausedBuddyPermissionApproval.inputPreview">
          <small>{{ t("buddy.pause.permissionInputs") }}</small>
          <pre>{{ pausedBuddyPermissionApproval.inputPreview }}</pre>
        </template>
      </div>
    </div>
    <div v-if="pausedBuddyProducedRows.length > 0" class="buddy-widget__pause-section">
      <strong>{{ t("buddy.pause.producedTitle") }}</strong>
      <div v-for="row in pausedBuddyProducedRows" :key="row.key" class="buddy-widget__pause-row">
        <span>{{ row.label }}</span>
        <small v-if="row.description">{{ row.description }}</small>
        <pre>{{ row.draft || t("buddy.pause.emptyValue") }}</pre>
      </div>
    </div>
    <div v-if="pausedBuddyRequiredRows.length > 0" class="buddy-widget__pause-section">
      <strong>{{ t("buddy.pause.requiredTitle") }}</strong>
      <div v-for="row in pausedBuddyRequiredRows" :key="row.key" class="buddy-widget__pause-row">
        <span>{{ row.label }}</span>
        <small v-if="row.description">{{ row.description }}</small>
        <small>{{ resolvePausedBuddyDraft(row).trim() ? t("buddy.pause.filled") : t("buddy.pause.emptyValue") }}</small>
        <pre v-if="resolvePausedBuddyDraft(row).trim()">{{ resolvePausedBuddyDraft(row) }}</pre>
      </div>
      <div v-if="pausedBuddyActionMode === 'supplement'" class="buddy-widget__pause-editor">
        <ElSelect
          class="buddy-widget__pause-target toograph-select"
          popper-class="toograph-select-popper buddy-widget__select-popper"
          v-if="pausedBuddyRequiredRows.length > 1"
          :model-value="pausedBuddyTargetKey"
          size="small"
          :aria-label="t('buddy.pause.targetLabel')"
          @update:model-value="setPausedBuddyTargetKey"
        >
          <ElOption
            v-for="row in pausedBuddyRequiredRows"
            :key="row.key"
            :label="row.label"
            :value="row.key"
          />
        </ElSelect>
        <ElInput
          :model-value="pausedBuddyInputText"
          class="buddy-widget__pause-input"
          type="textarea"
          :placeholder="pausedBuddySelectedRequiredRow?.label || t('buddy.pause.supplementAction')"
          :autosize="{ minRows: 2, maxRows: 5 }"
          @update:model-value="setPausedBuddyInputText"
        />
      </div>
    </div>
    <p
      v-if="!pausedBuddyPermissionApproval && pausedBuddyRequiredRows.length === 0 && pausedBuddyProducedRows.length === 0"
      class="buddy-widget__pause-summary"
    >
      {{ t("buddy.pause.empty") }}
    </p>
    <div class="buddy-widget__pause-actions">
      <ElButton
        size="small"
        type="danger"
        plain
        :loading="busy"
        @click="emit('cancel')"
      >
        {{ t("buddy.pause.cancelRun") }}
      </ElButton>
      <ElButton
        v-if="pausedBuddyPermissionApproval"
        size="small"
        type="danger"
        plain
        :loading="busy"
        @click="denyPausedBuddyPermissionApproval"
      >
        {{ t("buddy.pause.denyPermission") }}
      </ElButton>
      <ElButton
        size="small"
        type="primary"
        :loading="busy"
        :disabled="isPausedBuddyResumeBlocked"
        @click="emit('resume', buildBuddyPauseResumePayload())"
      >
        {{ t("buddy.pause.continue") }}
      </ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElButton, ElInput, ElOption, ElSelect } from "element-plus";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import {
  buildHumanReviewPanelModel,
  buildHumanReviewResumePayload,
  type HumanReviewPanelModel,
  type HumanReviewRow,
} from "../editor/workspace/humanReviewPanelModel.ts";
import type { GraphPayload } from "../types/node-system.ts";
import type { RunDetail } from "../types/run.ts";

import { resolveInitialBuddyPauseActionMode, type BuddyPauseActionMode } from "./buddyPauseQueuePolicy.ts";

const props = withDefaults(defineProps<{
  run: RunDetail | null;
  busy?: boolean;
}>(), {
  busy: false,
});

const emit = defineEmits<{
  resume: [payload: Record<string, unknown>];
  cancel: [];
}>();

const { t } = useI18n();
const pausedBuddyDraftsByKey = ref<Record<string, string>>({});
const pausedBuddyActionMode = ref<BuddyPauseActionMode>("execute");
const pausedBuddyTargetKey = ref("");
const pausedBuddyInputText = ref("");

const pausedBuddyReviewModel = computed<HumanReviewPanelModel | null>(() => {
  if (!props.run) {
    return null;
  }
  return buildHumanReviewPanelModel(props.run, props.run.graph_snapshot as unknown as GraphPayload);
});
const pausedBuddyRequiredRows = computed(() => pausedBuddyReviewModel.value?.requiredNow ?? []);
const pausedBuddyProducedRows = computed(() => pausedBuddyReviewModel.value?.producedRows ?? []);
const pausedBuddyPermissionApproval = computed(() => pausedBuddyReviewModel.value?.permissionApproval ?? null);
const pausedBuddyScopeText = computed(() => pausedBuddyReviewModel.value?.scopePath.join(" / ") ?? "");
const pausedBuddySelectedRequiredRow = computed(
  () =>
    pausedBuddyRequiredRows.value.find((row) => row.key === pausedBuddyTargetKey.value) ??
    pausedBuddyRequiredRows.value[0] ??
    null,
);
const pausedBuddyHasMissingRequiredInput = computed(() =>
  pausedBuddyRequiredRows.value.some((row) => !resolvePausedBuddyDraft(row).trim()),
);
const pausedBuddyCanExecuteAction = computed(() => !pausedBuddyHasMissingRequiredInput.value);
const isPausedBuddyResumeBlocked = computed(() => pausedBuddyHasMissingRequiredInput.value);
const pauseContextKey = computed(() => {
  const run = props.run;
  if (!run) {
    return "";
  }
  return [
    run.run_id,
    run.current_node_id ?? "",
    run.checkpoint_metadata?.checkpoint_id ?? "",
    run.checkpoint_metadata?.thread_id ?? "",
    run.lifecycle?.paused_at ?? "",
    run.lifecycle?.resume_count ?? 0,
  ].join("::");
});

watch(
  [pauseContextKey, pausedBuddyReviewModel],
  () => {
    resetPausedBuddyActionState(pausedBuddyReviewModel.value);
  },
  { immediate: true },
);

function buildPausedBuddyDraftsByKey(model: HumanReviewPanelModel | null) {
  if (!model) {
    return {};
  }
  return Object.fromEntries(model.allRows.map((row) => [row.key, row.draft]));
}

function resolvePausedBuddyDraft(row: HumanReviewRow) {
  return pausedBuddyDraftsByKey.value[row.key] ?? row.draft;
}

function setPausedBuddyDraft(key: string, value: string | number) {
  pausedBuddyDraftsByKey.value = {
    ...pausedBuddyDraftsByKey.value,
    [key]: String(value ?? ""),
  };
}

function resetPausedBuddyActionState(model: HumanReviewPanelModel | null) {
  pausedBuddyDraftsByKey.value = buildPausedBuddyDraftsByKey(model);
  const firstRequired = model?.requiredNow[0] ?? null;
  pausedBuddyActionMode.value = resolveInitialBuddyPauseActionMode(model?.requiredNow.length ?? 0);
  pausedBuddyTargetKey.value = firstRequired?.key ?? "";
  pausedBuddyInputText.value = firstRequired ? resolvePausedBuddyDraft(firstRequired) : "";
}

function denyPausedBuddyPermissionApproval() {
  const approval = pausedBuddyPermissionApproval.value;
  if (!approval || props.busy) {
    return;
  }
  emit("resume", {
    permission_approval: {
      decision: "denied",
      reason: t("buddy.pause.deniedReason", {
        skill: approval.skillName || approval.skillKey,
      }),
    },
  });
}

function setPausedBuddyActionMode(mode: BuddyPauseActionMode) {
  pausedBuddyActionMode.value = mode;
  if (mode === "supplement" && !pausedBuddyTargetKey.value) {
    const firstRequired = pausedBuddyRequiredRows.value[0] ?? null;
    if (firstRequired) {
      setPausedBuddyTargetKey(firstRequired.key);
    }
  }
}

function setPausedBuddyTargetKey(key: string | number | boolean) {
  const normalizedKey = String(key ?? "");
  pausedBuddyTargetKey.value = normalizedKey;
  const row = pausedBuddyRequiredRows.value.find((candidate) => candidate.key === normalizedKey);
  pausedBuddyInputText.value = row ? resolvePausedBuddyDraft(row) : "";
}

function setPausedBuddyInputText(value: string | number) {
  const text = String(value ?? "");
  pausedBuddyInputText.value = text;
  if (pausedBuddyTargetKey.value) {
    setPausedBuddyDraft(pausedBuddyTargetKey.value, text);
  }
}

function buildBuddyPauseResumePayload() {
  const model = pausedBuddyReviewModel.value;
  if (!model) {
    return {};
  }
  return buildHumanReviewResumePayload(model.allRows, pausedBuddyDraftsByKey.value);
}
</script>

<style scoped>
.buddy-widget__pause-card {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(217, 119, 6, 0.22);
  border-radius: 8px;
  background: rgba(255, 251, 235, 0.94);
  padding: 14px;
}

.buddy-widget__pause-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.buddy-widget__pause-header div,
.buddy-widget__pause-section,
.buddy-widget__pause-row {
  display: grid;
  gap: 5px;
}

.buddy-widget__pause-header strong,
.buddy-widget__pause-section > strong,
.buddy-widget__pause-row > span {
  color: #7c2d12;
  font-size: 0.86rem;
  font-weight: 800;
}

.buddy-widget__pause-header small,
.buddy-widget__pause-row small {
  color: #92400e;
  font-size: 0.72rem;
}

.buddy-widget__pause-header > span {
  align-self: start;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 800;
}

.buddy-widget__pause-summary {
  margin: 0;
  color: #78350f;
  font-size: 0.78rem;
  line-height: 1.5;
}

.buddy-widget__pause-mode-tabs {
  display: flex;
  gap: 6px;
}

.buddy-widget__pause-mode {
  border: 1px solid rgba(217, 119, 6, 0.22);
  border-radius: 999px;
  background: #fff7ed;
  color: #92400e;
  padding: 5px 10px;
  font-size: 0.74rem;
  font-weight: 800;
  cursor: pointer;
}

.buddy-widget__pause-mode:hover:not(:disabled),
.buddy-widget__pause-mode:focus-visible {
  border-color: rgba(217, 119, 6, 0.42);
  outline: none;
}

.buddy-widget__pause-mode--active {
  background: #9a3412;
  border-color: #9a3412;
  color: #fff7ed;
}

.buddy-widget__pause-mode:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.buddy-widget__pause-section {
  border-top: 1px solid rgba(217, 119, 6, 0.14);
  padding-top: 10px;
}

.buddy-widget__pause-row {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  padding: 9px;
}

.buddy-widget__pause-row pre {
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: #451a03;
  font: 0.74rem/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.buddy-widget__pause-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.buddy-widget__pause-permissions span {
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.11);
  color: #991b1b;
  padding: 2px 7px;
  font-size: 0.68rem;
  font-weight: 800;
}

.buddy-widget__pause-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.buddy-widget__pause-editor {
  display: grid;
  gap: 8px;
  border-top: 1px solid rgba(217, 119, 6, 0.14);
  margin-top: 8px;
  padding-top: 10px;
}

.buddy-widget__pause-target {
  width: min(100%, 220px);
}

.buddy-widget__pause-input :deep(.el-textarea__inner) {
  border-color: rgba(217, 119, 6, 0.28);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: #451a03;
  font-size: 0.78rem;
  line-height: 1.45;
}

.buddy-widget__pause-input :deep(.el-textarea__inner:focus) {
  border-color: #d97706;
  box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.18);
}
</style>
