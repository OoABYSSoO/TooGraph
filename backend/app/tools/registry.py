from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.tools.creative_factory import (
    analyze_video_assets,
    build_creative_brief,
    clean_market_news,
    extract_creative_patterns,
    fetch_benchmark_assets,
    fetch_market_news_context,
    generate_creative_variants,
    generate_storyboard_packages,
    generate_video_prompt_packages,
    normalize_asset_records,
    prepare_image_generation_todo,
    prepare_video_generation_todo,
    review_creative_variants,
    select_top_video_assets,
)
from app.tools.local_llm import append_usage_introduction, generate_hello_greeting, output_usage_introduction


ToolFunc = Callable[[dict[str, Any], dict[str, Any] | None], dict[str, Any]]


def get_tool_registry() -> dict[str, ToolFunc]:
    return {
        "fetch_market_news_context": fetch_market_news_context,
        "clean_market_news": clean_market_news,
        "fetch_benchmark_assets": fetch_benchmark_assets,
        "normalize_asset_records": normalize_asset_records,
        "select_top_video_assets": select_top_video_assets,
        "analyze_video_assets": analyze_video_assets,
        "extract_creative_patterns": extract_creative_patterns,
        "build_creative_brief": build_creative_brief,
        "generate_creative_variants": generate_creative_variants,
        "generate_storyboard_packages": generate_storyboard_packages,
        "generate_video_prompt_packages": generate_video_prompt_packages,
        "review_creative_variants": review_creative_variants,
        "prepare_image_generation_todo": prepare_image_generation_todo,
        "prepare_video_generation_todo": prepare_video_generation_todo,
        "generate_hello_greeting": generate_hello_greeting,
        "append_usage_introduction": append_usage_introduction,
        "output_usage_introduction": output_usage_introduction,
    }
