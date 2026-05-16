import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "ActionsPage.vue"), "utf8");
const actionsApiSource = readFileSync(resolve(currentDirectory, "../api/actions.ts"), "utf8");
const sourceCoverageTest = readFileSync(resolve(currentDirectory, "../i18n/sourceCoverage.test.ts"), "utf8");

test("ActionsPage loads the full action catalog into a searchable management surface", () => {
  assert.match(actionsApiSource, /export async function fetchActionCatalog/);
  assert.match(componentSource, /fetchActionCatalog/);
  assert.match(componentSource, /fetchActionFiles/);
  assert.match(componentSource, /const actions = ref<ActionDefinition\[\]>\(\[\]\);/);
  assert.match(componentSource, /const filteredActions = computed\(\(\) => filterActionsForManagement/);
  assert.match(componentSource, /<ElInput[\s\S]*v-model="query"[\s\S]*class="actions-page__search"/);
  assert.match(componentSource, /role="tablist"[\s\S]*class="actions-page__filter-tabs"/);
  assert.match(componentSource, /v-for="action in filteredActions"/);
  assert.doesNotMatch(componentSource, /action\.compatibility/);
  assert.doesNotMatch(componentSource, /actions\.compatibility/);
});

test("ActionsPage uses a two-column inspector with a compact enabled Action list", () => {
  assert.match(componentSource, /class="actions-page__workspace"/);
  assert.match(componentSource, /class="actions-page__selector"/);
  assert.match(componentSource, /class="actions-page__detail"/);
  assert.match(componentSource, /selectedActionKey/);
  assert.match(componentSource, /<ElSwitch[\s\S]*:model-value="action\.status === 'active'"/);
  assert.match(componentSource, /:disabled="busyActionKey === action\.actionKey"/);
  assert.doesNotMatch(componentSource, /!action\.canManage \|\| busyActionKey/);
  assert.doesNotMatch(componentSource, /<details[\s\S]*class="actions-page__card"/);
});

test("ActionsPage exposes a read-only Action package file browser", () => {
  assert.match(componentSource, /fetchActionFiles/);
  assert.match(componentSource, /fetchActionFileContent/);
  assert.match(componentSource, /class="actions-page__file-browser"/);
  assert.match(componentSource, /class="actions-page__file-tree"/);
  assert.match(componentSource, /class="actions-page__file-preview"/);
  assert.match(componentSource, /selectedFilePath/);
});

test("ActionsPage surfaces Action capability metadata without internal runtime status fields", () => {
  assert.match(componentSource, /overview\.visibleActions/);
  assert.doesNotMatch(componentSource, /overview\.runtimeReady/);
  assert.doesNotMatch(componentSource, /overview\.runtimeRegistered/);
  assert.doesNotMatch(componentSource, /overview\.needsAttention/);
  assert.doesNotMatch(componentSource, /capabilityPolicyOriginEntries/);
  assert.doesNotMatch(componentSource, /selectedAction\.kind/);
  assert.doesNotMatch(componentSource, /selectedAction\.mode/);
  assert.doesNotMatch(componentSource, /selectedAction\.scope/);
  assert.match(componentSource, /selectedAction\.permissions/);
  assert.match(componentSource, /selectedAction\.stateInputSchema/);
  assert.match(componentSource, /t\("actions\.stateInputSchema"\)/);
  assert.match(componentSource, /t\("actions\.llmOutputSchema"\)/);
  assert.match(componentSource, /t\("actions\.stateOutputSchema"\)/);
  assert.doesNotMatch(componentSource, /field\.required/);
  assert.doesNotMatch(componentSource, /t\("actions\.required"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.optional"\)/);
  assert.doesNotMatch(componentSource, /selectedAction\.runtimeReady/);
  assert.doesNotMatch(componentSource, /selectedAction\.runtimeRegistered/);
  assert.doesNotMatch(componentSource, /selectedAction\.runtime\.type/);
  assert.doesNotMatch(componentSource, /selectedAction\.runtime\.entrypoint/);
  assert.doesNotMatch(componentSource, /selectedAction\.configured/);
  assert.doesNotMatch(componentSource, /selectedAction\.healthy/);
  assert.doesNotMatch(componentSource, /selectedAction\.llmNodeEligibility/);
  assert.doesNotMatch(componentSource, /selectedAction\.llmNodeBlockers/);
  assert.doesNotMatch(componentSource, /t\("actions\.capabilityPolicy"\)/);
  assert.match(componentSource, /t\("actions\.permissions"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.runtimeReady"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.runtimeRegistered"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.runtimePending"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.runtimeNotRegistered"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.llmNodeEligibility"\)/);
  assert.doesNotMatch(componentSource, /t\("actions\.llmNodeBlockers"\)/);
});

test("ActionsPage avoids legacy per-Action capability policy controls", () => {
  assert.doesNotMatch(componentSource, /class="actions-page__policy-grid"/);
  assert.doesNotMatch(componentSource, /class="actions-page__policy-row"/);
  assert.doesNotMatch(componentSource, /class="actions-page__policy-control"/);
  assert.doesNotMatch(componentSource, /updateActionCapabilityPolicy/);
  assert.doesNotMatch(componentSource, /policyActionKey/);
  assert.doesNotMatch(componentSource, /setActionCapabilityPolicy/);
  assert.doesNotMatch(componentSource, /capabilityPolicySwitchLabel/);
  assert.doesNotMatch(componentSource, /requiresApproval/);
  assert.doesNotMatch(componentSource, /formatCapabilityPolicy/);
});

test("ActionsPage exposes upload, status, and delete management actions with local button styling", () => {
  assert.match(componentSource, /const confirmingActionDeleteKey = ref<string \| null>\(null\);/);
  assert.match(componentSource, /async function setActionEnabled/);
  assert.match(componentSource, /async function setActionStatus/);
  assert.match(componentSource, /async function deleteActionFromCatalog/);
  assert.match(componentSource, /async function importUploadedAction/);
  assert.match(componentSource, /importActionUpload\(files, relativePaths\)/);
  assert.match(componentSource, /updateActionStatus\(action\.actionKey, status\)/);
  assert.match(componentSource, /deleteAction\(action\.actionKey\)/);
  assert.match(componentSource, /class="actions-page__actions"/);
  assert.match(componentSource, /ref="actionArchiveInput"/);
  assert.match(componentSource, /ref="actionDirectoryInput"/);
  assert.match(componentSource, /accept="\.zip,application\/zip"/);
  assert.match(componentSource, /webkitdirectory/);
  assert.match(componentSource, /t\("actions\.importArchive"\)/);
  assert.match(componentSource, /t\("actions\.importFolder"\)/);
  assert.match(componentSource, /t\("actions\.enable"\)/);
  assert.match(componentSource, /t\("actions\.disable"\)/);
  assert.match(componentSource, /t\("actions\.delete"\)/);
  assert.match(componentSource, /t\("actions\.confirmDelete"\)/);
  assert.match(componentSource, /\.actions-page__action \{[\s\S]*background:\s*rgba\(255,\s*248,\s*240,\s*0\.96\);/);
  assert.match(componentSource, /\.actions-page__action--danger/);
});

test("ActionsPage participates in i18n source coverage", () => {
  assert.match(sourceCoverageTest, /"src\/pages\/ActionsPage\.vue"/);
});

test("ActionsPage prevents management controls from overflowing narrow shells", () => {
  assert.match(componentSource, /\.actions-page \{[\s\S]*min-width:\s*0;/);
  assert.match(componentSource, /\.actions-page__filter-tabs \{[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/);
  assert.match(componentSource, /@media \(max-width:\s*700px\) \{[\s\S]*\.actions-page__refresh \{[\s\S]*width:\s*100%;/);
});

test("ActionsPage replaces the bulky segmented status filter with compact warm tabs", () => {
  assert.doesNotMatch(componentSource, /ElSegmented/);
  assert.match(componentSource, /\.actions-page__filter-tab \{/);
  assert.match(componentSource, /\.actions-page__filter-tab--active \{/);
  assert.match(componentSource, /:class="\{ 'actions-page__filter-tab--active': statusFilter === option\.value \}"/);
});

test("ActionsPage uses local short shadows so dense management cards do not stack into bands", () => {
  assert.match(componentSource, /--actions-page-panel-shadow:/);
  assert.match(componentSource, /--actions-page-card-shadow:/);
  assert.match(componentSource, /box-shadow:\s*var\(--actions-page-panel-shadow\);/);
  assert.match(componentSource, /\.actions-page__metric,\r?\n\.actions-page__selector,\r?\n\.actions-page__detail \{[\s\S]*box-shadow:\s*var\(--actions-page-card-shadow\);/);
  assert.doesNotMatch(componentSource, /box-shadow:\s*var\(--toograph-shadow-panel\);/);
});
