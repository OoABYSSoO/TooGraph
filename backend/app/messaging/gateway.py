from __future__ import annotations

import inspect
from collections.abc import Callable

from app.messaging.adapters.base import PlatformAdapter
from app.messaging.event_model import MessagingInboundEvent


class MessagingGateway:
    def __init__(self, *, adapters: list[PlatformAdapter], inbound_handler: Callable[[MessagingInboundEvent], object]) -> None:
        self.adapters = adapters
        self._inbound_handler = inbound_handler

    async def start(self) -> None:
        for adapter in self.adapters:
            adapter.set_inbound_handler(self._dispatch)
            await adapter.connect()

    async def stop(self) -> None:
        for adapter in self.adapters:
            await adapter.disconnect()

    async def _dispatch(self, event: MessagingInboundEvent) -> None:
        result = self._inbound_handler(event)
        if inspect.isawaitable(result):
            await result
