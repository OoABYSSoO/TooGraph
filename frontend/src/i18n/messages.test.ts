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
  assert.equal(LOCALE_STORAGE_KEY, "toograph:locale");
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
  assert.equal(messages["zh-CN"].app.productName, "TooGraph");
  assert.equal(messages["en-US"].app.productName, "TooGraph");
  assert.equal(messages["ja-JP"].app.productName, "TooGraph");
  assert.equal(messages["ko-KR"].app.productName, "TooGraph");
  assert.equal(messages["es-ES"].app.productName, "TooGraph");
  assert.equal(messages["fr-FR"].app.productName, "TooGraph");
  assert.equal(messages["de-DE"].app.productName, "TooGraph");
  assert.match(messages["zh-CN"].common.state, /State/);
  assert.match(messages["en-US"].common.state, /State/);
  assert.match(messages["zh-CN"].settings.openAiCompatibleProvider, /OpenAI/);
  assert.match(messages["en-US"].settings.openAiCompatibleProvider, /OpenAI/);
});

test("i18n messages expose scheduler management labels", () => {
  assert.equal(messages["zh-CN"].nav.scheduler, "定时任务");
  assert.equal(messages["zh-CN"].scheduler.title, "图定时任务");
  assert.equal(messages["zh-CN"].scheduler.createJob, "新建任务");
  assert.equal(messages["zh-CN"].scheduler.runNow, "立即运行");
  assert.equal(messages["zh-CN"].scheduler.messageOutlet, "消息出口");
  assert.equal(messages["zh-CN"].scheduler.runInputs, "运行输入");
  assert.equal(messages["zh-CN"].scheduler.repeatEvery, "每隔");
  assert.equal(messages["zh-CN"].scheduler.event, "事件");
  assert.equal(messages["zh-CN"].scheduler.eventName, "事件名称");
  assert.doesNotMatch(messages["zh-CN"].scheduler.eventNameHint, /\{\{/);
  assert.equal(messages["zh-CN"].scheduler.intervalUnitHours, "小时");
  assert.equal(messages["zh-CN"].scheduler.outletBuddy, "Buddy");
  assert.equal(messages["zh-CN"].scheduler.outletFeishu, "飞书");
  assert.equal(messages["zh-CN"].scheduler.outletTelegram, "Telegram");
  assert.equal(messages["zh-CN"].scheduler.sessionModeExisting, "绑定现有会话");
  assert.equal(messages["en-US"].nav.scheduler, "Scheduler");
  assert.equal(messages["en-US"].scheduler.title, "Graph Scheduler");
  assert.equal(messages["en-US"].scheduler.createJob, "New job");
  assert.equal(messages["en-US"].scheduler.runNow, "Run now");
  assert.equal(messages["en-US"].scheduler.messageOutlet, "Message outlet");
  assert.equal(messages["en-US"].scheduler.runInputs, "Run inputs");
  assert.equal(messages["en-US"].scheduler.repeatEvery, "Every");
  assert.equal(messages["en-US"].scheduler.event, "Event");
  assert.equal(messages["en-US"].scheduler.eventName, "Event name");
  assert.doesNotMatch(messages["en-US"].scheduler.eventNameHint, /\{\{/);
  assert.equal(messages["en-US"].scheduler.intervalUnitHours, "hours");
  assert.equal(messages["en-US"].scheduler.outletBuddy, "Buddy");
  assert.equal(messages["en-US"].scheduler.outletFeishu, "Feishu");
  assert.equal(messages["en-US"].scheduler.outletTelegram, "Telegram");
  assert.equal(messages["en-US"].scheduler.sessionModeExisting, "Bind existing session");
});

test("i18n messages expose developer mode labels", () => {
  assert.equal(messages["zh-CN"].nav.developerBadge, "Dev");
  assert.equal(messages["zh-CN"].settings.developerOptions, "开发者选项");
  assert.equal(messages["zh-CN"].settings.developerMode, "开发者模式");
  assert.match(messages["zh-CN"].settings.developerModeHelp, /Evidence Search/);
  assert.equal(messages["en-US"].nav.developerBadge, "Dev");
  assert.equal(messages["en-US"].settings.developerOptions, "Developer options");
  assert.equal(messages["en-US"].settings.developerMode, "Developer mode");
  assert.match(messages["en-US"].settings.developerModeHelp, /Evidence Search/);
});

test("primary navigation names match the workflow-oriented sidebar", () => {
  assert.equal(messages["zh-CN"].nav.home, "工作台");
  assert.equal(messages["zh-CN"].nav.editor, "图编辑器");
  assert.equal(messages["zh-CN"].nav.models, "模型供应商");
  assert.equal(messages["zh-CN"].nav.modelLogs, "模型调用日志");
  assert.equal(messages["zh-CN"].nav.actions, "能力动作");
  assert.equal(messages["zh-CN"].nav.presets, "节点预设");
  assert.equal(messages["en-US"].nav.home, "Workspace");
  assert.equal(messages["en-US"].nav.editor, "Graph Editor");
  assert.equal(messages["en-US"].nav.models, "Model Providers");
  assert.equal(messages["en-US"].nav.modelLogs, "Model Calls");
  assert.equal(messages["en-US"].nav.actions, "Actions");
  assert.equal(messages["en-US"].nav.presets, "Node Presets");
});

test("Preset management labels localize node families in Chinese", () => {
  assert.equal(messages["zh-CN"].presets.agents, "LLM 预设");
  assert.equal(messages["zh-CN"].presets.input, "输入");
  assert.equal(messages["zh-CN"].presets.agent, "LLM");
  assert.equal(messages["zh-CN"].presets.condition, "条件");
  assert.equal(messages["zh-CN"].presets.output, "输出");
  assert.equal(messages["en-US"].presets.input, "Input");
  assert.equal(messages["en-US"].presets.agent, "LLM");
});

test("Chinese UI labels Action as capability action", () => {
  const zh = messages["zh-CN"];
  assert.equal(zh.nav.actions, "能力动作");
  assert.equal(zh.actions.eyebrow, "执行项");
  assert.equal(zh.actions.title, "执行项管理");
  assert.equal(zh.actions.total, "全部执行项");
  assert.equal(zh.actions.resultCount, "{count} 个执行项");
  assert.equal(zh.graphLibrary.requiredActions, "执行项");
  assert.equal(zh.presets.requiredActions, "执行项");
  assert.equal(zh.nodeCard.addAction, "添加执行项");
  assert.equal(zh.nodeCard.selectAction, "选择执行项");
  assert.equal(zh.nodeCard.noAction, "+ 执行项");
  assert.equal(zh.nodeCard.loadingActions, "正在加载执行项...");

  const actionUiText = [
    zh.nav.actions,
    zh.graphLibrary.requiredActions,
    zh.presets.searchPlaceholder,
    zh.presets.requiredActions,
    ...flattenStringValues(zh.actions),
    zh.nodeCard.removeAction,
    zh.nodeCard.addAction,
    zh.nodeCard.selectAction,
    zh.nodeCard.noAction,
    zh.nodeCard.actionLoadFailed,
    zh.nodeCard.actionCopy,
    zh.nodeCard.loadingActions,
    zh.nodeCard.noActions,
  ];
  assert.deepEqual(
    actionUiText.filter((text) => /\bActions?\b/.test(text)),
    [],
  );
});

test("i18n messages expose Tool management labels", () => {
  assert.equal(messages["zh-CN"].nav.tools, "工具");
  assert.equal(messages["zh-CN"].tools.title, "工具管理");
  assert.equal(messages["zh-CN"].tools.sourceFilterOptions.user, "我的");
  assert.equal(messages["zh-CN"].tools.sourceFilterOptions.official, "官方");
  assert.equal(messages["en-US"].nav.tools, "Tools");
  assert.equal(messages["en-US"].tools.title, "Tool management");
  assert.equal(messages["en-US"].tools.sourceFilterOptions.user, "Mine");
  assert.equal(messages["en-US"].tools.sourceFilterOptions.official, "Official");
});

test("i18n messages localize preset persistence feedback", () => {
  assert.equal(messages["zh-CN"].feedback.presetSaved, "已保存预设节点：{label}");
  assert.equal(messages["zh-CN"].feedback.presetSaveFailed, "预设节点保存失败。");
  assert.equal(messages["en-US"].feedback.presetSaved, "Saved preset node: {label}");
  assert.equal(messages["en-US"].feedback.presetSaveFailed, "Failed to save preset node.");
});

test("i18n messages localize template save failure context", () => {
  assert.equal(messages["zh-CN"].editor.saveTemplateFailed, "保存模板失败：{error}");
  assert.equal(messages["zh-CN"].editor.validationInputNodeWriteCountInvalid, "输入节点“{node}”必须且只能写入一个 State。位置：{path}");
  assert.equal(
    messages["zh-CN"].editor.validationConditionRuleValueTypeMismatch,
    "条件节点“{node}”对{stateType} State“{state}”的判定值无效：{reason}。位置：{path}",
  );
  assert.equal(messages["zh-CN"].editor.validationConditionBooleanValueInvalid, "布尔判定值只能是 true 或 false");
  assert.equal(messages["zh-CN"].editor.validationConditionNumberValueInvalid, "数值判定值必须是有限数字");
  assert.equal(messages["zh-CN"].editor.validationStateTypeBoolean, "布尔值");
  assert.equal(messages["zh-CN"].editor.validationStateTypeNumber, "数值");
  assert.equal(messages["zh-CN"].editor.validationIssueWithPath, "{message}（位置：{path}）");
  assert.equal(messages["zh-CN"].editor.validationIssueRemainingCount, "还有 {count} 个问题");
  assert.equal(messages["zh-CN"].feedback.runRequestFailed, "运行图失败：{error}");
  assert.equal(messages["en-US"].editor.saveTemplateFailed, "Failed to save template: {error}");
  assert.equal(messages["en-US"].editor.validationInputNodeWriteCountInvalid, 'Input node "{node}" must write exactly one State. Location: {path}');
  assert.equal(
    messages["en-US"].editor.validationConditionRuleValueTypeMismatch,
    'Condition node "{node}" has an invalid value for {stateType} State "{state}": {reason}. Location: {path}',
  );
  assert.equal(messages["en-US"].editor.validationConditionBooleanValueInvalid, "Boolean condition value must be true or false");
  assert.equal(messages["en-US"].editor.validationConditionNumberValueInvalid, "Number condition value must be a finite number");
  assert.equal(messages["en-US"].editor.validationStateTypeBoolean, "boolean");
  assert.equal(messages["en-US"].editor.validationStateTypeNumber, "number");
  assert.equal(messages["en-US"].editor.validationIssueWithPath, "{message} (Location: {path})");
  assert.equal(messages["en-US"].editor.validationIssueRemainingCount, "{count} more issues");
  assert.equal(messages["en-US"].feedback.runRequestFailed, "Failed to run graph: {error}");
});

test("i18n messages describe completed Buddy trace capsules as completed nodes", () => {
  assert.equal(messages["zh-CN"].buddy.runTraceCompleted, "已完成 {count} 个节点");
  assert.equal(messages["zh-CN"].buddy.runTraceFailed, "{count} 个节点失败");
  assert.equal(messages["en-US"].buddy.runTraceCompleted, "Completed {count} nodes");
  assert.equal(messages["en-US"].buddy.runTraceFailed, "{count} nodes failed");
});

test("new language packs use handwritten localized UI copy for high-traffic surfaces", () => {
  assert.equal(messages["zh-TW"].nav.runs, "執行記錄");
  assert.equal(messages["ja-JP"].editor.runGraph, "実行");
  assert.equal(messages["ko-KR"].humanReview.continueRun, "계속 실행");
  assert.equal(messages["es-ES"].settings.saveSettings, "Guardar configuración");
  assert.equal(messages["fr-FR"].runs.refresh, "Actualiser");
  assert.equal(messages["de-DE"].tab.fromTemplate, "Aus Vorlage erstellen");
});

function flattenStringValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap((child) => flattenStringValues(child));
}
