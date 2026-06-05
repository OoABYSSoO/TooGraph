import { translate } from "../i18n/index.ts";
import type { InputValuePresentation, TemplateRecord } from "../types/node-system.ts";
import type {
  ScheduledGraphJob,
  ScheduledGraphJobCreatePayload,
  ScheduledGraphJobRun,
  ScheduledMessageOutletKind,
  ScheduledMessageOutletSessionMode,
  ScheduledMessageOutletTarget,
} from "../types/scheduler.ts";

export type ScheduledIntervalUnit = "minutes" | "hours" | "days";

export type ScheduledInputDraftValue = string | number | boolean | Record<string, unknown> | unknown[] | null;

export type ScheduledGraphJobDraft = {
  name: string;
  template_id: string;
  schedule_kind: string;
  schedule_expr: string;
  interval_amount: number;
  interval_unit: ScheduledIntervalUnit;
  timezone: string;
  enabled: boolean;
  input_values: Record<string, ScheduledInputDraftValue>;
  input_defaults: Record<string, unknown>;
  input_types: Record<string, string>;
  input_presentations: Record<string, InputValuePresentation | null>;
  delivery_outlet: ScheduledMessageOutletKind;
  delivery_session_mode: ScheduledMessageOutletSessionMode;
  buddy_session_id: string;
  platform_session_id: string;
  message_platform_binding_id: string;
  external_chat_id: string;
  external_thread_id: string;
  external_chat_type: string;
  external_display_name: string;
};

export type ScheduledGraphJobInputRow = {
  node_id: string;
  state_key: string;
  label: string;
  description: string;
  type: string;
  value: ScheduledInputDraftValue;
  default_value: unknown;
  presentation: InputValuePresentation | null;
  changed: boolean;
};

export type SchedulerOverviewItem = {
  key: string;
  label: string;
  value: number;
};

export type ScheduledGraphJobTriggerProfile = {
  modeLabel: string;
  description: string;
};

export function buildSchedulerOverview(jobs: ScheduledGraphJob[]): SchedulerOverviewItem[] {
  return [
    { key: "total", label: translate("scheduler.total"), value: jobs.length },
    { key: "enabled", label: translate("scheduler.enabled"), value: jobs.filter((job) => job.enabled).length },
    { key: "disabled", label: translate("scheduler.disabled"), value: jobs.filter((job) => !job.enabled).length },
    { key: "official", label: translate("scheduler.official"), value: jobs.filter((job) => job.metadata?.source === "official_seed").length },
  ];
}

export function isOfficialScheduledGraphJob(job: ScheduledGraphJob): boolean {
  return job.metadata?.source === "official_seed" || job.metadata?.source === "official";
}

export function canEditScheduledGraphJobTemplate(job: ScheduledGraphJob): boolean {
  return !isOfficialScheduledGraphJob(job);
}

export function sortScheduledGraphJobs(jobs: ScheduledGraphJob[]): ScheduledGraphJob[] {
  return [...jobs].sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }
    const templateDiff = compareStableText(left.template_id, right.template_id);
    return templateDiff || left.job_id.localeCompare(right.job_id);
  });
}

export function formatSchedule(job: Pick<ScheduledGraphJob, "schedule_kind" | "schedule_expr">): string {
  if (job.schedule_kind === "manual") {
    return translate("scheduler.manual");
  }
  if (job.schedule_kind === "event") {
    return translate("scheduler.eventTrigger", { event: job.schedule_expr || translate("common.none") });
  }
  if (job.schedule_kind === "cron") {
    return job.schedule_expr || translate("common.none");
  }
  const seconds = intervalSeconds(job.schedule_expr);
  if (!seconds) {
    return job.schedule_expr || translate("common.none");
  }
  if (seconds % 86_400 === 0) {
    return translate("scheduler.everyDays", { count: seconds / 86_400 });
  }
  if (seconds % 3600 === 0) {
    return translate("scheduler.everyHours", { count: seconds / 3600 });
  }
  if (seconds % 60 === 0) {
    return translate("scheduler.everyMinutes", { count: seconds / 60 });
  }
  return translate("scheduler.everySeconds", { count: seconds });
}

export function buildScheduledGraphJobTriggerProfile(job: Pick<ScheduledGraphJob, "schedule_kind" | "metadata">): ScheduledGraphJobTriggerProfile {
  const modeLabel =
    job.schedule_kind === "event"
      ? translate("scheduler.eventTriggerMode")
      : job.schedule_kind === "interval"
        ? translate("scheduler.intervalTriggerMode")
        : job.schedule_kind === "cron"
          ? translate("scheduler.cronTriggerMode")
          : translate("scheduler.manualTriggerMode");
  const metadata = isRecord(job.metadata) ? job.metadata : {};
  const purpose = stringValue(metadata.purpose);
  return {
    modeLabel,
    description: officialScheduledGraphJobDescription(purpose),
  };
}

export function normalizeJobRunStatus(status: string): string {
  return status.trim() || "queued";
}

export function sortScheduledGraphJobRuns(runs: ScheduledGraphJobRun[]): ScheduledGraphJobRun[] {
  return [...runs].sort((left, right) => {
    const createdDiff = Date.parse(right.created_at) - Date.parse(left.created_at);
    if (Number.isFinite(createdDiff) && createdDiff !== 0) {
      return createdDiff;
    }
    return right.job_run_id.localeCompare(left.job_run_id);
  });
}

export function buildDefaultScheduledGraphJobDraft(
  templateId = "",
  template?: TemplateRecord | null,
  inputBindings: Record<string, unknown> = {},
): ScheduledGraphJobDraft {
  const inputState = buildInputDraftState(template ?? null, inputBindings);
  return {
    name: "",
    template_id: templateId,
    schedule_kind: "interval",
    schedule_expr: "PT24H",
    interval_amount: 1,
    interval_unit: "days",
    timezone: "UTC",
    enabled: false,
    input_values: inputState.values,
    input_defaults: inputState.defaults,
    input_types: inputState.types,
    input_presentations: inputState.presentations,
    delivery_outlet: "none",
    delivery_session_mode: "existing_session",
    buddy_session_id: "",
    platform_session_id: "",
    message_platform_binding_id: "",
    external_chat_id: "",
    external_thread_id: "",
    external_chat_type: "group",
    external_display_name: "",
  };
}

export function buildScheduledGraphJobDraftFromJob(
  job: ScheduledGraphJob,
  template?: TemplateRecord | null,
): ScheduledGraphJobDraft {
  const target = isRecord(job.delivery_target) ? job.delivery_target : {};
  const outlet = normalizeMessageOutlet(target.outlet);
  const sessionMode = normalizeSessionMode(target.session_mode);
  const inputState = buildInputDraftState(template ?? null, job.input_bindings);
  const interval = intervalControlsFromExpression(job.schedule_expr);
  return {
    name: job.name || "",
    template_id: job.template_id || "",
    schedule_kind: job.schedule_kind || "manual",
    schedule_expr: job.schedule_expr || "",
    interval_amount: interval.amount,
    interval_unit: interval.unit,
    timezone: job.timezone || "UTC",
    enabled: Boolean(job.enabled),
    input_values: inputState.values,
    input_defaults: inputState.defaults,
    input_types: inputState.types,
    input_presentations: inputState.presentations,
    delivery_outlet: target.kind === "message_outlet" ? outlet : "none",
    delivery_session_mode: sessionMode,
    buddy_session_id: stringValue(target.buddy_session_id || target.session_id),
    platform_session_id: stringValue(target.platform_session_id),
    message_platform_binding_id: stringValue(target.binding_id),
    external_chat_id: stringValue(target.external_chat_id || target.chat_id),
    external_thread_id: stringValue(target.external_thread_id || target.thread_id),
    external_chat_type: stringValue(target.external_chat_type) || "group",
    external_display_name: stringValue(target.display_name || target.external_display_name || target.title),
  };
}

export function buildScheduledGraphJobInputRows(
  template: TemplateRecord | null | undefined,
  draft: ScheduledGraphJobDraft,
): ScheduledGraphJobInputRow[] {
  if (!template) {
    return [];
  }
  return listTemplateInputFields(template).map((field) => {
    const value = draft.input_values[field.state_key] ?? formatInputDraftValue(field.type, field.default_value, field.presentation);
    const parsedValue = parseInputDraftValue(field.type, value, field.label);
    return {
      node_id: field.node_id,
      state_key: field.state_key,
      label: field.label,
      description: field.description,
      type: field.type,
      value,
      default_value: field.default_value,
      presentation: field.presentation,
      changed: !deepEqual(parsedValue, field.default_value),
    };
  });
}

export function buildScheduledGraphJobPayload(draft: ScheduledGraphJobDraft): ScheduledGraphJobCreatePayload {
  const templateId = draft.template_id.trim();
  if (!templateId) {
    throw new Error(translate("scheduler.templateRequired"));
  }
  const scheduleKind = draft.schedule_kind.trim() || "manual";
  return {
    name: draft.name.trim(),
    template_id: templateId,
    input_bindings: buildInputBindings(draft),
    delivery_target: buildMessageOutletTarget(draft),
    schedule_kind: scheduleKind,
    schedule_expr: buildScheduleExpression(draft, scheduleKind),
    timezone: draft.timezone.trim() || "UTC",
    enabled: draft.enabled,
    metadata: { source: "user" },
  };
}

export function withTemplateInputDraft(
  draft: ScheduledGraphJobDraft,
  template: TemplateRecord | null | undefined,
  inputBindings: Record<string, unknown> = {},
): ScheduledGraphJobDraft {
  const inputState = buildInputDraftState(template ?? null, inputBindings);
  return {
    ...draft,
    input_values: inputState.values,
    input_defaults: inputState.defaults,
    input_types: inputState.types,
    input_presentations: inputState.presentations,
  };
}

export function resetScheduledGraphJobInputValue(draft: ScheduledGraphJobDraft, stateKey: string): ScheduledGraphJobDraft {
  const type = draft.input_types[stateKey] || "text";
  const presentation = draft.input_presentations?.[stateKey] ?? null;
  return {
    ...draft,
    input_values: {
      ...draft.input_values,
      [stateKey]: formatInputDraftValue(type, draft.input_defaults[stateKey], presentation),
    },
  };
}

function buildScheduleExpression(draft: ScheduledGraphJobDraft, scheduleKind: string): string {
  if (scheduleKind === "manual") {
    return "";
  }
  if (scheduleKind === "interval") {
    const amount = Math.max(1, Math.floor(Number(draft.interval_amount) || 1));
    if (draft.interval_unit === "days") {
      return `P${amount}D`;
    }
    if (draft.interval_unit === "hours") {
      return `PT${amount}H`;
    }
    return `PT${amount}M`;
  }
  return draft.schedule_expr.trim();
}

function officialScheduledGraphJobDescription(purpose: string): string {
  if (purpose === "buddy_message_retrieval_ingestion") {
    return translate("scheduler.officialPurposeBuddyMessageIngestion");
  }
  if (purpose === "buddy_autonomous_review") {
    return translate("scheduler.officialPurposeBuddyAutonomousReview");
  }
  if (purpose === "embedding_maintenance") {
    return translate("scheduler.officialPurposeEmbeddingMaintenance");
  }
  return translate("scheduler.triggerProfileFallback");
}

function buildInputBindings(draft: ScheduledGraphJobDraft): Record<string, unknown> {
  const bindings: Record<string, unknown> = {};
  for (const [stateKey, value] of Object.entries(draft.input_values)) {
    const type = draft.input_types[stateKey] || "text";
    const parsedValue = parseInputDraftValue(type, value, stateKey);
    if (!deepEqual(parsedValue, draft.input_defaults[stateKey])) {
      bindings[stateKey] = parsedValue;
    }
  }
  return bindings;
}

function buildMessageOutletTarget(draft: ScheduledGraphJobDraft): Record<string, unknown> {
  if (draft.delivery_outlet === "none") {
    return {};
  }
  const sessionMode = draft.delivery_session_mode || "existing_session";
  const target: ScheduledMessageOutletTarget = {
    kind: "message_outlet",
    outlet: draft.delivery_outlet,
    session_mode: sessionMode,
  };
  const displayName = draft.external_display_name.trim();
  if (draft.delivery_outlet === "buddy") {
    if (sessionMode === "existing_session") {
      const buddySessionId = draft.buddy_session_id.trim();
      if (!buddySessionId) {
        throw new Error(translate("scheduler.buddySessionRequired"));
      }
      target.buddy_session_id = buddySessionId;
    } else if (displayName) {
      target.display_name = displayName;
      target.title = displayName;
    }
    return target;
  }

  if (sessionMode === "existing_session") {
    const platformSessionId = draft.platform_session_id.trim();
    if (!platformSessionId) {
      throw new Error(translate("scheduler.platformSessionRequired"));
    }
    target.platform_session_id = platformSessionId;
    return target;
  }

  const bindingId = draft.message_platform_binding_id.trim();
  const externalChatId = draft.external_chat_id.trim();
  if (!bindingId || !externalChatId) {
    throw new Error(translate("scheduler.platformTargetRequired"));
  }
  target.binding_id = bindingId;
  target.external_chat_id = externalChatId;
  const externalThreadId = draft.external_thread_id.trim();
  if (externalThreadId) {
    target.external_thread_id = externalThreadId;
  }
  target.external_chat_type = draft.external_chat_type.trim() || "group";
  if (displayName) {
    target.display_name = displayName;
  }
  return target;
}

function intervalSeconds(value: string): number | null {
  const normalized = value.trim();
  const shortMatch = normalized.match(/^(\d+)([smhd])$/i);
  if (shortMatch) {
    const amount = Number(shortMatch[1]);
    const unit = shortMatch[2].toLowerCase();
    if (unit === "d") return amount * 86_400;
    if (unit === "h") return amount * 3600;
    if (unit === "m") return amount * 60;
    return amount;
  }
  const isoMatch = normalized.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!isoMatch) {
    return null;
  }
  const days = Number(isoMatch[1] || 0);
  const hours = Number(isoMatch[2] || 0);
  const minutes = Number(isoMatch[3] || 0);
  const seconds = Number(isoMatch[4] || 0);
  const total = days * 86_400 + hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

function intervalControlsFromExpression(value: string): { amount: number; unit: ScheduledIntervalUnit } {
  const seconds = intervalSeconds(value);
  if (!seconds) {
    return { amount: 1, unit: "days" };
  }
  if (seconds % 86_400 === 0) {
    return { amount: Math.max(1, seconds / 86_400), unit: "days" };
  }
  if (seconds % 3600 === 0) {
    return { amount: Math.max(1, seconds / 3600), unit: "hours" };
  }
  return { amount: Math.max(1, Math.round(seconds / 60)), unit: "minutes" };
}

function listTemplateInputFields(template: TemplateRecord): Array<{
  node_id: string;
  state_key: string;
  label: string;
  description: string;
  type: string;
  default_value: unknown;
  presentation: InputValuePresentation | null;
}> {
  return Object.entries(template.nodes)
    .filter((entry) => entry[1].kind === "input")
    .map(([nodeId, node]) => {
      if (node.kind !== "input") {
        return null;
      }
      const stateKey = node.writes[0]?.state || "";
      if (!stateKey) {
        return null;
      }
      const state = template.state_schema[stateKey];
      if (!state) {
        return null;
      }
      return {
        node_id: nodeId,
        state_key: stateKey,
        label: node.name || state.name || stateKey,
        description: node.description || state.description || "",
        type: String(state.type || "text"),
        default_value: cloneValue(state.value),
        presentation: cloneValue(node.config.valuePresentation ?? null),
      };
    })
    .filter((field): field is NonNullable<typeof field> => field !== null);
}

function buildInputDraftState(
  template: TemplateRecord | null,
  inputBindings: Record<string, unknown>,
): {
  values: Record<string, ScheduledInputDraftValue>;
  defaults: Record<string, unknown>;
  types: Record<string, string>;
  presentations: Record<string, InputValuePresentation | null>;
} {
  const values: Record<string, ScheduledInputDraftValue> = {};
  const defaults: Record<string, unknown> = {};
  const types: Record<string, string> = {};
  const presentations: Record<string, InputValuePresentation | null> = {};
  for (const field of template ? listTemplateInputFields(template) : []) {
    const nextValue = Object.prototype.hasOwnProperty.call(inputBindings, field.state_key)
      ? inputBindings[field.state_key]
      : field.default_value;
    defaults[field.state_key] = cloneValue(field.default_value);
    types[field.state_key] = field.type;
    presentations[field.state_key] = cloneValue(field.presentation);
    values[field.state_key] = formatInputDraftValue(field.type, nextValue, field.presentation);
  }
  return { values, defaults, types, presentations };
}

function formatInputDraftValue(
  type: string,
  value: unknown,
  presentation: InputValuePresentation | null = null,
): ScheduledInputDraftValue {
  if (type === "boolean") {
    return Boolean(value);
  }
  if (presentation?.control === "object" && isRecord(value)) {
    return cloneValue(value);
  }
  if (type === "json" || type === "capability" || type === "result_package") {
    return typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? String(value) : String(value ?? 0);
  }
  return typeof value === "string" ? value : String(value ?? "");
}

function parseInputDraftValue(type: string, value: ScheduledInputDraftValue, label: string): unknown {
  if (type === "boolean") {
    return Boolean(value);
  }
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(translate("scheduler.invalidNumberInput", { label }));
    }
    return parsed;
  }
  if (type === "json" || type === "capability" || type === "result_package") {
    if (typeof value !== "string") {
      return cloneValue(value);
    }
    try {
      return JSON.parse(String(value || "null")) as unknown;
    } catch {
      throw new Error(translate("scheduler.invalidRunInputJson", { label }));
    }
  }
  return String(value ?? "");
}

function cloneValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeMessageOutlet(value: unknown): ScheduledMessageOutletKind {
  if (value === "buddy" || value === "feishu" || value === "telegram") {
    return value;
  }
  return "none";
}

function normalizeSessionMode(value: unknown): ScheduledMessageOutletSessionMode {
  if (value === "create_session" || value === "new_session_per_run") {
    return value;
  }
  return "existing_session";
}

function compareStableText(left: string, right: string): number {
  const leftKey = left.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const rightKey = right.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (leftKey < rightKey) {
    return -1;
  }
  if (leftKey > rightKey) {
    return 1;
  }
  return left.localeCompare(right);
}
