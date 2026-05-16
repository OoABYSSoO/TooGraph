---
name: TooGraph Action 生成器
description: Generate the identity and package file contents for a TooGraph Action from an approved user requirement.
---

# TooGraph Action 生成器

Use this Action after the user requirement and expected behavior for a new custom TooGraph Action are clear. It produces the Action identity and file contents only; it does not install, write, test, repair, package, or enable the generated Action.

Lifecycle:
- `before_llm.py` injects the current `action/ACTION_AUTHORING_GUIDE.md` so the LLM follows the active Action protocol.
- `after_llm.py` normalizes the generated identity and file-content fields, syncs `action_json.actionKey` to `action_key`, and strips accidental Markdown fences.

State inputs:

- `confirmed_action_requirement`: confirmed requirement, boundaries, examples, and acceptance criteria for the target Action.

LLM output:

- `action_key`: stable machine identifier for the generated Action, used later as the user Action directory name.
- `action_json`: `action.json` as a JSON object using `toograph.action/v1`.
- `action_md`: complete `ACTION.md` Markdown content.
- `before_llm_py`: complete `before_llm.py` source, or an empty string when not needed.
- `after_llm_py`: complete `after_llm.py` source, or an empty string when not needed.
- `requirements_txt`: complete `requirements.txt` content when the generated Action needs third-party Python packages, or an empty string when not needed.

State outputs:
- The same six fields, normalized for downstream display or a later controlled file-writing step.

Rules:
- `action_key` must match `action_json.actionKey`.
- The generated `action_json` must distinguish `stateInputSchema` for graph state inputs, `llmOutputSchema` for structured LLM output, and `stateOutputSchema` for downstream state outputs.
- The generated `action_json` must not include `required` on Action IO fields; `stateInputSchema` only lists state fields the Action truly needs from the graph.
- The generated Action must keep TooGraph state binding in the runtime, not inside action scripts.
- The generated Action must declare permissions in `action.json` when it needs network, file access, browser automation, secret access, or subprocess execution.
- The generated `action_json` must not include local usage settings. Action visibility is controlled only by `action/settings.json` with an `enabled` flag, which the app generates outside the Action package.
- The generated Action must not declare per-Action approval policy. Approval is controlled by the running graph or Buddy mode: `需确认` asks before file writes/deletes or arbitrary script/command execution; `完全访问` runs those low-level operations automatically.
- If generated Python lifecycle code imports non-standard-library packages, put those dependencies in `requirements_txt`.
- Do not generate zip files, paths, smoke-test reports, write commands, graph templates, or installation side effects.
- Do not include legacy fields such as `enabled`, `hidden`, `selectable`, `requiresApproval`, `capabilityPolicy`, `health`, `configured`, `healthy`, `targets`, `executionTargets`, `runPolicies`, `kind`, `mode`, `scope`, `label`, or Action IO `required`.
