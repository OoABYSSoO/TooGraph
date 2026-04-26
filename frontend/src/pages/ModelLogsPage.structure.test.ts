import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDirectory, "ModelLogsPage.vue"), "utf8");

test("ModelLogsPage renders a themed paginated raw model request log", () => {
  assert.match(pageSource, /<AppShell>/);
  assert.match(pageSource, /class="model-logs-page"/);
  assert.match(pageSource, /fetchModelLogs/);
  assert.match(pageSource, /<ElInput[\s\S]*v-model="query"/);
  assert.match(pageSource, /<ElPagination[\s\S]*v-model:current-page="currentPage"[\s\S]*:page-size="pageSize"[\s\S]*:total="total"/);
  assert.match(pageSource, /model-logs-page__entry/);
  assert.match(pageSource, /model-logs-page__request-raw/);
  assert.match(pageSource, /model-logs-page__response-raw/);
  assert.match(pageSource, /JSON\.stringify\(selectedLog\.request_raw, null, 2\)/);
  assert.match(pageSource, /JSON\.stringify\(selectedLog\.response_raw, null, 2\)/);
  assert.match(pageSource, /v-for="message in selectedLog\.messages"/);
  assert.match(pageSource, /selectedLog\.reasoning/);
  assert.match(pageSource, /selectedLog\.content/);
  assert.match(pageSource, /\.model-logs-page__raw-grid \{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(pageSource, /@media \(max-width:\s*980px\) \{[\s\S]*\.model-logs-page__raw-grid \{[\s\S]*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(pageSource, /LM Core Monitor/);
});
