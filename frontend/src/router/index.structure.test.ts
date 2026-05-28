import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const routerSource = readFileSync(resolve(currentDirectory, "index.ts"), "utf8");

test("router resets page scroll on route navigation while preserving browser back-forward positions", () => {
  assert.match(routerSource, /scrollBehavior:\s*\(_to,\s*_from,\s*savedPosition\)\s*=>\s*savedPosition\s*\?\?\s*\{\s*left:\s*0,\s*top:\s*0\s*\}/);
});

test("router exposes first-class management pages for presets and actions", () => {
  assert.doesNotMatch(routerSource, /import \w+Page from "@\/pages\//);
  assert.match(routerSource, /const GraphLibraryPage = \(\) => import\("@\/pages\/GraphLibraryPage\.vue"\);/);
  assert.match(routerSource, /const KnowledgePage = \(\) => import\("@\/pages\/KnowledgePage\.vue"\);/);
  assert.match(routerSource, /const SchedulerPage = \(\) => import\("@\/pages\/SchedulerPage\.vue"\);/);
  assert.match(routerSource, /const CuratorReportsPage = \(\) => import\("@\/pages\/CuratorReportsPage\.vue"\);/);
  assert.match(routerSource, /const PresetsPage = \(\) => import\("@\/pages\/PresetsPage\.vue"\);/);
  assert.match(routerSource, /const ActionsPage = \(\) => import\("@\/pages\/ActionsPage\.vue"\);/);
  assert.match(routerSource, /const ImprovementCandidatesPage = \(\) => import\("@\/pages\/ImprovementCandidatesPage\.vue"\);/);
  assert.match(routerSource, /const ModelProvidersPage = \(\) => import\("@\/pages\/ModelProvidersPage\.vue"\);/);
  assert.match(routerSource, /const ModelLogsPage = \(\) => import\("@\/pages\/ModelLogsPage\.vue"\);/);
  assert.match(routerSource, /const EvidenceSearchPage = \(\) => import\("@\/pages\/EvidenceSearchPage\.vue"\);/);
  assert.match(routerSource, /const MessagePlatformsPage = \(\) => import\("@\/pages\/MessagePlatformsPage\.vue"\);/);
  assert.match(routerSource, /const BuddyPage = \(\) => import\("@\/pages\/BuddyPage\.vue"\);/);
  assert.match(routerSource, /\{ path: "\/library", component: GraphLibraryPage \}/);
  assert.match(routerSource, /\{ path: "\/knowledge", component: KnowledgePage \}/);
  assert.match(routerSource, /\{ path: "\/scheduler", component: SchedulerPage \}/);
  assert.match(routerSource, /\{ path: "\/curator-reports", component: CuratorReportsPage \}/);
  assert.match(routerSource, /\{ path: "\/buddy", component: BuddyPage \}/);
  assert.match(routerSource, /\{ path: "\/presets", component: PresetsPage \}/);
  assert.match(routerSource, /\{ path: "\/actions", component: ActionsPage \}/);
  assert.match(routerSource, /\{ path: "\/improvements", component: ImprovementCandidatesPage \}/);
  assert.match(routerSource, /\{ path: "\/models", component: ModelProvidersPage \}/);
  assert.match(routerSource, /\{ path: "\/model-logs", component: ModelLogsPage \}/);
  assert.match(routerSource, /\{ path: "\/evidence", component: EvidenceSearchPage \}/);
  assert.match(routerSource, /\{ path: "\/message-platforms", component: MessagePlatformsPage \}/);
});

test("router keeps legacy developer-only tooling outside the user-facing route table", () => {
  assert.doesNotMatch(routerSource, /const EvalsPage = \(\) => import\("@\/pages\/EvalsPage\.vue"\);/);
  assert.doesNotMatch(routerSource, /\{ path: "\/evals", component: EvalsPage \}/);
});

test("router lazy-loads page components to keep the production entry chunk small", () => {
  for (const pageName of [
    "EditorPage",
    "SchedulerPage",
    "CuratorReportsPage",
    "GraphLibraryPage",
    "KnowledgePage",
    "HomePage",
    "BuddyPage",
    "ModelLogsPage",
    "MessagePlatformsPage",
    "ModelProvidersPage",
    "EvidenceSearchPage",
    "PresetsPage",
    "RunDetailPage",
    "RunsPage",
    "SettingsPage",
    "ActionsPage",
    "ImprovementCandidatesPage",
  ]) {
    assert.match(routerSource, new RegExp(`const ${pageName} = \\(\\) => import\\("@/pages/${pageName}\\.vue"\\);`));
  }
});
