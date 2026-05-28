from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.messaging.catalog import get_message_platform_catalog, get_supported_platform_ids


def test_catalog_marks_telegram_and_feishu_supported() -> None:
    catalog = get_message_platform_catalog()
    by_id = {entry["platform_id"]: entry for entry in catalog}

    assert by_id["telegram"]["support_level"] == "supported"
    assert by_id["telegram"]["capabilities"]["threads"] is True
    assert by_id["telegram"]["capabilities"]["cards"] is False
    assert by_id["feishu"]["support_level"] == "supported"
    assert by_id["feishu"]["capabilities"]["cards"] is True


def test_catalog_keeps_hermes_reference_platforms_visible() -> None:
    platform_ids = {entry["platform_id"] for entry in get_message_platform_catalog()}

    assert {
        "telegram",
        "feishu",
        "discord",
        "slack",
        "whatsapp",
        "signal",
        "dingtalk",
        "wecom",
        "line",
        "ntfy",
    }.issubset(platform_ids)
    assert get_supported_platform_ids() == ["telegram", "feishu"]
