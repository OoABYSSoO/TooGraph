import { createI18n } from "vue-i18n";
import de from "element-plus/es/locale/lang/de";
import en from "element-plus/es/locale/lang/en";
import es from "element-plus/es/locale/lang/es";
import fr from "element-plus/es/locale/lang/fr";
import ja from "element-plus/es/locale/lang/ja";
import ko from "element-plus/es/locale/lang/ko";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import zhTw from "element-plus/es/locale/lang/zh-tw";

import { DEFAULT_LOCALE, type AppLocale, isSupportedLocale, messages } from "./messages.ts";

export const elementPlusLocales = {
  "zh-CN": zhCn,
  "zh-TW": zhTw,
  "en-US": en,
  "ja-JP": ja,
  "ko-KR": ko,
  "es-ES": es,
  "fr-FR": fr,
  "de-DE": de,
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
