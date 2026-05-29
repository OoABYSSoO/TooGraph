import type {
  FeishuAutoBindingJob,
  MessagePlatformBinding,
  MessagePlatformCatalogEntry,
  MessagePlatformConnectionStatus,
  MessagePlatformSession,
} from "@/types/message-platforms";
import { apiGet, apiPost, apiPut } from "./http.ts";

export function fetchMessagePlatformCatalog() {
  return apiGet<{ platforms: MessagePlatformCatalogEntry[] }>("/api/message-platforms/catalog");
}

export function fetchMessagePlatformBindings() {
  return apiGet<{ bindings: MessagePlatformBinding[]; statuses: MessagePlatformConnectionStatus[] }>(
    "/api/message-platforms/bindings",
  );
}

export function fetchMessagePlatformSessions(
  filters: {
    platformId?: string;
    bindingId?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (filters.platformId) {
    params.set("platform_id", filters.platformId);
  }
  if (filters.bindingId) {
    params.set("binding_id", filters.bindingId);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }
  const query = params.toString();
  return apiGet<{ sessions: MessagePlatformSession[] }>(`/api/message-platforms/sessions${query ? `?${query}` : ""}`);
}

export function updateMessagePlatformBinding(
  bindingId: string,
  payload: {
    platform_id: string;
    display_name?: string;
    enabled: boolean;
    config: Record<string, unknown>;
    secrets?: Record<string, string>;
  },
) {
  return apiPut<{ binding: MessagePlatformBinding; status: MessagePlatformConnectionStatus }>(
    `/api/message-platforms/bindings/${encodeURIComponent(bindingId)}`,
    payload,
  );
}

export function startFeishuAutoBinding(payload: {
  display_name: string;
  enabled: boolean;
  connection_mode?: string;
}) {
  return apiPost<{ job: FeishuAutoBindingJob }>("/api/message-platforms/feishu/auto-binding/start", {
    ...payload,
    connection_mode: payload.connection_mode || "websocket",
  });
}

export function pollFeishuAutoBinding(jobId: string) {
  return apiGet<{ job: FeishuAutoBindingJob }>(
    `/api/message-platforms/feishu/auto-binding/${encodeURIComponent(jobId)}`,
  );
}
