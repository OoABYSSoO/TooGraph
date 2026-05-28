import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(currentDirectory, "MessagePlatformsPage.vue"), "utf8");

test("message platforms page renders catalog cards and binding controls", () => {
  assert.match(pageSource, /fetchMessagePlatformCatalog/);
  assert.match(pageSource, /fetchMessagePlatformBindings/);
  assert.match(pageSource, /buildMessagePlatformRows/);
  assert.match(pageSource, /message-platforms-page__platform-grid/);
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
