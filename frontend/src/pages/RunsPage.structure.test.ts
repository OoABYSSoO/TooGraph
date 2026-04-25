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
  assert.match(componentSource, /import \{ canRestoreRunSummary, resolveRunRestoreUrl \} from "@\/lib\/run-restore";/);
  assert.match(componentSource, /import \{ RUN_STATUS_FILTER_OPTIONS, buildRunStatusOverview, resolveRunsCardDetail, resolveRunsEmptyAction \} from "\.\/runsPageModel\.ts";/);
  assert.match(componentSource, /const runCardDetail = resolveRunsCardDetail\(\);/);
  assert.match(componentSource, /const router = useRouter\(\);/);
  assert.match(componentSource, /function openRunDetail\(runId: string\)/);
  assert.match(componentSource, /function handleRunRowKeydown\(event: KeyboardEvent, runId: string\)/);
  assert.match(componentSource, /v-if="canRestoreRunSummary\(run\)"/);
  assert.match(componentSource, /:to="resolveRunRestoreUrl\(run\.run_id\)"/);
  assert.match(componentSource, /\{\{ formatRunDisplayName\(run\) \}\}/);
  assert.match(componentSource, /\{\{ runCardDetail \}\}/);
  assert.match(componentSource, /恢复编辑/);
});

test("RunsPage uses semantic status styling and keeps run identifiers monospace", () => {
  assert.match(componentSource, /function statusBadgeClass\(status: string\)/);
  assert.match(componentSource, /:class="statusBadgeClass\(run\.status\)"/);
  assert.match(componentSource, /\.runs-page__badges span \{[\s\S]*background:\s*var\(--graphite-status-bg,/);
  assert.match(componentSource, /\.runs-page__run-id \{[\s\S]*font-family:\s*var\(--graphite-font-mono\);/);
});

test("RunsPage presents a restrained dashboard toolbar with status segments and overview metrics", () => {
  assert.match(componentSource, /const statusOptions = RUN_STATUS_FILTER_OPTIONS;/);
  assert.match(componentSource, /const runOverview = computed\(\(\) => buildRunStatusOverview\(runs\.value\)\);/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="graphNameQuery"[\s\S]*class="runs-page__search"/);
  assert.match(componentSource, /<ElSegmented[\s\S]*v-model="statusFilter"[\s\S]*:options="statusOptions"/);
  assert.match(componentSource, /class="runs-page__refresh"[\s\S]*@click="loadRuns"/);
  assert.match(componentSource, /v-for="item in runOverview"/);
  assert.match(componentSource, /\.runs-page__toolbar \{[\s\S]*background:\s*var\(--graphite-glass-specular\),\s*var\(--graphite-glass-lens\),\s*var\(--graphite-glass-bg-strong\);/);
  assert.match(componentSource, /\.runs-page__overview-card \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.62\);/);
});

test("RunsPage gives status segments warm hover and selected states instead of Element Plus defaults", () => {
  assert.match(componentSource, /\.runs-page__segments\s+:deep\(\.el-segmented__group\) \{[\s\S]*gap:\s*4px;/);
  assert.match(componentSource, /\.runs-page__segments\s+:deep\(\.el-segmented__item:not\(\.is-selected\):hover\) \{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.56\);/);
  assert.match(componentSource, /\.runs-page__segments\s+:deep\(\.el-segmented__item\.is-selected\) \{[\s\S]*color:\s*var\(--graphite-accent-strong\);/);
  assert.match(componentSource, /\.runs-page__segments\s+:deep\(\.el-segmented__item-selected\) \{[\s\S]*border:\s*1px solid rgba\(154,\s*52,\s*18,\s*0\.18\);/);
  assert.match(componentSource, /\.runs-page__segments\s+:deep\(\.el-segmented__item-selected\) \{[\s\S]*box-shadow:\s*0 8px 18px rgba\(120,\s*53,\s*15,\s*0\.1\);/);
});

test("RunsPage renders run cards as clickable log rows with a clear status rail", () => {
  assert.match(componentSource, /class="runs-page__run-row"/);
  assert.match(componentSource, /role="link"/);
  assert.match(componentSource, /@click="openRunDetail\(run\.run_id\)"/);
  assert.match(componentSource, /@keydown="handleRunRowKeydown\(\$event, run\.run_id\)"/);
  assert.match(componentSource, /class="runs-page__status-rail"/);
  assert.match(componentSource, /\.runs-page__run-row:hover \{[\s\S]*transform:\s*translateY\(-1px\);/);
  assert.match(componentSource, /\.runs-page__status-rail \{[\s\S]*background:\s*var\(--graphite-status-fg,/);
});

test("RunsPage separates row navigation from card action clicks", () => {
  assert.match(componentSource, /class="runs-page__detail-link"[\s\S]*@click\.stop="openRunDetail\(run\.run_id\)"/);
  assert.match(componentSource, /class="runs-page__restore-link"[\s\S]*@click\.stop[\s\S]*:to="resolveRunRestoreUrl\(run\.run_id\)"/);
  assert.doesNotMatch(componentSource, /class="runs-page__card-actions" @click\.stop/);
});

test("RunsPage gives clickable run cards pressed feedback", () => {
  assert.match(componentSource, /\.runs-page__run-row:active \{[\s\S]*transform:\s*translateY\(0\) scale\(0\.995\);/);
});
