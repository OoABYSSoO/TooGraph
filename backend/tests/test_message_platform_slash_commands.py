from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.event_model import MessagingInboundEvent
from app.messaging.slash_commands import handle_slash_command, parse_slash_command


def test_parse_slash_commands() -> None:
    assert parse_slash_command("/model") == ("model", "")
    assert parse_slash_command("/provider openai/gpt-4.1") == ("provider", "openai/gpt-4.1")
    assert parse_slash_command("/new project thread") == ("new", "project thread")
    assert parse_slash_command("/model openai/gpt-4.1") == ("model", "openai/gpt-4.1")
    assert parse_slash_command("hello") == ("", "")


def test_model_command_sets_session_override() -> None:
    event = MessagingInboundEvent(
        platform_id="telegram",
        binding_id="mpb_telegram",
        chat_id="chat-1",
        sender_id="user-1",
        text="/model openai/gpt-4.1",
    )
    platform_session = {"platform_session_id": "mps_1", "buddy_session_id": "session-1", "buddy_model_ref": ""}

    with (
        patch(
            "app.messaging.slash_commands.build_model_catalog",
            return_value={
                "default_text_model_ref": "local/llama",
                "providers": [
                    {
                        "configured": True,
                        "enabled": True,
                        "requires_login": False,
                        "models": [{"model_ref": "openai/gpt-4.1"}],
                    },
                ],
            },
        ),
        patch(
            "app.messaging.slash_commands.store.set_platform_session_model_ref",
            return_value={**platform_session, "buddy_model_ref": "openai/gpt-4.1"},
        ) as update,
    ):
        result = handle_slash_command(event, platform_session)

    update.assert_called_once_with("mps_1", "openai/gpt-4.1", updated_by="user-1")
    assert result.handled is True
    assert "openai/gpt-4.1" in result.reply_text


def test_model_command_lists_available_models_with_switch_hint() -> None:
    event = MessagingInboundEvent(
        platform_id="telegram",
        binding_id="mpb_telegram",
        chat_id="chat-1",
        sender_id="user-1",
        text="/model",
    )
    platform_session = {"platform_session_id": "mps_1", "buddy_session_id": "session-1", "buddy_model_ref": ""}

    with patch(
        "app.messaging.slash_commands.build_model_catalog",
        return_value={
            "default_text_model_ref": "local/llama",
            "providers": [
                {
                    "configured": True,
                    "enabled": True,
                    "requires_login": False,
                    "models": [{"model_ref": "openai/gpt-4.1"}, {"model_ref": "local/llama"}],
                },
            ],
        },
    ):
        result = handle_slash_command(event, platform_session)

    assert result.handled is True
    assert "当前模型：global (local/llama)" in result.reply_text
    assert "可用模型：" in result.reply_text
    assert "1. local/llama" in result.reply_text
    assert "2. openai/gpt-4.1" in result.reply_text
    assert "切换模型：" in result.reply_text
    assert "/model local/llama" in result.reply_text
    assert "/model global" in result.reply_text


def test_model_command_rejects_unknown_model_with_available_list_and_hint() -> None:
    event = MessagingInboundEvent(
        platform_id="telegram",
        binding_id="mpb_telegram",
        chat_id="chat-1",
        sender_id="user-1",
        text="/model missing/model",
    )
    platform_session = {"platform_session_id": "mps_1", "buddy_session_id": "session-1", "buddy_model_ref": ""}

    with patch(
        "app.messaging.slash_commands.build_model_catalog",
        return_value={
            "default_text_model_ref": "local/llama",
            "providers": [
                {
                    "configured": True,
                    "enabled": True,
                    "requires_login": False,
                    "models": [{"model_ref": "local/llama"}],
                },
            ],
        },
    ):
        result = handle_slash_command(event, platform_session)

    assert result.handled is True
    assert "模型不可用：missing/model" in result.reply_text
    assert "可用模型：" in result.reply_text
    assert "1. local/llama" in result.reply_text
    assert "切换模型：" in result.reply_text
    assert "/model local/llama" in result.reply_text


def test_session_command_reports_binding() -> None:
    event = MessagingInboundEvent(
        platform_id="telegram",
        binding_id="mpb_telegram",
        chat_id="chat-1",
        sender_id="user-1",
        text="/session",
    )
    result = handle_slash_command(
        event,
        {
            "platform_session_id": "mps_1",
            "buddy_session_id": "session-1",
            "external_conversation_key": "telegram:dm:chat-1",
            "buddy_model_ref": "",
            "last_run_id": "run_1",
            "status": "active",
        },
    )
    assert result.handled is True
    assert "session-1" in result.reply_text
    assert result.include_in_context is False


def test_new_command_rebinds_current_platform_session() -> None:
    event = MessagingInboundEvent(
        platform_id="telegram",
        binding_id="mpb_telegram",
        chat_id="chat-1",
        sender_id="user-1",
        text="/new",
    )
    platform_session = {"platform_session_id": "mps_1", "buddy_session_id": "old-session", "title": "Telegram / Abyss"}

    with (
        patch("app.messaging.slash_commands.buddy_store.create_chat_session", return_value={"session_id": "new-session"}),
        patch(
            "app.messaging.slash_commands.store.rebind_platform_session",
            return_value={**platform_session, "buddy_session_id": "new-session"},
        ) as rebind,
    ):
        result = handle_slash_command(event, platform_session)

    rebind.assert_called_once()
    assert result.handled is True
    assert "new-session" in result.reply_text


def test_resume_command_lists_available_sessions_with_switch_hint() -> None:
    event = MessagingInboundEvent(
        platform_id="feishu",
        binding_id="mpb_feishu",
        chat_id="oc_1",
        sender_id="ou_1",
        text="/resume",
    )
    platform_session = {"platform_session_id": "mps_1", "buddy_session_id": "current-session"}

    with patch(
        "app.messaging.slash_commands.buddy_store.list_chat_sessions",
        return_value=[
            {
                "session_id": "session_1",
                "title": "图图",
                "source": "buddy",
                "deleted": False,
                "archived": False,
                "updated_at": "2026-05-28T10:00:00+08:00",
            },
            {
                "session_id": "session_tool",
                "title": "Tool Session",
                "source": "tool",
                "deleted": False,
                "archived": False,
                "updated_at": "2026-05-28T09:00:00+08:00",
            },
        ],
    ):
        result = handle_slash_command(event, platform_session)

    assert result.handled is True
    assert "可恢复的 Buddy 会话：" in result.reply_text
    assert "1. session_1 图图" in result.reply_text
    assert "session_tool" not in result.reply_text
    assert "切换会话：" in result.reply_text
    assert "/resume session_1" in result.reply_text


def test_resume_command_rebinds_current_platform_session() -> None:
    event = MessagingInboundEvent(
        platform_id="feishu",
        binding_id="mpb_feishu",
        chat_id="oc_1",
        sender_id="ou_1",
        text="/resume session_1",
    )
    platform_session = {"platform_session_id": "mps_1", "buddy_session_id": "old-session"}

    with (
        patch(
            "app.messaging.slash_commands.buddy_store.get_chat_session",
            return_value={"session_id": "session_1", "title": "图图", "source": "buddy", "deleted": False},
        ),
        patch(
            "app.messaging.slash_commands.store.rebind_platform_session",
            return_value={**platform_session, "buddy_session_id": "session_1"},
        ) as rebind,
    ):
        result = handle_slash_command(event, platform_session)

    rebind.assert_called_once_with("mps_1", "session_1", updated_by="ou_1")
    assert result.handled is True
    assert "已切换到 Buddy 会话：session_1" in result.reply_text
    assert "标题：图图" in result.reply_text
