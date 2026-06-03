import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { messages } from "../i18n/messages.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDirectory, "MessagePlatformsPage.vue"), "utf8");
const feishuLogoPath = resolve(currentDirectory, "../brand/feishu-logo.svg");
const feishuLogoSource = existsSync(feishuLogoPath) ? readFileSync(feishuLogoPath, "utf8") : "";

test("message platforms page renders catalog cards and binding controls", () => {
  assert.match(pageSource, /fetchMessagePlatformCatalog/);
  assert.match(pageSource, /fetchMessagePlatformBindings/);
  assert.match(pageSource, /buildMessagePlatformRows/);
  assert.match(pageSource, /buildPrimaryMessagePlatformRows/);
  assert.match(pageSource, /buildFutureMessagePlatformRows/);
  assert.match(pageSource, /message-platforms-page__platform-grid/);
  assert.match(pageSource, /message-platforms-page__future-support/);
  assert.match(pageSource, /messagePlatforms\.futureSupportTitle/);
  assert.match(pageSource, /updateMessagePlatformBinding/);
  assert.match(pageSource, /startFeishuAutoBinding/);
  assert.match(pageSource, /pollFeishuAutoBinding/);
  assert.match(pageSource, /message-platforms-page__auto-bind/);
  assert.match(pageSource, /message-platforms-page__qr-card/);
  assert.match(pageSource, /feishuQrCodeDataUrl/);
  assert.match(pageSource, /QRCode/);
  assert.match(pageSource, /applyCompletedAutoBinding/);
  assert.match(pageSource, /bindingDraft\.appId/);
});

test("message platforms dialog switches Feishu binding modes with segmented tabs", () => {
  assert.match(pageSource, /bindingModeTabs/);
  assert.match(pageSource, /activeBindingMode/);
  assert.match(pageSource, /class="message-platforms-page__binding-tabs"/);
  assert.match(pageSource, /role="tablist"/);
  assert.match(pageSource, /messagePlatforms\.qrBindingTab/);
  assert.match(pageSource, /messagePlatforms\.manualBindingTab/);
  assert.match(pageSource, /message-platforms-page__binding-tab--active/);
  assert.match(pageSource, /activeBindingMode === 'qr'/);
  assert.match(pageSource, /activeBindingMode === 'manual'/);
});

test("message platforms page uses the official Feishu logo and a prominent configure button", () => {
  assert.match(pageSource, /import feishuLogoUrl from "@\/brand\/feishu-logo\.svg";/);
  assert.match(pageSource, /platformLogoUrl/);
  assert.match(pageSource, /message-platforms-page__platform-logo/);
  assert.match(pageSource, /message-platforms-page__dialog-title-logo/);
  assert.match(pageSource, /class="message-platforms-page__configure-button"/);
  assert.match(pageSource, /type="primary"/);
  assert.doesNotMatch(pageSource, /\.message-platforms-page__platform-icon--brand\s*\{[^}]*box-shadow:/);
  assert.doesNotMatch(pageSource, /\.message-platforms-page__configure-button\s*\{[^}]*box-shadow:/);
  assert.notEqual(feishuLogoSource, "");
  assert.match(feishuLogoSource, /viewBox="0 0 16 16"/);
  assert.match(feishuLogoSource, /fill="#00D6B9"/);
  assert.match(feishuLogoSource, /fill="#3370FF"/);
  assert.match(feishuLogoSource, /fill="#133C9A"/);
});

test("message platforms card replaces the status pill with configure and shows enabled as a switch", () => {
  assert.match(
    pageSource,
    /<div class="message-platforms-page__platform-main">[\s\S]*<ElButton[\s\S]*class="message-platforms-page__configure-button"[\s\S]*<\/ElButton>[\s\S]*<\/div>/,
  );
  assert.doesNotMatch(pageSource, /<span class="message-platforms-page__status"/);
  assert.doesNotMatch(pageSource, /class="message-platforms-page__actions"/);
  assert.match(pageSource, /<ElSwitch[\s\S]*:model-value="row\.enabled"[\s\S]*@change="setPlatformEnabled\(row, Boolean\(\$event\)\)"/);
  assert.match(pageSource, /busyBindingId === row\.bindingId/);
  assert.match(pageSource, /enabledToggleLabel\(row\)/);
});

test("message platform page copy presents Feishu as the current platform and moves Telegram to future support", () => {
  assert.doesNotMatch(messages["zh-CN"].messagePlatforms.body, /Telegram/);
  assert.match(messages["zh-CN"].messagePlatforms.body, /飞书|Feishu/);
  assert.match(messages["zh-CN"].messagePlatforms.futureSupportBody, /Telegram/);

  assert.doesNotMatch(messages["en-US"].messagePlatforms.body, /Telegram/);
  assert.match(messages["en-US"].messagePlatforms.body, /Feishu\/Lark/);
  assert.match(messages["en-US"].messagePlatforms.futureSupportBody, /Telegram/);
});
