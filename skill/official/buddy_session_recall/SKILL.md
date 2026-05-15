---
name: buddy_session_recall
description: Recall real Buddy chat sessions and message windows from buddy.db.
---

# Buddy Session Recall

Use this Skill when a Buddy graph needs historical conversation context from `buddy.db`.

The Skill is read-only. It returns real persisted Buddy messages with session metadata; it does not summarize, rewrite, or promote messages into long-term memory.

Supported modes:

- `browse`: list recent Buddy sessions.
- `discover`: search Buddy messages by query and return Hermes-style `snippet`, hit windows, `bookend_start`, and `bookend_end`.
- `scroll`: expand one session around an anchor message and return boundary counts.

Useful request fields:

- `query`: search text for `discover`.
- `limit`: maximum sessions to return.
- `window`: number of messages around an anchor.
- `bookend`: number of opening/closing messages to include for `discover`.
- `sort`: `rank`, `newest`, or `oldest`.
- `role_filter`: default `["user", "assistant"]`.

Long-term memory remains `buddy_home/MEMORY.md`. This Skill is only for session recall.
