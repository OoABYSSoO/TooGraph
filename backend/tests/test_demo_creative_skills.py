from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.skills.builtin.demo_creative import (
    build_final_summary_skill,
    build_storyboard_package_skill,
    build_video_prompt_package_skill,
    dedupe_items_skill,
    extract_json_block_skill,
    normalize_storyboard_shots_skill,
    select_top_items_skill,
)
from app.skills.registry import get_skill_registry


class DemoCreativeSkillTests(unittest.TestCase):
    def test_extract_json_block_skill_returns_parsed_json_and_error_state(self) -> None:
        self.assertEqual(
            extract_json_block_skill(text='prefix ```json\n{"ok": true}\n``` suffix'),
            {"parsed": {"ok": True}, "valid": True, "error": ""},
        )

        failed = extract_json_block_skill(text="not json")

        self.assertEqual(failed["parsed"], None)
        self.assertEqual(failed["valid"], False)
        self.assertIn("Unable to extract JSON", failed["error"])

    def test_dedupe_items_skill_preserves_order_and_reports_removed_count(self) -> None:
        result = dedupe_items_skill(items=["a", "b", "a", {"x": 1}, {"x": 1}])

        self.assertEqual(result["items"], ["a", "b", {"x": 1}])
        self.assertEqual(result["removed_count"], 2)

    def test_select_top_items_skill_limits_items(self) -> None:
        result = select_top_items_skill(items=[{"id": 1}, {"id": 2}, {"id": 3}], top_n=2)

        self.assertEqual(result["selected_items"], [{"id": 1}, {"id": 2}])

    def test_normalize_storyboard_shots_skill_returns_stable_fields(self) -> None:
        result = normalize_storyboard_shots_skill(
            shots=[
                {
                    "scene_purpose": "hook",
                    "visual_description_cn": "主城告急",
                    "ui_text_en": ["LOW FOOD"],
                    "voiceover_en": "We need supplies now.",
                }
            ]
        )

        normalized = result["normalized_shots"]
        self.assertEqual(normalized[0]["shot_id"], "S1")
        self.assertEqual(normalized[0]["time_range"], "1~3s")
        self.assertEqual(normalized[0]["scene_purpose"], "hook")
        self.assertEqual(normalized[0]["ui_text_en"], ["LOW FOOD"])

    def test_storyboard_and_video_prompt_packages_return_markdown(self) -> None:
        variant = {
            "variant_id": "V1",
            "strategy_name": "Crisis Hook",
            "positioning": "危机开场",
            "visual_style_cn": "高张力 SLG 录屏",
            "hook": "资源耗尽",
            "core_conflict": "敌军压境",
            "selling_points": ["联盟集结"],
            "shot_list": normalize_storyboard_shots_skill(shots=[]).get("normalized_shots"),
        }

        storyboard = build_storyboard_package_skill(variant=variant)
        prompts = build_video_prompt_package_skill(
            variant=variant,
            storyboard_images=storyboard["storyboard_images"],
        )

        self.assertIn("# V1｜Crisis Hook 图片分镜脚本", storyboard["storyboard_markdown"])
        self.assertIn("video_prompt_v1_text_15s_cn", prompts["video_prompts"])
        self.assertIn("# V1｜Crisis Hook 视频生成提示词", prompts["video_prompts_markdown"])

    def test_build_final_summary_skill_returns_markdown(self) -> None:
        result = build_final_summary_skill(
            payload={
                "run_id": "run-1",
                "creative_brief": "brief",
                "pattern_summary": "pattern",
                "news_context": "news",
                "script_variants": [{"variant_id": "V1", "strategy_name": "A"}],
                "best_variant": {"variant_id": "V1", "strategy_name": "A"},
                "review_results": [{"variant_id": "V1", "total_score": 8.2}],
            }
        )

        self.assertIn("# SLG 创意工厂运行结果", result["summary_markdown"])
        self.assertIn("run-1", result["summary_markdown"])

    def test_demo_derived_skills_are_runtime_registered(self) -> None:
        registry = get_skill_registry(include_disabled=True)

        for skill_key in [
            "extract_json_block",
            "dedupe_items",
            "select_top_items",
            "normalize_storyboard_shots",
            "build_storyboard_package",
            "build_video_prompt_package",
            "build_final_summary",
        ]:
            self.assertIn(skill_key, registry)


if __name__ == "__main__":
    unittest.main()
