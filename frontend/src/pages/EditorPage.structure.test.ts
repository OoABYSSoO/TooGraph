import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorPage.vue"), "utf8");

test("EditorPage forwards restoreRun route queries into the workspace shell", () => {
  assert.match(componentSource, /:restore-run-id="requestedRestoreRunId"/);
  assert.match(componentSource, /:restore-snapshot-id="requestedRestoreSnapshotId"/);
  assert.match(componentSource, /const requestedRestoreRunId = computed\(\(\) => asString\(route\.query\.restoreRun\)\);/);
  assert.match(componentSource, /const requestedRestoreSnapshotId = computed\(\(\) => asString\(route\.query\.snapshot\)\);/);
});
