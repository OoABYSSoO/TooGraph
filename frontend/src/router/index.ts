import { createRouter, createWebHistory } from "vue-router";

import EditorPage from "@/pages/EditorPage.vue";
import HomePage from "@/pages/HomePage.vue";
import ModelLogsPage from "@/pages/ModelLogsPage.vue";
import ModelProvidersPage from "@/pages/ModelProvidersPage.vue";
import PresetsPage from "@/pages/PresetsPage.vue";
import RunDetailPage from "@/pages/RunDetailPage.vue";
import RunsPage from "@/pages/RunsPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import SkillsPage from "@/pages/SkillsPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { left: 0, top: 0 },
  routes: [
    { path: "/", component: HomePage },
    { path: "/editor", component: EditorPage },
    { path: "/editor/new", component: EditorPage },
    { path: "/editor/:graphId", component: EditorPage },
    { path: "/presets", component: PresetsPage },
    { path: "/skills", component: SkillsPage },
    { path: "/models", component: ModelProvidersPage },
    { path: "/model-logs", component: ModelLogsPage },
    { path: "/runs", component: RunsPage },
    { path: "/runs/:runId", component: RunDetailPage },
    { path: "/settings", component: SettingsPage },
  ],
});
