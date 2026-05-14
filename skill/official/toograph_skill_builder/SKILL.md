---
name: TooGraph 技能生成器
description: Generate the identity and package file contents for a TooGraph Skill from an approved user requirement.
---

# TooGraph 技能生成器

Use this skill after the user requirement and expected behavior for a new custom TooGraph Skill are clear. It produces the Skill identity and file contents only; it does not install, write, test, repair, package, or enable the generated Skill.

Lifecycle:
- `before_llm.py` injects the current `skill/SKILL_AUTHORING_GUIDE.md` so the LLM follows the active Skill protocol.
- `after_llm.py` normalizes the generated identity and file-content fields, syncs `skill_json.skillKey` to `skill_key`, and strips accidental Markdown fences.

State inputs:

- `confirmed_skill_requirement`: confirmed requirement, boundaries, examples, and acceptance criteria for the target Skill.
- `builder_context`: optional capability gap, graph-flow context, or user constraints.

LLM parameters:

- `skill_key`: stable machine identifier for the generated Skill, used later as the user Skill directory name.
- `skill_json`: `skill.json` as a JSON object using `toograph.skill/v1`.
- `skill_md`: complete `SKILL.md` Markdown content.
- `before_llm_py`: complete `before_llm.py` source, or an empty string when not needed.
- `after_llm_py`: complete `after_llm.py` source, or an empty string when not needed.
- `requirements_txt`: complete `requirements.txt` content when the generated Skill needs third-party Python packages, or an empty string when not needed.

State outputs:
- The same six fields, normalized for downstream display or a later controlled file-writing step.

Rules:
- `skill_key` must match `skill_json.skillKey`.
- The generated `skill_json` must distinguish `stateInputSchema` for graph state inputs, `inputSchema` for LLM-generated call parameters, and `outputSchema` for downstream state outputs.
- The generated Skill must keep TooGraph state binding in the runtime, not inside skill scripts.
- The generated Skill must declare permissions in `skill.json` when it needs network, file access, browser automation, secret access, or subprocess execution.
- The generated `skill_json` must not include local usage settings. Skill visibility is controlled only by `skill/settings.json` with an `enabled` flag, which the app generates outside the Skill package.
- The generated Skill must not declare per-Skill approval policy. Approval is controlled by the running graph or Buddy mode: `需确认` asks before file writes/deletes or arbitrary script/command execution; `完全访问` runs those low-level operations automatically.
- If generated Python lifecycle code imports non-standard-library packages, put those dependencies in `requirements_txt`.
- Do not generate zip files, paths, smoke-test reports, write commands, graph templates, or installation side effects.
- Do not include legacy fields such as `enabled`, `hidden`, `selectable`, `requiresApproval`, `capabilityPolicy`, `health`, `configured`, `healthy`, `targets`, `executionTargets`, `runPolicies`, `kind`, `mode`, `scope`, or `label`.
