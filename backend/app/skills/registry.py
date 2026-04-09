from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.knowledge.loader import search_knowledge
from app.tools.registry import get_tool_registry


SkillFunc = Callable[..., dict[str, Any]]


def get_skill_registry() -> dict[str, SkillFunc]:
    tools = get_tool_registry()
    return {
        "search_docs": search_docs,
        "analyze_assets": analyze_assets,
        "generate_draft": generate_draft,
        "evaluate_output": evaluate_output,
        "generate_hello_greeting": tools["generate_hello_greeting"],
        "fetch_market_news_context": tools["fetch_market_news_context"],
        "clean_market_news": tools["clean_market_news"],
        "fetch_benchmark_assets": tools["fetch_benchmark_assets"],
        "normalize_asset_records": tools["normalize_asset_records"],
        "select_top_video_assets": tools["select_top_video_assets"],
        "analyze_video_assets": tools["analyze_video_assets"],
        "extract_creative_patterns": tools["extract_creative_patterns"],
        "build_creative_brief": tools["build_creative_brief"],
        "generate_creative_variants": tools["generate_creative_variants"],
        "generate_storyboard_packages": tools["generate_storyboard_packages"],
        "generate_video_prompt_packages": tools["generate_video_prompt_packages"],
        "review_creative_variants": tools["review_creative_variants"],
        "prepare_image_generation_todo": tools["prepare_image_generation_todo"],
        "prepare_video_generation_todo": tools["prepare_video_generation_todo"],
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
