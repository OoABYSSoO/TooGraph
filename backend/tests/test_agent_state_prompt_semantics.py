from __future__ import annotations

from datetime import datetime, timezone
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_prompt import build_auto_system_prompt
from app.core.runtime.llm_output_parser import parse_llm_json_response
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType


class AgentStatePromptSemanticTests(unittest.TestCase):
    def test_auto_prompt_includes_runtime_date_context_for_time_sensitive_work(self) -> None:
        prompt = build_auto_system_prompt(
            ["answer"],
            {"question": "帮我查最新模型发布日期"},
            {},
            state_schema={"answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT)},
            now=datetime(2026, 5, 1, 13, 28, 44, tzinfo=timezone.utc),
        )

        self.assertIn("== Runtime Context ==", prompt)
        self.assertIn("current_date: 2026-05-01", prompt)
        self.assertIn("current_year: 2026", prompt)
        self.assertIn("current_weekday: Friday", prompt)
        self.assertIn("把 current_date 作为“今天、最新、当前、最近、发布日期、价格、新闻、版本”等问题的时间锚点", prompt)

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

        prompt = build_auto_system_prompt(
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
        self.assertIn('"state_1": "在此填写完整内容"', prompt)

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

        prompt = build_auto_system_prompt(
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

        prompt = build_auto_system_prompt(
            ["summary", "draft"],
            {"context": "先读这个", "question": "再读这个"},
            {},
            state_schema=state_schema,
        )

        self.assertLess(prompt.index("key: context"), prompt.index("key: question"))
        self.assertLess(prompt.index("key: summary"), prompt.index("key: draft"))
        self.assertLess(
            prompt.index('"summary": "在此填写完整内容"'),
            prompt.index('"draft": "在此填写完整内容"'),
        )

    def test_auto_prompt_requires_fact_answers_to_stay_grounded_in_skill_results(self) -> None:
        prompt = build_auto_system_prompt(
            ["answer"],
            {"question": "今天的日期是什么？"},
            {
                "web_search": {
                    "status": "succeeded",
                    "searched_date": "2026-05-01",
                    "summary": "搜索摘要",
                }
            },
            state_schema={"answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT)},
        )

        self.assertIn("涉及事实、日期、天气、新闻或外部资料时，必须以技能结果为依据", prompt)
        self.assertIn("不要编造技能结果中不存在的事实", prompt)
        self.assertIn("searched_date: 2026-05-01", prompt)

    def test_auto_prompt_preserves_complete_web_search_context(self) -> None:
        full_url = "https://www.cnbc.com/2026/04/23/openai-announces-latest-artificial-intelligence-model.html"
        long_context = (
            "Search executed at: 2026-05-01T21:28:44+08:00\n"
            + "Evidence prefix. " * 40
            + "\n[2] OpenAI announces GPT-5.5, its latest artificial intelligence model - CNBC\n"
            + f"URL: {full_url}\n"
            + "OpenAI on Thursday announced its latest artificial intelligence model, GPT-5.5."
        )

        prompt = build_auto_system_prompt(
            ["answer"],
            {"search_result": long_context},
            {"web_search": {"context": long_context}},
            state_schema={"answer": NodeSystemStateDefinition(type=NodeSystemStateType.MARKDOWN)},
        )

        self.assertIn(long_context, prompt)
        self.assertIn(full_url, prompt)
        self.assertIn("引用链接必须完整复制 URL", prompt)

    def test_llm_json_response_can_map_unique_state_name_alias_back_to_output_key(self) -> None:
        parsed = parse_llm_json_response(
            '{"最终答案": "这是中文语义字段返回的内容"}',
            ["state_1"],
            output_key_aliases={"state_1": ["最终答案"]},
        )

        self.assertEqual(parsed, {"state_1": "这是中文语义字段返回的内容"})


if __name__ == "__main__":
    unittest.main()
