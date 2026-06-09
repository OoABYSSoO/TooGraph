from __future__ import annotations

from copy import deepcopy
from typing import Any
from app.buddy import store
from app.core.storage.run_store import load_run

WRITEBACK_CHANNELS = (
    ("memory", "applied_memory_commands", "skipped_memory_commands"),
    ("user_context", "applied_user_context_commands", "skipped_user_context_commands"),
    ("structured_memory", "applied_structured_memory_commands", "skipped_structured_memory_commands"),
    ("buddy_identity", "applied_buddy_identity_commands", "skipped_buddy_identity_commands"),
    ("capability_usage", "applied_capability_usage_commands", "skipped_capability_usage_commands"),
)

def list_background_review_runs(*, source_run_id: str | None = None) -> list[dict[str, Any]]:
    return [_with_review_summaries(record) for record in store.list_background_review_runs(source_run_id=source_run_id)]


def _with_review_summaries(record: dict[str, Any]) -> dict[str, Any]:
    review_run_id = str(record.get("review_run_id") or "").strip()
    if not review_run_id:
        return {
            **record,
            "writeback_summary": _empty_writeback_summary(),
            "improvement_summary": _empty_improvement_summary(),
        }
    try:
        review_run = load_run(review_run_id)
    except FileNotFoundError:
        writeback_summary = _empty_writeback_summary()
        improvement_summary = _empty_improvement_summary()
        warning = f"Review run '{review_run_id}' was not found."
        writeback_summary["warnings"].append(warning)
        improvement_summary["warnings"].append(warning)
        return {**record, "writeback_summary": writeback_summary, "improvement_summary": improvement_summary}
    return {
        **record,
        "writeback_summary": build_writeback_summary_from_run(review_run),
        "improvement_summary": _with_persisted_improvement_candidate_state(
            _projected_improvement_summary(record, review_run),
            record,
        ),
    }


def build_writeback_summary_from_run(review_run: dict[str, Any]) -> dict[str, Any]:
    values = _run_state_values(review_run)
    summary = _empty_writeback_summary()
    revision_ids: set[str] = set()
    memory_ids: set[str] = set()

    for channel, applied_state, skipped_state in WRITEBACK_CHANNELS:
        for item in _list_of_records(values.get(applied_state)):
            applied = _summarize_applied_command(item, channel=channel)
            summary["applied_commands"].append(applied)
            summary["applied_count"] += 1
            revision = _summarize_revision(item)
            revision_id = str(revision.get("revision_id") or "").strip()
            if revision_id and revision_id not in revision_ids:
                revision_ids.add(revision_id)
                summary["revision_ids"].append(revision_id)
                summary["revisions"].append(revision)
            memory_id = _memory_id_from_applied_command(item)
            if memory_id and memory_id not in memory_ids:
                memory_ids.add(memory_id)
                summary["memory_ids"].append(memory_id)
        for item in _list_of_records(values.get(skipped_state)):
            summary["skipped_commands"].append(_summarize_skipped_command(item, channel=channel))
            summary["skipped_count"] += 1

    evidence = _autonomous_review_evidence(values.get("autonomous_review"))
    if evidence:
        summary["evidence_items"].append({"source_state": "autonomous_review.evidence", "text": evidence})
    return summary


def _empty_writeback_summary() -> dict[str, Any]:
    return {
        "applied_count": 0,
        "skipped_count": 0,
        "revision_ids": [],
        "revisions": [],
        "memory_ids": [],
        "applied_commands": [],
        "skipped_commands": [],
        "evidence_items": [],
        "warnings": [],
    }


def build_improvement_summary_from_run(review_run: dict[str, Any]) -> dict[str, Any]:
    values = _run_state_values(review_run)
    summary = _empty_improvement_summary()
    for index, item in enumerate(_list_of_records(values.get("improvement_candidates"))):
        candidate = _summarize_improvement_candidate(item, index=index, review_run=review_run)
        summary["candidates"].append(candidate)
        summary["candidate_count"] += 1
        risk_level = candidate["risk_level"]
        if risk_level:
            summary["risk_counts"][risk_level] = summary["risk_counts"].get(risk_level, 0) + 1
    return summary


def _projected_improvement_summary(record: dict[str, Any], review_run: dict[str, Any]) -> dict[str, Any]:
    if _is_completed_review_run(record, review_run):
        _project_improvement_candidates(record, review_run)
    return build_improvement_summary_from_run(review_run)


def _project_improvement_candidates(record: dict[str, Any], review_run: dict[str, Any]) -> list[dict[str, Any]]:
    values = _run_state_values(review_run)
    candidates = _list_of_records(values.get("improvement_candidates"))
    return store.upsert_improvement_candidates_for_review(record, candidates)


def _is_completed_review_run(record: dict[str, Any], review_run: dict[str, Any]) -> bool:
    return (
        str(record.get("status") or "").strip() == "completed"
        or str(review_run.get("status") or "").strip() == "completed"
    )


def _with_persisted_improvement_candidate_state(
    summary: dict[str, Any],
    record: dict[str, Any],
) -> dict[str, Any]:
    review_id = str(record.get("review_id") or "").strip()
    if not review_id:
        return summary
    persisted = {
        str(candidate.get("candidate_id") or ""): candidate
        for candidate in store.list_improvement_candidates(review_id=review_id)
    }
    if not persisted:
        return summary
    for candidate in summary.get("candidates", []):
        if not isinstance(candidate, dict):
            continue
        persisted_candidate = persisted.get(str(candidate.get("candidate_id") or ""))
        if not persisted_candidate:
            continue
        candidate["status"] = str(persisted_candidate.get("status") or "proposed")
        candidate["validation_run_id"] = str(persisted_candidate.get("validation_run_id") or "")
        candidate["applied_revision_id"] = str(persisted_candidate.get("applied_revision_id") or "")
        candidate["has_apply_command"] = _has_candidate_apply_command(persisted_candidate)
    return summary


def _has_candidate_apply_command(candidate: dict[str, Any]) -> bool:
    validation_result = candidate.get("validation_result") if isinstance(candidate.get("validation_result"), dict) else {}
    approval_request = validation_result.get("approval_request") if isinstance(validation_result.get("approval_request"), dict) else {}
    apply_command = approval_request.get("apply_command") if isinstance(approval_request.get("apply_command"), dict) else {}
    if str(apply_command.get("action") or "").strip():
        return True
    payload = candidate.get("payload") if isinstance(candidate.get("payload"), dict) else {}
    payload_apply_command = payload.get("apply_command") if isinstance(payload.get("apply_command"), dict) else {}
    return bool(str(payload_apply_command.get("action") or "").strip())


def _empty_improvement_summary() -> dict[str, Any]:
    return {
        "candidate_count": 0,
        "risk_counts": {},
        "candidates": [],
        "warnings": [],
    }


def _summarize_improvement_candidate(item: dict[str, Any], *, index: int, review_run: dict[str, Any]) -> dict[str, Any]:
    candidate_id = _text(item.get("candidate_id")) or f"candidate_{index + 1}"
    source_run_id = _text(item.get("source_run_id")) or _text((review_run.get("metadata") or {}).get("buddy_parent_run_id"))
    target_ref = item.get("target_ref") if isinstance(item.get("target_ref"), dict) else {}
    return {
        "candidate_id": candidate_id,
        "kind": _text(item.get("kind")),
        "status": _text(item.get("status")).lower() or "proposed",
        "source_run_id": source_run_id,
        "target_ref": deepcopy(target_ref),
        "risk_level": _text(item.get("risk_level")),
        "expected_benefit": _text(item.get("expected_benefit")),
        "proposed_change_summary": _text(item.get("proposed_change_summary") or item.get("summary") or item.get("title")),
        "approval_required": bool(item.get("approval_required")),
        "evidence_refs": _evidence_refs(item.get("evidence_refs")),
    }


def _evidence_refs(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [deepcopy(item) for item in value if isinstance(item, dict)]


def _run_state_values(review_run: dict[str, Any]) -> dict[str, Any]:
    values = review_run.get("state_values")
    if isinstance(values, dict):
        return values
    snapshot = review_run.get("state_snapshot")
    if isinstance(snapshot, dict) and isinstance(snapshot.get("values"), dict):
        return snapshot["values"]
    return {}


def _list_of_records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _summarize_applied_command(item: dict[str, Any], *, channel: str) -> dict[str, Any]:
    command = item.get("command") if isinstance(item.get("command"), dict) else {}
    revision = item.get("revision") if isinstance(item.get("revision"), dict) else {}
    return {
        "channel": channel,
        "command_id": _text(command.get("command_id")),
        "action": _text(command.get("action")),
        "status": _text(command.get("status")),
        "target_type": _text(command.get("target_type")),
        "target_id": _text(command.get("target_id")),
        "revision_id": _text(command.get("revision_id") or revision.get("revision_id")),
        "run_id": _text(command.get("run_id")),
        "change_reason": _text(command.get("change_reason")),
    }


def _summarize_skipped_command(item: dict[str, Any], *, channel: str) -> dict[str, Any]:
    return {
        "channel": channel,
        "index": item.get("index"),
        "action": _text(item.get("action")),
        "error_type": _text(item.get("error_type")),
        "error": _text(item.get("error")),
    }


def _summarize_revision(item: dict[str, Any]) -> dict[str, Any]:
    command = item.get("command") if isinstance(item.get("command"), dict) else {}
    revision = item.get("revision") if isinstance(item.get("revision"), dict) else {}
    revision_id = _text(revision.get("revision_id") or command.get("revision_id"))
    if not revision_id:
        return {}
    return {
        "revision_id": revision_id,
        "target_type": _text(revision.get("target_type") or command.get("target_type")),
        "target_id": _text(revision.get("target_id") or command.get("target_id")),
        "operation": _text(revision.get("operation")),
    }


def _memory_id_from_applied_command(item: dict[str, Any]) -> str:
    result = item.get("result") if isinstance(item.get("result"), dict) else {}
    command = item.get("command") if isinstance(item.get("command"), dict) else {}
    memory_id = _text(result.get("memory_id"))
    if memory_id:
        return memory_id
    if _text(command.get("target_type")) == "memory_entry":
        return _text(command.get("target_id"))
    return ""


def _autonomous_review_evidence(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    return _text(value.get("evidence"))


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()
