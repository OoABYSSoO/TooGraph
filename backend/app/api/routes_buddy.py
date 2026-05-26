from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.buddy import background_review, commands, improvement_candidates, store


router = APIRouter(prefix="/api/buddy", tags=["buddy"])


class BuddyUpdatePayload(BaseModel):
    change_reason: str = Field(default="用户在伙伴页面更新。", alias="change_reason")

    model_config = ConfigDict(extra="allow", populate_by_name=True, str_strip_whitespace=True)

    def data(self) -> dict[str, Any]:
        payload = self.model_dump(by_alias=True)
        payload.pop("change_reason", None)
        return payload


class BuddyCommandPayload(BaseModel):
    action: str = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)
    target_id: str | None = None
    run_id: str | None = None
    change_reason: str = "User requested a buddy command."

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BuddySessionPayload(BaseModel):
    title: str | None = None
    parent_session_id: str | None = None
    source: str | None = None
    ended_at: str | None = None
    end_reason: str | None = None
    change_reason: str = "用户创建伙伴历史会话。"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    def data(self) -> dict[str, Any]:
        payload = self.model_dump()
        payload.pop("change_reason", None)
        return {key: value for key, value in payload.items() if value is not None}


class BuddySessionPatchPayload(BaseModel):
    title: str | None = None
    archived: bool | None = None
    parent_session_id: str | None = None
    source: str | None = None
    ended_at: str | None = None
    end_reason: str | None = None
    change_reason: str = "用户更新伙伴历史会话。"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    def data(self) -> dict[str, Any]:
        payload = self.model_dump()
        payload.pop("change_reason", None)
        return {key: value for key, value in payload.items() if value is not None}


class BuddyChatMessagePayload(BaseModel):
    message_id: str | None = None
    role: Literal["user", "assistant"]
    content: str = ""
    client_order: float | None = None
    include_in_context: bool = True
    run_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    change_reason: str = "用户追加伙伴历史消息。"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @model_validator(mode="after")
    def validate_message_content(self) -> "BuddyChatMessagePayload":
        if self.content.strip() or self.metadata.get("kind") == "output_trace":
            return self
        raise ValueError("Message content cannot be empty.")

    def data(self) -> dict[str, Any]:
        payload = self.model_dump()
        payload.pop("change_reason", None)
        return payload


class BuddyMemoryDocumentPayload(BuddyUpdatePayload):
    content: str = Field(min_length=1)


class BuddyBackgroundReviewPayload(BaseModel):
    source_run_id: str = Field(min_length=1)
    buddy_model_ref: str = ""
    trigger_reason: str = "visible_buddy_run_completed"

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BuddyImprovementCandidateValidationRunPayload(BaseModel):
    validation_run_id: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BuddyImprovementCandidateDecisionPayload(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str = ""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class BuddyImprovementCandidateApplyPayload(BaseModel):
    change_reason: str = ""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


@router.get("/identity")
def get_identity_endpoint() -> dict[str, Any]:
    return store.load_buddy_identity()


@router.put("/identity")
def update_identity_endpoint(payload: BuddyUpdatePayload) -> dict[str, Any]:
    return store.save_buddy_identity(payload.data(), changed_by="user", change_reason=payload.change_reason)


@router.get("/memory-document")
def get_memory_document_endpoint() -> dict[str, Any]:
    return store.load_memory_document()


@router.get("/user-context")
def get_user_context_endpoint() -> dict[str, Any]:
    return store.load_user_context_document()


@router.get("/home-files")
def list_home_files_endpoint() -> dict[str, Any]:
    return store.list_home_files()


@router.put("/memory-document")
def update_memory_document_endpoint(payload: BuddyMemoryDocumentPayload) -> dict[str, Any]:
    try:
        return store.save_memory_document(payload.data(), changed_by="user", change_reason=payload.change_reason)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/user-context")
def update_user_context_endpoint(payload: BuddyMemoryDocumentPayload) -> dict[str, Any]:
    try:
        return store.save_user_context_document(payload.data(), changed_by="user", change_reason=payload.change_reason)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/session-summary")
def get_session_summary_endpoint() -> dict[str, Any]:
    return store.load_session_summary()


@router.put("/session-summary")
def update_session_summary_endpoint(payload: BuddyUpdatePayload) -> dict[str, Any]:
    return store.save_session_summary(payload.data(), changed_by="user", change_reason=payload.change_reason)


@router.get("/run-template-binding")
def get_run_template_binding_endpoint() -> dict[str, Any]:
    return store.load_run_template_binding()


@router.get("/memory-review-template-binding")
def get_memory_review_template_binding_endpoint() -> dict[str, Any]:
    return store.load_memory_review_template_binding()


@router.get("/background-reviews")
def list_background_reviews_endpoint(source_run_id: str | None = Query(default=None)) -> list[dict[str, Any]]:
    return background_review.list_background_review_runs(source_run_id=source_run_id)


@router.get("/improvement-candidates")
def list_improvement_candidates_endpoint(
    source_run_id: str | None = Query(default=None),
    review_id: str | None = Query(default=None),
    review_run_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    return store.list_improvement_candidates(
        source_run_id=source_run_id,
        review_id=review_id,
        review_run_id=review_run_id,
        status=status,
    )


@router.post("/improvement-candidates/{candidate_id}/validation-run")
def link_improvement_candidate_validation_run_endpoint(
    candidate_id: str,
    payload: BuddyImprovementCandidateValidationRunPayload,
) -> dict[str, Any]:
    try:
        return improvement_candidates.link_validation_run(candidate_id, payload.validation_run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Improvement candidate not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/improvement-candidates/{candidate_id}/sync-validation-status")
def sync_improvement_candidate_validation_status_endpoint(candidate_id: str) -> dict[str, Any]:
    try:
        return improvement_candidates.sync_validation_status(candidate_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Improvement candidate not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/improvement-candidates/{candidate_id}/decision")
def decide_improvement_candidate_endpoint(
    candidate_id: str,
    payload: BuddyImprovementCandidateDecisionPayload,
) -> dict[str, Any]:
    try:
        return improvement_candidates.decide_candidate(
            candidate_id,
            decision=payload.decision,
            reason=payload.reason,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Improvement candidate not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/improvement-candidates/{candidate_id}/apply")
def apply_improvement_candidate_endpoint(
    candidate_id: str,
    payload: BuddyImprovementCandidateApplyPayload,
) -> dict[str, Any]:
    try:
        return improvement_candidates.apply_candidate(candidate_id, change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Improvement candidate not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/background-reviews")
def enqueue_background_review_endpoint(
    payload: BuddyBackgroundReviewPayload,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    try:
        record = background_review.enqueue_background_review_run(
            source_run_id=payload.source_run_id,
            buddy_model_ref=payload.buddy_model_ref,
            trigger_reason=payload.trigger_reason,
        )
        graph, run_state = background_review.load_background_review_runtime(record["review_id"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if "completed source run" in detail else 422
        raise HTTPException(status_code=status_code, detail=detail) from exc
    background_tasks.add_task(background_review.run_background_review_worker, graph, run_state, record["review_id"])
    return record


@router.get("/sessions")
def list_chat_sessions_endpoint(include_deleted: bool = Query(default=False)) -> list[dict[str, Any]]:
    return store.list_chat_sessions(include_deleted=include_deleted)


@router.post("/sessions")
def create_chat_session_endpoint(payload: BuddySessionPayload) -> dict[str, Any]:
    return store.create_chat_session(
        payload.data(),
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
