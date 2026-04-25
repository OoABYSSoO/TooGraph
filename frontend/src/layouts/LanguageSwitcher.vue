<template>
  <ElPopover
    v-model:visible="popoverVisible"
    trigger="click"
    placement="right-end"
    :width="224"
    :show-arrow="false"
    :teleported="true"
    popper-class="language-switcher-popper"
  >
    <template #reference>
      <button
        type="button"
        class="language-switcher"
        :class="{ 'language-switcher--collapsed': collapsed }"
        :aria-label="t('language.current')"
        :title="currentLocaleLabel"
      >
        <ElIcon class="language-switcher__icon" aria-hidden="true"><Switch /></ElIcon>
        <span v-if="collapsed" class="language-switcher__compact">{{ currentLocaleShortLabel }}</span>
        <span v-else class="language-switcher__copy">
          <small>{{ t("language.label") }}</small>
          <strong>{{ currentLocaleLabel }}</strong>
        </span>
      </button>
    </template>

    <div class="language-switcher__menu" role="menu" :aria-label="t('language.label')">
      <button
        v-for="option in LANGUAGE_OPTIONS"
        :key="option.locale"
        type="button"
        class="language-switcher__option"
        :class="{ 'language-switcher__option--active': option.locale === locale }"
        role="menuitemradio"
        :aria-checked="option.locale === locale"
        @click="localeStore.setLocale(option.locale); popoverVisible = false"
      >
        <span class="language-switcher__option-main">{{ option.label }}</span>
        <span class="language-switcher__option-meta">{{ option.locale }}</span>
      </button>
    </div>
  </ElPopover>
</template>

<script setup lang="ts">
import { Switch } from "@element-plus/icons-vue";
import { ElIcon, ElPopover } from "element-plus";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { LANGUAGE_OPTIONS } from "@/i18n/messages";
import { useLocaleStore } from "@/stores/locale";

defineProps<{
  collapsed: boolean;
}>();

const { t } = useI18n();
const localeStore = useLocaleStore();
const { currentLocaleLabel, currentLocaleShortLabel, locale } = storeToRefs(localeStore);
const popoverVisible = ref(false);
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

:global(.language-switcher-popper.el-popper) {
  min-width: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
  z-index: 3000;
}

:global(.language-switcher-popper .el-popover) {
  min-width: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:global(.language-switcher-popper .el-popper__arrow) {
  display: none;
}

.language-switcher__menu {
  box-sizing: border-box;
  display: grid;
  width: min(224px, calc(100vw - 24px));
  max-height: min(360px, calc(100vh - 32px));
  overflow-y: auto;
  gap: 4px;
  isolation: isolate;
  border: 1px solid var(--graphite-glass-border);
  border-radius: 18px;
  background: var(--graphite-glass-specular), var(--graphite-glass-lens), var(--graphite-glass-bg-strong);
  background-blend-mode: screen, screen, normal;
  box-shadow: var(--graphite-glass-shadow), var(--graphite-glass-highlight), var(--graphite-glass-rim);
  backdrop-filter: blur(24px) saturate(1.5) contrast(1.01);
  padding: 7px;
}

.language-switcher__option {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(72, 49, 31, 0.88);
  cursor: pointer;
  font: inherit;
  padding: 8px 10px;
  text-align: left;
  transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
}

.language-switcher__option:hover {
  border-color: rgba(177, 105, 46, 0.18);
  background: rgba(255, 255, 255, 0.44);
  color: rgba(104, 55, 24, 0.98);
}

.language-switcher__option--active {
  border-color: rgba(154, 52, 18, 0.16);
  background: rgba(255, 248, 240, 0.74);
  box-shadow:
    inset 3px 0 0 rgba(154, 52, 18, 0.56),
    inset 0 1px 0 rgba(255, 255, 255, 0.66);
  color: rgba(126, 51, 23, 0.98);
}

.language-switcher__option-main {
  font-size: 0.86rem;
  font-weight: 760;
}

.language-switcher__option-meta {
  color: var(--graphite-text-muted);
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
