from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from app.core.runtime.knowledge_retrieval import retrieve_knowledge_base_context
from app.core.schemas.skills import SkillCatalogStatus
from app.core.storage.skill_store import get_skill_status_map, list_managed_skill_keys
from app.skills.builtin.demo_creative import (
    build_final_summary_skill,
    build_storyboard_package_skill,
    build_video_prompt_package_skill,
    dedupe_items_skill,
    extract_json_block_skill,
    normalize_storyboard_shots_skill,
    select_top_items_skill,
)
from app.tools.local_llm import _chat_with_local_model


SkillFunc = Callable[..., dict[str, Any]]


def _build_runtime_skill_registry() -> dict[str, SkillFunc]:
    return {
        "search_knowledge_base": search_knowledge_base_skill,
        "summarize_text": summarize_text_skill,
        "extract_json_fields": extract_json_fields_skill,
        "translate_text": translate_text_skill,
        "rewrite_text": rewrite_text_skill,
        "extract_json_block": extract_json_block_skill,
        "dedupe_items": dedupe_items_skill,
        "select_top_items": select_top_items_skill,
        "normalize_storyboard_shots": normalize_storyboard_shots_skill,
        "build_storyboard_package": build_storyboard_package_skill,
        "build_video_prompt_package": build_video_prompt_package_skill,
        "build_final_summary": build_final_summary_skill,
    }


def list_runtime_skill_keys() -> set[str]:
    return set(_build_runtime_skill_registry().keys())


def get_skill_registry(*, include_disabled: bool = False) -> dict[str, SkillFunc]:
    registry = _build_runtime_skill_registry()
    if include_disabled:
        allowed_keys = list_managed_skill_keys()
        return {key: value for key, value in registry.items() if key in allowed_keys}
    allowed_keys = list_managed_skill_keys()
    status_map = get_skill_status_map()
    return {
        key: value
        for key, value in registry.items()
        if key in allowed_keys and status_map.get(key, SkillCatalogStatus.ACTIVE) == SkillCatalogStatus.ACTIVE
    }


# ---------------------------------------------------------------------------
# search_knowledge_base — local knowledge retrieval
# ---------------------------------------------------------------------------

def search_knowledge_base_skill(**skill_inputs: Any) -> dict[str, Any]:
    try:
        limit = int(skill_inputs.get("limit") or 3)
    except (TypeError, ValueError):
        limit = 3
    return retrieve_knowledge_base_context(
        knowledge_base=str(skill_inputs.get("knowledge_base") or ""),
        query=str(skill_inputs.get("query") or ""),
        limit=limit,
    )


# ---------------------------------------------------------------------------
# summarize_text — LLM-powered text summarization
# ---------------------------------------------------------------------------

def summarize_text_skill(**skill_inputs: Any) -> dict[str, Any]:
    text = str(skill_inputs.get("text") or "").strip()
    max_sentences = str(skill_inputs.get("max_sentences") or "3").strip()

    if not text:
        return {"summary": "", "key_points": []}

    raw = _chat_with_local_model(
        system_prompt="You are a concise summarization assistant. Return valid JSON only.",
        user_prompt=(
            f"Summarize the following text in at most {max_sentences} sentences. "
            f'Return JSON: {{"summary": "...", "key_points": ["...", "..."]}}\n\n{text}'
        ),
    )
    try:
        parsed = json.loads(raw)
        return {
            "summary": str(parsed.get("summary", "")),
            "key_points": list(parsed.get("key_points", [])),
        }
    except json.JSONDecodeError:
        return {"summary": raw.strip(), "key_points": []}


# ---------------------------------------------------------------------------
# extract_json_fields — LLM-powered structured extraction
# ---------------------------------------------------------------------------

def extract_json_fields_skill(**skill_inputs: Any) -> dict[str, Any]:
    text = str(skill_inputs.get("text") or "").strip()
    fields = str(skill_inputs.get("fields") or "").strip()

    if not text or not fields:
        return {"extracted": {}, "confidence": "low"}

    raw = _chat_with_local_model(
        system_prompt="You are a precise data extraction assistant. Return valid JSON only.",
        user_prompt=(
            f"Extract these fields from the text: {fields}\n\n"
            f"Text:\n{text}\n\n"
            f'Return JSON: {{"extracted": {{...}}, "confidence": "high|medium|low"}}'
        ),
    )
    try:
        parsed = json.loads(raw)
        return {
            "extracted": parsed.get("extracted", {}),
            "confidence": str(parsed.get("confidence", "medium")),
        }
    except json.JSONDecodeError:
        return {"extracted": {}, "confidence": "low"}


# ---------------------------------------------------------------------------
# translate_text — LLM-powered translation
# ---------------------------------------------------------------------------

def translate_text_skill(**skill_inputs: Any) -> dict[str, Any]:
    text = str(skill_inputs.get("text") or "").strip()
    target_language = str(skill_inputs.get("target_language") or "en").strip()

    if not text:
        return {"translated": "", "source_language": ""}

    raw = _chat_with_local_model(
        system_prompt="You are a professional translator. Return valid JSON only.",
        user_prompt=(
            f"Translate the following text to {target_language}. Preserve the original tone.\n\n"
            f"Text:\n{text}\n\n"
            f'Return JSON: {{"translated": "...", "source_language": "..."}}'
        ),
    )
    try:
        parsed = json.loads(raw)
        return {
            "translated": str(parsed.get("translated", "")),
            "source_language": str(parsed.get("source_language", "")),
        }
    except json.JSONDecodeError:
        return {"translated": raw.strip(), "source_language": ""}


# ---------------------------------------------------------------------------
# rewrite_text — LLM-powered text rewriting
# ---------------------------------------------------------------------------

def rewrite_text_skill(**skill_inputs: Any) -> dict[str, Any]:
    text = str(skill_inputs.get("text") or "").strip()
    instruction = str(skill_inputs.get("instruction") or "").strip()

    if not text:
        return {"rewritten": ""}

    raw = _chat_with_local_model(
        system_prompt="You are a skilled writing assistant. Return valid JSON only.",
        user_prompt=(
            f"Rewrite the following text according to this instruction: {instruction}\n\n"
            f"Text:\n{text}\n\n"
            f'Return JSON: {{"rewritten": "..."}}'
        ),
    )
    try:
        parsed = json.loads(raw)
        return {"rewritten": str(parsed.get("rewritten", ""))}
    except json.JSONDecodeError:
        return {"rewritten": raw.strip()}
