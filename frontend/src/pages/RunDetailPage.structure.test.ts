import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "RunDetailPage.vue"), "utf8");

test("RunDetailPage exposes a restore editor action when the loaded run can be restored", () => {
  assert.match(componentSource, /import \{ Promotion, RefreshLeft \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElButton, ElIcon, ElMessage, ElMessageBox \} from "element-plus";/);
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

test("RunDetailPage exposes official page-operation affordance ids", () => {
  assert.match(componentSource, /data-virtual-affordance-id="runDetail\.action\.restoreEdit"/);
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
  assert.match(componentSource, /\.run-detail__badges span \{[\s\S]*background:\s*var\(--toograph-status-bg,/);
  assert.match(componentSource, /\.run-detail__metric-value\.toograph-status-badge \{[\s\S]*background:\s*var\(--toograph-status-bg,/);
  assert.match(componentSource, /\.run-detail__content \{[\s\S]*font-family:\s*var\(--toograph-font-mono\);/);
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

test("RunDetailPage renders action artifact document lists with a paged reader", () => {
  assert.match(componentSource, /import ArtifactDocumentPager from "\.\/ArtifactDocumentPager\.vue";/);
  assert.match(componentSource, /v-if="artifact\.documentRefs\.length > 0"/);
  assert.match(componentSource, /<ArtifactDocumentPager\s+:documents="artifact\.documentRefs"/);
  assert.match(componentSource, /v-else\s+class="run-detail__content"/);
});

test("RunDetailPage renders the aggregated parent and subgraph timeline", () => {
  assert.match(
    componentSource,
    /import \{[\s\S]*buildRunAggregatedTimeline,[\s\S]*buildRunStatusFacts,[\s\S]*listRunOutputArtifacts,[\s\S]*\} from "\.\/runDetailModel\.ts";/,
  );
  assert.match(componentSource, /const aggregatedTimeline = computed\(\(\) => \(viewedRun\.value \? buildRunAggregatedTimeline\(viewedRun\.value\) : \[\]\)\);/);
  assert.doesNotMatch(componentSource, /buildRunMemoryContextCards/);
  assert.match(componentSource, /v-for="item in aggregatedTimeline"/);
  assert.doesNotMatch(componentSource, /v-for="execution in run\.node_executions"/);
  assert.match(componentSource, /\{\{ item\.pathLabel \}\}/);
  assert.match(componentSource, /item\.subgraphPath\.join\(" \/ "\)/);
  assert.match(componentSource, /item\.durationMs !== null/);
  assert.match(componentSource, /v-for="label in item\.artifactLabels"/);
});

test("RunDetailPage renders the persisted child run tree with collapsed batch groups", () => {
  assert.match(componentSource, /import \{ fetchRun, fetchRunTree, resumeRun \} from "@\/api\/runs";/);
  assert.match(
    componentSource,
    /import \{[\s\S]*buildRunTreeDisplayItems,[\s\S]*countRunTreeNodes,[\s\S]*\} from "\.\/runDetailModel\.ts";/,
  );
  assert.match(componentSource, /const runTree = ref<RunTreeNode \| null>\(null\);/);
  assert.match(componentSource, /const runTreeDisplayItems = computed\(\(\) => buildRunTreeDisplayItems\(runTree\.value\)\);/);
  assert.match(componentSource, /const runTreeVisible = computed/);
  assert.match(componentSource, /fetchRunTree\(normalizedRunId, \{ signal: controller\.signal \}\)/);
  assert.match(componentSource, /class="run-detail__panel run-detail__panel--run-tree"/);
  assert.match(componentSource, /v-for="item in runTreeDisplayItems"/);
  assert.match(componentSource, /class="run-detail__run-tree-batch"/);
  assert.match(componentSource, /<summary class="run-detail__run-tree-batch-summary"/);
  assert.match(componentSource, /v-for="row in item\.rows"/);
});

test("RunDetailPage renders Agent Diagnostic from run detail state", () => {
  assert.match(componentSource, /buildAgentDiagnostic/);
  assert.match(componentSource, /const agentDiagnostic = computed/);
  assert.match(componentSource, /run-detail__agent-diagnostic/);
  assert.match(componentSource, /agentDiagnostic\.stopReason/);
  assert.match(componentSource, /agentDiagnostic\.stopReasonTitleKey/);
  assert.match(componentSource, /agentDiagnostic\.stopReasonDescriptionKey/);
  assert.match(componentSource, /agentDiagnostic\.providerFallback\.visible/);
  assert.match(componentSource, /agentDiagnostic\.providerFallback\.requestedRef/);
  assert.match(componentSource, /agentDiagnostic\.providerFallback\.selectedRef/);
  assert.match(componentSource, /agentDiagnostic\.providerFallback\.failedLabels/);
  assert.match(componentSource, /agentDiagnostic\.providerFallback\.rejectedLabels/);
  assert.match(componentSource, /agentDiagnostic\.providerFallback\.fallbackLabels/);
  assert.match(componentSource, /agentDiagnostic\.providerCostBudgetDegradation\.visible/);
  assert.match(componentSource, /agentDiagnostic\.providerCostBudgetDegradation\.requestedRef/);
  assert.match(componentSource, /agentDiagnostic\.providerCostBudgetDegradation\.selectedRef/);
  assert.match(componentSource, /agentDiagnostic\.providerCostBudgetDegradation\.budgetLimitLabel/);
  assert.match(componentSource, /agentDiagnostic\.providerCostBudgetDegradation\.evidenceLabels/);
  assert.match(componentSource, /agentDiagnostic\.providerProfile\.visible/);
  assert.match(componentSource, /agentDiagnostic\.providerProfile\.requestTimeoutLabel/);
  assert.match(componentSource, /agentDiagnostic\.providerProfile\.cacheDecisionLabel/);
  assert.match(componentSource, /agentDiagnostic\.providerProfile\.rateProfileLabel/);
  assert.match(componentSource, /agentDiagnostic\.permissionApproval\.visible/);
  assert.match(componentSource, /agentDiagnostic\.permissionApproval\.actionable/);
  assert.match(componentSource, /agentDiagnostic\.permissionApproval\.capabilityRef/);
  assert.match(componentSource, /agentDiagnostic\.permissionApproval\.permissionLabel/);
  assert.match(componentSource, /approvePermissionApproval/);
  assert.match(componentSource, /denyPermissionApproval/);
  assert.match(componentSource, /resumeRun\(viewedRun\.value\.run_id,\s*\{[\s\S]*permission_approval:[\s\S]*decision: "approved"/);
  assert.match(componentSource, /resumeRun\(viewedRun\.value\.run_id,\s*\{[\s\S]*permission_approval:[\s\S]*decision: "denied"/);
  assert.match(componentSource, /t\("runDetail\.permissionApproval"\)/);
  assert.match(componentSource, /t\("runDetail\.permissionApprovalApprove"\)/);
  assert.match(componentSource, /t\("runDetail\.permissionApprovalDeny"\)/);
  assert.match(componentSource, /run-detail__diagnostic-warnings/);
  assert.match(componentSource, /run-detail__diagnostic-warning/);
  assert.match(componentSource, /t\("runDetail\.providerFallback"\)/);
  assert.match(componentSource, /t\("runDetail\.providerCostBudgetDegradation"\)/);
  assert.match(componentSource, /t\("runDetail\.providerCostBudgetDegradationSelected"\)/);
  assert.match(componentSource, /t\("runDetail\.providerProfile"\)/);
  assert.match(componentSource, /t\("runDetail\.providerProfileRateProfile"\)/);
  assert.match(componentSource, /t\("runDetail\.agentDiagnostic"\)/);
});

test("RunDetailPage renders context budget reports inside context audit", () => {
  assert.match(componentSource, /const contextAuditBudgetReports = computed/);
  assert.match(componentSource, /contextAuditBudgetReports\.length > 0/);
  assert.match(componentSource, /v-for="report in contextAuditBudgetReports"/);
  assert.match(componentSource, /t\("runDetail\.contextBudgetReports"\)/);
  assert.match(componentSource, /report\.rawHistoryChars !== null/);
  assert.match(componentSource, /report\.renderedHistoryChars !== null/);
  assert.match(componentSource, /report\.sessionSummaryChars !== null/);
  assert.match(componentSource, /report\.omittedCount !== null/);
  assert.match(componentSource, /report\.protectedCount !== null/);
  assert.match(componentSource, /report\.summarySourceRefCount !== null/);
  assert.match(componentSource, /report\.omittedRefCount !== null/);
  assert.match(componentSource, /report\.protectedRecentHistoryRefCount !== null/);
  assert.match(componentSource, /report\.summarySourceRevisionIds\.length > 0/);
  assert.match(componentSource, /t\("runDetail\.summarySourceRefs"/);
  assert.match(componentSource, /t\("runDetail\.omittedSourceRefs"/);
  assert.match(componentSource, /t\("runDetail\.protectedRecentSourceRefs"/);
  assert.match(componentSource, /report\.promptTokenPressure !== null/);
  assert.match(componentSource, /report\.notes\.length > 0/);
});

test("RunDetailPage renders prompt snapshots inside context audit", () => {
  assert.match(componentSource, /const contextAuditPromptSnapshots = computed/);
  assert.match(componentSource, /contextAuditPromptSnapshots\.length > 0/);
  assert.match(componentSource, /v-for="snapshot in contextAuditPromptSnapshots"/);
  assert.match(componentSource, /t\("runDetail\.promptSnapshots"\)/);
  assert.match(componentSource, /snapshot\.systemPromptChars !== null/);
  assert.match(componentSource, /snapshot\.userPromptChars !== null/);
  assert.match(componentSource, /snapshot\.tokenEstimate !== null/);
  assert.match(componentSource, /snapshot\.contextRefCount > 0/);
  assert.match(componentSource, /snapshot\.systemPromptHash/);
  assert.match(componentSource, /snapshot\.userPromptHash/);
  assert.match(componentSource, /snapshot\.promptCachePolicy/);
  assert.match(componentSource, /t\("runDetail\.promptCachePolicy"\)/);
  assert.match(componentSource, /snapshot\.promptCachePolicy\.requestedPolicy/);
  assert.match(componentSource, /t\("runDetail\.promptCacheRequested"\)/);
  assert.match(componentSource, /t\("runDetail\.promptCacheStablePrefix"\)/);
  assert.match(componentSource, /t\("runDetail\.promptCacheDynamicSuffix"\)/);
});

test("RunDetailPage renders Buddy background review records without the legacy rerun action", () => {
  assert.match(componentSource, /import \{ fetchBuddyBackgroundReviews, restoreBuddyRevision \} from "@\/api\/buddy";/);
  assert.match(componentSource, /import \{ buildBackgroundReviewDisplayItems/);
  assert.match(componentSource, /const backgroundReviews = ref/);
  assert.match(componentSource, /const backgroundReviewItems = computed/);
  assert.match(componentSource, /const restoringBackgroundReviewRevisionId = ref\(""\);/);
  assert.match(componentSource, /fetchBuddyBackgroundReviews\(normalizedRunId/);
  assert.match(componentSource, /class="run-detail__panel run-detail__panel--background-review"/);
  assert.match(componentSource, /v-for="item in backgroundReviewItems"/);
  assert.match(componentSource, /:to="item\.reviewRunHref"/);
  assert.match(componentSource, /v-for="badge in item\.writebackBadges"/);
  assert.match(componentSource, /v-for="revision in item\.revisions"/);
  assert.match(componentSource, /v-if="revision\.canRestore"/);
  assert.match(componentSource, /@click="restoreBackgroundReviewRevision\(item, revision\.revisionId\)"/);
  assert.match(componentSource, /:loading="restoringBackgroundReviewRevisionId === revision\.revisionId"/);
  assert.match(componentSource, /v-for="skipped in item\.skippedCommands"/);
  assert.match(componentSource, /v-for="evidence in item\.evidenceItems"/);
  assert.match(componentSource, /v-for="warning in item\.warnings"/);
  assert.doesNotMatch(componentSource, /enqueueBuddyBackgroundReview/);
  assert.doesNotMatch(componentSource, /rerunBackgroundReview/);
  assert.doesNotMatch(componentSource, /startImprovementCandidateReview/);
  assert.doesNotMatch(componentSource, /ImprovementCandidate/);
  assert.match(componentSource, /async function restoreBackgroundReviewRevision\(item: BackgroundReviewDisplayItem, revisionId: string\)/);
  assert.match(componentSource, /await restoreBuddyRevision\(normalizedRevisionId\)/);
  assert.match(componentSource, /void loadBackgroundReviews\(item\.sourceRunId\)/);
  assert.match(componentSource, /t\("runDetail\.backgroundReview"\)/);
  assert.doesNotMatch(componentSource, /t\("runDetail\.rerunBackgroundReview"\)/);
});

test("RunDetailPage exposes operation journal entries from the dedicated journal API", () => {
  assert.match(componentSource, /import \{ fetchOperationJournal \} from "@\/api\/operationJournal";/);
  assert.match(
    componentSource,
    /import \{ buildOperationJournalDisplayItems, type OperationJournalDisplayItem \} from "\.\/operationJournalModel\.ts";/,
  );
  assert.match(componentSource, /const operationJournal = ref/);
  assert.match(componentSource, /const operationJournalItems = computed\(\(\) => buildOperationJournalDisplayItems\(operationJournal\.value\?\.entries \?\? \[\]\)\);/);
  assert.match(componentSource, /fetchOperationJournal\(\{ runId: normalizedRunId, size: 100 \}, \{ signal: controller\.signal \}\)/);
  assert.match(componentSource, /class="run-detail__panel run-detail__panel--operation-journal"/);
  assert.match(componentSource, /v-for="item in operationJournalItems"/);
  assert.match(componentSource, /t\("runDetail\.operationJournal"\)/);
  assert.match(componentSource, /t\("runDetail\.operationJournalTitle"\)/);
});

test("RunDetailPage exposes graph revision restore actions from operation journal rows", () => {
  assert.match(componentSource, /import \{ Promotion, RefreshLeft \} from "@element-plus\/icons-vue";/);
  assert.match(componentSource, /import \{ ElButton, ElIcon, ElMessage, ElMessageBox \} from "element-plus";/);
  assert.match(componentSource, /import \{ restoreGraphRevision \} from "@\/api\/graphs";/);
  assert.match(
    componentSource,
    /import \{ buildOperationJournalDisplayItems, type OperationJournalDisplayItem \} from "\.\/operationJournalModel\.ts";/,
  );
  assert.match(componentSource, /const restoringGraphRevisionKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /v-if="item\.graphRevision"/);
  assert.match(componentSource, /class="run-detail__operation-actions"/);
  assert.match(componentSource, /@click="restoreGraphRevisionFromOperation\(item\)"/);
  assert.match(componentSource, /:loading="restoringGraphRevisionKey === item\.key"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`runDetail\.graphRevision\.restore\.\$\{item\.graphRevision\.revisionId\}`"/);
  assert.match(componentSource, /<RefreshLeft \/>/);
  assert.match(componentSource, /async function restoreGraphRevisionFromOperation\(item: OperationJournalDisplayItem\)/);
  assert.match(componentSource, /ElMessageBox\.confirm\(/);
  assert.match(componentSource, /await restoreGraphRevision\(item\.graphRevision\.graphId, item\.graphRevision\.revisionId\)/);
  assert.match(componentSource, /ElMessage\.success\(t\("graphLibrary\.revisionRestored", \{ revisionId: response\.restored_revision_id \}\)\);/);
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
  assert.match(componentSource, /import \{[\s\S]*buildLiveStreamingOutput,[\s\S]*buildRunEventStreamUrl,[\s\S]*parseRunEventPayload,[\s\S]*resolveRunEventNodeId,[\s\S]*\} from "@\/lib\/run-event-stream";/);
  assert.match(componentSource, /import \{[\s\S]*shouldPollRunStatus[\s\S]*\} from "@\/lib\/run-event-stream";/);
  assert.doesNotMatch(componentSource, /import \{ buildRunStatusFacts, listRunOutputArtifacts, shouldPollRunStatus \} from "\.\/runDetailModel\.ts";/);
  assert.match(componentSource, /const streamUrl = buildRunEventStreamUrl\(nextRunId\);/);
  assert.match(componentSource, /new EventSource\(streamUrl\)/);
  assert.doesNotMatch(componentSource, /function parseRunEventPayload\(event: Event\)/);
  assert.doesNotMatch(componentSource, /parseRunEventPayloadData\(event\.data\)/);
  assert.match(componentSource, /const currentNodeId = resolveRunEventNodeId\(payload\);/);
  assert.match(componentSource, /const nextOutput = buildLiveStreamingOutput\(/);
  assert.doesNotMatch(componentSource, /String\(payload\.node_id \?\? ""\)\.trim\(\)/);
  assert.doesNotMatch(componentSource, /JSON\.parse\(String\(event\.data \?\? ""\)\)/);
  assert.doesNotMatch(componentSource, /new EventSource\(`\/api\/runs\/\$\{normalizedRunId\}\/events`\)/);
  assert.match(componentSource, /addEventListener\("node\.output\.delta"/);
  assert.match(componentSource, /addEventListener\("run\.completed"/);
  assert.match(componentSource, /addEventListener\("run\.cancelled"/);
  assert.match(componentSource, /function closeRunEventStream\(\)/);
  assert.match(componentSource, /class="run-detail__panel run-detail__panel--live"/);
  assert.match(componentSource, /v-for="stream in liveStreamingOutputItems"/);
  assert.match(componentSource, /class="run-detail__live-content"/);
});
