from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def embedding_job_processor(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.core.storage.embedding_store import process_pending_embedding_jobs

        return process_pending_embedding_jobs(
            model_ref=_text(inputs.get("model_ref")),
            limit=_int(inputs.get("limit"), default=50),
            retry_failed=_bool(inputs.get("retry_failed")),
            batch_size=_int(inputs.get("batch_size"), default=1),
            collection_id=_text(inputs.get("collection_id")),
            operation_id=_text(inputs.get("operation_id")),
            source_kind=_text(inputs.get("source_kind")),
            source_kinds=inputs.get("source_kinds"),
            source_id=_text(inputs.get("source_id")),
            time_budget_seconds=_int(inputs.get("time_budget_seconds"), default=0),
            include_retry_wait=_bool(inputs.get("include_retry_wait")),
            maintenance_only=_bool(inputs.get("maintenance_only")),
        )
    except Exception as exc:
        return {
            "status": "failed",
            "error_type": "embedding_job_processing_failed",
            "error": str(exc),
            "processed_count": 0,
            "completed_count": 0,
            "failed_count": 0,
            "retry_wait_count": 0,
            "blocked_count": 0,
            "retried_failed_count": 0,
            "reset_stale_running_count": 0,
            "reset_blocked_dimension_mismatch_count": 0,
            "remaining_count": 0,
            "ready_memory_job_count": 0,
            "ready_knowledge_operation_count": 0,
            "synced_operation_count": 0,
            "scope": {
                "collection_id": _text(inputs.get("collection_id")),
                "operation_id": _text(inputs.get("operation_id")),
                "source_kind": _text(inputs.get("source_kind")),
                "source_id": _text(inputs.get("source_id")),
            },
            "processed_jobs": [],
            "maintenance_report": {},
        }


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _int(value: Any, *, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _text(value: Any) -> str:
    return str(value or "").strip()


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"status": "failed", "error_type": "invalid_json", "error": str(exc)}, ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(
            json.dumps(
                {"status": "failed", "error_type": "invalid_input", "error": "stdin must be a JSON object."},
                ensure_ascii=False,
            )
        )
        return
    print(json.dumps(embedding_job_processor(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
