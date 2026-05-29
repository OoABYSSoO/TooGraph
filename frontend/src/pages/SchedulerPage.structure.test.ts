import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(currentDirectory, "SchedulerPage.vue"), "utf8");

test("SchedulerPage loads jobs including disabled official seeds and exposes primary job actions", () => {
  assert.match(source, /fetchScheduledGraphJobs\(true\)/);
  assert.match(source, /fetchTemplates/);
  assert.match(source, /fetchBuddyChatSessions/);
  assert.match(source, /fetchMessagePlatformBindings/);
  assert.match(source, /fetchMessagePlatformSessions/);
  assert.match(source, /createScheduledGraphJob/);
  assert.match(source, /updateScheduledGraphJob/);
  assert.match(source, /setScheduledGraphJobEnabled/);
  assert.match(source, /runScheduledGraphJob/);
  assert.match(source, /fetchScheduledGraphJobRuns/);
  assert.match(source, /data-virtual-affordance-id="scheduler\.action\.refresh"/);
  assert.match(source, /data-virtual-affordance-id="scheduler\.action\.createJob"/);
  assert.match(source, /data-virtual-affordance-id="scheduler\.job\.toggle"/);
  assert.match(source, /data-virtual-affordance-id="scheduler\.job\.runNow"/);
  assert.match(source, /data-virtual-affordance-zone="scheduler\.jobList"/);
  assert.match(source, /buildOfficialSchedulerEnableRecommendations/);
  assert.match(source, /scheduler\.officialMaintenanceTitle/);
  assert.match(source, /data-virtual-affordance-id="scheduler\.officialMaintenance\.enable"/);
  assert.match(source, /data-virtual-affordance-id="scheduler\.officialMaintenance\.runNow"/);
  assert.match(source, /<ElDialog/);
  assert.match(source, /<ElSelect/);
  assert.match(source, /editDraft/);
  assert.match(source, /scheduler\.runInputs/);
  assert.match(source, /scheduler\.repeatEvery/);
  assert.match(source, /scheduler\.messageOutlet/);
  assert.match(source, /scheduler\.sessionMode/);
  assert.doesNotMatch(source, /selectedJob\.retry_policy/);
  assert.doesNotMatch(source, /createDraft\.delivery_target_json/);
  assert.doesNotMatch(source, /input_bindings_json/);
  assert.doesNotMatch(source, /data-virtual-affordance-zone="scheduler\.job"[\s\S]*data-virtual-affordance-id="scheduler\.job\.toggle"/);
});

test("SchedulerPage links scheduler runs back to run detail records", () => {
  assert.match(source, /`\/runs\/\$\{encodeURIComponent\(run\.run_id\)\}`/);
  assert.match(source, /`\/runs\/\$\{encodeURIComponent\(selectedJob\.last_run_id\)\}`/);
});
