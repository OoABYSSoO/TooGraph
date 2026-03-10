import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "RunDetailPage.vue"), "utf8");

test("RunDetailPage exposes a restore editor action when the loaded run can be restored", () => {
  assert.match(componentSource, /import \{ Promotion \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElIcon \} from "element-plus";/);
  assert.match(componentSource, /import \{ formatRunDisplayName, formatRunDisplayTimestamp \} from "@\/lib\/run-display-name";/);
  assert.match(componentSource, /import \{ buildSnapshotScopedRun, canRestoreRunDetail, resolveRunRestoreUrl, resolveRunSnapshot \} from "@\/lib\/run-restore";/);
  assert.match(componentSource, /const canRestore = computed\(\(\) => \(run\.value \? canRestoreRunDetail\(run\.value\) : false\)\);/);
  assert.match(componentSource, /const runDisplayName = computed\(\(\) => \(run\.value \? formatRunDisplayName\(run\.value\) : runId\.value\)\);/);
  assert.match(componentSource, /const runStatusFacts = computed\(\(\) => \{[\s\S]*return viewedRun\.value \? buildRunStatusFacts\(viewedRun\.value\) : \[\];/);
  assert.match(componentSource, /const selectedSnapshotId = computed/);
  assert.match(componentSource, /const snapshotOptions = computed/);
  assert.match(componentSource, /const restoreEditorHref = computed\(\(\) => \(run\.value \? resolveRunRestoreUrl\(run\.value\.run_id, selectedSnapshotId\.value\) : "\/editor\/new"\)\);/);
  assert.match(componentSource, /\{\{ runDisplayName \}\}/);
  assert.match(componentSource, /v-if="canRestore"/);
  assert.match(componentSource, /class="run-detail__restore-toolbar"/);
  assert.match(componentSource, /class="run-detail__restore-icon"/);
  assert.match(componentSource, /<Promotion \/>/);
  assert.match(componentSource, /t\("common\.restoreEdit"\)/);
  assert.match(componentSource, /run-detail__snapshot-switcher/);
  assert.match(componentSource, /v-for="option in snapshotOptions"/);
});

test("RunDetailPage keeps restore action on the same row as snapshot selection", () => {
  const heroTopSource = componentSource.match(/<div class="run-detail__hero-top">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";

  assert.match(
    componentSource,
    /class="run-detail__restore-toolbar"[\s\S]*class="run-detail__snapshot-switcher"[\s\S]*class="run-detail__restore-link"/,
  );
  assert.doesNotMatch(heroTopSource, /class="run-detail__restore-link"/);
  assert.match(componentSource, /\.run-detail__restore-toolbar \{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/);
  assert.match(componentSource, /\.run-detail__restore-link \{[\s\S]*background:\s*rgba\(154,\s*52,\s*18,\s*0\.92\);/);
});

test("RunDetailPage uses semantic status styling for the primary run badge", () => {
  assert.match(componentSource, /function statusBadgeClass\(status: string\)/);
  assert.match(componentSource, /:class="fact\.tone === 'status' \? statusBadgeClass\(fact\.value\) : undefined"/);
  assert.match(componentSource, /\.run-detail__badges span \{[\s\S]*background:\s*var\(--graphite-status-bg,/);
  assert.match(componentSource, /\.run-detail__metric-value\.graphite-status-badge \{[\s\S]*background:\s*var\(--graphite-status-bg,/);
  assert.match(componentSource, /\.run-detail__content \{[\s\S]*font-family:\s*var\(--graphite-font-mono\);/);
});

test("RunDetailPage prioritizes status facts and final result before dense diagnostics", () => {
  assert.match(componentSource, /class="run-detail__status-console"/);
  assert.match(componentSource, /v-for="fact in runStatusFacts"/);
  assert.match(componentSource, /class="run-detail__metric-value"/);
  assert.match(componentSource, /class="run-detail__panel run-detail__panel--result"/);
  assert.match(componentSource, /t\("runDetail\.finalResult"\)/);
  assert.match(componentSource, /class="run-detail__content run-detail__content--result"/);
  assert.match(componentSource, /isContentExpanded\('final-result'\)/);
});

test("RunDetailPage supports restrained expandable long content cards", () => {
  assert.match(componentSource, /const expandedContentKeys = ref<Set<string>>\(new Set\(\)\);/);
  assert.match(componentSource, /function toggleContentExpansion\(key: string\)/);
  assert.match(componentSource, /function isContentExpanded\(key: string\)/);
  assert.match(componentSource, /class="run-detail__content-toggle"/);
  assert.match(componentSource, /:class="\{ 'run-detail__content--expanded': isContentExpanded\('final-result'\) \}"/);
  assert.match(componentSource, /\.run-detail__content \{[\s\S]*max-height:\s*180px;[\s\S]*overflow:\s*hidden;/);
  assert.match(componentSource, /\.run-detail__content--expanded \{[\s\S]*max-height:\s*none;/);
});

test("RunDetailPage uses one immediate route watcher for loading run details", () => {
  assert.match(componentSource, /import \{ computed, onBeforeUnmount, ref, watch \} from "vue";/);
  assert.doesNotMatch(componentSource, /onMounted/);
  assert.match(componentSource, /const loading = ref\(false\);/);
  assert.match(componentSource, /<article v-else-if="loading" class="run-detail__empty">\{\{ t\("common\.loadingRun"\) \}\}<\/article>/);
  assert.doesNotMatch(componentSource, /v-else-if="!run" class="run-detail__empty">Loading run/);
  assert.match(componentSource, /watch\(\s*runId,[\s\S]*\{ immediate: true \},[\s\S]*\);/);
});

test("RunDetailPage cancels stale detail requests and exposes retry after failure", () => {
  assert.match(componentSource, /const runDetailRequestTimeoutMs = 10_000;/);
  assert.match(componentSource, /let activeRunRequestId = 0;/);
  assert.match(componentSource, /let activeRunController: AbortController \| null = null;/);
  assert.match(componentSource, /function clearPendingRunRequest\(\)/);
  assert.match(componentSource, /activeRunController\?\.abort\(\);/);
  assert.match(componentSource, /const controller = new AbortController\(\);/);
  assert.match(componentSource, /fetchRun\(normalizedRunId, \{ signal: controller\.signal \}\)/);
  assert.match(componentSource, /if \(requestId !== activeRunRequestId\) \{/);
  assert.match(componentSource, /return t\("runDetail\.loadTimeout"\);/);
  assert.match(componentSource, /class="run-detail__retry"[\s\S]*@click="loadRun\(runId\)"/);
});

test("RunDetailPage subscribes to run events and renders live streamed output", () => {
  assert.match(componentSource, /let runEventSource: EventSource \| null = null;/);
  assert.match(componentSource, /const liveStreamingOutputs = ref/);
  assert.match(componentSource, /import \{[\s\S]*buildLiveStreamingOutput,[\s\S]*buildRunEventStreamUrl,[\s\S]*parseRunEventPayloadData,[\s\S]*\} from "@\/lib\/run-event-stream";/);
  assert.match(componentSource, /const streamUrl = buildRunEventStreamUrl\(nextRunId\);/);
  assert.match(componentSource, /new EventSource\(streamUrl\)/);
  assert.match(componentSource, /return event instanceof MessageEvent \? parseRunEventPayloadData\(event\.data\) : null;/);
  assert.match(componentSource, /const nextOutput = buildLiveStreamingOutput\(/);
  assert.doesNotMatch(componentSource, /JSON\.parse\(String\(event\.data \?\? ""\)\)/);
  assert.doesNotMatch(componentSource, /new EventSource\(`\/api\/runs\/\$\{normalizedRunId\}\/events`\)/);
  assert.match(componentSource, /addEventListener\("node\.output\.delta"/);
  assert.match(componentSource, /addEventListener\("run\.completed"/);
  assert.match(componentSource, /function closeRunEventStream\(\)/);
  assert.match(componentSource, /class="run-detail__panel run-detail__panel--live"/);
  assert.match(componentSource, /v-for="stream in liveStreamingOutputItems"/);
  assert.match(componentSource, /class="run-detail__live-content"/);
});
