import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "RunsPage.vue"), "utf8");

test("RunsPage keeps run cards on detail navigation while exposing an explicit restore editor action", () => {
  assert.match(componentSource, /import \{ formatRunDisplayName, formatRunDisplayTimestamp, formatRunDuration \} from "@\/lib\/run-display-name";/);
  assert.match(componentSource, /import \{ shouldPollRunStatus \} from "@\/lib\/run-event-stream";/);
  assert.match(componentSource, /import \{ canRestoreRunSummary, resolveRunRestoreUrl \} from "@\/lib\/run-restore";/);
  assert.match(componentSource, /buildRunRestoreTargets/);
  assert.match(componentSource, /const runCardDetail = computed\(\(\) => \{[\s\S]*return resolveRunsCardDetail\(\);/);
  assert.match(componentSource, /const router = useRouter\(\);/);
  assert.match(componentSource, /function openRunDetail\(runId: string\)/);
  assert.match(componentSource, /function openRunPlayback\(run: RunSummary\)/);
  assert.match(componentSource, /function handleRunRowKeydown\(event: KeyboardEvent, runId: string\)/);
  assert.match(componentSource, /v-if="canRestoreRunSummary\(run\)"/);
  assert.match(componentSource, /:to="restoreUrlForRun\(run\)"/);
  assert.match(componentSource, /\{\{ formatRunDisplayName\(run\) \}\}/);
  assert.match(componentSource, /\{\{ runCardDetail \}\}/);
  assert.match(componentSource, /t\("common\.restoreEdit"\)/);
});

test("RunsPage lets each restorable card choose breakpoint or final-result restore targets", () => {
  assert.match(componentSource, /const selectedRestoreTargetByRunId = ref<Record<string, string>>\(\{\}\);/);
  assert.match(componentSource, /function restoreTargetsForRun\(run: RunSummary\)/);
  assert.match(componentSource, /function selectedRestoreTargetKey\(run: RunSummary\)/);
  assert.match(componentSource, /function selectRestoreTarget\(runId: string, targetKey: string\)/);
  assert.match(componentSource, /function restoreUrlForRun\(run: RunSummary\)/);
  assert.match(componentSource, /class="runs-page__restore-switch"/);
  assert.match(componentSource, /v-for="target in restoreTargetsForRun\(run\)"/);
  assert.match(componentSource, /:class="\{ 'runs-page__restore-target--active': target\.key === selectedRestoreTargetKey\(run\) \}"/);
  assert.match(componentSource, /:title="target\.detail"/);
  assert.match(componentSource, /@click\.stop="selectRestoreTarget\(run\.run_id, target\.key\)"/);
});

test("RunsPage keeps the detail action immediately before restore edit after restore target choices", () => {
  const actionsMatch = componentSource.match(/<div class="runs-page__card-actions">([\s\S]*?)<\/div>\s*<\/article>/);
  assert.ok(actionsMatch, "expected to find run card actions");
  assert.match(
    actionsMatch[1],
    /class="runs-page__restore-switch"[\s\S]*class="runs-page__detail-link"[\s\S]*class="runs-page__restore-link"/,
  );
});

test("RunsPage uses semantic status styling and keeps run identifiers monospace", () => {
  assert.match(componentSource, /function statusBadgeClass\(status: string\)/);
  assert.match(componentSource, /:class="statusBadgeClass\(run\.status\)"/);
  assert.match(componentSource, /\.runs-page__badges span \{[\s\S]*background:\s*var\(--toograph-status-bg,/);
  assert.match(componentSource, /\.runs-page__run-id \{[\s\S]*font-family:\s*var\(--toograph-font-mono\);/);
});

test("RunsPage keeps timing metadata under the graph title without duplicating the title date", () => {
  assert.match(componentSource, /<p class="runs-page__run-meta">[\s\S]*formatRunDisplayTimestamp\(run\.started_at\)[\s\S]*formatRunDuration\(run\.duration_ms\)[\s\S]*v-if="run\.revision_round > 0"/);
  assert.doesNotMatch(componentSource, /grid-template-columns:\s*5px minmax\(0,\s*1\.25fr\) minmax\(260px,\s*0\.9fr\) auto/);
  assert.match(componentSource, /\.runs-page__run-meta span \{\s*min-width:\s*0;\s*\}/);
});

test("RunsPage presents a restrained dashboard toolbar with status segments and overview metrics", () => {
  assert.match(componentSource, /const statusOptions = computed\(\(\) => \{[\s\S]*return buildRunStatusFilterOptions\(\);/);
  assert.match(componentSource, /const runOverview = computed\(\(\) => \{[\s\S]*return buildRunStatusOverview\(runs\.value\);/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="graphNameQuery"[\s\S]*class="runs-page__search"/);
  assert.match(componentSource, /v-for="option in statusOptions"/);
  assert.match(componentSource, /class="runs-page__refresh"[\s\S]*@click="loadRuns"/);
  assert.match(componentSource, /v-for="item in runOverview"/);
  assert.match(componentSource, /\.runs-page__toolbar \{[\s\S]*background:\s*var\(--toograph-glass-specular\),\s*var\(--toograph-glass-lens\),\s*var\(--toograph-glass-bg-strong\);/);
  assert.match(componentSource, /\.runs-page__overview-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.62\);/);
});

test("RunsPage exposes official page-operation affordance ids", () => {
  assert.match(componentSource, /data-virtual-affordance-id="runs\.action\.refresh"/);
  assert.match(componentSource, /data-virtual-affordance-id="runs\.search\.graphName"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`runs\.filter\.status\.\$\{option\.value \|\| 'all'\}`"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`runs\.run\.\$\{run\.run_id\}\.openDetail`"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`runs\.run\.\$\{run\.run_id\}\.restoreTarget\.\$\{target\.key\}`"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`runs\.run\.\$\{run\.run_id\}\.restoreEdit`"/);
});

test("RunsPage paginates run history instead of rendering every run at once", () => {
  assert.match(componentSource, /import \{[\s\S]*ElPagination[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /RUNS_PAGE_SIZE/);
  assert.match(componentSource, /const currentPage = ref\(1\);/);
  assert.match(componentSource, /const paginatedRuns = computed\(\(\) => paginateRuns\(runs\.value, currentPage\.value\)\);/);
  assert.match(componentSource, /v-for="run in paginatedRuns"/);
  assert.doesNotMatch(componentSource, /v-for="run in runs"/);
  assert.match(componentSource, /<ElPagination[\s\S]*v-model:current-page="currentPage"[\s\S]*:page-size="RUNS_PAGE_SIZE"[\s\S]*:total="runs\.length"/);
  assert.match(componentSource, /v-if="runs\.length > RUNS_PAGE_SIZE"/);
  assert.match(componentSource, /class="runs-page__pagination"/);
  assert.match(componentSource, /function resetRunsPagination\(\)/);
  assert.match(componentSource, /watch\(graphNameQuery[\s\S]*resetRunsPagination\(\);[\s\S]*scheduleRunsLoad\(\);/);
  assert.match(componentSource, /watch\(statusFilter[\s\S]*resetRunsPagination\(\);[\s\S]*loadRuns\(\);/);
  assert.match(componentSource, /\.runs-page__pagination \{[\s\S]*justify-content:\s*center;/);
});

test("RunsPage uses a two-column run card grid on wide screens and returns to one column below desktop", () => {
  assert.match(
    componentSource,
    /\.runs-page__list \{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*align-items:\s*stretch;/
  );
  assert.match(
    componentSource,
    /\.runs-page__run-row \{[\s\S]*grid-template-columns:\s*5px minmax\(0,\s*1fr\) auto;[\s\S]*align-items:\s*center;/
  );
  assert.doesNotMatch(componentSource, /min-height:\s*172px;/);
  assert.match(componentSource, /\.runs-page__card-actions \{[\s\S]*align-self:\s*center;[\s\S]*justify-content:\s*flex-end;/);
  assert.match(
    componentSource,
    /@media \(max-width:\s*980px\) \{[\s\S]*\.runs-page__list \{[\s\S]*grid-template-columns:\s*1fr;/
  );
  assert.match(
    componentSource,
    /@media \(max-width:\s*1120px\) \{[\s\S]*\.runs-page__run-row \{[\s\S]*grid-template-columns:\s*5px minmax\(0,\s*1fr\);/
  );
});

test("RunsPage gives status segments warm hover and selected states instead of Element Plus defaults", () => {
  assert.match(componentSource, /\.runs-page__segments\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*gap:\s*4px;/);
  assert.match(componentSource, /\.runs-page__segment:not\(\.runs-page__segment--active\):hover\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.56\);/);
  assert.match(componentSource, /\.runs-page__segment--active\s*\{[\s\S]*color:\s*var\(--toograph-accent-strong\);/);
  assert.match(componentSource, /\.runs-page__segment--active\s*\{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.18\);/);
  assert.match(componentSource, /\.runs-page__segment--active\s*\{[\s\S]*box-shadow:\s*0 8px 18px rgba\(120,\s*53,\s*15,\s*0\.1\);/);
});

test("RunsPage renders run cards as clickable log rows with a clear status rail", () => {
  assert.match(componentSource, /class="runs-page__run-row"/);
  assert.match(componentSource, /role="link"/);
  assert.match(componentSource, /@click="openRunPlayback\(run\)"/);
  assert.match(componentSource, /@keydown="handleRunRowKeydown\(\$event, run\.run_id\)"/);
  assert.match(componentSource, /class="runs-page__status-rail"/);
  assert.match(componentSource, /\.runs-page__run-row:hover \{[\s\S]*transform:\s*translateY\(-1px\);/);
  assert.match(componentSource, /\.runs-page__status-rail \{[\s\S]*background:\s*var\(--toograph-status-fg,/);
});

test("RunsPage separates row navigation from card action clicks", () => {
  assert.match(componentSource, /class="runs-page__detail-link"[\s\S]*@click\.stop="openRunDetail\(run\.run_id\)"/);
  assert.match(componentSource, /class="runs-page__restore-link"[\s\S]*@click\.stop[\s\S]*:to="restoreUrlForRun\(run\)"/);
  assert.doesNotMatch(componentSource, /class="runs-page__card-actions" @click\.stop/);
});

test("RunsPage does not press the whole row when nested restore controls are clicked", () => {
  assert.doesNotMatch(componentSource, /\.runs-page__run-row:active/);
  assert.doesNotMatch(componentSource, /scale\(0\.995\)/);
});
