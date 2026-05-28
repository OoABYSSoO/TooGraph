<template>
  <div class="buddy-widget__history-control">
    <button
      type="button"
      class="buddy-widget__icon-button"
      :class="{ 'buddy-widget__icon-button--active': open }"
      :title="t('buddy.history')"
      :aria-label="t('buddy.history')"
      @click="emit('toggle')"
    >
      <ElIcon><Clock /></ElIcon>
    </button>
    <aside
      v-if="open"
      class="buddy-widget__sessions-panel"
      :aria-label="t('buddy.history')"
    >
      <div class="buddy-widget__sessions-header">
        <strong>{{ t("buddy.history") }}</strong>
      </div>
      <p v-if="loading" class="buddy-widget__sessions-status">
        {{ t("buddy.historyLoading") }}
      </p>
      <p v-else-if="sessions.length === 0" class="buddy-widget__sessions-status">
        {{ t("buddy.historyEmpty") }}
      </p>
      <div v-else class="buddy-widget__session-list">
        <div
          v-for="session in sessions"
          :key="session.session_id"
          class="buddy-widget__session-row"
          :class="{ 'buddy-widget__session-row--active': session.session_id === activeSessionId }"
        >
          <button
            type="button"
            class="buddy-widget__session-item"
            :disabled="switchLocked && session.session_id !== activeSessionId"
            @click="emit('select', session.session_id)"
          >
            <div class="buddy-widget__session-title-line">
              <span class="buddy-widget__session-title">{{ session.title || t("buddy.untitledSession") }}</span>
              <span v-if="formatBuddySessionSourceLabel(session.source)" class="buddy-widget__session-source-badge">
                {{ formatBuddySessionSourceLabel(session.source) }}
              </span>
            </div>
            <small>{{ session.last_message_preview || t("buddy.emptySession") }}</small>
          </button>
          <ElPopover
            :visible="deleteConfirmSessionId === session.session_id"
            placement="left"
            :show-arrow="false"
            popper-class="buddy-widget__confirm-popover buddy-widget__confirm-popover--delete"
          >
            <template #reference>
              <button
                type="button"
                data-session-delete-surface="true"
                class="buddy-widget__session-delete"
                :class="{ 'buddy-widget__session-delete--confirm': deleteConfirmSessionId === session.session_id }"
                :disabled="switchLocked"
                :title="deleteConfirmSessionId === session.session_id ? t('buddy.confirmDeleteSession') : t('buddy.deleteSession')"
                :aria-label="deleteConfirmSessionId === session.session_id ? t('buddy.confirmDeleteSession') : t('buddy.deleteSession')"
                @pointerdown.stop
                @click.stop="emit('deleteAction', session.session_id)"
              >
                <ElIcon v-if="deleteConfirmSessionId === session.session_id" aria-hidden="true"><Check /></ElIcon>
                <ElIcon v-else aria-hidden="true"><Delete /></ElIcon>
              </button>
            </template>
            <div class="buddy-widget__confirm-hint buddy-widget__confirm-hint--delete">
              {{ t("buddy.deleteSessionQuestion") }}
            </div>
          </ElPopover>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { Check, Clock, Delete } from "@element-plus/icons-vue";
import { ElIcon, ElPopover } from "element-plus";
import { useI18n } from "vue-i18n";

import type { BuddyChatSession } from "../types/buddy.ts";
import { formatBuddySessionSourceLabel } from "./useBuddyChatSessions.ts";

defineProps<{
  open: boolean;
  sessions: BuddyChatSession[];
  activeSessionId: string | null;
  loading: boolean;
  switchLocked: boolean;
  deleteConfirmSessionId: string | null;
}>();

const emit = defineEmits<{
  toggle: [];
  select: [sessionId: string];
  deleteAction: [sessionId: string];
}>();

const { t } = useI18n();
</script>

<style scoped>
.buddy-widget__history-control {
  position: relative;
}

.buddy-widget__icon-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(154, 52, 18, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.58);
  color: rgba(154, 52, 18, 0.78);
  cursor: pointer;
  transition:
    transform 150ms ease,
    border-color 150ms ease,
    background 150ms ease;
}

.buddy-widget__icon-button:hover {
  border-color: rgba(154, 52, 18, 0.22);
  background: rgba(255, 248, 240, 0.92);
  transform: translateY(-1px);
}

.buddy-widget__icon-button--active {
  border-color: rgba(37, 99, 235, 0.22);
  background: rgba(37, 99, 235, 0.08);
  color: #1d4ed8;
}

.buddy-widget__sessions-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 3;
  width: min(330px, calc(100vw - 56px));
  max-height: min(520px, calc(100vh - 132px));
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 8px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), rgba(255, 252, 247, 0.94);
  box-shadow: var(--toograph-glass-highlight), 0 16px 38px rgba(61, 43, 24, 0.16);
  backdrop-filter: blur(24px) saturate(1.45) contrast(1.02);
}

.buddy-widget__sessions-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.buddy-widget__sessions-header strong {
  color: var(--toograph-text-strong);
  font-size: 12px;
  line-height: 1.2;
}

.buddy-widget__session-delete,
.buddy-widget__session-item {
  appearance: none;
  border: 0;
  font: inherit;
}

.buddy-widget__session-list {
  display: grid;
  gap: 6px;
  max-height: none;
  overflow: visible;
}

.buddy-widget__session-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 5px;
  align-items: stretch;
}

.buddy-widget__session-item {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--toograph-text-strong);
  text-align: left;
  cursor: pointer;
}

.buddy-widget__session-title,
.buddy-widget__session-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__session-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.buddy-widget__session-title {
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
}

.buddy-widget__session-source-badge {
  flex: 0 0 auto;
  max-width: 86px;
  overflow: hidden;
  border-radius: 999px;
  padding: 2px 6px;
  background: rgba(154, 52, 18, 0.08);
  color: rgb(154, 52, 18);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-widget__session-item small,
.buddy-widget__sessions-status {
  color: var(--toograph-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.buddy-widget__session-row--active .buddy-widget__session-item {
  border-color: rgba(37, 99, 235, 0.2);
  background: rgba(37, 99, 235, 0.08);
}

.buddy-widget__session-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.62);
  color: rgba(154, 52, 18, 0.76);
  cursor: pointer;
}

.buddy-widget__session-delete--confirm,
.buddy-widget__session-delete--confirm:hover,
.buddy-widget__session-delete--confirm:focus-visible {
  border-color: rgba(185, 28, 28, 0.18);
  background: rgb(185, 28, 28);
  color: #fff;
}

.buddy-widget__session-item:disabled,
.buddy-widget__session-delete:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.buddy-widget__sessions-status {
  margin: 0;
}

.buddy-widget__confirm-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  white-space: nowrap;
  border-radius: 999px;
  border: 1px solid rgba(154, 52, 18, 0.16);
  padding: 6px 12px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  box-shadow: 0 14px 32px rgba(60, 41, 20, 0.14);
}

.buddy-widget__confirm-hint--delete {
  border-color: rgba(185, 28, 28, 0.16);
  background: rgba(255, 248, 248, 0.98);
  color: rgb(153, 27, 27);
}

.buddy-widget__icon-button:focus-visible,
.buddy-widget__session-item:focus-visible,
.buddy-widget__session-delete:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
}

:global(.buddy-widget__confirm-popover.el-popper) {
  border: none;
  border-radius: 999px;
  padding: 0;
  background: transparent;
  box-shadow: none;
}
</style>
