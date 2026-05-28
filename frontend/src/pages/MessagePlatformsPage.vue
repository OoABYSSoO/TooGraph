<template>
  <AppShell>
    <main class="message-platforms-page">
      <header class="message-platforms-page__header">
        <div>
          <p class="message-platforms-page__eyebrow">{{ t("messagePlatforms.eyebrow") }}</p>
          <h1>{{ t("messagePlatforms.title") }}</h1>
          <p>{{ t("messagePlatforms.body") }}</p>
        </div>
        <ElButton class="message-platforms-page__refresh" :loading="isLoading" @click="loadPage">
          <ElIcon aria-hidden="true"><Refresh /></ElIcon>
          {{ t("messagePlatforms.refresh") }}
        </ElButton>
      </header>

      <ElAlert
        v-if="error"
        class="message-platforms-page__alert"
        type="error"
        :closable="false"
        :title="t('common.failedToLoad', { error })"
      />

      <section class="message-platforms-page__summary" :aria-label="t('messagePlatforms.summaryLabel')">
        <div class="message-platforms-page__metric">
          <strong>{{ connectedCount }}</strong>
          <span>{{ t("messagePlatforms.connectedCount") }}</span>
        </div>
        <div class="message-platforms-page__metric">
          <strong>{{ supportedCount }}</strong>
          <span>{{ t("messagePlatforms.supportedCount") }}</span>
        </div>
        <div class="message-platforms-page__metric">
          <strong>3488</strong>
          <span>{{ t("messagePlatforms.devPort") }}</span>
        </div>
      </section>

      <section v-if="isLoading && rows.length === 0" class="message-platforms-page__loading" role="status">
        {{ t("messagePlatforms.loading") }}
      </section>

      <section v-else class="message-platforms-page__platform-grid">
        <article v-for="row in rows" :key="row.platformId" class="message-platforms-page__platform-card">
          <div class="message-platforms-page__platform-main">
            <div class="message-platforms-page__platform-title">
              <ElIcon class="message-platforms-page__platform-icon" aria-hidden="true"><ChatLineRound /></ElIcon>
              <div>
                <h2>{{ row.displayName }}</h2>
                <p>{{ row.platformId }}</p>
              </div>
            </div>
            <span class="message-platforms-page__status" :data-tone="row.statusTone">{{ row.statusLabel }}</span>
          </div>

          <dl class="message-platforms-page__platform-meta">
            <div>
              <dt>{{ t("messagePlatforms.enabled") }}</dt>
              <dd>{{ row.enabled ? t("common.on") : t("common.off") }}</dd>
            </div>
            <div>
              <dt>{{ t("messagePlatforms.configured") }}</dt>
              <dd>{{ row.canConfigure ? (row.configured ? t("common.configured") : t("common.required")) : t("messagePlatforms.notAvailable") }}</dd>
            </div>
            <div>
              <dt>{{ t("messagePlatforms.lastEvent") }}</dt>
              <dd>{{ formatDate(row.lastEventAt) }}</dd>
            </div>
          </dl>

          <p v-if="row.lastErrorMessage" class="message-platforms-page__error">{{ row.lastErrorMessage }}</p>

          <div class="message-platforms-page__actions">
            <ElButton :disabled="!row.canConfigure" @click="selectPlatform(row)">
              <ElIcon aria-hidden="true"><Setting /></ElIcon>
              {{ row.canConfigure ? t("messagePlatforms.configure") : t("messagePlatforms.planned") }}
            </ElButton>
          </div>
        </article>
      </section>

      <ElDialog
        v-model="isBindingDialogOpen"
        class="message-platforms-page__dialog"
        :title="selectedRow ? t('messagePlatforms.configureTitle', { platform: selectedRow.displayName }) : t('messagePlatforms.configure')"
        width="520px"
        :append-to-body="true"
      >
        <form class="message-platforms-page__form" @submit.prevent="saveBinding">
          <label>
            <span>{{ t("messagePlatforms.displayName") }}</span>
            <ElInput v-model="bindingDraft.displayName" />
          </label>

          <section v-if="isFeishuSelected" class="message-platforms-page__auto-bind">
            <div>
              <h3>{{ t("messagePlatforms.feishuAutoBindTitle") }}</h3>
              <p>{{ t("messagePlatforms.feishuAutoBindBody") }}</p>
            </div>
            <ElButton
              type="primary"
              :loading="isAutoBindingStarting"
              :disabled="autoBindJob?.status === 'waiting_for_scan'"
              @click="startFeishuAutoBindingFlow"
            >
              <ElIcon aria-hidden="true"><Connection /></ElIcon>
              {{ t("messagePlatforms.feishuAutoBindAction") }}
            </ElButton>
            <div v-if="autoBindJob" class="message-platforms-page__auto-bind-status">
              <ElAlert
                v-if="autoBindJob.status === 'waiting_for_scan'"
                type="info"
                :closable="false"
                :title="t('messagePlatforms.feishuAutoBindWaiting')"
                :description="t('messagePlatforms.feishuAutoBindWaitingBody')"
              />
              <ElAlert
                v-else-if="autoBindJob.status === 'completed'"
                type="success"
                :closable="false"
                :title="t('messagePlatforms.feishuAutoBindCompleted')"
              />
              <ElAlert
                v-else-if="autoBindJob.status === 'failed'"
                type="error"
                :closable="false"
                :title="t('messagePlatforms.feishuAutoBindFailed', { error: autoBindJob.error || '' })"
              />
              <div v-if="autoBindJob.qr_url" class="message-platforms-page__qr-card">
                <img
                  v-if="feishuQrCodeDataUrl"
                  class="message-platforms-page__qr-image"
                  :src="feishuQrCodeDataUrl"
                  :alt="t('messagePlatforms.feishuAutoBindQrAlt')"
                />
                <div v-else class="message-platforms-page__qr-placeholder">
                  {{ t("messagePlatforms.feishuAutoBindQrGenerating") }}
                </div>
                <div class="message-platforms-page__qr-copy">
                  <strong>{{ t("messagePlatforms.feishuAutoBindScanTitle") }}</strong>
                  <p>{{ t("messagePlatforms.feishuAutoBindScanBody") }}</p>
                  <ElLink :href="autoBindJob.qr_url" target="_blank" rel="noreferrer">
                    {{ t("messagePlatforms.feishuAutoBindOpenLink") }}
                  </ElLink>
                </div>
              </div>
              <p v-if="autoBindJob.qr_expires_in" class="message-platforms-page__form-hint">
                {{ t("messagePlatforms.feishuAutoBindExpires", { seconds: autoBindJob.qr_expires_in }) }}
              </p>
            </div>
          </section>

          <ElDivider v-if="isFeishuSelected">{{ t("messagePlatforms.manualBinding") }}</ElDivider>

          <label v-if="isFeishuSelected">
            <span>{{ t("messagePlatforms.appId") }}</span>
            <ElInput v-model="bindingDraft.appId" autocomplete="off" />
          </label>
          <label>
            <span>{{ t("messagePlatforms.connectionMode") }}</span>
            <ElSelect v-model="bindingDraft.connectionMode">
              <ElOption
                v-for="option in connectionModeOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </ElSelect>
          </label>
          <label>
            <span>{{ secretLabel }}</span>
            <ElInput v-model="bindingDraft.secretValue" show-password autocomplete="off" />
          </label>
          <div class="message-platforms-page__switch-row">
            <span>{{ t("messagePlatforms.enableBinding") }}</span>
            <ElSwitch v-model="bindingDraft.enabled" />
          </div>
          <p class="message-platforms-page__form-hint">{{ t("messagePlatforms.secretHint") }}</p>
        </form>
        <template #footer>
          <ElButton @click="isBindingDialogOpen = false">{{ t("common.cancel") }}</ElButton>
          <ElButton type="primary" :loading="isSaving" @click="saveBinding">
            {{ t("common.save") }}
          </ElButton>
        </template>
      </ElDialog>
    </main>
  </AppShell>
</template>

<script setup lang="ts">
import * as QRCode from "qrcode";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ElAlert, ElButton, ElDialog, ElDivider, ElIcon, ElInput, ElLink, ElMessage, ElOption, ElSelect, ElSwitch } from "element-plus";
import { ChatLineRound, Connection, Refresh, Setting } from "@element-plus/icons-vue";

import AppShell from "@/layouts/AppShell.vue";
import {
  fetchMessagePlatformBindings,
  fetchMessagePlatformCatalog,
  pollFeishuAutoBinding,
  startFeishuAutoBinding,
  updateMessagePlatformBinding,
} from "@/api/message-platforms.ts";
import type {
  FeishuAutoBindingJob,
  MessagePlatformBinding,
  MessagePlatformCatalogEntry,
  MessagePlatformConnectionStatus,
} from "@/types/message-platforms";
import { buildMessagePlatformRows, type MessagePlatformRow } from "./messagePlatformsPageModel.ts";

const { t } = useI18n();

const platforms = ref<MessagePlatformCatalogEntry[]>([]);
const bindings = ref<MessagePlatformBinding[]>([]);
const statuses = ref<MessagePlatformConnectionStatus[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const error = ref("");
const selectedRow = ref<MessagePlatformRow | null>(null);
const isBindingDialogOpen = ref(false);
const autoBindJob = ref<FeishuAutoBindingJob | null>(null);
const isAutoBindingStarting = ref(false);
const feishuQrCodeDataUrl = ref("");
let autoBindPollTimer: ReturnType<typeof setInterval> | null = null;
let feishuQrGenerationToken = 0;

const bindingDraft = reactive({
  displayName: "",
  connectionMode: "polling",
  appId: "",
  secretValue: "",
  enabled: true,
});

const rows = computed(() =>
  buildMessagePlatformRows({
    platforms: platforms.value,
    bindings: bindings.value,
    statuses: statuses.value,
    formatStatusLabel,
  }),
);
const connectedCount = computed(() => rows.value.filter((row) => row.status === "connected").length);
const supportedCount = computed(() => rows.value.filter((row) => row.canConfigure).length);
const secretLabel = computed(() =>
  selectedRow.value?.platformId === "feishu" ? t("messagePlatforms.appSecret") : t("messagePlatforms.botToken"),
);
const isFeishuSelected = computed(() => selectedRow.value?.platformId === "feishu");
const connectionModeOptions = computed(() =>
  isFeishuSelected.value
    ? [
        { value: "websocket", label: t("messagePlatforms.connectionModeWebsocket") },
        { value: "webhook", label: t("messagePlatforms.connectionModeWebhook") },
      ]
    : [
        { value: "polling", label: t("messagePlatforms.connectionModePolling") },
        { value: "webhook", label: t("messagePlatforms.connectionModeWebhook") },
      ],
);

function findBinding(platformId: string) {
  return bindings.value.find((binding) => binding.platform_id === platformId) ?? null;
}

function formatDate(value: string) {
  if (!value) {
    return t("common.none");
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatStatusLabel(supportLevel: string, status: string) {
  if (supportLevel !== "supported") {
    return t("messagePlatforms.statusPlanned");
  }
  const labels: Record<string, string> = {
    disabled: t("messagePlatforms.statusDisabled"),
    not_configured: t("messagePlatforms.statusNotConfigured"),
    not_connected: t("messagePlatforms.statusNotConnected"),
    connecting: t("messagePlatforms.statusConnecting"),
    connected: t("messagePlatforms.statusConnected"),
    retrying: t("messagePlatforms.statusRetrying"),
    error: t("messagePlatforms.statusError"),
  };
  return labels[status] ?? status;
}

async function loadPage() {
  isLoading.value = true;
  error.value = "";
  try {
    const [catalogPayload, bindingPayload] = await Promise.all([
      fetchMessagePlatformCatalog(),
      fetchMessagePlatformBindings(),
    ]);
    platforms.value = catalogPayload.platforms;
    bindings.value = bindingPayload.bindings;
    statuses.value = bindingPayload.statuses;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
  }
}

function selectPlatform(row: MessagePlatformRow) {
  if (!row.canConfigure) {
    return;
  }
  const binding = findBinding(row.platformId);
  selectedRow.value = row;
  clearAutoBindPolling();
  autoBindJob.value = null;
  bindingDraft.displayName = binding?.display_name || row.displayName;
  bindingDraft.connectionMode = String(binding?.config.connection_mode || defaultConnectionMode(row.platformId));
  bindingDraft.appId = String(binding?.config.app_id || "");
  bindingDraft.secretValue = "";
  bindingDraft.enabled = binding?.enabled ?? true;
  isBindingDialogOpen.value = true;
}

function defaultConnectionMode(platformId: string) {
  return platformId === "feishu" ? "websocket" : "polling";
}

function secretKeyForPlatform(platformId: string) {
  return platformId === "feishu" ? "app_secret" : "bot_token";
}

function buildBindingConfig(platformId: string) {
  const config: Record<string, unknown> = { connection_mode: bindingDraft.connectionMode };
  if (platformId === "feishu" && bindingDraft.appId.trim()) {
    config.app_id = bindingDraft.appId.trim();
  }
  return config;
}

async function saveBinding() {
  if (!selectedRow.value) {
    return;
  }
  isSaving.value = true;
  try {
    await updateMessagePlatformBinding(selectedRow.value.bindingId, {
      platform_id: selectedRow.value.platformId,
      display_name: bindingDraft.displayName,
      enabled: bindingDraft.enabled,
      config: buildBindingConfig(selectedRow.value.platformId),
      secrets: bindingDraft.secretValue
        ? { [secretKeyForPlatform(selectedRow.value.platformId)]: bindingDraft.secretValue }
        : {},
    });
    isBindingDialogOpen.value = false;
    ElMessage.success(t("messagePlatforms.saved"));
    await loadPage();
  } catch (err) {
    ElMessage.error(t("common.failedToSave", { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    isSaving.value = false;
  }
}

async function startFeishuAutoBindingFlow() {
  if (!isFeishuSelected.value) {
    return;
  }
  isAutoBindingStarting.value = true;
  autoBindJob.value = null;
  clearAutoBindPolling();
  try {
    const response = await startFeishuAutoBinding({
      display_name: bindingDraft.displayName || "Feishu/Lark",
      enabled: bindingDraft.enabled,
      connection_mode: bindingDraft.connectionMode || "websocket",
    });
    autoBindJob.value = response.job;
    await handleAutoBindJob(response.job);
  } catch (err) {
    ElMessage.error(t("messagePlatforms.feishuAutoBindFailed", { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    isAutoBindingStarting.value = false;
  }
}

async function handleAutoBindJob(job: FeishuAutoBindingJob) {
  if (job.status === "completed") {
    clearAutoBindPolling();
    applyCompletedAutoBinding(job);
    ElMessage.success(t("messagePlatforms.feishuAutoBindCompleted"));
    await loadPage();
    return;
  }
  if (job.status === "failed") {
    clearAutoBindPolling();
    return;
  }
  startAutoBindPolling(job.job_id);
}

function applyCompletedAutoBinding(job: FeishuAutoBindingJob) {
  const binding = job.binding;
  if (!binding) {
    return;
  }
  bindingDraft.displayName = binding.display_name || bindingDraft.displayName;
  bindingDraft.connectionMode = String(binding.config.connection_mode || bindingDraft.connectionMode || "websocket");
  bindingDraft.appId = String(binding.config.app_id || bindingDraft.appId || "");
  bindingDraft.secretValue = "";
  bindingDraft.enabled = binding.enabled;
}

function startAutoBindPolling(jobId: string) {
  clearAutoBindPolling();
  autoBindPollTimer = setInterval(() => {
    void refreshFeishuAutoBindingJob(jobId);
  }, 1800);
}

async function refreshFeishuAutoBindingJob(jobId: string) {
  try {
    const response = await pollFeishuAutoBinding(jobId);
    autoBindJob.value = response.job;
    await handleAutoBindJob(response.job);
  } catch (err) {
    clearAutoBindPolling();
    ElMessage.error(t("messagePlatforms.feishuAutoBindFailed", { error: err instanceof Error ? err.message : String(err) }));
  }
}

function clearAutoBindPolling() {
  if (autoBindPollTimer !== null) {
    clearInterval(autoBindPollTimer);
    autoBindPollTimer = null;
  }
}

onMounted(() => {
  void loadPage();
});

watch(
  () => autoBindJob.value?.qr_url || "",
  (qrUrl) => {
    void refreshFeishuQrCode(qrUrl);
  },
);

onBeforeUnmount(() => {
  clearAutoBindPolling();
});

async function refreshFeishuQrCode(qrUrl: string) {
  const token = ++feishuQrGenerationToken;
  feishuQrCodeDataUrl.value = "";
  if (!qrUrl) {
    return;
  }
  try {
    const dataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 176,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    });
    if (token === feishuQrGenerationToken) {
      feishuQrCodeDataUrl.value = dataUrl;
    }
  } catch {
    if (token === feishuQrGenerationToken) {
      feishuQrCodeDataUrl.value = "";
    }
  }
}
</script>

<style scoped>
.message-platforms-page {
  display: grid;
  gap: 20px;
  max-width: 1180px;
  margin: 0 auto;
  color: var(--toograph-text);
}

.message-platforms-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 28px;
  border: 1px solid var(--toograph-glass-border);
  border-radius: 24px;
  background: var(--toograph-glass-specular), var(--toograph-glass-lens), var(--toograph-glass-bg-strong);
  box-shadow: var(--toograph-glass-shadow), var(--toograph-glass-highlight), var(--toograph-glass-rim);
}

.message-platforms-page__eyebrow {
  margin: 0 0 8px;
  color: rgb(154, 52, 18);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.message-platforms-page__header h1 {
  margin: 0;
  color: var(--toograph-text-strong);
  font-family: var(--toograph-font-display);
  font-size: clamp(1.55rem, 2.5vw, 2.25rem);
  line-height: 1.08;
  letter-spacing: 0;
}

.message-platforms-page__header p:last-child {
  max-width: 760px;
  margin: 10px 0 0;
  color: var(--toograph-text-muted);
  line-height: 1.6;
}

.message-platforms-page__refresh {
  flex: 0 0 auto;
}

.message-platforms-page__alert {
  border-radius: 14px;
}

.message-platforms-page__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.message-platforms-page__metric {
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  background: var(--toograph-surface-card);
}

.message-platforms-page__metric strong {
  display: block;
  color: var(--toograph-text-strong);
  font-size: 1.35rem;
  line-height: 1.1;
}

.message-platforms-page__metric span {
  display: block;
  margin-top: 4px;
  color: var(--toograph-text-muted);
  font-size: 0.88rem;
}

.message-platforms-page__loading {
  min-height: 180px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(154, 52, 18, 0.16);
  border-radius: 20px;
  color: var(--toograph-text-muted);
}

.message-platforms-page__platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.message-platforms-page__platform-card {
  min-width: 0;
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.78);
}

.message-platforms-page__platform-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.message-platforms-page__platform-title {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.message-platforms-page__platform-icon {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: rgb(154, 52, 18);
  background: rgba(255, 248, 240, 0.9);
}

.message-platforms-page__platform-title h2 {
  margin: 0;
  color: var(--toograph-text-strong);
  font-size: 1rem;
  line-height: 1.25;
  letter-spacing: 0;
}

.message-platforms-page__platform-title p {
  margin: 3px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.8rem;
  word-break: break-word;
}

.message-platforms-page__status {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.message-platforms-page__status[data-tone="success"] {
  color: rgb(21, 128, 61);
  background: rgba(220, 252, 231, 0.9);
}

.message-platforms-page__status[data-tone="warning"] {
  color: rgb(180, 83, 9);
  background: rgba(254, 243, 199, 0.9);
}

.message-platforms-page__status[data-tone="danger"] {
  color: rgb(185, 28, 28);
  background: rgba(254, 226, 226, 0.9);
}

.message-platforms-page__status[data-tone="muted"] {
  color: var(--toograph-text-muted);
  background: rgba(241, 245, 249, 0.85);
}

.message-platforms-page__platform-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.message-platforms-page__platform-meta div {
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.52);
}

.message-platforms-page__platform-meta dt {
  color: var(--toograph-text-muted);
  font-size: 0.72rem;
}

.message-platforms-page__platform-meta dd {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--toograph-text-strong);
  font-size: 0.86rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-platforms-page__error {
  margin: 0;
  border-radius: 12px;
  padding: 10px 12px;
  color: rgb(185, 28, 28);
  background: rgba(254, 226, 226, 0.7);
  font-size: 0.86rem;
  line-height: 1.45;
}

.message-platforms-page__actions {
  display: flex;
  justify-content: flex-end;
}

.message-platforms-page__form {
  display: grid;
  gap: 14px;
}

.message-platforms-page__form label {
  display: grid;
  gap: 7px;
  color: var(--toograph-text-strong);
  font-size: 0.88rem;
  font-weight: 700;
}

.message-platforms-page__auto-bind {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(22, 163, 74, 0.16);
  border-radius: 14px;
  background: rgba(240, 253, 244, 0.7);
}

.message-platforms-page__auto-bind h3 {
  margin: 0;
  color: var(--toograph-text-strong);
  font-size: 0.96rem;
  letter-spacing: 0;
}

.message-platforms-page__auto-bind p {
  margin: 5px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.message-platforms-page__auto-bind-status {
  display: grid;
  gap: 9px;
}

.message-platforms-page__qr-card {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.78);
}

.message-platforms-page__qr-image,
.message-platforms-page__qr-placeholder {
  width: 176px;
  height: 176px;
  border-radius: 8px;
}

.message-platforms-page__qr-image {
  display: block;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #fff;
}

.message-platforms-page__qr-placeholder {
  display: grid;
  place-items: center;
  padding: 12px;
  border: 1px dashed rgba(15, 23, 42, 0.18);
  color: var(--toograph-text-muted);
  text-align: center;
  font-size: 0.82rem;
  line-height: 1.35;
}

.message-platforms-page__qr-copy {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.message-platforms-page__qr-copy strong {
  color: var(--toograph-text-strong);
  font-size: 0.92rem;
}

.message-platforms-page__qr-copy p {
  margin: 0;
}

.message-platforms-page__switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 0 0;
}

.message-platforms-page__form-hint {
  margin: 0;
  color: var(--toograph-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .message-platforms-page {
    gap: 14px;
  }

  .message-platforms-page__header {
    display: grid;
    padding: 20px;
  }

  .message-platforms-page__refresh {
    width: 100%;
  }

  .message-platforms-page__summary,
  .message-platforms-page__platform-meta {
    grid-template-columns: 1fr;
  }

  .message-platforms-page__qr-card {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .message-platforms-page__platform-main {
    display: grid;
  }

  .message-platforms-page__status {
    width: max-content;
  }
}
</style>
