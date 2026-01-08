from __future__ import annotations

from typing import Any


def _theme_preset(
    *,
    preset_id: str,
    label: str,
    description: str,
    graph_name: str,
    domain: str,
    genre: str,
    market: str,
    platform: str,
    language: str,
    creative_style: str,
    tone: str,
    evaluation_policy: dict[str, Any],
    asset_source_policy: dict[str, Any],
    strategy_profile: dict[str, Any],
    node_param_overrides: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": preset_id,
        "label": label,
        "description": description,
        "graph_name": graph_name,
        "node_param_overrides": node_param_overrides,
        "theme_config": {
            "theme_preset": preset_id,
            "domain": domain,
            "genre": genre,
            "market": market,
            "platform": platform,
            "language": language,
            "creative_style": creative_style,
            "tone": tone,
            "language_constraints": ["ui_en_only"],
            "evaluation_policy": evaluation_policy,
            "asset_source_policy": asset_source_policy,
            "strategy_profile": strategy_profile,
        },
    }


THEME_PRESETS: list[dict[str, Any]] = [
    _theme_preset(
        preset_id="slg_launch",
        label="SLG Launch",
        description="High-pressure strategy war ads with rapid escalation and alliance scale.",
        graph_name="Creative Factory · SLG Launch",
        domain="game_ads",
        genre="SLG",
        market="US",
        platform="facebook",
        language="zh",
        creative_style="high_pressure_growth_loop",
        tone="urgent",
        evaluation_policy={"scoreThreshold": 7.8, "hookPriority": "very_high", "payoffPriority": "high"},
        asset_source_policy={"adLibrary": True, "rss": True},
        strategy_profile={
            "hookTheme": "资源危机与战局失控",
            "payoffTheme": "联盟推进、战力成长与结果反转",
            "visualPattern": "警报色、大地图轨迹、爆字反馈",
            "pacingPattern": "前三秒警报切入，中段连续决策，尾段规模反推",
            "evaluationFocus": ["前三秒高压钩子", "成长反馈清晰", "联盟规模感"],
        },
        node_param_overrides={
            "select_assets_1": {"top_n": 2},
            "generate_variants_1": {"variantCount": 3},
            "review_variants_1": {"scoreThreshold": 7.8},
        },
    ),
    _theme_preset(
        preset_id="rpg_fantasy",
        label="RPG Fantasy",
        description="Hero-led fantasy progression with class fantasy, bosses, and loot payoff.",
        graph_name="Creative Factory · RPG Fantasy",
        domain="game_ads",
        genre="RPG",
        market="JP",
        platform="youtube_shorts",
        language="zh",
        creative_style="hero_power_fantasy",
        tone="epic",
        evaluation_policy={"scoreThreshold": 7.6, "fantasyClarity": "high", "rewardVisibility": "high"},
        asset_source_policy={"adLibrary": True, "rss": False},
        strategy_profile={
            "hookTheme": "英雄觉醒与强敌压境",
            "payoffTheme": "职业成长、掉落回报与 Boss 压制",
            "visualPattern": "技能爆发、装备光效、Boss 定格",
            "pacingPattern": "先压迫后觉醒，再用掉落和 Boss 结果收束",
            "evaluationFocus": ["职业幻想清晰", "战斗爆发镜头", "掉落与成长回报"],
        },
        node_param_overrides={
            "select_assets_1": {"top_n": 3},
            "generate_variants_1": {"variantCount": 3},
            "review_variants_1": {"scoreThreshold": 7.6},
        },
    ),
    _theme_preset(
        preset_id="survival_chaos",
        label="Survival Chaos",
        description="Overwhelming threat, scrappy resource recovery, and last-second reversals.",
        graph_name="Creative Factory · Survival Chaos",
        domain="game_ads",
        genre="Survival",
        market="US",
        platform="tiktok",
        language="zh",
        creative_style="chaotic_resource_panic",
        tone="grim",
        evaluation_policy={"scoreThreshold": 7.9, "dangerVisibility": "very_high", "scarcityPressure": "high"},
        asset_source_policy={"adLibrary": True, "rss": True},
        strategy_profile={
            "hookTheme": "资源匮乏与生存崩盘边缘",
            "payoffTheme": "极限翻盘、补给回收与据点重建",
            "visualPattern": "低资源警报、混乱尸潮、临界反杀",
            "pacingPattern": "先资源崩盘，再强压追逐，最后临界反杀",
            "evaluationFocus": ["匮乏压迫感", "混乱威胁可见", "最后翻盘够爽"],
        },
        node_param_overrides={
            "select_assets_1": {"top_n": 2},
            "generate_variants_1": {"variantCount": 4},
            "review_variants_1": {"scoreThreshold": 7.9},
        },
    ),
]


def get_creative_factory_theme_presets() -> list[dict[str, Any]]:
    return [dict(preset) for preset in THEME_PRESETS]
