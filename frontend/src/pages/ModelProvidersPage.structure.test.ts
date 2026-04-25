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

test("ModelProvidersPage keeps ChatGPT device-code details behind a fallback login flow", () => {
  assert.match(pageSource, /openCodexVerificationWindow\(\)/);
  assert.match(pageSource, /const authWindow = openCodexVerificationWindow\(\);[\s\S]*codexLoginSession\.value = await startOpenAICodexAuth\(\);[\s\S]*handleOpenCodexVerification\(authWindow\)/);
  assert.match(pageSource, /<details v-if="codexLoginSession" class="model-providers-page__fallback-login">/);
  assert.match(pageSource, /settings\.codexFallbackLogin/);
  assert.match(pageSource, /settings\.codexLoginWaiting/);
  assert.doesNotMatch(pageSource, /<input :value="codexLoginSession\.verification_url"/);
  assert.doesNotMatch(pageSource, /<input :value="codexLoginSession\.user_code"/);
});

test("ModelProvidersPage handles clipboard-denied fallback copy attempts", () => {
  assert.match(pageSource, /settings\.codexCodeCopyFailed/);
  assert.match(pageSource, /try \{[\s\S]*navigator\.clipboard\.writeText\(codexLoginSession\.value\.user_code\);[\s\S]*\} catch/);
});
