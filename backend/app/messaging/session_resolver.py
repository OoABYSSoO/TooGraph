from __future__ import annotations

from app.buddy import store as buddy_store
from app.messaging import store
from app.messaging.event_model import MessagingInboundEvent


def build_platform_session_title(event: MessagingInboundEvent) -> str:
    platform = "Feishu/Lark" if event.platform_id == "feishu" else event.platform_id.title()
    subject = event.sender_name or event.sender_id or event.chat_id
    if event.thread_id:
        return f"{platform} / {subject} / {event.thread_id}"
    return f"{platform} / {subject}"


def _create_buddy_session_for_event(event: MessagingInboundEvent, *, title: str | None = None) -> dict:
    session_title = title or build_platform_session_title(event)
    return buddy_store.create_chat_session(
        {"title": session_title, "source": event.platform_id},
        changed_by="message_platform",
        change_reason="外部消息平台创建 Buddy 会话。",
    )


def _existing_platform_session_is_active(existing: dict) -> bool:
    buddy_session_id = str(existing.get("buddy_session_id") or "").strip()
    if not buddy_session_id:
        return False
    try:
        buddy_store.get_chat_session(buddy_session_id)
    except KeyError:
        return False
    return True


def _rebind_existing_platform_session(event: MessagingInboundEvent, existing: dict) -> dict:
    session = _create_buddy_session_for_event(event, title=str(existing.get("title") or "").strip() or None)
    return store.rebind_platform_session(
        str(existing["platform_session_id"]),
        str(session["session_id"]),
        updated_by=event.sender_id,
    )


def resolve_buddy_session_for_event(event: MessagingInboundEvent) -> dict:
    external_conversation_key = store.build_external_conversation_key(
        platform_id=event.platform_id,
        chat_id=event.chat_id,
        thread_id=event.thread_id,
        sender_id=event.sender_id,
        chat_type=event.chat_type,
    )
    existing = store.find_platform_session(
        platform_id=event.platform_id,
        binding_id=event.binding_id,
        external_conversation_key=external_conversation_key,
    )
    if existing:
        if not _existing_platform_session_is_active(existing):
            return _rebind_existing_platform_session(event, existing)
        return existing

    title = build_platform_session_title(event)
    session = _create_buddy_session_for_event(event, title=title)
    return store.resolve_or_create_platform_session(
        platform_id=event.platform_id,
        binding_id=event.binding_id,
        external_conversation_key=external_conversation_key,
        external_chat_id=event.chat_id,
        external_thread_id=event.thread_id,
        external_user_id=event.sender_id if event.chat_type == "dm" else "",
        external_chat_type=event.chat_type,
        external_display_name=event.sender_name or event.chat_id,
        title=title,
        buddy_session_id=session["session_id"],
    )
