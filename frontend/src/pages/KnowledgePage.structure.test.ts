import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(currentDirectory, "KnowledgePage.vue"), "utf8");
const apiSource = readFileSync(resolve(currentDirectory, "../api/knowledge.ts"), "utf8");
const messagesSource = readFileSync(resolve(currentDirectory, "../i18n/messages.ts"), "utf8");

test("KnowledgePage is a managed-folder ingestion console for the new retrieval system", () => {
  assert.match(componentSource, /fetchKnowledgeBases/);
  assert.match(componentSource, /importKnowledgeFolder/);
  assert.match(componentSource, /fetchTemplates/);
  assert.match(componentSource, /runGraph/);
  assert.match(componentSource, /knowledge_folder_retrieval_ingestion/);
  assert.doesNotMatch(componentSource, /knowledge_bases|knowledge_documents|knowledge_chunks/);
});

test("KnowledgePage exposes folder import, graph-template selection, and run links", () => {
  assert.match(componentSource, /class="knowledge-page__layout"/);
  assert.match(componentSource, /class="knowledge-page__import-panel"/);
  assert.match(componentSource, /class="knowledge-page__base-list"/);
  assert.match(componentSource, /v-model="importDraft\.source_path"/);
  assert.match(componentSource, /v-model="importDraft\.template_id"/);
  assert.match(componentSource, /fetchLocalPickerDirectoryEntries/);
  assert.match(componentSource, /knowledge-page__folder-picker/);
  assert.match(componentSource, /selectPickerFolder/);
  assert.match(componentSource, /openFolderPicker/);
  assert.doesNotMatch(componentSource, /ref="folderDirectoryInput"/);
  assert.doesNotMatch(componentSource, /webkitdirectory/);
  assert.doesNotMatch(componentSource, /importUploadedKnowledgeFolder/);
  assert.match(componentSource, /data-virtual-affordance-id="knowledge.action.importFolder"/);
  assert.match(componentSource, /RouterLink[\s\S]*\/runs\/\$\{encodeURIComponent\(selectedBase\.last_run_id\)\}/);
});

test("KnowledgePage keeps the knowledge name generic and does not filter template choices to old ingestion markers", () => {
  assert.doesNotMatch(messagesSource, /西安行动型政策库|Xi'an action policy/);
  assert.match(componentSource, /const templateOptions = computed/);
  assert.doesNotMatch(componentSource, /ingestionTemplates/);
  assert.doesNotMatch(componentSource, /isKnowledgeIngestionTemplate/);
});

test("KnowledgePage binds one selected Input node as the folder input for the chosen template", () => {
  assert.match(componentSource, /selectedFolderInputNodeId/);
  assert.match(componentSource, /folderInputNodeOptions/);
  assert.match(componentSource, /resetTemplateBindingToDefault/);
  assert.match(componentSource, /@change="selectIngestionTemplate"/);
  assert.match(componentSource, /v-model="selectedFolderInputNodeId"/);
  assert.match(
    componentSource,
    /buildKnowledgeIngestionGraph\(\s*template,\s*imported\.knowledge_base,\s*imported\.folder_package,\s*imported\.operation\.operation_id,\s*selectedFolderInputNodeId\.value,\s*\)/,
  );
});

test("KnowledgePage records ingestion runs with the indexing operation id", () => {
  assert.match(componentSource, /knowledge_operation_id:\s*operationId/);
  assert.match(componentSource, /patchKnowledgeToolNode\(node,\s*base,\s*operationId\)/);
  assert.match(componentSource, /staticInputs\.operation_id\s*=\s*operationId/);
  assert.match(
    componentSource,
    /recordKnowledgeBaseRun\(imported\.knowledge_base\.collection_id,\s*\{[\s\S]*run_id:\s*run\.run_id,[\s\S]*template_id:\s*importDraft\.value\.template_id\.trim\(\),[\s\S]*operation_id:\s*imported\.operation\.operation_id,[\s\S]*\}\)/,
  );
});

test("KnowledgePage exposes operation-aware progress and status controls", () => {
  assert.match(componentSource, /selectedBaseProgress/);
  assert.match(componentSource, /knowledgeProgressPercent/);
  assert.match(componentSource, /knowledgeStatusLabel/);
  assert.match(componentSource, /knowledgeStatusClass/);
  assert.match(componentSource, /canRetrySelectedOperation/);
  assert.match(componentSource, /canPauseSelectedOperation/);
  assert.match(componentSource, /canResumeSelectedOperation/);
  assert.match(componentSource, /canRunKnowledgeOperationAction/);
  assert.match(componentSource, /isOperationInFlight/);
  assert.match(componentSource, /status === "ingesting"/);
  assert.match(componentSource, /knowledge-page__mini-progress/);
  assert.match(componentSource, /knowledge-page__progress|knowledge-page__operation-panel/);
  assert.match(componentSource, /knowledge-page__operation-alert/);
  assert.match(componentSource, /retrySelectedOperation/);
  assert.match(componentSource, /pauseSelectedOperation/);
  assert.match(componentSource, /resumeSelectedOperation/);
  assert.match(componentSource, /operationActionLoading/);
  assert.match(componentSource, /\/settings\/model-providers/);
});

test("Knowledge API exposes operation recovery endpoints", () => {
  assert.match(apiSource, /KnowledgeOperationActionResponse\s*=\s*KnowledgeBase/);
  assert.match(apiSource, /retryKnowledgeOperation/);
  assert.match(apiSource, /\/operations\/\$\{encodePathSegment\(operationId\)\}\/retry/);
  assert.match(apiSource, /pauseKnowledgeOperation/);
  assert.match(apiSource, /\/operations\/\$\{encodePathSegment\(operationId\)\}\/pause/);
  assert.match(apiSource, /resumeKnowledgeOperation/);
  assert.match(apiSource, /\/operations\/\$\{encodePathSegment\(operationId\)\}\/resume/);
});
