from __future__ import annotations

from typing import Any

from app.runtime.state import RunState
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


def skill_result(summary: str, **state_updates: Any) -> dict[str, Any]:
    return {"summary": summary, "state_updates": state_updates}


def slg_fetch_rss(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Fetched market news context.", **fetch_market_news_context(state, params))


def slg_clean_news(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Cleaned market news.", **clean_market_news(state, params))


def slg_fetch_ads(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Fetched benchmark assets.", **fetch_benchmark_assets(state, params))


def slg_normalize_assets(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Normalized benchmark assets.", **normalize_asset_records(state, params))


def slg_select_top_videos(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Selected top video assets.", **select_top_video_assets(state, params))


def slg_analyze_videos(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Analyzed video assets.", **analyze_video_assets(state, params))


def slg_extract_patterns(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Extracted creative patterns.", **extract_creative_patterns(state, params))


def slg_build_brief(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Built creative brief.", **build_creative_brief(state, params))


def slg_generate_variants(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Generated creative variants.", **generate_creative_variants(state, params))


def slg_generate_storyboards(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Generated storyboard packages.", **generate_storyboard_packages(state, params))


def slg_generate_video_prompts(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Generated video prompt packages.", **generate_video_prompt_packages(state, params))


def slg_review_variants(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Reviewed creative variants.", **review_creative_variants(state, params))


def slg_prepare_image_todo(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Prepared image generation todo.", **prepare_image_generation_todo(state, params))


def slg_prepare_video_todo(state: RunState, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return skill_result("Prepared video generation todo.", **prepare_video_generation_todo(state, params))
