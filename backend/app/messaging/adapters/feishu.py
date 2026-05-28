from __future__ import annotations

import asyncio
import importlib
import inspect
import json
import os
from typing import Any

from app.messaging.adapters.base import InboundHandler
from app.messaging.event_model import MessagingDeliveryResult, MessagingInboundEvent


def _parse_text_content(raw: Any) -> str:
    if isinstance(raw, dict):
        return str(raw.get("text") or "")
    if not isinstance(raw, str):
        return ""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return raw
    return str(parsed.get("text") or "") if isinstance(parsed, dict) else raw


def normalize_feishu_message(payload: dict[str, Any], *, binding_id: str) -> MessagingInboundEvent:
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
    message = event.get("message") if isinstance(event.get("message"), dict) else {}
    sender = event.get("sender") if isinstance(event.get("sender"), dict) else {}
    sender_id = sender.get("sender_id") if isinstance(sender.get("sender_id"), dict) else {}
    raw_chat_type = str(message.get("chat_type") or "").strip().lower()
    chat_type = "dm" if raw_chat_type in {"p2p", "private"} else "group" if message.get("chat_id") else "unknown"
    return MessagingInboundEvent(
        platform_id="feishu",
        binding_id=binding_id,
        external_message_id=str(message.get("message_id") or ""),
        chat_id=str(message.get("chat_id") or ""),
        thread_id=str(message.get("thread_id") or message.get("root_id") or ""),
        sender_id=str(sender_id.get("open_id") or sender_id.get("user_id") or ""),
        sender_name=str(sender.get("sender_type") or ""),
        chat_type=chat_type,
        text=_parse_text_content(message.get("content")),
        raw_event_ref="",
    )


def normalize_feishu_channel_message(message: Any, *, binding_id: str) -> MessagingInboundEvent:
    conversation = getattr(message, "conversation", None)
    sender = getattr(message, "sender", None)
    chat_type = str(getattr(conversation, "chat_type", "") or "").strip().lower()
    resolved_chat_type = "dm" if chat_type == "p2p" else "group" if chat_type in {"group", "topic"} else "unknown"
    return MessagingInboundEvent(
        platform_id="feishu",
        binding_id=binding_id,
        external_message_id=str(getattr(message, "message_id", None) or getattr(message, "id", "") or ""),
        chat_id=str(getattr(conversation, "chat_id", "") or ""),
        thread_id=str(getattr(conversation, "thread_id", None) or getattr(message, "reply_to_message_id", None) or ""),
        sender_id=str(
            getattr(sender, "open_id", None)
            or getattr(sender, "user_id", None)
            or getattr(message, "sender_id", "")
            or ""
        ),
        sender_name=str(getattr(sender, "display_name", None) or getattr(message, "sender_name", None) or ""),
        chat_type=resolved_chat_type,
        text=str(getattr(message, "content_text", "") or ""),
        raw_event_ref="",
    )


def _prepare_lark_ws_client_loop() -> None:
    try:
        ws_client = importlib.import_module("lark_oapi.ws.client")
    except Exception:
        return
    ws_loop = getattr(ws_client, "loop", None)
    replace_loop = ws_loop is None
    if ws_loop is not None:
        try:
            replace_loop = ws_loop.is_closed() or ws_loop.is_running()
        except Exception:
            replace_loop = True
    if replace_loop:
        # lark_oapi.ws.client caches a module-level loop at import time; when
        # imported during ASGI startup it can capture Uvicorn's running loop.
        ws_client.loop = asyncio.new_event_loop()


def _clear_httpx_incompatible_all_proxy_env() -> None:
    socks_supported = importlib.util.find_spec("socksio") is not None
    for key in ("ALL_PROXY", "all_proxy"):
        value = str(os.environ.get(key) or "").strip().lower()
        if value.startswith("socks://") or (value.startswith(("socks4://", "socks5://")) and not socks_supported):
            os.environ.pop(key, None)


class FeishuPlatformAdapter:
    def __init__(
        self,
        *,
        binding_id: str,
        app_id: str = "",
        app_secret: str = "",
        connection_mode: str = "websocket",
    ) -> None:
        self.platform_id = "feishu"
        self.binding_id = binding_id
        self.app_id = app_id
        self.app_secret = app_secret
        self.connection_mode = connection_mode or "websocket"
        self.connected = False
        self.last_error = ""
        self._handler: InboundHandler | None = None
        self._client: Any = None
        self._channel: Any = None

    def set_inbound_handler(self, handler: InboundHandler) -> None:
        self._handler = handler

    async def connect(self) -> bool:
        try:
            from lark_oapi.channel import FeishuChannel  # type: ignore
        except Exception as exc:
            self.connected = False
            self.last_error = f"Feishu dependency is unavailable: {exc}"
            return False
        if not self.app_id.strip() or not self.app_secret.strip():
            self.connected = False
            self.last_error = "Feishu app id or app secret is not configured."
            return False
        if self.connection_mode not in {"websocket", "ws"}:
            self.connected = False
            self.last_error = f"Feishu connection mode '{self.connection_mode}' is not wired yet."
            return False
        try:
            _clear_httpx_incompatible_all_proxy_env()
            _prepare_lark_ws_client_loop()
            channel = FeishuChannel(app_id=self.app_id, app_secret=self.app_secret, transport="ws")
            channel.on("message", self._handle_channel_message)
            channel.on("error", self._handle_channel_error)
            await channel.start_background(timeout=20.0)
        except Exception as exc:
            self.connected = False
            self.last_error = str(exc)
            return False
        self._channel = channel
        self._client = getattr(channel, "client", None)
        self.connected = True
        self.last_error = ""
        return True

    async def disconnect(self) -> None:
        if self._channel is not None:
            await self._channel.disconnect()
        self.connected = False
        self._client = None
        self._channel = None

    async def send_text(self, chat_id: str, text: str, *, thread_id: str = "") -> MessagingDeliveryResult:
        del thread_id
        if self._channel is None:
            return MessagingDeliveryResult(status="failed", error="Feishu channel is not connected.")
        try:
            _clear_httpx_incompatible_all_proxy_env()
            send = self._channel.send
            if inspect.iscoroutinefunction(send):
                result = await send(chat_id, text)
            else:
                result = await asyncio.to_thread(send, chat_id, text)
                if inspect.isawaitable(result):
                    result = await result
        except Exception as exc:
            return MessagingDeliveryResult(status="failed", error=str(exc))
        success = bool(getattr(result, "success", False))
        if not success:
            return MessagingDeliveryResult(
                status="failed",
                error=str(getattr(result, "error", "") or "Feishu send failed."),
            )
        return MessagingDeliveryResult(
            status="succeeded",
            platform_message_id=str(getattr(result, "message_id", "") or ""),
        )

    async def edit_text(
        self,
        chat_id: str,
        platform_message_id: str,
        text: str,
        *,
        thread_id: str = "",
    ) -> MessagingDeliveryResult:
        del chat_id, thread_id
        if self._channel is None:
            return MessagingDeliveryResult(status="failed", error="Feishu channel is not connected.")
        try:
            _clear_httpx_incompatible_all_proxy_env()
            edit = self._channel.edit_message
            if inspect.iscoroutinefunction(edit):
                result = await edit(platform_message_id, text)
            else:
                result = await asyncio.to_thread(edit, platform_message_id, text)
                if inspect.isawaitable(result):
                    result = await result
        except Exception as exc:
            return MessagingDeliveryResult(status="failed", error=str(exc))
        success = bool(getattr(result, "success", False))
        if not success:
            return MessagingDeliveryResult(
                status="failed",
                error=str(getattr(result, "error", "") or "Feishu edit failed."),
            )
        return MessagingDeliveryResult(
            status="succeeded",
            platform_message_id=str(getattr(result, "message_id", "") or platform_message_id),
        )

    def _handle_channel_error(self, error: Exception) -> None:
        self.last_error = str(error)

    async def _handle_channel_message(self, message: Any) -> None:
        if self._handler is None:
            return
        result = self._handler(normalize_feishu_channel_message(message, binding_id=self.binding_id))
        if hasattr(result, "__await__"):
            await result
