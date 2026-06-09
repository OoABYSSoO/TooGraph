from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.buddy import store
from app.core.storage.run_store import load_run


VALIDATION_RECOMMENDATION_STATUSES = {"validated", "needs_changes", "rejected", "waiting_for_approval"}
APPLY_COMMAND_ACTIONS = {
    "buddy_identity.update",
    "user_context.update",
    "memory_document.update",
    "session_summary.update",
    "capability_usage_stats.update",
    "memory_entry.create",
    "memory_entry.update",
    "memory_entry.archive",
    "run_template_binding.update",
}


def link_validation_run(candidate_id: str, validation_run_id: str) -> dict[str, Any]:
    candidate = store.link_improvement_candidate_validation_run(candidate_id, validation_run_id)
    return sync_validation_status(str(candidate["candidate_id"]))


def sync_validation_status(candidate_id: str) -> dict[str, Any]:
    candidate = store.get_improvement_candidate(candidate_id)
    validation_run_id = str(candidate.get("validation_run_id") or "").strip()
    if not validation_run_id:
        return candidate
    try:
        validation_run = load_run(validation_run_id)
    except FileNotFoundError:
        return candidate

    next_status = _validation_status_from_run(validation_run, candidate_id=str(candidate["candidate_id"]))
    if not next_status:
        return candidate
    validation_result = _validation_result_from_run(validation_run)
    recommendation = validation_result.get("candidate_status_recommendation")
    status_reason = _text(recommendation.get("reason")) if isinstance(recommendation, dict) else ""
    return store.update_improvement_candidate_status(
        str(candidate["candidate_id"]),
        next_status,
        status_reason=status_reason,
        validation_result=validation_result,
    )


def sync_validation_run(validation_run_id: str) -> list[dict[str, Any]]:
    normalized_validation_run_id = str(validation_run_id or "").strip()
    if not normalized_validation_run_id:
        return []
    candidates = store.list_improvement_candidates(validation_run_id=normalized_validation_run_id)
    return [sync_validation_status(str(candidate["candidate_id"])) for candidate in candidates]


def decide_candidate(candidate_id: str, *, decision: str, reason: str = "") -> dict[str, Any]:
    return store.decide_improvement_candidate(candidate_id, decision=decision, reason=reason)


def apply_candidate(candidate_id: str, *, change_reason: str = "") -> dict[str, Any]:
    candidate = store.get_improvement_candidate(candidate_id)
    if str(candidate.get("status") or "") != "approved":
        raise ValueError("Only approved improvement candidates can be applied.")
    apply_command = _apply_command_from_candidate(candidate)
    action = _text(apply_command.get("action"))
    if action not in APPLY_COMMAND_ACTIONS:
        raise ValueError(f"Unsupported improvement candidate apply command: {action or 'missing'}")
    payload = apply_command.get("payload") if isinstance(apply_command.get("payload"), dict) else {}
    command_request = {
        "action": action,
        "payload": deepcopy(payload),
        "target_id": _text(apply_command.get("target_id")) or None,
        "run_id": str(candidate.get("validation_run_id") or candidate.get("review_run_id") or ""),
        "change_reason": str(change_reason or apply_command.get("change_reason") or "").strip()
        or f"Apply approved improvement candidate {candidate['candidate_id']}.",
    }
    from app.buddy import commands

    command_result = commands.execute_command(command_request)
    command = command_result.get("command") if isinstance(command_result.get("command"), dict) else {}
    revision = command_result.get("revision") if isinstance(command_result.get("revision"), dict) else {}
    revision_id = _text(command.get("revision_id") or revision.get("revision_id"))
    if not revision_id:
        raise ValueError("Improvement candidate apply command did not produce a revision.")
    applied_command = {
        "action": action,
        "command_id": _text(command.get("command_id")),
        "revision_id": revision_id,
        "target_type": _text(command.get("target_type")),
        "target_id": _text(command.get("target_id")),
        "run_id": _text(command.get("run_id")),
        "change_reason": _text(command.get("change_reason")),
    }
    return store.mark_improvement_candidate_applied(
        str(candidate["candidate_id"]),
        revision_id=revision_id,
        applied_command=applied_command,
        status_reason=f"Applied by command {applied_command['command_id']}.",
    )


def _apply_command_from_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    validation_result = candidate.get("validation_result") if isinstance(candidate.get("validation_result"), dict) else {}
    approval_request = validation_result.get("approval_request") if isinstance(validation_result.get("approval_request"), dict) else {}
    apply_command = approval_request.get("apply_command") if isinstance(approval_request.get("apply_command"), dict) else {}
    if apply_command:
        return deepcopy(apply_command)
    payload = candidate.get("payload") if isinstance(candidate.get("payload"), dict) else {}
    payload_apply_command = payload.get("apply_command") if isinstance(payload.get("apply_command"), dict) else {}
    return deepcopy(payload_apply_command)


def _validation_status_from_run(validation_run: dict[str, Any], *, candidate_id: str) -> str:
    run_status = str(validation_run.get("status") or "").strip().lower()
    if run_status in {"failed", "cancelled"}:
        return "failed"
    if run_status != "completed":
        return ""
    recommendation = _candidate_status_recommendation(validation_run)
    recommended_candidate_id = _text(recommendation.get("candidate_id"))
    if recommended_candidate_id and recommended_candidate_id != candidate_id:
        return ""
    recommended_status = _text(recommendation.get("recommended_status")).lower()
    return recommended_status if recommended_status in VALIDATION_RECOMMENDATION_STATUSES else ""


def _validation_result_from_run(validation_run: dict[str, Any]) -> dict[str, Any]:
    values = _run_state_values(validation_run)
    result: dict[str, Any] = {}
    for key in (
        "candidate_validation_plan",
        "proposed_diff",
        "validation_report",
        "test_plan",
        "approval_request",
        "candidate_status_recommendation",
        "final_summary",
    ):
        if key in values:
            result[key] = deepcopy(values[key])
    return result


def _candidate_status_recommendation(validation_run: dict[str, Any]) -> dict[str, Any]:
    values = _run_state_values(validation_run)
    if isinstance(values.get("candidate_status_recommendation"), dict):
        return deepcopy(values["candidate_status_recommendation"])
    return {}


def _run_state_values(validation_run: dict[str, Any]) -> dict[str, Any]:
    values = validation_run.get("state_values")
    if isinstance(values, dict):
        return values
    snapshot = validation_run.get("state_snapshot")
    snapshot_values = snapshot.get("values") if isinstance(snapshot, dict) else {}
    return snapshot_values if isinstance(snapshot_values, dict) else {}


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()
