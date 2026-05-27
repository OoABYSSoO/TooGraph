from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from app.core.capability_permissions import permission_tier_for_permissions, risky_permissions_for_approval
from app.core.context_security import redact_context_secrets
from app.core.runtime.state import utc_now_iso


@dataclass(frozen=True, slots=True)
class PermissionApprovalDecision:
    required: bool
    risky_permissions: list[str]
    mode: str


def should_pause_for_action_permission_approval(
    *,
    state: dict[str, Any],
    node_name: str,
    action_key: str,
    action_definition: Any,
    action_inputs: dict[str, Any] | None = None,
) -> PermissionApprovalDecision:
    _ = (node_name, action_key)
    declared_permissions = [
        str(item).strip() for item in getattr(action_definition, "permissions", []) or [] if str(item).strip()
    ]
    permissions = _resolve_operation_permissions(
        action_key=action_key,
        declared_permissions=declared_permissions,
        action_inputs=action_inputs or {},
    )
    risky_permissions = _ordered_risky_permissions(permissions)
    mode = resolve_permission_mode(state)
    policy_requires_approval = _permission_policy_requires_risky_approval(state, permissions)
    return PermissionApprovalDecision(
        required=bool(risky_permissions) and (mode == "ask_first" or policy_requires_approval),
        risky_permissions=risky_permissions,
        mode=mode,
    )


def resolve_permission_mode(state: dict[str, Any]) -> str:
    metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
    graph_mode = str(metadata.get("graph_permission_mode") or "").strip()
    buddy_mode = str(metadata.get("buddy_mode") or "").strip()
    if graph_mode in {"ask_first", "full_access"}:
        return graph_mode
    if buddy_mode in {"ask_first", "full_access"}:
        return buddy_mode
    if metadata.get("buddy_requires_approval") is True:
        return "ask_first"
    if metadata.get("buddy_can_execute_actions") is True:
        return "full_access"
    return "default"


def build_pending_permission_approval(
    *,
    state: dict[str, Any],
    node_name: str,
    action_key: str,
    action_name: str,
    binding_source: str,
    permissions: list[str],
    inputs: dict[str, Any],
    state_outputs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_permissions = _ordered_risky_permissions(permissions)
    normalized_state_outputs = dict(state_outputs or {})
    approval_seed = {
        "run_id": str(state.get("run_id") or ""),
        "node_id": node_name,
        "capability_kind": "action",
        "capability_key": action_key,
        "binding_source": binding_source,
        "permissions": normalized_permissions,
        "inputs": inputs,
        "state_outputs": normalized_state_outputs,
    }
    approval_id = hashlib.sha256(
        json.dumps(approval_seed, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:16]
    pending = {
        "kind": "capability_permission_approval",
        "approval_id": approval_id,
        "node_id": node_name,
        "capability_kind": "action",
        "capability_key": action_key,
        "capability_name": action_name or action_key,
        "binding_source": binding_source,
        "permissions": normalized_permissions,
        "inputs": inputs,
        "input_preview": _preview_value(inputs),
        "reason": _approval_reason(normalized_permissions, action_name or action_key),
        "requested_at": utc_now_iso(),
    }
    if normalized_state_outputs:
        pending["state_outputs"] = normalized_state_outputs
    return pending


def consume_pending_permission_approval(
    state: dict[str, Any],
    *,
    node_name: str,
    action_key: str,
    binding_source: str,
) -> dict[str, Any] | None:
    metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
    pending = metadata.get("pending_permission_approval")
    if not isinstance(pending, dict):
        return None
    if str(pending.get("kind") or "") != "capability_permission_approval":
        return None
    if str(pending.get("node_id") or "") != node_name:
        return None
    if str(pending.get("capability_kind") or "") != "action":
        return None
    if str(pending.get("capability_key") or "") != action_key:
        return None
    if str(pending.get("binding_source") or "") != binding_source:
        return None

    metadata.pop("pending_permission_approval", None)
    resume_payload = metadata.pop("pending_permission_approval_resume_payload", {})
    normalized_resume_payload = resume_payload if isinstance(resume_payload, dict) else {}
    decision = _resolve_resume_decision(normalized_resume_payload)
    denial_reason = _resolve_denial_reason(normalized_resume_payload)
    approval_record = {
        **pending,
        "status": decision,
        "resume_payload": normalized_resume_payload,
    }
    if decision == "denied":
        approval_record["denied_at"] = utc_now_iso()
        approval_record["denial_reason"] = denial_reason
    else:
        approval_record["approved_at"] = utc_now_iso()
    state["permission_approvals"] = [*state.get("permission_approvals", []), approval_record]
    return approval_record


def find_pending_permission_approval_for_node(
    state: dict[str, Any],
    *,
    node_name: str,
    action_keys: set[str],
) -> dict[str, Any] | None:
    metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
    pending = metadata.get("pending_permission_approval")
    if not isinstance(pending, dict):
        return None
    if str(pending.get("kind") or "") != "capability_permission_approval":
        return None
    if str(pending.get("node_id") or "") != node_name:
        return None
    if str(pending.get("capability_kind") or "") != "action":
        return None
    pending_action_key = str(pending.get("capability_key") or "")
    if pending_action_key not in action_keys:
        return None
    return pending


def _ordered_risky_permissions(permissions: list[str]) -> list[str]:
    return risky_permissions_for_approval(permissions)


def _permission_policy_requires_risky_approval(state: dict[str, Any], permissions: list[str]) -> bool:
    metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
    policy = metadata.get("capability_permission_policy")
    if not isinstance(policy, dict):
        return False
    required_tiers = {
        str(item).strip()
        for item in policy.get("approval_required_permission_tiers", [])
        if str(item).strip()
    }
    if "risky" not in required_tiers:
        return False
    return permission_tier_for_permissions(permissions) == "risky"


def _resolve_operation_permissions(
    *,
    action_key: str,
    declared_permissions: list[str],
    action_inputs: dict[str, Any],
) -> list[str]:
    if action_key != "local_workspace_executor":
        return declared_permissions
    operation = str(action_inputs.get("operation") or "").strip().lower()
    operation_permissions = {
        "read": ["file_read"],
        "list": ["file_read"],
        "search": ["file_read"],
        "edit": ["file_write"],
        "write": ["file_write"],
        "execute": ["subprocess"],
    }.get(operation)
    if not operation_permissions:
        return declared_permissions
    declared_set = set(declared_permissions)
    narrowed = [permission for permission in operation_permissions if permission in declared_set]
    return narrowed or declared_permissions


def _approval_reason(permissions: list[str], action_name: str) -> str:
    if not permissions:
        return ""
    label = ", ".join(permissions)
    return f"Action '{action_name}' declares risky permission(s): {label}."


def _resolve_resume_decision(resume_payload: dict[str, Any]) -> str:
    approval_payload = resume_payload.get("permission_approval")
    payload = approval_payload if isinstance(approval_payload, dict) else resume_payload
    raw_decision = str(payload.get("decision") or payload.get("status") or "").strip().lower()
    if raw_decision in {"denied", "deny", "rejected", "reject", "refused", "refuse"}:
        return "denied"
    return "approved"


def _resolve_denial_reason(resume_payload: dict[str, Any]) -> str:
    approval_payload = resume_payload.get("permission_approval")
    payload = approval_payload if isinstance(approval_payload, dict) else resume_payload
    return str(payload.get("reason") or payload.get("message") or "").strip()


def _preview_value(value: Any, *, limit: int = 1000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, default=str)
    except TypeError:
        text = str(value)
    text, _warnings = redact_context_secrets(text, source_kind="permission_approval_preview", source_refs=[])
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."
