from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


SENSITIVE_KEYWORDS = (
    "token",
    "secret",
    "password",
    "api_key",
    "apikey",
    "authorization",
    "credential",
)


def scheduler_run_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.scheduler import store

        job_id = _text(inputs.get("job_id"))
        if not job_id:
            raise ValueError("job_id is required.")
        job = store.load_scheduled_graph_job(job_id)
        job_run_id = _text(inputs.get("job_run_id"))
        if job_run_id:
            job_run = store.load_scheduled_graph_job_run(job_run_id)
        else:
            runs = store.list_scheduled_graph_job_runs(job_id=job_id)
            if not runs:
                raise KeyError(f"Scheduled graph job '{job_id}' has no runs.")
            job_run = runs[0]
        return {
            "status": "succeeded",
            "scheduler_run_report": _build_report(job, job_run),
        }
    except Exception as exc:
        return {
            "status": "failed",
            "error_type": "scheduler_run_context_load_failed",
            "error": str(exc),
            "scheduler_run_report": {
                "job_id": _text(inputs.get("job_id")),
                "job_run_id": _text(inputs.get("job_run_id")),
                "source_refs": [],
                "warnings": [
                    {
                        "code": "scheduler_run_context_load_failed",
                        "message": str(exc),
                    }
                ],
            },
        }


def _build_report(job: dict[str, Any], job_run: dict[str, Any]) -> dict[str, Any]:
    job_metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    run_metadata = job_run.get("metadata") if isinstance(job_run.get("metadata"), dict) else {}
    run_id = _text(job_run.get("run_id"))
    graph_run = _load_graph_run(run_id)
    graph_run_metadata = graph_run.get("metadata") if isinstance(graph_run.get("metadata"), dict) else {}
    source_refs = [
        {"source_kind": "scheduled_graph_job", "source_id": _text(job.get("job_id"))},
        {"source_kind": "scheduled_graph_job_run", "source_id": _text(job_run.get("job_run_id"))},
    ]
    if run_id:
        source_refs.append({"source_kind": "graph_run", "source_id": run_id})
    return {
        "kind": "scheduler_run_report",
        "job_id": _text(job.get("job_id")),
        "job_name": _text(job.get("name")),
        "job_run_id": _text(job_run.get("job_run_id")),
        "run_id": run_id,
        "template_id": _text(job.get("template_id")),
        "trigger_reason": _text(job_run.get("trigger_reason")),
        "status": _text(job_run.get("status")),
        "error": _text(job_run.get("error")),
        "started_at": _text(job_run.get("started_at")),
        "completed_at": _text(job_run.get("completed_at")),
        "graph_run_status": _text(graph_run.get("status")),
        "graph_permission_mode": _text(graph_run_metadata.get("graph_permission_mode")),
        "permission_policy": _redact(
            graph_run_metadata.get("capability_permission_policy")
            if isinstance(graph_run_metadata.get("capability_permission_policy"), dict)
            else {}
        ),
        "scheduled_graph_permission_policy_source": _text(
            graph_run_metadata.get("scheduled_graph_permission_policy_source")
        ),
        "pending_permission_approval": _redact(
            graph_run_metadata.get("pending_permission_approval")
            if isinstance(graph_run_metadata.get("pending_permission_approval"), dict)
            else {}
        ),
        "schedule": {
            "kind": _text(job.get("schedule_kind")),
            "expr": _text(job.get("schedule_expr")),
            "timezone": _text(job.get("timezone")),
            "enabled": bool(job.get("enabled")),
            "next_run_at": _text(job.get("next_run_at")),
        },
        "retry_policy": dict(job.get("retry_policy") if isinstance(job.get("retry_policy"), dict) else {}),
        "retry_decision": dict(run_metadata.get("retry_decision") if isinstance(run_metadata.get("retry_decision"), dict) else {}),
        "scheduler_retry_pending": dict(
            job_metadata.get("scheduler_retry_pending")
            if isinstance(job_metadata.get("scheduler_retry_pending"), dict)
            else {}
        ),
        "delivery_result": _redact(
            run_metadata.get("delivery_result") if isinstance(run_metadata.get("delivery_result"), dict) else {}
        ),
        "delivery_target": _redact(job.get("delivery_target") if isinstance(job.get("delivery_target"), dict) else {}),
        "source_refs": source_refs,
        "source_count": len(source_refs),
    }


def _load_graph_run(run_id: str) -> dict[str, Any]:
    if not run_id:
        return {}
    try:
        from app.core.storage.run_store import load_run

        run = load_run(run_id)
        return run if isinstance(run, dict) else {}
    except Exception:
        return {}


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            normalized_key = str(key).lower().replace("-", "_")
            if any(keyword in normalized_key for keyword in SENSITIVE_KEYWORDS):
                redacted[str(key)] = "[redacted]"
            else:
                redacted[str(key)] = _redact(item)
        return redacted
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _ensure_backend_path() -> None:
    root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3])
    backend = root / "backend"
    backend_path = str(backend)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)


def _text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(scheduler_run_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()
