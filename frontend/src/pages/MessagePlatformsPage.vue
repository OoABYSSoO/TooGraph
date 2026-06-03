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
        <article v-for="row in primaryRows" :key="row.platformId" class="message-platforms-page__platform-card">
          <div class="message-platforms-page__platform-main">
            <div class="message-platforms-page__platform-title">
              <span
                v-if="platformLogoUrl(row)"
                class="message-platforms-page__platform-icon message-platforms-page__platform-icon--brand"
                aria-hidden="true"
              >
                <img class="message-platforms-page__platform-logo" :src="platformLogoUrl(row)" alt="" />
              </span>
              <ElIcon v-else class="message-platforms-page__platform-icon" aria-hidden="true"><ChatLineRound /></ElIcon>
              <div>
                <h2>{{ row.displayName }}</h2>
                <p>{{ row.platformId }}</p>
              </div>
            </div>
            <ElButton
              class="message-platforms-page__configure-button"
              type="primary"
              :disabled="!row.canConfigure"
              @click="selectPlatform(row)"
            >
              <ElIcon aria-hidden="true"><Setting /></ElIcon>
              {{ row.canConfigure ? t("messagePlatforms.configure") : t("messagePlatforms.planned") }}
            </ElButton>
          </div>

          <dl class="message-platforms-page__platform-meta">
            <div>
              <dt>{{ t("messagePlatforms.enabled") }}</dt>
              <dd>
                <ElSwitch
                  class="message-platforms-page__enabled-switch"
                  :model-value="row.enabled"
                  :disabled="!row.configured || busyBindingId === row.bindingId"
                  :loading="busyBindingId === row.bindingId"
                  :aria-label="enabledToggleLabel(row)"
                  @change="setPlatformEnabled(row, Boolean($event))"
                />
              </dd>
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
        </article>
      </section>

      <section
        v-if="futureRows.length"
        class="message-platforms-page__future-support"
        :aria-label="t('messagePlatforms.futureSupportLabel')"
      >
        <div>
          <h2>{{ t("messagePlatforms.futureSupportTitle") }}</h2>
          <p>{{ t("messagePlatforms.futureSupportBody") }}</p>
        </div>
        <div class="message-platforms-page__future-list">
          <span v-for="row in futureRows" :key="row.platformId">{{ row.displayName }}</span>
        </div>
      </section>

      <ElDialog
        v-model="isBindingDialogOpen"
        class="message-platforms-page__dialog"
        :title="dialogTitle"
        width="520px"
        :append-to-body="true"
      >
        <template #header>
          <div class="message-platforms-page__dialog-title">
            <img
              v-if="selectedPlatformLogoUrl"
              class="message-platforms-page__dialog-title-logo"
              :src="selectedPlatformLogoUrl"
              alt=""
              aria-hidden="true"
            />
            <span>{{ dialogTitle }}</span>
          </div>
        </template>
        <form class="message-platforms-page__form" @submit.prevent="saveBinding">
          <label>
            <span>{{ t("messagePlatforms.displayName") }}</span>
            <ElInput v-model="bindingDraft.displayName" />
          </label>

          <section v-if="isFeishuSelected" class="message-platforms-page__binding-mode">
            <div
              class="message-platforms-page__binding-tabs"
              role="tablist"
              :aria-label="t('messagePlatforms.bindingModeLabel')"
            >
              <button
                v-for="tabItem in bindingModeTabs"
                :key="tabItem.value"
                type="button"
                class="message-platforms-page__binding-tab"
                :class="{ 'message-platforms-page__binding-tab--active': activeBindingMode === tabItem.value }"
                role="tab"
                :aria-selected="activeBindingMode === tabItem.value"
                :tabindex="activeBindingMode === tabItem.value ? 0 : -1"
                @click="activeBindingMode = tabItem.value"
              >
                {{ tabItem.label }}
              </button>
            </div>
          </section>

          <section
            v-if="isFeishuSelected && activeBindingMode === 'qr'"
            class="message-platforms-page__auto-bind"
            role="tabpanel"
          >
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

          <section
            v-if="activeBindingMode === 'manual'"
            class="message-platforms-page__manual-bind"
            role="tabpanel"
          >
            <label v-if="isFeishuSelected">
              <span>{{ t("messagePlatforms.appId") }}</span>
              <ElInput v-model="bindingDraft.appId" autocomplete="off" />
            </label>
            <label>
              <span>{{ t("messagePlatforms.connectionMode") }}</span>
              <ElSelect
                v-model="bindingDraft.connectionMode"
                class="toograph-select"
                popper-class="toograph-select-popper"
              >
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
          </section>
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
import { ElAlert, ElButton, ElDialog, ElIcon, ElInput, ElLink, ElMessage, ElOption, ElSelect, ElSwitch } from "element-plus";
import { ChatLineRound, Connection, Refresh, Setting } from "@element-plus/icons-vue";

import feishuLogoUrl from "@/brand/feishu-logo.svg";
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
import {
  buildFutureMessagePlatformRows,
  buildMessagePlatformRows,
  buildPrimaryMessagePlatformRows,
  type MessagePlatformRow,
} from "./messagePlatformsPageModel.ts";

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
const busyBindingId = ref("");
const feishuQrCodeDataUrl = ref("");
let autoBindPollTimer: ReturnType<typeof setInterval> | null = null;
let feishuQrGenerationToken = 0;
type BindingMode = "qr" | "manual";

const bindingDraft = reactive({
  displayName: "",
  connectionMode: "polling",
  appId: "",
  secretValue: "",
  enabled: true,
});
const activeBindingMode = ref<BindingMode>("qr");

const rows = computed(() =>
  buildMessagePlatformRows({
    platforms: platforms.value,
    bindings: bindings.value,
    statuses: statuses.value,
    formatStatusLabel,
  }),
);
const primaryRows = computed(() => buildPrimaryMessagePlatformRows(rows.value));
const futureRows = computed(() => buildFutureMessagePlatformRows(rows.value));
const connectedCount = computed(() => primaryRows.value.filter((row) => row.status === "connected").length);
const supportedCount = computed(() => primaryRows.value.filter((row) => row.canConfigure).length);
const dialogTitle = computed(() =>
  selectedRow.value ? t("messagePlatforms.configureTitle", { platform: selectedRow.value.displayName }) : t("messagePlatforms.configure"),
);
const selectedPlatformLogoUrl = computed(() => (selectedRow.value ? platformLogoUrl(selectedRow.value) : ""));
const secretLabel = computed(() =>
  selectedRow.value?.platformId === "feishu" ? t("messagePlatforms.appSecret") : t("messagePlatforms.botToken"),
);
const isFeishuSelected = computed(() => selectedRow.value?.platformId === "feishu");
const bindingModeTabs = computed<{ label: string; value: BindingMode }[]>(() => [
  { label: t("messagePlatforms.qrBindingTab"), value: "qr" },
  { label: t("messagePlatforms.manualBindingTab"), value: "manual" },
]);
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

function platformLogoUrl(row: MessagePlatformRow) {
  return row.platformId === "feishu" ? feishuLogoUrl : "";
}

function enabledToggleLabel(row: MessagePlatformRow) {
  return row.enabled ? t("messagePlatforms.disableBinding") : t("messagePlatforms.enableBinding");
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
  activeBindingMode.value = "qr";
  bindingDraft.displayName = binding?.display_name || row.displayName;
  bindingDraft.connectionMode = String(binding?.config.connection_mode || defaultConnectionMode(row.platformId));
  bindingDraft.appId = String(binding?.config.app_id || "");
  bindingDraft.secretValue = "";
  bindingDraft.enabled = binding?.enabled ?? true;
  isBindingDialogOpen.value = true;
}

async function setPlatformEnabled(row: MessagePlatformRow, enabled: boolean) {
  if (!row.configured || busyBindingId.value === row.bindingId || row.enabled === enabled) {
    return;
  }
  const binding = findBinding(row.platformId);
  if (!binding) {
    return;
  }

  busyBindingId.value = row.bindingId;
  try {
    const payload = await updateMessagePlatformBinding(binding.binding_id, {
      platform_id: row.platformId,
      display_name: binding.display_name || row.displayName,
      enabled,
      config: binding.config,
    });
    bindings.value = bindings.value.map((item) =>
      item.binding_id === payload.binding.binding_id ? payload.binding : item,
    );
    const nextStatuses = statuses.value.filter((item) => item.binding_id !== payload.status.binding_id);
    statuses.value = [payload.status, ...nextStatuses];
    ElMessage.success(t("messagePlatforms.saved"));
  } catch (err) {
    ElMessage.error(t("common.failedToSave", { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    busyBindingId.value = "";
  }
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

.message-platforms-page__platform-icon--brand {
  border: 1px solid rgba(51, 112, 255, 0.14);
  background: rgba(255, 255, 255, 0.96);
}

.message-platforms-page__platform-logo {
  width: 22px;
  height: 22px;
  display: block;
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

.message-platforms-page__enabled-switch {
  display: inline-flex;
  vertical-align: top;
}

.message-platforms-page__enabled-switch :deep(.el-switch__core) {
  min-width: 40px;
  height: 22px;
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

.message-platforms-page__configure-button {
  --el-button-bg-color: #3370ff;
  --el-button-border-color: #3370ff;
  --el-button-hover-bg-color: #245bdb;
  --el-button-hover-border-color: #245bdb;
  --el-button-active-bg-color: #133c9a;
  --el-button-active-border-color: #133c9a;
  --el-button-text-color: #fff;
  --el-button-hover-text-color: #fff;
  flex: 0 0 auto;
  min-height: 34px;
  border-radius: 999px;
  padding-inline: 12px;
  font-size: 0.84rem;
  font-weight: 800;
}

.message-platforms-page__future-support {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 18px;
  align-items: start;
  padding: 18px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.58);
}

.message-platforms-page__future-support h2 {
  margin: 0;
  color: var(--toograph-text-strong);
  font-size: 1rem;
  line-height: 1.25;
  letter-spacing: 0;
}

.message-platforms-page__future-support p {
  margin: 7px 0 0;
  color: var(--toograph-text-muted);
  font-size: 0.86rem;
  line-height: 1.5;
}

.message-platforms-page__future-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.message-platforms-page__future-list span {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--toograph-text-muted);
  font-size: 0.8rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.message-platforms-page__form {
  display: grid;
  gap: 14px;
}

.message-platforms-page__dialog-title {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
  color: var(--toograph-text-strong);
  font-weight: 800;
}

.message-platforms-page__dialog-title-logo {
  width: 24px;
  height: 24px;
  display: block;
  flex: 0 0 auto;
  border-radius: 8px;
}

.message-platforms-page__form label {
  display: grid;
  gap: 7px;
  color: var(--toograph-text-strong);
  font-size: 0.88rem;
  font-weight: 700;
}

.message-platforms-page__binding-mode {
  display: grid;
  gap: 8px;
}

.message-platforms-page__binding-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  width: 100%;
  overflow-x: auto;
  border: 1px solid rgba(154, 52, 18, 0.1);
  border-radius: 999px;
  background: rgba(255, 248, 240, 0.72);
  padding: 4px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.message-platforms-page__binding-tab {
  flex: 1 0 0;
  min-height: 32px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  padding: 0 12px;
  color: rgba(90, 58, 28, 0.74);
  font-weight: 700;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
}

.message-platforms-page__binding-tab:not(.message-platforms-page__binding-tab--active):hover {
  background: rgba(255, 255, 255, 0.56);
  color: rgba(124, 45, 18, 0.92);
}

.message-platforms-page__binding-tab--active {
  border: 1px solid rgba(154, 52, 18, 0.18);
  background: rgba(255, 255, 255, 0.96);
  color: var(--toograph-accent-strong);
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(120, 53, 15, 0.1);
}

.message-platforms-page__binding-tab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(210, 162, 117, 0.3);
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

.message-platforms-page__manual-bind {
  display: grid;
  gap: 14px;
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
  .message-platforms-page__future-support,
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
