from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.adapters.telegram import TelegramPlatformAdapter, normalize_telegram_message


def test_normalize_telegram_private_message() -> None:
    event = normalize_telegram_message(
        {
            "message_id": 42,
            "chat": {"id": 100, "type": "private"},
            "from": {"id": 200, "first_name": "Abyss"},
            "text": "hello",
        },
        binding_id="mpb_telegram",
    )

    assert event.platform_id == "telegram"
    assert event.external_message_id == "42"
    assert event.chat_id == "100"
    assert event.sender_id == "200"
    assert event.sender_name == "Abyss"
    assert event.chat_type == "dm"
    assert event.text == "hello"


def test_telegram_adapter_edits_text_message() -> None:
    class FakeBot:
        def __init__(self) -> None:
            self.edited = []

        async def edit_message_text(self, *, chat_id, message_id, text):
            self.edited.append({"chat_id": chat_id, "message_id": message_id, "text": text})
            return SimpleNamespace(message_id=message_id)

    async def run() -> None:
        adapter = TelegramPlatformAdapter(binding_id="mpb_telegram", bot_token="token")
        bot = FakeBot()
        adapter._bot = bot
        delivery = await adapter.edit_text("100", "42", "final text")
        assert delivery.status == "succeeded"
        assert delivery.platform_message_id == "42"
        assert bot.edited == [{"chat_id": "100", "message_id": 42, "text": "final text"}]

    asyncio.run(run())
