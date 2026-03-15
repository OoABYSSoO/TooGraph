from __future__ import annotations

import inspect
from typing import Any


def callable_accepts_keyword(func: Any, keyword: str) -> bool:
    try:
        parameters = inspect.signature(func).parameters
    except (TypeError, ValueError):
        return True
    return keyword in parameters or any(parameter.kind == inspect.Parameter.VAR_KEYWORD for parameter in parameters.values())


def invoke_skill(skill_func: Any, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    signature = inspect.signature(skill_func)
    parameters = list(signature.parameters.values())
    if len(parameters) >= 2:
        return skill_func({}, skill_inputs)
    return skill_func(**skill_inputs)
