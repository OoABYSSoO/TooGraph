from __future__ import annotations

import copy
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.core.context_security import redact_context_secrets
from app.core.runtime.model_call_context import get_model_call_context
from app.core.storage.database import get_connection
from app.core.storage.settings_store import load_app_settings, save_app_settings
from app.core.storage import run_store


DEFAULT_MODEL_LOG_RETENTION_ROOT_RUNS = 200
MAX_MODEL_LOG_RETENTION_ROOT_RUNS = 10_000


def append_model_request_log(
    *,
    provider_id: str,
    transport: str,
    model: str,
    path: str,
    request_raw: dict[str, Any],
    response_raw: dict[str, Any],
    duration_ms: int,
    status_code: int | None = None,
    error: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    call_context = _normalize_model_call_context(context if context is not None else get_model_call_context())
    if not call_context.get("run_id"):
        return {}

    safe_request = sanitize_payload_for_log(request_raw)
    safe_response = sanitize_payload_for_log(response_raw)
    now = datetime.now(timezone.utc)
    normalized_duration_ms = max(0, int(duration_ms))
    started_at = (now - timedelta(milliseconds=normalized_duration_ms)).isoformat()
    completed_at = now.isoformat()
    model_call_id = f"log_{uuid4().hex[:12]}"
    status = "failed" if str(error or "").strip() else "completed"
    metadata = {
        **call_context,
        "provider_id": str(provider_id or "").strip() or "unknown",
        "transport": str(transport or "").strip() or "unknown",
        "path": _normalize_log_path(path),
        "status_code": status_code,
        "request_kind": detect_request_kind(safe_request, str(path or "")),
    }
    normalized_error = _sanitize_log_text(str(error or "").strip())
    error_payload = {"message": normalized_error} if normalized_error else {}

    try:
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO graph_model_calls (
                    model_call_id,
                    run_id,
                    execution_id,
                    node_id,
                    provider,
                    model,
                    status,
                    started_at,
                    completed_at,
                    duration_ms,
                    request_hash,
                    request_json,
                    response_hash,
                    response_json,
                    usage_json,
                    error_json,
                    metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    model_call_id,
                    call_context["run_id"],
                    call_context.get("execution_id") or None,
                    call_context.get("node_id") or None,
                    str(provider_id or "").strip() or "unknown",
                    str(model or "").strip() or _get_request_model(safe_request),
                    status,
                    started_at,
                    completed_at,
                    normalized_duration_ms,
                    _payload_hash(safe_request),
                    _json(safe_request),
                    _payload_hash(safe_response),
                    _json(safe_response),
                    _json(_extract_usage(safe_response)),
                    _json(error_payload),
                    _json(metadata),
                ),
            )
    except Exception:
        return {}

    try:
        prune_model_request_logs(max_root_runs=get_model_log_retention_settings()["max_root_runs"])
    except Exception:
        pass
    return _hydrate_log_entry(
        {
            "id": model_call_id,
            "timestamp": completed_at,
            "started_at": started_at,
            "completed_at": completed_at,
            "duration_ms": normalized_duration_ms,
            "provider_id": str(provider_id or "").strip() or "unknown",
            "transport": str(transport or "").strip() or "unknown",
            "model": str(model or "").strip() or _get_request_model(safe_request),
            "path": _normalize_log_path(path),
            "status_code": status_code,
            "status": status,
            "error": normalized_error,
            "request_raw": safe_request,
            "response_raw": safe_response,
            **call_context,
        }
    )


def list_model_request_logs(*, page: int = 1, size: int = 20, query: str = "") -> dict[str, Any]:
    page = max(1, int(page or 1))
    size = max(1, min(int(size or 20), 100))
    query_text = str(query or "").strip().lower()

    entries = _read_model_call_entries()
    if query_text:
        entries = [
            entry
            for entry in entries
            if query_text in json.dumps(entry, ensure_ascii=False).lower()
        ]

    total = len(entries)
    start = (page - 1) * size
    paginated = entries[start : start + size]
    return {
        "entries": paginated,
        "run_trees": build_model_log_run_trees(paginated),
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if total else 0,
        "retention": get_model_log_retention_settings(),
    }


def prune_model_request_logs(*, max_root_runs: int) -> int:
    max_root_runs = normalize_model_log_retention_root_runs(max_root_runs)
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                graph_runs.root_run_id AS root_run_id,
                COALESCE(root_runs.started_at, graph_runs.started_at, MAX(graph_model_calls.started_at)) AS root_started_at
            FROM graph_model_calls
            JOIN graph_runs ON graph_runs.run_id = graph_model_calls.run_id
            LEFT JOIN graph_runs AS root_runs ON root_runs.run_id = graph_runs.root_run_id
            GROUP BY graph_runs.root_run_id
            ORDER BY root_started_at DESC, graph_runs.root_run_id DESC
            """
        ).fetchall()
        root_run_ids = [str(row["root_run_id"] or "").strip() for row in rows if str(row["root_run_id"] or "").strip()]
        retained = set(root_run_ids[:max_root_runs])
        removable = [root_run_id for root_run_id in root_run_ids if root_run_id not in retained]
        if not removable:
            return 0
        placeholders = ",".join("?" for _item in removable)
        deleted = connection.execute(
            f"""
            DELETE FROM graph_model_calls
            WHERE run_id IN (
                SELECT run_id FROM graph_runs WHERE root_run_id IN ({placeholders})
            )
            """,
            removable,
        ).rowcount
    return max(0, int(deleted or 0))


def normalize_model_log_retention_root_runs(value: Any) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = DEFAULT_MODEL_LOG_RETENTION_ROOT_RUNS
    return max(1, min(count, MAX_MODEL_LOG_RETENTION_ROOT_RUNS))


def get_model_log_retention_settings(settings: dict[str, Any] | None = None) -> dict[str, int]:
    source = settings if isinstance(settings, dict) else load_app_settings()
    raw_settings = source.get("model_logs") if isinstance(source, dict) else {}
    payload = raw_settings if isinstance(raw_settings, dict) else {}
    return {
        "max_root_runs": normalize_model_log_retention_root_runs(payload.get("max_root_runs")),
    }


def save_model_log_retention_settings(*, max_root_runs: int) -> dict[str, int]:
    existing = load_app_settings()
    next_settings = dict(existing)
    next_settings["model_logs"] = {
        "max_root_runs": normalize_model_log_retention_root_runs(max_root_runs),
    }
    save_app_settings(next_settings)
    saved = get_model_log_retention_settings(next_settings)
    try:
        prune_model_request_logs(max_root_runs=saved["max_root_runs"])
    except Exception:
        pass
    return saved


def build_model_log_run_trees(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries_by_run = _group_entries_by_run(entries)
    root_run_ids: list[str] = []
    for entry in entries:
        root_run_id = str(entry.get("root_run_id") or entry.get("run_id") or "").strip()
        if root_run_id and root_run_id not in root_run_ids:
            root_run_ids.append(root_run_id)

    trees: list[dict[str, Any]] = []
    for root_run_id in root_run_ids:
        try:
            run_tree = run_store.build_run_tree(root_run_id)
        except FileNotFoundError:
            continue
        rendered = _build_tree_for_run(run_tree, entries_by_run)
        if rendered["children"] or rendered.get("model_log_ids"):
            trees.append(rendered)
    return trees


def sanitize_payload_for_log(value: Any) -> Any:
    if isinstance(value, dict):
        inline_media_mime_type = _resolve_inline_media_mime_type(value)
        return {
            str(key): _summarize_inline_media_data(raw_value, inline_media_mime_type)
            if str(key) == "data" and inline_media_mime_type
            else (
                sanitize_media_value_for_log(raw_value)
                if str(key) in {"url", "image", "video"}
                else sanitize_payload_for_log(raw_value)
            )
            for key, raw_value in value.items()
        }
    if isinstance(value, list):
        return [sanitize_payload_for_log(item) for item in value]
    if isinstance(value, str) and value.startswith("data:"):
        return summarize_inline_media_reference(value)
    if isinstance(value, str):
        return _sanitize_log_text(value)
    return value


def sanitize_media_value_for_log(value: Any) -> Any:
    if isinstance(value, list):
        return [sanitize_media_value_for_log(item) for item in value]
    if isinstance(value, str):
        if value.startswith("data:"):
            return summarize_inline_media_reference(value)
        if value.startswith("file://"):
            return f"<file-url {value[7:]}>"
    return sanitize_payload_for_log(value)


def summarize_inline_media_reference(url: str) -> str:
    head, _separator, _payload = url.partition(",")
    mime = "unknown"
    if head.startswith("data:"):
        mime = head[5:].split(";", 1)[0] or "unknown"
    return f"<inline-media-reference mime={mime} chars={len(url)}>"


def _sanitize_log_text(value: str) -> str:
    redacted, _warnings = redact_context_secrets(value, source_kind="model_request_log", source_refs=[])
    return redacted


def _read_model_call_entries() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                graph_model_calls.*,
                graph_runs.root_run_id AS joined_root_run_id,
                graph_runs.parent_run_id AS joined_parent_run_id,
                graph_runs.parent_node_id AS joined_parent_node_id,
                graph_runs.graph_id AS joined_graph_id,
                graph_runs.graph_name AS joined_graph_name,
                graph_runs.run_path_json AS joined_run_path_json
            FROM graph_model_calls
            JOIN graph_runs ON graph_runs.run_id = graph_model_calls.run_id
            ORDER BY graph_model_calls.started_at DESC, graph_model_calls.model_call_id DESC
            """
        ).fetchall()
    return [_hydrate_db_model_call(row) for row in rows]


def _hydrate_db_model_call(row: Any) -> dict[str, Any]:
    payload = dict(row)
    metadata = _loads(payload.get("metadata_json"), {})
    request_raw = _loads(payload.get("request_json"), {})
    response_raw = _loads(payload.get("response_json"), {})
    error_payload = _loads(payload.get("error_json"), {})
    error = str(error_payload.get("message") or metadata.get("error") or "").strip() if isinstance(error_payload, dict) else ""
    entry = {
        "id": str(payload.get("model_call_id") or ""),
        "timestamp": str(payload.get("completed_at") or payload.get("started_at") or ""),
        "started_at": str(payload.get("started_at") or ""),
        "completed_at": str(payload.get("completed_at") or ""),
        "duration_ms": int(payload.get("duration_ms") or 0),
        "provider_id": str(metadata.get("provider_id") or payload.get("provider") or "unknown"),
        "transport": str(metadata.get("transport") or "unknown"),
        "model": str(payload.get("model") or _get_request_model(request_raw)),
        "path": _normalize_log_path(str(metadata.get("path") or "")),
        "status": str(payload.get("status") or ""),
        "status_code": metadata.get("status_code"),
        "error": error,
        "request_raw": request_raw if isinstance(request_raw, dict) else {},
        "response_raw": response_raw if isinstance(response_raw, dict) else {},
        "run_id": str(payload.get("run_id") or ""),
        "root_run_id": str(metadata.get("root_run_id") or payload.get("joined_root_run_id") or payload.get("run_id") or ""),
        "parent_run_id": str(metadata.get("parent_run_id") or payload.get("joined_parent_run_id") or ""),
        "parent_node_id": str(metadata.get("parent_node_id") or payload.get("joined_parent_node_id") or ""),
        "execution_id": str(payload.get("execution_id") or ""),
        "node_id": str(payload.get("node_id") or metadata.get("node_id") or ""),
        "node_type": str(metadata.get("node_type") or ""),
        "node_name": str(metadata.get("node_name") or ""),
        "phase": str(metadata.get("phase") or ""),
        "subgraph_path": metadata.get("subgraph_path") if isinstance(metadata.get("subgraph_path"), list) else [],
        "graph_id": str(metadata.get("graph_id") or payload.get("joined_graph_id") or ""),
        "graph_name": str(metadata.get("graph_name") or payload.get("joined_graph_name") or ""),
        "run_path": metadata.get("run_path")
        if isinstance(metadata.get("run_path"), list)
        else _loads(payload.get("joined_run_path_json"), []),
    }
    return _hydrate_log_entry(entry)


def _hydrate_log_entry(entry: dict[str, Any]) -> dict[str, Any]:
    request_raw = entry.get("request_raw") if isinstance(entry.get("request_raw"), dict) else {}
    response_raw = entry.get("response_raw") if isinstance(entry.get("response_raw"), dict) else {}
    return {
        "id": str(entry.get("id") or ""),
        "timestamp": str(entry.get("timestamp") or ""),
        "started_at": str(entry.get("started_at") or ""),
        "completed_at": str(entry.get("completed_at") or ""),
        "duration_ms": int(entry.get("duration_ms") or 0),
        "provider_id": str(entry.get("provider_id") or "unknown"),
        "transport": str(entry.get("transport") or "unknown"),
        "model": str(entry.get("model") or _get_request_model(request_raw)),
        "path": _normalize_log_path(str(entry.get("path") or "")),
        "status": str(entry.get("status") or ""),
        "status_code": entry.get("status_code"),
        "error": str(entry.get("error") or ""),
        "request_kind": detect_request_kind(request_raw, str(entry.get("path") or "")),
        "messages": build_display_messages(request_raw),
        "reasoning": extract_reasoning(response_raw),
        "content": extract_response_content(response_raw),
        "request_raw": request_raw,
        "response_raw": response_raw,
        "run_id": str(entry.get("run_id") or ""),
        "root_run_id": str(entry.get("root_run_id") or entry.get("run_id") or ""),
        "parent_run_id": str(entry.get("parent_run_id") or ""),
        "parent_node_id": str(entry.get("parent_node_id") or ""),
        "execution_id": str(entry.get("execution_id") or ""),
        "node_id": str(entry.get("node_id") or ""),
        "node_type": str(entry.get("node_type") or ""),
        "node_name": str(entry.get("node_name") or ""),
        "phase": str(entry.get("phase") or ""),
        "subgraph_path": list(entry.get("subgraph_path") or []),
        "graph_id": str(entry.get("graph_id") or ""),
        "graph_name": str(entry.get("graph_name") or ""),
        "run_path": list(entry.get("run_path") or []),
    }


def _build_tree_for_run(run_node: dict[str, Any], entries_by_run: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    run_id = str(run_node.get("run_id") or "")
    entries = entries_by_run.get(run_id, [])
    direct_call_ids = [entry["id"] for entry in entries if not str(entry.get("node_id") or "").strip()]
    tree = {
        "kind": "run",
        "id": f"run:{run_id}",
        "run_id": run_id,
        "root_run_id": str(run_node.get("root_run_id") or run_id),
        "label": str(run_node.get("graph_name") or run_id),
        "status": str(run_node.get("status") or ""),
        "started_at": str(run_node.get("started_at") or ""),
        "duration_ms": run_node.get("duration_ms"),
        "model_log_ids": direct_call_ids,
        "children": [],
    }

    try:
        detail = run_store.load_run(run_id)
    except FileNotFoundError:
        detail = {}
    executions = [item for item in detail.get("node_executions", []) if isinstance(item, dict)]
    children_by_parent_node = _group_child_runs_by_parent_node(run_node.get("children") or [])
    emitted_child_runs: set[str] = set()
    emitted_log_ids: set[str] = set(direct_call_ids)

    for execution in executions:
        node_id = str(execution.get("node_id") or "").strip()
        node_type = str(execution.get("node_type") or "").strip()
        if node_type not in {"agent", "subgraph"} or not node_id:
            continue
        node_entries = _entries_for_execution(entries, execution)
        child_runs = children_by_parent_node.get(node_id, [])
        if not node_entries and not child_runs:
            continue
        child_nodes = [_build_tree_for_run(child, entries_by_run) for child in child_runs]
        emitted_child_runs.update(str(child.get("run_id") or "") for child in child_runs)
        model_log_ids = [entry["id"] for entry in node_entries]
        emitted_log_ids.update(model_log_ids)
        node_tree = {
            "kind": "graph_node",
            "id": f"node:{run_id}:{node_id}",
            "run_id": run_id,
            "node_id": node_id,
            "node_type": node_type,
            "execution_id": str(execution.get("execution_id") or ""),
            "label": str(execution.get("node_name") or execution.get("name") or node_id),
            "status": str(execution.get("status") or ""),
            "started_at": execution.get("started_at"),
            "duration_ms": execution.get("duration_ms"),
            "model_log_ids": model_log_ids,
            "children": child_nodes,
        }
        tree["children"].append(node_tree)

    fallback_entries_by_node: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        if entry["id"] in emitted_log_ids:
            continue
        node_id = str(entry.get("node_id") or "").strip()
        node_type = str(entry.get("node_type") or "agent").strip() or "agent"
        if node_type not in {"agent", "subgraph"} or not node_id:
            continue
        fallback_entries_by_node.setdefault(node_id, []).append(entry)

    for node_id, node_entries in fallback_entries_by_node.items():
        first_entry = node_entries[0]
        child_runs = children_by_parent_node.get(node_id, [])
        emitted_child_runs.update(str(child.get("run_id") or "") for child in child_runs)
        tree["children"].append(
            {
                "kind": "graph_node",
                "id": f"node:{run_id}:{node_id}",
                "run_id": run_id,
                "node_id": node_id,
                "node_type": str(first_entry.get("node_type") or "agent"),
                "execution_id": str(first_entry.get("execution_id") or ""),
                "label": str(first_entry.get("node_name") or node_id),
                "status": str(first_entry.get("status") or ""),
                "started_at": first_entry.get("started_at"),
                "duration_ms": first_entry.get("duration_ms"),
                "model_log_ids": [entry["id"] for entry in reversed(node_entries)],
                "children": [_build_tree_for_run(child, entries_by_run) for child in child_runs],
            }
        )

    for child_run in run_node.get("children") or []:
        child_run_id = str(child_run.get("run_id") or "")
        if child_run_id in emitted_child_runs:
            continue
        rendered_child = _build_tree_for_run(child_run, entries_by_run)
        if rendered_child["children"] or rendered_child.get("model_log_ids"):
            tree["children"].append(rendered_child)
    return tree


def _entries_for_execution(entries: list[dict[str, Any]], execution: dict[str, Any]) -> list[dict[str, Any]]:
    execution_id = str(execution.get("execution_id") or "").strip()
    node_id = str(execution.get("node_id") or "").strip()
    matched: list[dict[str, Any]] = []
    for entry in entries:
        if execution_id and str(entry.get("execution_id") or "").strip() == execution_id:
            matched.append(entry)
            continue
        if node_id and str(entry.get("node_id") or "").strip() == node_id:
            matched.append(entry)
    return list(reversed(matched))


def _group_child_runs_by_parent_node(children: list[Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for child in children:
        if not isinstance(child, dict):
            continue
        parent_node_id = str(child.get("parent_node_id") or "").strip()
        if not parent_node_id:
            continue
        grouped.setdefault(parent_node_id, []).append(child)
    return grouped


def _group_entries_by_run(entries: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        run_id = str(entry.get("run_id") or "").strip()
        if not run_id:
            continue
        grouped.setdefault(run_id, []).append(entry)
    return grouped


def _normalize_model_call_context(context: dict[str, Any]) -> dict[str, Any]:
    payload = context if isinstance(context, dict) else {}
    return {
        "run_id": _text(payload.get("run_id")),
        "root_run_id": _text(payload.get("root_run_id")) or _text(payload.get("run_id")),
        "parent_run_id": _text(payload.get("parent_run_id")),
        "parent_node_id": _text(payload.get("parent_node_id")),
        "execution_id": _text(payload.get("execution_id")),
        "node_id": _text(payload.get("node_id")),
        "node_type": _text(payload.get("node_type")),
        "node_name": _text(payload.get("node_name")),
        "phase": _text(payload.get("phase")),
        "graph_id": _text(payload.get("graph_id")),
        "graph_name": _text(payload.get("graph_name")),
        "run_path": _normalize_string_list(payload.get("run_path")),
        "subgraph_path": _normalize_string_list(payload.get("subgraph_path")),
    }


def build_display_messages(request_raw: dict[str, Any]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    system = request_raw.get("system") or request_raw.get("instructions") or request_raw.get("system_instruction")
    if system:
        messages.append({"role": "system", "body": extract_content(system)})

    raw_messages = request_raw.get("messages")
    if isinstance(raw_messages, list):
        for item in raw_messages:
            if not isinstance(item, dict):
                continue
            messages.append(
                {
                    "role": str(item.get("role") or "unknown"),
                    "body": extract_content(item.get("content")),
                }
            )

    codex_input = request_raw.get("input")
    if isinstance(codex_input, list):
        for item in codex_input:
            if not isinstance(item, dict):
                continue
            messages.append(
                {
                    "role": str(item.get("role") or "input"),
                    "body": extract_content(item.get("content")),
                }
            )

    gemini_contents = request_raw.get("contents")
    if isinstance(gemini_contents, list):
        for item in gemini_contents:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "user")
            messages.append({"role": role, "body": extract_content(item.get("parts"))})

    return messages


def extract_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [extract_content(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        if "text" in value:
            return extract_content(value.get("text"))
        if "content" in value:
            return extract_content(value.get("content"))
        if "thinking" in value:
            return extract_content(value.get("thinking"))
        if "image_url" in value:
            return extract_content(value.get("image_url"))
        if "url" in value:
            return str(value.get("url") or "")
        if "parts" in value:
            return extract_content(value.get("parts"))
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def extract_reasoning(response_raw: dict[str, Any]) -> str:
    reasoning = response_raw.get("reasoning") or response_raw.get("reasoning_content")
    if reasoning:
        return extract_content(reasoning).strip()

    choices = response_raw.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        delta = first_choice.get("delta") if isinstance(first_choice, dict) else {}
        for source in (message, delta):
            if isinstance(source, dict):
                value = source.get("reasoning_content") or source.get("reasoning")
                if value:
                    return extract_content(value).strip()

    output = response_raw.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "reasoning":
                parts.append(extract_content(item.get("summary") or item.get("content") or item.get("text")))
        return "\n".join(part for part in parts if part).strip()

    return ""


def extract_response_content(response_raw: dict[str, Any]) -> str:
    if response_raw.get("output_text"):
        return extract_content(response_raw.get("output_text")).strip()
    if response_raw.get("content"):
        return extract_content(response_raw.get("content")).strip()
    if response_raw.get("error"):
        return extract_content(response_raw.get("error")).strip()

    choices = response_raw.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        delta = first_choice.get("delta") if isinstance(first_choice, dict) else {}
        for source in (message, delta):
            if isinstance(source, dict):
                value = source.get("content") or source.get("text")
                if value:
                    return extract_content(value).strip()

    output = response_raw.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            if item.get("type") in {"message", "output_text", "text"}:
                parts.append(extract_content(item.get("content") or item.get("text")))
        return "\n".join(part for part in parts if part).strip()

    return ""


def detect_request_kind(request_raw: dict[str, Any], path: str) -> str:
    normalized_path = str(path or "").lower()
    if "responses" in normalized_path:
        return "responses"
    if "generatecontent" in normalized_path or "streamgeneratecontent" in normalized_path:
        return "gemini"
    if "messages" in normalized_path and "anthropic" not in normalized_path:
        return "chat"
    if "messages" in normalized_path:
        return "anthropic"
    if request_raw.get("messages"):
        return "chat"
    if request_raw.get("contents"):
        return "gemini"
    if request_raw.get("input"):
        return "responses"
    return "request"


def _resolve_inline_media_mime_type(value: dict[str, Any]) -> str:
    raw_mime_type = value.get("mime_type") or value.get("media_type")
    mime_type = str(raw_mime_type or "").strip()
    return mime_type if mime_type.startswith(("image/", "video/", "audio/")) else ""


def _summarize_inline_media_data(value: Any, mime_type: str) -> Any:
    if isinstance(value, str) and len(value) > 256:
        return f"<inline-media-data mime={mime_type} chars={len(value)}>"
    return sanitize_payload_for_log(value)


def _get_request_model(request_raw: dict[str, Any]) -> str:
    return str(request_raw.get("model") or "").strip()


def _normalize_log_path(path: str) -> str:
    normalized = str(path or "").strip()
    if not normalized:
        return "/"
    return normalized if normalized.startswith("/") else f"/{normalized}"


def _extract_usage(response_raw: dict[str, Any]) -> dict[str, Any]:
    usage = response_raw.get("usage")
    return copy.deepcopy(usage) if isinstance(usage, dict) else {}


def _payload_hash(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _loads(value: Any, default: Any) -> Any:
    if not isinstance(value, str) or value == "":
        return copy.deepcopy(default)
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return copy.deepcopy(default)


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item or "").strip()]


def _text(value: Any) -> str:
    return str(value or "").strip()
