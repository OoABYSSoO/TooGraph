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
        'app-shell__sidebar--hidden': isSidebarCollapsed,
      }"
    >
      <div class="app-shell__brand">
        <div class="app-shell__eyebrow">GraphiteUI</div>
        <h1 class="app-shell__title">GraphiteUI</h1>
        <p class="app-shell__note">面向 LangGraph 工作流的可视化编排工作台。</p>
      </div>

      <nav class="app-shell__nav">
        <RouterLink to="/" class="app-shell__link">首页</RouterLink>
        <RouterLink to="/editor" class="app-shell__link">编辑器</RouterLink>
        <RouterLink to="/runs" class="app-shell__link">运行记录</RouterLink>
        <RouterLink to="/settings" class="app-shell__link">设置</RouterLink>
      </nav>

      <button type="button" class="app-shell__collapse" @click="setSidebarCollapsed(true)">收起侧栏</button>
    </aside>

    <button
      v-if="isSidebarCollapsed"
      type="button"
      class="app-shell__expand"
      @click="setSidebarCollapsed(false)"
    >
      展开侧栏
    </button>

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
  min-height: 100vh;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  background: linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(248, 237, 219, 0.96) 100%);
  color: #3c2914;
}

.app-shell--editor {
  grid-template-columns: 240px minmax(0, 1fr);
}

.app-shell__sidebar {
  border-right: 1px solid rgba(154, 52, 18, 0.12);
  padding: 24px 20px;
  display: grid;
  align-content: start;
  gap: 24px;
  background: rgba(255, 252, 247, 0.78);
  backdrop-filter: blur(10px);
  transition: 180ms ease;
}

.app-shell__sidebar--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-12px);
  width: 0;
  padding-left: 0;
  padding-right: 0;
  border-right-width: 0;
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
  display: grid;
  gap: 10px;
}

.app-shell__link {
  border: 1px solid rgba(154, 52, 18, 0.14);
  border-radius: 999px;
  padding: 10px 14px;
  color: inherit;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.72);
}

.app-shell__link.router-link-active {
  border-color: rgba(154, 52, 18, 0.28);
  background: rgba(255, 248, 240, 0.92);
  color: rgb(154, 52, 18);
}

.app-shell__collapse,
.app-shell__expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  background: rgba(255, 255, 255, 0.86);
  color: #3c2914;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(154, 52, 18, 0.08);
}

.app-shell__expand {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 20;
  padding: 0 16px;
}

.app-shell__content {
  min-width: 0;
  padding: 28px;
}

.app-shell__content--editor {
  padding: 0;
  height: 100vh;
  overflow: hidden;
}
</style>
