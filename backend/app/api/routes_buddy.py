from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.buddy import commands, store


router = APIRouter(prefix="/api/buddy", tags=["buddy"])


class BuddyUpdatePayload(BaseModel):
    change_reason: str = Field(default="用户在伙伴页面更新。", alias="change_reason")

    model_config = ConfigDict(extra="allow", populate_by_name=True, str_strip_whitespace=True)

    def data(self) -> dict[str, Any]:
        payload = self.model_dump(by_alias=True)
        payload.pop("change_reason", None)
        return payload


class BuddyMemoryPayload(BuddyUpdatePayload):
    type: str = "fact"
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)


class BuddyCommandPayload(BaseModel):
    action: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)
    target_id: str | None = None
    change_reason: str = "User requested a buddy command."

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BuddySessionPayload(BaseModel):
    title: str | None = None
    change_reason: str = "用户创建伙伴历史会话。"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BuddySessionPatchPayload(BaseModel):
    title: str | None = None
    archived: bool | None = None
    change_reason: str = "用户更新伙伴历史会话。"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    def data(self) -> dict[str, Any]:
        payload = self.model_dump()
        payload.pop("change_reason", None)
        return {key: value for key, value in payload.items() if value is not None}


class BuddyChatMessagePayload(BaseModel):
    message_id: str | None = None
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)
    client_order: float | None = None
    include_in_context: bool = True
    run_id: str | None = None
    change_reason: str = "用户追加伙伴历史消息。"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    def data(self) -> dict[str, Any]:
        payload = self.model_dump()
        payload.pop("change_reason", None)
        return payload


@router.get("/profile")
def get_profile_endpoint() -> dict[str, Any]:
    return store.load_profile()


@router.put("/profile")
def update_profile_endpoint(payload: BuddyUpdatePayload) -> dict[str, Any]:
    return store.save_profile(payload.data(), changed_by="user", change_reason=payload.change_reason)


@router.get("/policy")
def get_policy_endpoint() -> dict[str, Any]:
    return store.load_policy()


@router.put("/policy")
def update_policy_endpoint(payload: BuddyUpdatePayload) -> dict[str, Any]:
    return store.save_policy(payload.data(), changed_by="user", change_reason=payload.change_reason)


@router.get("/memories")
def list_memories_endpoint(include_deleted: bool = Query(default=False)) -> list[dict[str, Any]]:
    return store.list_memories(include_deleted=include_deleted)


@router.post("/memories")
def create_memory_endpoint(payload: BuddyMemoryPayload) -> dict[str, Any]:
    return store.create_memory(payload.data(), changed_by="user", change_reason=payload.change_reason)


@router.patch("/memories/{memory_id}")
def update_memory_endpoint(memory_id: str, payload: BuddyUpdatePayload) -> dict[str, Any]:
    try:
        return store.update_memory(memory_id, payload.data(), changed_by="user", change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory not found") from exc


@router.delete("/memories/{memory_id}")
def delete_memory_endpoint(memory_id: str) -> dict[str, Any]:
    try:
        return store.delete_memory(memory_id, changed_by="user", change_reason="用户删除记忆。")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory not found") from exc


@router.get("/session-summary")
def get_session_summary_endpoint() -> dict[str, Any]:
    return store.load_session_summary()


@router.put("/session-summary")
def update_session_summary_endpoint(payload: BuddyUpdatePayload) -> dict[str, Any]:
    return store.save_session_summary(payload.data(), changed_by="user", change_reason=payload.change_reason)


@router.get("/sessions")
def list_chat_sessions_endpoint(include_deleted: bool = Query(default=False)) -> list[dict[str, Any]]:
    return store.list_chat_sessions(include_deleted=include_deleted)


@router.post("/sessions")
def create_chat_session_endpoint(payload: BuddySessionPayload) -> dict[str, Any]:
    return store.create_chat_session(
        {"title": payload.title},
        changed_by="user",
        change_reason=payload.change_reason,
    )


@router.patch("/sessions/{session_id}")
def update_chat_session_endpoint(session_id: str, payload: BuddySessionPatchPayload) -> dict[str, Any]:
    try:
        return store.update_chat_session(session_id, payload.data(), changed_by="user", change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Buddy session not found") from exc


@router.delete("/sessions/{session_id}")
def delete_chat_session_endpoint(session_id: str) -> dict[str, Any]:
    try:
        return store.delete_chat_session(session_id, changed_by="user", change_reason="用户删除伙伴历史会话。")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Buddy session not found") from exc


@router.get("/sessions/{session_id}/messages")
def list_chat_messages_endpoint(
    session_id: str,
    limit: int | None = Query(default=None, ge=1, le=500),
) -> list[dict[str, Any]]:
    try:
        return store.list_chat_messages(session_id, limit=limit)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Buddy session not found") from exc


@router.post("/sessions/{session_id}/messages")
def append_chat_message_endpoint(session_id: str, payload: BuddyChatMessagePayload) -> dict[str, Any]:
    try:
        return store.append_chat_message(session_id, payload.data(), changed_by="user", change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Buddy session not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/revisions")
def list_revisions_endpoint(
    target_type: str | None = Query(default=None),
    target_id: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    return store.list_revisions(target_type=target_type, target_id=target_id)


@router.post("/revisions/{revision_id}/restore")
def restore_revision_endpoint(revision_id: str) -> dict[str, Any]:
    try:
        return store.restore_revision(revision_id, changed_by="user", change_reason="用户恢复历史版本。")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Revision not found") from exc


@router.get("/commands")
def list_commands_endpoint() -> list[dict[str, Any]]:
    return commands.list_commands()


@router.post("/commands")
def execute_command_endpoint(payload: BuddyCommandPayload) -> dict[str, Any]:
    try:
        return commands.execute_command(payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Buddy command target not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
