import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "ImprovementCandidatesPage.vue"), "utf8");

test("ImprovementCandidatesPage renders a searchable candidate queue with a detail panel", () => {
  assert.match(componentSource, /fetchBuddyImprovementCandidates/);
  assert.match(componentSource, /const candidates = ref<BuddyImprovementCandidate\[\]>\(\[\]\);/);
  assert.match(componentSource, /buildImprovementCandidateOverview/);
  assert.match(componentSource, /filterImprovementCandidates/);
  assert.match(componentSource, /sortImprovementCandidates/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="improvements-page__search"/);
  assert.match(componentSource, /class="improvements-page__filter-tabs"[\s\S]*role="tablist"/);
  assert.match(componentSource, /v-for="candidate in visibleCandidates"/);
  assert.match(componentSource, /selectedCandidate/);
  assert.match(componentSource, /class="improvements-page__detail"/);
});

test("ImprovementCandidatesPage exposes validation decision and apply actions", () => {
  assert.match(componentSource, /fetchTemplate\(BUDDY_IMPROVEMENT_REVIEW_TEMPLATE_ID\)/);
  assert.match(componentSource, /buildBuddyImprovementReviewGraph/);
  assert.match(componentSource, /runGraph\(graph\)/);
  assert.match(componentSource, /linkBuddyImprovementCandidateValidationRun/);
  assert.match(componentSource, /@click="decideCandidate\(selectedCandidate, 'approve'\)"/);
  assert.match(componentSource, /@click="decideCandidate\(selectedCandidate, 'reject'\)"/);
  assert.match(componentSource, /decideBuddyImprovementCandidate\(\s*candidate\.candidate_id,\s*decision,/);
  assert.match(componentSource, /applyBuddyImprovementCandidate\(candidate\.candidate_id/);
  assert.match(componentSource, /canValidateImprovementCandidate\(selectedCandidate\)/);
  assert.match(componentSource, /canApproveImprovementCandidate\(selectedCandidate\)/);
  assert.match(componentSource, /canRejectImprovementCandidate\(selectedCandidate\)/);
  assert.match(componentSource, /canApplyImprovementCandidate\(selectedCandidate\)/);
});

test("ImprovementCandidatesPage keeps source run validation run and applied revision inspectable", () => {
  assert.match(componentSource, /source_run_id/);
  assert.match(componentSource, /review_run_id/);
  assert.match(componentSource, /validation_run_id/);
  assert.match(componentSource, /applied_revision_id/);
  assert.match(componentSource, /JSON\.stringify\(selectedCandidate\.validation_result/);
  assert.match(componentSource, /JSON\.stringify\(selectedCandidate\.target_ref/);
});

test("ImprovementCandidatesPage sizes itself against the shell content pane", () => {
  assert.match(componentSource, /\.improvements-page \{[\s\S]*width:\s*min\(1360px,\s*100%\);/);
  assert.match(componentSource, /\.improvements-page__filter-tabs \{[\s\S]*flex-wrap:\s*wrap;/);
  assert.doesNotMatch(componentSource, /calc\(100vw - 48px\)/);
});
