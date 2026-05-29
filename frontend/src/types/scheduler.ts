export type ScheduledGraphJob = {
  job_id: string;
  name: string;
  template_id: string;
  input_bindings: Record<string, unknown>;
  schedule_kind: string;
  schedule_expr: string;
  timezone: string;
  enabled: boolean;
  last_run_id: string;
  next_run_at: string;
  runtime_overrides: Record<string, unknown>;
  delivery_target: Record<string, unknown>;
  retry_policy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ScheduledMessageOutletKind = "none" | "buddy" | "feishu" | "telegram";

export type ScheduledMessageOutletSessionMode = "existing_session" | "create_session" | "new_session_per_run";

export type ScheduledMessageOutletTarget = {
  kind: "message_outlet";
  outlet: Exclude<ScheduledMessageOutletKind, "none">;
  session_mode: ScheduledMessageOutletSessionMode;
  buddy_session_id?: string;
  platform_session_id?: string;
  binding_id?: string;
  external_chat_id?: string;
  external_thread_id?: string;
  external_chat_type?: string;
  display_name?: string;
  title?: string;
};

export type ScheduledGraphJobRun = {
  job_run_id: string;
  job_id: string;
  run_id: string;
  trigger_reason: string;
  status: string;
  error: string;
  started_at: string;
  completed_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ScheduledGraphJobRunResponse = {
  job: ScheduledGraphJob;
  job_run: ScheduledGraphJobRun;
  run_id: string;
  status: string;
};

export type ScheduledGraphJobCreatePayload = {
  name: string;
  template_id: string;
  input_bindings: Record<string, unknown>;
  schedule_kind: string;
  schedule_expr: string;
  timezone: string;
  enabled: boolean;
  runtime_overrides?: Record<string, unknown>;
  delivery_target?: Record<string, unknown>;
  retry_policy?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type ScheduledGraphJobUpdatePayload = Partial<ScheduledGraphJobCreatePayload>;
