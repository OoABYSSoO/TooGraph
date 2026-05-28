from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from app.messaging import store
from app.messaging.adapters.base import PlatformAdapter
from app.messaging.adapters.feishu import FeishuPlatformAdapter
from app.messaging.adapters.telegram import TelegramPlatformAdapter
from app.messaging.buddy_ingress import handle_inbound_event
from app.messaging.event_model import MessagingDeliveryResult, MessagingInboundEvent
from app.messaging.slash_commands import V1_COMMANDS, parse_slash_command


THINKING_PLACEHOLDER_TEXT = "正在思考..."


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _reply_text_from_ingress_result(result: dict[str, Any]) -> str:
    return str(result.get("reply_text") or result.get("visible_reply_text") or result.get("final_text") or "").strip()


def _is_known_slash_command(text: str) -> bool:
    command_name, _args = parse_slash_command(text)
    return bool(command_name and command_name in V1_COMMANDS)


class MessagePlatformRuntime:
    def __init__(self) -> None:
        self._adapters: dict[str, PlatformAdapter] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def schedule_enabled_bindings(self) -> None:
        for binding in store.list_platform_bindings():
            binding_id = str(binding.get("binding_id") or "")
            if not binding.get("enabled"):
                store.update_connection_status(binding_id, status="disabled")
                continue
            if not binding.get("configured"):
                store.update_connection_status(binding_id, status="not_configured")
                continue
            self.schedule_connect_binding(binding_id)

    def schedule_connect_binding(self, binding_id: str) -> None:
        normalized_binding_id = str(binding_id or "").strip()
        if not normalized_binding_id:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        previous = self._tasks.get(normalized_binding_id)
        if previous is not None and not previous.done():
            previous.cancel()
        self._tasks[normalized_binding_id] = loop.create_task(self.connect_binding(normalized_binding_id))

    async def connect_binding(self, binding_id: str) -> None:
        normalized_binding_id = str(binding_id or "").strip()
        binding = store.get_platform_binding(normalized_binding_id)
        if not binding:
            return
        await self.disconnect_binding(normalized_binding_id)
        if not binding.get("enabled"):
            store.update_connection_status(
                normalized_binding_id,
                status="disabled",
                last_disconnected_at=_now(),
                last_error_code="",
                last_error_message="",
            )
            return
        if not binding.get("configured"):
            store.update_connection_status(
                normalized_binding_id,
                status="not_configured",
                last_error_code="",
                last_error_message="",
            )
            return

        store.update_connection_status(
            normalized_binding_id,
            status="connecting",
            last_error_code="",
            last_error_message="",
        )
        adapter = self._build_adapter(binding)
        adapter.set_inbound_handler(lambda event, bound_adapter=adapter: self._dispatch(event, adapter_override=bound_adapter))
        connected = await adapter.connect()
        if connected:
            self._adapters[normalized_binding_id] = adapter
            store.update_connection_status(
                normalized_binding_id,
                status="connected",
                last_connected_at=_now(),
                last_error_code="",
                last_error_message="",
            )
            store.append_audit_event(
                binding_id=normalized_binding_id,
                platform_id=str(binding.get("platform_id") or ""),
                event_type="connection.connected",
                severity="info",
                message="Message platform connection is active.",
            )
            return

        store.update_connection_status(
            normalized_binding_id,
            status="error",
            last_error_code="connect_failed",
            last_error_message=str(getattr(adapter, "last_error", "") or "Message platform connection failed."),
            retry_count=1,
        )
        store.append_audit_event(
            binding_id=normalized_binding_id,
            platform_id=str(binding.get("platform_id") or ""),
            event_type="connection.failed",
            severity="error",
            message=str(getattr(adapter, "last_error", "") or "Message platform connection failed."),
        )

    async def disconnect_binding(self, binding_id: str) -> None:
        adapter = self._adapters.pop(str(binding_id or "").strip(), None)
        if adapter is not None:
            await adapter.disconnect()

    async def stop(self) -> None:
        for task in self._tasks.values():
            if not task.done():
                task.cancel()
        self._tasks.clear()
        adapters = list(self._adapters.values())
        self._adapters.clear()
        for adapter in adapters:
            await adapter.disconnect()

    def _build_adapter(self, binding: dict[str, Any]) -> PlatformAdapter:
        binding_id = str(binding.get("binding_id") or "")
        config = binding.get("config") if isinstance(binding.get("config"), dict) else {}
        secrets = store.get_platform_secrets(binding_id)
        platform_id = str(binding.get("platform_id") or "")
        if platform_id == "feishu":
            return FeishuPlatformAdapter(
                binding_id=binding_id,
                app_id=str(config.get("app_id") or ""),
                app_secret=str(secrets.get("app_secret") or ""),
                connection_mode=str(config.get("connection_mode") or "websocket"),
            )
        if platform_id == "telegram":
            return TelegramPlatformAdapter(
                binding_id=binding_id,
                bot_token=str(secrets.get("bot_token") or ""),
            )
        raise ValueError(f"Unsupported message platform: {platform_id}")

    async def _dispatch(
        self,
        event: MessagingInboundEvent,
        *,
        adapter_override: PlatformAdapter | None = None,
    ) -> None:
        if event.external_message_id and not store.mark_dedup_seen(
            platform_id=event.platform_id,
            binding_id=event.binding_id,
            external_message_id=event.external_message_id,
        ):
            return
        store.update_connection_status(event.binding_id, status="connected", last_event_at=_now())
        adapter = self._adapters.get(event.binding_id) or adapter_override
        is_command = _is_known_slash_command(event.text)
        placeholder_message_id = ""
        delivered_visible_message_ids: set[str] = set()
        loop = asyncio.get_running_loop()

        async def deliver_visible_message(message: dict[str, Any]) -> None:
            nonlocal placeholder_message_id
            if adapter is None:
                return
            message_id = str(message.get("message_id") or "").strip()
            if message_id and message_id in delivered_visible_message_ids:
                return
            kind = str(message.get("kind") or "").strip()
            if kind == "placeholder":
                if placeholder_message_id:
                    return
                placeholder = await self._send_platform_text(adapter, event, THINKING_PLACEHOLDER_TEXT)
                if placeholder.status == "succeeded" and placeholder.platform_message_id:
                    placeholder_message_id = placeholder.platform_message_id
                    if message_id:
                        delivered_visible_message_ids.add(message_id)
                return
            if kind != "output":
                return
            text = str(message.get("text") or "").strip()
            if not text:
                return
            placeholder_message_id = await self._deliver_buddy_visible_output(
                adapter,
                event,
                text,
                placeholder_message_id=placeholder_message_id,
            )
            if message_id:
                delivered_visible_message_ids.add(message_id)

        def visible_message_callback(message: dict[str, Any]) -> None:
            future = asyncio.run_coroutine_threadsafe(deliver_visible_message(message), loop)
            future.result()

        try:
            result = await asyncio.to_thread(
                handle_inbound_event,
                event,
                visible_message_callback=visible_message_callback if adapter is not None and not is_command else None,
            )
        except Exception as exc:
            if adapter is not None and placeholder_message_id:
                await self._edit_platform_text(adapter, event, placeholder_message_id, f"处理失败：{exc}")
            store.update_connection_status(
                event.binding_id,
                status="error",
                last_error_code="inbound_failed",
                last_error_message=str(exc),
            )
            store.append_audit_event(
                binding_id=event.binding_id,
                platform_id=event.platform_id,
                event_type="inbound.failed",
                severity="error",
                message=str(exc),
            )
            return

        if adapter is None:
            return
        if is_command:
            reply_text = _reply_text_from_ingress_result(result)
            if reply_text:
                await self._send_platform_text(adapter, event, reply_text)
            return
        if placeholder_message_id:
            await self._edit_platform_text(adapter, event, placeholder_message_id, "处理完成，但没有产生可展示回复。")

    async def _deliver_buddy_visible_output(
        self,
        adapter: PlatformAdapter,
        event: MessagingInboundEvent,
        part: str,
        *,
        placeholder_message_id: str = "",
    ) -> str:
        next_placeholder_id = placeholder_message_id
        if not next_placeholder_id:
            placeholder = await self._send_platform_text(adapter, event, THINKING_PLACEHOLDER_TEXT)
            if placeholder.status != "succeeded" or not placeholder.platform_message_id:
                await self._send_platform_text(adapter, event, part)
                return ""
            next_placeholder_id = placeholder.platform_message_id
        edit_result = await self._edit_platform_text(adapter, event, next_placeholder_id, part)
        if edit_result.status != "succeeded":
            await self._send_platform_text(adapter, event, part)
        return ""

    async def _send_platform_text(
        self,
        adapter: PlatformAdapter,
        event: MessagingInboundEvent,
        text: str,
    ) -> MessagingDeliveryResult:
        delivery = await adapter.send_text(event.chat_id, text, thread_id=event.thread_id)
        if delivery.status == "succeeded":
            store.update_connection_status(event.binding_id, status="connected", last_delivery_at=_now())
        elif delivery.status == "failed":
            self._append_delivery_failure(event, delivery.error)
        return delivery

    async def _edit_platform_text(
        self,
        adapter: PlatformAdapter,
        event: MessagingInboundEvent,
        platform_message_id: str,
        text: str,
    ) -> MessagingDeliveryResult:
        delivery = await adapter.edit_text(event.chat_id, platform_message_id, text, thread_id=event.thread_id)
        if delivery.status == "succeeded":
            store.update_connection_status(event.binding_id, status="connected", last_delivery_at=_now())
        elif delivery.status == "failed":
            self._append_delivery_failure(event, delivery.error)
        return delivery

    def _append_delivery_failure(self, event: MessagingInboundEvent, message: str) -> None:
        store.append_audit_event(
            binding_id=event.binding_id,
            platform_id=event.platform_id,
            event_type="delivery.failed",
            severity="error",
            message=message,
        )


message_platform_runtime = MessagePlatformRuntime()
