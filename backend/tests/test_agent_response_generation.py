from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
        self.assertNotIn("data_url", attachments[0])
        self.assertTrue(str(attachments[0]["file_url"]).startswith("file://"))

    def test_routes_video_inputs_as_model_attachments_without_prompting_base64(self) -> None:
        captured: dict[str, object] = {}
        video_payload = {
            "kind": "uploaded_file",
            "name": "clip.mp4",
            "mimeType": "video/mp4",
            "size": 64,
            "detectedType": "video",
            "encoding": "data_url",
            "content": "data:video/mp4;base64,CCCCDDDD",
        }

        def chat_with_local_model_with_meta_func(**kwargs):
            captured.update(kwargs)
            return ('{"answer": "ok"}', {"warnings": []})

        payload, _reasoning, warnings, _updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="描述视频。"),
            {"clip": video_payload},
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
                "clip": NodeSystemStateDefinition(
                    name="参考视频",
                    type=NodeSystemStateType.VIDEO,
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
        self.assertIn("clip.mp4", system_prompt)
        self.assertNotIn("data:video/mp4;base64", system_prompt)
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 1)
        self.assertEqual(attachments[0]["type"], "video")
        self.assertEqual(attachments[0]["state_key"], "clip")
        self.assertNotIn("data_url", attachments[0])
        self.assertTrue(str(attachments[0]["file_url"]).startswith("file://"))

    def test_routes_skill_artifact_media_references_as_model_attachments(self) -> None:
        captured: dict[str, object] = {}

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "skill_artifacts"
            image_path = artifact_root / "run_1" / "download" / "image.png"
            video_path = artifact_root / "run_1" / "download" / "clip.mp4"
            image_path.parent.mkdir(parents=True)
            image_path.write_bytes(b"fake-png")
            video_path.write_bytes(b"fake-mp4")

            def chat_with_local_model_with_meta_func(**kwargs):
                captured.update(kwargs)
                return ('{"answer": "ok"}', {"warnings": []})

            with patch("app.core.storage.skill_artifact_store.SKILL_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="分析这些素材。"),
                    {
                        "downloaded_files": [
                            {
                                "filename": "image.png",
                                "local_path": "run_1/download/image.png",
                                "content_type": "image/png",
                            },
                            {
                                "filename": "clip.mp4",
                                "local_path": "run_1/download/clip.mp4",
                                "content_type": "video/mp4",
                            },
                        ]
                    },
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
                        "downloaded_files": NodeSystemStateDefinition(
                            name="下载素材",
                            type=NodeSystemStateType.ARRAY,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        attachments = captured["input_attachments"]
        self.assertEqual(len(attachments), 2)
        self.assertEqual(attachments[0]["type"], "image")
        self.assertEqual(attachments[0]["state_key"], "downloaded_files")
        self.assertEqual(attachments[0]["name"], "image.png")
        self.assertNotIn("data_url", attachments[0])
        self.assertEqual(attachments[0]["file_url"], image_path.resolve().as_uri())
        self.assertEqual(attachments[1]["type"], "video")
        self.assertEqual(attachments[1]["state_key"], "downloaded_files")
        self.assertEqual(attachments[1]["name"], "clip.mp4")
        self.assertNotIn("data_url", attachments[1])
        self.assertEqual(attachments[1]["file_url"], video_path.resolve().as_uri())

    def test_does_not_route_skill_result_artifacts_as_model_attachments(self) -> None:
        captured: dict[str, object] = {}

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_root = Path(temp_dir) / "skill_artifacts"
            video_path = artifact_root / "run_1" / "collector" / "videos" / "clip.mp4"
            video_path.parent.mkdir(parents=True)
            video_path.write_bytes(b"fake-mp4")

            def chat_with_local_model_with_meta_func(**kwargs):
                captured.update(kwargs)
                return ('{"answer": "ok"}', {"warnings": []})

            with patch("app.core.storage.skill_artifact_store.SKILL_ARTIFACT_DATA_DIR", artifact_root):
                payload, _reasoning, warnings, _updated_config = generate_agent_response(
                    _agent_node(writes=[{"state": "answer"}], task_instruction="整理技能结果。"),
                    {"genre": "SLG"},
                    {
                        "game_ad_research_collector": {
                            "downloaded_files": [
                                {
                                    "filename": "clip.mp4",
                                    "local_path": "run_1/collector/videos/clip.mp4",
                                    "content_type": "video/mp4",
                                }
                            ]
                        }
                    },
                    {
                        "resolved_provider_id": "local",
                        "runtime_model_name": "text-model",
                        "resolved_temperature": 0.2,
                        "resolved_thinking": False,
                        "resolved_thinking_level": "off",
                        "resolved_model_ref": "local/text-model",
                    },
                    state_schema={
                        "genre": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                    },
                    chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                    parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
                    build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
                )

        self.assertEqual(payload["answer"], "ok")
        self.assertEqual(warnings, [])
        self.assertEqual(captured["input_attachments"], [])

    def test_global_agent_uses_default_video_model_when_media_attachments_are_present(self) -> None:
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

        _payload, _reasoning, warnings, updated_config = generate_agent_response(
            _agent_node(writes=[{"state": "answer"}], task_instruction="描述图片。"),
            {"reference_image": image_payload},
            {},
            {
                "model_source": "global",
                "resolved_provider_id": "local",
                "runtime_model_name": "text-model",
                "resolved_temperature": 0.2,
                "resolved_thinking": False,
                "resolved_thinking_level": "off",
                "configured_thinking_level": "off",
                "resolved_model_ref": "local/text-model",
            },
            state_schema={
                "reference_image": NodeSystemStateDefinition(
                    name="参考图片",
                    type=NodeSystemStateType.IMAGE,
                ),
                "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
            },
            chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
            get_default_video_model_ref_func=lambda *, force_refresh: "local/video-model",
            resolve_runtime_model_name_func=lambda model_ref: model_ref.split("/", 1)[1],
            parse_llm_json_response_func=lambda content, output_keys, *, output_key_aliases: {"answer": "ok"},
            build_output_key_aliases_func=lambda output_keys, state_schema: {"answer": ["answer"]},
        )

        self.assertEqual(warnings, [])
        self.assertEqual(captured["model"], "video-model")
        self.assertEqual(updated_config["resolved_model_ref"], "local/video-model")
        self.assertEqual(updated_config["runtime_model_name"], "video-model")
        self.assertEqual(updated_config["media_model_ref"], "local/video-model")

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
                    "video_fallback": {"used": True, "frame_count": 1},
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
        self.assertEqual(updated_config["provider_video_fallback"], {"used": True, "frame_count": 1})


if __name__ == "__main__":
    unittest.main()
