from __future__ import annotations

import asyncio
import sys
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.messaging import store
from app.messaging.event_model import MessagingDeliveryResult, MessagingInboundEvent
from app.messaging.runtime import MessagePlatformRuntime


@contextmanager
def _temporary_message_platform_store() -> Iterator[None]:
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir)
        with (
            patch.object(database, "DATA_DIR", data_dir),
            patch.object(database, "DB_PATH", data_dir / "toograph.db"),
        ):
            database.initialize_storage()
            yield


class _RecordingAdapter:
    instances: list["_RecordingAdapter"] = []

    def __init__(self, *, binding_id: str, app_id: str = "", app_secret: str = "", connection_mode: str = "") -> None:
        self.platform_id = "feishu"
        self.binding_id = binding_id
        self.app_id = app_id
        self.app_secret = app_secret
        self.connection_mode = connection_mode
        self.connected = False
        self.last_error = ""
        self.operations: list[dict[str, str]] = []
        self.sent_messages: list[dict[str, str]] = []
        self.edited_messages: list[dict[str, str]] = []
        self._handler = None
        self.__class__.instances.append(self)

    def set_inbound_handler(self, handler):
        self._handler = handler

    async def connect(self) -> bool:
        self.connected = True
        return True

    async def disconnect(self) -> None:
        self.connected = False

    async def send_text(self, chat_id: str, text: str, *, thread_id: str = "") -> MessagingDeliveryResult:
        record = {"chat_id": chat_id, "thread_id": thread_id, "text": text}
        self.sent_messages.append(record)
        self.operations.append({"kind": "send", **record})
        return MessagingDeliveryResult(status="succeeded", platform_message_id=f"om_reply_{len(self.sent_messages)}")

    async def edit_text(
        self,
        chat_id: str,
        platform_message_id: str,
        text: str,
        *,
        thread_id: str = "",
    ) -> MessagingDeliveryResult:
        record = {"chat_id": chat_id, "thread_id": thread_id, "platform_message_id": platform_message_id, "text": text}
        self.edited_messages.append(record)
        self.operations.append({"kind": "edit", **record})
        return MessagingDeliveryResult(status="succeeded", platform_message_id=platform_message_id)

    async def inject(self, event: MessagingInboundEvent) -> None:
        result = self._handler(event)
        if hasattr(result, "__await__"):
            await result


def test_runtime_connects_enabled_feishu_binding_from_saved_secrets() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        with patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter):
            asyncio.run(runtime.connect_binding("mpb_feishu"))

        adapter = _RecordingAdapter.instances[0]
        status = store.list_connection_statuses()[0]
        assert adapter.app_id == "cli_auto"
        assert adapter.app_secret == "auto-secret"
        assert adapter.connection_mode == "websocket"
        assert status["status"] == "connected"
        assert status["last_error_message"] == ""


def test_runtime_marks_enabled_incomplete_binding_not_configured_on_start() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"connection_mode": "websocket"},
                "secret_summary": {},
            }
        )
        runtime = MessagePlatformRuntime()

        runtime.schedule_enabled_bindings()

        status = store.list_connection_statuses()[0]
        assert status["status"] == "not_configured"


def test_runtime_dispatches_inbound_message_and_sends_reply() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        def fake_handle(
            event: MessagingInboundEvent,
            *,
            visible_message_callback=None,
        ) -> dict[str, object]:
            del event
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_1"})
                visible_message_callback({"kind": "output", "message_id": "output_1", "text": "hi from Buddy"})
            return {"final_text": "hi from Buddy", "visible_reply_parts": ["hi from Buddy"]}

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch("app.messaging.runtime.handle_inbound_event", side_effect=fake_handle),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="hello",
                    )
                )
            )

        status = store.list_connection_statuses()[0]
        assert adapter.sent_messages == [{"chat_id": "oc_1", "thread_id": "", "text": "正在思考..."}]
        assert adapter.edited_messages == [
            {"chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_1", "text": "hi from Buddy"}
        ]
        assert status["status"] == "connected"
        assert status["last_event_at"]
        assert status["last_delivery_at"]


def test_runtime_ignores_legacy_final_text_without_visible_stream() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch(
                "app.messaging.runtime.handle_inbound_event",
                return_value={"final_text": "short final", "visible_reply_text": "complete Buddy output"},
            ),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="hello",
                    )
                )
            )

        assert adapter.sent_messages == []
        assert adapter.edited_messages == []


def test_runtime_replaces_one_placeholder_per_visible_buddy_output() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        def fake_handle(
            event: MessagingInboundEvent,
            *,
            visible_message_callback=None,
        ) -> dict[str, object]:
            del event
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_1"})
                visible_message_callback({"kind": "output", "message_id": "output_1", "text": "first"})
                visible_message_callback({"kind": "placeholder", "message_id": "trace_2"})
                visible_message_callback({"kind": "output", "message_id": "output_2", "text": "second"})
            return {
                "final_text": "first\n\nsecond",
                "visible_reply_text": "first\n\nsecond",
                "visible_reply_parts": ["first", "second"],
            }

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch("app.messaging.runtime.handle_inbound_event", side_effect=fake_handle),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="hello",
                    )
                )
            )

        assert adapter.sent_messages == [
            {"chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
            {"chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
        ]
        assert adapter.edited_messages == [
            {"chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_1", "text": "first"},
            {"chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_2", "text": "second"},
        ]


def test_runtime_delivers_visible_outputs_before_inbound_handler_returns() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        def fake_handle(
            event: MessagingInboundEvent,
            *,
            visible_message_callback=None,
        ) -> dict[str, object]:
            del event
            adapter = _RecordingAdapter.instances[0]
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_1"})
                visible_message_callback({"kind": "output", "message_id": "output_1", "text": "first"})
            adapter.operations.append({"kind": "handler_after_first"})
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_2"})
                visible_message_callback({"kind": "output", "message_id": "output_2", "text": "second"})
            adapter.operations.append({"kind": "handler_after_second"})
            return {
                "final_text": "first\n\nsecond",
                "visible_reply_text": "first\n\nsecond",
                "visible_reply_parts": ["first", "second"],
            }

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch("app.messaging.runtime.handle_inbound_event", side_effect=fake_handle),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="hello",
                    )
                )
            )

        assert adapter.operations == [
            {"kind": "send", "chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
            {"kind": "edit", "chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_1", "text": "first"},
            {"kind": "handler_after_first"},
            {"kind": "send", "chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
            {"kind": "edit", "chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_2", "text": "second"},
            {"kind": "handler_after_second"},
        ]


def test_runtime_sends_next_placeholder_when_buddy_visible_stream_starts_next_message() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        def fake_handle(
            event: MessagingInboundEvent,
            *,
            visible_message_callback=None,
        ) -> dict[str, object]:
            del event
            adapter = _RecordingAdapter.instances[0]
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_1"})
                visible_message_callback({"kind": "output", "message_id": "output_1", "text": "first"})
            adapter.operations.append({"kind": "handler_after_first"})
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_2"})
            adapter.operations.append({"kind": "handler_after_second_started"})
            if visible_message_callback is not None:
                visible_message_callback({"kind": "output", "message_id": "output_2", "text": "second"})
            return {
                "final_text": "first\n\nsecond",
                "visible_reply_text": "first\n\nsecond",
                "visible_reply_parts": ["first", "second"],
            }

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch("app.messaging.runtime.handle_inbound_event", side_effect=fake_handle),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="hello",
                    )
                )
            )

        assert adapter.operations == [
            {"kind": "send", "chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
            {"kind": "edit", "chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_1", "text": "first"},
            {"kind": "handler_after_first"},
            {"kind": "send", "chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
            {"kind": "handler_after_second_started"},
            {"kind": "edit", "chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_2", "text": "second"},
        ]


def test_runtime_does_not_send_final_reply_parts_after_visible_stream_returns() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        def fake_handle(
            event: MessagingInboundEvent,
            *,
            visible_message_callback=None,
        ) -> dict[str, object]:
            del event
            if visible_message_callback is not None:
                visible_message_callback({"kind": "placeholder", "message_id": "trace_1"})
                visible_message_callback({"kind": "output", "message_id": "output_1", "text": "first"})
            return {
                "final_text": "first\n\nsecond",
                "visible_reply_text": "first\n\nsecond",
                "visible_reply_parts": ["first", "second"],
            }

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch("app.messaging.runtime.handle_inbound_event", side_effect=fake_handle),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="hello",
                    )
                )
            )

        assert adapter.operations == [
            {"kind": "send", "chat_id": "oc_1", "thread_id": "", "text": "正在思考..."},
            {"kind": "edit", "chat_id": "oc_1", "thread_id": "", "platform_message_id": "om_reply_1", "text": "first"},
        ]


def test_runtime_sends_slash_command_reply_without_placeholder() -> None:
    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _RecordingAdapter.instances.clear()

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _RecordingAdapter),
            patch(
                "app.messaging.runtime.handle_inbound_event",
                return_value={"command": "model", "reply_text": "可用模型："},
            ),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))
            adapter = _RecordingAdapter.instances[0]
            asyncio.run(
                adapter.inject(
                    MessagingInboundEvent(
                        platform_id="feishu",
                        binding_id="mpb_feishu",
                        external_message_id="om_1",
                        chat_id="oc_1",
                        sender_id="ou_1",
                        text="/model",
                    )
                )
            )

        assert adapter.sent_messages == [{"chat_id": "oc_1", "thread_id": "", "text": "可用模型："}]
        assert adapter.edited_messages == []


def test_runtime_replies_through_adapter_that_emits_event_before_registration() -> None:
    class _EarlyEventAdapter(_RecordingAdapter):
        async def connect(self) -> bool:
            self.connected = True
            await self.inject(
                MessagingInboundEvent(
                    platform_id="feishu",
                    binding_id=self.binding_id,
                    external_message_id="om_connect_new",
                    chat_id="oc_1",
                    sender_id="ou_1",
                    text="/new",
                )
            )
            return True

    with _temporary_message_platform_store():
        store.upsert_platform_binding(
            {
                "binding_id": "mpb_feishu",
                "platform_id": "feishu",
                "display_name": "Feishu/Lark",
                "enabled": True,
                "config": {"app_id": "cli_auto", "connection_mode": "websocket"},
                "secret_summary": {"app_secret": "****cret"},
            }
        )
        store.upsert_platform_secrets("mpb_feishu", {"app_secret": "auto-secret"})
        runtime = MessagePlatformRuntime()
        _EarlyEventAdapter.instances.clear()

        with (
            patch("app.messaging.runtime.FeishuPlatformAdapter", _EarlyEventAdapter),
            patch(
                "app.messaging.runtime.handle_inbound_event",
                return_value={"command": "new", "reply_text": "已创建并切换到 Buddy 会话：session_new"},
            ),
        ):
            asyncio.run(runtime.connect_binding("mpb_feishu"))

        adapter = _EarlyEventAdapter.instances[0]
        assert adapter.sent_messages == [
            {"chat_id": "oc_1", "thread_id": "", "text": "已创建并切换到 Buddy 会话：session_new"}
        ]
