import { createRouter, createWebHistory } from "vue-router";

const BuddyPage = () => import("@/pages/BuddyPage.vue");
const EditorPage = () => import("@/pages/EditorPage.vue");
const EvalsPage = () => import("@/pages/EvalsPage.vue");
const GraphLibraryPage = () => import("@/pages/GraphLibraryPage.vue");
const HomePage = () => import("@/pages/HomePage.vue");
const KnowledgePage = () => import("@/pages/KnowledgePage.vue");
const ModelLogsPage = () => import("@/pages/ModelLogsPage.vue");
const ModelProvidersPage = () => import("@/pages/ModelProvidersPage.vue");
const PresetsPage = () => import("@/pages/PresetsPage.vue");
const RunDetailPage = () => import("@/pages/RunDetailPage.vue");
const RunsPage = () => import("@/pages/RunsPage.vue");
const SettingsPage = () => import("@/pages/SettingsPage.vue");
const ActionsPage = () => import("@/pages/ActionsPage.vue");

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { left: 0, top: 0 },
  routes: [
    { path: "/", component: HomePage },
    { path: "/editor", component: EditorPage },
    { path: "/editor/new", component: EditorPage },
    { path: "/editor/:graphId", component: EditorPage },
    { path: "/library", component: GraphLibraryPage },
    { path: "/knowledge", component: KnowledgePage },
    { path: "/evals", component: EvalsPage },
    { path: "/buddy", component: BuddyPage },
    { path: "/presets", component: PresetsPage },
    { path: "/actions", component: ActionsPage },
    { path: "/models", component: ModelProvidersPage },
    { path: "/model-logs", component: ModelLogsPage },
    { path: "/runs", component: RunsPage },
    { path: "/runs/:runId", component: RunDetailPage },
    { path: "/settings", component: SettingsPage },
  ],
});
