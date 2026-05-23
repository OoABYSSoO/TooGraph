from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


BREAKPOINT_METADATA_KEYS = {
    "interrupt_after",
    "interrupt_before",
    "agent_breakpoint_timing",
    "auto_resume_after_ui_operation_nodes",
}
SUPPORTED_KINDS = {"action", "subgraph", "tool"}
SELF_ACTION_KEY = "toograph_capability_selector"


def discover_capability_catalog(repo_root: Path | None = None) -> dict[str, Any]:
    root = repo_root or _repo_root()
    errors: list[dict[str, str]] = []
    subgraphs = _discover_subgraphs(root, errors=errors)
    actions = _discover_actions(root, errors=errors)
    tools = _discover_tools(root, errors=errors)
    return {
        "kind": "capability_catalog",
        "subgraphs": subgraphs,
        "actions": actions,
        "tools": tools,
        "counts": {
            "subgraphs": len(subgraphs),
            "actions": len(actions),
            "tools": len(tools),
            "errors": len(errors),
        },
        "errors": errors,
    }


def format_capability_catalog_context(catalog: dict[str, Any]) -> str:
    lines = [
        "Available TooGraph capabilities:",
        "",
        "Subgraphs:",
    ]
    lines.extend(_format_capability_items(_list(catalog.get("subgraphs"))))
    lines.append("")
    lines.append("Actions:")
    lines.extend(_format_capability_items(_list(catalog.get("actions"))))
    lines.append("")
    lines.append("Tools:")
    lines.extend(_format_capability_items(_list(catalog.get("tools"))))
    return "\n".join(lines)


def normalize_selected_capability(
    selected: Any,
    *,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any]:
    capability = _parse_capability(selected)
    kind = _text(capability.get("kind")).lower()
    reason = _text(capability.get("reason"))
    if not kind or kind == "none":
        return _none_capability()
    if kind not in SUPPORTED_KINDS:
        return _none_capability(f"Unsupported capability kind '{kind}'.")

    key = _text(capability.get("key"))
    if not key:
        return _none_capability(f"Capability kind '{kind}' requires a key.")

    resolved_catalog = catalog or discover_capability_catalog()
    indexed = {
        (item.get("kind"), item.get("key")): item
        for item in _iter_catalog_items(resolved_catalog)
        if item.get("kind") and item.get("key")
    }
    candidate = indexed.get((kind, key))
    if candidate is None:
        return _none_capability(f"Selected capability '{kind}:{key}' is not enabled or discoverable.")

    normalized = {
        "kind": kind,
        "key": key,
    }
    description = _text(candidate.get("description") or capability.get("description"))
    if description:
        normalized["description"] = description
    if reason:
        normalized["reason"] = reason
    confidence = _coerce_confidence(capability.get("confidence"))
    if confidence is not None:
        normalized["confidence"] = confidence
    return {"capability": normalized, "needs_capability": True}


def _discover_subgraphs(repo_root: Path, *, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    settings = _settings_entries(repo_root / "graph_template" / "settings.json")
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for template_path in sorted((repo_root / "graph_template").glob("*/*/template.json")):
        try:
            payload = json.loads(template_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append({"source": _display_path(repo_root, template_path), "error": str(exc)})
            continue
        key = _text(payload.get("template_id")) or template_path.parent.name
        if key in seen or _is_internal_template(payload):
            continue
        seen.add(key)
        if not _settings_enabled(settings, key):
            continue
        if not _template_capability_discoverable(payload, settings.get(key)):
            continue
        items.append(
            {
                "kind": "subgraph",
                "key": key,
                "description": _text(payload.get("description")),
            }
        )
    return _sort_items(items)


def _discover_actions(repo_root: Path, *, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    settings = _settings_entries(repo_root / "action" / "settings.json")
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for action_path in sorted((repo_root / "action").glob("*/*/action.json")):
        try:
            payload = json.loads(action_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append({"source": _display_path(repo_root, action_path), "error": str(exc)})
            continue
        key = _text(payload.get("actionKey") or payload.get("action_key") or action_path.parent.name)
        if not key or key in seen or key == SELF_ACTION_KEY:
            continue
        seen.add(key)
        if not _settings_enabled(settings, key):
            continue
        items.append(
            {
                "kind": "action",
                "key": key,
                "description": _text(payload.get("description")),
            }
        )
    return _sort_items(items)


def _discover_tools(repo_root: Path, *, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    settings = _settings_entries(repo_root / "tool" / "settings.json")
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tool_path in sorted((repo_root / "tool").glob("*/*/tool.json")):
        try:
            payload = json.loads(tool_path.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append({"source": _display_path(repo_root, tool_path), "error": str(exc)})
            continue
        key = _text(payload.get("toolKey") or payload.get("tool_key") or tool_path.parent.name)
        if not key or key in seen:
            continue
        seen.add(key)
        if not _settings_enabled(settings, key):
            continue
        items.append(
            {
                "kind": "tool",
                "key": key,
                "description": _text(payload.get("description")),
            }
        )
    return _sort_items(items)


def _format_capability_items(items: list[dict[str, Any]]) -> list[str]:
    if not items:
        return ["- none"]
    lines: list[str] = []
    for item in items:
        lines.append(f"- key: {item.get('key')}")
        lines.append(f"  description: {_text(item.get('description'))}")
    return lines


def _iter_catalog_items(catalog: dict[str, Any]):
    for section in ("subgraphs", "actions", "tools"):
        for item in _list(catalog.get(section)):
            yield item


def _parse_capability(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return {"kind": "none", "reason": value.strip()}
    return value if isinstance(value, dict) else {}


def _none_capability(reason: str = "") -> dict[str, Any]:
    capability = {
        "kind": "none",
    }
    if reason:
        capability["reason"] = reason
    return {
        "capability": capability,
        "needs_capability": False,
    }


def _template_capability_discoverable(payload: dict[str, Any], settings_entry: Any) -> bool:
    if _template_has_breakpoint_metadata(payload):
        return False
    default = True
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    if metadata.get("capabilityDiscoverableDefault") is False:
        default = False
    if isinstance(settings_entry, dict):
        return settings_entry.get("enabled", True) is not False and settings_entry.get("capabilityDiscoverable", default) is not False
    return default


def _template_has_breakpoint_metadata(payload: dict[str, Any]) -> bool:
    for graph in _iter_graph_payloads(payload):
        metadata = graph.get("metadata") if isinstance(graph.get("metadata"), dict) else {}
        if BREAKPOINT_METADATA_KEYS.intersection(metadata):
            return True
    return False


def _iter_graph_payloads(graph: dict[str, Any]):
    yield graph
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), dict) else {}
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        embedded = config.get("graph") if isinstance(config.get("graph"), dict) else None
        if embedded is not None:
            yield from _iter_graph_payloads(embedded)


def _is_internal_template(payload: dict[str, Any]) -> bool:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    return metadata.get("internal") is True


def _settings_entries(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    entries = payload.get("entries") if isinstance(payload, dict) else {}
    return entries if isinstance(entries, dict) else {}


def _settings_enabled(entries: dict[str, Any], key: str) -> bool:
    entry = entries.get(key)
    if isinstance(entry, dict):
        return entry.get("enabled") is not False
    return True


def _sort_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: (str(item.get("kind") or ""), str(item.get("key") or "")))


def _coerce_confidence(value: Any) -> float | None:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(1.0, confidence))


def _list(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _list_text(value: Any) -> list[str]:
    return [_text(item) for item in value if _text(item)] if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value or "").strip()


def _repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[3]


def _display_path(repo_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        return str(path)
