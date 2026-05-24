from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.storage.database import DATA_DIR
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file
from app.core.storage.readable_names import is_safe_storage_name


GRAPH_REVISION_DATA_DIR = DATA_DIR / "graph_revisions"


def record_graph_revision(
    *,
    graph_id: str,
    previous_graph: dict[str, Any] | None,
    next_graph: dict[str, Any] | None,
    actor: str = "user",
    run_id: str = "",
    node_id: str = "",
    reason: str = "",
    validation: dict[str, Any] | None = None,
    storage_dir: Path | None = None,
) -> dict[str, Any]:
    revision_id = f"grev_{uuid4().hex[:12]}"
    created_at = utc_now_iso()
    record = {
        "revision_id": revision_id,
        "graph_id": graph_id,
        "previous_graph": previous_graph,
        "next_graph": next_graph,
        "diff": build_graph_revision_diff(previous_graph, next_graph),
        "actor": _compact_text(actor) or "user",
        "run_id": _compact_text(run_id),
        "node_id": _compact_text(node_id),
        "reason": _compact_text(reason),
        "validation": validation if isinstance(validation, dict) else {"valid": True, "issues": []},
        "created_at": created_at,
    }
    write_json_file(_revision_path(graph_id, revision_id, storage_dir=storage_dir), record)
    return record


def list_graph_revisions(graph_id: str, *, storage_dir: Path | None = None) -> list[dict[str, Any]]:
    revisions_dir = _graph_revision_dir(graph_id, storage_dir=storage_dir)
    if not revisions_dir.exists():
        return []
    revisions: list[tuple[dict[str, Any], int]] = []
    for path in revisions_dir.glob("*.json"):
        payload = read_json_file(path, default=None)
        if isinstance(payload, dict):
            revisions.append((payload, path.stat().st_mtime_ns))
    return [
        payload
        for payload, _mtime_ns in sorted(
            revisions,
            key=lambda item: (_compact_text(item[0].get("created_at")), item[1], _compact_text(item[0].get("revision_id"))),
            reverse=True,
        )
    ]


def load_graph_revision(graph_id: str, revision_id: str, *, storage_dir: Path | None = None) -> dict[str, Any]:
    payload = read_json_file(_revision_path(graph_id, revision_id, storage_dir=storage_dir), default=None)
    if not isinstance(payload, dict):
        raise FileNotFoundError(f"Graph revision '{revision_id}' does not exist.")
    return payload


def build_graph_revision_diff(previous_graph: dict[str, Any] | None, next_graph: dict[str, Any] | None) -> list[dict[str, Any]]:
    if previous_graph is None and next_graph is None:
        return []
    if previous_graph is None:
        return [{"op": "add", "path": "", "next": next_graph}]
    if next_graph is None:
        return [{"op": "remove", "path": "", "previous": previous_graph}]
    return _diff_values(previous_graph, next_graph, "")


def _diff_values(previous: Any, next_value: Any, path: str) -> list[dict[str, Any]]:
    if isinstance(previous, dict) and isinstance(next_value, dict):
        diff: list[dict[str, Any]] = []
        for key in sorted(set(previous) | set(next_value)):
            next_path = f"{path}/{_escape_json_pointer(str(key))}"
            previous_has_key = key in previous
            next_has_key = key in next_value
            if previous_has_key and not next_has_key:
                diff.append({"op": "remove", "path": next_path, "previous": previous[key]})
            elif next_has_key and not previous_has_key:
                diff.append({"op": "add", "path": next_path, "next": next_value[key]})
            else:
                diff.extend(_diff_values(previous[key], next_value[key], next_path))
        return diff
    if previous != next_value:
        return [{"op": "replace", "path": path, "previous": previous, "next": next_value}]
    return []


def _revision_path(graph_id: str, revision_id: str, *, storage_dir: Path | None = None) -> Path:
    return _graph_revision_dir(graph_id, storage_dir=storage_dir) / f"{revision_id}.json"


def _graph_revision_dir(graph_id: str, *, storage_dir: Path | None = None) -> Path:
    return (storage_dir or GRAPH_REVISION_DATA_DIR) / _safe_graph_id(graph_id)


def _safe_graph_id(graph_id: str) -> str:
    normalized = _compact_text(graph_id)
    if not is_safe_storage_name(normalized):
        raise ValueError("graph_id is invalid.")
    return normalized


def _escape_json_pointer(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _compact_text(value: Any) -> str:
    return str(value or "").strip()
