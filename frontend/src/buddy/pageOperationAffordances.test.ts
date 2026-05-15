import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPageOperationBook,
  formatPageOperationBookLines,
  normalizePageAffordance,
} from "./pageOperationAffordances.ts";

test("normalizePageAffordance keeps safe navigation commands", () => {
  const affordance = normalizePageAffordance({
    id: "app.nav.runs",
    label: "运行历史",
    role: "navigation-link",
    zone: "app-shell",
    actions: ["click"],
    enabled: true,
    visible: true,
    pathAfterClick: "/runs",
  });

  assert.deepEqual(affordance, {
    id: "app.nav.runs",
    label: "运行历史",
    role: "navigation-link",
    zone: "app-shell",
    actions: ["click"],
    enabled: true,
    visible: true,
    current: false,
    pathAfterClick: "/runs",
    input: null,
    safety: {
      selfSurface: false,
      requiresConfirmation: false,
      destructive: false,
    },
  });
});

test("buildPageOperationBook filters buddy self surfaces and disabled targets", () => {
  const book = buildPageOperationBook({
    snapshotId: "snapshot-1",
    path: "/editor",
    title: "图编辑器",
    affordances: [
      {
        id: "app.nav.runs",
        label: "运行历史",
        role: "navigation-link",
        zone: "app-shell",
        actions: ["click"],
        enabled: true,
        visible: true,
        pathAfterClick: "/runs",
      },
      {
        id: "app.nav.buddy",
        label: "伙伴",
        role: "navigation-link",
        zone: "buddy-page",
        actions: ["click"],
        enabled: true,
        visible: true,
        safety: { selfSurface: true },
      },
      {
        id: "settings.disabled",
        label: "不可用按钮",
        role: "button",
        zone: "settings",
        actions: ["click"],
        enabled: false,
        visible: true,
      },
    ],
  });

  assert.deepEqual(book.allowedOperations.map((item) => item.targetId), ["app.nav.runs"]);
  assert.deepEqual(book.unavailable.map((item) => item.targetId), ["settings.disabled"]);
  assert.match(book.forbidden.join("\n"), /伙伴页面、伙伴浮窗、伙伴形象/);
});

test("formatPageOperationBookLines renders commands without selectors or coordinates", () => {
  const lines = formatPageOperationBookLines(
    buildPageOperationBook({
      snapshotId: "snapshot-2",
      path: "/settings",
      title: "设置",
      affordances: [
        {
          id: "settings.modelProviders.local.baseUrl",
          label: "本地网关地址",
          role: "textbox",
          zone: "settings",
          actions: ["focus", "clear", "type", "press"],
          enabled: true,
          visible: true,
          input: { kind: "text", maxLength: 300, valuePreview: "http://127.0.0.1:8888/v1" },
        },
      ],
    }),
  );

  const text = lines.join("\n");
  assert.match(text, /页面操作书:/);
  assert.match(text, /settings\.modelProviders\.local\.baseUrl/);
  assert.match(text, /commands: focus settings\.modelProviders\.local\.baseUrl/);
  assert.match(text, /type settings\.modelProviders\.local\.baseUrl <text>/);
  assert.doesNotMatch(text, /querySelector|selector|x:|y:/i);
});
