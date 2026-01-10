from __future__ import annotations

from typing import Any


STATE_SCHEMA: list[dict[str, Any]] = [
    {
        "key": "theme_config",
        "type": "object",
        "title": "Theme Config",
        "description": "Global theme and domain settings.",
    },
    {
        "key": "market_inputs",
        "type": "array",
        "title": "Market Inputs",
        "description": "Collected research signals and asset references.",
    },
    {
        "key": "selected_video_items",
        "type": "array",
        "title": "Selected Assets",
        "description": "Shortlisted benchmark assets for deeper analysis.",
    },
    {
        "key": "video_analysis_results",
        "type": "array",
        "title": "Asset Analyses",
        "description": "Structured findings extracted from selected assets.",
    },
    {
        "key": "pattern_summary",
        "type": "markdown",
        "title": "Pattern Summary",
        "description": "Cross-asset reusable pattern summary.",
    },
    {
        "key": "creative_brief",
        "type": "markdown",
        "title": "Creative Brief",
        "description": "Structured brief for generation.",
    },
    {
        "key": "script_variants",
        "type": "array",
        "title": "Script Variants",
        "description": "Generated creative variants.",
    },
    {
        "key": "storyboard_packages",
        "type": "array",
        "title": "Storyboard Packages",
        "description": "Storyboard image packages derived from selected variants.",
    },
    {
        "key": "video_prompt_packages",
        "type": "array",
        "title": "Video Prompt Packages",
        "description": "Video-generation prompt packages derived from storyboards.",
    },
    {
        "key": "best_variant",
        "type": "object",
        "title": "Best Variant",
        "description": "Best candidate selected during review.",
    },
    {
        "key": "evaluation_result",
        "type": "object",
        "title": "Evaluation Result",
        "description": "Review decision and score payload.",
    },
    {
        "key": "image_generation_todo",
        "type": "object",
        "title": "Image TODO",
        "description": "Prepared image generation work package.",
    },
    {
        "key": "video_generation_todo",
        "type": "object",
        "title": "Video TODO",
        "description": "Prepared video generation work package.",
    },
    {
        "key": "final_package",
        "type": "object",
        "title": "Final Package",
        "description": "Final artifact package exposed at the end of the flow.",
    },
]


def get_creative_factory_state_schema() -> list[dict[str, Any]]:
    return [dict(field) for field in STATE_SCHEMA]


def get_creative_factory_state_keys() -> list[str]:
    return [field["key"] for field in STATE_SCHEMA]
