<template>
  <div
    class="buddy-widget__virtual-operation-banner"
    :class="`buddy-widget__virtual-operation-banner--${status.tone}`"
    role="status"
    aria-live="assertive"
  >
    <span class="buddy-widget__virtual-operation-pulse" aria-hidden="true"></span>
    <span class="buddy-widget__virtual-operation-label">{{ status.label }}</span>
    <button
      type="button"
      class="buddy-widget__virtual-operation-stop"
      :title="t('buddy.virtualOperation.stop')"
      :aria-label="t('buddy.virtualOperation.stop')"
      @click="emit('interrupt')"
    >
      <span class="buddy-widget__virtual-operation-stop-icon" aria-hidden="true"></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

defineProps<{
  status: {
    label: string;
    tone: "active" | "stopping";
  };
}>();

const emit = defineEmits<{
  interrupt: [];
}>();

const { t } = useI18n();
</script>

<style scoped>
.buddy-widget__virtual-operation-banner {
  position: fixed;
  left: 50%;
  top: calc(var(--editor-canvas-floating-top-clearance, 18px) + 64px);
  z-index: 4528;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: min(420px, calc(100vw - 56px));
  max-width: min(620px, calc(100vw - 56px));
  padding: 14px 16px 14px 24px;
  border: 1px solid rgba(255, 247, 237, 0.34);
  border-radius: 999px;
  color: #fff7ed;
  background: linear-gradient(135deg, rgba(154, 52, 18, 0.96), rgba(131, 43, 13, 0.94));
  box-shadow:
    0 0 0 1px rgba(255, 247, 237, 0.16) inset,
    0 18px 42px rgba(124, 45, 18, 0.24),
    0 0 34px rgba(217, 119, 6, 0.24);
  translate: -50% 0;
  pointer-events: auto;
  backdrop-filter: blur(28px) saturate(1.4) contrast(1.08);
  animation: buddy-widget-virtual-operation-breathe 2.4s ease-in-out infinite;
}

.buddy-widget__virtual-operation-banner--stopping {
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.98), rgba(154, 52, 18, 0.96));
}

.buddy-widget__virtual-operation-pulse {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #fed7aa;
  box-shadow: 0 0 0 6px rgba(255, 247, 237, 0.16);
  animation: buddy-widget-virtual-operation-pulse 1.1s ease-in-out infinite;
  flex: 0 0 auto;
}

.buddy-widget__virtual-operation-label {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__virtual-operation-stop {
  appearance: none;
  position: relative;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(255, 247, 237, 0.42);
  border-radius: 999px;
  color: #fff7ed;
  background: rgba(255, 247, 237, 0.12);
  cursor: pointer;
}

.buddy-widget__virtual-operation-stop:hover {
  border-color: rgba(255, 247, 237, 0.74);
  background: rgba(255, 247, 237, 0.22);
}

.buddy-widget__virtual-operation-stop-icon {
  position: relative;
  display: block;
  width: 14px;
  height: 14px;
  border: 1.5px solid currentColor;
  border-radius: 999px;
}

.buddy-widget__virtual-operation-stop-icon::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.buddy-widget__virtual-operation-stop:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.28);
}

@keyframes buddy-widget-virtual-operation-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 5px rgba(255, 247, 237, 0.08);
  }
  50% {
    box-shadow: 0 0 0 9px rgba(255, 247, 237, 0.2);
  }
}

@keyframes buddy-widget-virtual-operation-breathe {
  0%,
  100% {
    scale: 1;
    box-shadow:
      0 0 0 1px rgba(255, 247, 237, 0.16) inset,
      0 18px 42px rgba(124, 45, 18, 0.24),
      0 0 28px rgba(217, 119, 6, 0.22);
  }
  48% {
    scale: 1.012;
    box-shadow:
      0 0 0 1px rgba(255, 247, 237, 0.18) inset,
      0 22px 48px rgba(124, 45, 18, 0.28),
      0 0 40px rgba(217, 119, 6, 0.3);
  }
}
</style>
