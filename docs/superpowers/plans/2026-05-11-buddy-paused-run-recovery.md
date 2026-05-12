# Buddy Paused Run Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover a Buddy `awaiting_human` pause card after page refresh or chat-session reload so the user can continue, deny, or cancel the same graph run.

**Architecture:** Persist a non-context assistant placeholder with the paused run id when Buddy reaches `awaiting_human`. On chat-session activation, find the latest assistant message with a run id, fetch that run through the existing Runs API, and rebuild the standard pause card only if the run is still `awaiting_human`. Use a session activation generation guard so slow recovery requests cannot attach a paused run to the wrong session.

**Tech Stack:** Vue 3 Composition API, Element Plus Buddy floating window, existing `/api/runs/{run_id}` fetch API, `node:test` frontend tests, current Buddy chat session storage.

---

## File Structure

- Create `frontend/src/buddy/buddyPausedRunRecovery.ts`: pure recovery selection helpers with no Vue dependency.
- Create `frontend/src/buddy/buddyPausedRunRecovery.test.ts`: behavior tests for selecting recoverable assistant messages and status gating.
- Modify `frontend/src/buddy/BuddyWidget.vue`: persist pause placeholders, recover paused runs during session activation, and guard stale recovery requests.
- Modify `frontend/src/buddy/BuddyWidget.structure.test.ts`: structural safety tests for the Widget integration.
- Modify `frontend/src/i18n/messages.ts`: Chinese and English text for persisted paused placeholders and recovery errors.
- Modify `docs/current_project_status.md`: move “刷新后找回” from remaining Buddy pause gaps into the current baseline after implementation.
- Modify `docs/future/buddy-autonomous-agent-roadmap.md`: remove “刷新后找回” from the highest-priority remaining Buddy pause gap after implementation.

## Current Constraints

- Do not introduce a second Buddy runtime or a hidden agent loop.
- Keep recovery on the standard `awaiting_human` run path and reuse `handleBuddyRunAwaitingHuman`.
- Do not recover terminal runs into pause cards. `completed`, `failed`, and `cancelled` runs remain normal history messages.
- Recovered pause placeholder messages must use `includeInContext: false`.
- Do not start background autonomous review while recovering a paused run; autonomous review belongs only to completed visible runs.

### Task 1: Pure Recovery Helper

**Files:**
- Create: `frontend/src/buddy/buddyPausedRunRecovery.ts`
- Test: `frontend/src/buddy/buddyPausedRunRecovery.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `frontend/src/buddy/buddyPausedRunRecovery.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  findLatestRecoverablePausedRunMessage,
  isRecoverablePausedRunStatus,
  type BuddyPausedRunRecoveryMessage,
} from "./buddyPausedRunRecovery.ts";

function message(
  id: string,
  role: BuddyPausedRunRecoveryMessage["role"],
  runId?: string | null,
): BuddyPausedRunRecoveryMessage {
  return { id, role, runId };
}

test("findLatestRecoverablePausedRunMessage returns the newest assistant message with a run id", () => {
  const result = findLatestRecoverablePausedRunMessage([
    message("user-1", "user", "run_user"),
    message("assistant-1", "assistant", "run_old"),
    message("assistant-empty", "assistant", " "),
    message("assistant-2", "assistant", "run_new"),
  ]);

  assert.deepEqual(result, { messageId: "assistant-2", runId: "run_new" });
});

test("findLatestRecoverablePausedRunMessage ignores user messages and messages without run ids", () => {
  const result = findLatestRecoverablePausedRunMessage([
    message("user-1", "user", "run_user"),
    message("assistant-1", "assistant", null),
    message("assistant-2", "assistant", ""),
  ]);

  assert.equal(result, null);
});

test("isRecoverablePausedRunStatus only accepts awaiting_human", () => {
  assert.equal(isRecoverablePausedRunStatus("awaiting_human"), true);
  assert.equal(isRecoverablePausedRunStatus("paused"), false);
  assert.equal(isRecoverablePausedRunStatus("completed"), false);
  assert.equal(isRecoverablePausedRunStatus("failed"), false);
  assert.equal(isRecoverablePausedRunStatus("cancelled"), false);
  assert.equal(isRecoverablePausedRunStatus(null), false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test frontend/src/buddy/buddyPausedRunRecovery.test.ts
```

Expected: FAIL because `frontend/src/buddy/buddyPausedRunRecovery.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/buddy/buddyPausedRunRecovery.ts`:

```ts
export type BuddyPausedRunRecoveryMessage = {
  id: string;
  role: "user" | "assistant";
  runId?: string | null;
};

export type BuddyPausedRunRecoveryCandidate = {
  messageId: string;
  runId: string;
};

export function findLatestRecoverablePausedRunMessage(
  messages: readonly BuddyPausedRunRecoveryMessage[],
): BuddyPausedRunRecoveryCandidate | null {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") {
      continue;
    }
    const runId = message.runId?.trim();
    if (runId) {
      return { messageId: message.id, runId };
    }
  }
  return null;
}

export function isRecoverablePausedRunStatus(status: string | null | undefined) {
  return status === "awaiting_human";
}
```

- [ ] **Step 4: Run the helper test and verify it passes**

Run:

```bash
node --test frontend/src/buddy/buddyPausedRunRecovery.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

Run:

```bash
git add frontend/src/buddy/buddyPausedRunRecovery.ts frontend/src/buddy/buddyPausedRunRecovery.test.ts
git commit -m "新增伙伴暂停运行恢复辅助"
```

### Task 2: Persist Paused Run Placeholders

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/buddy/BuddyWidget.structure.test.ts`
- Modify: `frontend/src/i18n/messages.ts`

- [ ] **Step 1: Write the failing structure test**

Add this test near the existing pause-card tests in `frontend/src/buddy/BuddyWidget.structure.test.ts`:

```ts
test("BuddyWidget persists awaiting-human paused run placeholders outside model context", () => {
  assert.match(componentSource, /type BuddyPauseHandlingOptions = \{[\s\S]*persist\?: boolean;[\s\S]*\};/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(runDetail,\s*assistantMessage\.id,\s*\{ persist: true \}\)/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(resumedRunDetail,\s*assistantMessageId,\s*\{ persist: true \}\)/);
  assert.match(
    componentSource,
    /updateAssistantMessage\(assistantMessageId,\s*t\("buddy\.pause\.persistedReply"\),\s*\{[\s\S]*includeInContext:\s*false,[\s\S]*runId:\s*run\.run_id/,
  );
  assert.match(
    componentSource,
    /if \(options\.persist && activeSessionId\.value\) \{[\s\S]*persistBuddyMessage\(activeSessionId\.value,[\s\S]*runId:\s*run\.run_id,[\s\S]*includeInContext:\s*false/,
  );
});
```

- [ ] **Step 2: Run the structure test and verify it fails**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: FAIL because pause persistence is not wired yet.

- [ ] **Step 3: Add pause placeholder copy**

In `frontend/src/i18n/messages.ts`, add Chinese keys under `buddy.pause`:

```ts
persistedReply: "这次运行已暂停，请在暂停卡片中继续。",
recoveryFailed: "恢复暂停运行失败：{error}",
```

Add English keys under `buddy.pause`:

```ts
persistedReply: "This run is paused. Continue it in the pause card.",
recoveryFailed: "Failed to recover paused run: {error}",
```

- [ ] **Step 4: Update Buddy pause handling**

In `frontend/src/buddy/BuddyWidget.vue`, add this type near `BuddyQueuedTurn`:

```ts
type BuddyPauseHandlingOptions = {
  persist?: boolean;
};
```

Change both live pause calls:

```ts
handleBuddyRunAwaitingHuman(runDetail, assistantMessage.id, { persist: true });
```

```ts
handleBuddyRunAwaitingHuman(resumedRunDetail, assistantMessageId, { persist: true });
```

Change the handler signature and body:

```ts
function handleBuddyRunAwaitingHuman(
  run: RunDetail,
  assistantMessageId: string,
  options: BuddyPauseHandlingOptions = {},
) {
  pausedBuddyRun.value = run;
  pausedBuddyAssistantMessageId.value = assistantMessageId;
  pausedBuddyDraftsByKey.value = buildPausedBuddyDraftsByKey(run);
  resetPausedBuddyActionState(buildHumanReviewPanelModel(run, run.graph_snapshot as unknown as GraphPayload));
  activeRunId.value = run.run_id;
  mood.value = "thinking";
  setAssistantActivityText(assistantMessageId, t("buddy.pause.activity"));
  appendRunTraceEntry("node.completed", {
    labelKey: "buddy.activity.awaitingApproval",
    params: {},
    preview: "",
    tone: "info",
    replaceKey: "local:awaiting-human",
    timingKey: "local:awaiting-human",
  });
  updateAssistantMessage(assistantMessageId, t("buddy.pause.persistedReply"), {
    includeInContext: false,
    runId: run.run_id,
  });
  if (options.persist && activeSessionId.value) {
    void persistBuddyMessage(activeSessionId.value, messages.value.find((message) => message.id === assistantMessageId), {
      runId: run.run_id,
      includeInContext: false,
    });
  }
}
```

- [ ] **Step 5: Run the structure test and verify it passes**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add frontend/src/buddy/BuddyWidget.vue frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/i18n/messages.ts
git commit -m "持久化伙伴暂停运行占位消息"
```

### Task 3: Recover Pause Card During Session Activation

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.vue`
- Modify: `frontend/src/buddy/BuddyWidget.structure.test.ts`
- Test: `frontend/src/buddy/buddyPausedRunRecovery.test.ts`

- [ ] **Step 1: Write the failing structure test**

Add this test near the existing pause-card tests:

```ts
test("BuddyWidget recovers awaiting-human paused runs after session activation", () => {
  assert.match(
    componentSource,
    /import \{ findLatestRecoverablePausedRunMessage, isRecoverablePausedRunStatus \} from "\.\/buddyPausedRunRecovery\.ts";/,
  );
  assert.match(componentSource, /let chatSessionActivationGeneration = 0;/);
  assert.match(componentSource, /const activationGeneration = \+\+chatSessionActivationGeneration;/);
  assert.match(componentSource, /await recoverPausedBuddyRunFromLoadedMessages\(sessionId,\s*activationGeneration\);/);
  assert.match(componentSource, /async function recoverPausedBuddyRunFromLoadedMessages\(sessionId: string, activationGeneration: number\)/);
  assert.match(componentSource, /const candidate = findLatestRecoverablePausedRunMessage\(messages\.value\);/);
  assert.match(componentSource, /const run = await fetchRun\(candidate\.runId\);/);
  assert.match(componentSource, /if \(!isRecoverablePausedRunStatus\(run\.status\)\) \{/);
  assert.match(componentSource, /resetRunTraceForMessage\(candidate\.messageId\);/);
  assert.match(componentSource, /handleBuddyRunAwaitingHuman\(run,\s*candidate\.messageId\);/);
  assert.match(componentSource, /buddy\.pause\.recoveryFailed/);
});
```

- [ ] **Step 2: Run the structure and helper tests and verify failure**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/buddy/buddyPausedRunRecovery.test.ts
```

Expected: FAIL in the structure test because recovery is not wired yet; helper tests still pass.

- [ ] **Step 3: Import the helper and add activation generation**

In `frontend/src/buddy/BuddyWidget.vue`, add:

```ts
import { findLatestRecoverablePausedRunMessage, isRecoverablePausedRunStatus } from "./buddyPausedRunRecovery.ts";
```

Near other module-level mutable variables, add:

```ts
let chatSessionActivationGeneration = 0;
```

- [ ] **Step 4: Wire recovery into session activation**

Update `activateChatSession`:

```ts
async function activateChatSession(sessionId: string, options: { skipInitializationWait?: boolean } = {}) {
  if (isSessionSwitchLocked.value && sessionId !== activeSessionId.value) {
    return;
  }
  if (!options.skipInitializationWait) {
    await waitForChatSessionInitialization();
  }
  const activationGeneration = ++chatSessionActivationGeneration;
  isSessionLoading.value = true;
  errorMessage.value = "";
  try {
    const records = await fetchBuddyChatMessages(sessionId);
    activeSessionId.value = sessionId;
    window.localStorage.setItem(BUDDY_ACTIVE_SESSION_STORAGE_KEY, sessionId);
    messages.value = records.map(messageRecordToBuddyMessage);
    resetNextBuddyMessageClientOrder();
    resetVisibleRunTrace();
    await recoverPausedBuddyRunFromLoadedMessages(sessionId, activationGeneration);
    await scrollMessagesToBottom();
  } catch (error) {
    errorMessage.value = t("buddy.historyLoadFailed", { error: formatErrorMessage(error) });
  } finally {
    isSessionLoading.value = false;
  }
}
```

- [ ] **Step 5: Add recovery functions**

Add below `activateChatSession`:

```ts
function isCurrentChatSessionActivation(sessionId: string, activationGeneration: number) {
  return activeSessionId.value === sessionId && chatSessionActivationGeneration === activationGeneration;
}

async function recoverPausedBuddyRunFromLoadedMessages(sessionId: string, activationGeneration: number) {
  const candidate = findLatestRecoverablePausedRunMessage(messages.value);
  if (!candidate) {
    return;
  }

  try {
    const run = await fetchRun(candidate.runId);
    if (!isCurrentChatSessionActivation(sessionId, activationGeneration)) {
      return;
    }
    if (!isRecoverablePausedRunStatus(run.status)) {
      return;
    }
    resetRunTraceForMessage(candidate.messageId);
    handleBuddyRunAwaitingHuman(run, candidate.messageId);
    await scrollPausedBuddyCardIntoView();
  } catch (error) {
    if (isCurrentChatSessionActivation(sessionId, activationGeneration)) {
      errorMessage.value = t("buddy.pause.recoveryFailed", { error: formatErrorMessage(error) });
    }
  }
}
```

- [ ] **Step 6: Run the structure and helper tests and verify they pass**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/buddy/buddyPausedRunRecovery.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add frontend/src/buddy/BuddyWidget.vue frontend/src/buddy/BuddyWidget.structure.test.ts frontend/src/buddy/buddyPausedRunRecovery.ts frontend/src/buddy/buddyPausedRunRecovery.test.ts
git commit -m "恢复刷新后的伙伴暂停运行"
```

### Task 4: Queue and Session Safety Regression Checks

**Files:**
- Modify: `frontend/src/buddy/BuddyWidget.structure.test.ts`

- [ ] **Step 1: Add regression structure tests**

Add:

```ts
test("BuddyWidget keeps recovered paused runs session-locked and queue-safe", () => {
  assert.match(componentSource, /const isSessionSwitchLocked = computed\([\s\S]*activeRunId\.value !== null/);
  assert.match(componentSource, /const isSessionSwitchLocked = computed\([\s\S]*isActiveTraceUnfinished\(\)/);
  assert.match(componentSource, /if \(pausedBuddyRun\.value\) \{[\s\S]*break;/);
  assert.match(componentSource, /:disabled="Boolean\(pausedBuddyRun\)"/);
  assert.match(componentSource, /if \(pausedBuddyRun\.value\) \{[\s\S]*errorMessage\.value = t\("buddy\.pause\.useCard"\);/);
});
```

- [ ] **Step 2: Run the Buddy structure test**

Run:

```bash
node --test frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add frontend/src/buddy/BuddyWidget.structure.test.ts
git commit -m "锁定伙伴暂停恢复队列行为"
```

### Task 5: Documentation Snapshot

**Files:**
- Modify: `docs/current_project_status.md`
- Modify: `docs/future/buddy-autonomous-agent-roadmap.md`

- [ ] **Step 1: Update current project status**

In `docs/current_project_status.md`, replace the Buddy floating-window baseline sentence that currently says “后续重点是伙伴页面运行与确认视图、拒绝/取消/刷新找回、暂停队列策略细化和 Buddy Home 写回流程。” with:

```md
浮窗已把 `awaiting_human` 展示为暂停卡片，支持必填 state 草稿、卡片内单一续跑操作区、拒绝待审批能力、取消暂停中的整轮 run、刷新或重新打开会话后找回仍在 `awaiting_human` 的暂停 run，并在卡片中先展示当前产物/上下文再展示需要补充的信息；底部输入在暂停时只提示回到卡片。后续重点是伙伴页面运行与确认视图、暂停期间队列策略细化和 Buddy Home 写回流程。
```

- [ ] **Step 2: Update roadmap remaining gap**

In `docs/future/buddy-autonomous-agent-roadmap.md`, replace the remaining gap bullet that includes “暂停卡片仍需补齐拒绝、取消、刷新后找回和更细的队列策略。” with:

```md
- 暂停卡片仍需补齐更细的队列策略，并把同一套确认/拒绝/取消/恢复体验扩展到伙伴页面运行视图。
```

- [ ] **Step 3: Verify the wording**

Run:

```bash
rg -n "拒绝、取消、刷新后找回|刷新找回|刷新后找回" docs/current_project_status.md docs/future/buddy-autonomous-agent-roadmap.md
```

Expected: no matches for stale remaining-gap phrasing.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/current_project_status.md docs/future/buddy-autonomous-agent-roadmap.md
git commit -m "更新伙伴暂停恢复状态文档"
```

### Task 6: Final Verification and Push

**Files:**
- No source changes in this task.

- [ ] **Step 1: Run targeted frontend tests**

Run:

```bash
node --test frontend/src/buddy/buddyPausedRunRecovery.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run broader Buddy-adjacent frontend tests**

Run:

```bash
node --test frontend/src/api/runs.test.ts frontend/src/buddy/buddyChatGraph.test.ts frontend/src/buddy/buddyPageContext.test.ts frontend/src/buddy/BuddyWidget.structure.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the frontend build**

Run:

```bash
npm run build
```

from `frontend/`.

Expected: `vue-tsc --noEmit` and `vite build` both exit 0.

- [ ] **Step 4: Restart TooGraph**

Run:

```bash
npm start
```

from the repository root.

Expected: TooGraph starts on `http://127.0.0.1:3477`.

- [ ] **Step 5: Check health**

Run:

```bash
curl -fsS http://127.0.0.1:3477/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 6: Push all commits**

Run:

```bash
git push
```

Expected: the branch pushes to `origin/main`.

## Self-Review

- Spec coverage: the plan covers persistence of paused assistant placeholders, reload/session recovery, stale request protection, queue/session safety checks, docs updates, verification, restart, and push.
- Placeholder scan: checked the forbidden placeholder patterns from the skill instructions; the plan contains none.
- Type consistency: the plan consistently uses `BuddyPausedRunRecoveryMessage`, `BuddyPausedRunRecoveryCandidate`, `findLatestRecoverablePausedRunMessage`, `isRecoverablePausedRunStatus`, `BuddyPauseHandlingOptions`, and `chatSessionActivationGeneration`.
