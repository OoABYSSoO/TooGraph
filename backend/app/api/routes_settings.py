from __future__ import annotations

from fastapi import APIRouter


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
    }

