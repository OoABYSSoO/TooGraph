---
name: buddy_session_recall
description: Recall Buddy chat sessions, memories, and run output snippets from the unified TooGraph database.
---

# Buddy Session Recall

Use this Action when a Buddy graph needs historical conversation context from the unified `backend/data/toograph.db`.

The Action is read-only. It returns persisted Buddy messages, memory entries, run output snippets, and source refs; it does not summarize, rewrite, or promote messages into long-term memory.

Supported modes:

- `browse`: list recent Buddy sessions.
- `discover`: search Buddy messages, memory entries, and run output snippets by query and return source refs plus Hermes-style `snippet`, hit windows, `bookend_start`, and `bookend_end`.
- `scroll`: expand one session around an anchor message and return boundary counts.

Useful request fields:

- `query`: search text for `discover`.
- `limit`: maximum sessions to return.
- `window`: number of messages around an anchor.
- `bookend`: number of opening/closing messages to include for `discover`.
- `sort`: `rank`, `newest`, or `oldest`.
- `role_filter`: default `["user", "assistant"]`.

Long-term memory facts are stored in `memory_entries` with revisions and retrieval projection. Buddy Home markdown files remain profile/context documents, not the session history database.
