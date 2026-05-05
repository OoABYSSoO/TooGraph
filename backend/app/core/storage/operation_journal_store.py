from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from app.core.storage.database import DATA_DIR
from app.core.storage.json_file_utils import utc_now_iso


OPERATION_JOURNAL_PATH = DATA_DIR / "operation_journal" / "virtual_ui_operations.jsonl"


def record_operation_journal_event(*, run_id: str, event: dict[str, Any]) -> dict[str, Any] | None:
    if _compact_text(event.get("kind")) != "virtual_ui_operation":
        return None
    detail = event.get("detail") if isinstance(event.get("detail"), dict) else {}
    operation_request_id = _operation_request_id_from_detail(detail)
    if not operation_request_id:
        return None

    status = _compact_text(event.get("status"))
    operation_request = _compact_record(detail.get("operation_request") or detail.get("operationRequest"))
    operation = _compact_record(detail.get("operation")) or _first_operation_from_request(operation_request)
    operation_report = _compact_record(detail.get("operation_report") or detail.get("operationReport"))
    triggered_run = _compact_record(detail.get("triggered_run") or detail.get("triggeredRun"))
    artifact_refs = _compact_artifact_refs(
        detail.get("artifact_refs")
        or detail.get("artifactRefs")
        or operation_report.get("artifact_refs")
        or operation_report.get("artifactRefs")
        or triggered_run.get("artifact_refs")
        or triggered_run.get("artifactRefs")
    )
    if artifact_refs and "artifact_refs" not in triggered_run:
        triggered_run["artifact_refs"] = artifact_refs
    if artifact_refs:
        operation_report["artifact_refs"] = artifact_refs
    retry_chain = _compact_retry_chain(
        detail.get("retry_chain")
        or detail.get("retryChain")
        or operation_report.get("retry_chain")
        or operation_report.get("retryChain")
    )
    if retry_chain:
        operation_report["retry_chain"] = retry_chain
    page_snapshots = _compact_record(detail.get("page_snapshots") or detail.get("pageSnapshots"))
    journal = _compact_list(detail.get("journal"))
    entry = {
        "id": _journal_entry_id(run_id=run_id, operation_request_id=operation_request_id, event=event),
        "operation_request_id": operation_request_id,
        "run_id": _compact_text(run_id or detail.get("run_id") or detail.get("runId")),
        "stage": _stage_from_status(status),
        "status": status,
        "summary": _compact_text(event.get("summary")),
        "node_id": _compact_text(event.get("node_id") or detail.get("node_id") or detail.get("nodeId")),
        "subgraph_node_id": _compact_text(
            event.get("subgraph_node_id") or detail.get("subgraph_node_id") or detail.get("subgraphNodeId")
        ),
        "subgraph_path": _compact_text_list(event.get("subgraph_path") or detail.get("subgraph_path") or detail.get("subgraphPath")),
        "operation": operation,
        "operation_request": operation_request,
        "operation_report": operation_report,
        "page_snapshots": page_snapshots,
        "triggered_run": triggered_run,
        "artifact_refs": artifact_refs,
        "retry_chain": retry_chain,
        "failure_category": _compact_text(detail.get("failure_category") or detail.get("failureCategory")),
        "error": _compact_text(event.get("error") or detail.get("error")),
        "journal": journal,
        "activity_sequence": _optional_int(event.get("sequence")),
        "activity_created_at": _compact_text(event.get("created_at") or event.get("createdAt")),
        "recorded_at": utc_now_iso(),
    }
    entry["target_id"] = _compact_text(operation.get("target_id") or operation.get("targetId") or operation_report.get("target_id"))
    entry["target_label"] = _compact_text(operation.get("target_label") or operation.get("targetLabel"))
    entry["input_text"] = _compact_text(operation.get("input_text") or operation.get("inputText") or operation_report.get("input_text"))

    OPERATION_JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OPERATION_JOURNAL_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
    return entry


def list_operation_journal_entries(
    *,
    page: int = 1,
    size: int = 50,
    run_id: str = "",
    operation_request_id: str = "",
    status: str = "",
) -> dict[str, Any]:
    page = max(1, int(page or 1))
    size = max(1, min(int(size or 50), 200))
    normalized_run_id = _compact_text(run_id)
    normalized_operation_request_id = _compact_text(operation_request_id)
    normalized_status = _compact_text(status)

    entries = _read_entries()
    if normalized_run_id:
        entries = [entry for entry in entries if entry.get("run_id") == normalized_run_id]
    if normalized_operation_request_id:
        entries = [entry for entry in entries if entry.get("operation_request_id") == normalized_operation_request_id]
    if normalized_status:
        entries = [entry for entry in entries if entry.get("status") == normalized_status]

    entries.sort(key=lambda entry: (_compact_text(entry.get("activity_created_at")), int(entry.get("activity_sequence") or 0), entry.get("id")))
    total = len(entries)
    start = (page - 1) * size
    return {
        "entries": entries[start : start + size],
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if total else 0,
    }


def _read_entries() -> list[dict[str, Any]]:
    if not OPERATION_JOURNAL_PATH.exists():
        return []
    entries: list[dict[str, Any]] = []
    with OPERATION_JOURNAL_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                entries.append(payload)
    return entries


def _operation_request_id_from_detail(detail: dict[str, Any]) -> str:
    operation_request = detail.get("operation_request") if isinstance(detail.get("operation_request"), dict) else {}
    if not operation_request and isinstance(detail.get("operationRequest"), dict):
        operation_request = detail["operationRequest"]
    return _compact_text(
        detail.get("operation_request_id")
        or detail.get("operationRequestId")
        or operation_request.get("operation_request_id")
        or operation_request.get("operationRequestId")
    )


def _first_operation_from_request(operation_request: dict[str, Any]) -> dict[str, Any]:
    operations = operation_request.get("operations")
    if not isinstance(operations, list) or not operations:
        return {}
    first = operations[0]
    return _compact_record(first) if isinstance(first, dict) else {}


def _stage_from_status(status: str) -> str:
    if status == "requested":
        return "request"
    if status in {"succeeded", "failed", "interrupted"}:
        return "completion"
    return status or "event"


def _journal_entry_id(*, run_id: str, operation_request_id: str, event: dict[str, Any]) -> str:
    payload = json.dumps(
        {
            "run_id": _compact_text(run_id),
            "operation_request_id": operation_request_id,
            "sequence": event.get("sequence"),
            "created_at": event.get("created_at"),
            "status": event.get("status"),
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return f"opj_{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]}"


def _compact_record(value: Any) -> dict[str, Any]:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str)) if isinstance(value, dict) else {}


def _compact_list(value: Any) -> list[Any]:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str)) if isinstance(value, list) else []


def _compact_artifact_refs(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    keys = (
        "title",
        "artifact_kind",
        "path",
        "local_path",
        "file_name",
        "source_key",
        "node_id",
        "format",
        "content_type",
    )
    refs: list[dict[str, str]] = []
    for item in value[:50]:
        if not isinstance(item, dict):
            continue
        ref = {key: _compact_text(item.get(key)) for key in keys if _compact_text(item.get(key))}
        if ref:
            refs.append(ref)
    return refs


def _compact_retry_chain(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    records: list[dict[str, Any]] = []
    for item in value[:50]:
        if not isinstance(item, dict):
            continue
        record = {
            "kind": _compact_text(item.get("kind")),
            "target_id": _compact_text(item.get("target_id") or item.get("targetId")),
            "status": _compact_text(item.get("status")),
        }
        attempts = _optional_int(item.get("attempts"))
        elapsed_ms = _optional_int(item.get("elapsed_ms") if item.get("elapsed_ms") is not None else item.get("elapsedMs"))
        if attempts is not None:
            record["attempts"] = max(1, attempts)
        if elapsed_ms is not None and elapsed_ms >= 0:
            record["elapsed_ms"] = elapsed_ms
        if record["kind"] and record["target_id"] and record["status"]:
            records.append(record)
    return records


def _compact_text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


def _optional_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _compact_text(value: Any) -> str:
    return str(value or "").strip()
