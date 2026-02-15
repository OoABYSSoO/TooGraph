import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "RunsPage.vue"), "utf8");

test("RunsPage keeps run cards on detail navigation while exposing an explicit restore editor action", () => {
  assert.match(componentSource, /import \{ formatRunDisplayName \} from "@\/lib\/run-display-name";/);
  assert.match(componentSource, /import \{ canRestoreRunSummary, resolveRunRestoreUrl \} from "@\/lib\/run-restore";/);
  assert.match(componentSource, /import \{ resolveRunsCardDetail, resolveRunsEmptyAction \} from "\.\/runsPageModel\.ts";/);
  assert.match(componentSource, /const runCardDetail = resolveRunsCardDetail\(\);/);
  assert.match(componentSource, /v-if="canRestoreRunSummary\(run\)"/);
  assert.match(componentSource, /:to="resolveRunRestoreUrl\(run\.run_id\)"/);
  assert.match(componentSource, /\{\{ formatRunDisplayName\(run\) \}\}/);
  assert.match(componentSource, /\{\{ runCardDetail \}\}/);
  assert.match(componentSource, /恢复编辑/);
});
