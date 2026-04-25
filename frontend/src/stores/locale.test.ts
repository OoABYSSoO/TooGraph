import test from "node:test";
import assert from "node:assert/strict";

import { resolveInitialLocale, toSupportedLocale } from "./locale.ts";

test("toSupportedLocale keeps only known application locales", () => {
  assert.equal(toSupportedLocale("zh-CN"), "zh-CN");
  assert.equal(toSupportedLocale("zh-TW"), "zh-TW");
  assert.equal(toSupportedLocale("en-US"), "en-US");
  assert.equal(toSupportedLocale("fr-FR"), "fr-FR");
  assert.equal(toSupportedLocale(""), "zh-CN");
});

test("resolveInitialLocale prefers saved locale before browser language", () => {
  assert.equal(resolveInitialLocale("ja-JP", "zh-CN"), "ja-JP");
  assert.equal(resolveInitialLocale(null, "en-US"), "en-US");
  assert.equal(resolveInitialLocale(null, "zh-TW"), "zh-TW");
  assert.equal(resolveInitialLocale(null, "zh-Hans-CN"), "zh-CN");
  assert.equal(resolveInitialLocale(null, "ja"), "ja-JP");
  assert.equal(resolveInitialLocale(null, "ko-KR"), "ko-KR");
  assert.equal(resolveInitialLocale(null, "es-MX"), "es-ES");
  assert.equal(resolveInitialLocale(null, "fr-CA"), "fr-FR");
  assert.equal(resolveInitialLocale(null, "de-AT"), "de-DE");
  assert.equal(resolveInitialLocale(null, "de-DE"), "de-DE");
});
