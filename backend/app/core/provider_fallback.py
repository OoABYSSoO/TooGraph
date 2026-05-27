from __future__ import annotations

from typing import Any


def resolve_provider_fallback(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    requested_model_ref = _text(inputs.get("requested_model_ref") or inputs.get("model_ref"))
    requested = _normalize_model_ref(
        {
            "model_ref": requested_model_ref,
            **_dict(inputs.get("requested")),
        }
    )
    failure_event = _dict(inputs.get("failure_event"))
    required_capabilities = _string_list(inputs.get("required_capabilities"))
    required_permissions = _string_list(inputs.get("required_permissions"))
    preserve_permission_scope = bool(inputs.get("preserve_permission_scope", True))
    candidates = [_normalize_candidate(item) for item in _list(inputs.get("provider_candidates"))]
    candidates = [candidate for candidate in candidates if candidate.get("model_ref")]

    failed_candidates = _failed_candidates(candidates, requested, failure_event)
    rejected_candidates: list[dict[str, Any]] = []
    fallback_candidates: list[dict[str, Any]] = []
    selected: dict[str, Any] = {}
    failure_model_ref = _text(failure_event.get("model_ref")) or requested.get("model_ref", "")

    for candidate in candidates:
        reason = _candidate_rejection_reason(
            candidate,
            requested=requested,
            failure_model_ref=failure_model_ref,
            required_capabilities=required_capabilities,
            required_permissions=required_permissions,
            preserve_permission_scope=preserve_permission_scope,
        )
        if reason:
            if reason != "failed_requested_model":
                rejected_candidates.append({**_candidate_public(candidate), "reason": reason})
            continue
        fallback_record = {
            **_candidate_public(candidate),
            "reason": "compatible_fallback",
            "score": {
                "priority": candidate.get("priority", 0),
                "capability_match_count": len(required_capabilities),
                "permission_scope_preserved": True,
            },
        }
        fallback_candidates.append(fallback_record)
        if not selected:
            selected = {**_candidate_public(candidate), "reason": "fallback_after_provider_failed"}

    if selected:
        decision = "fallback_selected"
        fallback_used = True
    elif failed_candidates:
        decision = "no_compatible_fallback"
        fallback_used = False
    elif requested:
        selected = requested
        decision = "requested_model_usable"
        fallback_used = False
    else:
        decision = "no_requested_model"
        fallback_used = False

    trace = {
        "kind": "provider_fallback_trace",
        "decision": decision,
        "fallback_used": fallback_used,
        "requested": requested,
        "selected": selected,
        "failed_candidates": failed_candidates,
        "fallback_candidates": fallback_candidates,
        "rejected_candidates": rejected_candidates,
        "required_capabilities": required_capabilities,
        "required_permissions": required_permissions,
        "preserve_permission_scope": preserve_permission_scope,
        "attempts": _attempts(failed_candidates, selected, fallback_used=fallback_used),
        "warnings": [],
    }
    return {
        "status": "succeeded" if selected or failed_candidates else "failed",
        "selected_model_ref": _text(selected.get("model_ref")),
        "provider_fallback_trace": trace,
    }


def _candidate_rejection_reason(
    candidate: dict[str, Any],
    *,
    requested: dict[str, str],
    failure_model_ref: str,
    required_capabilities: list[str],
    required_permissions: list[str],
    preserve_permission_scope: bool,
) -> str:
    if not bool(candidate.get("enabled", True)):
        return "disabled"
    if not bool(candidate.get("configured", True)):
        return "unconfigured"
    if failure_model_ref and _text(candidate.get("model_ref")) == failure_model_ref:
        return "failed_requested_model"
    capabilities = _dict(candidate.get("capabilities"))
    for capability in required_capabilities:
        if not bool(capabilities.get(capability)):
            return "missing_capability"
    permissions = set(_string_list(candidate.get("permissions")))
    required_permission_set = set(required_permissions)
    if not required_permission_set.issubset(permissions):
        return "missing_permission"
    if preserve_permission_scope and permissions - required_permission_set:
        return "permission_scope_expanded"
    if requested and _text(candidate.get("model_ref")) == requested.get("model_ref"):
        return "requested_model"
    return ""


def _failed_candidates(
    candidates: list[dict[str, Any]],
    requested: dict[str, str],
    failure_event: dict[str, Any],
) -> list[dict[str, Any]]:
    if not failure_event:
        return []
    failure_model_ref = _text(failure_event.get("model_ref")) or requested.get("model_ref", "")
    failure_provider_id = _text(failure_event.get("provider_id")) or requested.get("provider_id", "")
    failed = None
    for candidate in candidates:
        if failure_model_ref and _text(candidate.get("model_ref")) == failure_model_ref:
            failed = candidate
            break
    if failed is None:
        failed = {
            "model_ref": failure_model_ref,
            "provider_id": failure_provider_id,
            "model": _text(failure_event.get("model")) or requested.get("model", ""),
        }
    return [
        {
            **_candidate_public(failed),
            "status": "failed",
            "reason": "provider_failed",
            "error_type": _text(failure_event.get("error_type")) or "provider_failed",
            "message": _text(failure_event.get("message")),
        }
    ]


def _attempts(failed_candidates: list[dict[str, Any]], selected: dict[str, Any], *, fallback_used: bool) -> list[dict[str, Any]]:
    attempts: list[dict[str, Any]] = []
    for failed in failed_candidates:
        attempts.append(
            {
                "model_ref": _text(failed.get("model_ref")),
                "provider_id": _text(failed.get("provider_id")),
                "model": _text(failed.get("model")),
                "status": "failed",
                "error_type": _text(failed.get("error_type")),
            }
        )
    if selected:
        attempts.append(
            {
                "model_ref": _text(selected.get("model_ref")),
                "provider_id": _text(selected.get("provider_id")),
                "model": _text(selected.get("model")),
                "status": "selected" if fallback_used else "usable",
            }
        )
    return attempts


def _normalize_candidate(value: Any) -> dict[str, Any]:
    record = _dict(value)
    model_ref = _text(record.get("model_ref") or record.get("modelRef"))
    normalized = _normalize_model_ref(record)
    if model_ref:
        normalized["model_ref"] = model_ref
    return {
        **record,
        **normalized,
        "enabled": record.get("enabled") if isinstance(record.get("enabled"), bool) else True,
        "configured": record.get("configured") if isinstance(record.get("configured"), bool) else True,
        "capabilities": _dict(record.get("capabilities")),
        "permissions": _string_list(record.get("permissions")),
        "priority": _number(record.get("priority")),
    }


def _normalize_model_ref(record: dict[str, Any]) -> dict[str, str]:
    model_ref = _text(record.get("model_ref") or record.get("modelRef"))
    provider_id = _text(record.get("provider_id") or record.get("providerId"))
    model = _text(record.get("model"))
    if model_ref and "/" in model_ref:
        split_provider, split_model = model_ref.split("/", 1)
        provider_id = provider_id or split_provider.strip()
        model = model or split_model.strip()
    elif provider_id and model:
        model_ref = f"{provider_id}/{model}"
    return {
        "provider_id": provider_id,
        "model": model,
        "model_ref": model_ref,
    }


def _candidate_public(candidate: dict[str, Any]) -> dict[str, str]:
    return {
        "provider_id": _text(candidate.get("provider_id")),
        "model": _text(candidate.get("model")),
        "model_ref": _text(candidate.get("model_ref")),
    }


def _dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = _text(item)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _text(value: Any) -> str:
    return str(value or "").strip()
