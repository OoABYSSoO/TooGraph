from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, TypedDict
from uuid import uuid4


RunStatus = Literal["queued", "running", "completed", "failed"]
NodeStatus = Literal["idle", "running", "success", "failed"]
Decision = Literal["pass", "revise", "fail"]


class RunState(TypedDict, total=False):
    run_id: str
    graph_id: str
    graph_name: str
    status: RunStatus
    current_node_id: str | None
    revision_round: int
    max_revision_round: int
    task_input: str
    market_inputs: list[dict[str, Any]]
    retrieved_knowledge: list[str]
    matched_memories: list[str]
    plan: str
    selected_skills: list[str]
    skill_outputs: list[dict[str, Any]]
    evaluation_result: dict[str, Any]
    final_result: str
    rss_items: list[dict[str, Any]]
    clean_news_items: list[dict[str, Any]]
    ad_items: list[dict[str, Any]]
    normalized_video_items: list[dict[str, Any]]
    selected_video_items: list[dict[str, Any]]
    video_analysis_results: list[dict[str, Any]]
    news_context: str
    pattern_summary: str
    creative_brief: str
    script_variants: list[dict[str, Any]]
    storyboard_packages: list[dict[str, Any]]
    video_prompt_packages: list[dict[str, Any]]
    review_results: list[dict[str, Any]]
    best_variant: dict[str, Any]
    image_generation_todo: dict[str, Any]
    video_generation_todo: dict[str, Any]
    final_package: dict[str, Any]
    revision_feedback: list[str]
    node_status_map: dict[str, NodeStatus]
    node_executions: list[dict[str, Any]]
    warnings: list[str]
    errors: list[str]
    output_previews: list[dict[str, Any]]
    saved_outputs: list[dict[str, Any]]
    started_at: str
    completed_at: str | None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_initial_run_state(graph_id: str, graph_name: str, max_revision_round: int = 1) -> RunState:
    return RunState(
        run_id=f"run_{uuid4().hex[:12]}",
        graph_id=graph_id,
        graph_name=graph_name,
        status="queued",
        current_node_id=None,
        revision_round=0,
        max_revision_round=max_revision_round,
        task_input="",
        market_inputs=[],
        retrieved_knowledge=[],
        matched_memories=[],
        plan="",
        selected_skills=[],
        skill_outputs=[],
        evaluation_result={},
        final_result="",
        rss_items=[],
        clean_news_items=[],
        ad_items=[],
        normalized_video_items=[],
        selected_video_items=[],
        video_analysis_results=[],
        news_context="",
        pattern_summary="",
        creative_brief="",
        script_variants=[],
        storyboard_packages=[],
        video_prompt_packages=[],
        review_results=[],
        best_variant={},
        image_generation_todo={},
        video_generation_todo={},
        final_package={},
        revision_feedback=[],
        node_status_map={},
        node_executions=[],
        warnings=[],
        errors=[],
        output_previews=[],
        saved_outputs=[],
        started_at=utc_now_iso(),
        completed_at=None,
    )
