from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition, NodeSystemStateType


def _agent_node(*, writes: list[dict[str, str]], task_instruction: str = "") -> NodeSystemAgentNode:
    return NodeSystemAgentNode.model_validate(
        {
            "kind": "agent",
            "name": "writer",
            "ui": {"position": {"x": 0, "y": 0}},
            "writes": writes,
            "config": {"taskInstruction": task_instruction},
        }
    )


class AgentResponseGenerationTests(unittest.TestCase):
    def test_returns_empty_summary_without_output_bindings(self) -> None:
        runtime_config = {"resolved_provider_id": "local"}

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[]),
            {},
            {},
            runtime_config,
        )

        self.assertEqual(payload, {"summary": ""})
        self.assertEqual(reasoning, "")
        self.assertEqual(warnings, [])
        self.assertIs(updated_config, runtime_config)

    def test_routes_local_provider_with_fallback_thinking_level(self) -> None:
        captured: dict[str, object] = {}
        on_delta = object()

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "done"}', {"warnings": []})

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}]),
            {"question": "q"},
            {"search": {"context": "ctx"}},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
                "resolved_temperature": 0.7,
                "resolved_thinking": True,
                "resolved_model_ref": "local/test-model",
            },
            on_delta=on_delta,
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(payload, {"summary": '{"answer": "done"}', "answer": "done"})
        self.assertEqual(reasoning, "")
        self.assertEqual(warnings, [])
        self.assertEqual(captured["system_prompt"], "system prompt")
        self.assertEqual(captured["user_prompt"], "根据输入和技能结果完成输出。")
        self.assertEqual(captured["model"], "test-model")
        self.assertEqual(captured["provider_id"], "local")
        self.assertEqual(captured["temperature"], 0.7)
        self.assertEqual(captured["thinking_enabled"], True)
        self.assertEqual(captured["thinking_level"], "medium")
        self.assertIs(captured["on_delta"], on_delta)
        self.assertEqual(updated_config["provider_model"], "test-model")
        self.assertEqual(updated_config["provider_id"], "local")
        self.assertEqual(updated_config["provider_thinking_level"], "medium")

    def test_routes_image_inputs_as_model_attachments_without_prompting_base64(self) -> None:
        captured: dict[str, object] = {}
        image_payload = {
            "kind": "uploaded_file",
            "name": "reference.png",
            "mimeType": "image/png",
            "size": 42,
            "detectedType": "image",
            "encoding": "data_url",
            "content": "data:image/png;base64,AAAABBBB",
        }

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "ok"}', {"warnings": []})

        payload, _reasoning, warnings, _updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="描述图片。"),
            {"reference_image": image_payload},
            {},
            {
                "resolved_provider_id": "local",
                "runtime_model_name": "vision-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "resolved_model_ref": "local/vision-model",
            },
            state_schema={
                "reference_image": NodeSystemStateDefinition(
                    name="参考图片",
                    type=NodeSystemStateType.IMAGE,
                ),
                "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
            },
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        system_prompt = str(captured["system_prompt"])
        self.assertIn("reference.png", system_prompt)
        self.assertNotIn("data:image/png;base64", system_prompt)
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["type"], "image")
        self.assertEqual(attachments[0]["state_key"], "reference_image")
        self.assertEqual(attachments[0]["data_url"], image_payload["content"])

    def test_routes_configured_provider_and_captures_metadata(self) -> None:
        def chat_with_model_ref_with_meta_func(**kwargs):
            self.assertEqual(kwargs["model_ref"], "openai-codex/gpt-5.4")
            self.assertEqual(kwargs["thinking_level"], "off")
            return (
                '{"answer": "done"}',
                {
                    "reasoning": "because",
                    "warnings": ["warn"],
                    "model": "gpt-5.4",
                    "provider_id": "openai-codex",
                    "temperature": 0.1,
                    "reasoning_format": "summary",
                    "thinking_enabled": False,
                    "thinking_level": "off",
                    "response_id": "resp-1",
                    "usage": {"output_tokens": 5},
                    "timings": {"total_ms": 12},
                },
            )

        payload, reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="Answer."),
            {"question": "q"},
            {},
            {
                "resolved_provider_id": "openai-codex",
                "runtime_model_name": "gpt-5.4",
                "resolved_model_ref": "openai-codex/gpt-5.4",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
            },
            build_effective_system_prompt_func=lambda *args, **kwargs: "system prompt",
            chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "done"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(payload["answer"], "done")
        self.assertEqual(reasoning, "because")
        self.assertEqual(warnings, ["warn"])
        self.assertEqual(updated_config["provider_model"], "gpt-5.4")
        self.assertEqual(updated_config["provider_id"], "openai-codex")
        self.assertEqual(updated_config["provider_temperature"], 0.1)
        self.assertEqual(updated_config["provider_reasoning_format"], "summary")
        self.assertFalse(updated_config["provider_thinking_enabled"])
        self.assertEqual(updated_config["provider_response_id"], "resp-1")
        self.assertEqual(updated_config["provider_usage"], {"output_tokens": 5})
        self.assertEqual(updated_config["provider_timings"], {"total_ms": 12})


if __name__ == "__main__":
    unittest.main()
