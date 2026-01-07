from __future__ import annotations

from app.schemas.graph import GraphNode
from app.runtime.state import RunState


def route_after_evaluator(state: RunState) -> str:
    evaluation = state.get("evaluation_result", {})
    decision = str(evaluation.get("decision", "fail")).lower()
    if decision == "pass":
        return "pass"
    if decision == "revise":
        return "revise"
    return "fail"


def route_after_condition(state: RunState, node: GraphNode) -> str:
    decision_path = str(node.params.get("decision_key", "evaluation_result.decision"))
    decision = _read_path(state, decision_path)
    normalized = str(decision or "fail").lower()
    if normalized in {"pass", "revise", "fail"}:
        return normalized
    return "fail"


def _read_path(state: RunState, path: str):
    current = state
    for segment in path.split("."):
        if isinstance(current, dict):
            current = current.get(segment)
        else:
            return None
    return current
