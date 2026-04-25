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
  assert.doesNotMatch(pageSource, /class="model-providers-page__save-message"/);
  assert.match(pageSource, /<Transition name="model-providers-page__save-toast-motion">/);
  assert.match(pageSource, /class="model-providers-page__save-toast"/);
  assert.match(pageSource, /role="status"/);
  assert.match(pageSource, /aria-live="polite"/);
  assert.match(pageSource, /class="model-providers-page__save-toast-dot"/);
  assert.match(pageSource, /let saveMessageTimer: number \| null = null;/);
  assert.match(pageSource, /function setSaveMessage\(message: string \| null, options\?: \{ autoDismiss\?: boolean \}\)/);
  assert.match(pageSource, /setSaveMessage\(t\("settings\.saving"\)\);/);
  assert.match(pageSource, /setSaveMessage\(t\("settings\.saved"\), \{ autoDismiss: true \}\);/);
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
  assert.match(pageSource, /if \(options\.selectDiscovered\) \{[\s\S]*provider\.selected_models = discoveredModels;/);
  assert.match(pageSource, /await persistSettings\(/);
});

test("ModelProvidersPage lets provider management occupy the full card grid", () => {
  assert.match(pageSource, /\.model-providers-page__panel--wide \{[\s\S]*grid-column: 1 \/ -1;/);
  assert.match(pageSource, /\.model-providers-page__provider-cards \{[\s\S]*repeat\(auto-fill, minmax\(420px, 1fr\)\)/);
  assert.match(pageSource, /\.model-providers-page__provider-card \{[\s\S]*padding:\s*18px;/);
});

test("ModelProvidersPage keeps provider card controls on one row with capsule switches", () => {
  assert.match(pageSource, /import \{ ElIcon, ElMessage, ElOption, ElPopover, ElSelect, ElSwitch \} from "element-plus";/);
  assert.match(pageSource, /class="model-providers-page__switch"/);
  assert.match(pageSource, /:width="54"/);
  assert.match(pageSource, /inline-prompt/);
  assert.match(pageSource, /class="model-providers-page__provider-card-controls"/);
  assert.match(pageSource, /class="model-providers-page__icon-button model-providers-page__refresh-icon-button"/);
  assert.match(pageSource, /<Refresh \/>/);
  assert.match(pageSource, /@click="handleDiscoverModels\(provider\.provider_id\)"/);
  assert.match(pageSource, /model-providers-page__refresh-icon-button[\s\S]*model-providers-page__switch/);
  assert.match(pageSource, /\.model-providers-page__provider-card \.model-providers-page__provider-actions \{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(pageSource, /\.model-providers-page__provider-card \.model-providers-page__button \{[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(pageSource, /class="model-providers-page__toggle"/);
  assert.doesNotMatch(pageSource, /class="model-providers-page__button"[\s\S]{0,500}@click="handleDiscoverModels\(provider\.provider_id\)"/);
});

test("ModelProvidersPage shows and edits provider models from each card", () => {
  assert.match(pageSource, /settings\.addModel/);
  assert.match(pageSource, /class="model-providers-page__provider-model-pills"/);
  assert.match(pageSource, /v-for="modelName in provider\.selected_models"/);
  assert.match(pageSource, /class="model-providers-page__provider-model-pill model-providers-page__provider-model-pill-button"/);
  assert.match(pageSource, /class="model-providers-page__provider-model-remove"/);
  assert.match(pageSource, /<Close \/>/);
  assert.match(pageSource, /@click\.stop="removeProviderModel\(provider, modelName\)"/);
  assert.match(pageSource, /<ElPopover[\s\S]*popper-class="model-providers-page__model-picker-popper"/);
  assert.match(pageSource, /:visible="activeModelPickerProviderId === provider\.provider_id"/);
  assert.match(pageSource, /:popper-style="modelPickerPopoverStyle"/);
  assert.match(pageSource, /class="model-providers-page__model-picker"/);
  assert.match(pageSource, /v-if="isProviderModelPickerLoading\(provider\)"/);
  assert.match(pageSource, /class="model-providers-page__model-picker-loading"/);
  assert.match(pageSource, /role="status"/);
  assert.match(pageSource, /settings\.discoveringModels/);
  assert.match(pageSource, /v-else-if="providerModelOptions\(provider\)\.length === 0"/);
  assert.match(pageSource, /@click\.stop="handleAddProviderModel\(provider\)"/);
  assert.match(pageSource, /v-for="modelName in providerModelOptions\(provider\)"/);
  assert.match(pageSource, /class="model-providers-page__model-picker-option"/);
  assert.match(pageSource, /model-providers-page__model-picker-option--selected/);
  assert.match(pageSource, /@click\.stop="toggleProviderModel\(provider, modelName\)"/);
  assert.match(pageSource, /<ElIcon v-if="isProviderModelSelected\(provider, modelName\)" aria-hidden="true"><Check \/><\/ElIcon>/);
  assert.match(pageSource, /const activeModelPickerProviderId = ref<string \| null>\(null\);/);
  assert.match(pageSource, /const refreshingModelPickerProviderId = ref<string \| null>\(null\);/);
  assert.match(pageSource, /function providerModelOptions\(provider: ProviderDraft\)/);
  assert.match(pageSource, /function isProviderModelPickerLoading\(provider: ProviderDraft\)/);
  assert.match(pageSource, /function handleModelPickerVisibleChange\(provider: ProviderDraft, visible: boolean\) \{[\s\S]*if \(\s*refreshingModelPickerProviderId\.value === provider\.provider_id \|\|[\s\S]*discoveringProviderId\.value === provider\.provider_id[\s\S]*\) \{[\s\S]*activeModelPickerProviderId\.value = provider\.provider_id;/);
  assert.match(pageSource, /async function handleAddProviderModel\(provider: ProviderDraft\)/);
  assert.match(pageSource, /refreshingModelPickerProviderId\.value = provider\.provider_id;/);
  assert.match(pageSource, /await handleDiscoverModels\(provider\.provider_id, \{ selectDiscovered: false \}\);/);
  assert.match(pageSource, /finally \{[\s\S]*activeModelPickerProviderId\.value = provider\.provider_id;[\s\S]*refreshingModelPickerProviderId\.value = null;/);
  const addModelFunction = pageSource.match(/async function handleAddProviderModel\(provider: ProviderDraft\) \{[\s\S]*?\n\}/);
  assert.ok(addModelFunction, "expected add-model handler to exist");
  assert.doesNotMatch(addModelFunction[0], /provider\.selected_models|selectDiscovered:\s*true/);
  assert.match(pageSource, /function toggleProviderModel\(provider: ProviderDraft, modelName: string\)/);
  assert.match(pageSource, /function removeProviderModel\(provider: ProviderDraft, modelName: string\)/);
  assert.match(pageSource, /void persistSettings\(\);/);
  assert.match(pageSource, /\.model-providers-page__model-picker \{[\s\S]*background:\s*rgba\(255,\s*244,\s*232,\s*0\.96\);/);
  assert.match(pageSource, /\.model-providers-page__provider-model-pill \{[\s\S]*color:\s*rgb\(37,\s*99,\s*235\);/);
  assert.match(pageSource, /\.model-providers-page__model-picker-option--selected \{[\s\S]*color:\s*rgb\(37,\s*99,\s*235\);/);
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
  assert.match(pageSource, /import \{ ElIcon, ElMessage, ElOption, ElPopover, ElSelect, ElSwitch \} from "element-plus";/);
  assert.match(pageSource, /import \{ Check, CircleCheck, Close, CopyDocument, Plus, Refresh \} from "@element-plus\/icons-vue";/);
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

test("ModelProvidersPage confirms ChatGPT logout with the same popover pattern as node deletion", () => {
  assert.match(pageSource, /const activeLogoutConfirmProviderId = ref<string \| null>\(null\);/);
  assert.match(pageSource, /const logoutConfirmTimeoutRef = ref<number \| null>\(null\);/);
  assert.match(pageSource, /<ElPopover[\s\S]*:visible="activeLogoutConfirmProviderId === provider\.provider_id"[\s\S]*popper-class="model-providers-page__confirm-popover model-providers-page__confirm-popover--logout"/);
  assert.match(pageSource, /class="model-providers-page__button model-providers-page__button--danger"/);
  assert.match(pageSource, /:class="\{ 'model-providers-page__button--confirm-danger': activeLogoutConfirmProviderId === provider\.provider_id \}"/);
  assert.match(pageSource, /<ElIcon v-if="activeLogoutConfirmProviderId === provider\.provider_id" aria-hidden="true"><Check \/><\/ElIcon>/);
  assert.match(pageSource, /settings\.codexLogoutQuestion/);
  assert.match(pageSource, /function handleLogoutCodexClick\(providerId: string\)/);
  assert.match(pageSource, /if \(activeLogoutConfirmProviderId\.value === providerId\) \{[\s\S]*void handleLogoutCodex\(\);/);
  assert.match(pageSource, /function startLogoutConfirmWindow\(providerId: string\)/);
  assert.match(pageSource, /window\.setTimeout\(\(\) => \{[\s\S]*activeLogoutConfirmProviderId\.value = null;[\s\S]*\}, 2000\);/);
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
