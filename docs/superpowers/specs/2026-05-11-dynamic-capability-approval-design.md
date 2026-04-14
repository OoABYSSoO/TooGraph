# Dynamic Capability Approval Design

## Goal

Implement the first runtime-enforced approval loop for risky capability execution. When a graph run is in `ask_first` mode, Skills that declare file writes, delete-like permissions, or subprocess execution must pause before the side effect runs.

## Scope

- Applies to static Skill nodes and dynamic `capability.kind=skill` execution.
- Triggers only when run metadata says `graph_permission_mode=ask_first`, `buddy_mode=ask_first`, or `buddy_requires_approval=true`.
- Does not trigger when metadata says `graph_permission_mode=full_access`, `buddy_mode=full_access`, or `buddy_can_execute_actions=true` without an approval requirement.
- Does not add per-Skill `requiresApproval` semantics back into Skill manifests.
- Does not add reject/cancel UI in this pass. Resuming the standard `awaiting_human` pause means the user approved this single pending operation.

## Runtime Design

The agent node handler detects risky Skill permissions after Skill input planning and before invoking the Skill. It stores one `pending_permission_approval` package in run metadata with the node, Skill, permission list, planned inputs, and a short reason, then returns an `awaiting_human` body.

The LangGraph runtime handles that body with the same parent run pause mechanism already used for dynamic subgraph breakpoints. On resume, the resume endpoint preserves `pending_permission_approval` metadata and the runtime consumes it once, reusing the stored Skill inputs instead of running another Skill-input planning turn.

## UI Design

The existing Human Review panel and Buddy pause card read the pending approval package from run metadata. They display the Skill name, permissions, and a compact input preview, while continuing to use the same resume API and `awaiting_human` status.

## Verification

- Unit tests cover ask-first pause before invocation, full-access bypass, and resume using stored inputs.
- Runtime tests cover metadata preservation for resume.
- Frontend model tests cover approval summary extraction.
