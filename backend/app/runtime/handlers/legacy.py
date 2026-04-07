from __future__ import annotations

from typing import Any

from app.knowledge.loader import search_knowledge
from app.memory.store import load_memories, save_memory
from app.runtime.state import RunState, utc_now_iso
from app.schemas.graph import NodeType
from app.skills.registry import get_skill_registry


def handle_input(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    task_input = str(params.get("task_input") or params.get("text") or f"Run graph '{state.get('graph_name', 'GraphiteUI Graph')}'.")
    return {"task_input": task_input}


def handle_knowledge(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    task_input = str(params.get("query") or state.get("task_input", ""))
    results = search_knowledge(task_input, limit=3)
    return {"retrieved_knowledge": [item["summary"] for item in results]}


def handle_memory(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    memory_type = str(params.get("memory_type") or "") or None
    memories = load_memories(memory_type=memory_type)
    if not memories:
        return {"matched_memories": ["No prior memory matched. Using fresh planning context."]}
    return {
        "matched_memories": [str(memory.get("summary") or memory.get("content") or "memory item")[:180] for memory in memories[:3]]
    }


def handle_planner(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del params
    task_input = state.get("task_input", "")
    knowledge = state.get("retrieved_knowledge", [])
    memory = state.get("matched_memories", [])
    plan = f"Plan task based on input: {task_input}. Knowledge items: {len(knowledge)}. Memory items: {len(memory)}."
    return {"plan": plan}


def handle_skill_executor(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    plan = state.get("plan", "")
    selected_skills = list(params.get("selected_skills", ["search_docs"]))
    registry = get_skill_registry()
    skill_outputs = []
    merged_updates: dict[str, Any] = {}
    for skill_name in selected_skills:
        skill = registry.get(skill_name)
        if not skill:
            skill_outputs.append({"skill": skill_name, "summary": "Skill is not registered."})
            continue
        if skill_name.startswith("slg_"):
            skill_input_state = {**state, **merged_updates}
            result = skill(skill_input_state, params)
        elif skill_name == "search_docs":
            result = skill(state.get("task_input", ""))
        elif skill_name == "analyze_assets":
            result = skill(state.get("retrieved_knowledge", []))
        elif skill_name == "generate_draft":
            result = skill(plan, state.get("retrieved_knowledge", []), state.get("matched_memories", []))
        else:
            result = skill(plan)
        state_updates = result.get("state_updates", {}) if isinstance(result, dict) else {}
        if isinstance(state_updates, dict):
            merged_updates.update(state_updates)
        skill_outputs.append({"skill": skill_name, **result})
    return {"selected_skills": selected_skills, "skill_outputs": skill_outputs, **merged_updates}


def handle_evaluator(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    existing_evaluation = state.get("evaluation_result", {})
    forced_decision = str(existing_evaluation.get("decision") or params.get("decision", "pass")).lower()
    max_revision_round = int(state.get("max_revision_round", 1))
    revision_round = int(state.get("revision_round", 0))
    if forced_decision not in {"pass", "revise", "fail"}:
        forced_decision = "pass"
    decision = "fail" if forced_decision == "revise" and revision_round >= max_revision_round else forced_decision
    existing_score = existing_evaluation.get("score")
    score = float(existing_score if existing_score is not None else params.get("score", 8.5 if decision == "pass" else 6.5))
    evaluator_payload = get_skill_registry()["evaluate_output"](state.get("plan", ""))
    return {
        "evaluation_result": {
            "decision": decision,
            "score": score,
            "issues": existing_evaluation.get("issues", [] if decision == "pass" else ["Requires another revision."]),
            "suggestions": existing_evaluation.get("suggestions", evaluator_payload["suggestions"]),
        },
        "revision_round": revision_round + 1 if decision == "revise" else revision_round,
    }


def handle_finalizer(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del params
    evaluation = state.get("evaluation_result", {})
    best_variant = state.get("best_variant", {})
    best_variant_label = best_variant.get("variant_id") or "n/a"
    result = f"Finalized graph '{state.get('graph_name', '')}' with decision '{evaluation.get('decision', 'pass')}' and best variant '{best_variant_label}'."
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
    }


LEGACY_HANDLER_MAP = {
    NodeType.INPUT: handle_input,
    NodeType.KNOWLEDGE: handle_knowledge,
    NodeType.MEMORY: handle_memory,
    NodeType.PLANNER: handle_planner,
    NodeType.SKILL_EXECUTOR: handle_skill_executor,
    NodeType.EVALUATOR: handle_evaluator,
    NodeType.FINALIZER: handle_finalizer,
}
