<template>
  <ElConfigProvider :locale="elementPlusLocale">
    <RouterView />
    <CompanionPet />
  </ElConfigProvider>
</template>

<script setup lang="ts">
import { ElConfigProvider } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";

import { resolveElementPlusLocale, setI18nLocale } from "./i18n";
import CompanionPet from "./companion/CompanionPet.vue";
import { useLocaleStore } from "@/stores/locale";

const localeStore = useLocaleStore();
const { locale } = storeToRefs(localeStore);
const elementPlusLocale = computed(() => resolveElementPlusLocale(locale.value));

localeStore.hydrateLocale();

watch(locale, (nextLocale) => setI18nLocale(nextLocale), { immediate: true });
</script>
