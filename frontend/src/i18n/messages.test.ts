import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCALE,
  LANGUAGE_OPTIONS,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  flattenLocaleKeys,
  messages,
} from "./messages.ts";

test("i18n messages expose all supported product languages with identical key coverage", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR", "es-ES", "fr-FR", "de-DE"]);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.equal(LOCALE_STORAGE_KEY, "graphiteui:locale");
  assert.deepEqual(
    LANGUAGE_OPTIONS.map((option) => option.locale),
    SUPPORTED_LOCALES,
  );

  const zhKeys = flattenLocaleKeys(messages["zh-CN"]);

  assert.ok(zhKeys.length > 80);
  for (const locale of SUPPORTED_LOCALES) {
    assert.deepEqual(flattenLocaleKeys(messages[locale]), zhKeys);
  }
});

test("i18n messages preserve product and technical proper nouns", () => {
  assert.equal(messages["zh-CN"].app.productName, "GraphiteUI");
  assert.equal(messages["en-US"].app.productName, "GraphiteUI");
  assert.equal(messages["ja-JP"].app.productName, "GraphiteUI");
  assert.equal(messages["ko-KR"].app.productName, "GraphiteUI");
  assert.equal(messages["es-ES"].app.productName, "GraphiteUI");
  assert.equal(messages["fr-FR"].app.productName, "GraphiteUI");
  assert.equal(messages["de-DE"].app.productName, "GraphiteUI");
  assert.match(messages["zh-CN"].common.state, /State/);
  assert.match(messages["en-US"].common.state, /State/);
  assert.match(messages["zh-CN"].settings.openAiCompatibleProvider, /OpenAI/);
  assert.match(messages["en-US"].settings.openAiCompatibleProvider, /OpenAI/);
});

test("Preset management labels localize node families in Chinese", () => {
  assert.equal(messages["zh-CN"].presets.agents, "智能体预设");
  assert.equal(messages["zh-CN"].presets.input, "输入");
  assert.equal(messages["zh-CN"].presets.agent, "智能体");
  assert.equal(messages["zh-CN"].presets.condition, "条件");
  assert.equal(messages["zh-CN"].presets.output, "输出");
  assert.equal(messages["en-US"].presets.input, "Input");
  assert.equal(messages["en-US"].presets.agent, "Agent");
});

test("i18n messages localize preset persistence feedback", () => {
  assert.equal(messages["zh-CN"].feedback.presetSaved, "已保存预设节点：{label}");
  assert.equal(messages["zh-CN"].feedback.presetSaveFailed, "预设节点保存失败。");
  assert.equal(messages["en-US"].feedback.presetSaved, "Saved preset node: {label}");
  assert.equal(messages["en-US"].feedback.presetSaveFailed, "Failed to save preset node.");
});

test("new language packs use handwritten localized UI copy for high-traffic surfaces", () => {
  assert.equal(messages["zh-TW"].nav.runs, "執行記錄");
  assert.equal(messages["ja-JP"].editor.runGraph, "実行");
  assert.equal(messages["ko-KR"].humanReview.continueRun, "계속 실행");
  assert.equal(messages["es-ES"].settings.saveSettings, "Guardar configuración");
  assert.equal(messages["fr-FR"].runs.refresh, "Actualiser");
  assert.equal(messages["de-DE"].tab.fromTemplate, "Aus Vorlage erstellen");
});
