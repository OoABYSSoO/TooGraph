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
              <ElTag type="info" effect="plain">{{ t("buddyPage.policy.advisoryOnly") }}</ElTag>
            </div>
            <ElForm label-position="top" class="buddy-page__form">
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

        <ElTabPane :label="t('buddyPage.tabs.history')" name="history">
          <article class="buddy-page__panel">
            <div class="buddy-page__panel-heading">
              <div>
                <h3>{{ t("buddyPage.history.title") }}</h3>
                <p>{{ t("buddyPage.history.body") }}</p>
              </div>
            </div>
            <ElTable :data="orderedRevisions" class="buddy-page__table" empty-text=" ">
              <ElTableColumn prop="target_type" :label="t('buddyPage.history.target')" width="150" />
              <ElTableColumn prop="operation" :label="t('buddyPage.history.operation')" width="130" />
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
            <ElEmpty v-if="orderedRevisions.length === 0" :description="t('buddyPage.history.empty')" />
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
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
} from "element-plus";
import { Check, Delete, EditPen, Plus, Refresh, RefreshLeft } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";

import {
  createBuddyMemory,
  deleteBuddyMemory,
  fetchBuddyMemories,
  fetchBuddyPolicy,
  fetchBuddyProfile,
  fetchBuddyRevisions,
  fetchBuddySessionSummary,
  restoreBuddyRevision,
  updateBuddyMemory,
  updateBuddyPolicy,
  updateBuddyProfile,
  updateBuddySessionSummary,
} from "@/api/buddy";
import AppShell from "@/layouts/AppShell.vue";
import { useBuddyContextStore } from "@/stores/buddyContext";
import type {
  BuddyCommandRecord,
  BuddyCommandResponse,
  BuddyMemory,
  BuddyPolicy,
  BuddyProfile,
  BuddyRevision,
  BuddySessionSummary,
} from "@/types/buddy";

type MemoryDraft = Pick<BuddyMemory, "type" | "title" | "content">;
type LoadAllOptions = {
  silent?: boolean;
};

const { t } = useI18n();
const buddyContextStore = useBuddyContextStore();
const activeTab = ref("profile");
const hasLoaded = ref(false);
const isLoading = ref(false);
const isSavingProfile = ref(false);
const isSavingPolicy = ref(false);
const isSavingMemory = ref(false);
const isSavingSummary = ref(false);
const memoryActionId = ref("");
const restoreActionId = ref("");
const errorMessage = ref("");

const profileDraft = ref<BuddyProfile>(defaultProfileDraft());
const policyDraft = ref<BuddyPolicy>(defaultPolicyDraft());
const memories = ref<BuddyMemory[]>([]);
const memoryDraft = ref<MemoryDraft>(defaultMemoryDraft());
const editingMemoryId = ref("");
const summaryDraft = ref<BuddySessionSummary>(defaultSummaryDraft());
const revisions = ref<BuddyRevision[]>([]);
const lastCommand = ref<BuddyCommandRecord | null>(null);

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
const orderedRevisions = computed(() => {
  return [...revisions.value].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
});

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
    graph_permission_mode: "advisory",
    behavior_boundaries: [],
    communication_preferences: [],
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

function setError(error: unknown, fallbackKey = "common.failedToLoad") {
  const message = error instanceof Error ? error.message : String(error || "");
  errorMessage.value = message || t(fallbackKey, { error: "" });
}

function acceptCommandResult<T>(response: BuddyCommandResponse<T>): T {
  lastCommand.value = response.command;
  return response.result;
}

function hasActiveBuddyPageWrite() {
  return Boolean(
    isLoading.value ||
      isSavingProfile.value ||
      isSavingPolicy.value ||
      isSavingMemory.value ||
      isSavingSummary.value ||
      memoryActionId.value ||
      restoreActionId.value,
  );
}

async function loadAll(options: LoadAllOptions = {}) {
  try {
    if (!options.silent) {
      isLoading.value = true;
    }
    const [profile, policy, memoryList, summary, revisionList] = await Promise.all([
      fetchBuddyProfile(),
      fetchBuddyPolicy(),
      fetchBuddyMemories(),
      fetchBuddySessionSummary(),
      fetchBuddyRevisions(),
    ]);
    profileDraft.value = profile;
    policyDraft.value = policy;
    memories.value = memoryList;
    summaryDraft.value = summary;
    revisions.value = revisionList;
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

async function refreshMutableLists() {
  const [memoryList, revisionList] = await Promise.all([fetchBuddyMemories(), fetchBuddyRevisions()]);
  memories.value = memoryList;
  revisions.value = revisionList;
}

async function saveProfile() {
  try {
    isSavingProfile.value = true;
    profileDraft.value = acceptCommandResult(
      await updateBuddyProfile(profileDraft.value, t("buddyPage.changeReasons.profile")),
    );
    revisions.value = await fetchBuddyRevisions();
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
        {
          ...policyDraft.value,
          graph_permission_mode: "advisory",
        },
        t("buddyPage.changeReasons.policy"),
      ),
    );
    revisions.value = await fetchBuddyRevisions();
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
    revisions.value = await fetchBuddyRevisions();
    errorMessage.value = "";
    ElMessage.success(t("buddyPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingSummary.value = false;
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
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
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
  background: var(--graphite-surface-card);
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
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
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
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  padding: 12px 16px 18px;
  box-shadow: var(--graphite-shadow-panel);
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
  color: var(--graphite-text-strong);
}

.buddy-page__form {
  max-width: 920px;
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
}
</style>
