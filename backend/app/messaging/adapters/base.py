from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Protocol

from app.messaging.event_model import MessagingDeliveryResult, MessagingInboundEvent


InboundHandler = Callable[[MessagingInboundEvent], Awaitable[None] | None]


class PlatformAdapter(Protocol):
    platform_id: str
    binding_id: str

    def set_inbound_handler(self, handler: InboundHandler) -> None: ...
    async def connect(self) -> bool: ...
    async def disconnect(self) -> None: ...
    async def send_text(self, chat_id: str, text: str, *, thread_id: str = "") -> MessagingDeliveryResult: ...
    async def edit_text(
        self,
        chat_id: str,
        platform_message_id: str,
        text: str,
        *,
        thread_id: str = "",
    ) -> MessagingDeliveryResult: ...
