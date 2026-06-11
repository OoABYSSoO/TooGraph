import assert from "node:assert/strict";
import test from "node:test";

import type { TemplateRecord } from "@/types/node-system";
import type { ScheduledGraphJob, ScheduledGraphJobRun } from "@/types/scheduler";

import {
  buildDefaultScheduledGraphJobDraft,
  buildScheduledGraphJobInputRows,
  buildScheduledGraphJobDraftFromJob,
  buildScheduledGraphJobPayload,
  buildSchedulerOverview,
  buildScheduledGraphJobTriggerProfile,
  canEditScheduledGraphJobTemplate,
  formatSchedule,
  sortScheduledGraphJobRuns,
  sortScheduledGraphJobs,
} from "./schedulerPageModel.ts";

test("buildSchedulerOverview summarizes total, enabled, disabled, and official jobs", () => {
  const jobs = [
    createJob("official_embedding_maintenance", true, "official_seed"),
    createJob("user_job", false, "user"),
  ];

  assert.deepEqual(buildSchedulerOverview(jobs), [
    { key: "total", label: "全部任务", value: 2 },
    { key: "enabled", label: "已启用", value: 1 },
    { key: "disabled", label: "已停用", value: 1 },
    { key: "official", label: "官方任务", value: 1 },
  ]);
});

test("canEditScheduledGraphJobTemplate locks official jobs to their seeded template", () => {
  assert.equal(canEditScheduledGraphJobTemplate(createJob("official_seed_job", false, "official_seed")), false);
  assert.equal(canEditScheduledGraphJobTemplate(createJob("official_job", true, "official")), false);
  assert.equal(canEditScheduledGraphJobTemplate(createJob("user_job", true, "user")), true);
});

test("formatSchedule renders common interval expressions", () => {
  assert.equal(formatSchedule({ schedule_kind: "interval", schedule_expr: "PT168H" }), "每 7 天");
  assert.equal(formatSchedule({ schedule_kind: "interval", schedule_expr: "PT1H" }), "每 1 小时");
  assert.equal(formatSchedule({ schedule_kind: "interval", schedule_expr: "30m" }), "每 30 分钟");
  assert.equal(formatSchedule({ schedule_kind: "manual", schedule_expr: "" }), "手动");
  assert.equal(formatSchedule({ schedule_kind: "event", schedule_expr: "buddy.message.created" }), "事件：buddy.message.created");
});

test("buildScheduledGraphJobTriggerProfile explains official memory and embedding background tasks", () => {
  const messageIngestion = {
    ...createJob("official_buddy_message_retrieval_ingestion", false, "official_seed"),
    schedule_kind: "event",
    schedule_expr: "buddy.message.created",
    metadata: { source: "official_seed", purpose: "buddy_message_retrieval_ingestion" },
  };
  const memoryReview = {
    ...createJob("official_buddy_autonomous_review", false, "official_seed"),
    metadata: { source: "official_seed", purpose: "buddy_autonomous_review" },
  };
  const embeddingMaintenance = {
    ...createJob("official_embedding_maintenance", false, "official_seed"),
    metadata: { source: "official_seed", purpose: "embedding_queue_maintenance" },
  };
  const memoryEmbeddingDrain = {
    ...createJob("official_memory_embedding_drain", false, "official_seed"),
    schedule_kind: "event",
    schedule_expr: "memory.embedding.queued",
    metadata: { source: "official_seed", purpose: "memory_embedding_drain" },
  };
  const knowledgeEmbeddingDrain = {
    ...createJob("official_knowledge_embedding_drain", false, "official_seed"),
    schedule_kind: "event",
    schedule_expr: "knowledge.ingestion.completed",
    metadata: { source: "official_seed", purpose: "knowledge_embedding_drain" },
  };

  assert.equal(buildScheduledGraphJobTriggerProfile(messageIngestion).modeLabel, "事件触发");
  assert.match(buildScheduledGraphJobTriggerProfile(messageIngestion).description, /Buddy 消息/);
  assert.equal(buildScheduledGraphJobTriggerProfile(memoryReview).modeLabel, "间隔触发");
  assert.match(buildScheduledGraphJobTriggerProfile(memoryReview).description, /复盘/);
  assert.equal(buildScheduledGraphJobTriggerProfile(embeddingMaintenance).modeLabel, "间隔触发");
  assert.match(buildScheduledGraphJobTriggerProfile(embeddingMaintenance).description, /维护 embedding 队列/);
  assert.equal(buildScheduledGraphJobTriggerProfile(memoryEmbeddingDrain).modeLabel, "事件触发");
  assert.match(buildScheduledGraphJobTriggerProfile(memoryEmbeddingDrain).description, /记忆/);
  assert.equal(buildScheduledGraphJobTriggerProfile(knowledgeEmbeddingDrain).modeLabel, "事件触发");
  assert.match(buildScheduledGraphJobTriggerProfile(knowledgeEmbeddingDrain).description, /知识库/);
});

test("sortScheduledGraphJobs keeps enabled jobs first and then template order", () => {
  const jobs = [
    createJob("z_disabled", false, "user"),
    createJob("a_enabled", true, "user"),
    { ...createJob("b_enabled", true, "user"), template_id: "aaa_template" },
  ];

  assert.deepEqual(sortScheduledGraphJobs(jobs).map((job) => job.job_id), ["b_enabled", "a_enabled", "z_disabled"]);
});

test("sortScheduledGraphJobRuns orders newest run history first", () => {
  const runs = [
    createJobRun("run_old", "2026-05-27T00:00:00Z"),
    createJobRun("run_new", "2026-05-27T01:00:00Z"),
  ];

  assert.deepEqual(sortScheduledGraphJobRuns(runs).map((run) => run.job_run_id), ["run_new", "run_old"]);
});

test("buildScheduledGraphJobPayload parses input bindings and normalizes manual schedules", () => {
  assert.deepEqual(
    buildScheduledGraphJobPayload({
      ...buildDefaultScheduledGraphJobDraft("template_1", createInputTemplate()),
      name: " Daily job ",
      schedule_kind: "manual",
      input_values: {
        prompt: "run",
        count: "3",
        enabled_flag: false,
        filters: '{ "tag": "design" }',
      },
      delivery_outlet: "buddy",
      delivery_session_mode: "existing_session",
      buddy_session_id: "buddy_session_1",
      enabled: true,
    }),
    {
      name: "Daily job",
      template_id: "template_1",
      input_bindings: {
        prompt: "run",
        count: 3,
        enabled_flag: false,
        filters: { tag: "design" },
      },
      delivery_target: {
        kind: "message_outlet",
        outlet: "buddy",
        session_mode: "existing_session",
        buddy_session_id: "buddy_session_1",
      },
      schedule_kind: "manual",
      schedule_expr: "",
      timezone: "UTC",
      enabled: true,
      metadata: { source: "user" },
    },
  );
});

test("buildScheduledGraphJobPayload omits template default input values", () => {
  const payload = buildScheduledGraphJobPayload({
    ...buildDefaultScheduledGraphJobDraft("template_1", createInputTemplate()),
    input_values: {
      prompt: "默认问题",
      count: "2",
      enabled_flag: true,
      filters: '{\n  "tag": "default"\n}',
    },
  });

  assert.deepEqual(payload.input_bindings, {});
});

test("buildScheduledGraphJobInputRows lists template input nodes with defaults and overrides", () => {
  const draft = buildDefaultScheduledGraphJobDraft("template_1", createInputTemplate(), {
    prompt: "覆盖问题",
    count: 5,
  });

  assert.deepEqual(
    buildScheduledGraphJobInputRows(createInputTemplate(), draft).map((row) => ({
      state_key: row.state_key,
      label: row.label,
      type: row.type,
      value: row.value,
      default_value: row.default_value,
      changed: row.changed,
    })),
    [
      {
        state_key: "prompt",
        label: "任务问题",
        type: "text",
        value: "覆盖问题",
        default_value: "默认问题",
        changed: true,
      },
      {
        state_key: "count",
        label: "循环次数",
        type: "number",
        value: "5",
        default_value: 2,
        changed: true,
      },
      {
        state_key: "enabled_flag",
        label: "启用增强",
        type: "boolean",
        value: true,
        default_value: true,
        changed: false,
      },
      {
        state_key: "filters",
        label: "过滤条件",
        type: "json",
        value: '{\n  "tag": "default"\n}',
        default_value: { tag: "default" },
        changed: false,
      },
    ],
  );
});

test("buildScheduledGraphJobInputRows preserves input value presentation metadata", () => {
  const template = createInputTemplate();
  template.state_schema.source_kind = {
    name: "Source Kind",
    description: "Source category.",
    type: "text",
    value: "buddy_messages",
    color: "#d97706",
  };
  template.state_schema.limits = {
    name: "Limits",
    description: "Chunking limits.",
    type: "json",
    value: { max_chars: 700, max_turns_per_chunk: 2 },
    color: "#10b981",
  };
  template.nodes.input_source_kind = {
    kind: "input",
    name: "Source Kind",
    description: "Source category.",
    ui: { position: { x: 0, y: 0 } },
    reads: [],
    writes: [{ state: "source_kind", mode: "replace" }],
    config: {
      value: "buddy_messages",
      boundaryType: "text",
      valuePresentation: {
        control: "select",
        default: "buddy_messages",
        options: [
          { label: "Chat history", value: "buddy_messages" },
          { label: "Knowledge documents", value: "normalized_documents" },
        ],
      },
    },
  };
  template.nodes.input_limits = {
    kind: "input",
    name: "Limits",
    description: "Chunking limits.",
    ui: { position: { x: 0, y: 0 } },
    reads: [],
    writes: [{ state: "limits", mode: "replace" }],
    config: {
      value: { max_chars: 700, max_turns_per_chunk: 2 },
      boundaryType: "text",
      valuePresentation: {
        control: "object",
        default: { max_chars: 700, max_turns_per_chunk: 2 },
        properties: [
          { key: "max_chars", name: "Max chars", valueType: "number", default: 700, min: 200, step: 100 },
          { key: "max_turns_per_chunk", name: "Max turns", valueType: "number", default: 2, min: 1, step: 1 },
        ],
      },
    },
  };

  const draft = buildDefaultScheduledGraphJobDraft("template_1", template);
  const rows = buildScheduledGraphJobInputRows(template, draft);
  const sourceKindRow = rows.find((row) => row.state_key === "source_kind");
  const limitsRow = rows.find((row) => row.state_key === "limits");

  assert.deepEqual(sourceKindRow?.presentation, {
    control: "select",
    default: "buddy_messages",
    options: [
      { label: "Chat history", value: "buddy_messages" },
      { label: "Knowledge documents", value: "normalized_documents" },
    ],
  });
  assert.deepEqual(limitsRow?.value, { max_chars: 700, max_turns_per_chunk: 2 });
  assert.deepEqual(limitsRow?.presentation?.properties?.map((property) => property.key), ["max_chars", "max_turns_per_chunk"]);

  draft.input_values.limits = { max_chars: 900, max_turns_per_chunk: 3 };
  const payload = buildScheduledGraphJobPayload(draft);
  assert.deepEqual(payload.input_bindings.limits, { max_chars: 900, max_turns_per_chunk: 3 });
});

test("buildScheduledGraphJobDraftFromJob converts interval expressions to human fields", () => {
  const draft = buildScheduledGraphJobDraftFromJob(
    {
      ...createJob("job_1", true, "user"),
      template_id: "template_1",
      schedule_kind: "interval",
      schedule_expr: "PT168H",
    },
    createInputTemplate(),
  );

  assert.equal(draft.schedule_kind, "interval");
  assert.equal(draft.interval_amount, 7);
  assert.equal(draft.interval_unit, "days");
});

test("buildScheduledGraphJobPayload converts human interval controls to schedule expression", () => {
  const payload = buildScheduledGraphJobPayload({
    ...buildDefaultScheduledGraphJobDraft("template_1", createInputTemplate()),
    schedule_kind: "interval",
    interval_amount: 30,
    interval_unit: "minutes",
  });

  assert.equal(payload.schedule_expr, "PT30M");
});

test("buildScheduledGraphJobPayload keeps event trigger names explicit", () => {
  const payload = buildScheduledGraphJobPayload({
    ...buildDefaultScheduledGraphJobDraft("template_1", createInputTemplate()),
    schedule_kind: "event",
    schedule_expr: "buddy.message.created",
  });

  assert.equal(payload.schedule_kind, "event");
  assert.equal(payload.schedule_expr, "buddy.message.created");
});

test("buildScheduledGraphJobPayload maps platform message outlet fields", () => {
  const payload = buildScheduledGraphJobPayload({
    ...buildDefaultScheduledGraphJobDraft("template_1", createInputTemplate()),
    name: "Feishu daily report",
    delivery_outlet: "feishu",
    delivery_session_mode: "create_session",
    message_platform_binding_id: "mpb_feishu",
    external_chat_id: "oc_chat",
    external_thread_id: "thread_1",
    external_chat_type: "group",
    external_display_name: "设计群",
  });

  assert.deepEqual(payload.delivery_target, {
    kind: "message_outlet",
    outlet: "feishu",
    session_mode: "create_session",
    binding_id: "mpb_feishu",
    external_chat_id: "oc_chat",
    external_thread_id: "thread_1",
    external_chat_type: "group",
    display_name: "设计群",
  });
});

test("buildScheduledGraphJobDraftFromJob hydrates editable message outlet fields", () => {
  const draft = buildScheduledGraphJobDraftFromJob({
    ...createJob("job_1", true, "user"),
    name: "Telegram digest",
    template_id: "template_digest",
    schedule_kind: "cron",
    schedule_expr: "0 9 * * *",
    timezone: "Asia/Shanghai",
    input_bindings: { topic: "design" },
    delivery_target: {
      kind: "message_outlet",
      outlet: "telegram",
      session_mode: "existing_session",
      platform_session_id: "mps_telegram",
    },
  }, createInputTemplate());

  assert.equal(draft.name, "Telegram digest");
  assert.equal(draft.template_id, "template_digest");
  assert.equal(draft.schedule_kind, "cron");
  assert.equal(draft.schedule_expr, "0 9 * * *");
  assert.equal(draft.timezone, "Asia/Shanghai");
  assert.equal(draft.input_values.topic, undefined);
  assert.equal(draft.delivery_outlet, "telegram");
  assert.equal(draft.delivery_session_mode, "existing_session");
  assert.equal(draft.platform_session_id, "mps_telegram");
});

test("buildScheduledGraphJobPayload rejects non-object JSON input bindings", () => {
  assert.throws(
    () =>
      buildScheduledGraphJobPayload({
        ...buildDefaultScheduledGraphJobDraft("template_1"),
        input_values: { filters: "{" },
        input_types: { filters: "json" },
      }),
    /运行输入不是有效 JSON/,
  );
});

test("buildScheduledGraphJobPayload rejects missing existing Buddy session for message outlet", () => {
  assert.throws(
    () =>
      buildScheduledGraphJobPayload({
        ...buildDefaultScheduledGraphJobDraft("template_1"),
        delivery_outlet: "buddy",
        delivery_session_mode: "existing_session",
      }),
    /请选择 Buddy 会话/,
  );
});

function createJob(jobId: string, enabled: boolean, source: string): ScheduledGraphJob {
  return {
    job_id: jobId,
    name: jobId,
    template_id: jobId,
    input_bindings: {},
    schedule_kind: "interval",
    schedule_expr: "PT1H",
    timezone: "UTC",
    enabled,
    last_run_id: "",
    next_run_at: "",
    runtime_overrides: {},
    delivery_target: {},
    retry_policy: {},
    metadata: { source },
    created_at: "2026-05-27T00:00:00Z",
    updated_at: "2026-05-27T00:00:00Z",
  };
}

function createInputTemplate(): TemplateRecord {
  return {
    template_id: "template_1",
    label: "输入模板",
    description: "",
    default_graph_name: "输入模板",
    state_schema: {
      prompt: {
        name: "任务问题",
        description: "要定时处理的问题",
        type: "text",
        value: "默认问题",
        color: "#2563eb",
      },
      count: {
        name: "循环次数",
        description: "",
        type: "number",
        value: 2,
        color: "#2563eb",
      },
      enabled_flag: {
        name: "启用增强",
        description: "",
        type: "boolean",
        value: true,
        color: "#2563eb",
      },
      filters: {
        name: "过滤条件",
        description: "",
        type: "json",
        value: { tag: "default" },
        color: "#2563eb",
      },
    },
    nodes: {
      input_prompt: {
        kind: "input",
        name: "任务问题",
        description: "要定时处理的问题",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "prompt", mode: "replace" }],
        config: { value: "默认问题", boundaryType: "text" },
      },
      input_count: {
        kind: "input",
        name: "循环次数",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "count", mode: "replace" }],
        config: { value: 2, boundaryType: "text" },
      },
      input_enabled: {
        kind: "input",
        name: "启用增强",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "enabled_flag", mode: "replace" }],
        config: { value: true, boundaryType: "text" },
      },
      input_filters: {
        kind: "input",
        name: "过滤条件",
        description: "",
        ui: { position: { x: 0, y: 0 } },
        reads: [],
        writes: [{ state: "filters", mode: "replace" }],
        config: { value: { tag: "default" }, boundaryType: "text" },
      },
    },
    edges: [],
    conditional_edges: [],
    metadata: {},
  };
}

function createJobRun(jobRunId: string, createdAt: string): ScheduledGraphJobRun {
  return {
    job_run_id: jobRunId,
    job_id: "job_1",
    run_id: jobRunId,
    trigger_reason: "manual",
    status: "completed",
    error: "",
    started_at: createdAt,
    completed_at: createdAt,
    metadata: {},
    created_at: createdAt,
    updated_at: createdAt,
  };
}
