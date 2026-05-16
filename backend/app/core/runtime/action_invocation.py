from __future__ import annotations

import inspect
from typing import Any


def callable_accepts_keyword(func: Any, keyword: str) -> bool:
    try:
        parameters = inspect.signature(func).parameters
    except (TypeError, ValueError):
        return True
    return keyword in parameters or any(parameter.kind == inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())


def invoke_action(action_func: Any, action_inputs: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    action_context = dict(context or {})
    invoke_method = getattr(action_func, "invoke", None)
    if callable(invoke_method):
        return invoke_method(action_inputs, context=action_context)

    signature = inspect.signature(action_func)
    parameters = list(signature.parameters.values())
    if len(parameters) >= 2:
        return action_func(action_context, action_inputs)
    return action_func(**action_inputs)
