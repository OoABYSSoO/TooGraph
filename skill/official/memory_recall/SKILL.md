---
name: 记忆召回
description: Read platform memories with explicit filters and return a budgeted memory_context for downstream graph nodes.
---

# 记忆召回

Use this skill when a graph needs prior user/project/Buddy/template experience, preferences, facts, summaries, capability stats, or safety references.

This skill is read-only. The LLM node generates recall parameters only; `after_llm.py` reads the platform memory store and returns a structured `memory_context`.

State input:

- `memory_request`: current recall need and any scope or budget constraints.

LLM output:

- `query`: FTS query text.
- `scope`: explicit scope, such as `user`, `project`, `buddy`, `template`, `graph`, `skill`, or `knowledge_collection`.
- `layer`: optional memory layer.
- `memory_type`: optional memory type.
- `status`: optional status; defaults to `active`.
- `top_k`: maximum records to consider.
- `max_chars`: prompt budget for included memory records.

State outputs:

- `success`: whether recall succeeded.
- `memory_context`: structured recall package with filters, included memories, omitted summaries, and budget stats.
- `recalled_memories`: included memory records.
- `omitted_memories`: budget-omitted records.
- `result`: compact recall summary.
