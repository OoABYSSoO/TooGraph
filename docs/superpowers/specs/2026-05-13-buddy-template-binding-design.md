# Buddy Template Binding Design

## Goal

Buddy visible chat runs must no longer be tied to a single hard-coded graph template. The Buddy page will expose a binding tab where the user selects one existing template and maps Buddy-provided runtime inputs to that template's root input nodes. Each Buddy chat turn then runs the selected template with only the explicitly bound inputs injected.

This design applies to the visible Buddy run path. The background self-review template can stay on its existing dedicated path unless a later design explicitly migrates it.

## Non-Goals

- Do not keep the old state-name-based Buddy injection path as compatibility logic.
- Do not inject Buddy permission mode into graph input state.
- Do not inject skill catalog snapshots into graph input state.
- Do not introduce a Buddy-only graph protocol or hidden runtime loop.
- Do not require templates to add Buddy-specific metadata before they can be selected.

## Binding Sources

The first version supports four Buddy input sources:

| Source | Required | Runtime value |
| --- | --- | --- |
| `current_message` | Yes, exactly once | The current user message submitted in the Buddy chat composer. |
| `conversation_history` | No | The formatted Buddy conversation history already used by the chat run path. |
| `page_context` | No | The current TooGraph page, selected graph, selected node, and relevant UI context. |
| `buddy_home_context` | No | The Buddy Home local folder selection package, using the existing file-state expansion path. |

Permission mode remains a runtime policy input only. It is recorded on run metadata and used by low-level operation guards to decide whether a write, delete, script execution, or graph mutation must pause for human confirmation. It must not be written to graph state.

Capability and skill discovery remains owned by the graph and Skill runtime. In particular, `toograph_capability_selector.before_llm.py` already reads enabled templates and Skills, so Buddy chat does not pass a separate `skill_catalog_snapshot` input.

## Binding Target

Bindings target root graph input nodes, not state names.

The binding UI must show every root input node in the selected template. For each row it must display:

- Input node name.
- Input node id.
- The primary written state name.
- The primary written state key.
- State type and description when available.
- A source dropdown with `Not bound`, `current_message`, `conversation_history`, `page_context`, and `buddy_home_context`.

The source dropdown writes a binding for that input node id. `Not bound` means Buddy does not inject that source into the node. The template's own default input value and state default remain untouched.

The first implementation should support input nodes that write exactly one state. If an input node writes zero states or multiple states, the row remains visible but disabled with a clear note that it cannot be used for Buddy binding yet. This keeps the behavior explicit instead of guessing which state should receive the value.

## Validation Rules

The binding is valid only when all of these are true:

- The selected template exists and is active.
- The selected template has at least one bindable root input node.
- `current_message` is bound to exactly one bindable input node.
- No non-empty source is bound to more than one input node.
- Every configured input node id exists in the selected template.
- Every configured input node writes exactly one state.

The save action must enforce these rules. The chat run path must enforce them again before starting a run. If a saved binding becomes invalid because a template was deleted, disabled, or changed, Buddy should show a repair message that links the user back to the Buddy binding tab rather than silently guessing a replacement.

For a fresh Buddy Home with no binding record, the system may seed a default binding that points at `buddy_autonomous_loop`. This is a default configuration, not a compatibility fallback. Once the new record exists, runs must use the binding record only.

## Persistence and Audit

The binding should be stored as Buddy configuration in Buddy Home's database, using the existing command and revision pattern.

Proposed shape:

```json
{
  "version": 1,
  "template_id": "buddy_autonomous_loop",
  "input_bindings": {
    "input_user_message": "current_message",
    "input_conversation_history": "conversation_history",
    "input_page_context": "page_context",
    "input_buddy_context": "buddy_home_context"
  },
  "updated_at": "2026-05-13T00:00:00Z"
}
```

Backend additions:

- Store helpers:
  - `load_run_template_binding()`
  - `save_run_template_binding(payload, changed_by, change_reason)`
- Command action:
  - `run_template_binding.update`
- Revision target:
  - `run_template_binding` / `run_template_binding`
- API:
  - `GET /api/buddy/run-template-binding`
  - `POST /api/buddy/commands` with `action=run_template_binding.update`

The revision history tab should include this target type through the existing command and revision views, with labels added for clarity.

## Frontend UI

Add a new `Binding` tab to the Buddy page.

The tab contains:

- Template selector populated from active existing templates.
- Template metadata: label, id, description, source, and status.
- Bindable input table.
- One source dropdown per input node.
- Validation feedback shown near the table and on save.
- Save and reset-to-default actions.

The table should be dense and readable rather than card-heavy. Use existing Element Plus primitives already used by the page: `ElTabs`, `ElSelect`, `ElTable`, `ElAlert`, `ElTag`, `ElButton`, and `ElForm`.

The source dropdown is the only editing control per row. Display data should make the binding inspectable without requiring the user to open the template canvas:

| Input node | Node id | State | State key | Type | Source |
| --- | --- | --- | --- | --- | --- |
| 用户消息 | `input_user_message` | `user_message` | `user_message` | text | Current message |

If the template has no root output nodes, the UI should warn that the Buddy chat window will not display a normal reply. It should not block saving in the first version, because output behavior is already defined by the graph's parent output nodes.

## Chat Run Flow

The Buddy chat send path changes to:

1. Read the saved Buddy run template binding.
2. Fetch the selected template.
3. Validate the binding against that template.
4. Build the Buddy runtime input values for the four supported sources.
5. Clone the template into a graph payload.
6. For each bound input node:
   - Resolve its single written state key.
   - Write the selected source value into the node's `config.value`.
   - Write the same value into `state_schema[stateKey].value`.
7. Apply Buddy model override as before.
8. Apply runtime metadata:
   - `origin: "buddy"`
   - `buddy_template_id`
   - `buddy_template_binding`
   - `buddy_mode`
   - `buddy_can_execute_actions`
9. Start the normal graph run.
10. Display only parent output-node outputs in the Buddy chat window.

The removed behavior is deliberate:

- No `setStateValueByNameOrKey` calls for fixed Buddy state names.
- No fixed `syncInputNodeValueByNameOrKey` calls.
- No automatic `buddy_mode` graph input.
- No automatic `skill_catalog_snapshot` graph input.

## Error Handling

Binding page errors:

- Template list load failure: show the existing page-level error alert.
- Template fetch failure after selection: show a local alert and disable save.
- Invalid binding: keep save disabled and list the exact rule violation.
- Save failure: show the returned API error and keep the draft in place.

Chat run errors:

- Missing binding record on a fresh install: seed and use the default binding.
- Missing or disabled selected template: fail before graph run and tell the user to repair the Buddy binding.
- Missing input node or invalid write shape: fail before graph run and tell the user which row is invalid.
- Missing current message binding: fail before graph run and tell the user to bind `current_message`.

These failures should be visible in the Buddy chat entry and should not start a partially injected run.

## Tests

Backend tests:

- Loading default run template binding when no record exists.
- Saving binding through `run_template_binding.update` creates command and revision records.
- Restoring a binding revision works.
- Invalid payloads are rejected.

Frontend unit tests:

- Binding model extracts input-node rows with node name, node id, state name, state key, type, and disabled reason.
- Binding validation enforces exactly one `current_message`.
- Binding validation rejects duplicate non-empty sources.
- Buddy graph builder injects only configured input-node bindings.
- Buddy graph builder does not inject `buddy_mode` or `skill_catalog_snapshot`.
- Buddy chat send path fetches binding, then selected template, then runs the built graph.

Structure tests:

- Buddy page exposes the new Binding tab.
- Binding tab imports the template and Buddy binding APIs.
- History and mascot debug tabs keep their existing order unless the page layout explicitly changes.

Manual verification:

- Open Buddy page and select a template.
- Bind current message to one input node and optional sources to other input nodes.
- Save, refresh, and confirm the saved binding reloads.
- Run a Buddy chat turn and confirm the selected template is used.
- Confirm only parent output-node content appears in the Buddy chat window.
- Confirm permission mode still controls low-level confirmation behavior through metadata, not graph input.

## Migration

This change is a full migration away from the fixed Buddy template path.

Existing hard-coded constants can remain only where they define the default seed binding or the self-review template id. They must not be used to inject Buddy runtime state into arbitrary templates.

Existing tests that assert fixed state-name injection should be rewritten around input-node binding. Tests that assert `buddy_mode` state injection or `skill_catalog_snapshot` injection should be removed or replaced with assertions that these values are not passed as graph input.
