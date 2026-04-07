from __future__ import annotations

import time
from typing import Any

from app.knowledge.loader import search_knowledge
from app.memory.store import load_memories, save_memory
from app.runtime.state import RunState, utc_now_iso
from app.schemas.graph import GraphNode, NodeType
from app.skills.registry import get_skill_registry
from app.skills.slg_creative_factory import (
    slg_analyze_videos,
    slg_build_brief,
    slg_clean_news,
    slg_extract_patterns,
    slg_fetch_ads,
    slg_fetch_rss,
    slg_generate_storyboards,
    slg_generate_variants,
    slg_generate_video_prompts,
    slg_normalize_assets,
    slg_prepare_image_todo,
    slg_prepare_video_todo,
    slg_review_variants,
    slg_select_top_videos,
)


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
    if node.type == NodeType.START:
        theme_config = dict(state.get("theme_config", {}))
        genre = str(theme_config.get("genre", "")).strip()
        market = str(theme_config.get("market", "")).strip()
        platform = str(theme_config.get("platform", "")).strip()
        task_input = (
            f"Generate a {genre or 'strategy'} creative workflow for {market or 'global'} on {platform or 'digital'}."
        )
        return {
            "theme_config": theme_config,
            "task_input": task_input,
        }

    if node.type == NodeType.RESEARCH:
        rss_result = slg_fetch_rss(state, node.params)
        clean_result = slg_clean_news({**state, **rss_result.get("state_updates", {})}, node.params)
        rss_items = rss_result.get("state_updates", {}).get("rss_items", [])
        clean_news_items = clean_result.get("state_updates", {}).get("clean_news_items", [])
        market_inputs = [
            {
                "kind": "rss_item",
                "title": item.get("title", ""),
                "summary": item.get("summary", ""),
                "creative_hint": item.get("creative_hint", ""),
            }
            for item in clean_news_items
        ]
        return {
            **rss_result.get("state_updates", {}),
            **clean_result.get("state_updates", {}),
            "market_inputs": market_inputs,
        }

    if node.type == NodeType.COLLECT_ASSETS:
        asset_result = slg_fetch_ads(state, node.params)
        ad_items = asset_result.get("state_updates", {}).get("ad_items", [])
        market_inputs = [
            *state.get("market_inputs", []),
            *[
                {
                    "kind": "ad_asset",
                    "item_id": item.get("item_id", ""),
                    "creative_theme": item.get("creative_theme", ""),
                    "hook": item.get("hook", ""),
                }
                for item in ad_items
            ],
        ]
        return {
            **asset_result.get("state_updates", {}),
            "market_inputs": market_inputs,
        }

    if node.type == NodeType.NORMALIZE_ASSETS:
        normalized_result = slg_normalize_assets(state, node.params)
        normalized_items = normalized_result.get("state_updates", {}).get("normalized_video_items", [])
        market_inputs = [
            *state.get("market_inputs", []),
            *[
                {
                    "kind": "normalized_asset",
                    "item_id": item.get("item_id", ""),
                    "hook": item.get("hook", ""),
                    "creative_theme": item.get("creative_theme", ""),
                }
                for item in normalized_items
            ],
        ]
        return {
            **normalized_result.get("state_updates", {}),
            "market_inputs": market_inputs,
        }

    if node.type == NodeType.SELECT_ASSETS:
        return slg_select_top_videos(state, node.params).get("state_updates", {})

    if node.type == NodeType.ANALYZE_ASSETS:
        return slg_analyze_videos(state, node.params).get("state_updates", {})

    if node.type == NodeType.EXTRACT_PATTERNS:
        return slg_extract_patterns(state, node.params).get("state_updates", {})

    if node.type == NodeType.BUILD_BRIEF:
        return slg_build_brief(state, node.params).get("state_updates", {})

    if node.type == NodeType.GENERATE_VARIANTS:
        remapped_params = dict(node.params)
        if "variantCount" in remapped_params and "variant_count" not in remapped_params:
            remapped_params["variant_count"] = remapped_params["variantCount"]
        return slg_generate_variants(state, remapped_params).get("state_updates", {})

    if node.type == NodeType.GENERATE_STORYBOARDS:
        return slg_generate_storyboards(state, node.params).get("state_updates", {})

    if node.type == NodeType.GENERATE_VIDEO_PROMPTS:
        return slg_generate_video_prompts(state, node.params).get("state_updates", {})

    if node.type == NodeType.REVIEW_VARIANTS:
        remapped_params = dict(node.params)
        if "scoreThreshold" in remapped_params and "pass_threshold" not in remapped_params:
            remapped_params["pass_threshold"] = remapped_params["scoreThreshold"]
        return slg_review_variants(state, remapped_params).get("state_updates", {})

    if node.type == NodeType.CONDITION:
        return {}

    if node.type == NodeType.PREPARE_IMAGE_TODO:
        return slg_prepare_image_todo(state, node.params).get("state_updates", {})

    if node.type == NodeType.PREPARE_VIDEO_TODO:
        return slg_prepare_video_todo(state, node.params).get("state_updates", {})

    if node.type == NodeType.FINALIZE:
        evaluation = dict(state.get("evaluation_result", {}))
        final_package = {
            "theme_config": state.get("theme_config", {}),
            "creative_brief": state.get("creative_brief", ""),
            "best_variant": state.get("best_variant", {}),
            "storyboard_packages": state.get("storyboard_packages", []),
            "video_prompt_packages": state.get("video_prompt_packages", []),
            "image_generation_todo": state.get("image_generation_todo", {}),
            "video_generation_todo": state.get("video_generation_todo", {}),
            "evaluation_result": evaluation,
        }
        result = (
            f"Finalized creative package for {state.get('graph_name', '')} "
            f"with decision '{evaluation.get('decision', 'pass')}'."
        )
        save_memory(
            {
                "memory_type": "success_pattern" if evaluation.get("decision") == "pass" else "failure_reason",
                "summary": result,
                "content": {
                    "theme_config": state.get("theme_config", {}),
                    "evaluation": evaluation,
                    "best_variant": state.get("best_variant", {}),
                },
            }
        )
        return {
            "status": "completed",
            "final_package": final_package,
            "final_result": result,
            "completed_at": utc_now_iso(),
            "current_node_id": node.id,
        }

    if node.type == NodeType.END:
        return {}

    if node.type == NodeType.INPUT:
        task_input = str(
            node.config.get("task_input")
            or node.config.get("text")
            or f"Run graph '{state.get('graph_name', 'GraphiteUI Graph')}'."
        )
        return {"task_input": task_input}

    if node.type == NodeType.KNOWLEDGE:
        task_input = str(node.config.get("query") or state.get("task_input", ""))
        results = search_knowledge(task_input, limit=3)
        return {
            "retrieved_knowledge": [item["summary"] for item in results]
        }

    if node.type == NodeType.MEMORY:
        memory_type = str(node.config.get("memory_type") or "") or None
        memories = load_memories(memory_type=memory_type)
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
        merged_updates: dict[str, Any] = {}
        for skill_name in selected_skills:
            skill = registry.get(skill_name)
            if not skill:
                skill_outputs.append({"skill": skill_name, "summary": "Skill is not registered."})
                continue
            if skill_name.startswith("slg_"):
                skill_input_state = {**state, **merged_updates}
                result = skill(skill_input_state, node.config)
            elif skill_name == "search_docs":
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
            state_updates = result.get("state_updates", {}) if isinstance(result, dict) else {}
            if isinstance(state_updates, dict):
                merged_updates.update(state_updates)
            skill_outputs.append({"skill": skill_name, **result})
        return {
            "selected_skills": selected_skills,
            "skill_outputs": skill_outputs,
            **merged_updates,
        }

    if node.type == NodeType.EVALUATOR:
        existing_evaluation = state.get("evaluation_result", {})
        forced_decision = str(existing_evaluation.get("decision") or node.config.get("decision", "pass")).lower()
        max_revision_round = int(state.get("max_revision_round", 1))
        revision_round = int(state.get("revision_round", 0))
        if forced_decision not in {"pass", "revise", "fail"}:
            forced_decision = "pass"
        decision = forced_decision
        if decision == "revise" and revision_round >= max_revision_round:
            decision = "fail"
        existing_score = existing_evaluation.get("score")
        score = float(
            existing_score
            if existing_score is not None
            else node.config.get("score", 8.5 if decision == "pass" else 6.5)
        )
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

    if node.type == NodeType.FINALIZER:
        evaluation = state.get("evaluation_result", {})
        best_variant = state.get("best_variant", {})
        best_variant_label = best_variant.get("variant_id") or "n/a"
        result = (
            f"Finalized graph '{state.get('graph_name', '')}' "
            f"with decision '{evaluation.get('decision', 'pass')}' "
            f"and best variant '{best_variant_label}'."
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
