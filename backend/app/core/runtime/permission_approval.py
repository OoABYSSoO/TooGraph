from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from app.core.runtime.state import utc_now_iso


RISKY_PERMISSION_ORDER = [
    "file_write",
    "file_delete",
    "file_remove",
    "delete",
    "subprocess",
    "command",
    "shell",
]
RISKY_PERMISSION_SET = set(RISKY_PERMISSION_ORDER)


@dataclass(frozen=True, slots=True)
class PermissionApprovalDecision:
    required: bool
    risky_permissions: list[str]
    mode: str


def should_pause_for_skill_permission_approval(
    *,
    state: dict[str, Any],
    node_name: str,
    skill_key: str,
    skill_definition: Any,
) -> PermissionApprovalDecision:
    _ = (node_name, skill_key)
    permissions = [str(item).strip() for item in getattr(skill_definition, "permissions", []) or [] if str(item).strip()]
    risky_permissions = _ordered_risky_permissions(permissions)
    mode = resolve_permission_mode(state)
    return PermissionApprovalDecision(
        required=bool(risky_permissions) and mode == "ask_first",
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
    skill_key: str,
    skill_name: str,
    binding_source: str,
    permissions: list[str],
    skill_inputs: dict[str, Any],
) -> dict[str, Any]:
    normalized_permissions = _ordered_risky_permissions(permissions)
    approval_seed = {
        "run_id": str(state.get("run_id") or ""),
        "node_id": node_name,
        "skill_key": skill_key,
        "binding_source": binding_source,
        "permissions": normalized_permissions,
        "skill_inputs": skill_inputs,
    }
    approval_id = hashlib.sha256(
        json.dumps(approval_seed, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:16]
    return {
        "kind": "skill_permission_approval",
        "approval_id": approval_id,
        "node_id": node_name,
        "skill_key": skill_key,
        "skill_name": skill_name or skill_key,
        "binding_source": binding_source,
        "permissions": normalized_permissions,
        "skill_inputs": skill_inputs,
        "input_preview": _preview_value(skill_inputs),
        "reason": _approval_reason(normalized_permissions, skill_name or skill_key),
        "requested_at": utc_now_iso(),
    }


def consume_pending_permission_approval(
    state: dict[str, Any],
    *,
    node_name: str,
    skill_key: str,
    binding_source: str,
) -> dict[str, Any] | None:
    metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
    pending = metadata.get("pending_permission_approval")
    if not isinstance(pending, dict):
        return None
    if str(pending.get("kind") or "") != "skill_permission_approval":
        return None
    if str(pending.get("node_id") or "") != node_name:
        return None
    if str(pending.get("skill_key") or "") != skill_key:
        return None
    if str(pending.get("binding_source") or "") != binding_source:
        return None

    metadata.pop("pending_permission_approval", None)
    resume_payload = metadata.pop("pending_permission_approval_resume_payload", {})
    approval_record = {
        **pending,
        "status": "approved",
        "approved_at": utc_now_iso(),
        "resume_payload": resume_payload if isinstance(resume_payload, dict) else {},
    }
    state["permission_approvals"] = [*state.get("permission_approvals", []), approval_record]
    return pending


def find_pending_permission_approval_for_node(
    state: dict[str, Any],
    *,
    node_name: str,
    skill_keys: set[str],
) -> dict[str, Any] | None:
    metadata = state.get("metadata") if isinstance(state.get("metadata"), dict) else {}
    pending = metadata.get("pending_permission_approval")
    if not isinstance(pending, dict):
        return None
    if str(pending.get("kind") or "") != "skill_permission_approval":
        return None
    if str(pending.get("node_id") or "") != node_name:
        return None
    pending_skill_key = str(pending.get("skill_key") or "")
    if pending_skill_key not in skill_keys:
        return None
    return pending


def _ordered_risky_permissions(permissions: list[str]) -> list[str]:
    present = {permission for permission in permissions if permission in RISKY_PERMISSION_SET}
    ordered = [permission for permission in RISKY_PERMISSION_ORDER if permission in present]
    extras = sorted(permission for permission in present if permission not in RISKY_PERMISSION_ORDER)
    return [*ordered, *extras]


def _approval_reason(permissions: list[str], skill_name: str) -> str:
    if not permissions:
        return ""
    label = ", ".join(permissions)
    return f"Skill '{skill_name}' declares risky permission(s): {label}."


def _preview_value(value: Any, *, limit: int = 1000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, default=str)
    except TypeError:
        text = str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."
