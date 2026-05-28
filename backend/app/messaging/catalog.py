from __future__ import annotations

from copy import deepcopy
from typing import Any


_SUPPORTED_CAPABILITIES: dict[str, dict[str, bool]] = {
    "telegram": {
        "text": True,
        "images": True,
        "files": True,
        "threads": True,
        "typing": True,
        "streaming": True,
        "cards": False,
    },
    "feishu": {
        "text": True,
        "images": True,
        "files": True,
        "threads": True,
        "typing": True,
        "streaming": True,
        "cards": True,
    },
}

_REFERENCE_PLATFORM_IDS = [
    "telegram",
    "discord",
    "slack",
    "google_chat",
    "whatsapp",
    "signal",
    "sms",
    "email",
    "homeassistant",
    "mattermost",
    "matrix",
    "dingtalk",
    "feishu",
    "wecom",
    "wecom_callback",
    "weixin",
    "bluebubbles",
    "qq",
    "yuanbao",
    "microsoft_teams",
    "line",
    "ntfy",
    "api_server",
    "webhook",
]

_DISPLAY_NAMES = {
    "google_chat": "Google Chat",
    "homeassistant": "Home Assistant",
    "wecom_callback": "WeCom Callback",
    "bluebubbles": "BlueBubbles/iMessage",
    "microsoft_teams": "Microsoft Teams",
    "api_server": "API Server",
    "feishu": "Feishu/Lark",
    "ntfy": "ntfy",
}


def _display_name(platform_id: str) -> str:
    return _DISPLAY_NAMES.get(platform_id, platform_id.replace("_", " ").title())


def _catalog_entry(platform_id: str) -> dict[str, Any]:
    supported = platform_id in _SUPPORTED_CAPABILITIES
    return {
        "platform_id": platform_id,
        "display_name": _display_name(platform_id),
        "support_level": "supported" if supported else "planned",
        "capabilities": deepcopy(
            _SUPPORTED_CAPABILITIES.get(
                platform_id,
                {
                    "text": True,
                    "images": False,
                    "files": False,
                    "threads": False,
                    "typing": False,
                    "streaming": False,
                    "cards": False,
                },
            )
        ),
        "config_schema": f"{platform_id}_v1" if supported else "",
    }


def get_message_platform_catalog() -> list[dict[str, Any]]:
    return [_catalog_entry(platform_id) for platform_id in _REFERENCE_PLATFORM_IDS]


def get_supported_platform_ids() -> list[str]:
    return [
        entry["platform_id"]
        for entry in get_message_platform_catalog()
        if entry["support_level"] == "supported"
    ]
