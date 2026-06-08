from __future__ import annotations

from typing import Any

from app.scheduler import store


OFFICIAL_SCHEDULED_GRAPH_JOBS: tuple[dict[str, Any], ...] = (
    {
        "job_id": "official_buddy_message_retrieval_ingestion",
        "name": "Buddy 消息入库",
        "template_id": "buddy_message_retrieval_ingestion",
        "input_bindings": {
            "session_id": "{{event.session_id}}",
        },
        "schedule_kind": "event",
        "schedule_expr": "buddy.message.created",
        "enabled": True,
        "retry_policy": {
            "max_attempts": 3,
            "delay_seconds": 120,
            "backoff_multiplier": 2,
        },
        "metadata": {
            "source": "official_seed",
            "required_default": True,
            "purpose": "buddy_message_retrieval_ingestion",
            "recommended_trigger": "buddy.message.created",
        },
    },
    {
        "job_id": "official_buddy_autonomous_review",
        "name": "Buddy 自主复盘",
        "template_id": "buddy_autonomous_review",
        "input_bindings": {},
        "schedule_kind": "interval",
        "schedule_expr": "PT20M",
        "enabled": True,
        "retry_policy": {
            "max_attempts": 3,
            "delay_seconds": 300,
            "backoff_multiplier": 2,
        },
        "metadata": {
            "source": "official_seed",
            "required_default": True,
            "purpose": "buddy_autonomous_review",
            "recommended_interval": "every_20_minutes",
            "source_selection": "auto_unreviewed",
        },
    },
    {
        "job_id": "official_embedding_maintenance",
        "name": "Embedding 维护",
        "template_id": "embedding_maintenance",
        "input_bindings": {
            "model_ref": "",
            "job_limit": 50,
        },
        "schedule_kind": "interval",
        "schedule_expr": "PT20M",
        "enabled": True,
        "retry_policy": {
            "max_attempts": 3,
            "delay_seconds": 300,
            "backoff_multiplier": 2,
        },
        "metadata": {
            "source": "official_seed",
            "required_default": True,
            "purpose": "embedding_maintenance",
            "recommended_interval": "every_20_minutes",
        },
    },
    {
        "job_id": "official_knowledge_embedding_drain",
        "name": "知识库 Embedding 入库",
        "template_id": "knowledge_embedding_drain",
        "input_bindings": {
            "collection_id": "{{event.collection_id}}",
            "operation_id": "{{event.operation_id}}",
            "model_ref": "",
            "job_limit": 250,
            "time_budget_seconds": 300,
        },
        "schedule_kind": "event",
        "schedule_expr": "knowledge.ingestion.completed",
        "enabled": True,
        "retry_policy": {
            "max_attempts": 3,
            "delay_seconds": 300,
            "backoff_multiplier": 2,
        },
        "metadata": {
            "source": "official_seed",
            "required_default": True,
            "purpose": "knowledge_embedding_drain",
            "recommended_trigger": "knowledge.ingestion.completed",
        },
    },
)

DEPRECATED_OFFICIAL_SCHEDULED_GRAPH_JOB_IDS: tuple[str, ...] = (
    "official_buddy_capability_curator",
)


def seed_official_scheduled_graph_jobs(*, now: str | None = None) -> dict[str, Any]:
    created: list[dict[str, Any]] = []
    existing: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    removed: list[dict[str, str]] = []
    for job_id in DEPRECATED_OFFICIAL_SCHEDULED_GRAPH_JOB_IDS:
        if store.delete_scheduled_graph_job(job_id):
            removed.append({"job_id": job_id})
    for payload in OFFICIAL_SCHEDULED_GRAPH_JOBS:
        job_id = str(payload["job_id"])
        try:
            before = store.load_scheduled_graph_job(job_id)
            after = store.sync_official_scheduled_graph_job_seed(job_id, payload, now=now)
            existing.append(after)
            if _seed_relevant_snapshot(before) != _seed_relevant_snapshot(after):
                updated.append(after)
            continue
        except KeyError:
            pass
        try:
            created.append(store.create_scheduled_graph_job(dict(payload), now=now))
        except ValueError as exc:
            skipped.append({"job_id": job_id, "error": str(exc)})
    return {
        "created_count": len(created),
        "existing_count": len(existing),
        "updated_count": len(updated),
        "skipped_count": len(skipped),
        "created": created,
        "existing": existing,
        "updated": updated,
        "skipped": skipped,
        "removed_count": len(removed),
        "removed": removed,
    }


def _seed_relevant_snapshot(job: dict[str, Any]) -> dict[str, Any]:
    metadata = job.get("metadata") if isinstance(job.get("metadata"), dict) else {}
    return {
        "name": job.get("name"),
        "enabled": bool(job.get("enabled")),
        "schedule_kind": str(job.get("schedule_kind") or ""),
        "schedule_expr": str(job.get("schedule_expr") or ""),
        "timezone": str(job.get("timezone") or ""),
        "next_run_at": str(job.get("next_run_at") or ""),
        "retry_policy": job.get("retry_policy") if isinstance(job.get("retry_policy"), dict) else {},
        "metadata": {
            "required_default": metadata.get("required_default"),
            "recommended_interval": metadata.get("recommended_interval"),
            "seed_auto_enabled": metadata.get("seed_auto_enabled"),
            "user_schedule_modified": metadata.get("user_schedule_modified"),
            "user_disabled": metadata.get("user_disabled"),
        },
    }
