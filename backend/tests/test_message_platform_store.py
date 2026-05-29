from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database


def _init_temp_storage():
    temp_dir = tempfile.TemporaryDirectory()
    data_dir = Path(temp_dir.name)
    patchers = [
        patch.object(database, "DATA_DIR", data_dir),
        patch.object(database, "DB_PATH", data_dir / "toograph.db"),
    ]
    for item in patchers:
        item.start()
    database.initialize_storage()
    return temp_dir, patchers


def test_binding_status_platform_session_and_audit_roundtrip() -> None:
    temp_dir, patchers = _init_temp_storage()
    try:
        from app.messaging import store

        binding = store.upsert_platform_binding(
            {
                "binding_id": "mpb_telegram",
                "platform_id": "telegram",
                "display_name": "Personal Telegram",
                "enabled": True,
                "config": {"connection_mode": "polling", "allowed_users": ["123"]},
                "secret_summary": {"bot_token": "****1234"},
            }
        )
        assert binding["configured"] is True
        assert binding["config"]["allowed_users"] == ["123"]
        assert "bot_token" not in binding["config"]
        assert binding["secret_summary"]["bot_token"] == "****1234"

        status = store.update_connection_status("mpb_telegram", status="connected", last_error_message="")
        assert status["status"] == "connected"

        platform_session = store.resolve_or_create_platform_session(
            platform_id="telegram",
            binding_id="mpb_telegram",
            external_conversation_key="telegram:group:chat-1:topic:topic-1",
            external_chat_id="chat-1",
            external_thread_id="topic-1",
            external_user_id="user-1",
            external_chat_type="group",
            external_display_name="topic-1",
            title="Telegram / topic-1",
            buddy_session_id="session-1",
        )
        assert platform_session["buddy_session_id"] == "session-1"
        assert platform_session["trace_mode"] == "quiet"
        assert platform_session["routing_mode"] == "one_external_conversation_one_buddy_session"

        duplicate = store.resolve_or_create_platform_session(
            platform_id="telegram",
            binding_id="mpb_telegram",
            external_conversation_key="telegram:group:chat-1:topic:topic-1",
            external_chat_id="chat-1",
            external_thread_id="topic-1",
            external_user_id="user-1",
            external_chat_type="group",
            external_display_name="topic-1",
            title="Ignored",
            buddy_session_id="different-session",
        )
        assert duplicate["platform_session_id"] == platform_session["platform_session_id"]
        assert duplicate["buddy_session_id"] == "session-1"

        updated = store.set_platform_session_model_ref(
            platform_session["platform_session_id"],
            "openai/gpt-4.1",
            updated_by="user-1",
        )
        assert updated["buddy_model_ref"] == "openai/gpt-4.1"
        assert updated["model_updated_by_external_sender_id"] == "user-1"

        rebound = store.rebind_platform_session(
            platform_session["platform_session_id"],
            "session-2",
            updated_by="user-1",
        )
        assert rebound["buddy_session_id"] == "session-2"
        assert rebound["buddy_model_ref"] == ""

        assert store.mark_dedup_seen(
            platform_id="telegram",
            binding_id="mpb_telegram",
            external_message_id="42",
        ) is True
        assert store.mark_dedup_seen(
            platform_id="telegram",
            binding_id="mpb_telegram",
            external_message_id="42",
        ) is False

        event = store.append_audit_event(
            binding_id="mpb_telegram",
            platform_id="telegram",
            platform_session_id=platform_session["platform_session_id"],
            event_type="delivery.succeeded",
            severity="info",
            message="sent reply",
            payload={"message_id": "42"},
        )
        assert event["event_type"] == "delivery.succeeded"
        assert event["payload"]["message_id"] == "42"
        assert store.list_audit_events(binding_id="mpb_telegram")[0]["message"] == "sent reply"
    finally:
        for item in reversed(patchers):
            item.stop()
        temp_dir.cleanup()


def test_build_external_conversation_key_uses_thread_scope() -> None:
    from app.messaging import store

    assert (
        store.build_external_conversation_key(
            platform_id="telegram",
            chat_id="chat-1",
            thread_id="topic-1",
            sender_id="user-1",
            chat_type="group",
        )
        == "telegram:group:chat-1:topic:topic-1"
    )
    assert (
        store.build_external_conversation_key(
            platform_id="feishu",
            chat_id="chat-1",
            thread_id="root-1",
            sender_id="user-1",
            chat_type="group",
        )
        == "feishu:chat:chat-1:thread:root-1"
    )
    assert (
        store.build_external_conversation_key(
            platform_id="telegram",
            chat_id="chat-1",
            thread_id="",
            sender_id="user-1",
            chat_type="dm",
        )
        == "telegram:dm:chat-1"
    )


def test_list_platform_sessions_filters_conversation_targets_by_platform() -> None:
    temp_dir, patchers = _init_temp_storage()
    try:
        from app.messaging import store

        feishu = store.resolve_or_create_platform_session(
            platform_id="feishu",
            binding_id="mpb_feishu",
            external_conversation_key="feishu:chat:oc_1",
            external_chat_id="oc_1",
            external_chat_type="group",
            external_display_name="项目群",
            title="Feishu/Lark / 项目群",
            buddy_session_id="session_feishu_1",
        )
        store.resolve_or_create_platform_session(
            platform_id="telegram",
            binding_id="mpb_telegram",
            external_conversation_key="telegram:dm:42",
            external_chat_id="42",
            external_chat_type="dm",
            external_display_name="Abyss",
            title="Telegram / Abyss",
            buddy_session_id="session_telegram_1",
        )

        all_sessions = store.list_platform_sessions()
        feishu_sessions = store.list_platform_sessions(platform_id="feishu")
    finally:
        for item in reversed(patchers):
            item.stop()
        temp_dir.cleanup()

    assert {session["platform_session_id"] for session in all_sessions} >= {feishu["platform_session_id"]}
    assert [session["platform_id"] for session in feishu_sessions] == ["feishu"]
    assert feishu_sessions[0]["external_chat_id"] == "oc_1"
    assert feishu_sessions[0]["buddy_session_id"] == "session_feishu_1"
