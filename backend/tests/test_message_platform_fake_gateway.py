from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.adapters.fake import FakePlatformAdapter
from app.messaging.event_model import MessagingInboundEvent
from app.messaging.gateway import MessagingGateway


def test_fake_gateway_dispatches_inbound_event() -> None:
    received: list[MessagingInboundEvent] = []
    adapter = FakePlatformAdapter(platform_id="telegram", binding_id="mpb_telegram")
    gateway = MessagingGateway(adapters=[adapter], inbound_handler=lambda event: received.append(event))

    asyncio.run(gateway.start())
    asyncio.run(adapter.inject_text(chat_id="chat-1", sender_id="user-1", text="hello"))
    asyncio.run(gateway.stop())

    assert len(received) == 1
    assert received[0].platform_id == "telegram"
    assert received[0].text == "hello"
    assert adapter.sent_messages == []
