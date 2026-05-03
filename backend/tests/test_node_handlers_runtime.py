from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.node_handlers import (
    execute_agent_node,
    execute_condition_node,
    execute_input_node,
)
from app.core.runtime.skill_invocation import callable_accepts_keyword
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemConditionNode, NodeSystemInputNode, NodeSystemStateDefinition


class NodeHandlersRuntimeTests(unittest.TestCase):
    def test_execute_input_node_coerces_outputs_and_final_result(self) -> None:
        state_schema = {
            "payload": NodeSystemStateDefinition.model_validate({"type": "json", "value": '{"ok": true}'}),
            "title": NodeSystemStateDefinition.model_validate({"type": "text", "value": "Hello"}),
        }
        node = NodeSystemInputNode.model_validate(
            {
                "kind": "input",
                "ui": {"position": {"x": 0, "y": 0}},
                "writes": [{"state": "payload"}, {"state": "title"}],
            }
        )

        result = execute_input_node(
            state_schema,
            node,
            {},
            coerce_input_boundary_value_func=lambda value, value_type: {"coerced": value_type.value}
            if value_type.value == "json"
            else value,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["outputs"], {"payload": {"coerced": "json"}, "title": "Hello"})
        self.assertEqual(result["final_result"], "{'coerced': 'json'}")

    def test_execute_condition_node_resolves_branch_or_raises(self) -> None:
        node = NodeSystemConditionNode.model_validate(
            {
                "kind": "condition",
                "ui": {"position": {"x": 0, "y": 0}},
                "config": {
                    "branches": ["yes"],
                    "rule": {"source": "$state.answer", "operator": "==", "value": "ok"},
                },
            }
        )

        result = execute_condition_node(
            node,
            {"answer": "input"},
            {"state": {"answer": "ok"}},
            resolve_condition_source_func=lambda source, *, inputs, graph, state_values: state_values["answer"],
            evaluate_condition_rule_func=lambda actual, operator, expected: actual == expected,
            resolve_branch_key_func=lambda branches, branch_mapping, condition_result: branches[0]
            if condition_result
            else None,
        )

        self.assertEqual(result, {"outputs": {"yes": True}, "selected_branch": "yes", "final_result": "yes"})

        with self.assertRaisesRegex(ValueError, "could not resolve"):
            execute_condition_node(
                node,
                {},
                {"state": {}},
                resolve_condition_source_func=lambda source, *, inputs, graph, state_values: None,
                evaluate_condition_rule_func=lambda actual, operator, expected: False,
                resolve_branch_key_func=lambda branches, branch_mapping, condition_result: None,
            )

    def test_execute_agent_node_invokes_skills_streaming_and_generation(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [{"state": "answer"}],
                "config": {"skills": ["custom"]},
            }
        )
        finalized: dict[str, object] = {}

        result = execute_agent_node(
            state_schema,
            node,
            {"question": "q"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {"custom": object()},
            invoke_skill_func=lambda skill_func, skill_inputs: {"echo": skill_inputs["question"]},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: keyword in {"on_delta", "state_schema"},
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": "value", "summary": "summary"},
                "reason",
                ["warn", "warn"],
                {"runtime": "updated", "kwargs": kwargs},
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: finalized.update(output_values),
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["outputs"], {"answer": "value"})
        self.assertEqual(result["reasoning"], "reason")
        self.assertEqual(result["selected_skills"], ["custom"])
        self.assertEqual(result["skill_outputs"][0]["inputs"], {"question": "q"})
        self.assertEqual(result["skill_outputs"][0]["outputs"], {"echo": "q"})
        self.assertEqual(result["runtime_config"]["runtime"], "updated")
        self.assertEqual(result["runtime_config"]["kwargs"]["on_delta"], "delta")
        self.assertEqual(result["runtime_config"]["kwargs"]["state_schema"], state_schema)
        self.assertEqual(result["warnings"], ["warn"])
        self.assertEqual(result["final_result"], "value")
        self.assertEqual(finalized, {"answer": "value"})

    def test_execute_agent_node_treats_knowledge_base_state_as_normal_skill_input(self) -> None:
        state_schema = {
            "kb": NodeSystemStateDefinition.model_validate({"type": "knowledge_base"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "kb"}, {"state": "question"}],
                "writes": [{"state": "answer"}],
                "config": {"skills": ["custom_retrieval"]},
            }
        )

        result = execute_agent_node(
            state_schema,
            node,
            {"kb": "docs", "question": "q"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {"custom_retrieval": object()},
            invoke_skill_func=lambda skill_func, skill_inputs: {"context": skill_inputs["question"]},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": skill_context["custom_retrieval"]["context"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["skill_outputs"][0]["inputs"], {"kb": "docs", "question": "q"})
        self.assertEqual(result["outputs"], {"answer": "q"})

    def test_execute_agent_node_maps_bound_skill_outputs_into_state_outputs(self) -> None:
        state_schema = {
            "source_text": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "summary_text": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "source_text"}],
                "writes": [{"state": "answer"}],
                "config": {
                    "skills": ["summarize_text"],
                    "skillBindings": [
                        {
                            "skillKey": "summarize_text",
                            "inputMapping": {"text": "source_text"},
                            "outputMapping": {"summary": "summary_text"},
                            "config": {"max_sentences": 2},
                        }
                    ],
                },
            }
        )

        result = execute_agent_node(
            state_schema,
            node,
            {"source_text": "Long text"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {
                "summarize_text": object(),
            },
            invoke_skill_func=lambda skill_func, skill_inputs: {
                "summary": f"{skill_inputs['text']} / {skill_inputs['max_sentences']}",
                "key_points": ["one"],
            },
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": f"Final using {skill_context['summarize_text']['summary']}"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(
            result["outputs"],
            {
                "summary_text": "Long text / 2",
                "answer": "Final using Long text / 2",
            },
        )
        self.assertEqual(result["skill_outputs"][0]["inputs"], {"text": "Long text", "max_sentences": 2})
        self.assertEqual(result["skill_outputs"][0]["output_mapping"], {"summary": "summary_text"})
        self.assertEqual(result["skill_outputs"][0]["state_writes"], {"summary_text": "Long text / 2"})
        self.assertEqual(result["skill_outputs"][0]["status"], "succeeded")

    def test_execute_agent_node_preserves_mapped_skill_output_when_response_omits_that_state(self) -> None:
        state_schema = {
            "query": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "search_report": NodeSystemStateDefinition.model_validate({"type": "markdown"}),
            "source_documents": NodeSystemStateDefinition.model_validate({"type": "json"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "web_search_agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "query"}],
                "writes": [{"state": "search_report"}, {"state": "source_documents"}],
                "config": {
                    "skills": ["web_search"],
                    "skillBindings": [
                        {
                            "skillKey": "web_search",
                            "inputMapping": {"query": "query"},
                            "outputMapping": {"source_documents": "source_documents"},
                        }
                    ],
                },
            }
        )
        source_documents = [
            {
                "title": "Article",
                "url": "https://example.com/article",
                "local_path": "run_1/web_search/doc_001.md",
            }
        ]

        result = execute_agent_node(
            state_schema,
            node,
            {"query": "GraphiteUI"},
            {"state": {}},
            node_name="web_search_agent",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {"web_search": object()},
            invoke_skill_func=lambda skill_func, skill_inputs: {
                "status": "succeeded",
                "source_documents": source_documents,
            },
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"search_report": "report"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["outputs"]["search_report"], "report")
        self.assertEqual(result["outputs"]["source_documents"], source_documents)

    def test_execute_agent_node_does_not_special_case_web_search_inputs(self) -> None:
        state_schema = {
            "name": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "name"}],
                "writes": [{"state": "answer"}],
                "config": {
                    "skills": ["web_search"],
                    "taskInstruction": "联网搜索，告知今天的日期和北京天气",
                },
            }
        )
        captured_inputs: dict[str, object] = {}

        result = execute_agent_node(
            state_schema,
            node,
            {"name": "GraphiteUI 用户"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            invoke_skill_func=lambda skill_func, skill_inputs: captured_inputs.update(skill_inputs)
            or {"status": "succeeded", "summary": "联网结果", "context": "联网上下文"},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": skill_context["web_search"]["summary"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_inputs, {"name": "GraphiteUI 用户"})
        self.assertEqual(result["skill_outputs"][0]["inputs"], {"name": "GraphiteUI 用户"})
        self.assertEqual(result["outputs"]["answer"], "联网结果")

    def test_execute_agent_node_keeps_bound_skill_inputs_unchanged(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [{"state": "answer"}],
                "config": {
                    "skills": ["web_search"],
                    "skillBindings": [
                        {
                            "skillKey": "web_search",
                            "inputMapping": {"query": "question"},
                        }
                    ],
                },
            }
        )
        captured_inputs: dict[str, object] = {}

        result = execute_agent_node(
            state_schema,
            node,
            {"question": "最新模型发布日期"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            invoke_skill_func=lambda skill_func, skill_inputs: captured_inputs.update(skill_inputs)
            or {"status": "succeeded", "summary": "联网结果", "context": "联网上下文"},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": skill_context["web_search"]["summary"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_inputs["query"], "最新模型发布日期")
        self.assertEqual(result["skill_outputs"][0]["inputs"]["query"], "最新模型发布日期")

    def test_execute_agent_node_passes_skill_artifact_invocation_context(self) -> None:
        state_schema = {
            "query": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "searcher",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "query"}],
                "writes": [{"state": "answer"}],
                "config": {
                    "skills": ["web_search"],
                    "skillBindings": [
                        {
                            "skillKey": "web_search",
                            "inputMapping": {"query": "query"},
                        }
                    ],
                },
            }
        )
        captured_contexts: list[dict[str, object]] = []

        result = execute_agent_node(
            state_schema,
            node,
            {"query": "GraphiteUI"},
            {"state": {}},
            node_name="searcher",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            invoke_skill_func=lambda skill_func, skill_inputs, *, context=None: captured_contexts.append(context or {})
            or {"status": "succeeded", "summary": "联网结果"},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=callable_accepts_keyword,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": skill_context["web_search"]["summary"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["outputs"]["answer"], "联网结果")
        self.assertEqual(len(captured_contexts), 1)
        context = captured_contexts[0]
        self.assertEqual(context["run_id"], "run-1")
        self.assertEqual(context["node_id"], "searcher")
        self.assertEqual(context["skill_key"], "web_search")
        self.assertTrue(str(context["artifact_relative_dir"]).startswith("run-1/searcher/web_search/invocation_001"))

    def test_execute_agent_node_surfaces_failed_skill_result_status(self) -> None:
        state_schema = {
            "name": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "name"}],
                "writes": [{"state": "answer"}],
                "config": {"skills": ["web_search"]},
            }
        )

        result = execute_agent_node(
            state_schema,
            node,
            {"name": "GraphiteUI 用户"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_skill_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            invoke_skill_func=lambda skill_func, skill_inputs: {
                "status": "failed",
                "error": "Search query is required.",
            },
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, skill_context, runtime_config, **kwargs: (
                {"answer": "fallback"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["skill_outputs"][0]["status"], "failed")
        self.assertEqual(result["skill_outputs"][0]["error"], "Search query is required.")
        self.assertIn("Skill 'web_search' failed: Search query is required.", result["warnings"])


if __name__ == "__main__":
    unittest.main()
