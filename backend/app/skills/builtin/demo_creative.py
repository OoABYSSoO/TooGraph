from __future__ import annotations

import json
import math
import re
from datetime import datetime
from typing import Any


DEFAULT_TIME_BUCKETS = [
    "1~3s",
    "3~5s",
    "5~8s",
    "8~11s",
    "11~13s",
    "13~15s",
]


def extract_json_block_skill(**skill_inputs: Any) -> dict[str, Any]:
    text = str(skill_inputs.get("text") or "").strip()
    try:
        return {"parsed": _extract_json_block(text), "valid": True, "error": ""}
    except ValueError as exc:
        return {"parsed": None, "valid": False, "error": str(exc)}


def dedupe_items_skill(**skill_inputs: Any) -> dict[str, Any]:
    items = _ensure_list(skill_inputs.get("items"))
    deduped = _dedupe_keep_order(items)
    return {
        "items": deduped,
        "removed_count": len(items) - len(deduped),
    }


def select_top_items_skill(**skill_inputs: Any) -> dict[str, Any]:
    items = _ensure_list(skill_inputs.get("items"))
    try:
        top_n = int(skill_inputs.get("top_n") or len(items))
    except (TypeError, ValueError):
        top_n = len(items)
    return {"selected_items": items[: max(0, top_n)]}


def normalize_storyboard_shots_skill(**skill_inputs: Any) -> dict[str, Any]:
    return {"normalized_shots": _normalize_shot_list(_ensure_list(skill_inputs.get("shots")))}


def build_storyboard_package_skill(**skill_inputs: Any) -> dict[str, Any]:
    variant = _ensure_dict(skill_inputs.get("variant"))
    normalized_variant = _normalize_variant(variant)
    images = _build_storyboard_images(normalized_variant)
    return {
        "storyboard_images": images,
        "storyboard_markdown": _render_storyboard_markdown(normalized_variant, images),
    }


def build_video_prompt_package_skill(**skill_inputs: Any) -> dict[str, Any]:
    variant = _normalize_variant(_ensure_dict(skill_inputs.get("variant")))
    storyboard_images = _ensure_list(skill_inputs.get("storyboard_images"))
    prompt_package = {
        "video_prompt_v1_text_15s_cn": _build_video_prompt_version1(variant, storyboard_images),
        "video_prompt_v2_storyboard_cn": _build_video_prompt_version2(variant, storyboard_images),
    }
    return {
        "video_prompts": prompt_package,
        "video_prompts_markdown": _render_video_prompts_markdown(variant, prompt_package),
    }


def build_final_summary_skill(**skill_inputs: Any) -> dict[str, Any]:
    payload = _ensure_dict(skill_inputs.get("payload"))
    return {"summary_markdown": _build_final_summary(payload)}


def _extract_json_block(text: str) -> Any:
    if not text:
        raise ValueError("Unable to extract JSON from an empty response.")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", text, flags=re.S)
    if fenced:
        return json.loads(fenced.group(1))

    for start_ch, end_ch in [("{", "}"), ("[", "]")]:
        start = text.find(start_ch)
        end = text.rfind(end_ch)
        if start != -1 and end != -1 and end > start:
            candidate = text[start : end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
    raise ValueError(f"Unable to extract JSON from text: {text[:200]}")


def _ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _ensure_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _dedupe_keep_order(items: list[Any]) -> list[Any]:
    seen: set[str] = set()
    ordered: list[Any] = []
    for item in items:
        key = json.dumps(item, ensure_ascii=False, sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def _compact_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = re.sub(r"\s+", " ", str(value).strip())
    return text or fallback


def _allocate_time_ranges(num_shots: int) -> list[str]:
    if num_shots <= 0:
        return []
    if num_shots <= len(DEFAULT_TIME_BUCKETS):
        return DEFAULT_TIME_BUCKETS[:num_shots]
    total_seconds = 15.0
    chunk = total_seconds / num_shots
    ranges: list[str] = []
    for idx in range(num_shots):
        start = idx * chunk
        end = (idx + 1) * chunk
        end_label = f"{min(15, max(math.ceil(end), math.floor(start) + 1))}s"
        if idx == 0:
            ranges.append(f"1~{min(15, max(2, math.ceil(end)))}s")
        else:
            prev_end = ranges[-1].split("~")[-1].replace("s", "")
            ranges.append(f"{prev_end}~{end_label}")
    return ranges


def _default_shots() -> list[dict[str, Any]]:
    return [
        {
            "scene_purpose": "前3秒钩子",
            "visual_description_cn": "资源即将耗尽，主城红色警报闪烁，镜头快速推近仓库与粮食条。",
            "camera_language_cn": "快速推进 + 轻微手持抖动",
            "character_action_cn": "主角冲向仓库并猛点补给按钮，但库存显示不足。",
            "ui_text_en": ["LOW FOOD", "EMERGENCY"],
            "voiceover_en": "We're out of food. One move decides everything.",
            "sfx_music_cn": "低频警报 + 紧张鼓点",
            "transition_cn": "红色警报闪白切到部队调度界面",
        },
        {
            "scene_purpose": "冲突升级",
            "visual_description_cn": "敌军从地图边缘压境，部队数量悬殊，主角必须做出调兵选择。",
            "camera_language_cn": "地图拉远后快速切近敌军箭头",
            "character_action_cn": "玩家拖拽部队路线，切换英雄技能。",
            "ui_text_en": ["ENEMY RAID", "REDEPLOY NOW"],
            "voiceover_en": "If this convoy falls, the base is done.",
            "sfx_music_cn": "鼓点加速 + 地图警报音",
            "transition_cn": "通过地图拖拽轨迹流畅过渡到战斗接触瞬间",
        },
        {
            "scene_purpose": "结果落点",
            "visual_description_cn": "敌方防线崩溃，战报界面弹出，资源与评分同步提升，形成完整闭环。",
            "camera_language_cn": "胜利镜头定格 + UI 结果页弹出",
            "character_action_cn": "镜头停在胜利战报与主城重建后的全景。",
            "ui_text_en": ["VICTORY", "BASE SECURED"],
            "voiceover_en": "We held the line. Now the whole map is ours.",
            "sfx_music_cn": "胜利音效收束",
            "transition_cn": "结尾停在胜利结果页",
        },
    ]


def _normalize_shot_list(raw_shots: list[Any]) -> list[dict[str, Any]]:
    base_shots = [shot for shot in raw_shots[:6] if isinstance(shot, dict)] or _default_shots()
    time_ranges = _allocate_time_ranges(len(base_shots))
    normalized: list[dict[str, Any]] = []
    for idx, shot in enumerate(base_shots, start=1):
        normalized.append(
            {
                "shot_id": f"S{idx}",
                "time_range": time_ranges[idx - 1] if idx - 1 < len(time_ranges) else "13~15s",
                "scene_purpose": _compact_text(shot.get("scene_purpose"), f"镜头{idx}"),
                "visual_description_cn": _compact_text(shot.get("visual_description_cn"), "请补充画面描述"),
                "camera_language_cn": _compact_text(shot.get("camera_language_cn"), "稳定录屏机位"),
                "character_action_cn": _compact_text(shot.get("character_action_cn"), "角色执行关键操作"),
                "ui_text_en": [_compact_text(item) for item in _ensure_list(shot.get("ui_text_en")) if _compact_text(item)],
                "voiceover_en": _compact_text(shot.get("voiceover_en"), "No voiceover provided."),
                "sfx_music_cn": _compact_text(shot.get("sfx_music_cn"), "保持高压游戏内音效与配乐"),
                "transition_cn": _compact_text(shot.get("transition_cn"), "自然转入下一帧关键画面"),
            }
        )
    return normalized


def _normalize_variant(variant: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(variant)
    normalized["variant_id"] = _compact_text(normalized.get("variant_id"), "V1")
    normalized["strategy_name"] = _compact_text(normalized.get("strategy_name"), "策略版本")
    normalized["positioning"] = _compact_text(normalized.get("positioning"), "突出危机-决策-增长闭环")
    normalized["visual_style_cn"] = _compact_text(normalized.get("visual_style_cn"), "高张力、写实、强反馈的游戏录屏广告")
    normalized["hook"] = _compact_text(normalized.get("hook"), "前3秒抛出高压危机")
    normalized["core_conflict"] = _compact_text(normalized.get("core_conflict"), "资源稀缺与敌军压境形成压力")
    normalized["selling_points"] = [
        _compact_text(item) for item in _ensure_list(normalized.get("selling_points")) if _compact_text(item)
    ] or ["成长反馈", "联盟协作"]
    normalized["shot_list"] = _normalize_shot_list(_ensure_list(normalized.get("shot_list")))
    return normalized


def _join_ui_text(ui_texts: list[Any]) -> str:
    texts = [_compact_text(item) for item in ui_texts if _compact_text(item)]
    return " / ".join(texts) if texts else "无明确 UI 文案"


def _build_storyboard_images(variant: dict[str, Any]) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    style = _compact_text(variant.get("visual_style_cn"), "高张力、写实、强 UI 反馈的游戏录屏")
    for idx, shot in enumerate(_ensure_list(variant.get("shot_list")), start=1):
        shot_dict = _ensure_dict(shot)
        ui_texts = _ensure_list(shot_dict.get("ui_text_en"))
        ui_display = _join_ui_text(ui_texts)
        image_prompt_cn = (
            f"一张用于游戏广告图片分镜的关键帧，整体风格为{style}。"
            f"当前画面目的：{shot_dict.get('scene_purpose', '')}。"
            f"画面内容：{shot_dict.get('visual_description_cn', '')}。"
            f"角色动作：{shot_dict.get('character_action_cn', '')}。"
            f"镜头语言：{shot_dict.get('camera_language_cn', '')}。"
            f"画面内所有 UI、按钮、数字、战报、浮层、字幕必须只使用英文，示例英文 UI：{ui_display}。"
            f"不要出现中文 UI，不要出现中文字幕，不要水印，不要模糊。"
        )
        images.append(
            {
                "image_id": f"图片{idx}",
                "shot_id": shot_dict.get("shot_id", f"S{idx}"),
                "time_range": shot_dict.get("time_range", ""),
                "scene_purpose": shot_dict.get("scene_purpose", ""),
                "visual_description_cn": shot_dict.get("visual_description_cn", ""),
                "camera_language_cn": shot_dict.get("camera_language_cn", ""),
                "character_action_cn": shot_dict.get("character_action_cn", ""),
                "transition_cn": shot_dict.get("transition_cn", ""),
                "ui_text_en": ui_texts,
                "voiceover_en": shot_dict.get("voiceover_en", ""),
                "image_prompt_cn": image_prompt_cn,
            }
        )
    return images


def _render_storyboard_markdown(variant: dict[str, Any], storyboard_images: list[dict[str, Any]]) -> str:
    lines = [
        f"# {variant.get('variant_id', '')}｜{variant.get('strategy_name', '')} 图片分镜脚本",
        "",
        f"- 核心定位：{variant.get('positioning', '')}",
        f"- 视觉风格：{variant.get('visual_style_cn', '')}",
        f"- 前3秒钩子：{variant.get('hook', '')}",
        f"- 核心冲突：{variant.get('core_conflict', '')}",
        f"- 卖点：{' / '.join(_ensure_list(variant.get('selling_points')))}",
        "",
        "## 结构化分镜",
        "",
    ]
    for item in storyboard_images:
        lines.extend(
            [
                f"### @{item.get('image_id')} ｜ {item.get('time_range')} ｜ {item.get('scene_purpose')}",
                f"- 画面描述：{item.get('visual_description_cn')}",
                f"- 角色动作：{item.get('character_action_cn')}",
                f"- 镜头语言：{item.get('camera_language_cn')}",
                f"- 英文 UI / 文本：{_join_ui_text(_ensure_list(item.get('ui_text_en')))}",
                "",
                "```text",
                item.get("image_prompt_cn", ""),
                "```",
                "",
            ]
        )
    return "\n".join(lines)


def _build_video_prompt_version1(variant: dict[str, Any], storyboard_images: list[Any]) -> str:
    style = _compact_text(variant.get("visual_style_cn"), "高张力、写实、强反馈")
    segments = [f"一个{style}风格的游戏录屏视频，限制为15s内，所有UI/字幕/数值必须为英文。"]
    for item in storyboard_images:
        item_dict = _ensure_dict(item)
        segments.append(
            f"{item_dict.get('time_range')}: {item_dict.get('visual_description_cn')}；"
            f"角色动作：{item_dict.get('character_action_cn')}；"
            f"镜头运动：{item_dict.get('camera_language_cn')}；"
            f"英文UI示例：{_join_ui_text(_ensure_list(item_dict.get('ui_text_en')))}；"
            f"英文配音：\"{item_dict.get('voiceover_en')}\"。"
        )
    segments.append("结尾停在结果反馈或局势反转，不出现中文，不出现硬 CTA。")
    return "".join(segments)


def _build_video_prompt_version2(variant: dict[str, Any], storyboard_images: list[Any]) -> str:
    style = _compact_text(variant.get("visual_style_cn"), "高张力、写实、强反馈")
    if not storyboard_images:
        return f"一个{style}风格的游戏录屏视频生成提示词，@图片1作为起始图，直接扩写为高张力广告镜头。"
    parts = [f"一个{style}风格的视频生成提示词，基于图片分镜进行镜头延展，所有画面 UI、字幕、数字和配音必须为英文。"]
    for idx, item in enumerate(storyboard_images):
        item_dict = _ensure_dict(item)
        current_ref = f"@{item_dict.get('image_id', f'图片{idx + 1}')}"
        parts.append(
            f"{current_ref}表现{item_dict.get('visual_description_cn')}，"
            f"镜头语言保持{item_dict.get('camera_language_cn')}，"
            f"英文UI \"{_join_ui_text(_ensure_list(item_dict.get('ui_text_en')))}\"。"
        )
    parts.append("整体要求：镜头衔接流畅，英文 UI 清晰可读，不要中文，不要真人口播。")
    return "".join(parts)


def _render_video_prompts_markdown(variant: dict[str, Any], prompt_package: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"# {variant.get('variant_id', '')}｜{variant.get('strategy_name', '')} 视频生成提示词",
            "",
            "## 版本1｜纯文本视频提示词（15s内）",
            "",
            "```text",
            prompt_package.get("video_prompt_v1_text_15s_cn", ""),
            "```",
            "",
            "## 版本2｜配合图片分镜的视频提示词",
            "",
            "```text",
            prompt_package.get("video_prompt_v2_storyboard_cn", ""),
            "```",
            "",
        ]
    )


def _build_final_summary(payload: dict[str, Any]) -> str:
    variants = _ensure_list(payload.get("script_variants"))
    best = _ensure_dict(payload.get("best_variant"))
    lines = [
        "# SLG 创意工厂运行结果",
        "",
        f"- 运行 ID：{payload.get('run_id', '')}",
        f"- 运行时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 创意版本数：{len(variants)}",
        "",
        "## 推荐版本",
        f"- 版本：{best.get('variant_id', '')}｜{best.get('strategy_name', '')}",
        "",
        "## Creative Brief",
        str(payload.get("creative_brief") or ""),
        "",
        "## Pattern Summary",
        str(payload.get("pattern_summary") or ""),
        "",
        "## News Context",
        str(payload.get("news_context") or ""),
    ]
    review_results = _ensure_list(payload.get("review_results"))
    if review_results:
        lines.extend(["", "## Review Results"])
        for review in review_results:
            review_dict = _ensure_dict(review)
            lines.append(f"- {review_dict.get('variant_id', '')}: {review_dict.get('total_score', '')}")
    return "\n".join(lines)
