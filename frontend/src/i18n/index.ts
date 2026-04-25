import { createI18n } from "vue-i18n";
import en from "element-plus/es/locale/lang/en";
import zhCn from "element-plus/es/locale/lang/zh-cn";

import { DEFAULT_LOCALE, type AppLocale, isSupportedLocale, messages } from "./messages.ts";

export const elementPlusLocales = {
  "zh-CN": zhCn,
  "en-US": en,
} as const;

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: DEFAULT_LOCALE,
  fallbackLocale: "en-US",
  messages,
});

export function resolveElementPlusLocale(locale: AppLocale) {
  return elementPlusLocales[locale] ?? elementPlusLocales[DEFAULT_LOCALE];
}

export function setI18nLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export function translate(key: string, params?: Record<string, string | number>) {
  return i18n.global.t(key, params ?? {});
}

export function normalizeLocale(value: unknown): AppLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
