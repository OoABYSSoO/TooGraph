from __future__ import annotations

from typing import Any


PERMISSION_OPERATION_ORDER = [
    "network",
    "secret_read",
    "file_read",
    "file_write",
    "execute",
    "graph_write",
    "memory_write",
    "cost",
    "external_delivery",
]

RISKY_PERMISSION_OPERATIONS = {
    "file_write",
    "execute",
    "graph_write",
    "memory_write",
    "cost",
    "external_delivery",
}
EXTERNAL_PERMISSION_OPERATIONS = {
    "network",
    "secret_read",
}

PERMISSION_OPERATION_BY_PERMISSION = {
    "network": "network",
    "browser_automation": "network",
    "model_vision": "network",
    "secret_read": "secret_read",
    "file_read": "file_read",
    "action_read": "file_read",
    "buddy_session_read": "file_read",
    "file_write": "file_write",
    "file_delete": "file_write",
    "file_remove": "file_write",
    "delete": "file_write",
    "execute": "execute",
    "subprocess": "execute",
    "command": "execute",
    "shell": "execute",
    "graph_write": "graph_write",
    "memory_write": "memory_write",
    "buddy_memory_write": "memory_write",
    "buddy_home_write": "memory_write",
    "cost": "cost",
    "external_delivery": "external_delivery",
}


def normalize_capability_permissions(permissions: Any) -> list[str]:
    if not isinstance(permissions, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in permissions:
        permission = str(item or "").strip()
        if not permission or permission in seen:
            continue
        seen.add(permission)
        result.append(permission)
    return result


def build_capability_permission_profile(permissions: Any) -> dict[str, Any]:
    normalized_permissions = normalize_capability_permissions(permissions)
    operations = _ordered_operations(
        PERMISSION_OPERATION_BY_PERMISSION.get(permission, permission)
        for permission in normalized_permissions
    )
    risky_permissions = risky_permissions_for_approval(normalized_permissions)
    return {
        "permissions": normalized_permissions,
        "operations": operations,
        "permission_tier": permission_tier_for_permissions(normalized_permissions),
        "risky_permissions": risky_permissions,
        "requires_approval_by_default": bool(risky_permissions),
    }


def permission_tier_for_permissions(permissions: Any) -> str:
    normalized_permissions = normalize_capability_permissions(permissions)
    if not normalized_permissions:
        return "none"
    operations = {
        PERMISSION_OPERATION_BY_PERMISSION.get(permission, permission)
        for permission in normalized_permissions
    }
    if operations.intersection(RISKY_PERMISSION_OPERATIONS):
        return "risky"
    if operations.intersection(EXTERNAL_PERMISSION_OPERATIONS):
        return "external"
    return "guarded"


def risky_permissions_for_approval(permissions: Any) -> list[str]:
    normalized_permissions = normalize_capability_permissions(permissions)
    indexed: list[tuple[int, int, str]] = []
    for index, permission in enumerate(normalized_permissions):
        operation = PERMISSION_OPERATION_BY_PERMISSION.get(permission, permission)
        if operation not in RISKY_PERMISSION_OPERATIONS:
            continue
        indexed.append((_operation_order_index(operation), index, permission))
    indexed.sort()
    return [permission for _operation_index, _index, permission in indexed]


def _ordered_operations(operations: Any) -> list[str]:
    unique: set[str] = set()
    for operation in operations:
        text = str(operation or "").strip()
        if text:
            unique.add(text)
    return sorted(unique, key=lambda item: (_operation_order_index(item), item))


def _operation_order_index(operation: str) -> int:
    try:
        return PERMISSION_OPERATION_ORDER.index(operation)
    except ValueError:
        return len(PERMISSION_OPERATION_ORDER)
