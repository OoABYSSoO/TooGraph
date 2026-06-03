from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.graph_tools.definitions import list_tool_catalog

OFFICIAL_TOOL_ROOT = Path(__file__).resolve().parents[2] / "tool" / "official"
ZH_TEXT_PATTERN = re.compile(r"[\u4e00-\u9fff]")


class ToolCatalogLocalizationTests(unittest.TestCase):
    def test_official_tool_catalog_exposes_localized_manifest_text(self) -> None:
        catalog = {tool.tool_key: tool for tool in list_tool_catalog(include_disabled=True)}
        definition = catalog["memory_search_context_loader"]

        self.assertEqual(definition.localized["zh-CN"].name, "记忆搜索上下文加载器")
        self.assertIn("长期记忆", definition.localized["zh-CN"].description)
        self.assertEqual(definition.localized["en-US"].name, "Memory Search Context Loader")
        self.assertIn("long-term memories", definition.localized["en-US"].description)

        serialized = definition.model_dump(by_alias=True)
        self.assertEqual(serialized["localized"]["zh-CN"]["name"], "记忆搜索上下文加载器")

    def test_official_tool_manifest_descriptions_default_to_chinese(self) -> None:
        for manifest_path in sorted(OFFICIAL_TOOL_ROOT.glob("*/tool.json")):
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))

            for field_path, text in _iter_manifest_description_fields(payload):
                with self.subTest(manifest=str(manifest_path.relative_to(OFFICIAL_TOOL_ROOT)), field=field_path):
                    self.assertRegex(text, ZH_TEXT_PATTERN)

    def test_official_tools_keep_chinese_and_english_catalog_introductions(self) -> None:
        for definition in list_tool_catalog(include_disabled=True):
            if definition.source_scope != "official":
                continue
            with self.subTest(tool_key=definition.tool_key):
                self.assertIn("zh-CN", definition.localized)
                self.assertIn("en-US", definition.localized)
                self.assertRegex(definition.localized["zh-CN"].description, ZH_TEXT_PATTERN)
                self.assertTrue(definition.localized["en-US"].description.strip())


def _iter_manifest_description_fields(payload: object, prefix: str = ""):
    if isinstance(payload, dict):
        for key, value in payload.items():
            path = f"{prefix}.{key}" if prefix else key
            if path == "localized.en-US.description":
                continue
            if key == "description" and isinstance(value, str):
                yield path, value
            else:
                yield from _iter_manifest_description_fields(value, path)
        return
    if isinstance(payload, list):
        for index, value in enumerate(payload):
            yield from _iter_manifest_description_fields(value, f"{prefix}[{index}]")


if __name__ == "__main__":
    unittest.main()
