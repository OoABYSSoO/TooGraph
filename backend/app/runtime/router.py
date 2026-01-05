from __future__ import annotations

from app.runtime.state import RunState


def route_after_evaluator(state: RunState) -> str:
    evaluation = state.get("evaluation_result", {})
    decision = str(evaluation.get("decision", "fail")).lower()
    if decision == "pass":
        return "pass"
    if decision == "revise":
        return "revise"
    return "fail"

