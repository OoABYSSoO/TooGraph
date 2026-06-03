import type {
  MessagePlatformBinding,
  MessagePlatformCatalogEntry,
  MessagePlatformConnectionStatus,
  MessagePlatformStatus,
} from "@/types/message-platforms";

export type MessagePlatformStatusTone = "success" | "warning" | "danger" | "muted";

export type MessagePlatformRow = {
  platformId: string;
  displayName: string;
  supportLevel: string;
  bindingId: string;
  status: MessagePlatformStatus;
  statusLabel: string;
  statusTone: MessagePlatformStatusTone;
  canConfigure: boolean;
  configured: boolean;
  enabled: boolean;
  lastEventAt: string;
  lastErrorMessage: string;
};

type BuildMessagePlatformRowsInput = {
  platforms: MessagePlatformCatalogEntry[];
  bindings: MessagePlatformBinding[];
  statuses: MessagePlatformConnectionStatus[];
  formatStatusLabel?: (supportLevel: string, status: MessagePlatformStatus) => string;
};

const PRIMARY_MESSAGE_PLATFORM_IDS = new Set(["feishu"]);

export function buildMessagePlatformRows(input: BuildMessagePlatformRowsInput): MessagePlatformRow[] {
  const bindingByPlatform = new Map(input.bindings.map((binding) => [binding.platform_id, binding]));
  const statusByBinding = new Map(input.statuses.map((status) => [status.binding_id, status]));

  return input.platforms.map((platform) => {
    const binding = bindingByPlatform.get(platform.platform_id) ?? null;
    const status = binding ? statusByBinding.get(binding.binding_id) ?? null : null;
    const resolvedStatus = resolvePlatformStatus(platform, binding, status);

    return {
      platformId: platform.platform_id,
      displayName: platform.display_name,
      supportLevel: platform.support_level,
      bindingId: binding?.binding_id ?? `mpb_${platform.platform_id}`,
      status: resolvedStatus,
      statusLabel: (input.formatStatusLabel ?? formatPlatformStatusLabel)(platform.support_level, resolvedStatus),
      statusTone: resolvePlatformStatusTone(resolvedStatus),
      canConfigure: platform.support_level === "supported",
      configured: Boolean(binding?.configured),
      enabled: Boolean(binding?.enabled),
      lastEventAt: status?.last_event_at ?? "",
      lastErrorMessage: status?.last_error_message ?? "",
    };
  });
}

export function buildPrimaryMessagePlatformRows(rows: MessagePlatformRow[]): MessagePlatformRow[] {
  return rows.filter((row) => PRIMARY_MESSAGE_PLATFORM_IDS.has(row.platformId));
}

export function buildFutureMessagePlatformRows(rows: MessagePlatformRow[]): MessagePlatformRow[] {
  return rows.filter((row) => !PRIMARY_MESSAGE_PLATFORM_IDS.has(row.platformId));
}

function resolvePlatformStatus(
  platform: MessagePlatformCatalogEntry,
  binding: MessagePlatformBinding | null,
  status: MessagePlatformConnectionStatus | null,
): MessagePlatformStatus {
  if (platform.support_level !== "supported") {
    return "disabled";
  }
  if (!binding?.configured) {
    return "not_configured";
  }
  if (!binding.enabled) {
    return "disabled";
  }
  return status?.status ?? "not_connected";
}

function formatPlatformStatusLabel(supportLevel: string, status: MessagePlatformStatus) {
  if (supportLevel !== "supported") {
    return "计划支持";
  }

  return {
    disabled: "未启用",
    not_configured: "未配置",
    not_connected: "未连接",
    connecting: "连接中",
    connected: "已连接",
    retrying: "重试中",
    error: "错误",
  }[status];
}

export function resolvePlatformStatusTone(status: MessagePlatformStatus): MessagePlatformStatusTone {
  if (status === "connected") {
    return "success";
  }
  if (status === "connecting" || status === "retrying") {
    return "warning";
  }
  if (status === "error") {
    return "danger";
  }
  return "muted";
}
