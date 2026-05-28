from __future__ import annotations

import inspect

from app.messaging.adapters.base import InboundHandler
from app.messaging.event_model import MessagingDeliveryResult, MessagingInboundEvent


class FakePlatformAdapter:
    def __init__(self, *, platform_id: str, binding_id: str) -> None:
        self.platform_id = platform_id
        self.binding_id = binding_id
        self.connected = False
        self.sent_messages: list[dict[str, str]] = []
        self._handler: InboundHandler | None = None

    def set_inbound_handler(self, handler: InboundHandler) -> None:
        self._handler = handler

    async def connect(self) -> bool:
        self.connected = True
        return True

    async def disconnect(self) -> None:
        self.connected = False

    async def send_text(self, chat_id: str, text: str, *, thread_id: str = "") -> MessagingDeliveryResult:
        self.sent_messages.append({"chat_id": chat_id, "thread_id": thread_id, "text": text})
        return MessagingDeliveryResult(status="succeeded", platform_message_id=f"fake_{len(self.sent_messages)}")

    async def inject_text(
        self,
        *,
        chat_id: str,
        sender_id: str,
        text: str,
        thread_id: str = "",
        chat_type: str = "dm",
    ) -> None:
        if self._handler is None:
            raise RuntimeError("Fake adapter has no inbound handler.")
        result = self._handler(
            MessagingInboundEvent(
                platform_id=self.platform_id,
                binding_id=self.binding_id,
                chat_id=chat_id,
                thread_id=thread_id,
                sender_id=sender_id,
                text=text,
                chat_type=chat_type,
            )
        )
        if inspect.isawaitable(result):
            await result
