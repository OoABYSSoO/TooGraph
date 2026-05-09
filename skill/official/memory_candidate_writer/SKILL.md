---
name: 候选记忆写入器
description: Create reviewable platform memory candidates with evidence and source metadata.
---

# 候选记忆写入器

Use this skill when a graph has identified possible long-term memory from a run trace, user correction, failure, success, or explicit review output.

The skill creates only `candidate` memories. It does not apply active long-term memory, change permissions, or write Buddy Home files.

State input:

- `candidate_plan`: structured improvement or memory-candidate plan.

LLM output:

- `candidates`: array of candidate memory objects.
- `run_id`: source run id.
- `node_id`: source node id.
- `template_id`: source template id.

Each candidate must include:

- `scope`, `layer`, `type`
- `summary`, `content`
- `evidence`
- optional `confidence`, `importance`, `artifact_refs`, `source`, `supersedes`

State outputs:

- `success`: all candidates were accepted.
- `candidate_memories`: persisted candidate records.
- `skipped_candidates`: rejected candidate details.
- `result`: compact summary.
