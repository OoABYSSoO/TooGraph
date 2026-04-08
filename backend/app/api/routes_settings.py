from __future__ import annotations

from fastapi import APIRouter

from app.skills.registry import get_skill_registry
from app.templates.registry import list_templates
from app.tools.registry import get_tool_registry


router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings_endpoint() -> dict:
    return {
        "model": {
            "text_model": "local-text-model",
            "video_model": "local-video-model",
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
        "templates": [
            {
                "template_id": template["template_id"],
                "label": template["label"],
                "default_theme_preset": template["default_theme_preset"],
            }
            for template in list_templates()
        ],
    }
