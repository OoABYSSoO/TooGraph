import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { setI18nLocale } from "../i18n/index.ts";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type AppLocale, isSupportedLocale } from "../i18n/messages.ts";

function languageLooksChinese(language: string) {
  return /^zh\b/i.test(language.trim());
}

export function toSupportedLocale(value: unknown): AppLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function resolveInitialLocale(savedLocale?: string | null, browserLanguage?: string | null): AppLocale {
  if (isSupportedLocale(savedLocale)) {
    return savedLocale;
  }
  if (browserLanguage === "en-US" || String(browserLanguage ?? "").toLowerCase().startsWith("en-")) {
    return "en-US";
  }
  if (browserLanguage && languageLooksChinese(browserLanguage)) {
    return "zh-CN";
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

  const currentLocaleLabel = computed(() => (locale.value === "zh-CN" ? "中文" : "English"));
  const nextLocale = computed<AppLocale>(() => (locale.value === "zh-CN" ? "en-US" : "zh-CN"));
  const nextLocaleLabel = computed(() => (nextLocale.value === "zh-CN" ? "中文" : "English"));

  function setLocale(nextLocaleValue: AppLocale) {
    locale.value = toSupportedLocale(nextLocaleValue);
    setI18nLocale(locale.value);
    persistLocale(locale.value);
  }

  function toggleLocale() {
    setLocale(nextLocale.value);
  }

  function hydrateLocale() {
    setLocale(resolveInitialLocale(readSavedLocale(), readBrowserLanguage()));
  }

  return {
    locale,
    currentLocaleLabel,
    nextLocale,
    nextLocaleLabel,
    setLocale,
    toggleLocale,
    hydrateLocale,
  };
});
