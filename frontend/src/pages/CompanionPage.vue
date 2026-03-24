<template>
  <AppShell>
    <section class="companion-page">
      <header class="companion-page__hero">
        <div>
          <div class="companion-page__eyebrow">{{ t("companionPage.eyebrow") }}</div>
          <h2 class="companion-page__title">{{ t("companionPage.title") }}</h2>
          <p class="companion-page__body">{{ t("companionPage.body") }}</p>
        </div>
        <ElButton class="companion-page__refresh" :loading="isLoading" @click="loadAll">
          <ElIcon><Refresh /></ElIcon>
          <span>{{ t("companionPage.refresh") }}</span>
        </ElButton>
      </header>

      <ElAlert
        v-if="errorMessage"
        class="companion-page__alert"
        type="error"
        show-icon
        :closable="false"
        :title="t('common.failedToLoad', { error: errorMessage })"
      />

      <div v-if="isLoading && !hasLoaded" class="companion-page__empty">{{ t("companionPage.loading") }}</div>
      <ElTabs v-else v-model="activeTab" class="companion-page__tabs">
        <ElTabPane :label="t('companionPage.tabs.profile')" name="profile">
          <article class="companion-page__panel">
            <div class="companion-page__panel-heading">
              <div>
                <h3>{{ t("companionPage.profile.title") }}</h3>
                <p>{{ t("companionPage.profile.body") }}</p>
              </div>
            </div>
            <ElForm label-position="top" class="companion-page__form">
              <ElFormItem :label="t('companionPage.profile.name')">
                <ElInput v-model="profileDraft.name" />
              </ElFormItem>
              <ElFormItem :label="t('companionPage.profile.persona')">
                <ElInput v-model="profileDraft.persona" type="textarea" :rows="4" />
              </ElFormItem>
              <ElFormItem :label="t('companionPage.profile.tone')">
                <ElInput v-model="profileDraft.tone" />
              </ElFormItem>
              <ElFormItem :label="t('companionPage.profile.responseStyle')">
                <ElInput v-model="profileDraft.response_style" type="textarea" :rows="3" />
              </ElFormItem>
              <div class="companion-page__actions">
                <ElButton type="primary" :loading="isSavingProfile" @click="saveProfile">
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("companionPage.saveProfile") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('companionPage.tabs.policy')" name="policy">
          <article class="companion-page__panel">
            <div class="companion-page__panel-heading">
              <div>
                <h3>{{ t("companionPage.policy.title") }}</h3>
                <p>{{ t("companionPage.policy.body") }}</p>
              </div>
              <ElTag type="info" effect="plain">{{ t("companionPage.policy.advisoryOnly") }}</ElTag>
            </div>
            <ElForm label-position="top" class="companion-page__form">
              <ElFormItem :label="t('companionPage.policy.boundaries')">
                <ElInput v-model="policyBoundaryText" type="textarea" :rows="6" />
              </ElFormItem>
              <ElFormItem :label="t('companionPage.policy.preferences')">
                <ElInput v-model="policyPreferenceText" type="textarea" :rows="5" />
              </ElFormItem>
              <div class="companion-page__actions">
                <ElButton type="primary" :loading="isSavingPolicy" @click="savePolicy">
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("companionPage.savePolicy") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('companionPage.tabs.memory')" name="memory">
          <section class="companion-page__split">
            <article class="companion-page__panel companion-page__panel--memory-form">
              <div class="companion-page__panel-heading">
                <div>
                  <h3>{{ editingMemoryId ? t("companionPage.memory.editTitle") : t("companionPage.memory.newTitle") }}</h3>
                  <p>{{ t("companionPage.memory.body") }}</p>
                </div>
                <ElButton v-if="editingMemoryId" @click="startNewMemory">
                  <ElIcon><Plus /></ElIcon>
                  <span>{{ t("companionPage.memory.new") }}</span>
                </ElButton>
              </div>
              <ElForm label-position="top" class="companion-page__form">
                <ElFormItem :label="t('companionPage.memory.type')">
                  <ElInput v-model="memoryDraft.type" />
                </ElFormItem>
                <ElFormItem :label="t('companionPage.memory.title')">
                  <ElInput v-model="memoryDraft.title" />
                </ElFormItem>
                <ElFormItem :label="t('companionPage.memory.content')">
                  <ElInput v-model="memoryDraft.content" type="textarea" :rows="7" />
                </ElFormItem>
                <div class="companion-page__actions">
                  <ElButton type="primary" :loading="isSavingMemory" :disabled="!canSaveMemory" @click="saveMemoryDraft">
                    <ElIcon><Check /></ElIcon>
                    <span>{{ editingMemoryId ? t("companionPage.memory.update") : t("companionPage.memory.create") }}</span>
                  </ElButton>
                  <ElButton :disabled="isSavingMemory" @click="startNewMemory">{{ t("common.cancel") }}</ElButton>
                </div>
              </ElForm>
            </article>

            <article class="companion-page__panel companion-page__panel--memory-list">
              <div class="companion-page__panel-heading">
                <div>
                  <h3>{{ t("companionPage.memory.listTitle") }}</h3>
                  <p>{{ t("companionPage.memory.listBody", { count: memories.length }) }}</p>
                </div>
              </div>
              <ElTable :data="memories" class="companion-page__table" empty-text=" ">
                <ElTableColumn prop="type" :label="t('companionPage.memory.type')" width="120" />
                <ElTableColumn prop="title" :label="t('companionPage.memory.title')" min-width="160" />
                <ElTableColumn prop="content" :label="t('companionPage.memory.content')" min-width="260" show-overflow-tooltip />
                <ElTableColumn :label="t('companionPage.memory.actions')" width="190" fixed="right">
                  <template #default="{ row }">
                    <div class="companion-page__table-actions">
                      <ElButton size="small" @click="openMemoryEditor(row)">
                        <ElIcon><EditPen /></ElIcon>
                        <span>{{ t("companionPage.memory.edit") }}</span>
                      </ElButton>
                      <ElButton size="small" type="danger" :loading="memoryActionId === row.id" @click="removeMemory(row.id)">
                        <ElIcon><Delete /></ElIcon>
                        <span>{{ t("common.delete") }}</span>
                      </ElButton>
                    </div>
                  </template>
                </ElTableColumn>
              </ElTable>
              <ElEmpty v-if="memories.length === 0" :description="t('companionPage.memory.empty')" />
            </article>
          </section>
        </ElTabPane>

        <ElTabPane :label="t('companionPage.tabs.summary')" name="summary">
          <article class="companion-page__panel">
            <div class="companion-page__panel-heading">
              <div>
                <h3>{{ t("companionPage.summary.title") }}</h3>
                <p>{{ t("companionPage.summary.body") }}</p>
              </div>
              <span class="companion-page__meta">{{ t("companionPage.summary.updatedAt", { value: formatDate(summaryDraft.updated_at) }) }}</span>
            </div>
            <ElForm label-position="top" class="companion-page__form">
              <ElFormItem :label="t('companionPage.summary.content')">
                <ElInput v-model="summaryDraft.content" type="textarea" :rows="10" />
              </ElFormItem>
              <div class="companion-page__actions">
                <ElButton type="primary" :loading="isSavingSummary" @click="saveSummary">
                  <ElIcon><Check /></ElIcon>
                  <span>{{ t("companionPage.saveSummary") }}</span>
                </ElButton>
              </div>
            </ElForm>
          </article>
        </ElTabPane>

        <ElTabPane :label="t('companionPage.tabs.history')" name="history">
          <article class="companion-page__panel">
            <div class="companion-page__panel-heading">
              <div>
                <h3>{{ t("companionPage.history.title") }}</h3>
                <p>{{ t("companionPage.history.body") }}</p>
              </div>
            </div>
            <ElTable :data="orderedRevisions" class="companion-page__table" empty-text=" ">
              <ElTableColumn prop="target_type" :label="t('companionPage.history.target')" width="150" />
              <ElTableColumn prop="operation" :label="t('companionPage.history.operation')" width="130" />
              <ElTableColumn prop="change_reason" :label="t('companionPage.history.reason')" min-width="260" show-overflow-tooltip />
              <ElTableColumn :label="t('companionPage.history.createdAt')" width="190">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </ElTableColumn>
              <ElTableColumn :label="t('companionPage.history.actions')" width="140" fixed="right">
                <template #default="{ row }">
                  <ElButton size="small" :loading="restoreActionId === row.revision_id" @click="restoreRevision(row.revision_id)">
                    <ElIcon><RefreshLeft /></ElIcon>
                    <span>{{ t("companionPage.history.restore") }}</span>
                  </ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
            <ElEmpty v-if="orderedRevisions.length === 0" :description="t('companionPage.history.empty')" />
          </article>
        </ElTabPane>
      </ElTabs>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
  createCompanionMemory,
  deleteCompanionMemory,
  fetchCompanionMemories,
  fetchCompanionPolicy,
  fetchCompanionProfile,
  fetchCompanionRevisions,
  fetchCompanionSessionSummary,
  restoreCompanionRevision,
  updateCompanionMemory,
  updateCompanionPolicy,
  updateCompanionProfile,
  updateCompanionSessionSummary,
} from "@/api/companion";
import AppShell from "@/layouts/AppShell.vue";
import type { CompanionMemory, CompanionPolicy, CompanionProfile, CompanionRevision, CompanionSessionSummary } from "@/types/companion";

type MemoryDraft = Pick<CompanionMemory, "type" | "title" | "content">;

const { t } = useI18n();
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

const profileDraft = ref<CompanionProfile>(defaultProfileDraft());
const policyDraft = ref<CompanionPolicy>(defaultPolicyDraft());
const memories = ref<CompanionMemory[]>([]);
const memoryDraft = ref<MemoryDraft>(defaultMemoryDraft());
const editingMemoryId = ref("");
const summaryDraft = ref<CompanionSessionSummary>(defaultSummaryDraft());
const revisions = ref<CompanionRevision[]>([]);

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

function defaultProfileDraft(): CompanionProfile {
  return {
    name: "",
    persona: "",
    tone: "",
    response_style: "",
    display_preferences: {},
  };
}

function defaultPolicyDraft(): CompanionPolicy {
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

function defaultSummaryDraft(): CompanionSessionSummary {
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

async function loadAll() {
  try {
    isLoading.value = true;
    const [profile, policy, memoryList, summary, revisionList] = await Promise.all([
      fetchCompanionProfile(),
      fetchCompanionPolicy(),
      fetchCompanionMemories(),
      fetchCompanionSessionSummary(),
      fetchCompanionRevisions(),
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
    isLoading.value = false;
  }
}

async function refreshMutableLists() {
  const [memoryList, revisionList] = await Promise.all([fetchCompanionMemories(), fetchCompanionRevisions()]);
  memories.value = memoryList;
  revisions.value = revisionList;
}

async function saveProfile() {
  try {
    isSavingProfile.value = true;
    profileDraft.value = await updateCompanionProfile(profileDraft.value, t("companionPage.changeReasons.profile"));
    revisions.value = await fetchCompanionRevisions();
    errorMessage.value = "";
    ElMessage.success(t("companionPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingProfile.value = false;
  }
}

async function savePolicy() {
  try {
    isSavingPolicy.value = true;
    policyDraft.value = await updateCompanionPolicy(
      {
        ...policyDraft.value,
        graph_permission_mode: "advisory",
      },
      t("companionPage.changeReasons.policy"),
    );
    revisions.value = await fetchCompanionRevisions();
    errorMessage.value = "";
    ElMessage.success(t("companionPage.saved"));
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

function openMemoryEditor(memory: CompanionMemory) {
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
      await updateCompanionMemory(editingMemoryId.value, payload, t("companionPage.changeReasons.memory"));
    } else {
      await createCompanionMemory(payload);
    }
    await refreshMutableLists();
    startNewMemory();
    errorMessage.value = "";
    ElMessage.success(t("companionPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingMemory.value = false;
  }
}

async function removeMemory(memoryId: string) {
  try {
    await ElMessageBox.confirm(t("companionPage.memory.deleteConfirm"), t("companionPage.memory.deleteTitle"), {
      confirmButtonText: t("common.delete"),
      cancelButtonText: t("common.cancel"),
      type: "warning",
    });
  } catch {
    return;
  }
  try {
    memoryActionId.value = memoryId;
    await deleteCompanionMemory(memoryId);
    await refreshMutableLists();
    if (editingMemoryId.value === memoryId) {
      startNewMemory();
    }
    errorMessage.value = "";
    ElMessage.success(t("companionPage.memory.deleted"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    memoryActionId.value = "";
  }
}

async function saveSummary() {
  try {
    isSavingSummary.value = true;
    summaryDraft.value = await updateCompanionSessionSummary(summaryDraft.value, t("companionPage.changeReasons.summary"));
    revisions.value = await fetchCompanionRevisions();
    errorMessage.value = "";
    ElMessage.success(t("companionPage.saved"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    isSavingSummary.value = false;
  }
}

async function restoreRevision(revisionId: string) {
  try {
    restoreActionId.value = revisionId;
    await restoreCompanionRevision(revisionId);
    await loadAll();
    ElMessage.success(t("companionPage.history.restored"));
  } catch (error) {
    setError(error, "common.failedToSave");
  } finally {
    restoreActionId.value = "";
  }
}

onMounted(loadAll);
</script>

<style scoped>
.companion-page {
  display: grid;
  gap: 18px;
}

.companion-page__hero,
.companion-page__panel,
.companion-page__empty {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.companion-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.companion-page__empty {
  padding: 24px;
}

.companion-page__panel {
  background: var(--graphite-surface-card);
  padding: 20px;
}

.companion-page__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.companion-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
}

.companion-page__body,
.companion-page__panel-heading p,
.companion-page__empty,
.companion-page__meta {
  margin: 0;
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.companion-page__refresh {
  flex: 0 0 auto;
}

.companion-page__alert {
  border-radius: 16px;
}

.companion-page__tabs {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  padding: 12px 16px 18px;
  box-shadow: var(--graphite-shadow-panel);
}

.companion-page__panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.companion-page__panel-heading h3 {
  margin: 0 0 6px;
  color: var(--graphite-text-strong);
}

.companion-page__form {
  max-width: 920px;
}

.companion-page__split {
  display: grid;
  grid-template-columns: minmax(300px, 0.72fr) minmax(0, 1.28fr);
  gap: 18px;
}

.companion-page__panel--memory-form {
  min-width: 0;
}

.companion-page__panel--memory-list {
  min-width: 0;
  overflow: hidden;
}

.companion-page__actions,
.companion-page__table-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.companion-page__table {
  width: 100%;
}

.companion-page__meta {
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
  .companion-page__hero,
  .companion-page__panel-heading {
    display: grid;
  }

  .companion-page__split {
    grid-template-columns: 1fr;
  }
}
</style>
