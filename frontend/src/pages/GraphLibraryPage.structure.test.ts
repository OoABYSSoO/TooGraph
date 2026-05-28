import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const componentSource = readFileSync(resolve(currentDirectory, "GraphLibraryPage.vue"), "utf8").replace(/\r\n/g, "\n");

test("GraphLibraryPage renders templates and graphs as separate side-by-side columns", () => {
  const templateColumnIndex = componentSource.indexOf('graph-library-page__column--templates');
  const graphColumnIndex = componentSource.indexOf('graph-library-page__column--graphs');

  assert.ok(templateColumnIndex >= 0, "expected a templates column");
  assert.ok(graphColumnIndex >= 0, "expected a graphs column");
  assert.ok(templateColumnIndex < graphColumnIndex, "expected templates before graphs in the DOM");
  assert.match(componentSource, /const filteredColumns = computed\(\(\) => splitGraphLibraryItems\(filteredItems\.value\)\);/);
  assert.match(componentSource, /\.graph-library-page__columns \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(componentSource, /@media \(max-width:\s*980px\) \{[\s\S]*\.graph-library-page__columns \{[\s\S]*grid-template-columns:\s*1fr;/);
});

test("GraphLibraryPage lays out responsive management cards without clipping", () => {
  const desktopColumnListRuleStart = componentSource.indexOf(
    ".graph-library-page__column-list {\n  grid-template-columns",
  );
  const desktopColumnListRule = componentSource.slice(
    desktopColumnListRuleStart,
    componentSource.indexOf(".graph-library-page__empty,", desktopColumnListRuleStart),
  );
  assert.match(desktopColumnListRule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(componentSource, /@media \(max-width:\s*980px\) \{[\s\S]*\.graph-library-page__column-list \{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(componentSource, /@media \(max-width:\s*700px\) \{[\s\S]*\.graph-library-page__column-list \{[\s\S]*grid-template-columns:\s*1fr;/);
});

test("GraphLibraryPage keeps start actions compact instead of repeating the full editor welcome catalog", () => {
  assert.doesNotMatch(componentSource, /import EditorWelcomeState from "@\/editor\/workspace\/EditorWelcomeState\.vue";/);
  assert.match(componentSource, /ref="pythonGraphImportInput"/);
  assert.match(componentSource, /accept="\.py,text\/x-python,text\/plain"/);
  assert.match(componentSource, /class="graph-library-page__quick-actions"/);
  assert.match(componentSource, /@click="openBlankEditorGraph"/);
  assert.match(componentSource, /@click="openPythonGraphImportDialog"/);
  assert.match(componentSource, /router\.push\("\/editor\/new"\)/);
  assert.match(componentSource, /writePersistedEditorWorkspace/);
  assert.match(componentSource, /writePersistedEditorDocumentDraft/);
});

test("GraphLibraryPage makes each management card openable while keeping management actions secondary", () => {
  assert.match(componentSource, /class="graph-library-page__card-open"/);
  assert.match(componentSource, /<button[\s\S]*class="graph-library-page__card-open"/);
  assert.match(componentSource, /@click="openLibraryItem\(item\)"/);
  assert.match(componentSource, /class="graph-library-page__open-hint"/);
  assert.match(componentSource, /@click\.stop/);
  assert.match(componentSource, /function openLibraryItem\(item: GraphLibraryItem\)/);
  assert.match(componentSource, /router\.push\(`\/editor\/\$\{encodeURIComponent\(item\.id\)\}`\)/);
  assert.match(componentSource, /function openTemplateDraft\(template: TemplateRecord\)/);
});

test("GraphLibraryPage shows gallery template signals on catalog cards", () => {
  assert.doesNotMatch(componentSource, /fetchEvalSuites/);
  assert.doesNotMatch(componentSource, /fetchEvalRuns/);
  assert.doesNotMatch(componentSource, /buildGraphLibraryTemplateEvalSummaries/);
  assert.match(componentSource, /class="graph-library-page__template-brief"/);
  assert.match(componentSource, /class="graph-library-page__template-facts"/);
  assert.match(componentSource, /graphLibrary\.mockEntry/);
  assert.match(componentSource, /graphLibrary\.sampleOutput/);
  assert.match(componentSource, /graphLibrary\.permissionNeeds/);
  assert.match(componentSource, /graphLibrary\.useTemplate/);
});

test("GraphLibraryPage exposes a separate capability discovery switch for templates", () => {
  assert.match(componentSource, /item\.kind === ['"]template['"]/);
  assert.match(componentSource, /graphLibrary\.capabilityDiscoverable/);
  assert.match(componentSource, /updateTemplateCapabilityDiscoverable/);
  assert.match(componentSource, /!item\.canToggleCapabilityDiscoverable/);
  assert.match(componentSource, /setTemplateCapabilityDiscoverable\(item, Boolean\(\$event\)\)/);
});

test("GraphLibraryPage exposes saved graph revision history and restore controls", () => {
  assert.match(componentSource, /import \{[\s\S]*ElDialog,[\s\S]*ElMessage,[\s\S]*ElMessageBox,[\s\S]*ElSwitch[\s\S]*\} from "element-plus";/);
  assert.match(componentSource, /fetchGraphRevisions/);
  assert.match(componentSource, /restoreGraphRevision/);
  assert.match(componentSource, /buildGraphRevisionHistoryRows/);
  assert.match(componentSource, /item\.kind === "graph"/);
  assert.match(componentSource, /@click="openGraphRevisionHistory\(item\)"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`library\.graph\.\$\{item\.id\}\.history`"/);
  assert.match(componentSource, /<ElDialog[\s\S]*v-model="graphRevisionDialogOpen"/);
  assert.match(componentSource, /v-for="row in graphRevisionRows"/);
  assert.match(componentSource, /@click="restoreGraphRevisionFromHistory\(row\)"/);
  assert.match(componentSource, /data-virtual-affordance-requires-confirmation="true"/);
});

test("GraphLibraryPage exposes official page-operation affordance ids", () => {
  assert.match(componentSource, /data-virtual-affordance-id="library\.action\.newBlankGraph"/);
  assert.match(componentSource, /data-virtual-affordance-id="library\.action\.importPython"/);
  assert.match(componentSource, /data-virtual-affordance-id="library\.search\.query"/);
  assert.match(componentSource, /:data-virtual-affordance-id="`library\.filter\.status\.\$\{option\.value\}`"/);
  assert.match(componentSource, /:data-virtual-affordance-id="item\.kind === 'template' \? `library\.template\.\$\{item\.id\}\.open` : `library\.graph\.\$\{item\.id\}\.open`"/);
  assert.match(componentSource, /data-virtual-affordance-destructive="true"/);
});
