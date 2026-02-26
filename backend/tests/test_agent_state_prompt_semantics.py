from __future__ import annotations

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.node_system_executor import _build_auto_system_prompt, _parse_llm_json_response
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType


class AgentStatePromptSemanticTests(unittest.TestCase):
    def test_auto_prompt_includes_state_names_for_inputs_and_required_outputs(self) -> None:
        state_schema = {
            "question_state": NodeSystemStateDefinition(
                name="用户问题",
                description="用户原始输入",
                type=NodeSystemStateType.TEXT,
                value="",
            ),
            "state_1": NodeSystemStateDefinition(
                name="最终答案",
                description="给用户看的中文总结",
                type=NodeSystemStateType.MARKDOWN,
                value="",
            ),
        }

        prompt = _build_auto_system_prompt(
            ["state_1"],
            {"question_state": "请总结这段内容"},
            {},
            state_schema=state_schema,
        )

        self.assertIn("key: question_state", prompt)
        self.assertIn("name: 用户问题", prompt)
        self.assertIn("description: 用户原始输入", prompt)
        self.assertIn("key: state_1", prompt)
        self.assertIn("name: 最终答案", prompt)
        self.assertIn("description: 给用户看的中文总结", prompt)
        self.assertIn('"state_1": "..."', prompt)

    def test_auto_prompt_emphasizes_output_state_value_formats(self) -> None:
        state_schema = {
            "state_1": NodeSystemStateDefinition(
                name="最终答案",
                description="给用户看的中文总结",
                type=NodeSystemStateType.MARKDOWN,
                value="",
            ),
            "state_2": NodeSystemStateDefinition(
                name="结构化评分",
                description="模型评分结果",
                type=NodeSystemStateType.JSON,
                value={},
            ),
        }

        prompt = _build_auto_system_prompt(
            ["state_1", "state_2"],
            {},
            {},
            state_schema=state_schema,
        )

        self.assertIn("output_format: markdown string inside the JSON value", prompt)
        self.assertIn("这个字段的值必须是 Markdown 内容字符串", prompt)
        self.assertIn("output_format: JSON object inside the JSON value", prompt)
        self.assertIn("不要把对象再序列化成字符串", prompt)

    def test_auto_prompt_preserves_input_and_output_state_order(self) -> None:
        state_schema = {
            "context": NodeSystemStateDefinition(
                name="上下文",
                description="",
                type=NodeSystemStateType.TEXT,
                value="",
            ),
            "question": NodeSystemStateDefinition(
                name="问题",
                description="",
                type=NodeSystemStateType.TEXT,
                value="",
            ),
            "summary": NodeSystemStateDefinition(
                name="摘要",
                description="",
                type=NodeSystemStateType.MARKDOWN,
                value="",
            ),
            "draft": NodeSystemStateDefinition(
                name="草稿",
                description="",
                type=NodeSystemStateType.TEXT,
                value="",
            ),
        }

        prompt = _build_auto_system_prompt(
            ["summary", "draft"],
            {"context": "先读这个", "question": "再读这个"},
            {},
            state_schema=state_schema,
        )

        self.assertLess(prompt.index("key: context"), prompt.index("key: question"))
        self.assertLess(prompt.index("key: summary"), prompt.index("key: draft"))
        self.assertLess(prompt.index('"summary": "..."'), prompt.index('"draft": "..."'))

    def test_llm_json_response_can_map_unique_state_name_alias_back_to_output_key(self) -> None:
        parsed = _parse_llm_json_response(
            '{"最终答案": "这是中文语义字段返回的内容"}',
            ["state_1"],
            output_key_aliases={"state_1": ["最终答案"]},
        )

        self.assertEqual(parsed, {"state_1": "这是中文语义字段返回的内容"})


if __name__ == "__main__":
    unittest.main()
