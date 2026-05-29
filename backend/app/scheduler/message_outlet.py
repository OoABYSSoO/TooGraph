from __future__ import annotations

from typing import Any

from app.buddy import store as buddy_store
from app.core.storage.json_file_utils import utc_now_iso
from app.messaging import store as messaging_store
from app.messaging.buddy_visible_stream import resolve_buddy_visible_reply_parts
from app.messaging.runtime import message_platform_runtime
from app.scheduler import store as scheduler_store


MESSAGE_OUTLET_KIND = "message_outlet"
SUPPORTED_OUTLETS = {"buddy", "feishu", "telegram"}
SESSION_MODES = {"existing_session", "create_session", "new_session_per_run"}


def deliver_scheduled_graph_job_outputs(job_run_id: str, run_state: dict[str, Any]) -> dict[str, Any] | None:
    job_run = scheduler_store.load_scheduled_graph_job_run(job_run_id)
    job = scheduler_store.load_scheduled_graph_job(str(job_run.get("job_id") or ""))
    target = _normalize_message_outlet_target(job.get("delivery_target"))
    if target is None:
        return None
    parts = [part for part in resolve_buddy_visible_reply_parts(run_state) if str(part or "").strip()]
    delivered_at = str(run_state.get("completed_at") or "") or utc_now_iso()
    if not parts:
        result = {
            "kind": MESSAGE_OUTLET_KIND,
            "status": "skipped",
            "reason": "no_public_outputs",
            "delivered_at": delivered_at,
            "job_id": job["job_id"],
            "job_run_id": job_run["job_run_id"],
            "run_ref": {"kind": "graph_run", "run_id": str(job_run.get("run_id") or "")},
            "target": scheduler_store.redact_delivery_value(target),
        }
        scheduler_store.apply_scheduled_delivery_result(job_run["job_run_id"], delivery_result=result, now=delivered_at)
        return result

    resolution = _resolve_target_session(job, job_run, target)
    content = "\n\n".join(parts)
    message = buddy_store.append_chat_message(
        resolution["buddy_session_id"],
        {
            "role": "assistant",
            "content": content,
            "include_in_context": True,
            "run_id": job_run["run_id"],
            "metadata": {
                "source_kind": "scheduled_graph_message_outlet",
                "job_id": job["job_id"],
                "job_run_id": job_run["job_run_id"],
                "outlet": target["outlet"],
                **(
                    {"platform_session_id": resolution["platform_session_id"]}
                    if resolution.get("platform_session_id")
                    else {}
                ),
            },
        },
        changed_by="scheduler",
        change_reason="定时任务输出到消息出口。",
    )
    platform_deliveries = _deliver_external_parts(resolution, parts)
    result = {
        "kind": MESSAGE_OUTLET_KIND,
        "status": _resolve_delivery_status(platform_deliveries),
        "outlet": target["outlet"],
        "session_mode": target["session_mode"],
        "message_count": len(parts),
        "delivered_at": delivered_at,
        "job_id": job["job_id"],
        "job_run_id": job_run["job_run_id"],
        "run_ref": {"kind": "graph_run", "run_id": str(job_run.get("run_id") or "")},
        "buddy_session_id": resolution["buddy_session_id"],
        "buddy_message_id": message["message_id"],
        "platform_session_id": resolution.get("platform_session_id", ""),
        "platform_deliveries": platform_deliveries,
        "target": scheduler_store.redact_delivery_value(target),
    }
    scheduler_store.apply_scheduled_delivery_result(job_run["job_run_id"], delivery_result=result, now=delivered_at)
    return result


def _normalize_message_outlet_target(value: Any) -> dict[str, Any] | None:
    target = value if isinstance(value, dict) else {}
    kind = str(target.get("kind") or target.get("type") or "").strip()
    if kind != MESSAGE_OUTLET_KIND:
        return None
    outlet = str(target.get("outlet") or target.get("target") or "").strip().lower()
    if outlet not in SUPPORTED_OUTLETS:
        raise ValueError("message outlet must be buddy, feishu, or telegram.")
    session_mode = str(target.get("session_mode") or target.get("mode") or "existing_session").strip()
    if session_mode not in SESSION_MODES:
        raise ValueError("message outlet session_mode is invalid.")
    return {
        **target,
        "kind": MESSAGE_OUTLET_KIND,
        "outlet": outlet,
        "session_mode": session_mode,
    }


def _resolve_target_session(job: dict[str, Any], job_run: dict[str, Any], target: dict[str, Any]) -> dict[str, str]:
    outlet = target["outlet"]
    if outlet == "buddy":
        buddy_session_id = _resolve_buddy_session_id(job, job_run, target)
        return {"buddy_session_id": buddy_session_id, "platform_session_id": ""}
    platform_session = _resolve_platform_session(job, job_run, target)
    buddy_session_id = str(platform_session.get("buddy_session_id") or "").strip()
    if not buddy_session_id:
        buddy_session_id = _create_buddy_session(job, job_run, target)["session_id"]
        platform_session = messaging_store.rebind_platform_session(
            str(platform_session["platform_session_id"]),
            buddy_session_id,
            updated_by="scheduler",
        )
    return {
        "buddy_session_id": buddy_session_id,
        "platform_session_id": str(platform_session["platform_session_id"]),
    }


def _resolve_buddy_session_id(job: dict[str, Any], job_run: dict[str, Any], target: dict[str, Any]) -> str:
    if target["session_mode"] == "existing_session":
        session_id = str(target.get("buddy_session_id") or target.get("session_id") or "").strip()
        if not session_id:
            raise ValueError("buddy_session_id is required for an existing Buddy message outlet.")
        buddy_store.get_chat_session(session_id)
        return session_id
    if target["session_mode"] == "create_session":
        session_id = str(target.get("buddy_session_id") or target.get("session_id") or "").strip()
        if session_id:
            buddy_store.get_chat_session(session_id)
        else:
            session_id = str(_create_buddy_session(job, job_run, target)["session_id"])
        _bind_created_message_outlet_session(job, target, {"buddy_session_id": session_id})
        return session_id
    session = _create_buddy_session(job, job_run, target)
    return str(session["session_id"])


def _resolve_platform_session(job: dict[str, Any], job_run: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    if target["session_mode"] == "existing_session":
        platform_session_id = str(target.get("platform_session_id") or "").strip()
        if not platform_session_id:
            raise ValueError("platform_session_id is required for an existing platform message outlet.")
        session = messaging_store.get_platform_session(platform_session_id)
        if not session:
            raise ValueError("message platform session does not exist.")
        if str(session.get("platform_id") or "") != target["outlet"]:
            raise ValueError("message platform session outlet does not match the configured outlet.")
        return session

    binding_id = str(target.get("binding_id") or "").strip()
    chat_id = str(target.get("external_chat_id") or target.get("chat_id") or "").strip()
    if not binding_id or not chat_id:
        raise ValueError("binding_id and external_chat_id are required when creating a platform message outlet session.")
    external_thread_id = str(target.get("external_thread_id") or target.get("thread_id") or "").strip()
    external_chat_type = str(target.get("external_chat_type") or "group").strip() or "group"
    suffix = job_run["job_run_id"] if target["session_mode"] == "new_session_per_run" else job["job_id"]
    external_conversation_key = (
        str(target.get("external_conversation_key") or "").strip()
        or messaging_store.build_external_conversation_key(
            platform_id=target["outlet"],
            chat_id=f"{chat_id}:{suffix}" if target["session_mode"] == "new_session_per_run" else chat_id,
            thread_id=external_thread_id,
            sender_id="",
            chat_type=external_chat_type,
        )
    )
    if target["session_mode"] == "create_session":
        existing_session = messaging_store.get_platform_session_by_conversation(
            platform_id=target["outlet"],
            binding_id=binding_id,
            external_conversation_key=external_conversation_key,
        )
        if existing_session:
            if not str(existing_session.get("buddy_session_id") or "").strip():
                buddy_session = _create_buddy_session(job, job_run, target)
                existing_session = messaging_store.rebind_platform_session(
                    str(existing_session["platform_session_id"]),
                    str(buddy_session["session_id"]),
                    updated_by="scheduler",
                )
            _bind_created_message_outlet_session(
                job,
                target,
                {"platform_session_id": str(existing_session["platform_session_id"])},
            )
            return existing_session

    buddy_session = _create_buddy_session(job, job_run, target)
    platform_session = messaging_store.resolve_or_create_platform_session(
        platform_id=target["outlet"],
        binding_id=binding_id,
        external_conversation_key=external_conversation_key,
        external_chat_id=chat_id,
        external_thread_id=external_thread_id,
        external_chat_type=external_chat_type,
        external_display_name=str(target.get("external_display_name") or target.get("display_name") or "").strip(),
        title=str(target.get("title") or _default_session_title(job, target)).strip(),
        buddy_session_id=str(buddy_session["session_id"]),
    )
    if target["session_mode"] == "create_session":
        _bind_created_message_outlet_session(
            job,
            target,
            {"platform_session_id": str(platform_session["platform_session_id"])},
        )
    return platform_session


def _bind_created_message_outlet_session(
    job: dict[str, Any],
    target: dict[str, Any],
    updates: dict[str, Any],
) -> None:
    if target.get("session_mode") != "create_session":
        return
    next_target = {**target, **updates, "session_mode": "existing_session"}
    scheduler_store.update_scheduled_graph_job(str(job["job_id"]), {"delivery_target": next_target})
    target.clear()
    target.update(next_target)


def _create_buddy_session(job: dict[str, Any], job_run: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    title = str(target.get("title") or _default_session_title(job, target)).strip()
    if target.get("session_mode") == "new_session_per_run":
        title = f"{title} / {job_run['job_run_id']}"
    return buddy_store.create_chat_session(
        {"title": title, "source": "scheduler"},
        changed_by="scheduler",
        change_reason="定时任务创建消息出口会话。",
    )


def _default_session_title(job: dict[str, Any], target: dict[str, Any]) -> str:
    outlet = str(target.get("outlet") or "buddy").strip()
    name = str(job.get("name") or job.get("job_id") or "定时任务").strip()
    return f"定时任务 / {outlet} / {name}"


def _deliver_external_parts(resolution: dict[str, str], parts: list[str]) -> list[dict[str, Any]]:
    platform_session_id = str(resolution.get("platform_session_id") or "").strip()
    if not platform_session_id:
        return []
    results: list[dict[str, Any]] = []
    for part in parts:
        results.append(message_platform_runtime.send_text_to_platform_session(platform_session_id, part))
    return results


def _resolve_delivery_status(platform_deliveries: list[dict[str, Any]]) -> str:
    if not platform_deliveries:
        return "delivered"
    return "delivered" if all(item.get("status") == "succeeded" for item in platform_deliveries) else "partial"
