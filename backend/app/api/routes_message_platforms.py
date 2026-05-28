from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.messaging import store
from app.messaging.buddy_ingress import handle_inbound_event
from app.messaging.catalog import get_message_platform_catalog
from app.messaging.event_model import MessagingInboundEvent
from app.messaging.feishu_auto_bind import get_feishu_auto_binding_job, start_feishu_auto_binding
from app.messaging.runtime import message_platform_runtime


router = APIRouter(prefix="/api/message-platforms", tags=["message-platforms"])


class BindingPayload(BaseModel):
    platform_id: str = Field(min_length=1)
    display_name: str = ""
    enabled: bool = False
    config: dict[str, Any] = Field(default_factory=dict)
    secrets: dict[str, str] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FakeInboundPayload(BaseModel):
    platform_id: str
    binding_id: str
    chat_id: str
    thread_id: str = ""
    sender_id: str
    sender_name: str = ""
    chat_type: Literal["dm", "group", "channel", "unknown"] = "dm"
    text: str

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FeishuAutoBindingPayload(BaseModel):
    display_name: str = "Feishu/Lark"
    enabled: bool = True
    connection_mode: str = "websocket"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _secret_summary(secrets: dict[str, str]) -> dict[str, str]:
    summary: dict[str, str] = {}
    for key, value in secrets.items():
        normalized = str(value or "").strip()
        if normalized:
            summary[key] = f"****{normalized[-4:]}"
    return summary


def _merged_binding_config(binding_id: str, payload: BindingPayload) -> dict[str, Any]:
    existing = store.get_platform_binding(binding_id)
    existing_config = (
        existing.get("config")
        if existing and existing.get("platform_id") == payload.platform_id and isinstance(existing.get("config"), dict)
        else {}
    )
    cleaned_patch = {
        str(key): value
        for key, value in (payload.config or {}).items()
        if not (isinstance(value, str) and not value.strip())
    }
    return {**existing_config, **cleaned_patch}


def _merged_secret_summary(binding_id: str, payload: BindingPayload) -> dict[str, str]:
    existing = store.get_platform_binding(binding_id)
    existing_summary = (
        existing.get("secret_summary")
        if existing and existing.get("platform_id") == payload.platform_id and isinstance(existing.get("secret_summary"), dict)
        else {}
    )
    return {**existing_summary, **_secret_summary(payload.secrets)}


def _status_after_binding_update(binding: dict[str, Any]) -> dict[str, Any]:
    if not binding["enabled"]:
        return store.update_connection_status(
            binding["binding_id"],
            status="disabled",
            last_error_code="",
            last_error_message="",
        )
    if not binding["configured"]:
        return store.update_connection_status(
            binding["binding_id"],
            status="not_configured",
            last_error_code="",
            last_error_message="",
        )
    status = store.update_connection_status(
        binding["binding_id"],
        status="connecting",
        last_error_code="",
        last_error_message="",
    )
    message_platform_runtime.schedule_connect_binding(binding["binding_id"])
    return status


@router.get("/catalog")
def get_catalog_endpoint() -> dict[str, Any]:
    return {"platforms": get_message_platform_catalog()}


@router.get("/bindings")
def list_bindings_endpoint() -> dict[str, Any]:
    return {
        "bindings": store.list_platform_bindings(),
        "statuses": store.list_connection_statuses(),
    }


@router.put("/bindings/{binding_id}")
async def upsert_binding_endpoint(binding_id: str, payload: BindingPayload) -> dict[str, Any]:
    try:
        next_config = _merged_binding_config(binding_id, payload)
        next_secret_summary = _merged_secret_summary(binding_id, payload)
        binding = store.upsert_platform_binding(
            {
                "binding_id": binding_id,
                "platform_id": payload.platform_id,
                "display_name": payload.display_name,
                "enabled": payload.enabled,
                "config": next_config,
                "secret_summary": next_secret_summary,
            }
        )
        if payload.secrets:
            store.upsert_platform_secrets(binding_id, payload.secrets)
        status = _status_after_binding_update(binding)
        store.append_audit_event(
            binding_id=binding_id,
            platform_id=payload.platform_id,
            event_type="binding.updated",
            severity="info",
            message="Message platform binding updated.",
            payload={"enabled": payload.enabled, "configured": binding["configured"]},
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"binding": binding, "status": status}


@router.get("/bindings/{binding_id}/events")
def list_binding_events_endpoint(binding_id: str) -> dict[str, Any]:
    return {"events": store.list_audit_events(binding_id=binding_id)}


@router.post("/feishu/auto-binding/start")
async def start_feishu_auto_binding_endpoint(payload: FeishuAutoBindingPayload) -> dict[str, Any]:
    job = start_feishu_auto_binding(
        display_name=payload.display_name,
        enabled=payload.enabled,
        connection_mode=payload.connection_mode,
    )
    if job.get("status") == "completed":
        message_platform_runtime.schedule_connect_binding(str(job.get("binding_id") or ""))
    return {"job": job}


@router.get("/feishu/auto-binding/{job_id}")
async def get_feishu_auto_binding_endpoint(job_id: str) -> dict[str, Any]:
    try:
        job = get_feishu_auto_binding_job(job_id)
        if job.get("status") == "completed":
            message_platform_runtime.schedule_connect_binding(str(job.get("binding_id") or ""))
        return {"job": job}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Feishu auto binding job not found.") from exc


@router.post("/fake/inbound")
def fake_inbound_endpoint(payload: FakeInboundPayload) -> dict[str, Any]:
    return handle_inbound_event(MessagingInboundEvent(**payload.model_dump()))
