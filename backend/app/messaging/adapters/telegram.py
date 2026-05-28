from __future__ import annotations

from typing import Any

from app.messaging.adapters.base import InboundHandler
from app.messaging.event_model import MessagingDeliveryResult, MessagingInboundEvent


def normalize_telegram_message(message: dict[str, Any], *, binding_id: str) -> MessagingInboundEvent:
    chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
    sender = message.get("from") if isinstance(message.get("from"), dict) else {}
    telegram_chat_type = str(chat.get("type") or "").strip()
    chat_type = "unknown"
    if telegram_chat_type == "private":
        chat_type = "dm"
    elif telegram_chat_type in {"group", "supergroup"}:
        chat_type = "group"
    sender_name = " ".join(
        part
        for part in [
            str(sender.get("first_name") or "").strip(),
            str(sender.get("last_name") or "").strip(),
        ]
        if part
    )
    return MessagingInboundEvent(
        platform_id="telegram",
        binding_id=binding_id,
        external_message_id=str(message.get("message_id") or ""),
        chat_id=str(chat.get("id") or ""),
        thread_id=str(message.get("message_thread_id") or ""),
        sender_id=str(sender.get("id") or ""),
        sender_name=sender_name or str(sender.get("username") or ""),
        chat_type=chat_type,
        text=str(message.get("text") or message.get("caption") or ""),
        raw_event_ref="",
    )


class TelegramPlatformAdapter:
    def __init__(self, *, binding_id: str, bot_token: str = "") -> None:
        self.platform_id = "telegram"
        self.binding_id = binding_id
        self.bot_token = bot_token
        self.connected = False
        self.last_error = ""
        self._handler: InboundHandler | None = None
        self._bot: Any = None

    def set_inbound_handler(self, handler: InboundHandler) -> None:
        self._handler = handler

    async def connect(self) -> bool:
        try:
            from telegram import Bot  # type: ignore
        except Exception as exc:
            self.connected = False
            self.last_error = f"Telegram dependency is unavailable: {exc}"
            return False
        if not self.bot_token.strip():
            self.connected = False
            self.last_error = "Telegram bot token is not configured."
            return False
        self._bot = Bot(token=self.bot_token)
        self.connected = True
        self.last_error = ""
        return True

    async def disconnect(self) -> None:
        self.connected = False
        self._bot = None

    async def send_text(self, chat_id: str, text: str, *, thread_id: str = "") -> MessagingDeliveryResult:
        if self._bot is None:
            return MessagingDeliveryResult(status="failed", error="Telegram bot is not connected.")
        try:
            message = await self._bot.send_message(
                chat_id=chat_id,
                text=text,
                message_thread_id=int(thread_id) if str(thread_id).strip().isdigit() else None,
            )
        except Exception as exc:
            return MessagingDeliveryResult(status="failed", error=str(exc))
        return MessagingDeliveryResult(status="succeeded", platform_message_id=str(getattr(message, "message_id", "")))

    async def edit_text(
        self,
        chat_id: str,
        platform_message_id: str,
        text: str,
        *,
        thread_id: str = "",
    ) -> MessagingDeliveryResult:
        del thread_id
        if self._bot is None:
            return MessagingDeliveryResult(status="failed", error="Telegram bot is not connected.")
        try:
            message_id: int | str = platform_message_id
            if str(platform_message_id).strip().isdigit():
                message_id = int(platform_message_id)
            message = await self._bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
            )
        except Exception as exc:
            return MessagingDeliveryResult(status="failed", error=str(exc))
        return MessagingDeliveryResult(
            status="succeeded",
            platform_message_id=str(getattr(message, "message_id", platform_message_id)),
        )
