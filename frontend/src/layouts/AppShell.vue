<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--editor': isEditorCanvasMode,
      'app-shell--collapsed': isSidebarCollapsed,
    }"
  >
    <aside
      class="app-shell__sidebar"
      :class="{
        'app-shell__sidebar--collapsed': isSidebarCollapsed,
      }"
    >
      <div class="app-shell__brand">
        <button
          type="button"
          class="app-shell__brand-mark"
          :aria-label="isSidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')"
          :title="isSidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')"
          @click="setSidebarCollapsed(!isSidebarCollapsed)"
        >
          <img class="app-shell__brand-logo" src="/logo.svg" alt="" aria-hidden="true" />
        </button>
        <div class="app-shell__brand-copy">
          <h1 class="app-shell__title">TooGraph</h1>
          <p class="app-shell__subtitle">{{ t("app.subtitle") }}</p>
        </div>
      </div>

      <nav class="app-shell__nav">
        <RouterLink
          to="/"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'home' }"
          :title="t('nav.home')"
        >
          <ElIcon class="app-shell__link-icon"><House /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.home") }}</span>
        </RouterLink>
        <RouterLink
          to="/editor"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'editor' }"
          :title="t('nav.editor')"
        >
          <ElIcon class="app-shell__link-icon"><EditPen /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.editor") }}</span>
        </RouterLink>
        <RouterLink
          to="/runs"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'runs' }"
          :title="t('nav.runs')"
        >
          <ElIcon class="app-shell__link-icon"><Clock /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.runs") }}</span>
        </RouterLink>
        <RouterLink
          to="/library"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'graphLibrary' }"
          :title="t('nav.graphLibrary')"
        >
          <ElIcon class="app-shell__link-icon"><Collection /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.graphLibrary") }}</span>
        </RouterLink>
        <RouterLink
          to="/buddy"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'buddy' }"
          :title="t('nav.buddy')"
        >
          <ElIcon class="app-shell__link-icon"><ChatDotRound /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.buddy") }}</span>
        </RouterLink>
        <RouterLink
          to="/presets"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'presets' }"
          :title="t('nav.presets')"
        >
          <ElIcon class="app-shell__link-icon"><CollectionTag /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.presets") }}</span>
        </RouterLink>
        <RouterLink
          to="/skills"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'skills' }"
          :title="t('nav.skills')"
        >
          <ElIcon class="app-shell__link-icon"><Opportunity /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.skills") }}</span>
        </RouterLink>
        <RouterLink
          to="/models"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'models' }"
          :title="t('nav.models')"
        >
          <ElIcon class="app-shell__link-icon"><DataLine /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.models") }}</span>
        </RouterLink>
        <RouterLink
          to="/model-logs"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'modelLogs' }"
          :title="t('nav.modelLogs')"
        >
          <ElIcon class="app-shell__link-icon"><Tickets /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.modelLogs") }}</span>
        </RouterLink>
        <RouterLink
          to="/settings"
          class="app-shell__link"
          :class="{ 'app-shell__link--active': activeNavigationSection === 'settings' }"
          :title="t('nav.settings')"
        >
          <ElIcon class="app-shell__link-icon"><Setting /></ElIcon>
          <span class="app-shell__link-label">{{ t("nav.settings") }}</span>
        </RouterLink>
      </nav>

      <LanguageSwitcher :collapsed="isSidebarCollapsed" />
    </aside>

    <main class="app-shell__content" :class="{ 'app-shell__content--editor': isEditorCanvasMode }">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ElIcon } from "element-plus";
import {
  ChatDotRound,
  House,
  EditPen,
  Clock,
  Collection,
  CollectionTag,
  DataLine,
  Opportunity,
  Setting,
  Tickets,
} from "@element-plus/icons-vue";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import LanguageSwitcher from "./LanguageSwitcher.vue";
import { resolvePrimaryNavigationSection, resolveShellLayoutMode } from "@/lib/layout-mode";

const SIDEBAR_STORAGE_KEY = "toograph:sidebar-collapsed";

const route = useRoute();
const { t } = useI18n();
const isSidebarCollapsed = ref(false);

const activeNavigationSection = computed(() => resolvePrimaryNavigationSection(route.path));
const isEditorCanvasMode = computed(() => resolveShellLayoutMode(route.path) === "editor-canvas");

function setSidebarCollapsed(nextValue: boolean) {
  isSidebarCollapsed.value = nextValue;
}

onMounted(() => {
  const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (saved === "true") {
    isSidebarCollapsed.value = true;
  }
});

watch(isSidebarCollapsed, (nextValue) => {
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, nextValue ? "true" : "false");
});
</script>

<style scoped>
.app-shell {
  --app-sidebar-width: 240px;
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--app-sidebar-width) minmax(0, 1fr);
  overflow: hidden;
  background: var(--toograph-page-bg);
  color: var(--toograph-text);
  font-family: var(--toograph-font-ui);
  transition: grid-template-columns 180ms ease;
}

.app-shell--editor {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.app-shell--collapsed {
  --app-sidebar-width: 64px;
}

.app-shell__sidebar {
  border-right: 1px solid rgba(154, 52, 18, 0.1);
  padding: 18px 12px;
  display: grid;
  align-content: start;
  gap: 18px;
  background: var(--toograph-glass-bg);
  box-shadow: var(--toograph-glass-highlight);
  backdrop-filter: blur(24px) saturate(1.35);
  min-height: 0;
  height: 100vh;
  height: 100dvh;
  max-height: 100vh;
  max-height: 100dvh;
  box-sizing: border-box;
  overflow: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  transition: 180ms ease;
}

.app-shell__sidebar--collapsed {
  justify-items: center;
  gap: 14px;
  padding: 16px 10px;
}

.app-shell__brand {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 2px 4px 10px;
}

.app-shell__brand-mark {
  appearance: none;
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  background: var(--toograph-glass-bg-strong);
  cursor: pointer;
  overflow: hidden;
  padding: 2px;
  box-shadow: var(--toograph-glass-highlight);
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.app-shell__brand-logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.app-shell__brand-mark:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 248, 240, 0.9);
  box-shadow: var(--toograph-glass-highlight), 0 8px 18px rgba(154, 52, 18, 0.1);
  transform: translateY(-1px);
}

.app-shell__brand-mark:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.24), var(--toograph-glass-highlight);
}

.app-shell__brand-copy {
  min-width: 0;
  transition: opacity 160ms ease;
}

.app-shell__sidebar--collapsed .app-shell__brand {
  grid-template-columns: 36px;
  padding-inline: 0;
}

.app-shell__sidebar--collapsed .app-shell__brand-copy {
  display: none;
}

.app-shell__title {
  margin: 0;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: 1rem;
  line-height: 1.15;
}

.app-shell__subtitle {
  margin: 4px 0 0;
  font-size: 0.72rem;
  line-height: 1.2;
  color: var(--toograph-text-muted);
}

.app-shell__nav {
  width: 100%;
  display: grid;
  gap: 4px;
  margin-bottom: auto;
}

.app-shell__link {
  display: inline-flex;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 8px 10px;
  color: inherit;
  text-decoration: none;
  background: transparent;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.app-shell__link:hover {
  border-color: rgba(154, 52, 18, 0.1);
  background: rgba(255, 250, 242, 0.6);
}

.app-shell__link.router-link-active,
.app-shell__link.app-shell__link--active {
  border-color: rgba(154, 52, 18, 0.12);
  background: rgba(255, 248, 240, 0.72);
  color: rgb(154, 52, 18);
  box-shadow: inset 3px 0 0 rgba(154, 52, 18, 0.7);
}

.app-shell__link-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: currentColor;
}

.app-shell__link-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell__sidebar--collapsed .app-shell__link {
  width: 42px;
  min-height: 42px;
  justify-content: center;
  padding: 0;
}

.app-shell__sidebar--collapsed .app-shell__link-label {
  display: none;
}

.app-shell__content {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 28px;
}

.app-shell__content--editor {
  padding: 0;
  height: 100%;
  overflow: hidden;
}

@media (max-width: 760px) {
  .app-shell {
    --app-sidebar-width: 64px;
  }

  .app-shell__sidebar {
    justify-items: center;
    gap: 18px;
    padding: 18px 10px;
  }

  .app-shell__brand {
    grid-template-columns: 40px;
  }

  .app-shell__brand-copy,
  .app-shell__link-label {
    display: none;
  }

  .app-shell__link {
    width: 42px;
    min-height: 42px;
    justify-content: center;
    padding: 0;
  }

}
</style>
