from __future__ import annotations

from typing import Any


def read_path(payload: Any, path: str) -> Any:
    current = payload
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def resolve_reference(
    reference: str,
    *,
    inputs: dict[str, Any],
    response: dict[str, Any],
    skills: dict[str, Any],
    context: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if not isinstance(reference, str) or not reference.startswith("$"):
        return reference
    if reference.startswith("$inputs."):
        return read_path(inputs, reference[len("$inputs."):])
    if reference.startswith("$response."):
        return read_path(response, reference[len("$response."):])
    if reference.startswith("$skills."):
        return read_path(skills, reference[len("$skills."):])
    if reference.startswith("$context."):
        return read_path(context, reference[len("$context."):])
    if reference.startswith("$state."):
        return read_path(state_values, reference[len("$state."):])
    if reference.startswith("$graph."):
        return read_path(graph, reference[len("$graph."):])
    return reference


def resolve_condition_source(
    source: str,
    *,
    inputs: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if source.startswith("$"):
        return resolve_reference(
            source,
            inputs=inputs,
            response={},
            skills={},
            context={},
            graph=graph,
            state_values=state_values,
        )
    if source in inputs:
        return inputs[source]
    if source in state_values:
        return state_values[source]
    return source
