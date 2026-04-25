import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { setI18nLocale } from "../i18n/index.ts";
import {
  DEFAULT_LOCALE,
  LANGUAGE_OPTIONS,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  isSupportedLocale,
} from "../i18n/messages.ts";

const browserLanguageMap: readonly [RegExp, AppLocale][] = [
  [/^zh-(tw|hk|mo)\b/i, "zh-TW"],
  [/^zh\b/i, "zh-CN"],
  [/^en\b/i, "en-US"],
  [/^ja\b/i, "ja-JP"],
  [/^ko\b/i, "ko-KR"],
  [/^es\b/i, "es-ES"],
  [/^fr\b/i, "fr-FR"],
  [/^de\b/i, "de-DE"],
];

function getLocaleOption(locale: AppLocale) {
  return LANGUAGE_OPTIONS.find((option) => option.locale === locale) ?? LANGUAGE_OPTIONS[0];
}

export function toSupportedLocale(value: unknown): AppLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function resolveInitialLocale(savedLocale?: string | null, browserLanguage?: string | null): AppLocale {
  if (isSupportedLocale(savedLocale)) {
    return savedLocale;
  }
  const language = String(browserLanguage ?? "").trim();
  for (const [pattern, locale] of browserLanguageMap) {
    if (pattern.test(language)) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
}

function readSavedLocale() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(LOCALE_STORAGE_KEY);
}

function readBrowserLanguage() {
  if (typeof navigator === "undefined") {
    return null;
  }
  return navigator.language;
}

function persistLocale(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export const useLocaleStore = defineStore("locale", () => {
  const locale = ref<AppLocale>(resolveInitialLocale(readSavedLocale(), readBrowserLanguage()));

  const currentLocaleOption = computed(() => getLocaleOption(locale.value));
  const currentLocaleLabel = computed(() => currentLocaleOption.value.label);
  const currentLocaleShortLabel = computed(() => currentLocaleOption.value.shortLabel);

  function setLocale(nextLocaleValue: AppLocale) {
    locale.value = toSupportedLocale(nextLocaleValue);
    setI18nLocale(locale.value);
    persistLocale(locale.value);
  }

  function hydrateLocale() {
    setLocale(resolveInitialLocale(readSavedLocale(), readBrowserLanguage()));
  }

  return {
    locale,
    currentLocaleOption,
    currentLocaleLabel,
    currentLocaleShortLabel,
    setLocale,
    hydrateLocale,
  };
});
