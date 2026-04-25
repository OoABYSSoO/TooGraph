<template>
  <button
    type="button"
    class="language-switcher"
    :class="{ 'language-switcher--collapsed': collapsed }"
    :aria-label="t('language.switchTo', { locale: nextLocaleLabel })"
    :title="t('language.switchTo', { locale: nextLocaleLabel })"
    @click="localeStore.toggleLocale"
  >
    <ElIcon class="language-switcher__icon" aria-hidden="true"><Switch /></ElIcon>
    <span v-if="collapsed" class="language-switcher__compact">{{ t("language.compactLabel") }}</span>
    <span v-else class="language-switcher__copy">
      <small>{{ t("language.label") }}</small>
      <strong>{{ currentLocaleLabel }}</strong>
    </span>
  </button>
</template>

<script setup lang="ts">
import { Switch } from "@element-plus/icons-vue";
import { ElIcon } from "element-plus";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useLocaleStore } from "@/stores/locale";

defineProps<{
  collapsed: boolean;
}>();

const { t } = useI18n();
const localeStore = useLocaleStore();
const { currentLocaleLabel, nextLocaleLabel } = storeToRefs(localeStore);
</script>

<style scoped>
.language-switcher {
  display: inline-flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 14px;
  background: rgba(255, 250, 242, 0.58);
  color: rgba(90, 58, 34, 0.94);
  cursor: pointer;
  padding: 7px 10px;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.language-switcher:hover {
  border-color: rgba(154, 52, 18, 0.2);
  background: rgba(255, 248, 240, 0.86);
  box-shadow: inset 3px 0 0 rgba(154, 52, 18, 0.42);
}

.language-switcher:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.24), inset 3px 0 0 rgba(154, 52, 18, 0.42);
}

.language-switcher__icon {
  flex: none;
  font-size: 18px;
}

.language-switcher__copy {
  display: grid;
  min-width: 0;
  text-align: left;
}

.language-switcher__copy small {
  color: var(--graphite-text-muted);
  font-size: 0.68rem;
  line-height: 1.1;
}

.language-switcher__copy strong {
  overflow: hidden;
  color: var(--graphite-text-strong);
  font-size: 0.86rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.language-switcher--collapsed {
  width: 42px;
  justify-content: center;
  padding: 0;
}

.language-switcher__compact {
  position: absolute;
  margin-top: 22px;
  margin-left: 18px;
  border-radius: 999px;
  background: rgba(154, 52, 18, 0.92);
  color: rgba(255, 250, 242, 0.98);
  font-size: 0.58rem;
  font-weight: 800;
  line-height: 1;
  padding: 2px 4px;
}
</style>
