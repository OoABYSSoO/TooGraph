<template>
  <AppShell>
    <section class="buddy-page">
      <header class="buddy-page__hero">
        <div>
          <div class="buddy-page__eyebrow">{{ t("buddyPage.eyebrow") }}</div>
          <h2 class="buddy-page__title">{{ t("buddyPage.title") }}</h2>
          <p class="buddy-page__body">{{ t("buddyPage.body") }}</p>
        </div>
        <ElButton class="buddy-page__refresh" :loading="isLoading" @click="loadAll()">
          <ElIcon><Refresh /></ElIcon>
          <span>{{ t("buddyPage.refresh") }}</span>
        </ElButton>
      </header>

      <ElAlert
        v-if="errorMessage"
        class="buddy-page__alert"
        type="error"
        show-icon
        :closable="false"
        :title="t('common.failedToLoad', { error: errorMessage })"
      />
      <div v-if="lastCommand" class="buddy-page__command-status" role="status">
        <ElTag type="success" effect="plain">{{ t("common.status") }}: {{ lastCommand.status }}</ElTag>
        <span>Command {{ lastCommand.command_id }}</span>
        <span v-if="lastCommand.revision_id">{{ t("common.revision") }} {{ lastCommand.revision_id }}</span>
        <span v-if="lastCommand.run_id">Run {{ lastCommand.run_id }}</span>
      </div>

      <div v-if="isLoading && !hasLoaded" class="buddy-page__empty">{{ t("buddyPage.loading") }}</div>
      <ElTabs v-else v-model="activeTab" class="buddy-page__tabs">
        <ElTabPane :label="t('buddyPage.tabs.binding')" name="binding">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.binding.title") }}</h3>
                <p>{{ t("buddyPage.binding.body") }}</p>
              </div>
            </div>
            <ElForm label-position="top" class="buddy-page__form buddy-page__form--wide">
              <ElFormItem :label="t('buddyPage.binding.template')">
                <ElSelect
                  v-model="bindingDraft.template_id"
                  :loading="isLoadingBindingTemplate"
                  filterable
                  @change="selectBindingTemplate"
                >
                  <ElOption
                    v-for="option in bindingTemplateOptions"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </ElSelect>
              </ElFormItem>
              <ElAlert
                v-if="!bindingValidation.valid"
                type="warning"
                show-icon
                :closable="false"
                :title="bindingValidation.issues.join(' ')"
              />
              <ElTable :data="bindingSourceRows" class="buddy-page__table buddy-page__binding-table" empty-text=" ">
                <ElTableColumn :label="t('buddyPage.binding.buddyInput')" min-width="210">
                  <template #default="{ row }">
                    <div class="buddy-page__binding-source">
                      <span class="buddy-page__binding-source-label">{{ t(row.labelKey) }}</span>
                      <ElTag size="small" :type="row.required ? 'danger' : 'info'" effect="plain">
                        {{ row.required ? t("buddyPage.binding.required") : t("buddyPage.binding.optional") }}
                      </ElTag>
                    </div>
                  </template>
                </ElTableColumn>
                <ElTableColumn :label="t('buddyPage.binding.inputNode')" min-width="310">
                  <template #default="{ row }">
                    <ElSelect
                      :model-value="row.selectedNodeId"
                      :placeholder="t('buddyPage.binding.selectInputNode')"
                      :clearable="!row.required"
                      :disabled="!selectedBindingTemplate"
                      filterable
                      @update:model-value="setBindingInputNode(row.source, $event)"
                    >
                      <ElOption
                        v-if="!row.required"
                        :label="t('buddyPage.binding.sources.none')"
                        value=""
                      />
                      <ElOption
                        v-for="option in bindingInputNodeOptionsForSource(row.source)"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                        :disabled="option.disabled"
                      />
                    </ElSelect>
                  </template>
                </ElTableColumn>
                <ElTableColumn :label="t('buddyPage.binding.selectedState')" min-width="260">
                  <template #default="{ row }">
                    <div v-if="selectedBindingInputRow(row.selectedNodeId)" class="buddy-page__binding-state">
                      <span>{{ selectedBindingInputRow(row.selectedNodeId)?.stateName || t("common.state") }}</span>
                      <small>{{ selectedBindingInputRow(row.selectedNodeId)?.stateKey }}</small>
                    </div>
                    <span v-else class="buddy-page__meta">{{ t("buddyPage.binding.noInputNode") }}</span>
                  </template>
                </ElTableColumn>
              </ElTable>
              <div class="buddy-page__actions">
                <ElButton
                  type="primary"
                  :loading="isSavingBinding"
                  :disabled="!bindingValidation.valid"
                  @click="saveBinding"
                >
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("buddyPage.binding.save") }}</span>
                </ElButton>
                <ElButton :disabled="isSavingBinding" @click="resetBindingToDefault">
                  {{ t("buddyPage.binding.resetDefault") }}
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.profile')" name="profile">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.profile.title") }}</h3>
                <p>{{ t("buddyPage.profile.body") }}</p>
              </div>
            </div>
            <ElForm label-position="top" class="buddy-page__form">
              <ElFormItem :label="t('buddyPage.profile.name')">
                <ElInput v-model="profileDraft.name" />
              </ElFormItem>
              <ElFormItem :label="t('buddyPage.profile.persona')">
                <ElInput v-model="profileDraft.persona" type="textarea" :rows="4" />
              </ElFormItem>
              <ElFormItem :label="t('buddyPage.profile.tone')">
                <ElInput v-model="profileDraft.tone" />
              </ElFormItem>
              <ElFormItem :label="t('buddyPage.profile.responseStyle')">
                <ElInput v-model="profileDraft.response_style" type="textarea" :rows="3" />
              </ElFormItem>
              <div class="buddy-page__actions">
                <ElButton type="primary" :loading="isSavingProfile" @click="saveProfile">
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("buddyPage.saveProfile") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.policy')" name="policy">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.policy.title") }}</h3>
                <p>{{ t("buddyPage.policy.body") }}</p>
              </div>
            </div>
            <ElForm label-position="top" class="buddy-page__form">
              <ElFormItem :label="t('buddyPage.policy.permissionMode')">
                <ElSegmented v-model="policyDraft.graph_permission_mode" :options="permissionModeOptions" />
              </ElFormItem>
              <ElFormItem :label="t('buddyPage.policy.boundaries')">
                <ElInput v-model="policyBoundaryText" type="textarea" :rows="6" />
              </ElFormItem>
              <ElFormItem :label="t('buddyPage.policy.preferences')">
                <ElInput v-model="policyPreferenceText" type="textarea" :rows="5" />
              </ElFormItem>
              <div class="buddy-page__actions">
                <ElButton type="primary" :loading="isSavingPolicy" @click="savePolicy">
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("buddyPage.savePolicy") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.memory')" name="memory">
          <section class="buddy-page__split">
            <article class="buddy-page__panel buddy-page__panel--memory-form">
              <div class="buddy-page__panel-heading">
                <div>
                  <h3>{{ editingMemoryId ? t("buddyPage.memory.editTitle") : t("buddyPage.memory.newTitle") }}</h3>
                  <p>{{ t("buddyPage.memory.body") }}</p>
                </div>
                <ElButton v-if="editingMemoryId" @click="startNewMemory">
                  <ElIcon><Plus /></ElIcon>
                  <span>{{ t("buddyPage.memory.new") }}</span>
                </ElButton>
              </div>
              <ElForm label-position="top" class="buddy-page__form">
                <ElFormItem :label="t('buddyPage.memory.type')">
                  <ElInput v-model="memoryDraft.type" />
                </ElFormItem>
                <ElFormItem :label="t('buddyPage.memory.title')">
                  <ElInput v-model="memoryDraft.title" />
                </ElFormItem>
                <ElFormItem :label="t('buddyPage.memory.content')">
                  <ElInput v-model="memoryDraft.content" type="textarea" :rows="7" />
                </ElFormItem>
                <div class="buddy-page__actions">
                  <ElButton type="primary" :loading="isSavingMemory" :disabled="!canSaveMemory" @click="saveMemoryDraft">
                    <ElIcon><Check /></ElIcon>
                    <span>{{ editingMemoryId ? t("buddyPage.memory.update") : t("buddyPage.memory.create") }}</span>
                  </ElButton>
                  <ElButton :disabled="isSavingMemory" @click="startNewMemory">{{ t("common.cancel") }}</ElButton>
                </div>
              </ElForm>
            </article>

            <article class="buddy-page__panel buddy-page__panel--memory-list">
              <div class="buddy-page__panel-heading">
                <div>
                  <h3>{{ t("buddyPage.memory.listTitle") }}</h3>
                  <p>{{ t("buddyPage.memory.listBody", { count: memories.length }) }}</p>
                </div>
              </div>
              <ElTable :data="memories" class="buddy-page__table" empty-text=" ">
                <ElTableColumn prop="type" :label="t('buddyPage.memory.type')" width="120" />
                <ElTableColumn prop="title" :label="t('buddyPage.memory.title')" min-width="160" />
                <ElTableColumn prop="content" :label="t('buddyPage.memory.content')" min-width="260" show-overflow-tooltip />
                <ElTableColumn :label="t('buddyPage.memory.actions')" width="190" fixed="right">
                  <template #default="{ row }">
                    <div class="buddy-page__table-actions">
                      <ElButton size="small" @click="openMemoryEditor(row)">
                        <ElIcon><EditPen /></ElIcon>
                        <span>{{ t("buddyPage.memory.edit") }}</span>
                      </ElButton>
                      <ElButton size="small" type="danger" :loading="memoryActionId === row.id" @click="removeMemory(row.id)">
                        <ElIcon><Delete /></ElIcon>
                        <span>{{ t("common.delete") }}</span>
                      </ElButton>
                    </div>
                  </template>
                </ElTableColumn>
              </ElTable>
              <ElEmpty v-if="memories.length === 0" :description="t('buddyPage.memory.empty')" />
            </article>
          </section>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.summary')" name="summary">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.summary.title") }}</h3>
                <p>{{ t("buddyPage.summary.body") }}</p>
              </div>
              <span class="buddy-page__meta">{{ t("buddyPage.summary.updatedAt", { value: formatDate(summaryDraft.updated_at) }) }}</span>
            </div>
            <ElForm label-position="top" class="buddy-page__form">
              <ElFormItem :label="t('buddyPage.summary.content')">
                <ElInput v-model="summaryDraft.content" type="textarea" :rows="10" />
              </ElFormItem>
              <div class="buddy-page__actions">
                <ElButton type="primary" :loading="isSavingSummary" @click="saveSummary">
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("buddyPage.saveSummary") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.confirmation')" name="confirmation">
          <section class="buddy-page__split buddy-page__split--confirmations">
            <article class="buddy-page__panel buddy-page__panel--paused-list">
              <div class="buddy-page__panel-heading">
                <div>
                  <h3>{{ t("buddyPage.pausedRuns.title") }}</h3>
                  <p>{{ t("buddyPage.pausedRuns.body") }}</p>
                </div>
                <ElButton :loading="isLoadingPausedRuns" @click="loadPausedRuns()">
                  <ElIcon><Refresh /></ElIcon>
                  <span>{{ t("buddyPage.pausedRuns.refresh") }}</span>
                </ElButton>
              </div>
              <ElTable :data="pausedRunSummaries" class="buddy-page__table" empty-text=" ">
                <ElTableColumn prop="graph_name" :label="t('common.run')" min-width="180" show-overflow-tooltip />
                <ElTableColumn :label="t('common.startedAt')" width="180">
                  <template #default="{ row }">{{ formatDate(row.started_at) }}</template>
                </ElTableColumn>
                <ElTableColumn :label="t('buddyPage.memory.actions')" width="120" fixed="right">
                  <template #default="{ row }">
                    <ElButton
                      size="small"
                      :loading="selectedPausedRunId === row.run_id && isLoadingPausedRunDetail"
                      @click="selectPausedRun(row.run_id)"
                    >
                      {{ t("buddyPage.pausedRuns.select") }}
                    </ElButton>
                  </template>
                </ElTableColumn>
              </ElTable>
              <ElEmpty v-if="pausedRunSummaries.length === 0" :description="t('buddyPage.pausedRuns.empty')" />
            </article>

            <article class="buddy-page__panel buddy-page__panel--paused-detail">
              <div class="buddy-page__panel-heading">
                <div>
                  <h3>{{ t("buddyPage.pausedRuns.selectedTitle") }}</h3>
                  <p>{{ selectedPausedRunDetail?.graph_name || t("buddyPage.pausedRuns.selectedEmpty") }}</p>
                </div>
              </div>
              <BuddyPauseCard
                :run="selectedPausedRunDetail"
                :busy="pausedRunActionBusy"
                @resume="resumeSelectedPausedRun"
                @cancel="cancelSelectedPausedRun"
              />
              <ElEmpty
                v-if="!selectedPausedRunDetail"
                :description="t('buddyPage.pausedRuns.selectedEmpty')"
              />
            </article>
          </section>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.history')" name="history">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.history.title") }}</h3>
                <p>{{ t("buddyPage.history.body") }}</p>
              </div>
            </div>
            <div class="buddy-page__history-toolbar">
              <span class="buddy-page__filter-label">{{ t("buddyPage.history.targetFilter") }}</span>
              <ElSegmented
                v-model="historyTargetFilter"
                class="buddy-page__history-filter"
                :options="historyTargetOptions"
              />
              <span class="buddy-page__meta">
                {{ t("buddyPage.history.showingCount", { count: filteredRevisionRows.length, total: orderedRevisionRows.length }) }}
              </span>
            </div>
            <ElTable :data="filteredRevisionRows" class="buddy-page__table" empty-text=" ">
              <ElTableColumn type="expand" width="44">
                <template #default="{ row }">
                  <div class="buddy-page__history-diff">
                    <div v-if="row.diffEntries.length" class="buddy-page__history-diff-list">
                      <article v-for="entry in row.diffEntries" :key="entry.field" class="buddy-page__history-diff-entry">
                        <div class="buddy-page__history-diff-field">
                          <ElTag size="small" :type="historyDiffTagType(entry.changeKind)" effect="plain">
                            {{ historyDiffKindLabel(entry.changeKind) }}
                          </ElTag>
                          <span>{{ entry.field }}</span>
                        </div>
                        <div class="buddy-page__history-diff-values">
                          <section>
                            <span>{{ t("buddyPage.history.before") }}</span>
                            <pre>{{ entry.previousValueText || t("common.none") }}</pre>
                          </section>
                          <section>
                            <span>{{ t("buddyPage.history.after") }}</span>
                            <pre>{{ entry.nextValueText || t("common.none") }}</pre>
                          </section>
                        </div>
                      </article>
                    </div>
                    <p v-else class="buddy-page__history-no-diff">{{ t("buddyPage.history.noDiff") }}</p>
                    <details class="buddy-page__history-raw-diff">
                      <summary>{{ t("buddyPage.history.rawComparison") }}</summary>
                      <div class="buddy-page__history-raw-grid">
                        <section>
                          <span>{{ t("buddyPage.history.before") }}</span>
                          <pre>{{ row.previousValueText || t("common.none") }}</pre>
                        </section>
                        <section>
                          <span>{{ t("buddyPage.history.after") }}</span>
                          <pre>{{ row.nextValueText || t("common.none") }}</pre>
                        </section>
                      </div>
                    </details>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="target_type" :label="t('buddyPage.history.target')" width="150" />
              <ElTableColumn prop="operation" :label="t('buddyPage.history.operation')" width="130" />
              <ElTableColumn :label="t('buddyPage.history.source')" min-width="220">
                <template #default="{ row }">
                  <div class="buddy-page__history-source">
                    <span>{{ row.sourceLabel }}</span>
                    <small v-if="row.sourceAction">{{ row.sourceAction }}</small>
                  </div>
                </template>
              </ElTableColumn>
              <ElTableColumn prop="change_reason" :label="t('buddyPage.history.reason')" min-width="260" show-overflow-tooltip />
              <ElTableColumn :label="t('buddyPage.history.createdAt')" width="190">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </ElTableColumn>
              <ElTableColumn :label="t('buddyPage.history.actions')" width="140" fixed="right">
                <template #default="{ row }">
                  <ElButton size="small" :loading="restoreActionId === row.revision_id" @click="restoreRevision(row.revision_id)">
                    <ElIcon><RefreshLeft /></ElIcon>
                    <span>{{ t("buddyPage.history.restore") }}</span>
                  </ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
            <ElEmpty
              v-if="filteredRevisionRows.length === 0"
              :description="orderedRevisionRows.length === 0 ? t('buddyPage.history.empty') : t('buddyPage.history.filteredEmpty')"
            />
          </article>
        </ElTabPane>

        <ElTabPane :label="t('buddyPage.tabs.mascotDebug')" name="mascot-debug">
          <article class="buddy-page__panel buddy-page__panel--mascot-debug">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.mascotDebug.title") }}</h3>
              </div>
            </div>
            <div class="buddy-page__debug-grid">
              <section v-for="group in BUDDY_DEBUG_ACTION_GROUPS" :key="group.labelKey" class="buddy-page__debug-group">
                <span class="buddy-page__debug-label">{{ t(group.labelKey) }}</span>
                <div class="buddy-page__debug-actions">
                  <ElButton
                    v-for="action in group.actions"
                    :key="action.action"
                    class="buddy-page__debug-button"
                    @click="buddyMascotDebugStore.trigger(action.action)"
                  >
                    {{ action.label }}
                  </ElButton>
                </div>
              </section>
            </div>
          </article>
        </ElTabPane>
      </ElTabs>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSegmented,
  ElSelect,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
} from "element-plus";
import { Check, Delete, EditPen, Plus, Refresh, RefreshLeft } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import { BUDDY_DEBUG_ACTION_GROUPS } from "@/buddy/buddyMascotDebug";
import {
  fetchBuddyCommands,
  createBuddyMemory,
  deleteBuddyMemory,
  fetchBuddyMemories,
  fetchBuddyPolicy,
  fetchBuddyProfile,
  fetchBuddyRevisions,
  fetchBuddyRunTemplateBinding,
  fetchBuddySessionSummary,
  restoreBuddyRevision,
  updateBuddyMemory,
  updateBuddyPolicy,
  updateBuddyProfile,
  updateBuddyRunTemplateBinding,
  updateBuddySessionSummary,
} from "@/api/buddy";
import { fetchTemplate, fetchTemplates } from "@/api/graphs";
import { cancelRun, fetchRun, fetchRuns, resumeRun } from "@/api/runs";
import BuddyPauseCard from "@/buddy/BuddyPauseCard.vue";
import {
  buildBuddyRunInputNodeOptions,
  buildBuddyRunTemplateInputRows,
  buildBuddyRunTemplateSourceRows,
  buildDefaultBuddyRunTemplateBinding,
  setBuddyRunTemplateSourceBinding,
  validateBuddyRunTemplateBinding,
} from "@/buddy/buddyTemplateBindingModel";
import AppShell from "@/layouts/AppShell.vue";
import { useBuddyContextStore } from "@/stores/buddyContext";
import { useBuddyMascotDebugStore } from "@/stores/buddyMascotDebug";
import type {
  BuddyCommandRecord,
  BuddyCommandResponse,
  BuddyMemory,
  BuddyPolicy,
  BuddyProfile,
  BuddyRevision,
  BuddyRunInputSource,
  BuddyRunTemplateBinding,
  BuddySessionSummary,
} from "@/types/buddy";
import type { BuddyRunTemplateInputRow } from "@/buddy/buddyTemplateBindingModel";
import type { TemplateRecord } from "@/types/node-system";
import type { RunDetail, RunSummary } from "@/types/run";

import {
  BUDDY_REVISION_HISTORY_TARGET_FILTERS,
  buildBuddyRevisionHistoryRows,
  filterBuddyRevisionHistoryRows,
  type BuddyRevisionDiffChangeKind,
  type BuddyRevisionHistoryTargetFilter,
} from "./buddyRevisionHistoryModel.ts";

type MemoryDraft = Pick<BuddyMemory, "type" | "title" | "content">;
type LoadAllOptions = {
  silent?: boolean;
};

const { t } = useI18n();
const buddyContextStore = useBuddyContextStore();
const buddyMascotDebugStore = useBuddyMascotDebugStore();
const activeTab = ref("binding");
const historyTargetFilter = ref<BuddyRevisionHistoryTargetFilter>("all");
const hasLoaded = ref(false);
const isLoading = ref(false);
const isSavingProfile = ref(false);
const isSavingPolicy = ref(false);
const isSavingMemory = ref(false);
const isSavingSummary = ref(false);
const isSavingBinding = ref(false);
const isLoadingPausedRuns = ref(false);
const isLoadingPausedRunDetail = ref(false);
const isLoadingBindingTemplate = ref(false);
const pausedRunActionBusy = ref(false);
const memoryActionId = ref("");
const restoreActionId = ref("");
const errorMessage = ref("");

const profileDraft = ref<BuddyProfile>(defaultProfileDraft());
const policyDraft = ref<BuddyPolicy>(defaultPolicyDraft());
const memories = ref<BuddyMemory[]>([]);
const memoryDraft = ref<MemoryDraft>(defaultMemoryDraft());
const editingMemoryId = ref("");
const summaryDraft = ref<BuddySessionSummary>(defaultSummaryDraft());
const availableTemplates = ref<TemplateRecord[]>([]);
const selectedBindingTemplate = ref<TemplateRecord | null>(null);
const bindingDraft = ref<BuddyRunTemplateBinding>(buildDefaultBuddyRunTemplateBinding());
const revisions = ref<BuddyRevision[]>([]);
const commands = ref<BuddyCommandRecord[]>([]);
const lastCommand = ref<BuddyCommandRecord | null>(null);
const pausedRunSummaries = ref<RunSummary[]>([]);
const selectedPausedRunId = ref("");
const selectedPausedRunDetail = ref<RunDetail | null>(null);

const policyBoundaryText = computed({
  get: () => listToText(policyDraft.value.behavior_boundaries),
  set: (value: string) => {
    policyDraft.value.behavior_boundaries = textToList(value);
  },
});
const policyPreferenceText = computed({
  get: () => listToText(policyDraft.value.communication_preferences),
  set: (value: string) => {
    policyDraft.value.communication_preferences = textToList(value);
  },
});
const canSaveMemory = computed(() => {
  return Boolean(memoryDraft.value.title.trim() && memoryDraft.value.content.trim() && !isSavingMemory.value);
});
const orderedRevisionRows = computed(() => buildBuddyRevisionHistoryRows(revisions.value, commands.value));
const filteredRevisionRows = computed(() => filterBuddyRevisionHistoryRows(orderedRevisionRows.value, historyTargetFilter.value));
const bindingInputRows = computed(() => buildBuddyRunTemplateInputRows(selectedBindingTemplate.value));
const bindingSourceRows = computed(() => buildBuddyRunTemplateSourceRows(bindingDraft.value));
const bindingValidation = computed(() => validateBuddyRunTemplateBinding(selectedBindingTemplate.value, bindingDraft.value));
const bindingTemplateOptions = computed(() =>
  availableTemplates.value.map((template) => ({
    label: `${template.label} (${template.template_id})`,
    value: template.template_id,
  })),
);
const historyTargetOptions = computed(() =>
  BUDDY_REVISION_HISTORY_TARGET_FILTERS.map((value) => ({
    label: t(`buddyPage.history.targets.${value}`),
    value,
  })),
);
const permissionModeOptions = computed(() => [
  { label: t("buddy.modes.askFirst"), value: "ask_first" },
  { label: t("buddy.modes.fullAccess"), value: "full_access" },
]);

function defaultProfileDraft(): BuddyProfile {
  return {
    name: "",
    persona: "",
    tone: "",
    response_style: "",
    display_preferences: {},
  };
}

function defaultPolicyDraft(): BuddyPolicy {
  return {
    graph_permission_mode: "ask_first",
    behavior_boundaries: [],
    communication_preferences: [],
  };
}

function normalizePolicyMode(value: unknown): BuddyPolicy["graph_permission_mode"] {
  return value === "full_access" ? "full_access" : "ask_first";
}

function normalizeBuddyPolicy(policy: BuddyPolicy): BuddyPolicy {
  return {
    ...policy,
    graph_permission_mode: normalizePolicyMode((policy as { graph_permission_mode?: unknown }).graph_permission_mode),
  };
}

function defaultMemoryDraft(): MemoryDraft {
  return {
    type: "fact",
    title: "",
    content: "",
  };
}

function defaultSummaryDraft(): BuddySessionSummary {
  return {
    content: "",
    updated_at: "",
  };
}

function listToText(values: string[]) {
  return values.join("\n");
}

function textToList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  if (!value) {
    return t("common.none");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function historyDiffTagType(kind: BuddyRevisionDiffChangeKind) {
  if (kind === "added") {
    return "success";
  }
  if (kind === "removed") {
    return "danger";
  }
  return "warning";
}

function historyDiffKindLabel(kind: BuddyRevisionDiffChangeKind) {
  if (kind === "added") {
    return t("buddyPage.history.diffKinds.added");
  }
  if (kind === "removed") {
    return t("buddyPage.history.diffKinds.removed");
  }
  return t("buddyPage.history.diffKinds.changed");
}

function bindingInputNodeOptionsForSource(source: BuddyRunInputSource) {
  return buildBuddyRunInputNodeOptions(selectedBindingTemplate.value, bindingDraft.value, source);
}

function selectedBindingInputRow(nodeId: string): BuddyRunTemplateInputRow | null {
  if (!nodeId) {
    return null;
  }
  return bindingInputRows.value.find((row) => row.nodeId === nodeId) ?? null;
}

function setError(error: unknown, fallbackKey = "common.failedToLoad") {
  const message = error instanceof Error ? error.message : String(error || "");
  errorMessage.value = message || t(fallbackKey, { error: "" });
}

function acceptCommandResult<T>(response: BuddyCommandResponse<T>): T {
  lastCommand.value = response.command;
  return response.result;
}

function normalizeBindingDraft(binding: BuddyRunTemplateBinding): BuddyRunTemplateBinding {
  return {
    version: binding.version ?? 1,
    template_id: binding.template_id || buildDefaultBuddyRunTemplateBinding().template_id,
    input_bindings: { ...(binding.input_bindings ?? {}) },
    updated_at: binding.updated_at,
  };
}

function hasActiveBuddyPageWrite() {
  return Boolean(
    isLoading.value ||
      isSavingProfile.value ||
      isSavingPolicy.value ||
      isSavingMemory.value ||
      isSavingSummary.value ||
      isSavingBinding.value ||
      isLoadingPausedRuns.value ||
      isLoadingPausedRunDetail.value ||
      isLoadingBindingTemplate.value ||
      pausedRunActionBusy.value ||
      memoryActionId.value ||
      restoreActionId.value,
  );
}

async function loadAll(options: LoadAllOptions = {}) {
  try {
    if (!options.silent) {
      isLoading.value = true;
    }
    const [profile, policy, memoryList, summary, revisionList, commandList, templateList, runBinding] = await Promise.all([
      fetchBuddyProfile(),
      fetchBuddyPolicy(),
      fetchBuddyMemories(),
      fetchBuddySessionSummary(),
      fetchBuddyRevisions(),
      fetchBuddyCommands(),
      fetchTemplates(),
      fetchBuddyRunTemplateBinding(),
    ]);
    profileDraft.value = profile;
    policyDraft.value = normalizeBuddyPolicy(policy);
    memories.value = memoryList;
    summaryDraft.value = summary;
    revisions.value = revisionList;
    commands.value = commandList;
    availableTemplates.value = templateList;
    bindingDraft.value = normalizeBindingDraft(runBinding);
    await loadBindingTemplate(bindingDraft.value.template_id);
    await loadPausedRuns({ silent: true });
    errorMessage.value = "";
    hasLoaded.value = true;
  } catch (error) {
    setError(error);
  } finally {
    if (!options.silent) {
      isLoading.value = false;
    }
  }
}

async function loadBindingTemplate(templateId: string) {
  if (!templateId) {
    selectedBindingTemplate.value = null;
    return;
  }
  try {
    isLoadingBindingTemplate.value = true;
    selectedBindingTemplate.value = await fetchTemplate(templateId);
  } finally {
    isLoadingBindingTemplate.value = false;
  }
}

function isBuddyPausedRunSummary(run: RunSummary) {
  const graphName = run.graph_name.trim().toLowerCase();
  return graphName.includes("buddy") || run.graph_name.includes("伙伴");
}

async function loadPausedRuns(options: LoadAllOptions = {}) {
  try {
    if (!options.silent) {
      isLoadingPausedRuns.value = true;
    }
    const runs = await fetchRuns({ status: "awaiting_human" });
    const nextRuns = runs.filter(isBuddyPausedRunSummary);
    pausedRunSummaries.value = nextRuns;
    if (!nextRuns.some((run) => run.run_id === selectedPausedRunId.value)) {
      selectedPausedRunId.value = nextRuns[0]?.run_id ?? "";
    }
    await loadSelectedPausedRunDetail();
  } catch (error) {
    setError(error);
  } finally {
    if (!options.silent) {
      isLoadingPausedRuns.value = false;
    }
  }
}

async function loadSelectedPausedRunDetail() {
  if (!selectedPausedRunId.value) {
    selectedPausedRunDetail.value = null;
    return;
  }
  try {
    isLoadingPausedRunDetail.value = true;
    const run = await fetchRun(selectedPausedRunId.value);
    selectedPausedRunDetail.value = run.status === "awaiting_human" ? run : null;
  } catch (error) {
    selectedPausedRunDetail.value = null;
    setError(error);
  } finally {
    isLoadingPausedRunDetail.value = false;
  }
}

async function selectPausedRun(runId: string) {
  selectedPausedRunId.value = runId;
  await loadSelectedPausedRunDetail();
}

async function resumeSelectedPausedRun(payload: Record<string, unknown>) {
  if (!selectedPausedRunDetail.value || pausedRunActionBusy.value) {
    return;
  }
  try {
    pausedRunActionBusy.value = true;
    await resumeRun(selectedPausedRunDetail.value.run_id, payload);
    ElMessage.success(t("buddyPage.pausedRuns.resumeStarted"));
    await loadPausedRuns({ silent: true });
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    pausedRunActionBusy.value = false;
  }
}

async function cancelSelectedPausedRun() {
  if (!selectedPausedRunDetail.value || pausedRunActionBusy.value) {
    return;
  }
  try {
    pausedRunActionBusy.value = true;
    await cancelRun(selectedPausedRunDetail.value.run_id, t("buddy.pause.cancelReason"));
    ElMessage.success(t("buddyPage.pausedRuns.cancelled"));
    await loadPausedRuns({ silent: true });
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    pausedRunActionBusy.value = false;
  }
}

async function refreshMutableLists() {
  const [memoryList, revisionList, commandList] = await Promise.all([
    fetchBuddyMemories(),
    fetchBuddyRevisions(),
    fetchBuddyCommands(),
  ]);
  memories.value = memoryList;
  revisions.value = revisionList;
  commands.value = commandList;
}

async function refreshAuditTrail() {
  const [revisionList, commandList] = await Promise.all([fetchBuddyRevisions(), fetchBuddyCommands()]);
  revisions.value = revisionList;
  commands.value = commandList;
}

async function saveProfile() {
  try {
    isSavingProfile.value = true;
    profileDraft.value = acceptCommandResult(
      await updateBuddyProfile(profileDraft.value, t("buddyPage.changeReasons.profile")),
    );
    await refreshAuditTrail();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingProfile.value = false;
  }
}

async function savePolicy() {
  try {
    isSavingPolicy.value = true;
    policyDraft.value = acceptCommandResult(
      await updateBuddyPolicy(
        normalizeBuddyPolicy(policyDraft.value),
        t("buddyPage.changeReasons.policy"),
      ),
    );
    await refreshAuditTrail();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingPolicy.value = false;
  }
}

function startNewMemory() {
  editingMemoryId.value = "";
  memoryDraft.value = defaultMemoryDraft();
}

function openMemoryEditor(memory: BuddyMemory) {
  editingMemoryId.value = memory.id;
  memoryDraft.value = {
    type: memory.type,
    title: memory.title,
    content: memory.content,
  };
}

async function saveMemoryDraft() {
  if (!canSaveMemory.value) {
    return;
  }
  const payload = {
    type: memoryDraft.value.type.trim() || "fact",
    title: memoryDraft.value.title.trim(),
    content: memoryDraft.value.content.trim(),
  };
  try {
    isSavingMemory.value = true;
    if (editingMemoryId.value) {
      acceptCommandResult(
        await updateBuddyMemory(editingMemoryId.value, payload, t("buddyPage.changeReasons.memory")),
      );
    } else {
      acceptCommandResult(await createBuddyMemory(payload));
    }
    await refreshMutableLists();
    startNewMemory();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingMemory.value = false;
  }
}

async function removeMemory(memoryId: string) {
  try {
    await ElMessageBox.confirm(t("buddyPage.memory.deleteConfirm"), t("buddyPage.memory.deleteTitle"), {
      confirmButtonText: t("common.delete"),
      cancelButtonText: t("common.cancel"),
      type: "warning",
    });
  } catch {
    return;
  }
  try {
    memoryActionId.value = memoryId;
    acceptCommandResult(await deleteBuddyMemory(memoryId));
    await refreshMutableLists();
    if (editingMemoryId.value === memoryId) {
      startNewMemory();
    }
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.memory.deleted"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    memoryActionId.value = "";
  }
}

async function saveSummary() {
  try {
    isSavingSummary.value = true;
    summaryDraft.value = acceptCommandResult(
      await updateBuddySessionSummary(summaryDraft.value, t("buddyPage.changeReasons.summary")),
    );
    await refreshAuditTrail();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingSummary.value = false;
  }
}

async function selectBindingTemplate(value: unknown) {
  const templateId = String(value || "");
  bindingDraft.value = {
    ...bindingDraft.value,
    template_id: templateId,
    input_bindings: {},
  };
  await loadBindingTemplate(templateId);
}

function setBindingInputNode(source: BuddyRunInputSource, value: unknown) {
  bindingDraft.value = setBuddyRunTemplateSourceBinding(bindingDraft.value, source, String(value || ""));
}

function resetBindingToDefault() {
  bindingDraft.value = buildDefaultBuddyRunTemplateBinding();
  void loadBindingTemplate(bindingDraft.value.template_id);
}

async function saveBinding() {
  if (!bindingValidation.value.valid || isSavingBinding.value) {
    return;
  }
  try {
    isSavingBinding.value = true;
    bindingDraft.value = normalizeBindingDraft(
      acceptCommandResult(await updateBuddyRunTemplateBinding(bindingDraft.value, t("buddyPage.changeReasons.binding"))),
    );
    await refreshAuditTrail();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingBinding.value = false;
  }
}

async function restoreRevision(revisionId: string) {
  try {
    restoreActionId.value = revisionId;
    acceptCommandResult(await restoreBuddyRevision(revisionId));
    await loadAll();
    ElMessage.success(t("buddyPage.history.restored"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    restoreActionId.value = "";
  }
}

watch(
  () => buddyContextStore.dataRefreshNonce,
  () => {
    if (!hasLoaded.value || hasActiveBuddyPageWrite()) {
      return;
    }
    void loadAll({ silent: true });
  },
);

onMounted(loadAll);
</script>

<style scoped>
.buddy-page {
  display: grid;
  gap: 18px;
}

.buddy-page__hero,
.buddy-page__panel,
.buddy-page__empty {
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-panel);
  box-shadow: var(--toograph-shadow-panel);
}

.buddy-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.buddy-page__empty {
  padding: 24px;
}

.buddy-page__panel {
  background: var(--toograph-surface-card);
  padding: 20px;
}

.buddy-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.buddy-page__title {
  margin: 8px 0 10px;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 2rem;
}

.buddy-page__body,
.buddy-page__panel-heading p,
.buddy-page__empty,
.buddy-page__meta {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.buddy-page__refresh {
  flex: 0 0 auto;
}

.buddy-page__alert {
  border-radius: 16px;
}

.buddy-page__command-status {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid rgba(22, 101, 52, 0.18);
  border-radius: 16px;
  background: rgba(240, 253, 244, 0.86);
  color: rgba(20, 83, 45, 0.86);
  padding: 10px 12px;
  font-size: 0.86rem;
}

.buddy-page__tabs {
  border: 1px solid var(--toograph-border);
  border-radius: 24px;
  background: var(--toograph-surface-panel);
  padding: 12px 16px 18px;
  box-shadow: var(--toograph-shadow-panel);
}

.buddy-page__panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.buddy-page__panel-heading h3 {
  margin: 0 0 6px;
  color: var(--toograph-text-strong);
}

.buddy-page__form {
  max-width: 920px;
}

.buddy-page__form--wide {
  max-width: none;
}

.buddy-page__split {
  display: grid;
  grid-template-columns: minmax(300px, 0.72fr) minmax(0, 1.28fr);
  gap: 18px;
}

.buddy-page__panel--memory-form {
  min-width: 0;
}

.buddy-page__panel--memory-list {
  min-width: 0;
  overflow: hidden;
}

.buddy-page__panel--paused-list,
.buddy-page__panel--paused-detail {
  min-width: 0;
}

.buddy-page__panel--paused-detail {
  display: grid;
  align-content: start;
  gap: 12px;
}

.buddy-page__panel--paused-detail :deep(.buddy-widget__pause-card) {
  width: 100%;
  max-width: 680px;
}

.buddy-page__actions,
.buddy-page__table-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.buddy-page__table {
  width: 100%;
}

.buddy-page__binding-table {
  margin-top: 12px;
}

.buddy-page__binding-source,
.buddy-page__binding-state {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.buddy-page__binding-source {
  grid-template-columns: minmax(0, auto) auto;
  align-items: center;
  justify-content: start;
  column-gap: 8px;
}

.buddy-page__binding-source-label,
.buddy-page__binding-state span {
  min-width: 0;
  color: #1f2937;
  font-weight: 850;
}

.buddy-page__binding-state small {
  color: rgba(60, 41, 20, 0.62);
  font-size: 0.78rem;
  font-weight: 750;
}

.buddy-page__history-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.buddy-page__filter-label {
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.82rem;
  font-weight: 800;
}

.buddy-page__history-filter {
  max-width: 100%;
  overflow-x: auto;
}

.buddy-page__history-source {
  display: grid;
  gap: 2px;
  line-height: 1.35;
}

.buddy-page__history-source small {
  color: rgba(60, 41, 20, 0.58);
}

.buddy-page__history-diff {
  display: grid;
  gap: 12px;
  padding: 12px 10px;
}

.buddy-page__history-diff-list {
  display: grid;
  gap: 10px;
}

.buddy-page__history-diff-entry {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 12px;
  background: rgba(255, 252, 247, 0.62);
  padding: 10px;
}

.buddy-page__history-diff-field {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  color: var(--toograph-text-strong);
  font-weight: 800;
  word-break: break-word;
}

.buddy-page__history-diff-values,
.buddy-page__history-raw-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.buddy-page__history-diff section,
.buddy-page__history-raw-grid section {
  min-width: 0;
}

.buddy-page__history-diff section > span,
.buddy-page__history-raw-grid section > span {
  display: block;
  margin-bottom: 6px;
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.78rem;
  font-weight: 700;
}

.buddy-page__history-diff pre,
.buddy-page__history-raw-grid pre {
  max-height: 180px;
  margin: 0;
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 12px;
  background: rgba(255, 252, 247, 0.72);
  color: var(--toograph-text-strong);
  padding: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}

.buddy-page__history-no-diff {
  margin: 0;
  color: rgba(60, 41, 20, 0.62);
}

.buddy-page__history-raw-diff {
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  padding-top: 10px;
}

.buddy-page__history-raw-diff summary {
  cursor: pointer;
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.82rem;
  font-weight: 800;
}

.buddy-page__history-raw-grid {
  margin-top: 10px;
}

.buddy-page__panel--mascot-debug {
  max-width: 760px;
}

.buddy-page__debug-grid {
  display: grid;
  gap: 16px;
}

.buddy-page__debug-group {
  display: grid;
  gap: 8px;
}

.buddy-page__debug-label {
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.78rem;
  font-weight: 800;
}

.buddy-page__debug-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.buddy-page__debug-button {
  min-width: 78px;
}

.buddy-page__meta {
  flex: 0 0 auto;
  font-size: 0.88rem;
}

:deep(.el-tabs__header) {
  margin-bottom: 18px;
}

:deep(.el-tabs__nav-wrap::after) {
  background-color: rgba(154, 52, 18, 0.12);
}

:deep(.el-tabs__item.is-active),
:deep(.el-tabs__item:hover) {
  color: rgb(154, 52, 18);
}

:deep(.el-tabs__active-bar) {
  background-color: rgb(154, 52, 18);
}

:deep(.el-form-item__label) {
  color: rgba(60, 41, 20, 0.78);
}

:deep(.el-textarea__inner),
:deep(.el-input__wrapper) {
  border-radius: 14px;
}

@media (max-width: 1100px) {
  .buddy-page__hero,
  .buddy-page__panel-heading {
    display: grid;
  }

  .buddy-page__split {
    grid-template-columns: 1fr;
  }

  .buddy-page__history-diff {
    grid-template-columns: 1fr;
  }

  .buddy-page__history-diff-entry,
  .buddy-page__history-diff-values,
  .buddy-page__history-raw-grid {
    grid-template-columns: 1fr;
  }
}
</style>
