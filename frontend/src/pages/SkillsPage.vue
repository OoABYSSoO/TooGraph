<template>
  <AppShell>
    <section class="skills-page">
      <header class="skills-page__hero">
        <div>
          <div class="skills-page__eyebrow">{{ t("skills.eyebrow") }}</div>
          <h2 class="skills-page__title">{{ t("skills.title") }}</h2>
          <p class="skills-page__body">{{ t("skills.body") }}</p>
        </div>
        <button type="button" class="skills-page__refresh" :disabled="loading" @click="loadSkills">
          {{ loading ? t("skills.refreshing") : t("skills.refresh") }}
        </button>
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
          <span>{{ t("skills.runtimeRegistered") }}</span>
          <strong>{{ overview.runtimeRegistered }}</strong>
        </article>
        <article class="skills-page__metric">
          <span>{{ t("skills.manageableCount") }} / {{ t("skills.importableCount") }}</span>
          <strong>{{ overview.manageable }} / {{ overview.importable }}</strong>
        </article>
      </section>

      <section class="skills-page__toolbar" :aria-label="t('skills.filterLabel')">
        <label class="skills-page__search-field">
          <span>{{ t("common.search") }}</span>
          <ElInput v-model="query" class="skills-page__search" :placeholder="t('skills.searchPlaceholder')" clearable />
        </label>
        <div class="skills-page__status-filter">
          <span>{{ t("skills.statusFilter") }}</span>
          <ElSegmented v-model="statusFilter" class="skills-page__segments" :options="statusOptions" />
        </div>
      </section>

      <section class="skills-page__list">
        <article v-if="actionError" class="skills-page__notice">{{ t("skills.actionFailed", { error: actionError }) }}</article>
        <article v-if="loading" class="skills-page__empty">{{ t("common.loading") }}</article>
        <article v-else-if="error" class="skills-page__empty">{{ t("common.failedToLoad", { error }) }}</article>
        <article v-else-if="filteredSkills.length === 0" class="skills-page__empty">{{ t("skills.empty") }}</article>
        <template v-else>
          <div class="skills-page__result-count">{{ t("skills.resultCount", { count: filteredSkills.length }) }}</div>
          <article v-for="skill in filteredSkills" :key="skill.skillKey" class="skills-page__card">
            <div class="skills-page__card-heading">
              <div>
                <div class="skills-page__id">{{ skill.skillKey }}</div>
                <h3>{{ skill.label }}</h3>
              </div>
              <div class="skills-page__status">
                <span>{{ t(`skills.${skill.status}`) }}</span>
                <span>{{ skill.runtimeRegistered ? t("skills.runtime") : t("common.off") }}</span>
                <span v-if="skill.canManage">{{ t("skills.manageable") }}</span>
                <span v-if="skill.canImport">{{ t("skills.importable") }}</span>
              </div>
            </div>

            <p>{{ skill.description }}</p>

            <div class="skills-page__actions" :aria-label="t('skills.actions')">
              <button
                v-if="skill.canImport"
                type="button"
                class="skills-page__action"
                :disabled="actionSkillKey === skill.skillKey"
                @click="importSkillIntoCatalog(skill)"
              >
                {{ t("skills.import") }}
              </button>
              <button
                v-if="skill.canManage && skill.status === 'disabled'"
                type="button"
                class="skills-page__action"
                :disabled="actionSkillKey === skill.skillKey"
                @click="setSkillStatus(skill, 'active')"
              >
                {{ t("skills.enable") }}
              </button>
              <button
                v-else-if="skill.canManage"
                type="button"
                class="skills-page__action"
                :disabled="actionSkillKey === skill.skillKey"
                @click="setSkillStatus(skill, 'disabled')"
              >
                {{ t("skills.disable") }}
              </button>
              <button
                v-if="skill.canManage"
                type="button"
                class="skills-page__action"
                :class="{ 'skills-page__action--danger': confirmingSkillDeleteKey === skill.skillKey }"
                :disabled="actionSkillKey === skill.skillKey"
                @click="deleteSkillFromCatalog(skill)"
              >
                {{ confirmingSkillDeleteKey === skill.skillKey ? t("skills.confirmDelete") : t("skills.delete") }}
              </button>
            </div>

            <div class="skills-page__source">
              <span>{{ t("skills.source") }}: {{ skill.sourceScope }} / {{ skill.sourceFormat }}</span>
              <code>{{ skill.sourcePath }}</code>
            </div>

            <div class="skills-page__columns">
              <section>
                <h4>{{ t("skills.inputSchema") }}</h4>
                <div class="skills-page__schema-list">
                  <span v-for="field in skill.inputSchema" :key="`in-${field.key}`">
                    {{ field.key }} · {{ field.valueType }} · {{ field.required ? t("skills.required") : t("skills.optional") }}
                  </span>
                  <span v-if="skill.inputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.outputSchema") }}</h4>
                <div class="skills-page__schema-list">
                  <span v-for="field in skill.outputSchema" :key="`out-${field.key}`">
                    {{ field.key }} · {{ field.valueType }} · {{ field.required ? t("skills.required") : t("skills.optional") }}
                  </span>
                  <span v-if="skill.outputSchema.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.supportedTypes") }}</h4>
                <div class="skills-page__badges">
                  <span v-for="valueType in skill.supportedValueTypes" :key="valueType">{{ valueType }}</span>
                  <span v-if="skill.supportedValueTypes.length === 0">{{ t("common.none") }}</span>
                </div>
              </section>
              <section>
                <h4>{{ t("skills.sideEffects") }}</h4>
                <div class="skills-page__badges">
                  <span v-for="effect in skill.sideEffects" :key="effect">{{ effect }}</span>
                  <span v-if="skill.sideEffects.length === 0">{{ t("skills.noSideEffects") }}</span>
                </div>
              </section>
            </div>

            <section class="skills-page__compatibility">
              <h4>{{ t("skills.compatibility") }}</h4>
              <div v-if="skill.compatibility.length === 0" class="skills-page__compatibility-empty">{{ t("skills.noCompatibility") }}</div>
              <div v-for="item in skill.compatibility" :key="item.target" class="skills-page__compatibility-row">
                <strong>{{ item.target }} · {{ item.status }}</strong>
                <span>{{ item.summary }}</span>
                <small v-if="item.missingCapabilities.length > 0">
                  {{ t("skills.missingCapabilities") }}: {{ item.missingCapabilities.join(", ") }}
                </small>
              </div>
            </section>
          </article>
        </template>
      </section>
    </section>
  </AppShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElInput, ElSegmented } from "element-plus";
import { useI18n } from "vue-i18n";

import { deleteSkill, fetchSkillCatalog, importSkill, updateSkillStatus } from "@/api/skills";
import AppShell from "@/layouts/AppShell.vue";
import type { SkillDefinition } from "@/types/skills";

import {
  buildSkillOverview,
  buildSkillStatusOptions,
  filterSkillsForManagement,
  type SkillStatusFilter,
} from "./skillsPageModel.ts";

const skills = ref<SkillDefinition[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const actionSkillKey = ref<string | null>(null);
const confirmingSkillDeleteKey = ref<string | null>(null);
const query = ref("");
const statusFilter = ref<SkillStatusFilter>("all");
const { t } = useI18n();

const overview = computed(() => buildSkillOverview(skills.value));
const filteredSkills = computed(() => filterSkillsForManagement(skills.value, { query: query.value, status: statusFilter.value }));
const statusOptions = computed(() =>
  buildSkillStatusOptions().map((value) => ({
    value,
    label: t(`skills.${value}`),
  })),
);

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

async function importSkillIntoCatalog(skill: SkillDefinition) {
  actionSkillKey.value = skill.skillKey;
  actionError.value = null;
  confirmingSkillDeleteKey.value = null;
  try {
    replaceSkill(await importSkill(skill.skillKey));
  } catch (importError) {
    actionError.value = importError instanceof Error ? importError.message : t("common.loading");
  } finally {
    actionSkillKey.value = null;
  }
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

onMounted(loadSkills);
</script>

<style scoped>
.skills-page {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

.skills-page__hero,
.skills-page__toolbar,
.skills-page__metric,
.skills-page__card,
.skills-page__empty,
.skills-page__notice {
  min-width: 0;
  border: 1px solid var(--graphite-border);
  border-radius: 24px;
  background: var(--graphite-surface-panel);
  box-shadow: var(--graphite-shadow-panel);
}

.skills-page__hero > *,
.skills-page__search-field,
.skills-page__status-filter,
.skills-page__card-heading > *,
.skills-page__columns section,
.skills-page__compatibility {
  min-width: 0;
}

.skills-page__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px;
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
.skills-page__card p,
.skills-page__empty,
.skills-page__notice,
.skills-page__result-count,
.skills-page__source,
.skills-page__compatibility-empty {
  color: rgba(60, 41, 20, 0.72);
  line-height: 1.6;
}

.skills-page__body,
.skills-page__card p {
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
.skills-page__action:focus-visible {
  outline: 2px solid rgba(216, 166, 80, 0.5);
  outline-offset: 2px;
}

.skills-page__overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.skills-page__metric {
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

.skills-page__segments {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.skills-page__segments :deep(.el-segmented__group) {
  gap: 4px;
}

.skills-page__segments :deep(.el-segmented__item.is-selected) {
  color: var(--graphite-accent-strong);
}

.skills-page__segments :deep(.el-segmented__item-selected) {
  background: rgba(255, 248, 240, 0.96);
  box-shadow: 0 8px 18px rgba(154, 52, 18, 0.12);
}

.skills-page__list {
  display: grid;
  gap: 12px;
}

.skills-page__empty,
.skills-page__notice {
  padding: 24px;
}

.skills-page__card {
  display: grid;
  gap: 16px;
  padding: 18px;
  background: var(--graphite-surface-card);
}

.skills-page__card-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.skills-page__card h3,
.skills-page__card h4 {
  margin: 0;
}

.skills-page__card h3 {
  margin-top: 6px;
  color: var(--graphite-text-strong);
}

.skills-page__card h4 {
  color: rgba(60, 41, 20, 0.76);
  font-size: 0.86rem;
}

.skills-page__status,
.skills-page__actions,
.skills-page__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skills-page__actions {
  margin-top: -4px;
}

.skills-page__status span,
.skills-page__badges span,
.skills-page__schema-list span {
  border: 1px solid rgba(154, 52, 18, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
  font-family: var(--graphite-font-mono);
  font-size: 0.82rem;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.skills-page__columns section,
.skills-page__schema-list,
.skills-page__compatibility {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
}

.skills-page__compatibility-row {
  display: grid;
  gap: 4px;
  border-top: 1px solid rgba(154, 52, 18, 0.1);
  padding-top: 10px;
  color: rgba(60, 41, 20, 0.72);
}

.skills-page__compatibility-row strong {
  color: var(--graphite-text-strong);
}

.skills-page__compatibility-row small {
  color: rgba(154, 52, 18, 0.82);
}

@media (max-width: 1100px) {
  .skills-page__overview,
  .skills-page__columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .skills-page__toolbar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .skills-page__hero,
  .skills-page__card-heading {
    display: grid;
  }

  .skills-page__refresh {
    width: 100%;
  }

  .skills-page__action {
    flex: 1 1 120px;
  }

  .skills-page__title {
    font-size: 1.6rem;
  }

  .skills-page {
    max-width: calc(100vw - var(--app-sidebar-width) - 56px);
  }

  .skills-page__overview,
  .skills-page__columns {
    grid-template-columns: 1fr;
  }
}
</style>
