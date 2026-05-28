import { createRouter, createWebHistory } from "vue-router";

const BuddyPage = () => import("@/pages/BuddyPage.vue");
const CuratorReportsPage = () => import("@/pages/CuratorReportsPage.vue");
const EditorPage = () => import("@/pages/EditorPage.vue");
const GraphLibraryPage = () => import("@/pages/GraphLibraryPage.vue");
const HomePage = () => import("@/pages/HomePage.vue");
const ImprovementCandidatesPage = () => import("@/pages/ImprovementCandidatesPage.vue");
const KnowledgePage = () => import("@/pages/KnowledgePage.vue");
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
    { path: "/scheduler", component: SchedulerPage },
    { path: "/curator-reports", component: CuratorReportsPage },
    { path: "/buddy", component: BuddyPage },
    { path: "/message-platforms", component: MessagePlatformsPage },
    { path: "/presets", component: PresetsPage },
    { path: "/actions", component: ActionsPage },
    { path: "/improvements", component: ImprovementCandidatesPage },
    { path: "/models", component: ModelProvidersPage },
    { path: "/model-logs", component: ModelLogsPage },
    { path: "/evidence", component: EvidenceSearchPage },
    { path: "/runs", component: RunsPage },
    { path: "/runs/:runId", component: RunDetailPage },
    { path: "/settings", component: SettingsPage },
  ],
});
