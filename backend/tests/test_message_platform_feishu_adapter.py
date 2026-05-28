from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.adapters.feishu import FeishuPlatformAdapter, normalize_feishu_message


def test_normalize_feishu_message_event() -> None:
    event = normalize_feishu_message(
        {
            "event": {
                "message": {
                    "message_id": "om_1",
                    "chat_id": "oc_1",
                    "thread_id": "omt_1",
                    "message_type": "text",
                    "content": "{\"text\":\"hello\"}",
                },
                "sender": {
                    "sender_id": {"open_id": "ou_1"},
                    "sender_type": "user",
                    "tenant_key": "tenant_1",
                },
            }
        },
        binding_id="mpb_feishu",
    )

    assert event.platform_id == "feishu"
    assert event.external_message_id == "om_1"
    assert event.chat_id == "oc_1"
    assert event.thread_id == "omt_1"
    assert event.sender_id == "ou_1"
    assert event.text == "hello"


def test_feishu_adapter_connects_channel_and_dispatches_message() -> None:
    received = []
    registered_handlers = {}

    class FakeChannel:
        sent = []

        def __init__(self, *, app_id, app_secret, transport):
            self.app_id = app_id
            self.app_secret = app_secret
            self.transport = transport
            self.client = object()
            self.disconnected = False

        def on(self, name, handler):
            registered_handlers[name] = handler

        async def start_background(self, *, timeout):
            assert timeout == 20.0

        async def send(self, chat_id, text):
            self.sent.append((chat_id, text))
            return SimpleNamespace(success=True, message_id="om_reply_1")

        async def disconnect(self):
            self.disconnected = True

    async def run() -> None:
        adapter = FeishuPlatformAdapter(
            binding_id="mpb_feishu",
            app_id="cli_x",
            app_secret="secret",
            connection_mode="websocket",
        )
        adapter.set_inbound_handler(lambda event: received.append(event))
        original_loop = None
        fake_ws_client = SimpleNamespace(loop=None)
        with patch.dict(
            "sys.modules",
            {
                "lark_oapi.channel": SimpleNamespace(FeishuChannel=FakeChannel),
                "lark_oapi.ws.client": fake_ws_client,
            },
        ):
            original_loop = asyncio.get_running_loop()
            fake_ws_client.loop = original_loop
            assert await adapter.connect() is True
        assert fake_ws_client.loop is not original_loop
        assert fake_ws_client.loop.is_running() is False
        fake_ws_client.loop.close()
        await registered_handlers["message"](
            SimpleNamespace(
                id="om_1",
                conversation=SimpleNamespace(chat_id="oc_1", chat_type="p2p", thread_id=""),
                sender=SimpleNamespace(open_id="ou_1", display_name="Ada"),
                content_text="hello from feishu",
            )
        )
        delivery = await adapter.send_text("oc_1", "reply from buddy")
        assert delivery.status == "succeeded"
        assert delivery.platform_message_id == "om_reply_1"
        assert FakeChannel.sent == [("oc_1", "reply from buddy")]
        await adapter.disconnect()

    import asyncio

    asyncio.run(run())
    assert len(received) == 1
    assert received[0].platform_id == "feishu"
    assert received[0].binding_id == "mpb_feishu"
    assert received[0].chat_id == "oc_1"
    assert received[0].sender_id == "ou_1"
    assert received[0].chat_type == "dm"
    assert received[0].text == "hello from feishu"


def test_feishu_adapter_edits_text_message() -> None:
    class FakeChannel:
        edited = []

        async def edit_message(self, message_id, text):
            self.edited.append((message_id, text))
            return SimpleNamespace(success=True, message_id=message_id)

    async def run() -> None:
        adapter = FeishuPlatformAdapter(
            binding_id="mpb_feishu",
            app_id="cli_x",
            app_secret="secret",
            connection_mode="websocket",
        )
        channel = FakeChannel()
        adapter._channel = channel
        delivery = await adapter.edit_text("oc_1", "om_reply_1", "final text")
        assert delivery.status == "succeeded"
        assert delivery.platform_message_id == "om_reply_1"
        assert channel.edited == [("om_reply_1", "final text")]

    import asyncio

    asyncio.run(run())


def test_feishu_adapter_clears_httpx_incompatible_all_proxy_before_send() -> None:
    class FakeChannel:
        async def send(self, chat_id, text):
            assert chat_id == "oc_1"
            assert text == "reply from buddy"
            assert "ALL_PROXY" not in os.environ
            assert "all_proxy" not in os.environ
            return SimpleNamespace(success=True, message_id="om_reply_1")

    async def run() -> None:
        adapter = FeishuPlatformAdapter(
            binding_id="mpb_feishu",
            app_id="cli_x",
            app_secret="secret",
            connection_mode="websocket",
        )
        adapter._channel = FakeChannel()
        with patch.dict(
            os.environ,
            {
                "ALL_PROXY": "socks://127.0.0.1:7897/",
                "all_proxy": "socks://127.0.0.1:7897/",
                "HTTPS_PROXY": "http://127.0.0.1:7897",
                "https_proxy": "http://127.0.0.1:7897",
            },
            clear=False,
        ):
            delivery = await adapter.send_text("oc_1", "reply from buddy")
        assert delivery.status == "succeeded"

    import asyncio

    asyncio.run(run())
