from __future__ import annotations

from typing import Any

from app.memory.store import save_memory
from app.runtime.state import RunState, utc_now_iso
from app.schemas.graph import NodeType
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


def handle_start(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del params
    theme_config = dict(state.get("theme_config", {}))
    genre = str(theme_config.get("genre", "")).strip()
    market = str(theme_config.get("market", "")).strip()
    platform = str(theme_config.get("platform", "")).strip()
    task_input = f"Generate a {genre or 'strategy'} creative workflow for {market or 'global'} on {platform or 'digital'}."
    return {"theme_config": theme_config, "task_input": task_input}


def handle_research(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    rss_result = slg_fetch_rss(state, params)
    clean_result = slg_clean_news({**state, **rss_result.get("state_updates", {})}, params)
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


def handle_collect_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    asset_result = slg_fetch_ads(state, params)
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


def handle_normalize_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    normalized_result = slg_normalize_assets(state, params)
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


def handle_select_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_select_top_videos(state, params).get("state_updates", {})


def handle_analyze_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_analyze_videos(state, params).get("state_updates", {})


def handle_extract_patterns(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_extract_patterns(state, params).get("state_updates", {})


def handle_build_brief(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_build_brief(state, params).get("state_updates", {})


def handle_generate_variants(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    remapped_params = dict(params)
    if "variantCount" in remapped_params and "variant_count" not in remapped_params:
        remapped_params["variant_count"] = remapped_params["variantCount"]
    return slg_generate_variants(state, remapped_params).get("state_updates", {})


def handle_generate_storyboards(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_generate_storyboards(state, params).get("state_updates", {})


def handle_generate_video_prompts(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_generate_video_prompts(state, params).get("state_updates", {})


def handle_review_variants(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    remapped_params = dict(params)
    if "scoreThreshold" in remapped_params and "pass_threshold" not in remapped_params:
        remapped_params["pass_threshold"] = remapped_params["scoreThreshold"]
    return slg_review_variants(state, remapped_params).get("state_updates", {})


def handle_condition(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del state, params
    return {}


def handle_prepare_image_todo(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_prepare_image_todo(state, params).get("state_updates", {})


def handle_prepare_video_todo(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return slg_prepare_video_todo(state, params).get("state_updates", {})


def handle_finalize(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del params
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
    result = f"Finalized creative package for {state.get('graph_name', '')} with decision '{evaluation.get('decision', 'pass')}'."
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
    }


def handle_end(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del state, params
    return {}


STANDARD_HANDLER_MAP = {
    NodeType.START: handle_start,
    NodeType.RESEARCH: handle_research,
    NodeType.COLLECT_ASSETS: handle_collect_assets,
    NodeType.NORMALIZE_ASSETS: handle_normalize_assets,
    NodeType.SELECT_ASSETS: handle_select_assets,
    NodeType.ANALYZE_ASSETS: handle_analyze_assets,
    NodeType.EXTRACT_PATTERNS: handle_extract_patterns,
    NodeType.BUILD_BRIEF: handle_build_brief,
    NodeType.GENERATE_VARIANTS: handle_generate_variants,
    NodeType.GENERATE_STORYBOARDS: handle_generate_storyboards,
    NodeType.GENERATE_VIDEO_PROMPTS: handle_generate_video_prompts,
    NodeType.REVIEW_VARIANTS: handle_review_variants,
    NodeType.CONDITION: handle_condition,
    NodeType.PREPARE_IMAGE_TODO: handle_prepare_image_todo,
    NodeType.PREPARE_VIDEO_TODO: handle_prepare_video_todo,
    NodeType.FINALIZE: handle_finalize,
    NodeType.END: handle_end,
}
