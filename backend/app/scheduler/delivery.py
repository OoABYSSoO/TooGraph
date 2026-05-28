from __future__ import annotations

import json
from typing import Any, Callable

import httpx

from app.core.context_security import redact_context_secrets
from app.core.storage.json_file_utils import utc_now_iso
from app.scheduler import store


EXTERNAL_DELIVERY_TARGET_KINDS = {"webhook", "http_webhook"}
SUPPORTED_DELIVERY_METHODS = {"POST", "PUT", "PATCH"}


def execute_approved_scheduled_delivery(
    job_run_id: str,
    *,
    approval: dict[str, Any],
    now: str | None = None,
    http_client_factory: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    normalized_approval = _normalize_approval(approval)
    if normalized_approval["status"] != "approved":
        raise ValueError("Scheduled external delivery requires an approved approval payload.")
    job_run = store.load_scheduled_graph_job_run(job_run_id)
    job = store.load_scheduled_graph_job(str(job_run.get("job_id") or ""))
    target = job.get("delivery_target") if isinstance(job.get("delivery_target"), dict) else {}
    kind = _normalize_kind(target.get("kind") or target.get("type"))
    if kind not in EXTERNAL_DELIVERY_TARGET_KINDS:
        raise ValueError("Scheduled delivery target is not an external webhook target.")
    url = _text(target.get("url"))
    if not url.startswith(("http://", "https://")):
        raise ValueError("Scheduled webhook delivery target requires an http(s) url.")
    method = _text(target.get("method") or "POST").upper()
    if method not in SUPPORTED_DELIVERY_METHODS:
        raise ValueError("Scheduled webhook delivery method must be POST, PUT, or PATCH.")

    requested_at = _text(now) or utc_now_iso()
    headers = _delivery_headers(target)
    payload = _delivery_payload(job=job, job_run=job_run, target=target)
    request_summary = {
        "method": method,
        "url": url,
        "headers": headers,
        "json": payload,
    }
    response_summary: dict[str, Any] = {}
    error = ""
    status = "failed"
    reason = "http_delivery_failed"
    response_status_code: int | None = None
    client_factory = http_client_factory or httpx.Client
    try:
        with client_factory(timeout=_timeout_seconds(target), trust_env=False) as client:
            response = client.request(method, url, headers=headers, json=payload)
        response_status_code = int(getattr(response, "status_code", 0) or 0)
        response_text = _text(getattr(response, "text", ""))
        response_summary = {
            "status_code": response_status_code,
            "body_preview": _redact_text(response_text, target)[:500],
        }
        response.raise_for_status()
        status = "delivered"
        reason = "http_delivery_succeeded"
    except Exception as exc:
        error = _redact_text(str(exc), target)
        response = getattr(exc, "response", None)
        if response is not None:
            response_status_code = int(getattr(response, "status_code", 0) or 0)
            response_summary = {
                "status_code": response_status_code,
                "body_preview": _redact_text(_text(getattr(response, "text", "")), target)[:500],
            }

    attempt = store.record_scheduled_delivery_attempt(
        job_run_id=job_run["job_run_id"],
        status="succeeded" if status == "delivered" else "failed",
        target_kind=kind,
        reason=reason,
        target=target,
        request=request_summary,
        response=response_summary,
        error=error,
        metadata={"approval": normalized_approval},
        attempted_at=requested_at,
        completed_at=_text(now) or utc_now_iso(),
    )
    delivery_result = {
        "kind": kind,
        "status": status,
        "reason": reason,
        "delivered_at": attempt["completed_at"],
        "job_id": job["job_id"],
        "job_run_id": job_run["job_run_id"],
        "trigger_reason": job_run["trigger_reason"],
        "terminal_status": job_run["status"],
        "run_ref": {"kind": "graph_run", "run_id": job_run["run_id"]},
        "target": store.redact_delivery_value(target),
        "http_status_code": response_status_code,
        "response": response_summary,
        "approval": normalized_approval,
        "delivery_attempt_id": attempt["attempt_id"],
    }
    if error:
        delivery_result["error"] = error
    store.apply_scheduled_delivery_result(
        job_run["job_run_id"],
        delivery_result=delivery_result,
        delivery_attempt=attempt,
        approval=normalized_approval,
        now=attempt["completed_at"],
    )
    return delivery_result


def _delivery_headers(target: dict[str, Any]) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    raw_headers = target.get("headers") if isinstance(target.get("headers"), dict) else {}
    for key, value in raw_headers.items():
        header_key = _text(key)
        if header_key:
            headers[header_key] = _text(value)
    authorization = _text(target.get("authorization"))
    if authorization:
        headers["Authorization"] = authorization
    return headers


def _delivery_payload(*, job: dict[str, Any], job_run: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    target_payload = target.get("payload") if isinstance(target.get("payload"), dict) else {}
    return {
        "kind": "scheduled_graph_delivery",
        "version": 1,
        "scheduler": {
            "job_id": job["job_id"],
            "job_run_id": job_run["job_run_id"],
            "run_id": job_run["run_id"],
            "trigger_reason": job_run["trigger_reason"],
            "status": job_run["status"],
            "completed_at": job_run["completed_at"],
        },
        "payload": dict(target_payload),
    }


def _normalize_approval(approval: dict[str, Any]) -> dict[str, Any]:
    payload = approval if isinstance(approval, dict) else {}
    decision = _text(payload.get("decision") or payload.get("status")).lower()
    status = "approved" if decision == "approved" else "denied"
    return store.redact_delivery_value(
        {
            "kind": "scheduled_delivery_approval",
            "status": status,
            "approved_by": _text(payload.get("approved_by") or payload.get("approvedBy")),
            "reason": _text(payload.get("reason")),
        }
    )


def _timeout_seconds(target: dict[str, Any]) -> float:
    try:
        timeout = float(target.get("timeout_seconds") or target.get("timeoutSeconds") or 10.0)
    except (TypeError, ValueError):
        timeout = 10.0
    return max(1.0, min(timeout, 120.0))


def _normalize_kind(value: Any) -> str:
    return _text(value).lower().replace("-", "_")


def _redact_text(value: Any, target: dict[str, Any]) -> str:
    text = _text(value)
    redacted, _warnings = redact_context_secrets(text, source_kind="scheduler_delivery", source_refs=[])
    for secret in _known_secret_values(target):
        if secret:
            redacted = redacted.replace(secret, "[redacted]")
    return redacted


def _known_secret_values(value: Any) -> list[str]:
    if isinstance(value, dict):
        secrets: list[str] = []
        for key, item in value.items():
            normalized_key = _text(key).lower().replace("-", "_")
            if any(keyword in normalized_key for keyword in store.SENSITIVE_DELIVERY_TARGET_KEYWORDS):
                secrets.append(_text(item))
            else:
                secrets.extend(_known_secret_values(item))
        return secrets
    if isinstance(value, list):
        secrets: list[str] = []
        for item in value:
            secrets.extend(_known_secret_values(item))
        return secrets
    return []


def _text(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value or "").strip()
