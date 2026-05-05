# Companion File Memory Boundary Design

## Context

GraphiteUI currently has a `companion_state` skill that loads companion profile, policy, memories, and session summary, then also curates and writes memory updates. This works, but it puts companion-specific product policy, file paths, memory routing, and low-level file mutation into one skill package.

The preferred direction is to make file access a reusable primitive and move companion memory placement and orchestration into the companion chat loop template. A skill should expose explicit file read/write capability. A graph template should decide which files matter, how paths are wired into state, and when durable memory updates are allowed.

## Goals

- Keep companion runtime data under `backend/data/companion/`.
- Replace the companion-specific read/write skill boundary with a reusable local file skill.
- Make the companion chat loop template declare memory file paths and route data through `state_schema`.
- Keep writes auditable through structured results, revision records where applicable, and graph run details.
- Use a whitelist that is broader than companion data, but still avoids unrestricted repository writes.

## Non-Goals

- Do not move companion memory into frontend local storage.
- Do not store runtime memory inside `skill/` packages or template JSON files.
- Do not allow arbitrary absolute paths or hidden filesystem access.
- Do not implement graph write permissions, approval mode, or full companion graph operations in this change.

## Approaches Considered

### Recommended: Generic File Skill With Template-Declared Paths

Create a reusable local file skill, for example `local_file`, that supports read and write operations for whitelisted paths. The companion chat loop template owns the path constants for profile, policy, memories, session summary, and revisions. Agent nodes produce structured plans; skill nodes execute explicit file operations.

This gives the cleanest boundary: the skill is a capability, the template is product behavior, and the data lives in runtime storage.

### Narrow Alternative: Companion-Only File Skill

Create a smaller skill that can only touch `backend/data/companion/`, but still remove memory routing logic from the skill. This is safer for the first step, but it would quickly become another companion-specific primitive and would not help other templates that need controlled local file access.

### Rejected: Keep `companion_state` As The Owner

Keep the current package and incrementally add config. This minimizes immediate code churn, but preserves the muddled boundary: one skill would still know the companion storage location, prompt formatting, routing rules, and mutation behavior.

## Storage Location

Companion memory and self-configuration data should remain in:

```text
backend/data/companion/
```

The first stable file layout is:

```text
backend/data/companion/profile.json
backend/data/companion/policy.json
backend/data/companion/memories.json
backend/data/companion/session_summary.json
backend/data/companion/revisions.json
```

These files are runtime user data. They are not skill source code, not graph template definitions, and not frontend state. This placement keeps them easy to back up, inspect, migrate, and exclude from normal source commits.

## Whitelist Model

The base file skill should resolve all paths relative to the repository root and reject unsafe paths before touching the filesystem.

Default allowlist:

```text
backend/data/companion/
```

Template-declared allowlist:

```text
backend/data/memories/
backend/data/kb/
backend/data/skill_artifacts/
```

Restricted allowlist requiring a stronger permission flag or a different skill mode:

```text
docs/
skill/
backend/app/templates/
```

Always denied:

```text
.git/
.env
node_modules/
dist/
.worktrees/
backend/data/settings/
logs and .dev_* logs
absolute paths outside the repository
paths containing .. after normalization
```

This model keeps the whitelist larger than companion memory while preserving a visible permission boundary. A template can ask for a broader allowed root, but the runtime still validates the resolved path.

## Skill Contract

The reusable skill should be a small filesystem primitive. A likely manifest shape:

- `skillKey`: `local_file`
- `permissions`: `file_read`, `file_write`
- `targets`: `agent_node`, `companion`
- `sideEffects`: `file_read`, `file_write`

Suggested inputs:

- `operation`: `read_json`, `write_json`, `append_json_array`, or `write_text`
- `path`: repository-relative path
- `content`: text or JSON content for write operations
- `allowed_roots`: optional list of repository-relative roots, supplied by the template or node config
- `write_mode`: `create`, `replace`, `merge_object`, or `append_array`
- `revision`: boolean indicating whether the write should create a revision record
- `revision_path`: repository-relative path for revision storage when revision is enabled
- `change_reason`: human-readable reason for audit output
- `changed_by`: actor label such as `companion_chat_loop`

Suggested outputs:

- `status`
- `path`
- `operation`
- `content` for reads
- `previous_content` or compact hash for writes
- `revision_id` when a revision is created
- `warnings`
- `error`

The skill should not know what a companion memory means. It should only validate paths, read/write data, and return structured results.

## Companion Chat Loop Template

The companion chat loop template should declare memory paths in state or node config instead of relying on hidden defaults inside a companion-specific skill.

Recommended state additions:

- `companion_profile_path`
- `companion_policy_path`
- `companion_memories_path`
- `companion_session_summary_path`
- `companion_revisions_path`

The loop should then be expressed as:

1. Input nodes receive user message, conversation history, page context, and companion mode.
2. File skill nodes read profile, policy, memories, and session summary from template-declared paths.
3. A formatting or agent node converts raw JSON into fenced prompt context.
4. The reply agent produces only `companion_reply`.
5. A curator agent produces a structured update plan for profile, policy, memory, and session summary.
6. File skill nodes apply approved or automatic self-configuration writes to the declared files.
7. Output nodes display the reply and expose write results, revision IDs, warnings, and errors.

This keeps memory behavior visible in the graph run. The product rule is encoded in the template, while the skill remains reusable.

## Error Handling

- Missing companion files should read as documented defaults and may be created on first write.
- Invalid JSON should fail closed and return an error unless the operation explicitly allows repair.
- Denied paths should return a structured permission error and should not create partial files.
- Write operations should be atomic: write to a temporary sibling file, then replace the target.
- Revision writes should happen before replacing the current value.
- If the curator produces no durable update, the file skill should not be invoked for writes.

## Testing

Focused backend tests should cover:

- Path normalization rejects absolute paths and traversal.
- Default allowlist permits `backend/data/companion/`.
- Template-declared allowlist permits expected data directories.
- Denylist blocks `.git/`, `.env`, `backend/data/settings/`, `dist/`, and logs.
- JSON read/write operations preserve UTF-8 content.
- Revision-enabled writes record previous and next values.
- The companion chat loop template no longer binds to `companion_state` for file mutation.
- The template declares companion file paths explicitly in `state_schema` or node config.

Documentation checks should ensure the older `companion_state` direction is marked superseded or folded into this design once implementation lands.

## Migration Plan

1. Add the generic local file skill and tests.
2. Update the companion chat loop template to declare companion file paths.
3. Replace `companion_state` load and curate calls with file skill reads, curator planning, and file skill writes.
4. Keep compatibility tests for the existing companion data file shape.
5. Remove or deprecate `skill/companion_state` after the template no longer depends on it.
6. Update future docs so companion memory policy is described as template orchestration plus reusable file primitives.

## Open Design Decision

The first implementation can either make `local_file` fully generic with a conservative allowlist, or start with the default and template-declared data directories only. The recommended first implementation is the conservative generic version: default companion access plus explicit template-declared data roots, with restricted source/document roots deferred until a stronger permission path exists.
