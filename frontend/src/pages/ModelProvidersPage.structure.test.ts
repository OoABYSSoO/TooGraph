import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDirectory, "ModelProvidersPage.vue"), "utf8");
const settingsSource = readFileSync(resolve(currentDirectory, "SettingsPage.vue"), "utf8");

test("ModelProvidersPage makes ChatGPT Codex sign-in the first provider card", () => {
  assert.match(pageSource, /settings\.codexLogin/);
  assert.match(pageSource, /settings\.codexLoginStatus/);
  assert.match(pageSource, /handleStartCodexLogin/);
  assert.match(pageSource, /model-providers-page__provider-card--codex/);
  assert.match(pageSource, /v-if="isLoginProvider\(provider\)"/);
  assert.match(pageSource, /discoverModelProviderModels/);
  assert.doesNotMatch(pageSource, /codex-login-card/);
});

test("ModelProvidersPage owns provider editing while Settings links to it", () => {
  assert.match(pageSource, /settings\.modelProviders/);
  assert.match(pageSource, /settings\.addProvider/);
  assert.match(pageSource, /buildProviderSavePayload/);
  assert.doesNotMatch(settingsSource, /handleStartCodexLogin/);
  assert.doesNotMatch(settingsSource, /settings-page__provider-editor-list/);
  assert.match(settingsSource, /to="\/models"/);
});

test("ModelProvidersPage presents providers as cards before editing", () => {
  assert.match(pageSource, /class="model-providers-page__provider-cards"/);
  assert.match(pageSource, /v-for="provider in providerCardList"/);
  assert.match(pageSource, /settings\.configuredProviders/);
  assert.match(pageSource, /settings\.configureProvider/);
  assert.match(pageSource, /@click="openAddProviderPanel"/);
  assert.match(pageSource, /providerCardList = computed\(\(\) =>[\s\S]*codexProvider\.value[\s\S]*provider\.provider_id !== "openai-codex"/);
  assert.doesNotMatch(pageSource, /<section v-for="provider in providerDraftList"[\s\S]*class="model-providers-page__provider-editor"/);
});

test("ModelProvidersPage applies provider changes immediately without a manual save button", () => {
  assert.doesNotMatch(pageSource, /settings\.saveSettings/);
  assert.doesNotMatch(pageSource, /class="model-providers-page__actions"/);
  assert.match(pageSource, /async function persistSettings\(/);
  assert.match(pageSource, /@change="handleRuntimeDraftChange"/);
  assert.match(pageSource, /@change="handleProviderEnabledChange\(provider\)"/);
  assert.match(pageSource, /@change="handleProviderDraftChange"/);
  assert.match(pageSource, /@click="commitPendingProvider"/);
  assert.match(pageSource, /@click="handleRemoveProvider\(provider\.provider_id\)"/);
});

test("ModelProvidersPage refreshes discovered models instead of manually creating graph models", () => {
  assert.match(pageSource, /settings\.refreshModels/);
  assert.doesNotMatch(pageSource, /allow-create/);
  assert.match(pageSource, /provider\.discovered_models = discoveredModels;/);
  assert.match(pageSource, /provider\.selected_models = discoveredModels;/);
  assert.match(pageSource, /await persistSettings\(/);
});

test("ModelProvidersPage lets provider management occupy the full card grid", () => {
  assert.match(pageSource, /\.model-providers-page__panel--wide \{[\s\S]*grid-column: 1 \/ -1;/);
  assert.match(pageSource, /\.model-providers-page__provider-cards \{[\s\S]*repeat\(auto-fill, minmax\(260px, 1fr\)\)/);
});

test("ModelProvidersPage opens an add-provider panel and immediately pre-fills templates", () => {
  assert.match(pageSource, /const providerEditorMode = ref<"none" \| "add" \| "edit">\("none"\);/);
  assert.match(pageSource, /const pendingTemplateId = ref\(""\);/);
  assert.match(pageSource, /const pendingProviderDraft = ref<ProviderDraft \| null>\(null\);/);
  assert.match(pageSource, /v-if="providerEditorMode === 'add'"/);
  assert.match(pageSource, /v-model="pendingTemplateId"[\s\S]*@change="handlePendingTemplateChange"/);
  assert.match(pageSource, /function handlePendingTemplateChange\(\) \{[\s\S]*pendingProviderDraft\.value = buildProviderDraftFromTemplate\(template\);/);
  assert.match(pageSource, /function commitPendingProvider\(\)/);
});

test("ModelProvidersPage hides engineering provider fields inside advanced settings", () => {
  assert.match(pageSource, /<details class="model-providers-page__advanced-provider">/);
  assert.match(pageSource, /settings\.advancedProviderSettings/);
  assert.match(pageSource, /settings\.providerId[\s\S]*settings\.providerTransport[\s\S]*settings\.providerAuthHeader[\s\S]*settings\.providerAuthScheme/);
  assert.match(pageSource, /v-if="showBaseUrlInPrimaryFields\(providerEditorDraft\)"/);
  assert.match(pageSource, /v-else[\s\S]*settings\.providerBaseUrl/);
});

test("ModelProvidersPage shows ChatGPT device-code entry as part of the normal login flow", () => {
  assert.match(pageSource, /openCodexVerificationWindow\(\)/);
  assert.match(pageSource, /const authWindow = openCodexVerificationWindow\(\);[\s\S]*codexLoginSession\.value = await startOpenAICodexAuth\(\);[\s\S]*handleOpenCodexVerification\(authWindow\)/);
  assert.match(pageSource, /class="model-providers-page__login-steps"/);
  assert.match(pageSource, /class="model-providers-page__device-code"/);
  assert.match(pageSource, /\{\{ codexLoginSession\.user_code \}\}/);
  assert.match(pageSource, /<ElIcon aria-hidden="true"><CopyDocument \/><\/ElIcon>/);
  assert.match(pageSource, /:aria-label="t\('settings\.codexCopyDeviceCode'\)"/);
  assert.match(pageSource, /settings\.codexFallbackLogin/);
  assert.match(pageSource, /settings\.codexLoginWaiting/);
  assert.doesNotMatch(pageSource, /<input :value="codexLoginSession\.verification_url"/);
  assert.doesNotMatch(pageSource, /<input :value="codexLoginSession\.user_code"/);
});

test("ModelProvidersPage uses toast feedback for ChatGPT copy attempts", () => {
  assert.match(pageSource, /import \{ ElIcon, ElMessage, ElOption, ElSelect \} from "element-plus";/);
  assert.match(pageSource, /import \{ CircleCheck, CopyDocument \} from "@element-plus\/icons-vue";/);
  assert.match(pageSource, /function showCodexToast\(type: "success" \| "error", message: string\)/);
  assert.match(pageSource, /ElMessage\(\{[\s\S]*customClass:\s*"model-providers-page__copy-toast"[\s\S]*message,[\s\S]*\}\);/);
  assert.match(pageSource, /settings\.codexCodeCopyFailed/);
  assert.match(pageSource, /showCodexToast\("success", t\("settings\.codexCodeCopied"\)\);/);
  assert.match(pageSource, /try \{[\s\S]*navigator\.clipboard\.writeText\(codexLoginSession\.value\.user_code\);[\s\S]*\} catch/);
});

test("ModelProvidersPage hides the ChatGPT login action after sign-in", () => {
  assert.match(pageSource, /v-if="!provider\.auth_status\?\.authenticated"/);
  assert.match(pageSource, /v-else[\s\S]*class="model-providers-page__connected-state"/);
  assert.match(pageSource, /<ElIcon aria-hidden="true"><CircleCheck \/><\/ElIcon>/);
  assert.match(pageSource, /settings\.codexLoggedInTitle/);
  assert.match(pageSource, /settings\.codexLoggedInHelp/);
});

test("ModelProvidersPage keeps ChatGPT authorization usable in embedded browsers", () => {
  assert.doesNotMatch(pageSource, /authWindow\.opener\s*=/);
  assert.match(pageSource, /const verificationOpened = handleOpenCodexVerification\(authWindow\);/);
  assert.match(pageSource, /verificationOpened \? "settings\.codexLoginStarted" : "settings\.codexPopupBlocked"/);
  assert.match(pageSource, /try \{[\s\S]*authWindow\.location\.href = codexLoginSession\.value\.verification_url;[\s\S]*\} catch/);
  assert.match(pageSource, /const openedWindow = window\.open\(codexLoginSession\.value\.verification_url, "_blank", "noopener,noreferrer"\);/);
  assert.match(pageSource, /settings\.codexCopyVerificationUrl/);
  assert.match(pageSource, /navigator\.clipboard\.writeText\(codexLoginSession\.value\.verification_url\)/);
});
