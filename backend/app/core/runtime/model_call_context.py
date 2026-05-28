from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator


_MODEL_CALL_CONTEXT: ContextVar[dict[str, Any]] = ContextVar("toograph_model_call_context", default={})


def get_model_call_context() -> dict[str, Any]:
    return dict(_MODEL_CALL_CONTEXT.get() or {})


@contextmanager
def use_model_call_context(**context: Any) -> Iterator[None]:
    current = get_model_call_context()
    next_context = {**current}
    for key, value in context.items():
        if value is None:
            continue
        if isinstance(value, str):
            next_context[key] = value.strip()
        else:
            next_context[key] = value
    token = _MODEL_CALL_CONTEXT.set(next_context)
    try:
        yield
    finally:
        _MODEL_CALL_CONTEXT.reset(token)
