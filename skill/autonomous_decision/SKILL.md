# Autonomous Decision

Decides the next graph-loop action from a user message, structured intent, run origin, and a GraphiteUI skill catalog snapshot.

This skill is a control skill. It does not execute the selected skill, install skills, enable skills, edit graphs, edit files, or mutate memory. It returns a structured decision for downstream graph nodes:

- `answer_directly`
- `use_skill`
- `request_approval`
- `missing_skill`

Selection rules:

- Use the policy for `run_origin` when present; otherwise use `runPolicies.default`.
- Only consider skills that are discoverable for the active origin.
- Only autonomously select skills that are also auto-selectable for the active origin.
- Require active status, healthy/configured state, runtime readiness, runtime registration, and agent-node eligibility.
- If a matching skill is blocked by policy or readiness, return it in `blocked_candidates`.
- If no skill can be selected, return `missing_skill_proposal` instead of silently failing.

This package is intended to be explicitly bound by a graph template such as `companion_agentic_tool_loop`; it is not itself autonomously selectable.
