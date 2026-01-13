from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.knowledge.loader import search_knowledge
from app.core.schemas.skills import SkillCatalogStatus
from app.core.storage.skill_store import get_skill_status_map
from app.tools.registry import get_tool_registry


SkillFunc = Callable[..., dict[str, Any]]


def get_skill_registry(*, include_disabled: bool = False) -> dict[str, SkillFunc]:
    tools = get_tool_registry()
    registry = {
        "search_docs": search_docs,
        "analyze_assets": analyze_assets,
        "generate_draft": generate_draft,
        "evaluate_output": evaluate_output,
        "fetch_market_news_context": fetch_market_news_context_skill,
        "clean_market_news": clean_market_news_skill,
        "build_creative_brief": build_creative_brief_skill,
        "generate_creative_variants": generate_creative_variants_skill,
        "review_creative_variants": review_creative_variants_skill,
        "generate_storyboard_packages": generate_storyboard_packages_skill,
        "generate_video_prompt_packages": generate_video_prompt_packages_skill,
        "prepare_image_generation_todo": prepare_image_generation_todo_skill,
        "prepare_video_generation_todo": prepare_video_generation_todo_skill,
        "finalize_creative_package": finalize_creative_package_skill,
        "generate_hello_greeting": tools["generate_hello_greeting"],
        "fetch_benchmark_assets": tools["fetch_benchmark_assets"],
        "normalize_asset_records": tools["normalize_asset_records"],
        "select_top_video_assets": tools["select_top_video_assets"],
        "analyze_video_assets": tools["analyze_video_assets"],
        "extract_creative_patterns": tools["extract_creative_patterns"],
    }
    if include_disabled:
        return registry
    status_map = get_skill_status_map()
    return {
        key: value
        for key, value in registry.items()
        if status_map.get(key, SkillCatalogStatus.ACTIVE) == SkillCatalogStatus.ACTIVE
    }


def search_docs(query: str) -> dict[str, Any]:
    results = search_knowledge(query, limit=3)
    return {
        "query": query,
        "results": [
            {"title": item["title"], "summary": item["summary"], "source": item["source"]}
            for item in results
        ],
    }


def analyze_assets(materials: list[str]) -> dict[str, Any]:
    return {
        "materials_count": len(materials),
        "summary": f"Analyzed {len(materials)} materials for structure and reuse potential.",
    }


def generate_draft(plan: str, knowledge: list[str], memories: list[str]) -> dict[str, Any]:
    return {
        "draft": (
            f"Draft generated from plan '{plan[:80]}', "
            f"knowledge={len(knowledge)}, memories={len(memories)}."
        )
    }


def evaluate_output(content: str) -> dict[str, Any]:
    score = 8.2 if content else 5.0
    return {
        "score": score,
        "issues": [] if content else ["Content is empty."],
        "suggestions": ["Tighten the opening hook.", "Clarify the target audience."],
    }


def fetch_market_news_context_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["fetch_market_news_context"](
        {
            "task_input": skill_inputs.get("task_input", ""),
            "theme_config": skill_inputs.get("theme_config") or {},
        },
        None,
    )


def clean_market_news_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["clean_market_news"](
        {
            "rss_items": skill_inputs.get("rss_items") or [],
        },
        None,
    )


def build_creative_brief_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["build_creative_brief"](
        {
            "task_input": skill_inputs.get("task_input", ""),
            "theme_config": skill_inputs.get("theme_config") or {},
            "pattern_summary": skill_inputs.get("pattern_summary", ""),
            "news_context": skill_inputs.get("news_context", ""),
        },
        None,
    )


def generate_creative_variants_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["generate_creative_variants"](
        {
            "task_input": skill_inputs.get("task_input", ""),
            "theme_config": skill_inputs.get("theme_config") or {},
            "creative_brief": skill_inputs.get("creative_brief", ""),
            "revision_feedback": skill_inputs.get("revision_feedback") or [],
            "revision_round": int(skill_inputs.get("revision_round", 0) or 0),
        },
        {
            "variant_count": int(skill_inputs.get("variant_count", 2) or 2),
        },
    )


def review_creative_variants_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["review_creative_variants"](
        {
            "task_input": skill_inputs.get("task_input", ""),
            "theme_config": skill_inputs.get("theme_config") or {},
            "script_variants": skill_inputs.get("script_variants") or [],
            "creative_brief": skill_inputs.get("creative_brief", ""),
            "revision_round": int(skill_inputs.get("revision_round", 0) or 0),
            "max_revision_round": int(skill_inputs.get("max_revision_round", 1) or 1),
        },
        {
            "pass_threshold": float(skill_inputs.get("pass_threshold", 7.8) or 7.8),
        },
    )


def generate_storyboard_packages_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["generate_storyboard_packages"](
        {
            "script_variants": skill_inputs.get("script_variants") or [],
        },
        None,
    )


def generate_video_prompt_packages_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["generate_video_prompt_packages"](
        {
            "script_variants": skill_inputs.get("script_variants") or [],
            "storyboard_packages": skill_inputs.get("storyboard_packages") or [],
        },
        None,
    )


def prepare_image_generation_todo_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["prepare_image_generation_todo"](
        {
            "best_variant": skill_inputs.get("best_variant") or {},
            "storyboard_packages": skill_inputs.get("storyboard_packages") or [],
        },
        None,
    )


def prepare_video_generation_todo_skill(**skill_inputs: Any) -> dict[str, Any]:
    tools = get_tool_registry()
    return tools["prepare_video_generation_todo"](
        {
            "best_variant": skill_inputs.get("best_variant") or {},
            "video_prompt_packages": skill_inputs.get("video_prompt_packages") or [],
        },
        None,
    )


def finalize_creative_package_skill(**skill_inputs: Any) -> dict[str, Any]:
    evaluation_result = skill_inputs.get("evaluation_result") or {}
    final_package = {
        "theme_config": skill_inputs.get("theme_config") or {},
        "creative_brief": skill_inputs.get("creative_brief", ""),
        "best_variant": skill_inputs.get("best_variant") or {},
        "storyboard_packages": skill_inputs.get("storyboard_packages") or [],
        "video_prompt_packages": skill_inputs.get("video_prompt_packages") or [],
        "image_generation_todo": skill_inputs.get("image_generation_todo") or {},
        "video_generation_todo": skill_inputs.get("video_generation_todo") or {},
        "evaluation_result": evaluation_result,
    }
    decision = str(evaluation_result.get("decision") or "pass")
    final_result = f"Finalized creative package with decision '{decision}'."
    return {
        "final_package": final_package,
        "final_result": final_result,
    }
