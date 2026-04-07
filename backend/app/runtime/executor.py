from __future__ import annotations

from app.compiler.graph_parser import parse_graph
from app.compiler.workflow_builder import build_workflow
from app.runtime.state import create_initial_run_state, utc_now_iso
from app.schemas.graph import GraphDocument
from app.storage.run_store import save_run


def execute_graph(graph: GraphDocument) -> dict:
    workflow_config = parse_graph(graph)
    app = build_workflow(workflow_config)
    initial_state = create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    initial_state["status"] = "running"
    initial_state["node_status_map"] = {node.id: "idle" for node in graph.nodes}
    result = app.invoke(initial_state)

    final_status = result.get("status", "completed")
    if final_status != "failed":
        final_status = "completed"
    result["status"] = final_status
    result["completed_at"] = result.get("completed_at") or utc_now_iso()
    result["knowledge_summary"] = " | ".join(result.get("retrieved_knowledge", [])[:3])
    result["memory_summary"] = " | ".join(result.get("matched_memories", [])[:3])
    result["artifacts"] = {
        "knowledge_summary": result.get("retrieved_knowledge", []),
        "memory_summary": result.get("matched_memories", []),
        "plan": result.get("plan", ""),
        "skill_outputs": result.get("skill_outputs", []),
        "evaluation": result.get("evaluation_result", {}),
        "final_result": result.get("final_result", ""),
    }
    evaluation = result.get("evaluation_result", {})
    result["final_score"] = evaluation.get("score")
    result["duration_ms"] = _calculate_duration_ms(
        result.get("started_at"),
        result.get("completed_at"),
    )
    save_run(result)
    return result


def _calculate_duration_ms(started_at: str | None, completed_at: str | None) -> int | None:
    if not started_at or not completed_at:
        return None
    try:
        start = _parse_iso_datetime(started_at)
        end = _parse_iso_datetime(completed_at)
    except ValueError:
        return None
    return max(int((end - start).total_seconds() * 1000), 0)


def _parse_iso_datetime(value: str):
    from datetime import datetime

    return datetime.fromisoformat(value)
