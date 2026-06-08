import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "EvidenceSearchPage.vue"), "utf8");

test("EvidenceSearchPage uses Buddy evidence search APIs as the page data source", () => {
  assert.match(componentSource, /searchBuddyChatSessions/);
  assert.match(componentSource, /searchBuddyMemories/);
  assert.match(componentSource, /searchBuddyRunContext/);
  assert.match(componentSource, /BuddyMemorySearchResult/);
  assert.match(componentSource, /BuddySessionSearchResult/);
  assert.match(componentSource, /BuddyRunContextSearchResult/);
});

test("EvidenceSearchPage exposes separate controls for session and run context evidence", () => {
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.session\.query"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.session\.embeddingModel"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.session\.search"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.runContext\.runId"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.runContext\.query"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.runContext\.search"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.memory\.query"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.memory\.embeddingModel"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.memory\.search"/);
  assert.match(componentSource, /formatSessionRetrieval\(session\)/);
  assert.match(componentSource, /formatSessionSourceRefs\(session\.source_refs\)/);
  assert.match(componentSource, /formatSessionSourceRefs\(session\.summary_refs\)/);
  assert.match(componentSource, /formatRetrievalRankingReport\(sessionResult\?\.report\?\.ranking_reports\)/);
  assert.match(componentSource, /formatRetrievalRankingReport\(memoryResult\?\.report\?\.ranking_reports\)/);
  assert.match(componentSource, /@keyup\.enter="runSessionSearch"/);
  assert.match(componentSource, /@keyup\.enter="runRunContextSearch"/);
  assert.match(componentSource, /@keyup\.enter="runMemorySearch"/);
});

test("EvidenceSearchPage shows source references instead of hiding evidence behind summaries", () => {
  assert.match(componentSource, /hit_message_ids/);
  assert.match(componentSource, /bookend_start/);
  assert.match(componentSource, /bookend_end/);
  assert.match(componentSource, /assembly_id/);
  assert.match(componentSource, /target_state_key/);
  assert.match(componentSource, /source_revision_id/);
  assert.match(componentSource, /latest_revision_id/);
  assert.match(componentSource, /RouterLink[\s\S]*:to="runDetailPath\(match\.run_id\)"/);
});

test("EvidenceSearchPage keeps structured metadata inspectable", () => {
  assert.match(componentSource, /formatMetadata\(match\.metadata\)/);
  assert.match(componentSource, /formatMetadata\(memory\.metadata\)/);
  assert.match(componentSource, /highlightJson/);
  assert.match(componentSource, /evidenceSearch\.metadata/);
  assert.match(componentSource, /evidenceSearch\.retrievalAudit/);
});

test("EvidenceSearchPage exposes embedding maintenance as an auditable graph run", () => {
  assert.match(componentSource, /fetchTemplate\(EMBEDDING_MAINTENANCE_TEMPLATE_ID\)/);
  assert.match(componentSource, /runGraph\(graph\)/);
  assert.match(componentSource, /buildEmbeddingMaintenanceGraph/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.embeddingMaintenance\.runNow"/);
  assert.match(componentSource, /data-virtual-affordance-id="evidenceSearch\.embeddingMaintenance\.retryFailed"/);
  assert.match(componentSource, /runEmbeddingMaintenance\(\{ retryFailed: true \}\)/);
  assert.match(componentSource, /noEmbeddingModelConfigured/);
  assert.match(componentSource, /evidenceSearch\.embeddingKeywordOnlyNotice/);
  assert.match(componentSource, /runDetailPath\(embeddingMaintenanceRunId\)/);
});
