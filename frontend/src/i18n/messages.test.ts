import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, flattenLocaleKeys, messages } from "./messages.ts";

test("i18n messages expose Chinese and English with identical key coverage", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["zh-CN", "en-US"]);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.equal(LOCALE_STORAGE_KEY, "graphiteui:locale");

  const zhKeys = flattenLocaleKeys(messages["zh-CN"]);
  const enKeys = flattenLocaleKeys(messages["en-US"]);

  assert.ok(zhKeys.length > 80);
  assert.deepEqual(enKeys, zhKeys);
});

test("i18n messages preserve product and technical proper nouns", () => {
  assert.equal(messages["zh-CN"].app.productName, "GraphiteUI");
  assert.equal(messages["en-US"].app.productName, "GraphiteUI");
  assert.match(messages["zh-CN"].common.state, /State/);
  assert.match(messages["en-US"].common.state, /State/);
  assert.match(messages["zh-CN"].settings.openAiCompatibleProvider, /OpenAI/);
  assert.match(messages["en-US"].settings.openAiCompatibleProvider, /OpenAI/);
});
