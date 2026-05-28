from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.event_model import MessagingInboundEvent
from app.messaging.session_resolver import resolve_buddy_session_for_event


def test_resolver_creates_buddy_session_for_external_thread() -> None:
    created: list[dict] = []

    def fake_create(payload: dict, *, changed_by: str, change_reason: str) -> dict:
        del changed_by, change_reason
        created.append(payload)
        return {"session_id": "session-telegram-1", "source": payload["source"], "title": payload["title"]}

    with (
        patch("app.messaging.session_resolver.store.find_platform_session", return_value=None),
        patch("app.messaging.session_resolver.buddy_store.create_chat_session", side_effect=fake_create),
        patch(
            "app.messaging.session_resolver.store.resolve_or_create_platform_session",
            return_value={"platform_session_id": "mps_1", "buddy_session_id": "session-telegram-1"},
        ),
    ):
        result = resolve_buddy_session_for_event(
            MessagingInboundEvent(
                platform_id="telegram",
                binding_id="mpb_telegram",
                chat_id="chat-1",
                thread_id="topic-1",
                sender_id="user-1",
                sender_name="Abyss",
                chat_type="group",
                text="hello",
            )
        )

    assert result["buddy_session_id"] == "session-telegram-1"
    assert created[0]["source"] == "telegram"
    assert "Telegram" in created[0]["title"]


def test_resolver_rebinds_when_existing_buddy_session_is_deleted() -> None:
    event = MessagingInboundEvent(
        platform_id="feishu",
        binding_id="mpb_feishu",
        chat_id="oc_1",
        sender_id="ou_1",
        sender_name="Ada",
        chat_type="dm",
        text="hello",
    )
    existing = {
        "platform_session_id": "mps_1",
        "platform_id": "feishu",
        "binding_id": "mpb_feishu",
        "external_conversation_key": "feishu:dm:oc_1",
        "buddy_session_id": "session_deleted",
        "title": "Feishu/Lark / Ada",
    }
    rebound = {**existing, "buddy_session_id": "session_new"}

    with (
        patch("app.messaging.session_resolver.store.find_platform_session", return_value=existing),
        patch("app.messaging.session_resolver.buddy_store.get_chat_session", side_effect=KeyError("session_deleted")),
        patch("app.messaging.session_resolver.buddy_store.create_chat_session", return_value={"session_id": "session_new"}),
        patch("app.messaging.session_resolver.store.rebind_platform_session", return_value=rebound) as rebind,
    ):
        result = resolve_buddy_session_for_event(event)

    assert result["buddy_session_id"] == "session_new"
    rebind.assert_called_once_with("mps_1", "session_new", updated_by="ou_1")
