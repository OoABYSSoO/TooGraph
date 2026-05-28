from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.core.storage.database import get_connection


DEFAULT_PROVIDER_PROMPT_CACHE_RESOURCE_RETENTION_DAYS = 30
MAX_PROVIDER_PROMPT_CACHE_RESOURCE_RETENTION_DAYS = 3650


def build_provider_prompt_cache_scope_fingerprint(*, base_url: Any, api_key: Any) -> str:
    payload = json.dumps(
        {
            "base_url": _text(base_url),
            "api_key": _text(api_key),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


def load_provider_prompt_cache_resource(
    *,
    provider_id: Any,
    transport: Any,
    base_url: Any,
    model: Any,
    credential_fingerprint: Any,
    cache_key: Any,
    stable_prefix_hash: Any,
    now: datetime | None = None,
) -> dict[str, Any]:
    lookup = _normalize_lookup(
        provider_id=provider_id,
        transport=transport,
        base_url=base_url,
        model=model,
        credential_fingerprint=credential_fingerprint,
        cache_key=cache_key,
        stable_prefix_hash=stable_prefix_hash,
    )
    if not lookup:
        return {}
    checked_at = _normalize_datetime(now or datetime.now(timezone.utc))
    checked_at_text = _format_datetime(checked_at)
    try:
        with get_connection() as connection:
            _expire_provider_prompt_cache_resources(connection, checked_at_text)
            row = connection.execute(
                """
                SELECT *
                FROM provider_prompt_cache_resources
                WHERE provider = ?
                    AND transport = ?
                    AND base_url = ?
                    AND model = ?
                    AND credential_fingerprint = ?
                    AND cache_key = ?
                    AND stable_prefix_hash = ?
                    AND status = 'active'
                    AND (expires_at = '' OR expires_at > ?)
                ORDER BY last_used_at DESC, created_at DESC
                LIMIT 1
                """,
                (
                    lookup["provider"],
                    lookup["transport"],
                    lookup["base_url"],
                    lookup["model"],
                    lookup["credential_fingerprint"],
                    lookup["cache_key"],
                    lookup["stable_prefix_hash"],
                    checked_at_text,
                ),
            ).fetchone()
            if row is None:
                return {}
            connection.execute(
                """
                UPDATE provider_prompt_cache_resources
                SET last_used_at = ?, updated_at = ?
                WHERE cache_resource_id = ?
                """,
                (checked_at_text, checked_at_text, row["cache_resource_id"]),
            )
    except Exception:
        return {}
    return _resource_payload(row, status="reused", last_used_at=checked_at_text)


def remember_provider_prompt_cache_resource(
    *,
    provider_id: Any,
    transport: Any,
    base_url: Any,
    model: Any,
    credential_fingerprint: Any,
    cache_key: Any,
    stable_prefix_hash: Any,
    resource_name: Any,
    expires_at: Any = None,
    metadata: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    lookup = _normalize_lookup(
        provider_id=provider_id,
        transport=transport,
        base_url=base_url,
        model=model,
        credential_fingerprint=credential_fingerprint,
        cache_key=cache_key,
        stable_prefix_hash=stable_prefix_hash,
    )
    normalized_resource_name = _text(resource_name)
    if not lookup or not normalized_resource_name:
        return {}
    remembered_at = _normalize_datetime(now or datetime.now(timezone.utc))
    remembered_at_text = _format_datetime(remembered_at)
    normalized_expires_at = _format_optional_datetime(expires_at)
    cache_resource_id = f"prompt_cache_{uuid4().hex[:12]}"
    metadata_json = _json(metadata if isinstance(metadata, dict) else {})
    try:
        with get_connection() as connection:
            connection.execute(
                """
                UPDATE provider_prompt_cache_resources
                SET status = 'superseded', updated_at = ?
                WHERE provider = ?
                    AND transport = ?
                    AND base_url = ?
                    AND model = ?
                    AND credential_fingerprint = ?
                    AND cache_key = ?
                    AND stable_prefix_hash = ?
                    AND status = 'active'
                    AND resource_name != ?
                """,
                (
                    remembered_at_text,
                    lookup["provider"],
                    lookup["transport"],
                    lookup["base_url"],
                    lookup["model"],
                    lookup["credential_fingerprint"],
                    lookup["cache_key"],
                    lookup["stable_prefix_hash"],
                    normalized_resource_name,
                ),
            )
            connection.execute(
                """
                INSERT INTO provider_prompt_cache_resources (
                    cache_resource_id,
                    provider,
                    transport,
                    base_url,
                    model,
                    credential_fingerprint,
                    cache_key,
                    stable_prefix_hash,
                    resource_name,
                    status,
                    created_at,
                    updated_at,
                    expires_at,
                    last_used_at,
                    metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
                """,
                (
                    cache_resource_id,
                    lookup["provider"],
                    lookup["transport"],
                    lookup["base_url"],
                    lookup["model"],
                    lookup["credential_fingerprint"],
                    lookup["cache_key"],
                    lookup["stable_prefix_hash"],
                    normalized_resource_name,
                    remembered_at_text,
                    remembered_at_text,
                    normalized_expires_at,
                    remembered_at_text,
                    metadata_json,
                ),
            )
    except Exception:
        return {}
    return {
        "kind": "provider_prompt_cache_resource",
        "version": 1,
        "cache_resource_id": cache_resource_id,
        "provider_id": lookup["provider"],
        "transport": lookup["transport"],
        "base_url": lookup["base_url"],
        "model": lookup["model"],
        "cache_key": lookup["cache_key"],
        "stable_prefix_hash": lookup["stable_prefix_hash"],
        "resource_name": normalized_resource_name,
        "status": "created",
        "created_at": remembered_at_text,
        "updated_at": remembered_at_text,
        "last_used_at": remembered_at_text,
        "expires_at": normalized_expires_at,
        "metadata": json.loads(metadata_json),
    }


def summarize_provider_prompt_cache_resources(*, now: datetime | None = None) -> dict[str, Any]:
    checked_at = _normalize_datetime(now or datetime.now(timezone.utc))
    checked_at_text = _format_datetime(checked_at)
    status_counts: dict[str, int] = {}
    try:
        with get_connection() as connection:
            _expire_provider_prompt_cache_resources(connection, checked_at_text)
            rows = connection.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM provider_prompt_cache_resources
                GROUP BY status
                """
            ).fetchall()
    except Exception:
        rows = []
    for row in rows:
        status = _text(row["status"]) or "unknown"
        status_counts[status] = int(row["count"] or 0)
    return {
        "kind": "provider_prompt_cache_resource_summary",
        "version": 1,
        "total": sum(status_counts.values()),
        "status_counts": status_counts,
        "checked_at": checked_at_text,
    }


def normalize_provider_prompt_cache_resource_retention_days(value: Any) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = DEFAULT_PROVIDER_PROMPT_CACHE_RESOURCE_RETENTION_DAYS
    return max(1, min(count, MAX_PROVIDER_PROMPT_CACHE_RESOURCE_RETENTION_DAYS))


def prune_provider_prompt_cache_resources(
    *,
    max_terminal_age_days: int,
    now: datetime | None = None,
) -> dict[str, Any]:
    checked_at = _normalize_datetime(now or datetime.now(timezone.utc))
    checked_at_text = _format_datetime(checked_at)
    retention_days = normalize_provider_prompt_cache_resource_retention_days(max_terminal_age_days)
    cutoff_text = _format_datetime(checked_at - timedelta(days=retention_days))
    deleted_count = 0
    status_counts: dict[str, int] = {}
    try:
        with get_connection() as connection:
            _expire_provider_prompt_cache_resources(connection, checked_at_text)
            deleted = connection.execute(
                """
                DELETE FROM provider_prompt_cache_resources
                WHERE (
                    status = 'expired'
                    AND (
                        (expires_at != '' AND expires_at <= ?)
                        OR (expires_at = '' AND updated_at <= ?)
                    )
                )
                OR (
                    status = 'superseded'
                    AND updated_at <= ?
                )
                """,
                (cutoff_text, cutoff_text, cutoff_text),
            )
            deleted_count = max(0, int(deleted.rowcount or 0))
            rows = connection.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM provider_prompt_cache_resources
                GROUP BY status
                """
            ).fetchall()
    except Exception:
        rows = []
    for row in rows:
        status = _text(row["status"]) or "unknown"
        status_counts[status] = int(row["count"] or 0)
    return {
        "kind": "provider_prompt_cache_resource_prune_result",
        "version": 1,
        "max_terminal_age_days": retention_days,
        "cutoff_at": cutoff_text,
        "pruned_count": deleted_count,
        "remaining_status_counts": status_counts,
        "remaining_total": sum(status_counts.values()),
        "checked_at": checked_at_text,
    }


def _normalize_lookup(
    *,
    provider_id: Any,
    transport: Any,
    base_url: Any,
    model: Any,
    credential_fingerprint: Any,
    cache_key: Any,
    stable_prefix_hash: Any,
) -> dict[str, str]:
    lookup = {
        "provider": _text(provider_id),
        "transport": _text(transport),
        "base_url": _text(base_url),
        "model": _text(model).removeprefix("models/"),
        "credential_fingerprint": _text(credential_fingerprint),
        "cache_key": _text(cache_key),
        "stable_prefix_hash": _text(stable_prefix_hash),
    }
    required = (
        "provider",
        "transport",
        "base_url",
        "model",
        "credential_fingerprint",
        "cache_key",
        "stable_prefix_hash",
    )
    if any(not lookup[key] for key in required):
        return {}
    return lookup


def _resource_payload(row: Any, *, status: str, last_used_at: str) -> dict[str, Any]:
    metadata = _loads(row["metadata_json"], {})
    return {
        "kind": "provider_prompt_cache_resource",
        "version": 1,
        "cache_resource_id": _text(row["cache_resource_id"]),
        "provider_id": _text(row["provider"]),
        "transport": _text(row["transport"]),
        "base_url": _text(row["base_url"]),
        "model": _text(row["model"]),
        "cache_key": _text(row["cache_key"]),
        "stable_prefix_hash": _text(row["stable_prefix_hash"]),
        "resource_name": _text(row["resource_name"]),
        "status": status,
        "created_at": _text(row["created_at"]),
        "updated_at": _text(row["updated_at"]),
        "expires_at": _text(row["expires_at"]),
        "last_used_at": last_used_at,
        "metadata": metadata if isinstance(metadata, dict) else {},
    }


def _expire_provider_prompt_cache_resources(connection: Any, now_text: str) -> None:
    connection.execute(
        """
        UPDATE provider_prompt_cache_resources
        SET status = 'expired', updated_at = ?
        WHERE status = 'active'
            AND expires_at != ''
            AND expires_at <= ?
        """,
        (now_text, now_text),
    )


def _format_optional_datetime(value: Any) -> str:
    if value in (None, ""):
        return ""
    try:
        return _format_datetime(_normalize_datetime(value))
    except ValueError:
        return ""


def _normalize_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    text = _text(value)
    if not text:
        raise ValueError("empty datetime")
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"invalid datetime: {text}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _format_datetime(value: datetime) -> str:
    normalized = value.astimezone(timezone.utc).replace(microsecond=0)
    return normalized.isoformat().replace("+00:00", "Z")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _loads(payload: Any, fallback: Any) -> Any:
    try:
        return json.loads(str(payload or ""))
    except (TypeError, ValueError):
        return fallback
