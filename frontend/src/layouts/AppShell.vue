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
        <div class="app-shell__brand-mark" aria-hidden="true">G</div>
        <div class="app-shell__brand-copy">
          <div class="app-shell__eyebrow">GraphiteUI</div>
          <h1 class="app-shell__title">GraphiteUI</h1>
          <p class="app-shell__note">面向 LangGraph 工作流的可视化编排工作台。</p>
        </div>
      </div>

      <nav class="app-shell__nav">
        <RouterLink to="/" class="app-shell__link" title="首页">
          <span class="app-shell__link-short" aria-hidden="true">首</span>
          <span class="app-shell__link-label">首页</span>
        </RouterLink>
        <RouterLink to="/editor" class="app-shell__link" title="编辑器">
          <span class="app-shell__link-short" aria-hidden="true">编</span>
          <span class="app-shell__link-label">编辑器</span>
        </RouterLink>
        <RouterLink to="/runs" class="app-shell__link" title="运行记录">
          <span class="app-shell__link-short" aria-hidden="true">运</span>
          <span class="app-shell__link-label">运行记录</span>
        </RouterLink>
        <RouterLink to="/settings" class="app-shell__link" title="设置">
          <span class="app-shell__link-short" aria-hidden="true">设</span>
          <span class="app-shell__link-label">设置</span>
        </RouterLink>
      </nav>

      <button
        type="button"
        class="app-shell__collapse"
        :aria-label="isSidebarCollapsed ? '展开侧栏' : '收起侧栏'"
        @click="setSidebarCollapsed(!isSidebarCollapsed)"
      >
        <span class="app-shell__collapse-icon" aria-hidden="true">{{ isSidebarCollapsed ? "›" : "‹" }}</span>
        <span class="app-shell__collapse-label">{{ isSidebarCollapsed ? "展开" : "收起侧栏" }}</span>
      </button>
    </aside>

    <main class="app-shell__content" :class="{ 'app-shell__content--editor': isEditorCanvasMode }">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { resolveShellLayoutMode } from "@/lib/layout-mode";

const SIDEBAR_STORAGE_KEY = "graphiteui:sidebar-collapsed";

const route = useRoute();
const isSidebarCollapsed = ref(false);

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
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--app-sidebar-width) minmax(0, 1fr);
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  color: #3c2914;
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
  border-right: 1px solid rgba(154, 52, 18, 0.12);
  padding: 24px 20px;
  display: grid;
  align-content: start;
  gap: 24px;
  background: rgba(255, 252, 247, 0.78);
  backdrop-filter: blur(10px);
  min-height: 0;
  overflow: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  transition: 180ms ease;
}

.app-shell__sidebar--collapsed {
  justify-items: center;
  gap: 18px;
  padding: 18px 10px;
}

.app-shell__brand {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.app-shell__brand-mark {
  display: inline-flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.18);
  border-radius: 16px;
  background: rgba(255, 248, 240, 0.92);
  color: rgba(154, 52, 18, 0.96);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.app-shell__brand-copy {
  min-width: 0;
  transition: opacity 160ms ease;
}

.app-shell__sidebar--collapsed .app-shell__brand {
  grid-template-columns: 40px;
}

.app-shell__sidebar--collapsed .app-shell__brand-copy {
  display: none;
}

.app-shell__eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(154, 52, 18, 0.78);
}

.app-shell__title {
  margin: 6px 0 0;
  font-size: 1.5rem;
}

.app-shell__note {
  margin: 8px 0 0;
  font-size: 0.92rem;
  line-height: 1.5;
  color: rgba(60, 41, 20, 0.68);
}

.app-shell__nav {
  width: 100%;
  display: grid;
  gap: 10px;
}

.app-shell__link {
  display: inline-flex;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  padding: 10px 14px;
  color: inherit;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.72);
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.app-shell__link:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 250, 242, 0.96);
}

.app-shell__link.router-link-active {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
}

.app-shell__link-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell__sidebar:not(.app-shell__sidebar--collapsed) .app-shell__link-short {
  display: none;
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

.app-shell__collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 255, 255, 0.86);
  color: #3c2914;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.app-shell__collapse:hover {
  border-color: rgba(154, 52, 18, 0.24);
  background: rgba(255, 250, 242, 0.98);
}

.app-shell__collapse-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.app-shell__sidebar--collapsed .app-shell__collapse {
  width: 42px;
  padding: 0;
}

.app-shell__sidebar--collapsed .app-shell__collapse-label {
  display: none;
}

.app-shell__content {
  min-width: 0;
  min-height: 0;
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
  .app-shell__link-label,
  .app-shell__collapse-label {
    display: none;
  }

  .app-shell__sidebar:not(.app-shell__sidebar--collapsed) .app-shell__link-short {
    display: inline;
  }

  .app-shell__link {
    width: 42px;
    min-height: 42px;
    justify-content: center;
    padding: 0;
  }

  .app-shell__collapse {
    width: 42px;
    padding: 0;
  }
}
</style>
