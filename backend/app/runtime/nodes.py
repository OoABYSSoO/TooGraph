from __future__ import annotations

import time
from typing import Any

from app.knowledge.loader import search_knowledge
from app.memory.store import load_memories, save_memory
from app.runtime.state import RunState, utc_now_iso
from app.schemas.graph import GraphNode, NodeType
from app.skills.registry import get_skill_registry


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
    if node.type == NodeType.INPUT:
        task_input = str(
            node.config.get("task_input")
            or node.config.get("text")
            or f"Run graph '{state.get('graph_name', 'GraphiteUI Graph')}'."
        )
        return {"task_input": task_input}

    if node.type == NodeType.KNOWLEDGE:
        task_input = state.get("task_input", "")
        results = search_knowledge(task_input, limit=3)
        return {
            "retrieved_knowledge": [item["summary"] for item in results]
        }

    if node.type == NodeType.MEMORY:
        memories = load_memories()
        if not memories:
            return {"matched_memories": ["No prior memory matched. Using fresh planning context."]}
        return {
            "matched_memories": [
                str(memory.get("summary") or memory.get("content") or "memory item")[:180]
                for memory in memories[:3]
            ]
        }

    if node.type == NodeType.PLANNER:
        task_input = state.get("task_input", "")
        knowledge = state.get("retrieved_knowledge", [])
        memory = state.get("matched_memories", [])
        plan = (
            f"Plan task based on input: {task_input}. "
            f"Knowledge items: {len(knowledge)}. Memory items: {len(memory)}."
        )
        return {"plan": plan}

    if node.type == NodeType.SKILL_EXECUTOR:
        plan = state.get("plan", "")
        selected_skills = list(node.config.get("selected_skills", ["search_docs"]))
        registry = get_skill_registry()
        skill_outputs = []
        for skill_name in selected_skills:
            skill = registry.get(skill_name)
            if not skill:
                skill_outputs.append({"skill": skill_name, "summary": "Skill is not registered."})
                continue
            if skill_name == "search_docs":
                result = skill(state.get("task_input", ""))
            elif skill_name == "analyze_assets":
                result = skill(state.get("retrieved_knowledge", []))
            elif skill_name == "generate_draft":
                result = skill(
                    state.get("plan", ""),
                    state.get("retrieved_knowledge", []),
                    state.get("matched_memories", []),
                )
            else:
                result = skill(state.get("plan", ""))
            skill_outputs.append({"skill": skill_name, **result})
        return {
            "selected_skills": selected_skills,
            "skill_outputs": skill_outputs,
        }

    if node.type == NodeType.EVALUATOR:
        forced_decision = str(node.config.get("decision", "pass")).lower()
        max_revision_round = int(state.get("max_revision_round", 1))
        revision_round = int(state.get("revision_round", 0))
        if forced_decision not in {"pass", "revise", "fail"}:
            forced_decision = "pass"
        decision = forced_decision
        if decision == "revise" and revision_round >= max_revision_round:
            decision = "fail"
        score = float(node.config.get("score", 8.5 if decision == "pass" else 6.5))
        evaluator_payload = get_skill_registry()["evaluate_output"](state.get("plan", ""))
        return {
            "evaluation_result": {
                "decision": decision,
                "score": score,
                "issues": [] if decision == "pass" else ["Requires another revision."],
                "suggestions": evaluator_payload["suggestions"],
            },
            "revision_round": revision_round + 1 if decision == "revise" else revision_round,
        }

    if node.type == NodeType.FINALIZER:
        evaluation = state.get("evaluation_result", {})
        result = (
            f"Finalized graph '{state.get('graph_name', '')}' "
            f"with decision '{evaluation.get('decision', 'pass')}'."
        )
        save_memory(
            {
                "memory_type": "success_pattern" if evaluation.get("decision") == "pass" else "failure_reason",
                "summary": result,
                "content": {
                    "plan": state.get("plan", ""),
                    "evaluation": evaluation,
                },
            }
        )
        return {
            "status": "completed",
            "final_result": result,
            "completed_at": utc_now_iso(),
            "current_node_id": node.id,
        }

    return {}


def _build_input_summary(state: RunState, node: GraphNode) -> str:
    return (
        f"node={node.id} type={node.type.value} "
        f"task_input={state.get('task_input', '')[:80]}"
    ).strip()


def _build_output_summary(body: dict[str, Any]) -> str:
    for key in ("final_result", "plan", "task_input"):
        value = body.get(key)
        if value:
            return str(value)[:160]
    if body.get("evaluation_result"):
        decision = body["evaluation_result"].get("decision", "unknown")
        return f"evaluation decision={decision}"
    if body.get("skill_outputs"):
        return f"skill outputs={len(body['skill_outputs'])}"
    if body.get("retrieved_knowledge"):
        return f"knowledge items={len(body['retrieved_knowledge'])}"
    return "updated state"


def _build_artifact_payload(body: dict[str, Any]) -> dict[str, Any]:
    artifact_keys = (
        "task_input",
        "retrieved_knowledge",
        "matched_memories",
        "plan",
        "selected_skills",
        "skill_outputs",
        "evaluation_result",
        "final_result",
    )
    return {key: body[key] for key in artifact_keys if key in body}
