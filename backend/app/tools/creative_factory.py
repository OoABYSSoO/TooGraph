from __future__ import annotations

from typing import Any


def compact_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def theme_profile(theme_config: dict[str, Any]) -> dict[str, str]:
    genre = compact_text(theme_config.get("genre"), "strategy")
    tone = compact_text(theme_config.get("tone"), "urgent")
    platform = compact_text(theme_config.get("platform"), "digital")
    creative_style = compact_text(theme_config.get("creative_style"), compact_text(theme_config.get("creativeStyle"), "high_intensity"))

    if genre.upper() == "RPG":
        return {
            "genre": genre,
            "tone": tone,
            "platform": platform,
            "creative_style": creative_style,
            "hook_theme": "英雄觉醒与强敌压境",
            "payoff_theme": "职业成长、掉落回报与 Boss 压制",
            "visual_pattern": "技能爆发、装备光效、Boss 定格",
        }
    if genre.lower() == "survival":
        return {
            "genre": genre,
            "tone": tone,
            "platform": platform,
            "creative_style": creative_style,
            "hook_theme": "资源匮乏与生存崩盘边缘",
            "payoff_theme": "极限翻盘、补给回收与据点重建",
            "visual_pattern": "低资源警报、混乱尸潮、临界反杀",
        }
    return {
        "genre": genre,
        "tone": tone,
        "platform": platform,
        "creative_style": creative_style,
        "hook_theme": "资源危机与战局失控",
        "payoff_theme": "联盟推进、战力成长与结果反转",
        "visual_pattern": "警报色、大地图轨迹、爆字反馈",
    }


def ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def allocate_time_ranges(num_shots: int) -> list[str]:
    defaults = ["1~3s", "3~5s", "5~8s", "8~11s", "11~13s", "13~15s"]
    if num_shots <= len(defaults):
        return defaults[:num_shots]
    return defaults + ["13~15s"] * max(0, num_shots - len(defaults))


def normalize_shot_list(raw_shots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base_shots = raw_shots[:6] if raw_shots else []
    if not base_shots:
        base_shots = [
            {
                "scene_purpose": "前3秒钩子",
                "visual_description_cn": "主城资源告急，红色警报和敌军压境同时出现。",
                "camera_language_cn": "快速推进 + 高频切换",
                "character_action_cn": "玩家拖拽部队、点击补给、快速作出调度。",
                "ui_text_en": ["LOW FOOD", "ENEMY RAID"],
                "voiceover_en": "One mistake and the whole base falls.",
                "transition_cn": "警报闪白切到兵线推进。",
            },
            {
                "scene_purpose": "冲突升级",
                "visual_description_cn": "敌军箭头逼近，大地图上多路同时推进。",
                "camera_language_cn": "拉远地图后快速切近主战场",
                "character_action_cn": "玩家切换英雄技能和行军路线。",
                "ui_text_en": ["REDEPLOY NOW", "HOLD THE LINE"],
                "voiceover_en": "Every second changes the battle.",
                "transition_cn": "地图轨迹衔接到技能爆发。",
            },
            {
                "scene_purpose": "机制爽点",
                "visual_description_cn": "技能命中后数值暴涨，突破敌方阵线。",
                "camera_language_cn": "战场定格 + 爆发数值放大",
                "character_action_cn": "英雄技能砸下，兵线前推。",
                "ui_text_en": ["CRITICAL HIT", "+250% DAMAGE"],
                "voiceover_en": "A perfect timing flips everything.",
                "transition_cn": "爆字粒子飞散切到成长反馈。",
            },
            {
                "scene_purpose": "成长反馈",
                "visual_description_cn": "基地升级、科技点亮、战力暴涨。",
                "camera_language_cn": "固定机位 + 多层 UI 叠加",
                "character_action_cn": "玩家连续点击升级。",
                "ui_text_en": ["POWER UP", "LEVEL 12"],
                "voiceover_en": "Every upgrade buys us another chance.",
                "transition_cn": "升级光效扩散到联盟集结。",
            },
            {
                "scene_purpose": "联盟规模",
                "visual_description_cn": "联盟多支队伍会师推进，规模感拉满。",
                "camera_language_cn": "大地图拉远 + 轨迹汇聚",
                "character_action_cn": "联盟同步进军同一目标。",
                "ui_text_en": ["RALLY READY", "ALLIANCE MARCH"],
                "voiceover_en": "When the alliance moves, nothing stops us.",
                "transition_cn": "队伍冲锋带到胜利镜头。",
            },
            {
                "scene_purpose": "结果落点",
                "visual_description_cn": "敌军防线崩溃，胜利战报与资源反馈同时出现。",
                "camera_language_cn": "胜利定格 + 结果页弹出",
                "character_action_cn": "镜头停留在战报和重建后的主城。",
                "ui_text_en": ["VICTORY", "BASE SECURED"],
                "voiceover_en": "We held the line, and now the map is ours.",
                "transition_cn": "以结果页收尾。",
            },
        ]

    ranges = allocate_time_ranges(len(base_shots))
    normalized: list[dict[str, Any]] = []
    for idx, shot in enumerate(base_shots, start=1):
        normalized.append(
            {
                "shot_id": f"S{idx}",
                "time_range": ranges[idx - 1],
                "scene_purpose": compact_text(shot.get("scene_purpose"), f"镜头{idx}"),
                "visual_description_cn": compact_text(shot.get("visual_description_cn"), "请补充画面描述"),
                "camera_language_cn": compact_text(shot.get("camera_language_cn"), "稳定录屏机位"),
                "character_action_cn": compact_text(shot.get("character_action_cn"), "角色执行关键操作"),
                "ui_text_en": [compact_text(x) for x in ensure_list(shot.get("ui_text_en")) if compact_text(x)],
                "voiceover_en": compact_text(shot.get("voiceover_en"), "No voiceover provided."),
                "transition_cn": compact_text(shot.get("transition_cn"), "自然转入下一镜头"),
            }
        )
    return normalized


def build_storyboard_images(variant: dict[str, Any]) -> list[dict[str, Any]]:
    style = compact_text(variant.get("visual_style_cn"), "高张力、写实、强 UI 反馈的策略游戏录屏")
    images: list[dict[str, Any]] = []
    for idx, shot in enumerate(ensure_list(variant.get("shot_list")), start=1):
        ui_display = " / ".join(ensure_list(shot.get("ui_text_en"))) or "ENGLISH UI ONLY"
        images.append(
            {
                "image_id": f"图片{idx}",
                "shot_id": shot.get("shot_id", f"S{idx}"),
                "time_range": shot.get("time_range", ""),
                "scene_purpose": shot.get("scene_purpose", ""),
                "image_prompt_cn": (
                    f"一张用于策略广告图片分镜的关键帧，整体风格为{style}。"
                    f"当前画面目的：{shot.get('scene_purpose', '')}。"
                    f"画面内容：{shot.get('visual_description_cn', '')}。"
                    f"角色动作：{shot.get('character_action_cn', '')}。"
                    f"镜头语言：{shot.get('camera_language_cn', '')}。"
                    f"画面内所有 UI、按钮、数字必须只使用英文，示例英文 UI：{ui_display}。"
                    f"英文配音参考：\"{shot.get('voiceover_en', '')}\"。"
                ),
            }
        )
    return images


def build_video_prompt_version1(variant: dict[str, Any], storyboard_images: list[dict[str, Any]]) -> str:
    style = compact_text(variant.get("visual_style_cn"), "高张力、写实、强反馈")
    segments = [f"一个{style}风格的策略游戏录屏视频，限制15秒内，所有 UI 与配音必须为英文。"]
    for item in storyboard_images:
        segments.append(f"{item.get('time_range')}: {item.get('scene_purpose')}，参考图片 {item.get('image_id')} 的镜头设计。")
    segments.append("结尾停在结果反馈或局势反转，不要中文，不要真人口播。")
    return "".join(segments)


def build_video_prompt_version2(variant: dict[str, Any], storyboard_images: list[dict[str, Any]]) -> str:
    style = compact_text(variant.get("visual_style_cn"), "高张力、写实、强反馈")
    prompt = [f"一个{style}风格的策略游戏录屏视频生成提示词，基于图片分镜做镜头延展。"]
    for idx, item in enumerate(storyboard_images, start=1):
        prompt.append(f"参考 @{item.get('image_id', f'图片{idx}')}，表现 {item.get('scene_purpose')}。")
    prompt.append("整体要求：镜头衔接流畅，英文 UI 清晰可读，英文配音节奏与画面同步。")
    return "".join(prompt)


def fetch_market_news_context(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    task = compact_text(state.get("task_input"), "creative research")
    theme_config = state.get("theme_config") or {}
    profile = theme_profile(theme_config)
    rss_items = [
        {
            "source": "PocketGamer.biz",
            "title": f"{task[:48]} market trend snapshot",
            "summary": f"{profile['genre']} 市场近期强调{profile['hook_theme']}，平台侧重点为 {profile['platform']}。",
            "creative_hint": f"前3秒优先建立 {profile['hook_theme']}。",
        },
        {
            "source": "GameDeveloper",
            "title": "UA creatives increasingly focus on survival pressure",
            "summary": "买量创意更偏爱明确冲突、数值反馈和强节奏推进。",
            "creative_hint": f"用 {profile['payoff_theme']} 强化爽点。",
        },
    ]
    return {"rss_items": rss_items}


def clean_market_news(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    rss_items = ensure_list(state.get("rss_items"))
    clean_news_items = [
        {"title": item.get("title", ""), "summary": item.get("summary", ""), "creative_hint": item.get("creative_hint", ""), "tags": ["hook", "growth", "strategy"]}
        for item in rss_items
    ]
    news_context = "\n".join(f"- {item.get('title')}: {item.get('creative_hint') or item.get('summary')}" for item in clean_news_items)
    return {"clean_news_items": clean_news_items, "news_context": news_context}


def fetch_benchmark_assets(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del state, params
    return {
        "ad_items": [
            {"item_id": "AD_1", "keyword": "strategy", "creative_theme": "资源危机 + 敌军压境", "hook": "低资源警报 + 快速调兵", "video_url": "https://example.com/ad-1.mp4"},
            {"item_id": "AD_2", "keyword": "strategy", "creative_theme": "联盟集结 + 反推战场", "hook": "多人会师推进", "video_url": "https://example.com/ad-2.mp4"},
        ]
    }


def normalize_asset_records(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    normalized_video_items = [
        {
            "item_id": item.get("item_id"),
            "keyword": item.get("keyword", "strategy"),
            "content_type": "video",
            "hook": item.get("hook", ""),
            "source_url": item.get("video_url", ""),
            "creative_theme": item.get("creative_theme", ""),
        }
        for item in ensure_list(state.get("ad_items"))
    ]
    return {"normalized_video_items": normalized_video_items}


def select_top_video_assets(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    top_n = int((params or {}).get("top_n", 2))
    return {"selected_video_items": ensure_list(state.get("normalized_video_items"))[:top_n]}


def analyze_video_assets(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    task = compact_text(state.get("task_input"), "creative campaign")
    profile = theme_profile(state.get("theme_config") or {})
    analyses = []
    for idx, item in enumerate(ensure_list(state.get("selected_video_items")), start=1):
        analyses.append(
            {
                "item_id": item.get("item_id", f"ASSET_{idx}"),
                "hook_type": "高压危机开场",
                "opening_summary": f"{task[:40]} 以{profile['genre']}题材常见的{profile['hook_theme']}在前3秒建立紧张感。",
                "core_conflict": item.get("creative_theme", "资源与战局双重压力"),
                "selling_points": ["强反馈数值", "协同推进", "局势反转"],
                "visual_patterns": [profile["visual_pattern"], "结果页强化", "节奏推进"],
                "reusable_formula": "危机 -> 决策 -> 爽点 -> 成长 -> 规模 -> 结果",
                "one_sentence_takeaway": "前3秒必须抛高压局面，后续用数值反馈完成闭环。",
            }
        )
    return {"video_analysis_results": analyses}


def extract_creative_patterns(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    analyses = ensure_list(state.get("video_analysis_results"))
    pattern_summary = "\n".join(
        [
            "# Creative Pattern Summary",
            "",
            f"- 分析素材数量：{len(analyses)}",
            "- 通用公式：危机开场 -> 快速决策 -> 机制爽点 -> 成长反馈 -> 规模 -> 结果收束",
            "- 画面模式：警报色、地图轨迹、爆字数值、结果页",
            "- 表达重点：前3秒高压钩子、全程英文 UI、节奏持续推进",
        ]
    )
    return {"pattern_summary": pattern_summary}


def build_creative_brief(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    task = compact_text(state.get("task_input"), "creative brief")
    theme_config = state.get("theme_config", {})
    profile = theme_profile(theme_config)
    market = compact_text(theme_config.get("market"), "global")
    pattern_summary = compact_text(state.get("pattern_summary"))
    news_context = compact_text(state.get("news_context"))
    brief = "\n".join(
        [
            "# Creative Brief",
            "",
            f"- 目标任务：{task}",
            f"- 题材：{profile['genre']}",
            f"- 市场：{market}",
            f"- 平台：{profile['platform']}",
            f"- 风格：{profile['creative_style']}",
            f"- 语气：{profile['tone']}",
            f"- 创意方向：围绕 {profile['hook_theme']} 和 {profile['payoff_theme']} 构建高压叙事。",
            "- 结构要求：15 秒内完成危机、决策、爽点和结果落点。",
            f"- 模式参考：{pattern_summary[:220]}",
            f"- 新闻辅助：{news_context[:220]}",
        ]
    )
    return {"creative_brief": brief}


def generate_creative_variants(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    variant_count = int((params or {}).get("variant_count", 2))
    revision_round = int(state.get("revision_round", 0))
    theme_config = state.get("theme_config", {})
    profile = theme_profile(theme_config)
    feedback = " / ".join(ensure_list(state.get("revision_feedback"))) or "保持前3秒高压钩子和机制爽点"
    variants = []
    for idx in range(1, max(variant_count, 1) + 1):
        variants.append(
            {
                "variant_id": f"V{idx}",
                "strategy_name": f"{profile['genre']} 核心钩子版本 {idx}",
                "positioning": f"突出 {profile['hook_theme']} 与 {profile['payoff_theme']}",
                "visual_style_cn": f"{profile['tone']}、{profile['creative_style']}、强反馈的 {profile['genre']} 游戏录屏广告",
                "hook": f"前3秒直接抛出 {profile['hook_theme']}",
                "core_conflict": f"在多线压力下完成推进与反转。第 {revision_round + 1} 轮侧重：{feedback}",
                "selling_points": [profile["hook_theme"], profile["payoff_theme"], profile["visual_pattern"]],
                "why_it_might_work": "强钩子 + 爽点闭环 + 英文 UI 适合买量投放",
                "risk": "如果节奏不够快，容易只剩概念没有爽点",
                "shot_list": normalize_shot_list([]),
            }
        )
    return {"script_variants": variants}


def generate_storyboard_packages(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    packages = []
    for variant in ensure_list(state.get("script_variants")):
        images = build_storyboard_images(variant)
        packages.append({"variant_id": variant.get("variant_id"), "strategy_name": variant.get("strategy_name"), "storyboard_images": images})
    return {"storyboard_packages": packages}


def generate_video_prompt_packages(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    storyboard_map = {item.get("variant_id"): item for item in ensure_list(state.get("storyboard_packages"))}
    packages = []
    for variant in ensure_list(state.get("script_variants")):
        storyboard_images = ensure_list(storyboard_map.get(variant.get("variant_id"), {}).get("storyboard_images"))
        packages.append(
            {
                "variant_id": variant.get("variant_id"),
                "strategy_name": variant.get("strategy_name"),
                "video_prompt_v1_text_15s_cn": build_video_prompt_version1(variant, storyboard_images),
                "video_prompt_v2_storyboard_cn": build_video_prompt_version2(variant, storyboard_images),
            }
        )
    return {"video_prompt_packages": packages}


def review_creative_variants(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    variants = ensure_list(state.get("script_variants"))
    threshold = float((params or {}).get("pass_threshold", 7.8))
    revision_round = int(state.get("revision_round", 0))
    task_input = compact_text(state.get("task_input")).lower()
    review_results = []
    best_variant: dict[str, Any] = {}
    best_score = -1.0
    for idx, variant in enumerate(variants, start=1):
        base_score = 8.6 - (idx - 1) * 0.3
        if "revise" in task_input and revision_round == 0:
            base_score -= 1.2
        review = {
            "variant_id": variant.get("variant_id", f"V{idx}"),
            "score": round(base_score, 1),
            "strengths": ["前3秒钩子明确", "节奏推进稳定", "英文 UI 约束清楚"],
            "risks": [] if base_score >= threshold else ["爽点偏弱，建议强化机制反馈"],
            "improvements": ["强化数值爆发镜头", "把规模感再提前 1 个镜头"],
        }
        review_results.append(review)
        if review["score"] > best_score:
            best_score = review["score"]
            best_variant = {**variant, "review": review}
    if not variants:
        decision = "fail"
        feedback = ["没有生成可评审的创意版本。"]
    elif best_score >= threshold:
        decision = "pass"
        feedback = []
    elif revision_round < int(state.get("max_revision_round", 1)):
        decision = "revise"
        feedback = ["前3秒危机感不够强，补足更直接的资源或战局压力。", "增加一个明确的数值爆发爽点镜头。"]
    else:
        decision = "fail"
        feedback = ["多轮修改后仍未达到评分阈值。"]
    return {
        "review_results": review_results,
        "best_variant": best_variant,
        "revision_feedback": feedback,
        "evaluation_result": {
            "decision": decision,
            "score": max(best_score, 0.0),
            "issues": [] if decision == "pass" else feedback,
            "suggestions": feedback or ["继续保持强钩子、强反馈和英文 UI 约束。"],
        },
    }


def prepare_image_generation_todo(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    best_variant = dict(state.get("best_variant") or {})
    storyboard_images = ensure_list(best_variant.get("storyboard_images"))
    if not storyboard_images:
        storyboard_packages = ensure_list(state.get("storyboard_packages"))
        storyboard_images = ensure_list(storyboard_packages[0].get("storyboard_images")) if storyboard_packages else []
    return {
        "image_generation_todo": {
            "target": "image_generation",
            "variant_id": best_variant.get("variant_id"),
            "items": storyboard_images,
            "notes": "当前阶段只生成 TODO 与输入物料，不直接调用图片模型。",
        }
    }


def prepare_video_generation_todo(state: dict[str, Any], params: dict[str, Any] | None = None) -> dict[str, Any]:
    del params
    prompt_packages = ensure_list(state.get("video_prompt_packages"))
    return {
        "video_generation_todo": {
            "target": "video_generation",
            "variant_id": (state.get("best_variant") or {}).get("variant_id"),
            "prompt_packages": prompt_packages,
            "notes": "当前阶段只生成 TODO 与输入物料，不直接调用视频模型。",
        }
    }
