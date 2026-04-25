import test from "node:test";
import assert from "node:assert/strict";

import { resolveInitialLocale, toSupportedLocale } from "./locale.ts";

test("toSupportedLocale keeps only known application locales", () => {
  assert.equal(toSupportedLocale("zh-CN"), "zh-CN");
  assert.equal(toSupportedLocale("en-US"), "en-US");
  assert.equal(toSupportedLocale("fr-FR"), "zh-CN");
  assert.equal(toSupportedLocale(""), "zh-CN");
});

test("resolveInitialLocale prefers saved locale before browser language", () => {
  assert.equal(resolveInitialLocale("en-US", "zh-CN"), "en-US");
  assert.equal(resolveInitialLocale(null, "en-US"), "en-US");
  assert.equal(resolveInitialLocale(null, "zh-Hans-CN"), "zh-CN");
  assert.equal(resolveInitialLocale(null, "de-DE"), "zh-CN");
});
