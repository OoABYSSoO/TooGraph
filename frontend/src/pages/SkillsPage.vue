<template>
  <AppShell>
    <section class="skills-page">
      <header class="skills-page__hero">
        <div>
          <div class="skills-page__eyebrow">{{ t("skills.eyebrow") }}</div>
          <h2 class="skills-page__title">{{ t("skills.title") }}</h2>
          <p class="skills-page__body">{{ t("skills.body") }}</p>
        </div>
        <div class="skills-page__hero-actions">
          <button type="button" class="skills-page__action" :disabled="importMode !== null" @click="skillArchiveInput?.click()">
            {{ importMode === "archive" ? t("skills.importing") : t("skills.importArchive") }}
          </button>
          <button type="button" class="skills-page__action" :disabled="importMode !== null" @click="skillDirectoryInput?.click()">
            {{ importMode === "folder" ? t("skills.importing") : t("skills.importFolder") }}
          </button>
          <button type="button" class="skills-page__refresh" :disabled="loading" @click="loadSkills">
            {{ loading ? t("skills.refreshing") : t("skills.refresh") }}
          </button>
          <input
            ref="skillArchiveInput"
            class="skills-page__file-input"
            type="file"
            accept=".zip,application/zip"
            @change="importUploadedSkill($event, 'archive')"
          />
          <input
            ref="skillDirectoryInput"
            class="skills-page__file-input"
            type="file"
            webkitdirectory
            directory
            multiple
            @change="importUploadedSkill($event, 'folder')"
          />
        </div>
      </header>

      <section class="skills-page__overview" :aria-label="t('skills.overviewLabel')">
        <article class="skills-page__metric">
          <span>{{ t("skills.total") }}</span>
          <strong>{{ overview.total }}</strong>
        </article>
        <article class="skills-page__metric">
          <span>{{ t("skills.active") }}</span>
          <strong>{{ overview.active }}</strong>
        </article>
        <article class="skills-page__metric">
          <span>{{ t("skills.discoverableSkills") }}</span>
          <strong>{{ overview.discoverableSkills }}</strong>
        </article>
        <article class="skills-page__metric">
          <span>{{ t("skills.autoSelectableSkills") }}</span>
          <strong>{{ overview.autoSelectableSkills }}</strong>
        </article>
        <article class="skills-page__metric">
          <span>{{ t("skills.runtimeReady") }}</span>
          <strong>{{ overview.runtimeReady }}</strong>
        </article>
        <article class="skills-page__metric">
          <span>{{ t("skills.needsAttention") }}</span>
          <strong>{{ overview.needsAttention }}</strong>
        </article>
      </section>

      <section class="skills-page__toolbar" :aria-label="t('skills.filterLabel')">
        <label class="skills-page__search-field">
          <span>{{ t("common.search") }}</span>
          <ElInput v-model="query" class="skills-page__search" :placeholder="t('skills.searchPlaceholder')" clearable />
        </label>
        <div class="skills-page__status-filter">
          <span>{{ t("skills.statusFilter") }}</span>
          <div role="tablist" class="skills-page__filter-tabs" :aria-label="t('skills.statusFilter')">
            <button
              v-for="option in statusOptions"
              :key="option.value"
              type="button"
              class="skills-page__filter-tab"
              :class="{ 'skills-page__filter-tab--active': statusFilter === option.value }"
              role="tab"
              :aria-selected="statusFilter === option.value"
              @click="statusFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="skills-page__list">
        <article v-if="actionError" class="skills-page__notice">{{ t("skills.actionFailed", { error: actionError }) }}</article>
        <article v-if="loading" class="skills-page__empty">{{ t("common.loading") }}</article>
        <article v-else-if="error" class="skills-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
        <article v-else-if="filteredSkills.length === 0" class="skills-page__empty">{{ t("skills.empty") }}</article>
        <section v-else class="skills-page__workspace">
          <aside class="skills-page__selector" :aria-label="t('skills.selectorLabel')">
            <div class="skills-page__result-count">{{ t("skills.resultCount", { count: filteredSkills.length }) }}</div>
            <div
              v-for="skill in filteredSkills"
              :key="skill.skillKey"
              class="skills-page__selector-item"
              :class="{ 'skills-page__selector-item--active': selectedSkillKey === skill.skillKey }"
            >
              <button
                type="button"
                class="skills-page__selector-button"
                :aria-pressed="selectedSkillKey === skill.skillKey"
                @click="selectSkill(skill.skillKey)"
              >
                <span>{{ skill.name }}</span>
              </button>
              <ElSwitch
                :model-value="skill.status === 'active'"
                :disabled="!skill.canManage || actionSkillKey === skill.skillKey"
                :aria-label="enabledToggleLabel(skill)"
                @change="setSkillEnabled(skill, Boolean($event))"
              />
            </div>
          </aside>

          <article v-if="selectedSkill" class="skills-page__detail" :aria-label="t('skills.detailLabel')">
            <header class="skills-page__detail-header">
              <div>
                <div class="skills-page__id">{{ selectedSkill.skillKey }}</div>
                <h3>{{ selectedSkill.name }}</h3>
                <p>{{ selectedSkill.description }}</p>
              </div>
              <div class="skills-page__status">
                <span>{{ t(`skills.${selectedSkill.status}`) }}</span>
                <span>{{ selectedSkill.runtimeReady ? t("skills.runtimeReady") : t("skills.runtimePending") }}</span>
                <span>{{ selectedSkill.runtimeRegistered ? t("skills.runtimeRegistered") : t("skills.runtimeNotRegistered") }}</span>
                <span>{{ t("skills.llmNodeEligibility") }}: {{ selectedSkill.llmNodeEligibility }}</span>
                <span v-if="!selectedSkill.configured" class="skills-page__status-warning">{{ t("skills.notConfigured") }}</span>
                <span v-if="!selectedSkill.healthy" class="skills-page__status-warning">{{ t("skills.unhealthy") }}</span>
                <span v-if="selectedSkill.canManage">{{ t("skills.manageable") }}</span>
              </div>
            </header>

            <div class="skills-page__actions" :aria-label="t('skills.actions')">
              <button
                v-if="selectedSkill.canManage"
                type="button"
                class="skills-page__action"
                :class="{ 'skills-page__action--danger': confirmingSkillDeleteKey === selectedSkill.skillKey }"
                :disabled="actionSkillKey === selectedSkill.skillKey"
                @click="deleteSkillFromCatalog(selectedSkill)"
              >
                {{ confirmingSkillDeleteKey === selectedSkill.skillKey ? t("skills.confirmDelete") : t("skills.delete") }}
              </button>
            </div>

            <div class="skills-page__source">
              <span>{{ t("skills.source") }}: {{ selectedSkill.sourceScope }} / {{ selectedSkill.sourceFormat }}</span>
              <code>{{ selectedSkill.sourcePath }}</code>
            </div>

            <div class="skills-page__taxonomy">
              <section>
                <h4>{{ t("skills.runPolicies") }}</h4>
                <div class="skills-page__schema-list">
                  <span
                    v-for="entry in runPolicyOriginEntries(selectedSkill)"
                    :key="entry.origin"
                  >
                    {{ formatRunPolicy(entry.origin, entry.policy) }}
                  </span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.kind") }}</h4>
                <div class="skills-page__badges">
                  <span>{{ selectedSkill.kind }}</span>
                  <span>{{ selectedSkill.mode }}</span>
                  <span>{{ selectedSkill.scope }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.runtime") }}</h4>
                <div class="skills-page__badges">
                  <span>{{ selectedSkill.runtime.type }}</span>
                  <span>{{ selectedSkill.runtime.entrypoint || t("common.none") }}</span>
                  <span>{{ selectedSkill.health.type }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.version") }}</h4>
                <div class="skills-page__badges">
                  <span>{{ selectedSkill.version || t("common.none") }}</span>
                </div>
              </section>
            </div>

            <div class="skills-page__columns">
              <section>
                <h4>{{ t("skills.inputSchema") }}</h4>
                <div class="skills-page__schema-list">
                  <span v-for="field in selectedSkill.inputSchema" :key="`in-${field.key}`">
                    {{ field.key }} · {{ field.valueType }} · {{ field.required ? t("skills.required") : t("skills.optional") }}
                  </span>
                  <span v-if="selectedSkill.inputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.outputSchema") }}</h4>
                <div class="skills-page__schema-list">
                  <span v-for="field in selectedSkill.outputSchema" :key="`out-${field.key}`">
                    {{ field.key }} · {{ field.valueType }} · {{ field.required ? t("skills.required") : t("skills.optional") }}
                  </span>
                  <span v-if="selectedSkill.outputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.supportedTypes") }}</h4>
                <div class="skills-page__badges">
                  <span v-for="valueType in selectedSkill.supportedValueTypes" :key="valueType">{{ valueType }}</span>
                  <span v-if="selectedSkill.supportedValueTypes.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.sideEffects") }}</h4>
                <div class="skills-page__badges">
                  <span v-for="effect in selectedSkill.sideEffects" :key="effect">{{ effect }}</span>
                  <span v-if="selectedSkill.sideEffects.length === 0">{{ t("skills.noSideEffects") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.permissions") }}</h4>
                <div class="skills-page__badges">
                  <span v-for="permission in selectedSkill.permissions" :key="permission">{{ permission }}</span>
                  <span v-if="selectedSkill.permissions.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.llmNodeBlockers") }}</h4>
                <div class="skills-page__schema-list">
                  <span v-for="blocker in selectedSkill.llmNodeBlockers" :key="blocker">{{ blocker }}</span>
                  <span v-if="selectedSkill.llmNodeBlockers.length === 0">{{ t("skills.agentNodeReady") }}</span>
                </div>
              </section>
            </div>

            <section class="skills-page__file-browser" :aria-label="t('skills.fileBrowser')">
              <div class="skills-page__file-tree">
                <h4>{{ t("skills.fileTree") }}</h4>
                <div v-if="skillFilesLoading" class="skills-page__file-state">{{ t("skills.fileLoading") }}</div>
                <div v-else-if="skillFilesError" class="skills-page__file-state">{{ skillFilesError }}</div>
                <div v-else-if="flattenedSkillFiles.length === 0" class="skills-page__file-state">{{ t("skills.fileEmpty") }}</div>
                <template v-else>
                  <button
                    v-for="file in flattenedSkillFiles"
                    :key="file.path"
                    type="button"
                    class="skills-page__file-tree-button"
                    :class="{
                      'skills-page__file-tree-button--active': selectedFilePath === file.path,
                      'skills-page__file-tree-button--directory': file.type === 'directory',
                    }"
                    :style="{ paddingLeft: `${12 + file.depth * 14}px` }"
                    :disabled="file.type === 'directory'"
                    @click="selectSkillFile(file.path)"
                  >
                    <span>{{ file.name }}</span>
                    <small v-if="file.type === 'file'">{{ formatFileSize(file.size) }}</small>
                  </button>
                </template>
              </div>

              <div class="skills-page__file-preview">
                <header>
                  <div>
                    <h4>{{ t("skills.filePreview") }}</h4>
                    <p v-if="selectedFile">{{ selectedFile.path }}</p>
                    <p v-else>{{ t("skills.fileSelectHint") }}</p>
                  </div>
                  <span v-if="selectedFile?.executable" class="skills-page__file-pill">{{ t("skills.fileExecutable") }}</span>
                </header>
                <div v-if="skillFileContentLoading" class="skills-page__file-state">{{ t("skills.fileContentLoading") }}</div>
                <div v-else-if="skillFileContentError" class="skills-page__file-state">{{ skillFileContentError }}</div>
                <div v-else-if="!selectedFilePath" class="skills-page__file-state">{{ t("skills.fileSelectHint") }}</div>
                <div v-else-if="skillFileContent?.encoding === 'too_large'" class="skills-page__file-state">
                  {{ t("skills.fileTooLarge") }}
                </div>
                <div v-else-if="skillFileContent?.encoding === 'binary'" class="skills-page__file-state">
                  {{ t("skills.fileBinary") }}
                </div>
                <pre v-else-if="skillFileContent?.content != null" class="skills-page__file-code"><code>{{ skillFileContent?.content }}</code></pre>
                <div v-else class="skills-page__file-state">{{ t("skills.fileUnavailable") }}</div>
              </div>
            </section>
          </article>
        </section>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElInput, ElSwitch } from "element-plus";
import { useI18n } from "vue-i18n";

import {
  deleteSkill,
  fetchSkillCatalog,
  fetchSkillFileContent,
  fetchSkillFiles,
  importSkillUpload,
  updateSkillStatus,
} from "@/api/skills";
import AppShell from "@/layouts/AppShell.vue";
import type { SkillDefinition, SkillFileContentResponse, SkillFileNode, SkillFileTreeResponse } from "@/types/skills";

import {
  buildSkillOverview,
  buildSkillStatusOptions,
  filterSkillsForManagement,
  listSkillRunPolicies,
  type SkillStatusFilter,
} from "./skillsPageModel.ts";

type FlatSkillFileNode = SkillFileNode & {
  depth: number;
};

const skills = ref<SkillDefinition[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionSkillKey = ref<string | null>(null);
const confirmingSkillDeleteKey = ref<string | null>(null);
const importMode = ref<"archive" | "folder" | null>(null);
const skillArchiveInput = ref<HTMLInputElement | null>(null);
const skillDirectoryInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const statusFilter = ref<SkillStatusFilter>("all");
const selectedSkillKey = ref("");
const skillFileTree = ref<SkillFileTreeResponse | null>(null);
const skillFilesLoading = ref(false);
const skillFilesError = ref<string | null>(null);
const selectedFilePath = ref("");
const skillFileContent = ref<SkillFileContentResponse | null>(null);
const skillFileContentLoading = ref(false);
const skillFileContentError = ref<string | null>(null);
const { t } = useI18n();

let fileTreeRequestId = 0;
let fileContentRequestId = 0;

const overview = computed(() => buildSkillOverview(skills.value));
const filteredSkills = computed(() => filterSkillsForManagement(skills.value, { query: query.value, status: statusFilter.value }));
const selectedSkill = computed(() => filteredSkills.value.find((skill) => skill.skillKey === selectedSkillKey.value) ?? null);
const flattenedSkillFiles = computed<FlatSkillFileNode[]>(() => flattenSkillFiles(skillFileTree.value?.root.children ?? []));
const selectedFile = computed(() => flattenedSkillFiles.value.find((file) => file.path === selectedFilePath.value) ?? null);
const statusOptions = computed(() =>
  buildSkillStatusOptions().map((value) => ({
    value,
    label: t(`skills.${value}`),
  })),
);

watch(
  filteredSkills,
  (availableSkills) => {
    if (availableSkills.some((skill) => skill.skillKey === selectedSkillKey.value)) {
      return;
    }
    selectedSkillKey.value = availableSkills[0]?.skillKey ?? "";
  },
  { immediate: true },
);

watch(selectedSkillKey, (skillKey) => {
  void loadSkillFilesForSelection(skillKey);
});

async function loadSkills() {
  loading.value = true;
  try {
    skills.value = await fetchSkillCatalog({ includeDisabled: true });
    error.value = null;
    actionError.value = null;
  } catch (fetchError) {
    error.value = fetchError instanceof Error ? fetchError.message : t("common.loading");
  } finally {
    loading.value = false;
  }
}

function replaceSkill(updatedSkill: SkillDefinition) {
  skills.value = skills.value.map((skill) => (skill.skillKey === updatedSkill.skillKey ? updatedSkill : skill));
}

function selectSkill(skillKey: string) {
  selectedSkillKey.value = skillKey;
  confirmingSkillDeleteKey.value = null;
}

function enabledToggleLabel(skill: SkillDefinition) {
  return skill.status === "active" ? t("skills.disable") : t("skills.enable");
}

function runPolicyOriginEntries(skill: SkillDefinition) {
  return listSkillRunPolicies(skill);
}

function formatRunPolicy(origin: string, policy: SkillDefinition["runPolicies"]["default"]) {
  return [
    origin,
    policy.discoverable ? t("skills.policyDiscoverable") : t("skills.policyHidden"),
    policy.autoSelectable ? t("skills.policyAutoSelectable") : t("skills.policyManualOnly"),
    policy.requiresApproval ? t("skills.policyRequiresApproval") : t("skills.policyNoApproval"),
  ].join(" · ");
}

async function importUploadedSkill(event: Event, mode: "archive" | "folder") {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) {
    return;
  }
  const relativePaths = mode === "folder" ? files.map((file) => file.webkitRelativePath || file.name) : [];
  importMode.value = mode;
  actionError.value = null;
  confirmingSkillDeleteKey.value = null;
  try {
    await importSkillUpload(files, relativePaths);
    await loadSkills();
  } catch (uploadError) {
    actionError.value = uploadError instanceof Error ? uploadError.message : t("common.loading");
  } finally {
    importMode.value = null;
    input.value = "";
  }
}

async function setSkillEnabled(skill: SkillDefinition, enabled: boolean) {
  await setSkillStatus(skill, enabled ? "active" : "disabled");
}

async function setSkillStatus(skill: SkillDefinition, status: SkillDefinition["status"]) {
  actionSkillKey.value = skill.skillKey;
  actionError.value = null;
  confirmingSkillDeleteKey.value = null;
  try {
    replaceSkill(await updateSkillStatus(skill.skillKey, status));
  } catch (updateError) {
    actionError.value = updateError instanceof Error ? updateError.message : t("common.loading");
  } finally {
    actionSkillKey.value = null;
  }
}

async function deleteSkillFromCatalog(skill: SkillDefinition) {
  if (confirmingSkillDeleteKey.value !== skill.skillKey) {
    confirmingSkillDeleteKey.value = skill.skillKey;
    return;
  }
  actionSkillKey.value = skill.skillKey;
  actionError.value = null;
  try {
    await deleteSkill(skill.skillKey);
    skills.value = skills.value.filter((item) => item.skillKey !== skill.skillKey);
    confirmingSkillDeleteKey.value = null;
  } catch (deleteError) {
    actionError.value = deleteError instanceof Error ? deleteError.message : t("common.loading");
  } finally {
    actionSkillKey.value = null;
  }
}

async function loadSkillFilesForSelection(skillKey: string) {
  const requestId = ++fileTreeRequestId;
  ++fileContentRequestId;
  skillFileTree.value = null;
  selectedFilePath.value = "";
  skillFileContent.value = null;
  skillFileContentError.value = null;
  skillFilesError.value = null;

  if (!skillKey) {
    skillFilesLoading.value = false;
    return;
  }

  skillFilesLoading.value = true;
  try {
    const tree = await fetchSkillFiles(skillKey);
    if (requestId !== fileTreeRequestId) {
      return;
    }
    skillFileTree.value = tree;
    const initialFilePath = pickInitialFilePath(tree.root);
    if (initialFilePath) {
      selectedFilePath.value = initialFilePath;
      await loadSkillFileContent(skillKey, initialFilePath);
    }
  } catch (fileError) {
    if (requestId === fileTreeRequestId) {
      skillFilesError.value = fileError instanceof Error ? fileError.message : t("common.loading");
    }
  } finally {
    if (requestId === fileTreeRequestId) {
      skillFilesLoading.value = false;
    }
  }
}

async function selectSkillFile(path: string) {
  if (!selectedSkill.value || selectedFilePath.value === path) {
    return;
  }
  selectedFilePath.value = path;
  await loadSkillFileContent(selectedSkill.value.skillKey, path);
}

async function loadSkillFileContent(skillKey: string, path: string) {
  const requestId = ++fileContentRequestId;
  skillFileContent.value = null;
  skillFileContentError.value = null;
  skillFileContentLoading.value = true;
  try {
    const content = await fetchSkillFileContent(skillKey, path);
    if (requestId !== fileContentRequestId || selectedSkillKey.value !== skillKey || selectedFilePath.value !== path) {
      return;
    }
    skillFileContent.value = content;
  } catch (contentError) {
    if (requestId === fileContentRequestId) {
      skillFileContentError.value = contentError instanceof Error ? contentError.message : t("common.loading");
    }
  } finally {
    if (requestId === fileContentRequestId) {
      skillFileContentLoading.value = false;
    }
  }
}

function flattenSkillFiles(nodes: SkillFileNode[], depth = 0): FlatSkillFileNode[] {
  return nodes.flatMap((node) => [{ ...node, depth }, ...flattenSkillFiles(node.children, depth + 1)]);
}

function pickInitialFilePath(root: SkillFileNode): string {
  const files = flattenSkillFiles(root.children).filter((file) => file.type === "file");
  return (
    files.find((file) => file.name === "skill.json")?.path ??
    files.find((file) => file.name === "SKILL.md")?.path ??
    files.find((file) => file.previewable)?.path ??
    files[0]?.path ??
    ""
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

onMounted(loadSkills);
</script>

<style scoped>
.skills-page {
  --skills-page-panel-shadow: 0 10px 24px rgba(61, 43, 24, 0.04);
  --skills-page-card-shadow: 0 4px 12px rgba(61, 43, 24, 0.026);

  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.skills-page__hero,
.skills-page__toolbar,
.skills-page__empty,
.skills-page__notice {
  min-width: 0;
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--skills-page-panel-shadow);
}

.skills-page__metric,
.skills-page__selector,
.skills-page__detail {
  box-shadow: var(--skills-page-card-shadow);
}

.skills-page__hero > *,
.skills-page__search-field,
.skills-page__status-filter,
.skills-page__hero-actions,
.skills-page__selector,
.skills-page__detail,
.skills-page__detail-header > *,
.skills-page__taxonomy section,
.skills-page__columns section,
.skills-page__file-tree,
.skills-page__file-preview {
  min-width: 0;
}

.skills-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
}

.skills-page__hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.skills-page__file-input {
  display: none;
}

.skills-page__eyebrow,
.skills-page__id {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.skills-page__title {
  margin: 8px 0 10px;
  color: var(--graphite-text-strong);
  font-family: var(--graphite-font-display);
  font-size: 2rem;
  line-height: 1.16;
  overflow-wrap: anywhere;
}

.skills-page__body,
.skills-page__detail-header p,
.skills-page__empty,
.skills-page__notice,
.skills-page__result-count,
.skills-page__source,
.skills-page__file-preview p,
.skills-page__file-state {
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.skills-page__body,
.skills-page__detail-header p,
.skills-page__file-preview p {
  margin: 0;
  overflow-wrap: anywhere;
}

.skills-page__refresh,
.skills-page__action {
  border: 1px solid rgba(154, 52, 18, 0.2);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  cursor: pointer;
  font: inherit;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.skills-page__refresh:hover,
.skills-page__action:hover {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 250, 242, 1);
  transform: translateY(-1px);
}

.skills-page__refresh:disabled,
.skills-page__action:disabled {
  cursor: not-allowed;
  opacity: 0.62;
  transform: none;
}

.skills-page__action--danger {
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(255, 245, 242, 0.96);
  color: rgb(153, 27, 27);
}

.skills-page__refresh:focus-visible,
.skills-page__action:focus-visible,
.skills-page__selector-button:focus-visible,
.skills-page__file-tree-button:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.skills-page__overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.skills-page__metric {
  min-width: 0;
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.62);
}

.skills-page__metric span {
  color: rgba(60, 41, 20, 0.68);
  font-size: 0.84rem;
}

.skills-page__metric strong {
  display: block;
  margin-top: 8px;
  color: var(--graphite-text-strong);
  font-size: 1.35rem;
}

.skills-page__toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 14px;
  align-items: end;
  padding: 16px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
}

.skills-page__search-field,
.skills-page__status-filter {
  display: grid;
  gap: 8px;
  color: rgba(60, 41, 20, 0.72);
}

.skills-page__search {
  width: 100%;
}

.skills-page__filter-tabs {
  display: flex;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 14px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.42);
}

.skills-page__filter-tab {
  flex: 0 0 auto;
  border: 0;
  border-radius: 10px;
  padding: 6px 10px;
  background: transparent;
  color: rgba(60, 41, 20, 0.68);
  cursor: pointer;
  font: inherit;
  transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.skills-page__filter-tab:hover {
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.68);
}

.skills-page__filter-tab--active {
  background: rgba(255, 248, 240, 0.96);
  color: rgb(154, 52, 18);
  box-shadow: inset 0 0 0 1px rgba(154, 52, 18, 0.1), 0 4px 10px rgba(154, 52, 18, 0.06);
}

.skills-page__filter-tab:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.skills-page__list {
  display: grid;
  gap: 12px;
}

.skills-page__empty,
.skills-page__notice {
  padding: 24px;
}

.skills-page__workspace {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  min-width: 0;
}

.skills-page__selector,
.skills-page__detail {
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-card);
}

.skills-page__selector {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 6px;
  max-height: calc(100vh - 120px);
  overflow: auto;
  padding: 12px;
}

.skills-page__result-count {
  padding: 4px 4px 8px;
  font-size: 0.84rem;
}

.skills-page__selector-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 14px;
  padding: 6px 8px 6px 10px;
  background: rgba(255, 255, 255, 0.36);
  transition: background-color 160ms ease, border-color 160ms ease;
}

.skills-page__selector-item--active {
  border-color: rgba(154, 52, 18, 0.18);
  background: rgba(255, 248, 240, 0.96);
}

.skills-page__selector-button {
  min-width: 0;
  border: 0;
  padding: 6px 0;
  background: transparent;
  color: var(--graphite-text-strong);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.skills-page__selector-button span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-page__detail {
  display: grid;
  gap: 16px;
  padding: 18px;
}

.skills-page__detail-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.8fr);
  gap: 18px;
}

.skills-page__detail-header h3,
.skills-page__detail h4,
.skills-page__file-preview h4 {
  margin: 0;
}

.skills-page__detail-header h3 {
  margin: 6px 0 8px;
  color: var(--graphite-text-strong);
  font-size: 1.28rem;
}

.skills-page__detail h4,
.skills-page__file-preview h4 {
  color: rgba(60, 41, 20, 0.76);
  font-size: 0.86rem;
}

.skills-page__status,
.skills-page__actions,
.skills-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.skills-page__actions {
  margin-top: -4px;
}

.skills-page__taxonomy {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.skills-page__status span,
.skills-page__badges span,
.skills-page__schema-list span,
.skills-page__file-pill {
  display: inline-block;
  max-width: 100%;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--graphite-font-mono);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
  white-space: normal;
}

.skills-page__status .skills-page__status-warning {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 245, 242, 0.96);
  color: rgb(153, 27, 27);
}

.skills-page__source {
  display: grid;
  gap: 4px;
  font-family: var(--graphite-font-mono);
  font-size: 0.82rem;
}

.skills-page__source code {
  word-break: break-all;
}

.skills-page__columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.skills-page__taxonomy section,
.skills-page__columns section,
.skills-page__schema-list {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.skills-page__file-browser {
  display: grid;
  grid-template-columns: minmax(210px, 0.38fr) minmax(0, 1fr);
  gap: 12px;
  border-top: 1px solid rgba(154, 52, 18, 0.08);
  padding-top: 16px;
}

.skills-page__file-tree,
.skills-page__file-preview {
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 240px;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.36);
  padding: 12px;
}

.skills-page__file-tree {
  max-height: 520px;
  overflow: auto;
}

.skills-page__file-tree-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 7px 10px;
  background: transparent;
  color: rgba(60, 41, 20, 0.82);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.skills-page__file-tree-button:hover:not(:disabled),
.skills-page__file-tree-button--active {
  border-color: rgba(154, 52, 18, 0.12);
  background: rgba(255, 248, 240, 0.9);
  color: rgb(154, 52, 18);
}

.skills-page__file-tree-button:disabled {
  cursor: default;
  opacity: 0.78;
}

.skills-page__file-tree-button--directory {
  color: rgba(60, 41, 20, 0.58);
  font-weight: 600;
}

.skills-page__file-tree-button span,
.skills-page__file-tree-button small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-page__file-tree-button small {
  color: rgba(60, 41, 20, 0.48);
  font-family: var(--graphite-font-mono);
  font-size: 0.72rem;
}

.skills-page__file-preview header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.skills-page__file-code {
  max-height: 460px;
  margin: 0;
  overflow: auto;
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 14px;
  padding: 12px;
  background: rgba(39, 29, 20, 0.92);
  color: rgba(255, 248, 240, 0.92);
  font-family: var(--graphite-font-mono);
  font-size: 0.82rem;
  line-height: 1.55;
  white-space: pre;
}

.skills-page__file-state {
  display: grid;
  place-items: center;
  min-height: 150px;
  border: 1px dashed rgba(154, 52, 18, 0.12);
  border-radius: 14px;
  padding: 16px;
  text-align: center;
}

@media (max-width: 1180px) {
  .skills-page__detail-header,
  .skills-page__file-browser {
    grid-template-columns: 1fr;
  }

  .skills-page__taxonomy {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  .skills-page__workspace {
    grid-template-columns: 1fr;
  }

  .skills-page__selector {
    position: static;
    max-height: 360px;
  }

  .skills-page__toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .skills-page__hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .skills-page__hero-actions,
  .skills-page__refresh {
    width: 100%;
  }

  .skills-page__hero-actions {
    display: grid;
    grid-template-columns: 1fr;
    justify-content: stretch;
  }

  .skills-page__action {
    width: 100%;
  }

  .skills-page__title {
    font-size: 1.6rem;
  }

  .skills-page {
    max-width: 100%;
  }

  .skills-page__overview,
  .skills-page__taxonomy,
  .skills-page__columns {
    grid-template-columns: 1fr;
  }

  .skills-page__detail,
  .skills-page__selector {
    border-radius: 18px;
  }
}
</style>
