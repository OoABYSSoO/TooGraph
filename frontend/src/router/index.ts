import { createRouter, createWebHistory } from "vue-router";

import { fetchSettings } from "@/api/settings";
import { isDeveloperNavigationPath } from "@/lib/navigation";

const BuddyPage = () => import("@/pages/BuddyPage.vue");
const EditorPage = () => import("@/pages/EditorPage.vue");
const GraphLibraryPage = () => import("@/pages/GraphLibraryPage.vue");
const HomePage = () => import("@/pages/HomePage.vue");
const KnowledgePage = () => import("@/pages/KnowledgePage.vue");
const LocalFilesPage = () => import("@/pages/LocalFilesPage.vue");
const MessagePlatformsPage = () => import("@/pages/MessagePlatformsPage.vue");
const ModelLogsPage = () => import("@/pages/ModelLogsPage.vue");
const ModelProvidersPage = () => import("@/pages/ModelProvidersPage.vue");
const EvidenceSearchPage = () => import("@/pages/EvidenceSearchPage.vue");
const PresetsPage = () => import("@/pages/PresetsPage.vue");
const RunDetailPage = () => import("@/pages/RunDetailPage.vue");
const RunsPage = () => import("@/pages/RunsPage.vue");
const SchedulerPage = () => import("@/pages/SchedulerPage.vue");
const SettingsPage = () => import("@/pages/SettingsPage.vue");
const ActionsPage = () => import("@/pages/ActionsPage.vue");
const ToolsPage = () => import("@/pages/ToolsPage.vue");

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
    { path: "/workspace", component: LocalFilesPage },
    { path: "/scheduler", component: SchedulerPage },
    { path: "/buddy", component: BuddyPage },
    { path: "/message-platforms", component: MessagePlatformsPage },
    { path: "/presets", component: PresetsPage },
    { path: "/actions", component: ActionsPage },
    { path: "/tools", component: ToolsPage },
    { path: "/models", component: ModelProvidersPage },
    { path: "/model-logs", component: ModelLogsPage },
    { path: "/evidence", component: EvidenceSearchPage },
    { path: "/runs", component: RunsPage },
    { path: "/runs/:runId", component: RunDetailPage },
    { path: "/settings", component: SettingsPage },
  ],
});

router.beforeEach(async (to) => {
  if (!isDeveloperNavigationPath(to.path)) {
    return true;
  }
  try {
    const settings = await fetchSettings();
    if (settings.ui_preferences?.developer_mode) {
      return true;
    }
  } catch {
    // Keep unfinished pages hidden when settings cannot be loaded.
  }
  return {
    path: "/settings",
    query: {
      developerModeRequired: "1",
      from: to.fullPath,
    },
  };
});
