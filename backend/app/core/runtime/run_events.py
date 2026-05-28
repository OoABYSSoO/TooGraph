from __future__ import annotations

import json
import logging
import queue
import threading
from collections import defaultdict
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from app.core.runtime.state import utc_now_iso


RunEvent = tuple[str, dict[str, Any]]
RunEventListener = Callable[[str, dict[str, Any]], None]

logger = logging.getLogger(__name__)

_SUBSCRIBERS: dict[str, set[queue.Queue[RunEvent]]] = defaultdict(set)
_LISTENERS: dict[str, set[RunEventListener]] = defaultdict(set)
_SUBSCRIBERS_LOCK = threading.Lock()
_SUBSCRIBER_QUEUE_SIZE = 512


def publish_run_event(run_id: str | None, event_type: str, payload: dict[str, Any] | None = None) -> None:
    normalized_run_id = str(run_id or "").strip()
    normalized_event_type = str(event_type or "").strip()
    if not normalized_run_id or not normalized_event_type:
        return

    event_payload = {
        "run_id": normalized_run_id,
        "created_at": utc_now_iso(),
        **dict(payload or {}),
    }
    with _SUBSCRIBERS_LOCK:
        subscribers = list(_SUBSCRIBERS.get(normalized_run_id, set()))
        listeners = list(_LISTENERS.get(normalized_run_id, set()))

    for subscriber in subscribers:
        try:
            subscriber.put_nowait((normalized_event_type, event_payload))
        except queue.Full:
            try:
                subscriber.get_nowait()
            except queue.Empty:
                pass
            try:
                subscriber.put_nowait((normalized_event_type, event_payload))
            except queue.Full:
                continue

    for listener in listeners:
        try:
            listener(normalized_event_type, event_payload)
        except Exception:  # pragma: no cover - defensive listener isolation
            logger.exception("Run event listener failed for run %s event %s.", normalized_run_id, normalized_event_type)


@contextmanager
def listen_run_events(run_id: str, listener: RunEventListener) -> Iterator[None]:
    normalized_run_id = str(run_id or "").strip()
    if not normalized_run_id:
        yield
        return
    with _SUBSCRIBERS_LOCK:
        _LISTENERS[normalized_run_id].add(listener)
    try:
        yield
    finally:
        with _SUBSCRIBERS_LOCK:
            listeners = _LISTENERS.get(normalized_run_id)
            if listeners is not None:
                listeners.discard(listener)
                if not listeners:
                    _LISTENERS.pop(normalized_run_id, None)


def subscribe_run_events(run_id: str) -> Iterator[str]:
    normalized_run_id = str(run_id or "").strip()
    subscriber: queue.Queue[RunEvent] = queue.Queue(maxsize=_SUBSCRIBER_QUEUE_SIZE)
    with _SUBSCRIBERS_LOCK:
        _SUBSCRIBERS[normalized_run_id].add(subscriber)

    try:
        yield _format_sse(
            "run.connected",
            {
                "run_id": normalized_run_id,
                "created_at": utc_now_iso(),
            },
        )
        while True:
            try:
                event_type, payload = subscriber.get(timeout=15)
            except queue.Empty:
                yield ": heartbeat\n\n"
                continue
            yield _format_sse(event_type, payload)
    finally:
        with _SUBSCRIBERS_LOCK:
            subscribers = _SUBSCRIBERS.get(normalized_run_id)
            if subscribers is not None:
                subscribers.discard(subscriber)
                if not subscribers:
                    _SUBSCRIBERS.pop(normalized_run_id, None)


def _format_sse(event_type: str, payload: dict[str, Any]) -> str:
    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
