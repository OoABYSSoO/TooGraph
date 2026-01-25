from __future__ import annotations

from typing import Any

from app.memory.store import save_memory
from app.core.runtime.output_boundary_utils import resolve_display_mode, resolve_format, save_output_value
from app.core.runtime.state import RunState, utc_now_iso
from app.core.schemas.graph import NodeType
from app.tools.registry import get_tool_registry


TOOLS = get_tool_registry()


def handle_start(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    theme_config = dict(state.get("theme_config", {}))
    genre = str(theme_config.get("genre", "")).strip()
    market = str(theme_config.get("market", "")).strip()
    platform = str(theme_config.get("platform", "")).strip()
    task_input = f"Generate a {genre or 'strategy'} creative workflow for {market or 'global'} on {platform or 'digital'}."
    input_values = dict(params.get("input_values", {}))
    return {"theme_config": theme_config, "task_input": task_input, **input_values}


def handle_research(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    rss_updates = TOOLS["fetch_market_news_context"](state, params)
    clean_updates = TOOLS["clean_market_news"]({**state, **rss_updates}, params)
    market_inputs = [
        {
            "kind": "rss_item",
            "title": item.get("title", ""),
            "summary": item.get("summary", ""),
            "creative_hint": item.get("creative_hint", ""),
        }
        for item in clean_updates.get("clean_news_items", [])
    ]
    return {**rss_updates, **clean_updates, "market_inputs": market_inputs}


def handle_collect_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    asset_updates = TOOLS["fetch_benchmark_assets"](state, params)
    ad_items = asset_updates.get("ad_items", [])
    market_inputs = [
        *state.get("market_inputs", []),
        *[
            {"kind": "ad_asset", "item_id": item.get("item_id", ""), "creative_theme": item.get("creative_theme", ""), "hook": item.get("hook", "")}
            for item in ad_items
        ],
    ]
    return {**asset_updates, "market_inputs": market_inputs}


def handle_normalize_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    normalized_updates = TOOLS["normalize_asset_records"](state, params)
    normalized_items = normalized_updates.get("normalized_video_items", [])
    market_inputs = [
        *state.get("market_inputs", []),
        *[
            {"kind": "normalized_asset", "item_id": item.get("item_id", ""), "hook": item.get("hook", ""), "creative_theme": item.get("creative_theme", "")}
            for item in normalized_items
        ],
    ]
    return {**normalized_updates, "market_inputs": market_inputs}


def handle_select_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["select_top_video_assets"](state, params)


def handle_analyze_assets(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["analyze_video_assets"](state, params)


def handle_extract_patterns(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["extract_creative_patterns"](state, params)


def handle_build_brief(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["build_creative_brief"](state, params)


def handle_generate_variants(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    remapped_params = dict(params)
    if "variantCount" in remapped_params and "variant_count" not in remapped_params:
        remapped_params["variant_count"] = remapped_params["variantCount"]
    return TOOLS["generate_creative_variants"](state, remapped_params)


def handle_generate_storyboards(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["generate_storyboard_packages"](state, params)


def handle_generate_video_prompts(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["generate_video_prompt_packages"](state, params)


def handle_review_variants(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    remapped_params = dict(params)
    if "scoreThreshold" in remapped_params and "pass_threshold" not in remapped_params:
        remapped_params["pass_threshold"] = remapped_params["scoreThreshold"]
    return TOOLS["review_creative_variants"](state, remapped_params)


def handle_condition(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    del state, params
    return {}


def handle_prepare_image_todo(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["prepare_image_generation_todo"](state, params)


def handle_prepare_video_todo(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["prepare_video_generation_todo"](state, params)


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
    return {"status": "completed", "final_package": final_package, "final_result": result, "completed_at": utc_now_iso()}


def handle_hello_model(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    return TOOLS["generate_hello_greeting"](state, params)


def handle_end(state: RunState, params: dict[str, Any]) -> dict[str, Any]:
    outputs = params.get("outputs", [])
    output_previews: list[dict[str, Any]] = []
    saved_outputs: list[dict[str, Any]] = []

    for output in outputs:
        state_key = str(output.get("state_key", "")).strip()
        if not state_key:
            continue

        value = state.get(state_key)
        display_mode_raw = str(output.get("display_mode") or "auto")
        persist_enabled = bool(output.get("persist_enabled"))
        persist_format_raw = str(output.get("persist_format") or "txt")
        label = str(output.get("label") or state_key)

        # Auto-detect formats from content
        display_mode = resolve_display_mode(display_mode_raw, value)
        persist_format = resolve_format(persist_format_raw, value)

        output_previews.append(
            {
                "state_key": state_key,
                "label": label,
                "display_mode": display_mode,
                "persist_enabled": persist_enabled,
                "persist_format": persist_format,
                "value": value,
            }
        )

        if persist_enabled and value not in (None, "", [], {}):
            saved_outputs.append(
                save_output_value(
                    run_id=str(state.get("run_id", "")),
                    state_key=state_key,
                    value=value,
                    persist_format=persist_format,
                    file_name_template=str(output.get("file_name_template") or state_key),
                )
            )

    return {
        "output_previews": output_previews,
        "saved_outputs": saved_outputs,
    }


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
    NodeType.HELLO_MODEL: handle_hello_model,
    NodeType.END: handle_end,
}
