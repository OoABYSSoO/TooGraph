import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "EditorRunActivityPanel.vue"), "utf8");

test("EditorRunActivityPanel renders a realtime auto-follow activity feed", () => {
  assert.match(componentSource, /class="editor-run-activity-panel"/);
  assert.match(componentSource, /ref="activityScrollRef"/);
  assert.match(componentSource, /watch\(\s*\(\) => props\.entries\.length/);
  assert.match(componentSource, /scrollToLatest/);
  assert.match(componentSource, /autoFollow/);
  assert.match(componentSource, /backToLatest/);
  assert.match(componentSource, /v-for="entry in entries"/);
  assert.match(componentSource, /isEntryExpanded\(entry\.id\)/);
  assert.match(componentSource, /JSON\.stringify\(entry\.detail, null, 2\)/);
});
