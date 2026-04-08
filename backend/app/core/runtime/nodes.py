from __future__ import annotations

import time
from typing import Any

from app.core.registry.node_registry import get_node_handler_registry
from app.core.runtime.state import RunState, utc_now_iso
from app.core.schemas.graph import GraphNode


def execute_runtime_node(state: RunState, node: GraphNode) -> RunState:
    started = time.perf_counter()
    current_status_map = dict(state.get("node_status_map", {}))
    current_status_map[node.id] = "running"

    updates: dict[str, Any] = {
        "status": "running",
        "current_node_id": node.id,
        "node_status_map": current_status_map,
    }

    try:
        body = _run_node_logic(state, node)
        duration_ms = int((time.perf_counter() - started) * 1000)
        status_map = dict(current_status_map)
        status_map[node.id] = "success"

        execution_record = {
            "node_id": node.id,
            "node_type": node.type.value,
            "status": "success",
            "started_at": utc_now_iso(),
            "duration_ms": duration_ms,
            "input_summary": _build_input_summary(state, node),
            "output_summary": _build_output_summary(body),
            "artifacts": _build_artifact_payload(body),
            "warnings": [],
            "errors": [],
            "finished_at": utc_now_iso(),
        }

        return {
            **updates,
            **body,
            "node_status_map": status_map,
            "node_executions": [*state.get("node_executions", []), execution_record],
        }
    except Exception as exc:  # pragma: no cover - defensive path
        duration_ms = int((time.perf_counter() - started) * 1000)
        status_map = dict(current_status_map)
        status_map[node.id] = "failed"
        execution_record = {
            "node_id": node.id,
            "node_type": node.type.value,
            "status": "failed",
            "started_at": utc_now_iso(),
            "duration_ms": duration_ms,
            "input_summary": _build_input_summary(state, node),
            "output_summary": "",
            "artifacts": {},
            "warnings": [],
            "errors": [str(exc)],
            "finished_at": utc_now_iso(),
        }
        return {
            **updates,
            "status": "failed",
            "errors": [*state.get("errors", []), str(exc)],
            "node_status_map": status_map,
            "node_executions": [*state.get("node_executions", []), execution_record],
        }


def _run_node_logic(state: RunState, node: GraphNode) -> dict[str, Any]:
    registry = get_node_handler_registry()
    handler = registry.get(node.type)
    if handler is None:
        return {}
    return handler(state, dict(node.params or node.config or {}))


def _build_input_summary(state: RunState, node: GraphNode) -> str:
    return (
        f"node={node.id} type={node.type.value} "
        f"task_input={state.get('task_input', '')[:80]}"
    ).strip()


def _build_output_summary(body: dict[str, Any]) -> str:
    for key in ("final_result", "creative_brief", "pattern_summary", "news_context", "plan", "task_input"):
        value = body.get(key)
        if value:
            return str(value)[:160]
    if body.get("final_package"):
        return "final package assembled"
    if body.get("market_inputs"):
        return f"market inputs={len(body['market_inputs'])}"
    if body.get("evaluation_result"):
        decision = body["evaluation_result"].get("decision", "unknown")
        return f"evaluation decision={decision}"
    if body.get("best_variant"):
        return f"best variant={body['best_variant'].get('variant_id', 'n/a')}"
    if body.get("script_variants"):
        return f"variants={len(body['script_variants'])}"
    if body.get("storyboard_packages"):
        return f"storyboards={len(body['storyboard_packages'])}"
    if body.get("video_prompt_packages"):
        return f"video prompts={len(body['video_prompt_packages'])}"
    if body.get("skill_outputs"):
        return f"skill outputs={len(body['skill_outputs'])}"
    if body.get("retrieved_knowledge"):
        return f"knowledge items={len(body['retrieved_knowledge'])}"
    return "updated state"


def _build_artifact_payload(body: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in body.items()
        if key not in {"status", "current_node_id", "completed_at"}
    }
