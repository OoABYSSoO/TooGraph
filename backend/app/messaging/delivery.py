from __future__ import annotations

from app.messaging.event_model import MessagingDeliveryResult


def render_platform_reply_text(final_text: str, projection: dict, *, platform_id: str) -> str:
    if platform_id == "telegram" and projection.get("mode") == "quiet":
        summary = str(projection.get("summary_line") or "")
        return f"{final_text}\n\n{summary}" if summary else final_text
    if platform_id == "feishu" and projection.get("mode") in {"summary", "debug"}:
        details = "\n".join(f"- {item}" for item in projection.get("details") or [])
        return f"{final_text}\n\n{projection.get('summary_line', '')}\n{details}".strip()
    return final_text


def delivery_result_from_exception(exc: Exception) -> MessagingDeliveryResult:
    return MessagingDeliveryResult(status="failed", error=str(exc))
