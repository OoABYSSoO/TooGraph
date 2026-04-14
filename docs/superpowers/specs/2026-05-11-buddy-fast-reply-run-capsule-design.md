# Buddy Fast Reply And Run Capsule Design

## Goal

Make Buddy feel conversational while preserving TooGraph's graph-first runtime. Each user turn should show a quick Buddy reply early, keep the run activity attached to that same reply, allow pause/resume inside one dialog, and continue long runs without a fixed frontend duration limit.

## Current Problem

The current `buddy_autonomous_loop` produces a single `final_reply` near the end of the graph. If the capability loop is slow, Buddy appears silent until the final response node runs. The frontend also stores run trace as global widget state, so only the current run trace is visible; older assistant replies lose their activity context. Finally, Buddy polling has a hard `RUN_POLL_TIMEOUT_MS` limit that can turn a still-running backend run into a frontend timeout failure.

## Hermes Findings

The `demo/hermes-agent` source demonstrates useful UX patterns:

- `gateway/stream_consumer.py` separates streamed assistant text into segments and starts a new segment at tool boundaries.
- `run_agent.py` emits text deltas before and between tool calls, then marks tool boundaries separately.
- `environments/agent_loop.py` keeps tool execution in a loop with explicit turn state rather than waiting for one monolithic final answer.
- `gateway/delivery.py` treats final delivery as a separate routing concern, including truncation and saved full outputs for long results.

TooGraph should borrow those interaction patterns, not Hermes' hidden imperative loop. In TooGraph, the same behavior should be modeled as state, graph nodes, run events, and Buddy UI run capsules.

## Design

### Fast Reply State

Add a `visible_reply` markdown state to `buddy_autonomous_loop`. The intake phase writes it together with `request_understanding`, using the first LLM turn to acknowledge the request and summarize the intended next action. This avoids an extra model call while giving the UI something user-visible before capability execution.

`visible_reply` is not the final answer. It is an early conversational response such as "我先检查项目结构和运行状态，然后把需要确认的操作放在这里给你处理。"

### Final Reply State

Keep `final_reply` as the authoritative final user-facing answer. When `final_reply` arrives, the Buddy message content is replaced by or upgraded to that final answer.

### Per-Turn Run Capsule

Each assistant message owns its own run capsule:

- run id
- trace entries
- start and finish timestamps
- expansion state
- pause dialog state when the associated run is `awaiting_human`

The widget no longer stores one global trace list for every run. Global state only tracks the currently active run and which assistant message is active.

### Pause Dialog

The pause dialog stays inside the assistant message's run capsule. The user continues only from that dialog. The bottom chat composer should not resume a paused run.

The dialog's top action selector should support:

- execute current plan
- supplement content
- choose a plan
- reject or cancel

Only one input area is shown at a time. If multiple required states exist, the dialog uses a target selector plus one textarea rather than one textarea per state.

### Long Runs

Buddy frontend polling should not impose a whole-run timeout. It should poll until the run reaches a terminal state, enters `awaiting_human`, or the user/session explicitly aborts the request. Per-request network failures still surface normally.

### Auditability

Each completed Buddy reply persists its `run_id` on the chat message. Historical run details remain inspectable through the Runs page. The in-memory run capsule improves current-session readability; persisted recovery can later rehydrate capsules from the run record.

## Out Of Scope For This Pass

- Persisting full trace entries into `buddy.db`.
- Building a separate native streaming transport.
- Copying Hermes' parallel tool execution engine.
- Replacing TooGraph's graph protocol with an imperative agent loop.

## Acceptance Criteria

- Buddy can display an early `visible_reply` before the final capability loop finishes.
- Each assistant message keeps its own run trace while the current chat session is open.
- Historical assistant messages in the same session can show their own completed run trace.
- The Buddy run poll loop has no fixed whole-run timeout.
- Pause handling remains attached to the relevant assistant message.
- Existing final reply behavior continues to work through `final_reply`.
