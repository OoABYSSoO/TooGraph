from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class MessagingAttachment(BaseModel):
    artifact_id: str = ""
    local_path: str = ""
    mime_type: str = ""
    file_name: str = ""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MessagingInboundEvent(BaseModel):
    platform_id: str
    binding_id: str
    external_message_id: str = Field(default_factory=lambda: f"msg_{uuid4().hex[:12]}")
    external_update_id: str = ""
    chat_id: str
    thread_id: str = ""
    sender_id: str
    sender_name: str = ""
    chat_type: Literal["dm", "group", "channel", "unknown"] = "unknown"
    text: str = ""
    attachments: list[MessagingAttachment] = Field(default_factory=list)
    raw_event_ref: str = ""
    received_at: str = ""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MessagingDeliveryResult(BaseModel):
    status: Literal["succeeded", "failed", "skipped"]
    platform_message_id: str = ""
    error: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
