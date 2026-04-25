import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDirectory, "ModelProvidersPage.vue"), "utf8");
const settingsSource = readFileSync(resolve(currentDirectory, "SettingsPage.vue"), "utf8");

test("ModelProvidersPage makes ChatGPT Codex sign-in the primary model action", () => {
  assert.match(pageSource, /settings\.codexLogin/);
  assert.match(pageSource, /settings\.codexLoginStatus/);
  assert.match(pageSource, /handleStartCodexLogin/);
  assert.match(pageSource, /codex-login-card/);
  assert.match(pageSource, /discoverModelProviderModels/);
});

test("ModelProvidersPage owns provider editing while Settings links to it", () => {
  assert.match(pageSource, /settings\.modelProviders/);
  assert.match(pageSource, /settings\.addProvider/);
  assert.match(pageSource, /buildProviderSavePayload/);
  assert.doesNotMatch(settingsSource, /handleStartCodexLogin/);
  assert.doesNotMatch(settingsSource, /settings-page__provider-editor-list/);
  assert.match(settingsSource, /to="\/models"/);
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
  assert.match(pageSource, /v-if="!codexProvider\.auth_status\?\.authenticated"/);
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
