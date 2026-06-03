import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFutureMessagePlatformRows,
  buildMessagePlatformRows,
  buildPrimaryMessagePlatformRows,
  resolvePlatformStatusTone,
} from "./messagePlatformsPageModel.ts";

test("message platform model merges catalog, bindings, and statuses", () => {
  const rows = buildMessagePlatformRows({
    platforms: [
      {
        platform_id: "telegram",
        display_name: "Telegram",
        support_level: "supported",
        capabilities: { text: true },
        config_schema: "telegram_bot_v1",
      },
      {
        platform_id: "discord",
        display_name: "Discord",
        support_level: "planned",
        capabilities: { text: true },
        config_schema: "",
      },
    ],
    bindings: [
      {
        binding_id: "mpb_telegram",
        platform_id: "telegram",
        display_name: "Personal Telegram",
        enabled: true,
        configured: true,
        config: {},
        secret_summary: {},
        created_at: "",
        updated_at: "",
      },
    ],
    statuses: [
      {
        binding_id: "mpb_telegram",
        status: "connected",
        last_connected_at: "",
        last_disconnected_at: "",
        last_event_at: "2026-05-27T10:00:00Z",
        last_delivery_at: "",
        last_error_code: "",
        last_error_message: "",
        retry_count: 0,
        updated_at: "",
      },
    ],
  });

  assert.equal(rows[0].platformId, "telegram");
  assert.equal(rows[0].statusLabel, "已连接");
  assert.equal(rows[0].canConfigure, true);
  assert.equal(rows[1].statusLabel, "计划支持");
  assert.equal(rows[1].canConfigure, false);
});

test("status tone maps error and connected states", () => {
  assert.equal(resolvePlatformStatusTone("connected"), "success");
  assert.equal(resolvePlatformStatusTone("error"), "danger");
  assert.equal(resolvePlatformStatusTone("not_configured"), "muted");
});

test("message platform model accepts localized status labels", () => {
  const rows = buildMessagePlatformRows({
    platforms: [
      {
        platform_id: "telegram",
        display_name: "Telegram",
        support_level: "supported",
        capabilities: { text: true },
        config_schema: "telegram_bot_v1",
      },
    ],
    bindings: [],
    statuses: [],
    formatStatusLabel: (_supportLevel, status) => `localized:${status}`,
  });

  assert.equal(rows[0].statusLabel, "localized:not_configured");
});

test("message platform model keeps Feishu as the only primary module and lists others as future support", () => {
  const rows = buildMessagePlatformRows({
    platforms: [
      {
        platform_id: "telegram",
        display_name: "Telegram",
        support_level: "supported",
        capabilities: { text: true },
        config_schema: "telegram_bot_v1",
      },
      {
        platform_id: "feishu",
        display_name: "Feishu/Lark",
        support_level: "supported",
        capabilities: { text: true },
        config_schema: "feishu_v1",
      },
      {
        platform_id: "discord",
        display_name: "Discord",
        support_level: "planned",
        capabilities: { text: true },
        config_schema: "",
      },
    ],
    bindings: [],
    statuses: [],
  });

  assert.deepEqual(
    buildPrimaryMessagePlatformRows(rows).map((row) => row.platformId),
    ["feishu"],
  );
  assert.deepEqual(
    buildFutureMessagePlatformRows(rows).map((row) => row.displayName),
    ["Telegram", "Discord"],
  );
});
