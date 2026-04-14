from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan, resolve_graph_runtime_backend
from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.runtime.node_system_executor import execute_node_system_graph
from app.core.schemas.node_system import NodeSystemGraphPayload, NodeSystemTemplate
from app.templates.loader import load_template_record


def _load_hello_world_graph() -> NodeSystemGraphPayload:
    template = NodeSystemTemplate.model_validate(load_template_record("hello_world"))
    return NodeSystemGraphPayload.model_validate(
        {
            "name": template.default_graph_name,
            "state_schema": template.state_schema,
            "nodes": template.nodes,
            "edges": template.edges,
            "conditional_edges": template.conditional_edges,
            "metadata": template.metadata,
        }
    )


def _load_knowledge_base_validation_graph() -> NodeSystemGraphPayload:
    template = NodeSystemTemplate.model_validate(load_template_record("knowledge_base_validation"))
    return NodeSystemGraphPayload.model_validate(
        {
            "name": template.default_graph_name,
            "state_schema": template.state_schema,
            "nodes": template.nodes,
            "edges": template.edges,
            "conditional_edges": template.conditional_edges,
            "metadata": template.metadata,
        }
    )


def _fake_skill_registry(*, include_disabled: bool = False):
    _ = include_disabled
    return {"search_knowledge_base": object()}


def _fake_invoke_skill(skill_func, skill_inputs):
    _ = skill_func
    return {
        "knowledge_base": skill_inputs.get("knowledge_base"),
        "query": skill_inputs.get("query"),
        "context": "stubbed knowledge context",
        "results": [{"title": "Stub Document"}],
        "citations": [{"title": "Stub Document"}],
    }


def _fake_generate_agent_response(node, input_values, skill_context, runtime_config):
    _ = skill_context
    outputs = {
        binding.state: f"{node.name}:{input_values.get('question', '')}".strip(":")
        for binding in node.writes
    }
    return outputs, "", [], runtime_config


class LangGraphMigrationTests(unittest.TestCase):
    def test_hello_world_validate_baseline(self):
        graph = _load_hello_world_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_hello_world_build_plan(self):
        graph = _load_hello_world_graph()
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(plan.name, "Hello World")
        self.assertEqual(set(plan.requirements.entry_nodes), {"input_question"})
        self.assertEqual(set(plan.requirements.terminal_nodes), {"output_answer"})
        self.assertEqual(plan.requirements.skill_keys, [])
        self.assertEqual(plan.requirements.unsupported_reasons, [])

    def test_hello_world_resolves_langgraph_backend_without_template_flag(self):
        graph = _load_hello_world_graph()
        graph.metadata.pop("runtime_backend", None)
        backend, reasons = resolve_graph_runtime_backend(graph)
        self.assertEqual(backend, "langgraph")
        self.assertEqual(reasons, [])

    def test_conditional_graph_resolves_legacy_backend(self):
        graph = _load_hello_world_graph()
        payload = graph.model_dump(by_alias=True)
        payload["conditional_edges"] = [
            {
                "source": "answer_helper",
                "branches": {
                    "done": "output_answer",
                },
            }
        ]
        conditional_graph = NodeSystemGraphPayload.model_validate(payload)
        backend, reasons = resolve_graph_runtime_backend(conditional_graph)
        self.assertEqual(backend, "legacy")
        self.assertTrue(any("conditional_edges" in reason for reason in reasons), reasons)

    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_hello_world_custom_executor_baseline(self):
        graph = _load_hello_world_graph()
        result = execute_node_system_graph(graph, persist_progress=False)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "legacy")
        self.assertEqual(len(result["node_executions"]), 3)
        self.assertIn("answer", result["state_snapshot"]["values"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_hello_world_langgraph_runtime(self):
        graph = _load_hello_world_graph()
        result = execute_node_system_graph_langgraph(graph, persist_progress=False)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(len(result["node_executions"]), 3)
        self.assertEqual(result["cycle_summary"]["has_cycle"], False)
        self.assertIn("output_answer", {item["node_id"] for item in result["node_executions"]})
        self.assertIn("answer", result["state_snapshot"]["values"])

    def test_knowledge_base_validation_template_still_valid(self):
        graph = _load_knowledge_base_validation_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())
