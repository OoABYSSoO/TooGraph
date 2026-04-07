from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.knowledge.loader import search_knowledge


SkillFunc = Callable[..., dict[str, Any]]


def get_skill_registry() -> dict[str, SkillFunc]:
    return {
        "search_docs": search_docs,
        "analyze_assets": analyze_assets,
        "generate_draft": generate_draft,
        "evaluate_output": evaluate_output,
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

