from __future__ import annotations

from copy import deepcopy

from app.core.compiler.graph_parser import parse_graph
from app.core.compiler.workflow_builder import build_workflow
from app.core.runtime.node_system_executor import execute_node_system_graph
from app.core.runtime.state import create_initial_run_state, utc_now_iso
from app.core.schemas.graph_family import AnyGraphDocument
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage.run_store import save_run


def prepare_graph_run(graph: AnyGraphDocument) -> dict:
    initial_state = create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    initial_state["theme_config"] = graph.theme_config.model_dump(mode="json")
    initial_state["node_status_map"] = {node.id: "idle" for node in graph.nodes}
    return initial_state


def execute_graph(
    graph: AnyGraphDocument,
    initial_state: dict | None = None,
    *,
    persist_progress: bool = False,
) -> dict:
    if isinstance(graph, NodeSystemGraphDocument):
        return execute_node_system_graph(graph, initial_state=initial_state, persist_progress=persist_progress)
    workflow_config = parse_graph(graph)
    app = build_workflow(workflow_config)
    run_state = deepcopy(initial_state) if initial_state is not None else prepare_graph_run(graph)
    run_state["status"] = "running"
    run_state["started_at"] = utc_now_iso()
    if persist_progress:
        save_run(run_state)
    result = app.invoke(run_state)

    final_status = result.get("status", "completed")
    if final_status != "failed":
        final_status = "completed"
    result["status"] = final_status
    result["current_node_id"] = None if final_status == "completed" else result.get("current_node_id")
    result["completed_at"] = result.get("completed_at") or utc_now_iso()
    result["knowledge_summary"] = " | ".join(result.get("retrieved_knowledge", [])[:3])
    result["memory_summary"] = " | ".join(result.get("matched_memories", [])[:3])
    result["artifacts"] = {
        "theme_config": result.get("theme_config", {}),
        "market_inputs": result.get("market_inputs", []),
        "knowledge_summary": result.get("retrieved_knowledge", []),
        "memory_summary": result.get("matched_memories", []),
        "plan": result.get("plan", ""),
        "skill_outputs": result.get("skill_outputs", []),
        "evaluation": result.get("evaluation_result", {}),
        "final_result": result.get("final_result", ""),
        "final_package": result.get("final_package", {}),
        "rss_items": result.get("rss_items", []),
        "clean_news_items": result.get("clean_news_items", []),
        "ad_items": result.get("ad_items", []),
        "normalized_video_items": result.get("normalized_video_items", []),
        "selected_video_items": result.get("selected_video_items", []),
        "video_analysis_results": result.get("video_analysis_results", []),
        "pattern_summary": result.get("pattern_summary", ""),
        "news_context": result.get("news_context", ""),
        "creative_brief": result.get("creative_brief", ""),
        "script_variants": result.get("script_variants", []),
        "storyboard_packages": result.get("storyboard_packages", []),
        "video_prompt_packages": result.get("video_prompt_packages", []),
        "review_results": result.get("review_results", []),
        "best_variant": result.get("best_variant", {}),
        "image_generation_todo": result.get("image_generation_todo", {}),
        "video_generation_todo": result.get("video_generation_todo", {}),
    }
    evaluation = result.get("evaluation_result", {})
    result["final_score"] = evaluation.get("score")
    result["duration_ms"] = _calculate_duration_ms(
        result.get("started_at"),
        result.get("completed_at"),
    )
    result["state_snapshot"] = {
        key: value
        for key, value in result.items()
        if key
        not in {
            "node_executions",
            "node_status_map",
        }
    }
    save_run(result)
    return result


def execute_graph_safely(
    graph: AnyGraphDocument,
    initial_state: dict | None = None,
    *,
    persist_progress: bool = False,
) -> dict:
    run_state = deepcopy(initial_state) if initial_state is not None else prepare_graph_run(graph)
    try:
        return execute_graph(graph, initial_state=run_state, persist_progress=persist_progress)
    except Exception as exc:  # pragma: no cover - defensive runtime path
        run_state["status"] = "failed"
        run_state["completed_at"] = utc_now_iso()
        run_state["errors"] = [*run_state.get("errors", []), str(exc)]
        run_state["duration_ms"] = _calculate_duration_ms(
            run_state.get("started_at"),
            run_state.get("completed_at"),
        )
        save_run(run_state)
        return run_state


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
