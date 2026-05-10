from __future__ import annotations

import os
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.agent_prompt import build_auto_system_prompt
from app.core.runtime.llm_output_parser import parse_llm_json_response
from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType
from app.core.storage.skill_artifact_store import create_uploaded_skill_artifact, resolve_skill_artifact_path


class AgentStatePromptSemanticTests(unittest.TestCase):
    def test_auto_prompt_does_not_inject_runtime_date_context(self) -> None:
        prompt = build_auto_system_prompt(
            ["answer"],
            {"question": "帮我查最新模型发布日期"},
            {},
            state_schema={"answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT)},
        )

        self.assertNotIn("== Runtime Context ==", prompt)
        self.assertNotIn("current_date", prompt)
        self.assertNotIn("freshness_rule", prompt)

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
        self.assertIn("output_format: JSON value inside the JSON value", prompt)
        self.assertIn("不要把对象或数组再序列化成字符串", prompt)

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

    def test_auto_prompt_expands_file_states_to_filename_and_full_text(self) -> None:
        first_artifact = create_uploaded_skill_artifact(
            file_name="primary.md",
            content_type="text/markdown",
            payload=b"Primary evidence line one.\nPrimary evidence line two.",
        )
        second_artifact = create_uploaded_skill_artifact(
            file_name="secondary.md",
            content_type="text/markdown",
            payload=b"Secondary evidence body for the downstream summarizer.",
        )
        artifact_paths = [first_artifact["local_path"], second_artifact["local_path"]]
        try:
            prompt = build_auto_system_prompt(
                ["answer"],
                {
                    "primary_doc": first_artifact["local_path"],
                    "source_documents": [second_artifact["local_path"]],
                },
                {},
                state_schema={
                    "primary_doc": NodeSystemStateDefinition(
                        name="Primary document",
                        type=NodeSystemStateType.FILE,
                    ),
                    "source_documents": NodeSystemStateDefinition(
                        name="Source documents",
                        type=NodeSystemStateType.FILE,
                    ),
                    "answer": NodeSystemStateDefinition(type=NodeSystemStateType.MARKDOWN),
                },
            )

            self.assertIn("文件名：", prompt)
            self.assertIn(Path(first_artifact["local_path"]).name, prompt)
            self.assertIn(Path(second_artifact["local_path"]).name, prompt)
            self.assertIn("Primary evidence line one.\nPrimary evidence line two.", prompt)
            self.assertIn("Secondary evidence body for the downstream summarizer.", prompt)
            self.assertNotIn(first_artifact["local_path"], prompt)
            self.assertNotIn(second_artifact["local_path"], prompt)
            self.assertNotIn("uploads/", prompt)
        finally:
            for relative_path in artifact_paths:
                resolve_skill_artifact_path(relative_path).unlink(missing_ok=True)

    def test_auto_prompt_expands_selected_local_folder_files_to_full_text(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            folder = workspace / "buddy_home"
            folder.mkdir()
            (folder / "SOUL.md").write_text("Buddy identity line.", encoding="utf-8")
            (folder / "MEMORY.md").write_text("Durable memory line.", encoding="utf-8")
            (folder / "ignored.md").write_text("This file was not selected.", encoding="utf-8")

            with patch.dict(os.environ, {"TOOGRAPH_LOCAL_INPUT_READ_ROOTS": str(workspace)}):
                prompt = build_auto_system_prompt(
                    ["answer"],
                    {
                        "buddy_context": {
                            "kind": "local_folder",
                            "root": str(folder),
                            "selected": ["SOUL.md", "MEMORY.md"],
                        }
                    },
                    {},
                    state_schema={
                        "buddy_context": NodeSystemStateDefinition(
                            name="Buddy context",
                            type=NodeSystemStateType.FILE,
                        ),
                        "answer": NodeSystemStateDefinition(type=NodeSystemStateType.MARKDOWN),
                    },
                )

        self.assertIn("文件名：SOUL.md", prompt)
        self.assertIn("Buddy identity line.", prompt)
        self.assertIn("文件名：MEMORY.md", prompt)
        self.assertIn("Durable memory line.", prompt)
        self.assertNotIn("This file was not selected.", prompt)
        self.assertNotIn(str(folder), prompt)

    def test_auto_prompt_expands_result_package_outputs_as_virtual_states(self) -> None:
        artifact = create_uploaded_skill_artifact(
            file_name="search-source.md",
            content_type="text/markdown",
            payload=b"Original source paragraph from the downloaded page.",
        )
        try:
            prompt = build_auto_system_prompt(
                ["answer"],
                {
                    "dynamic_search_result": {
                        "kind": "result_package",
                        "sourceType": "skill",
                        "sourceKey": "web_search",
                        "sourceName": "联网搜索",
                        "status": "succeeded",
                        "inputs": {"query": "鸣潮 最新版本信息"},
                        "outputs": {
                            "source_urls": {
                                "name": "Source URLs",
                                "description": "搜索结果对应的原文网页 URL",
                                "type": "json",
                                "value": ["https://example.test/news"],
                            },
                            "artifact_paths": {
                                "name": "Artifact Paths",
                                "description": "搜索技能下载到本地的原文文档路径",
                                "type": "file",
                                "value": [artifact["local_path"]],
                            },
                        },
                    }
                },
                {},
                state_schema={
                    "dynamic_search_result": NodeSystemStateDefinition.model_validate(
                        {
                            "name": "动态能力运行结果",
                            "description": "动态选择的技能运行后得到的完整结果包",
                            "type": "result_package",
                        }
                    ),
                    "answer": NodeSystemStateDefinition(type=NodeSystemStateType.MARKDOWN),
                },
            )

            self.assertIn("sourceType: skill", prompt)
            self.assertIn("sourceKey: web_search", prompt)
            self.assertIn("sourceName: 联网搜索", prompt)
            self.assertIn("key: source_urls", prompt)
            self.assertIn("name: Source URLs", prompt)
            self.assertIn("https://example.test/news", prompt)
            self.assertIn("key: artifact_paths", prompt)
            self.assertIn("type: file", prompt)
            self.assertIn("文件名：", prompt)
            self.assertIn(Path(artifact["local_path"]).name, prompt)
            self.assertIn("Original source paragraph from the downloaded page.", prompt)
            self.assertNotIn(artifact["local_path"], prompt)
        finally:
            resolve_skill_artifact_path(artifact["local_path"]).unlink(missing_ok=True)

    def test_auto_prompt_does_not_read_media_paths_as_text_file_content(self) -> None:
        image_artifact = create_uploaded_skill_artifact(
            file_name="reference.png",
            content_type="image/png",
            payload=b"fake-png",
        )
        try:
            prompt = build_auto_system_prompt(
                ["answer"],
                {"attachments": [image_artifact["local_path"]]},
                {},
                state_schema={
                    "attachments": NodeSystemStateDefinition(
                        name="Attachments",
                        type=NodeSystemStateType.FILE,
                    ),
                    "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
                },
            )

            self.assertIn("reference.png", prompt)
            self.assertIn("image/png", prompt)
            self.assertIn("model attachment", prompt)
            self.assertNotIn("fake-png", prompt)
            self.assertNotIn(image_artifact["local_path"], prompt)
        finally:
            resolve_skill_artifact_path(image_artifact["local_path"]).unlink(missing_ok=True)

    def test_auto_prompt_does_not_leak_file_paths_when_file_state_cannot_be_read(self) -> None:
        missing_path = "uploads/missing-local-document.md"

        prompt = build_auto_system_prompt(
            ["answer"],
            {"primary_doc": missing_path},
            {},
            state_schema={
                "primary_doc": NodeSystemStateDefinition(
                    name="Primary document",
                    type=NodeSystemStateType.FILE,
                ),
                "answer": NodeSystemStateDefinition(type=NodeSystemStateType.MARKDOWN),
            },
        )

        self.assertIn("文件读取失败", prompt)
        self.assertNotIn(missing_path, prompt)
        self.assertNotIn("Skill artifact", prompt)

    def test_auto_prompt_describes_uploaded_image_without_leaking_local_path(self) -> None:
        image_payload = {
            "kind": "uploaded_file",
            "name": "reference.png",
            "mimeType": "image/png",
            "size": 42,
            "detectedType": "image",
            "encoding": "local_path",
            "localPath": "uploads/reference.png",
            "contentType": "image/png",
        }

        prompt = build_auto_system_prompt(
            ["answer"],
            {"reference_image": image_payload},
            {},
            state_schema={
                "reference_image": NodeSystemStateDefinition(
                    name="参考图片",
                    type=NodeSystemStateType.IMAGE,
                    value="",
                ),
                "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
            },
        )

        self.assertIn("reference.png", prompt)
        self.assertIn("image/png", prompt)
        self.assertIn("model attachment", prompt)
        self.assertNotIn("uploads/reference.png", prompt)

    def test_auto_prompt_describes_uploaded_video_without_leaking_local_path(self) -> None:
        video_payload = {
            "kind": "uploaded_file",
            "name": "clip.mp4",
            "mimeType": "video/mp4",
            "size": 64,
            "detectedType": "video",
            "encoding": "local_path",
            "localPath": "uploads/clip.mp4",
            "contentType": "video/mp4",
        }

        prompt = build_auto_system_prompt(
            ["answer"],
            {"clip": video_payload},
            {},
            state_schema={
                "clip": NodeSystemStateDefinition(
                    name="参考视频",
                    type=NodeSystemStateType.VIDEO,
                    value="",
                ),
                "answer": NodeSystemStateDefinition(type=NodeSystemStateType.TEXT),
            },
        )

        self.assertIn("clip.mp4", prompt)
        self.assertIn("video/mp4", prompt)
        self.assertIn("model attachment", prompt)
        self.assertNotIn("uploads/clip.mp4", prompt)

    def test_llm_json_response_can_map_unique_state_name_alias_back_to_output_key(self) -> None:
        parsed = parse_llm_json_response(
            '{"最终答案": "这是中文语义字段返回的内容"}',
            ["state_1"],
            output_key_aliases={"state_1": ["最终答案"]},
        )

        self.assertEqual(parsed, {"state_1": "这是中文语义字段返回的内容"})


if __name__ == "__main__":
    unittest.main()
