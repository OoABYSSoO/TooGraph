export type MessagePlatformSupportLevel = "supported" | "planned" | "reference_only";

export type MessagePlatformStatus =
  | "disabled"
  | "not_configured"
  | "not_connected"
  | "connecting"
  | "connected"
  | "retrying"
  | "error";

export type MessagePlatformCatalogEntry = {
  platform_id: string;
  display_name: string;
  support_level: MessagePlatformSupportLevel;
  capabilities: Record<string, boolean>;
  config_schema: string;
};

export type MessagePlatformBinding = {
  binding_id: string;
  platform_id: string;
  display_name: string;
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
  secret_summary: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type MessagePlatformSession = {
  platform_session_id: string;
  platform_id: string;
  binding_id: string;
  external_chat_id: string;
  external_thread_id: string;
  external_chat_type: string;
  buddy_session_id: string;
  display_name: string;
  metadata: Record<string, unknown>;
  last_inbound_at: string;
  last_outbound_at: string;
  created_at: string;
  updated_at: string;
};

export type MessagePlatformConnectionStatus = {
  binding_id: string;
  status: MessagePlatformStatus;
  last_connected_at: string;
  last_disconnected_at: string;
  last_event_at: string;
  last_delivery_at: string;
  last_error_code: string;
  last_error_message: string;
  retry_count: number;
  updated_at: string;
};

export type FeishuAutoBindingStatus = "starting" | "waiting_for_scan" | "completed" | "failed";

export type FeishuAutoBindingJob = {
  job_id: string;
  platform_id: "feishu";
  binding_id: string;
  status: FeishuAutoBindingStatus;
  qr_url: string;
  qr_expires_in: number;
  provider_status?: string;
  error?: string;
  binding?: MessagePlatformBinding | null;
};
