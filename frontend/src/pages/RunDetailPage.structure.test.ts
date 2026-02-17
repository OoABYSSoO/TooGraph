import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "RunDetailPage.vue"), "utf8");

test("RunDetailPage exposes a restore editor action when the loaded run can be restored", () => {
  assert.match(componentSource, /import \{ formatRunDisplayName \} from "@\/lib\/run-display-name";/);
  assert.match(componentSource, /import \{ buildSnapshotScopedRun, canRestoreRunDetail, resolveRunRestoreUrl, resolveRunSnapshot \} from "@\/lib\/run-restore";/);
  assert.match(componentSource, /const canRestore = computed\(\(\) => \(run\.value \? canRestoreRunDetail\(run\.value\) : false\)\);/);
  assert.match(componentSource, /const runDisplayName = computed\(\(\) => \(run\.value \? formatRunDisplayName\(run\.value\) : runId\.value\)\);/);
  assert.match(componentSource, /const selectedSnapshotId = computed/);
  assert.match(componentSource, /const snapshotOptions = computed/);
  assert.match(componentSource, /const restoreEditorHref = computed\(\(\) => \(run\.value \? resolveRunRestoreUrl\(run\.value\.run_id, selectedSnapshotId\.value\) : "\/editor\/new"\)\);/);
  assert.match(componentSource, /运行详情 \{\{ runDisplayName \}\}/);
  assert.match(componentSource, /v-if="canRestore"/);
  assert.match(componentSource, /恢复编辑/);
  assert.match(componentSource, /run-detail__snapshot-switcher/);
  assert.match(componentSource, /v-for="option in snapshotOptions"/);
});

test("RunDetailPage uses semantic status styling for the primary run badge", () => {
  assert.match(componentSource, /function statusBadgeClass\(status: string\)/);
  assert.match(componentSource, /:class="statusBadgeClass\(viewedRun\?\.status \?\? run\.status\)"/);
  assert.match(componentSource, /\.run-detail__badges span \{[\s\S]*background:\s*var\(--graphite-status-bg,/);
  assert.match(componentSource, /\.run-detail__content \{[\s\S]*font-family:\s*var\(--graphite-font-mono\);/);
});
