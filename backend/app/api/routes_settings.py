from __future__ import annotations

import os

from fastapi import APIRouter

from app.skills.registry import get_skill_registry
from app.skills.definitions import get_skill_definition_registry
from app.templates.registry import list_templates
from app.tools.registry import get_tool_registry


router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings_endpoint() -> dict:
    return {
        "model": {
            "text_model": os.environ.get("LOCAL_TEXT_MODEL")
            or os.environ.get("TEXT_MODEL")
            or os.environ.get("LOCAL_MODEL_NAME")
            or os.environ.get("UPSTREAM_MODEL_NAME")
            or "qwen-local",
            "video_model": os.environ.get("LOCAL_VIDEO_MODEL")
            or os.environ.get("VIDEO_MODEL")
            or os.environ.get("LOCAL_MODEL_NAME")
            or os.environ.get("UPSTREAM_MODEL_NAME")
            or "qwen-local",
        },
        "revision": {
            "max_revision_round": 1,
        },
        "evaluator": {
            "default_score_threshold": 7.8,
            "routes": ["pass", "revise", "fail"],
        },
        "tools": sorted(get_tool_registry().keys()),
        "skills": sorted(get_skill_registry().keys()),
        "skill_definitions": sorted(get_skill_definition_registry().keys()),
        "templates": [
            {
                "template_id": template["template_id"],
                "label": template["label"],
                "default_theme_preset": template["default_theme_preset"],
            }
            for template in list_templates()
        ],
    }
