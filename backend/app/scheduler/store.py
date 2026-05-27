from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.core.capability_permissions import build_capability_permission_profile
from app.core.storage.database import get_connection
from app.core.storage.json_file_utils import utc_now_iso
from app.templates.loader import load_template_record


SCHEDULE_KINDS = {"manual", "interval", "cron"}
TERMINAL_JOB_RUN_STATUSES = {"completed", "failed", "cancelled", "skipped"}
RETRYABLE_TRIGGER_REASONS = {"schedule", "retry"}
SUPPORTED_DELIVERY_TARGET_KINDS = {"local_audit", "job_run_metadata"}
EXTERNAL_DELIVERY_TARGET_KINDS = {"webhook", "http_webhook"}
SENSITIVE_DELIVERY_TARGET_KEYWORDS = (
    "token",
    "secret",
    "password",
    "api_key",
    "apikey",
    "authorization",
    "credential",
)
MAX_RETRY_ATTEMPTS = 10
MAX_RETRY_DELAY_SECONDS = 604_800
_ISO_INTERVAL_RE = re.compile(
    r"^P(?:(?P<days>\d+)D)?(?:T(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?)?$"
)
_SHORT_INTERVAL_RE = re.compile(r"^(?P<amount>\d+)(?P<unit>[smhd])?$", re.IGNORECASE)


def create_scheduled_graph_job(payload: dict[str, Any], *, now: str | None = None) -> dict[str, Any]:
    job = _normalize_job_payload(payload, now=now)
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO scheduled_graph_jobs (
                job_id, name, template_id, input_bindings_json, schedule_kind,
                schedule_expr, timezone, enabled, last_run_id, next_run_at,
                runtime_overrides_json, delivery_target_json, retry_policy_json, metadata_json,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job["job_id"],
                job["name"],
                job["template_id"],
                _json_dumps(job["input_bindings"]),
                job["schedule_kind"],
                job["schedule_expr"],
                job["timezone"],
                1 if job["enabled"] else 0,
                job["last_run_id"],
                job["next_run_at"],
                _json_dumps(job["runtime_overrides"]),
                _json_dumps(job["delivery_target"]),
                _json_dumps(job["retry_policy"]),
                _json_dumps(job["metadata"]),
                job["created_at"],
                job["updated_at"],
            ),
        )
    return load_scheduled_graph_job(job["job_id"])


def load_scheduled_graph_job(job_id: str) -> dict[str, Any]:
    normalized_job_id = _compact_text(job_id)
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM scheduled_graph_jobs WHERE job_id = ?",
            (normalized_job_id,),
        ).fetchone()
    if row is None:
        raise KeyError(normalized_job_id)
    return _job_from_row(row)


def list_scheduled_graph_jobs(*, include_disabled: bool = False) -> list[dict[str, Any]]:
    where = "" if include_disabled else "WHERE enabled = 1"
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM scheduled_graph_jobs
            {where}
            ORDER BY updated_at DESC, created_at DESC, job_id
            """
        ).fetchall()
    return [_job_from_row(row) for row in rows]


def list_due_scheduled_graph_jobs(*, now: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
    normalized_now = _normalize_timestamp(now)
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM scheduled_graph_jobs
            WHERE enabled = 1
                AND next_run_at != ''
                AND next_run_at <= ?
            ORDER BY next_run_at ASC, job_id ASC
            LIMIT ?
            """,
            (normalized_now, max(1, min(int(limit or 25), 100))),
        ).fetchall()
    return [_job_from_row(row) for row in rows]


def resolve_due_trigger_reason(job: dict[str, Any]) -> str:
    return "retry" if _pending_retry_for_job(job) else "schedule"


def set_scheduled_graph_job_enabled(job_id: str, enabled: bool, *, now: str | None = None) -> dict[str, Any]:
    job = load_scheduled_graph_job(job_id)
    normalized_now = _normalize_timestamp(now)
    next_run_at = str(job.get("next_run_at") or "")
    if enabled and job["schedule_kind"] == "interval" and not next_run_at:
        next_run_at = _next_run_at_for_job(job, normalized_now)
    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE scheduled_graph_jobs
            SET enabled = ?,
                next_run_at = ?,
                updated_at = ?
            WHERE job_id = ?
            """,
            (1 if enabled else 0, next_run_at, normalized_now, job["job_id"]),
        )
    if cursor.rowcount == 0:
        raise KeyError(job["job_id"])
    return load_scheduled_graph_job(job["job_id"])


def record_scheduled_graph_job_run(
    job_id: str,
    *,
    run_id: str = "",
    trigger_reason: str,
    status: str,
    error: str = "",
    started_at: str = "",
    completed_at: str = "",
    metadata: dict[str, Any] | None = None,
    job_run_id: str | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    job = load_scheduled_graph_job(job_id)
    normalized_now = _normalize_timestamp(now or started_at or completed_at)
    normalized_started_at = _normalize_timestamp(started_at) if started_at else normalized_now
    normalized_completed_at = _normalize_timestamp(completed_at) if completed_at else (
        normalized_now if status in TERMINAL_JOB_RUN_STATUSES else ""
    )
    normalized_status = _compact_text(status) or "queued"
    normalized_run_id = _compact_text(run_id)
    normalized_job_run_id = _compact_text(job_run_id) or f"schedrun_{uuid4().hex[:12]}"
    normalized_trigger_reason = _compact_text(trigger_reason)
    normalized_metadata = dict(metadata or {})
    job_metadata = dict(job.get("metadata") or {})
    pending_retry = _pending_retry_for_job(job)
    if normalized_trigger_reason == "retry" and pending_retry:
        normalized_metadata.setdefault("attempt_number", _positive_int(pending_retry.get("next_attempt_number"), 1))
        normalized_metadata.setdefault("retry_parent_job_run_id", _compact_text(pending_retry.get("parent_job_run_id")))
        normalized_metadata.setdefault("retry_parent_run_id", _compact_text(pending_retry.get("parent_run_id")))
        normalized_metadata.setdefault("retry_scheduled_for", _compact_text(pending_retry.get("scheduled_for")))
        job_metadata.pop("scheduler_retry_pending", None)
    else:
        normalized_metadata.setdefault("attempt_number", 1)
    next_run_at = (
        _next_run_at_for_job(job, normalized_now)
        if job["schedule_kind"] == "interval" and normalized_trigger_reason == "schedule"
        else str(job.get("next_run_at") or "")
    )
    if normalized_trigger_reason == "retry" and pending_retry:
        next_run_at = _compact_text(pending_retry.get("resume_next_run_at")) or (
            _next_run_at_for_job(job, normalized_now) if job["schedule_kind"] == "interval" else ""
        )
    if normalized_status in TERMINAL_JOB_RUN_STATUSES:
        retry_update = _apply_retry_decision(
            job,
            {
                "job_run_id": normalized_job_run_id,
                "run_id": normalized_run_id,
                "trigger_reason": normalized_trigger_reason,
                "status": normalized_status,
                "error": _compact_text(error),
                "metadata": normalized_metadata,
            },
            now=normalized_now,
            current_next_run_at=next_run_at,
        )
        if retry_update is not None:
            normalized_metadata["retry_decision"] = retry_update["decision"]
            job_metadata = retry_update["job_metadata"]
            next_run_at = retry_update["next_run_at"]
        delivery_result = _build_delivery_result(
            job,
            {
                "job_run_id": normalized_job_run_id,
                "run_id": normalized_run_id,
                "trigger_reason": normalized_trigger_reason,
                "status": normalized_status,
                "error": _compact_text(error),
                "metadata": normalized_metadata,
            },
            delivered_at=normalized_completed_at or normalized_now,
        )
        if delivery_result is not None:
            normalized_metadata["delivery_result"] = delivery_result
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO scheduled_graph_job_runs (
                job_run_id, job_id, run_id, trigger_reason, status, error,
                started_at, completed_at, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_run_id) DO UPDATE SET
                run_id = excluded.run_id,
                trigger_reason = excluded.trigger_reason,
                status = excluded.status,
                error = excluded.error,
                started_at = excluded.started_at,
                completed_at = excluded.completed_at,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                normalized_job_run_id,
                job["job_id"],
                normalized_run_id,
                normalized_trigger_reason,
                normalized_status,
                _compact_text(error),
                normalized_started_at,
                normalized_completed_at,
                _json_dumps(normalized_metadata),
                normalized_now,
                normalized_now,
            ),
        )
        connection.execute(
            """
            UPDATE scheduled_graph_jobs
            SET last_run_id = CASE WHEN ? != '' THEN ? ELSE last_run_id END,
                next_run_at = ?,
                metadata_json = ?,
                updated_at = ?
            WHERE job_id = ?
            """,
            (normalized_run_id, normalized_run_id, next_run_at, _json_dumps(job_metadata), normalized_now, job["job_id"]),
        )
    return load_scheduled_graph_job_run(normalized_job_run_id)


def update_scheduled_graph_job_run(
    job_run_id: str,
    *,
    status: str,
    error: str = "",
    completed_at: str | None = None,
    metadata: dict[str, Any] | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    existing = load_scheduled_graph_job_run(job_run_id)
    normalized_now = _normalize_timestamp(now or completed_at)
    normalized_status = _compact_text(status) or str(existing.get("status") or "")
    normalized_completed_at = (
        _normalize_timestamp(completed_at)
        if completed_at
        else (normalized_now if normalized_status in TERMINAL_JOB_RUN_STATUSES else str(existing.get("completed_at") or ""))
    )
    next_metadata = dict(existing.get("metadata") or {})
    if metadata:
        next_metadata.update(metadata)
    retry_update = None
    if normalized_status in TERMINAL_JOB_RUN_STATUSES:
        job = load_scheduled_graph_job(str(existing.get("job_id") or ""))
        retry_update = _apply_retry_decision(
            job,
            {
                **existing,
                "status": normalized_status,
                "error": _compact_text(error),
                "metadata": next_metadata,
            },
            now=normalized_now,
            current_next_run_at=str(job.get("next_run_at") or ""),
        )
        if retry_update is not None:
            next_metadata["retry_decision"] = retry_update["decision"]
        delivery_result = _build_delivery_result(
            job,
            {
                **existing,
                "status": normalized_status,
                "error": _compact_text(error),
                "completed_at": normalized_completed_at,
                "metadata": next_metadata,
            },
            delivered_at=normalized_completed_at or normalized_now,
        )
        if delivery_result is not None:
            next_metadata["delivery_result"] = delivery_result
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE scheduled_graph_job_runs
            SET status = ?,
                error = ?,
                completed_at = ?,
                metadata_json = ?,
                updated_at = ?
            WHERE job_run_id = ?
            """,
            (
                normalized_status,
                _compact_text(error),
                normalized_completed_at,
                _json_dumps(next_metadata),
                normalized_now,
                existing["job_run_id"],
            ),
        )
        if retry_update is not None:
            connection.execute(
                """
                UPDATE scheduled_graph_jobs
                SET next_run_at = ?,
                    metadata_json = ?,
                    updated_at = ?
                WHERE job_id = ?
                """,
                (
                    retry_update["next_run_at"],
                    _json_dumps(retry_update["job_metadata"]),
                    normalized_now,
                    existing["job_id"],
                ),
            )
    return load_scheduled_graph_job_run(existing["job_run_id"])


def load_scheduled_graph_job_run(job_run_id: str) -> dict[str, Any]:
    normalized_job_run_id = _compact_text(job_run_id)
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM scheduled_graph_job_runs WHERE job_run_id = ?",
            (normalized_job_run_id,),
        ).fetchone()
    if row is None:
        raise KeyError(normalized_job_run_id)
    return _job_run_from_row(row)


def list_scheduled_graph_job_runs(*, job_id: str = "") -> list[dict[str, Any]]:
    normalized_job_id = _compact_text(job_id)
    if normalized_job_id:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM scheduled_graph_job_runs
                WHERE job_id = ?
                ORDER BY created_at DESC, job_run_id DESC
                """,
                (normalized_job_id,),
            ).fetchall()
    else:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM scheduled_graph_job_runs
                ORDER BY created_at DESC, job_run_id DESC
                """
            ).fetchall()
    return [_job_run_from_row(row) for row in rows]


def _normalize_job_payload(payload: dict[str, Any], *, now: str | None) -> dict[str, Any]:
    normalized_now = _normalize_timestamp(now)
    template_id = _compact_text(payload.get("template_id"))
    if not template_id:
        raise ValueError("template_id is required.")
    try:
        template = load_template_record(template_id)
    except KeyError as exc:
        raise ValueError(f"template_id '{template_id}' does not exist.") from exc
    if str(template.get("status") or "active") == "disabled":
        raise ValueError(f"template_id '{template_id}' is disabled.")
    schedule_kind = _compact_text(payload.get("schedule_kind") or "manual").lower()
    if schedule_kind not in SCHEDULE_KINDS:
        raise ValueError("schedule_kind must be manual, interval, or cron.")
    schedule_expr = _compact_text(payload.get("schedule_expr"))
    if schedule_kind == "interval":
        _interval_delta(schedule_expr)
    input_bindings = payload.get("input_bindings")
    if not isinstance(input_bindings, dict):
        input_bindings = payload.get("input_values") if isinstance(payload.get("input_values"), dict) else {}
    runtime_overrides = payload.get("runtime_overrides") if isinstance(payload.get("runtime_overrides"), dict) else {}
    delivery_target = payload.get("delivery_target") if isinstance(payload.get("delivery_target"), dict) else {}
    retry_policy = _normalize_retry_policy(payload.get("retry_policy"))
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    job = {
        "job_id": _compact_text(payload.get("job_id")) or f"sched_{uuid4().hex[:12]}",
        "name": _compact_text(payload.get("name")) or _compact_text(template.get("label")) or template_id,
        "template_id": template_id,
        "input_bindings": dict(input_bindings),
        "schedule_kind": schedule_kind,
        "schedule_expr": schedule_expr,
        "timezone": _compact_text(payload.get("timezone")) or "UTC",
        "enabled": payload.get("enabled") is not False,
        "last_run_id": "",
        "next_run_at": _compact_text(payload.get("next_run_at")),
        "runtime_overrides": dict(runtime_overrides),
        "delivery_target": dict(delivery_target),
        "retry_policy": retry_policy,
        "metadata": dict(metadata),
        "created_at": normalized_now,
        "updated_at": normalized_now,
    }
    if not job["next_run_at"] and job["enabled"] and schedule_kind == "interval":
        job["next_run_at"] = _next_run_at_for_job(job, normalized_now)
    return job


def _normalize_retry_policy(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    max_attempts = _positive_int(value.get("max_attempts"), 1)
    if max_attempts <= 1:
        return {}
    delay_seconds = _positive_int(value.get("delay_seconds"), 300)
    backoff_multiplier = _positive_float(value.get("backoff_multiplier"), 1.0)
    return {
        "max_attempts": min(max_attempts, MAX_RETRY_ATTEMPTS),
        "delay_seconds": min(delay_seconds, MAX_RETRY_DELAY_SECONDS),
        "backoff_multiplier": max(1.0, min(backoff_multiplier, 10.0)),
    }


def _apply_retry_decision(
    job: dict[str, Any],
    job_run: dict[str, Any],
    *,
    now: str,
    current_next_run_at: str,
) -> dict[str, Any] | None:
    if str(job_run.get("status") or "") != "failed":
        return None
    trigger_reason = _compact_text(job_run.get("trigger_reason"))
    metadata = dict(job_run.get("metadata") or {})
    job_metadata = dict(job.get("metadata") or {})
    if trigger_reason not in RETRYABLE_TRIGGER_REASONS:
        return {
            "decision": {
                "action": "not_retryable_trigger",
                "trigger_reason": trigger_reason,
            },
            "job_metadata": job_metadata,
            "next_run_at": current_next_run_at,
        }
    retry_policy = dict(job.get("retry_policy") or {})
    if not retry_policy:
        return {
            "decision": {"action": "no_policy"},
            "job_metadata": job_metadata,
            "next_run_at": current_next_run_at,
        }
    attempt_number = _positive_int(metadata.get("attempt_number"), 1)
    max_attempts = _positive_int(retry_policy.get("max_attempts"), 1)
    if attempt_number >= max_attempts:
        job_metadata.pop("scheduler_retry_pending", None)
        return {
            "decision": {
                "action": "exhausted",
                "attempt_number": attempt_number,
                "max_attempts": max_attempts,
            },
            "job_metadata": job_metadata,
            "next_run_at": current_next_run_at,
        }
    delay_seconds = _retry_delay_seconds(retry_policy, attempt_number)
    retry_at = _format_utc(_parse_utc(now) + timedelta(seconds=delay_seconds))
    pending_retry = {
        "parent_job_run_id": _compact_text(job_run.get("job_run_id")),
        "parent_run_id": _compact_text(job_run.get("run_id")),
        "next_attempt_number": attempt_number + 1,
        "scheduled_for": retry_at,
        "delay_seconds": delay_seconds,
        "resume_next_run_at": _compact_text(current_next_run_at),
        "error": _compact_text(job_run.get("error")),
    }
    job_metadata["scheduler_retry_pending"] = pending_retry
    return {
        "decision": {
            "action": "scheduled",
            "attempt_number": attempt_number,
            "next_attempt_number": attempt_number + 1,
            "max_attempts": max_attempts,
            "scheduled_for": retry_at,
            "delay_seconds": delay_seconds,
        },
        "job_metadata": job_metadata,
        "next_run_at": retry_at,
    }


def _build_delivery_result(
    job: dict[str, Any],
    job_run: dict[str, Any],
    *,
    delivered_at: str,
) -> dict[str, Any] | None:
    delivery_target = job.get("delivery_target") if isinstance(job.get("delivery_target"), dict) else {}
    kind = _compact_text(delivery_target.get("kind") or delivery_target.get("type"))
    if not kind:
        return None
    normalized_kind = kind.lower().replace("-", "_")
    result = {
        "kind": kind,
        "status": "delivered" if normalized_kind in SUPPORTED_DELIVERY_TARGET_KINDS else "skipped",
        "delivered_at": delivered_at,
        "job_id": _compact_text(job.get("job_id")),
        "job_run_id": _compact_text(job_run.get("job_run_id")),
        "trigger_reason": _compact_text(job_run.get("trigger_reason")),
        "terminal_status": _compact_text(job_run.get("status")),
        "run_ref": {"kind": "graph_run", "run_id": _compact_text(job_run.get("run_id"))},
        "target": _redact_delivery_target(delivery_target),
    }
    if normalized_kind in EXTERNAL_DELIVERY_TARGET_KINDS:
        permissions = ["external_delivery"]
        result.update(
            {
                "reason": "external_delivery_requires_approval",
                "approval_required": True,
                "required_permissions": permissions,
                "permission_profile": build_capability_permission_profile(permissions),
            }
        )
    elif result["status"] == "skipped":
        result["reason"] = "unsupported_delivery_target"
    return result


def _redact_delivery_target(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            normalized_key = str(key).lower().replace("-", "_")
            if any(keyword in normalized_key for keyword in SENSITIVE_DELIVERY_TARGET_KEYWORDS):
                redacted[str(key)] = "[redacted]"
            else:
                redacted[str(key)] = _redact_delivery_target(item)
        return redacted
    if isinstance(value, list):
        return [_redact_delivery_target(item) for item in value]
    return value


def _retry_delay_seconds(retry_policy: dict[str, Any], attempt_number: int) -> int:
    delay_seconds = _positive_int(retry_policy.get("delay_seconds"), 300)
    backoff_multiplier = _positive_float(retry_policy.get("backoff_multiplier"), 1.0)
    retry_delay = delay_seconds * (backoff_multiplier ** max(0, attempt_number - 1))
    return max(1, min(int(round(retry_delay)), MAX_RETRY_DELAY_SECONDS))


def _pending_retry_for_job(job: dict[str, Any]) -> dict[str, Any] | None:
    metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    pending = metadata.get("scheduler_retry_pending") if isinstance(metadata, dict) else None
    return dict(pending) if isinstance(pending, dict) else None


def _next_run_at_for_job(job: dict[str, Any], now: str) -> str:
    if str(job.get("schedule_kind") or "") != "interval":
        return ""
    return _format_utc(_parse_utc(now) + _interval_delta(str(job.get("schedule_expr") or "")))


def _interval_delta(value: str) -> timedelta:
    normalized = _compact_text(value)
    if not normalized:
        raise ValueError("schedule_expr is required for interval jobs.")
    match = _SHORT_INTERVAL_RE.match(normalized)
    if match:
        amount = int(match.group("amount"))
        unit = (match.group("unit") or "s").lower()
        if amount <= 0:
            raise ValueError("schedule_expr interval must be greater than zero.")
        multipliers = {
            "s": timedelta(seconds=amount),
            "m": timedelta(minutes=amount),
            "h": timedelta(hours=amount),
            "d": timedelta(days=amount),
        }
        return multipliers[unit]
    match = _ISO_INTERVAL_RE.match(normalized)
    if not match:
        raise ValueError("schedule_expr must be an interval like PT6H, 30m, or 3600s.")
    parts = {key: int(value or 0) for key, value in match.groupdict().items()}
    delta = timedelta(
        days=parts["days"],
        hours=parts["hours"],
        minutes=parts["minutes"],
        seconds=parts["seconds"],
    )
    if delta.total_seconds() <= 0:
        raise ValueError("schedule_expr interval must be greater than zero.")
    return delta


def _normalize_timestamp(value: str | None = None) -> str:
    if not _compact_text(value):
        return utc_now_iso()
    return _format_utc(_parse_utc(str(value)))


def _parse_utc(value: str) -> datetime:
    normalized = _compact_text(value)
    if not normalized:
        return datetime.now(timezone.utc).replace(microsecond=0)
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Invalid timestamp '{value}'.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0)


def _format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _job_from_row(row: Any) -> dict[str, Any]:
    return {
        "job_id": str(row["job_id"]),
        "name": str(row["name"]),
        "template_id": str(row["template_id"]),
        "input_bindings": _json_loads(row["input_bindings_json"], {}),
        "schedule_kind": str(row["schedule_kind"]),
        "schedule_expr": str(row["schedule_expr"] or ""),
        "timezone": str(row["timezone"] or "UTC"),
        "enabled": bool(row["enabled"]),
        "last_run_id": str(row["last_run_id"] or ""),
        "next_run_at": str(row["next_run_at"] or ""),
        "runtime_overrides": _json_loads(row["runtime_overrides_json"], {}),
        "delivery_target": _json_loads(row["delivery_target_json"], {}),
        "retry_policy": _json_loads(row["retry_policy_json"], {}),
        "metadata": _json_loads(row["metadata_json"], {}),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


def _job_run_from_row(row: Any) -> dict[str, Any]:
    return {
        "job_run_id": str(row["job_run_id"]),
        "job_id": str(row["job_id"]),
        "run_id": str(row["run_id"] or ""),
        "trigger_reason": str(row["trigger_reason"] or ""),
        "status": str(row["status"] or ""),
        "error": str(row["error"] or ""),
        "started_at": str(row["started_at"] or ""),
        "completed_at": str(row["completed_at"] or ""),
        "metadata": _json_loads(row["metadata_json"], {}),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _json_loads(value: Any, default: Any) -> Any:
    try:
        parsed = json.loads(str(value or ""))
    except json.JSONDecodeError:
        return default
    return parsed if isinstance(parsed, type(default)) else default


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def _positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _positive_float(value: Any, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default
