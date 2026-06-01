from __future__ import annotations

import copy
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.core.context_security import redact_context_secrets
from app.core.model_provider_costs import build_provider_cost_estimate, normalize_provider_model_pricing
from app.core.model_provider_rates import build_provider_rate_decision, normalize_provider_rate_profile
from app.core.runtime.model_call_context import get_model_call_context
from app.core.storage.database import get_connection
from app.core.storage.provider_prompt_cache_store import (
    normalize_provider_prompt_cache_resource_retention_days,
    prune_provider_prompt_cache_resources,
    summarize_provider_prompt_cache_resources,
)
from app.core.storage.settings_store import load_app_settings, save_app_settings


DEFAULT_MODEL_LOG_RETENTION_ROOT_RUNS = 200
MAX_MODEL_LOG_RETENTION_ROOT_RUNS = 10_000
MODEL_LOG_TREE_NODE_TYPES = {"agent", "new_llm", "subgraph"}


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
    provider_cost_estimate = build_provider_cost_estimate(
        _extract_usage(safe_response),
        call_context.get("provider_pricing"),
        call_context.get("provider_cost_budget"),
    )
    provider_rate_decision = build_provider_rate_decision(
        _extract_usage(safe_response),
        call_context.get("provider_rate_profile"),
    )
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
    if provider_rate_decision:
        metadata["provider_rate_decision"] = provider_rate_decision
    normalized_error = _sanitize_log_text(str(error or "").strip())
    error_payload = {"message": normalized_error} if normalized_error else {}

    try:
        with get_connection() as connection:
            if provider_cost_estimate:
                metadata["provider_cost_estimate"] = _apply_provider_cost_budget_window(
                    connection,
                    call_context=call_context,
                    provider_cost_estimate=provider_cost_estimate,
                    completed_at=now,
                )
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
        retention = get_model_log_retention_settings()
        prune_model_request_logs(max_root_runs=retention["max_root_runs"])
        prune_provider_prompt_cache_resources(
            max_terminal_age_days=retention["cache_resource_retention_days"]
        )
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
            **metadata,
        }
    )


def update_model_request_log_metadata(model_call_id: Any, metadata_patch: dict[str, Any]) -> dict[str, Any]:
    model_call_key = _text(model_call_id)
    if not model_call_key or not isinstance(metadata_patch, dict):
        return {}
    safe_patch: dict[str, Any] = {}
    _append_provider_context_fields(safe_patch, metadata_patch)
    if not safe_patch:
        return {}

    try:
        with get_connection() as connection:
            row = connection.execute(
                "SELECT metadata_json FROM graph_model_calls WHERE model_call_id = ?",
                (model_call_key,),
            ).fetchone()
            if row is None:
                return {}
            metadata = _loads(row["metadata_json"], {})
            metadata = metadata if isinstance(metadata, dict) else {}
            metadata.update(safe_patch)
            connection.execute(
                "UPDATE graph_model_calls SET metadata_json = ? WHERE model_call_id = ?",
                (_json(metadata), model_call_key),
            )
            updated_row = connection.execute(
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
                WHERE graph_model_calls.model_call_id = ?
                """,
                (model_call_key,),
            ).fetchone()
    except Exception:
        return {}

    return _hydrate_db_model_call(updated_row) if updated_row is not None else {}


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
    provider_cache_summary = build_provider_cache_summary(entries)

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
        "provider_cache_summary": provider_cache_summary,
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


def build_provider_cache_summary(entries: list[dict[str, Any]]) -> dict[str, Any]:
    decision_count = 0
    provider_applied_count = 0
    resource_created_count = 0
    resource_reused_count = 0
    cache_creation_input_tokens = 0
    cache_read_input_tokens = 0
    provider_cache_control_counts: dict[str, int] = {}

    for entry in entries:
        decision = entry.get("provider_cache_decision") if isinstance(entry, dict) else None
        if not isinstance(decision, dict) or not decision:
            continue
        decision_count += 1
        mode = _text(decision.get("mode"))
        if mode == "provider_applied":
            provider_applied_count += 1
        control = _text(decision.get("provider_cache_control")) or "unknown"
        provider_cache_control_counts[control] = provider_cache_control_counts.get(control, 0) + 1
        resource_status = _text(decision.get("cache_resource_status"))
        if resource_status == "created":
            resource_created_count += 1
        elif resource_status == "reused":
            resource_reused_count += 1
        usage = decision.get("provider_usage") if isinstance(decision.get("provider_usage"), dict) else decision.get("usage")
        if not isinstance(usage, dict):
            continue
        cache_creation_input_tokens += _non_negative_int(usage.get("cache_creation_input_tokens"))
        cache_read_input_tokens += _non_negative_int(
            usage.get("cache_read_input_tokens")
            if usage.get("cache_read_input_tokens") is not None
            else usage.get("cached_tokens")
        )

    resource_summary = summarize_provider_prompt_cache_resources()
    resource_status_counts = resource_summary.get("status_counts") if isinstance(resource_summary.get("status_counts"), dict) else {}
    resource_attempt_count = resource_created_count + resource_reused_count
    return {
        "kind": "provider_cache_summary",
        "version": 1,
        "decision_count": decision_count,
        "provider_applied_count": provider_applied_count,
        "resource_created_count": resource_created_count,
        "resource_reused_count": resource_reused_count,
        "resource_hit_rate": round(resource_reused_count / resource_attempt_count, 4) if resource_attempt_count else 0,
        "cache_creation_input_tokens": cache_creation_input_tokens,
        "cache_read_input_tokens": cache_read_input_tokens,
        "provider_cache_control_counts": provider_cache_control_counts,
        "resource_status_counts": {
            str(key): int(value)
            for key, value in resource_status_counts.items()
            if isinstance(value, (int, float))
        },
        "resource_total": int(resource_summary.get("total") or 0),
    }


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
        "cache_resource_retention_days": normalize_provider_prompt_cache_resource_retention_days(
            payload.get("cache_resource_retention_days")
        ),
    }


def save_model_log_retention_settings(
    *,
    max_root_runs: int,
    cache_resource_retention_days: int | None = None,
) -> dict[str, int]:
    existing = load_app_settings()
    existing_retention = get_model_log_retention_settings(existing)
    next_settings = dict(existing)
    next_settings["model_logs"] = {
        "max_root_runs": normalize_model_log_retention_root_runs(max_root_runs),
        "cache_resource_retention_days": normalize_provider_prompt_cache_resource_retention_days(
            cache_resource_retention_days
            if cache_resource_retention_days is not None
            else existing_retention["cache_resource_retention_days"]
        ),
    }
    save_app_settings(next_settings)
    saved = get_model_log_retention_settings(next_settings)
    try:
        prune_model_request_logs(max_root_runs=saved["max_root_runs"])
        prune_provider_prompt_cache_resources(
            max_terminal_age_days=saved["cache_resource_retention_days"]
        )
    except Exception:
        pass
    return saved


def evaluate_provider_cost_budget_preflight(
    call_context: dict[str, Any],
    cost_budget: Any,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    budget = cost_budget if isinstance(cost_budget, dict) else {}
    limit_usd = _normalize_optional_float(budget.get("limit_usd") or budget.get("limitUsd"))
    budget_window = _text(budget.get("window") or "run").lower()
    on_exceeded = _normalize_provider_cost_budget_on_exceeded(budget.get("on_exceeded") or budget.get("onExceeded"))
    if limit_usd is None or budget_window not in {"node", "run", "day", "month"}:
        return {}
    normalized_context = call_context if isinstance(call_context, dict) else {}
    if not _text(normalized_context.get("run_id")):
        return {}
    completed_at = now or datetime.now(timezone.utc)
    with get_connection() as connection:
        previous_window_cost = _previous_provider_cost_window_total_usd(
            connection,
            call_context=normalized_context,
            budget_window=budget_window,
            completed_at=completed_at,
        )
    status = "blocked" if previous_window_cost >= limit_usd else "within_budget"
    scope = _provider_cost_budget_window_scope(
        call_context=normalized_context,
        budget_window=budget_window,
        completed_at=completed_at,
    )
    result: dict[str, Any] = {
        "kind": "provider_cost_budget_preflight",
        "version": 1,
        "mode": "enforce_existing_window",
        "currency": "USD",
        "status": status,
        "reason": "provider_cost_budget_already_exhausted" if status == "blocked" else "provider_cost_budget_window_available",
        "budget_limit_usd": limit_usd,
        "budget_window": budget_window,
        "previous_window_cost_usd": previous_window_cost,
        "budget_window_scope": scope,
    }
    if on_exceeded != "block":
        result["on_exceeded"] = on_exceeded
    if status == "blocked" and on_exceeded == "request_approval":
        result["requires_approval"] = True
        result["approval_request"] = {
            "kind": "provider_cost_budget_approval_request",
            "version": 1,
            "reason": "provider_cost_budget_already_exhausted",
            "budget_limit_usd": limit_usd,
            "previous_window_cost_usd": previous_window_cost,
            "budget_window": budget_window,
            "budget_window_scope": scope,
            "requested_action": "approve_budget_overrun_or_degrade_model",
        }
    if status == "blocked" and on_exceeded == "degrade_model":
        result["requires_degradation"] = True
    return result


def evaluate_provider_rate_profile_preflight(
    call_context: dict[str, Any],
    rate_profile: Any,
    *,
    estimated_request_tokens: Any = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    with get_connection() as connection:
        return _evaluate_provider_rate_profile_preflight_with_connection(
            connection,
            call_context,
            rate_profile,
            estimated_request_tokens=estimated_request_tokens,
            now=now,
        )


def reserve_provider_rate_profile_capacity(
    call_context: dict[str, Any],
    rate_profile: Any,
    *,
    estimated_request_tokens: Any = None,
    now: datetime | None = None,
    ttl_seconds: int = 60,
) -> dict[str, Any]:
    profile = normalize_provider_rate_profile(rate_profile)
    if not profile:
        return {}
    normalized_context = call_context if isinstance(call_context, dict) else {}
    run_id = _text(normalized_context.get("run_id"))
    if not run_id:
        return {}
    reserved_at = _normalize_datetime(now or datetime.now(timezone.utc))
    normalized_estimated_request_tokens = _normalize_estimated_token_count(estimated_request_tokens) or 0
    reservation_id = f"rate_res_{uuid4().hex[:12]}"
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        decision = _evaluate_provider_rate_profile_preflight_with_connection(
            connection,
            normalized_context,
            profile,
            estimated_request_tokens=normalized_estimated_request_tokens,
            now=reserved_at,
        )
        if decision.get("status") == "blocked":
            return decision
        provider_id = _text(normalized_context.get("provider_id"))
        expires_at = reserved_at + timedelta(seconds=max(1, int(ttl_seconds or 60)))
        connection.execute(
            """
            INSERT INTO provider_rate_reservations (
                reservation_id,
                run_id,
                root_run_id,
                node_id,
                provider,
                model,
                status,
                estimated_request_tokens,
                reserved_at,
                expires_at,
                metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
            """,
            (
                reservation_id,
                run_id,
                _text(normalized_context.get("root_run_id")),
                _text(normalized_context.get("node_id")),
                provider_id,
                _text(normalized_context.get("model")),
                normalized_estimated_request_tokens,
                _format_datetime_precise(reserved_at),
                _format_datetime_precise(expires_at),
                _json(
                    {
                        "rate_profile": profile,
                        "decision": decision,
                    }
                ),
            ),
        )
    return {
        "kind": "provider_rate_reservation",
        "version": 1,
        "status": "reserved",
        "reservation_id": reservation_id,
        "provider_id": _text(normalized_context.get("provider_id")),
        "model": _text(normalized_context.get("model")),
        "run_id": run_id,
        "root_run_id": _text(normalized_context.get("root_run_id")),
        "node_id": _text(normalized_context.get("node_id")),
        "estimated_request_tokens": normalized_estimated_request_tokens,
        "reserved_at": _format_datetime_precise(reserved_at),
        "expires_at": _format_datetime_precise(expires_at),
        "decision": decision,
    }


def release_provider_rate_reservation(reservation_id: Any, *, released_at: datetime | None = None) -> dict[str, Any]:
    normalized_reservation_id = _text(reservation_id)
    if not normalized_reservation_id:
        return {}
    normalized_released_at = _normalize_datetime(released_at or datetime.now(timezone.utc))
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT reservation_id, status
            FROM provider_rate_reservations
            WHERE reservation_id = ?
            """,
            (normalized_reservation_id,),
        ).fetchone()
        if row is None:
            return {}
        connection.execute(
            """
            UPDATE provider_rate_reservations
            SET status = 'released', released_at = ?
            WHERE reservation_id = ? AND status = 'active'
            """,
            (_format_datetime_precise(normalized_released_at), normalized_reservation_id),
        )
    return {
        "kind": "provider_rate_reservation",
        "version": 1,
        "status": "released",
        "reservation_id": normalized_reservation_id,
        "released_at": _format_datetime_precise(normalized_released_at),
    }


def enqueue_provider_rate_wait_queue_entry(
    queue_key: Any,
    call_context: dict[str, Any] | None = None,
    *,
    now: datetime | None = None,
    ttl_seconds: int = 60,
) -> dict[str, Any]:
    normalized_queue_key = _text(queue_key)
    if not normalized_queue_key:
        return {}
    normalized_context = call_context if isinstance(call_context, dict) else {}
    enqueued_at = _normalize_datetime(now or datetime.now(timezone.utc))
    normalized_ttl_seconds = max(1, int(ttl_seconds or 60))
    expires_at = enqueued_at + timedelta(seconds=normalized_ttl_seconds)
    queue_entry_id = f"rate_wait_{uuid4().hex[:12]}"
    payload = {
        "queue_key": normalized_queue_key,
        "context": normalized_context,
        "ttl_seconds": normalized_ttl_seconds,
    }
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO provider_rate_wait_queue (
                queue_entry_id,
                queue_key,
                run_id,
                root_run_id,
                node_id,
                provider,
                model,
                status,
                enqueued_at,
                expires_at,
                metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?)
            """,
            (
                queue_entry_id,
                normalized_queue_key,
                _text(normalized_context.get("run_id")),
                _text(normalized_context.get("root_run_id")),
                _text(normalized_context.get("node_id")),
                _text(normalized_context.get("provider_id")),
                _text(normalized_context.get("model")),
                _format_datetime_precise(enqueued_at),
                _format_datetime_precise(expires_at),
                _json(payload),
            ),
        )
    return {
        "kind": "provider_rate_wait_queue_entry",
        "version": 1,
        "status": "waiting",
        "queue_entry_id": queue_entry_id,
        "queue_key": normalized_queue_key,
        "run_id": _text(normalized_context.get("run_id")),
        "root_run_id": _text(normalized_context.get("root_run_id")),
        "node_id": _text(normalized_context.get("node_id")),
        "provider_id": _text(normalized_context.get("provider_id")),
        "model": _text(normalized_context.get("model")),
        "enqueued_at": _format_datetime_precise(enqueued_at),
        "expires_at": _format_datetime_precise(expires_at),
    }


def claim_provider_rate_wait_queue_turn(queue_entry_id: Any, *, now: datetime | None = None) -> dict[str, Any]:
    normalized_queue_entry_id = _text(queue_entry_id)
    if not normalized_queue_entry_id:
        return {}
    acquired_at = _normalize_datetime(now or datetime.now(timezone.utc))
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        expired_count = _expire_provider_rate_wait_queue_entries(connection, acquired_at)
        row = connection.execute(
            """
            SELECT queue_entry_id, queue_key, status, run_id, root_run_id, node_id, provider, model, enqueued_at, expires_at
            FROM provider_rate_wait_queue
            WHERE queue_entry_id = ?
            """,
            (normalized_queue_entry_id,),
        ).fetchone()
        if row is None:
            return {}
        if row["status"] not in {"waiting", "acquired"}:
            return _provider_rate_wait_queue_payload(row, position=0, expired_count=expired_count)
        active_rows = connection.execute(
            """
            SELECT queue_entry_id
            FROM provider_rate_wait_queue
            WHERE queue_key = ? AND status IN ('waiting', 'acquired')
            ORDER BY enqueued_at ASC, queue_entry_id ASC
            """,
            (row["queue_key"],),
        ).fetchall()
        active_ids = [str(active_row["queue_entry_id"] or "") for active_row in active_rows]
        try:
            position = active_ids.index(normalized_queue_entry_id)
        except ValueError:
            position = 0
        if position == 0:
            connection.execute(
                """
                UPDATE provider_rate_wait_queue
                SET status = 'acquired',
                    acquired_at = CASE WHEN acquired_at = '' THEN ? ELSE acquired_at END
                WHERE queue_entry_id = ? AND status IN ('waiting', 'acquired')
                """,
                (_format_datetime_precise(acquired_at), normalized_queue_entry_id),
            )
            row = connection.execute(
                """
                SELECT queue_entry_id, queue_key, status, run_id, root_run_id, node_id, provider, model, enqueued_at, expires_at
                FROM provider_rate_wait_queue
                WHERE queue_entry_id = ?
                """,
                (normalized_queue_entry_id,),
            ).fetchone()
        return _provider_rate_wait_queue_payload(row, position=position, expired_count=expired_count)


def release_provider_rate_wait_queue_entry(
    queue_entry_id: Any,
    *,
    released_at: datetime | None = None,
) -> dict[str, Any]:
    normalized_queue_entry_id = _text(queue_entry_id)
    if not normalized_queue_entry_id:
        return {}
    normalized_released_at = _normalize_datetime(released_at or datetime.now(timezone.utc))
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE provider_rate_wait_queue
            SET status = 'released', released_at = ?
            WHERE queue_entry_id = ? AND status IN ('waiting', 'acquired')
            """,
            (_format_datetime_precise(normalized_released_at), normalized_queue_entry_id),
        )
        row = connection.execute(
            """
            SELECT queue_entry_id, queue_key, status, run_id, root_run_id, node_id, provider, model, enqueued_at, expires_at
            FROM provider_rate_wait_queue
            WHERE queue_entry_id = ?
            """,
            (normalized_queue_entry_id,),
        ).fetchone()
    if row is None:
        return {}
    return {
        **_provider_rate_wait_queue_payload(row, position=0, expired_count=0),
        "released_at": _format_datetime_precise(normalized_released_at),
    }


def _evaluate_provider_rate_profile_preflight_with_connection(
    connection: Any,
    call_context: dict[str, Any],
    rate_profile: Any,
    *,
    estimated_request_tokens: Any = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    profile = normalize_provider_rate_profile(rate_profile)
    if not profile:
        return {}
    normalized_context = call_context if isinstance(call_context, dict) else {}
    if not _text(normalized_context.get("run_id")):
        return {}

    completed_at = now or datetime.now(timezone.utc)
    window_seconds = 60
    window_start = _normalize_datetime(completed_at) - timedelta(seconds=window_seconds)
    provider_id = _text(normalized_context.get("provider_id"))
    rows = _recent_provider_model_call_rows(
        connection,
        provider_id=provider_id,
        started_at=window_start,
        ended_at=_normalize_datetime(completed_at),
    )
    reservation_rows = _active_provider_rate_reservation_rows(
        connection,
        provider_id=provider_id,
        started_at=window_start,
        ended_at=_normalize_datetime(completed_at),
    )
    observed_requests = len(rows)
    observed_total_tokens = sum(_usage_total_tokens(_loads(row["usage_json"], {})) for row in rows)
    reserved_requests = len(reservation_rows)
    reserved_total_tokens = sum(int(row["estimated_request_tokens"] or 0) for row in reservation_rows)
    normalized_estimated_request_tokens = _normalize_estimated_token_count(estimated_request_tokens)
    projected_total_tokens = (
        observed_total_tokens + reserved_total_tokens + normalized_estimated_request_tokens
        if normalized_estimated_request_tokens is not None
        else observed_total_tokens + reserved_total_tokens
    )
    limit_exceeded: list[str] = []
    requests_per_minute = profile.get("requests_per_minute")
    tokens_per_minute = profile.get("tokens_per_minute")
    if requests_per_minute is not None and observed_requests + reserved_requests >= requests_per_minute:
        limit_exceeded.append("requests_per_minute")
    if tokens_per_minute is not None and observed_total_tokens + reserved_total_tokens >= tokens_per_minute:
        limit_exceeded.append("tokens_per_minute")
    elif tokens_per_minute is not None and normalized_estimated_request_tokens is not None and projected_total_tokens > tokens_per_minute:
        limit_exceeded.append("tokens_per_minute")
    status = "blocked" if limit_exceeded else "within_profile"
    reason = "provider_rate_profile_window_available"
    if status == "blocked":
        reason = (
            "provider_rate_profile_already_exhausted"
            if tokens_per_minute is None or observed_total_tokens >= tokens_per_minute or "requests_per_minute" in limit_exceeded
            else "provider_rate_profile_projected_window_exhausted"
        )
    result: dict[str, Any] = {
        "kind": "provider_rate_profile_preflight",
        "version": 1,
        "mode": "enforce_recent_window",
        "status": status,
        "reason": reason,
        **profile,
        "observed_requests": observed_requests,
        "observed_total_tokens": observed_total_tokens,
        "reserved_requests": reserved_requests,
        "reserved_total_tokens": reserved_total_tokens,
        "limit_exceeded": limit_exceeded,
        "window_seconds": window_seconds,
        "window_started_at": _format_datetime(window_start),
        "window_ended_at": _format_datetime(_normalize_datetime(completed_at)),
        "scope": {
            "provider_id": provider_id,
        },
    }
    if "concurrency" in profile:
        result["unenforced_limits"] = ["concurrency"]
    if normalized_estimated_request_tokens is not None:
        result["estimated_request_tokens"] = normalized_estimated_request_tokens
        result["projected_total_tokens"] = projected_total_tokens
    retry_after_seconds = _provider_rate_retry_after_seconds(
        _provider_rate_window_entries(rows, reservation_rows),
        completed_at=_normalize_datetime(completed_at),
        window_seconds=window_seconds,
        requests_per_minute=requests_per_minute,
        tokens_per_minute=tokens_per_minute,
        estimated_request_tokens=normalized_estimated_request_tokens,
        limit_exceeded=limit_exceeded,
    )
    if status == "blocked" and retry_after_seconds is not None:
        result["retry_after_seconds"] = retry_after_seconds
        result["retry_after_at"] = _format_datetime_precise(
            _normalize_datetime(completed_at) + timedelta(seconds=retry_after_seconds)
        )
    return result


def _expire_provider_rate_wait_queue_entries(connection: Any, now: datetime) -> int:
    result = connection.execute(
        """
        UPDATE provider_rate_wait_queue
        SET status = 'expired'
        WHERE status IN ('waiting', 'acquired') AND expires_at <= ?
        """,
        (_format_datetime_precise(_normalize_datetime(now)),),
    )
    return max(0, int(result.rowcount or 0))


def _provider_rate_wait_queue_payload(row: Any, *, position: int, expired_count: int) -> dict[str, Any]:
    if row is None:
        return {}
    return {
        "kind": "provider_rate_wait_queue_entry",
        "version": 1,
        "status": _text(row["status"]),
        "queue_entry_id": _text(row["queue_entry_id"]),
        "queue_key": _text(row["queue_key"]),
        "run_id": _text(row["run_id"]),
        "root_run_id": _text(row["root_run_id"]),
        "node_id": _text(row["node_id"]),
        "provider_id": _text(row["provider"]),
        "model": _text(row["model"]),
        "enqueued_at": _text(row["enqueued_at"]),
        "expires_at": _text(row["expires_at"]),
        "position": max(0, int(position or 0)),
        "expired_count": max(0, int(expired_count or 0)),
    }


def _apply_provider_cost_budget_window(
    connection: Any,
    *,
    call_context: dict[str, Any],
    provider_cost_estimate: dict[str, Any],
    completed_at: datetime,
) -> dict[str, Any]:
    if provider_cost_estimate.get("status") != "estimated":
        return provider_cost_estimate
    current_cost = _normalize_optional_float(provider_cost_estimate.get("estimated_cost_usd"))
    budget_limit = _normalize_optional_float(provider_cost_estimate.get("budget_limit_usd"))
    budget_window = _text(provider_cost_estimate.get("budget_window") or "run").lower()
    if current_cost is None or budget_limit is None or budget_window not in {"node", "run", "day", "month"}:
        return provider_cost_estimate

    previous_window_cost = _previous_provider_cost_window_total_usd(
        connection,
        call_context=call_context,
        budget_window=budget_window,
        completed_at=completed_at,
    )
    cumulative_cost = _round_usd(previous_window_cost + current_cost)
    cumulative_status = "over_budget" if cumulative_cost > budget_limit else "within_budget"
    result = dict(provider_cost_estimate)
    result["single_call_budget_status"] = result.get("budget_status")
    result["previous_window_cost_usd"] = previous_window_cost
    result["cumulative_cost_usd"] = cumulative_cost
    result["cumulative_budget_status"] = cumulative_status
    result["budget_status"] = cumulative_status
    result["budget_window_scope"] = _provider_cost_budget_window_scope(
        call_context=call_context,
        budget_window=budget_window,
        completed_at=completed_at,
    )
    return result


def _recent_provider_model_call_rows(
    connection: Any,
    *,
    provider_id: str,
    started_at: datetime,
    ended_at: datetime,
) -> list[Any]:
    if provider_id:
        return connection.execute(
            """
            SELECT usage_json, completed_at
            FROM graph_model_calls
            WHERE provider = ? AND completed_at >= ? AND completed_at <= ?
            """,
            (provider_id, _format_datetime_precise(started_at), _format_datetime_precise(ended_at)),
        ).fetchall()
    return connection.execute(
        """
        SELECT usage_json, completed_at
        FROM graph_model_calls
        WHERE completed_at >= ? AND completed_at <= ?
        """,
        (_format_datetime_precise(started_at), _format_datetime_precise(ended_at)),
    ).fetchall()


def _active_provider_rate_reservation_rows(
    connection: Any,
    *,
    provider_id: str,
    started_at: datetime,
    ended_at: datetime,
) -> list[Any]:
    _expire_provider_rate_reservations(connection, now=ended_at)
    if provider_id:
        return connection.execute(
            """
            SELECT estimated_request_tokens, reserved_at, expires_at
            FROM provider_rate_reservations
            WHERE provider = ?
              AND status = 'active'
              AND reserved_at >= ?
              AND reserved_at <= ?
              AND expires_at > ?
            """,
            (
                provider_id,
                _format_datetime_precise(started_at),
                _format_datetime_precise(ended_at),
                _format_datetime_precise(ended_at),
            ),
        ).fetchall()
    return connection.execute(
        """
        SELECT estimated_request_tokens, reserved_at, expires_at
        FROM provider_rate_reservations
        WHERE status = 'active'
          AND reserved_at >= ?
          AND reserved_at <= ?
          AND expires_at > ?
        """,
        (
            _format_datetime_precise(started_at),
            _format_datetime_precise(ended_at),
            _format_datetime_precise(ended_at),
        ),
    ).fetchall()


def _expire_provider_rate_reservations(connection: Any, *, now: datetime) -> None:
    connection.execute(
        """
        UPDATE provider_rate_reservations
        SET status = 'expired'
        WHERE status = 'active' AND expires_at <= ?
        """,
        (_format_datetime_precise(now),),
    )


def _provider_rate_window_entries(rows: list[Any], reservation_rows: list[Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for row in rows:
        completed_at = _parse_datetime_text(row["completed_at"])
        if completed_at is not None:
            entries.append(
                {
                    "completed_at": completed_at,
                    "tokens": _usage_total_tokens(_loads(row["usage_json"], {})),
                }
            )
    for row in reservation_rows:
        reserved_at = _parse_datetime_text(row["reserved_at"])
        if reserved_at is not None:
            entries.append(
                {
                    "completed_at": reserved_at,
                    "tokens": int(row["estimated_request_tokens"] or 0),
                }
            )
    return entries


def _previous_provider_cost_window_total_usd(
    connection: Any,
    *,
    call_context: dict[str, Any],
    budget_window: str,
    completed_at: datetime,
) -> float:
    if budget_window == "node":
        rows = connection.execute(
            """
            SELECT metadata_json
            FROM graph_model_calls
            WHERE run_id = ? AND COALESCE(node_id, '') = ?
            """,
            (
                _text(call_context.get("run_id")),
                _text(call_context.get("node_id")),
            ),
        ).fetchall()
    elif budget_window == "run":
        root_run_id = _text(call_context.get("root_run_id")) or _text(call_context.get("run_id"))
        rows = connection.execute(
            """
            SELECT graph_model_calls.metadata_json AS metadata_json
            FROM graph_model_calls
            JOIN graph_runs ON graph_runs.run_id = graph_model_calls.run_id
            WHERE COALESCE(graph_runs.root_run_id, graph_model_calls.run_id) = ?
            """,
            (root_run_id,),
        ).fetchall()
    else:
        start, end = _provider_cost_time_window_bounds(budget_window, completed_at)
        rows = connection.execute(
            """
            SELECT metadata_json
            FROM graph_model_calls
            WHERE completed_at >= ? AND completed_at < ?
            """,
            (_format_datetime(start), _format_datetime(end)),
        ).fetchall()
    return _round_usd(sum(_provider_cost_estimate_usd(_loads(row["metadata_json"], {})) for row in rows))


def _provider_cost_estimate_usd(metadata: Any) -> float:
    payload = metadata if isinstance(metadata, dict) else {}
    estimate = payload.get("provider_cost_estimate")
    if not isinstance(estimate, dict):
        return 0.0
    if estimate.get("status") != "estimated":
        return 0.0
    cost = _normalize_optional_float(estimate.get("estimated_cost_usd"))
    return cost if cost is not None else 0.0


def _usage_total_tokens(usage: Any) -> int:
    payload = usage if isinstance(usage, dict) else {}
    total_tokens = _normalize_optional_float(
        payload.get("total_tokens")
        or payload.get("totalTokens")
        or payload.get("total_token_count")
        or payload.get("totalTokenCount")
    )
    if total_tokens is not None:
        return int(total_tokens)
    input_tokens = _normalize_optional_float(
        payload.get("input_tokens")
        or payload.get("prompt_tokens")
        or payload.get("inputTokens")
        or payload.get("promptTokens")
        or payload.get("promptTokenCount")
    )
    output_tokens = _normalize_optional_float(
        payload.get("output_tokens")
        or payload.get("completion_tokens")
        or payload.get("outputTokens")
        or payload.get("completionTokens")
        or payload.get("candidatesTokenCount")
    )
    return int(input_tokens or 0) + int(output_tokens or 0)


def _provider_rate_retry_after_seconds(
    window_entries: list[dict[str, Any]],
    *,
    completed_at: datetime,
    window_seconds: int,
    requests_per_minute: int | None,
    tokens_per_minute: int | None,
    estimated_request_tokens: int | None,
    limit_exceeded: list[str],
) -> int | None:
    if not limit_exceeded:
        return None
    if not window_entries:
        return None

    ordered_rows = sorted(window_entries, key=lambda row: row["completed_at"])
    retry_at_candidates: list[datetime] = []
    if "requests_per_minute" in limit_exceeded and requests_per_minute is not None:
        expire_count = len(ordered_rows) - requests_per_minute + 1
        if expire_count > 0 and expire_count <= len(ordered_rows):
            retry_at_candidates.append(ordered_rows[expire_count - 1]["completed_at"] + timedelta(seconds=window_seconds))

    if "tokens_per_minute" in limit_exceeded and tokens_per_minute is not None:
        remaining_tokens = sum(int(row["tokens"] or 0) for row in ordered_rows)
        target_tokens = (
            tokens_per_minute - estimated_request_tokens
            if estimated_request_tokens is not None
            else tokens_per_minute - 1
        )
        if target_tokens >= 0:
            for row in ordered_rows:
                if remaining_tokens <= target_tokens:
                    break
                remaining_tokens -= int(row["tokens"] or 0)
                retry_at_candidates.append(row["completed_at"] + timedelta(seconds=window_seconds))

    if not retry_at_candidates:
        return None
    retry_after = max(retry_at_candidates) - _normalize_datetime(completed_at)
    return max(0, int(math.ceil(retry_after.total_seconds())))


def _normalize_estimated_token_count(value: Any) -> int | None:
    normalized = _normalize_optional_float(value)
    if normalized is None:
        return None
    if normalized <= 0:
        return 0
    return int(math.ceil(normalized))


def _non_negative_int(value: Any) -> int:
    normalized = _normalize_optional_float(value)
    if normalized is None or normalized <= 0:
        return 0
    return int(normalized)


def _provider_cost_budget_window_scope(
    *,
    call_context: dict[str, Any],
    budget_window: str,
    completed_at: datetime,
) -> dict[str, Any]:
    if budget_window == "node":
        return {
            "window": "node",
            "run_id": _text(call_context.get("run_id")),
            "node_id": _text(call_context.get("node_id")),
        }
    if budget_window == "run":
        return {
            "window": "run",
            "root_run_id": _text(call_context.get("root_run_id")) or _text(call_context.get("run_id")),
        }
    start, end = _provider_cost_time_window_bounds(budget_window, completed_at)
    return {
        "window": budget_window,
        "started_at": _format_datetime(start),
        "ended_before": _format_datetime(end),
    }


def _provider_cost_time_window_bounds(budget_window: str, completed_at: datetime) -> tuple[datetime, datetime]:
    normalized_completed_at = _normalize_datetime(completed_at)
    if budget_window == "month":
        start = normalized_completed_at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        return start, end
    start = normalized_completed_at.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_datetime_text(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return _normalize_datetime(parsed)


def _format_datetime(value: datetime) -> str:
    return _normalize_datetime(value).replace(microsecond=0).isoformat()


def _format_datetime_precise(value: datetime) -> str:
    return _normalize_datetime(value).isoformat()


def _round_usd(value: float) -> float:
    return round(float(value), 12)


def build_model_log_run_trees(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    entries_by_run = _group_entries_by_run(entries)
    root_run_ids: list[str] = []
    for entry in entries:
        root_run_id = str(entry.get("root_run_id") or entry.get("run_id") or "").strip()
        if root_run_id and root_run_id not in root_run_ids:
            root_run_ids.append(root_run_id)
    if not root_run_ids:
        return []

    runs_by_id, executions_by_run = _read_model_log_run_context(root_run_ids)
    children_by_parent: dict[str, list[dict[str, Any]]] = {}
    for run in runs_by_id.values():
        parent_run_id = str(run.get("parent_run_id") or "").strip()
        if parent_run_id:
            children_by_parent.setdefault(parent_run_id, []).append(run)
    for children in children_by_parent.values():
        children.sort(key=_model_log_run_sort_key)

    def build_run_node(run: dict[str, Any], seen: set[str]) -> dict[str, Any]:
        run_id = str(run.get("run_id") or "")
        node = {**run, "children": []}
        if not run_id or run_id in seen:
            return node
        next_seen = {*seen, run_id}
        node["children"] = [
            build_run_node(child, next_seen)
            for child in children_by_parent.get(run_id, [])
        ]
        return node

    trees: list[dict[str, Any]] = []
    for root_run_id in root_run_ids:
        root_run = runs_by_id.get(root_run_id)
        if root_run is None:
            continue
        rendered = _build_tree_for_run(build_run_node(root_run, set()), entries_by_run, executions_by_run)
        if rendered["children"] or rendered.get("model_log_ids"):
            trees.append(rendered)
    return trees


def _read_model_log_run_context(root_run_ids: list[str]) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    normalized_root_run_ids = [run_id for run_id in dict.fromkeys(str(item or "").strip() for item in root_run_ids) if run_id]
    if not normalized_root_run_ids:
        return {}, {}
    root_placeholders = ",".join("?" for _item in normalized_root_run_ids)
    with get_connection() as connection:
        run_rows = connection.execute(
            f"""
            SELECT
                run_id,
                root_run_id,
                parent_run_id,
                parent_node_id,
                invocation_kind,
                invocation_key,
                run_depth,
                run_path_json,
                graph_id,
                graph_name,
                status,
                current_node_id,
                started_at,
                completed_at,
                duration_ms,
                final_result,
                batch_group_id,
                batch_item_index,
                batch_item_label
            FROM graph_runs
            WHERE run_id IN ({root_placeholders})
               OR root_run_id IN ({root_placeholders})
            ORDER BY run_depth ASC, started_at ASC, run_id ASC
            """,
            (*normalized_root_run_ids, *normalized_root_run_ids),
        ).fetchall()
        runs_by_id = {_text(row["run_id"]): _model_log_run_summary(row) for row in run_rows if _text(row["run_id"])}
        if not runs_by_id:
            return {}, {}
        run_ids = list(runs_by_id.keys())
        run_placeholders = ",".join("?" for _item in run_ids)
        execution_rows = connection.execute(
            f"""
            SELECT
                run_id,
                execution_id,
                node_id,
                node_type,
                node_name,
                status,
                started_at,
                duration_ms,
                order_index
            FROM graph_node_executions
            WHERE run_id IN ({run_placeholders})
            ORDER BY run_id ASC, order_index ASC, started_at ASC, execution_id ASC
            """,
            run_ids,
        ).fetchall()
    executions_by_run: dict[str, list[dict[str, Any]]] = {}
    for row in execution_rows:
        run_id = _text(row["run_id"])
        if not run_id:
            continue
        executions_by_run.setdefault(run_id, []).append(
            {
                "execution_id": _text(row["execution_id"]),
                "node_id": _text(row["node_id"]),
                "node_type": _text(row["node_type"]),
                "node_name": _text(row["node_name"]),
                "status": _text(row["status"]),
                "started_at": row["started_at"],
                "duration_ms": row["duration_ms"],
                "order_index": row["order_index"],
            }
        )
    return runs_by_id, executions_by_run


def _model_log_run_summary(row: Any) -> dict[str, Any]:
    run_id = _text(row["run_id"])
    return {
        "run_id": run_id,
        "graph_id": _text(row["graph_id"]),
        "graph_name": _text(row["graph_name"]),
        "status": _text(row["status"]),
        "parent_run_id": _text(row["parent_run_id"]),
        "root_run_id": _text(row["root_run_id"]) or run_id,
        "parent_node_id": _text(row["parent_node_id"]),
        "invocation_kind": _text(row["invocation_kind"]),
        "invocation_key": _text(row["invocation_key"]),
        "run_depth": _int(row["run_depth"], default=0),
        "run_path": _loads(row["run_path_json"], [run_id]),
        "batch_group_id": _text(row["batch_group_id"]),
        "batch_item_index": row["batch_item_index"] if isinstance(row["batch_item_index"], int) else None,
        "batch_item_label": _text(row["batch_item_label"]),
        "current_node_id": row["current_node_id"],
        "started_at": _text(row["started_at"]),
        "completed_at": row["completed_at"],
        "duration_ms": row["duration_ms"],
        "final_result": _text(row["final_result"]),
        "children": [],
    }


def _model_log_run_sort_key(run: dict[str, Any]) -> tuple[list[str], str, str]:
    run_path = run.get("run_path")
    normalized_path = [str(item or "") for item in run_path] if isinstance(run_path, list) else []
    return (normalized_path, str(run.get("started_at") or ""), str(run.get("run_id") or ""))


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
    _append_provider_context_fields(entry, metadata)
    return _hydrate_log_entry(entry)


def _hydrate_log_entry(entry: dict[str, Any]) -> dict[str, Any]:
    request_raw = entry.get("request_raw") if isinstance(entry.get("request_raw"), dict) else {}
    response_raw = entry.get("response_raw") if isinstance(entry.get("response_raw"), dict) else {}
    payload = {
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
    _append_provider_context_fields(payload, entry)
    return payload


def _build_tree_for_run(
    run_node: dict[str, Any],
    entries_by_run: dict[str, list[dict[str, Any]]],
    executions_by_run: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
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

    executions = executions_by_run.get(run_id, [])
    children_by_parent_node = _group_child_runs_by_parent_node(run_node.get("children") or [])
    emitted_child_runs: set[str] = set()
    emitted_log_ids: set[str] = set(direct_call_ids)

    for execution in executions:
        node_id = str(execution.get("node_id") or "").strip()
        node_type = str(execution.get("node_type") or "").strip()
        if node_type not in MODEL_LOG_TREE_NODE_TYPES or not node_id:
            continue
        node_entries = _entries_for_execution(entries, execution)
        child_runs = children_by_parent_node.get(node_id, [])
        if not node_entries and not child_runs:
            continue
        child_nodes = [_build_tree_for_run(child, entries_by_run, executions_by_run) for child in child_runs]
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
        if node_type not in MODEL_LOG_TREE_NODE_TYPES or not node_id:
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
                "children": [_build_tree_for_run(child, entries_by_run, executions_by_run) for child in child_runs],
            }
        )

    for child_run in run_node.get("children") or []:
        child_run_id = str(child_run.get("run_id") or "")
        if child_run_id in emitted_child_runs:
            continue
        rendered_child = _build_tree_for_run(child_run, entries_by_run, executions_by_run)
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
    normalized = {
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
    _append_provider_context_fields(normalized, payload)
    return normalized


def _append_provider_context_fields(target: dict[str, Any], source: dict[str, Any]) -> None:
    request_timeout_seconds = _normalize_optional_float(source.get("provider_request_timeout_seconds"))
    if request_timeout_seconds is not None:
        target["provider_request_timeout_seconds"] = request_timeout_seconds
    provider_cache_policy = _text(source.get("provider_cache_policy"))
    if provider_cache_policy:
        target["provider_cache_policy"] = provider_cache_policy
    provider_pricing = normalize_provider_model_pricing(source.get("provider_pricing"))
    if provider_pricing:
        target["provider_pricing"] = provider_pricing
    for key in (
        "provider_profile",
        "provider_cache_decision",
        "provider_fallback_trace",
        "provider_cost_budget",
        "provider_cost_budget_approval",
        "provider_cost_budget_degradation",
        "provider_rate_profile",
        "provider_credential",
        "provider_credential_state_update",
        "provider_rate_reservation",
        "provider_cost_estimate",
        "provider_rate_decision",
    ):
        value = source.get(key)
        if isinstance(value, dict) and value:
            target[key] = sanitize_payload_for_log(value)


def _normalize_optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _normalize_provider_cost_budget_on_exceeded(value: Any) -> str:
    normalized = _text(value).lower()
    return normalized if normalized in {"block", "request_approval", "degrade_model"} else "block"


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


def _int(value: Any, *, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
