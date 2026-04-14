from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan, resolve_graph_runtime_backend
from app.core.langgraph.codegen import generate_langgraph_python_source
from app.core.langgraph.runtime import execute_node_system_graph_langgraph
from app.core.runtime.state import create_initial_run_state, set_run_status
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


def _load_conditional_edge_validation_graph() -> NodeSystemGraphPayload:
    template = NodeSystemTemplate.model_validate(load_template_record("conditional_edge_validation"))
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


_FAIL_ONCE_STATE = {"failed": False}


def _fake_generate_agent_response_fail_once(node, input_values, skill_context, runtime_config):
    if not _FAIL_ONCE_STATE["failed"]:
        _FAIL_ONCE_STATE["failed"] = True
        raise RuntimeError("forced once for checkpoint resume")
    return _fake_generate_agent_response(node, input_values, skill_context, runtime_config)


def _fake_generate_agent_response_increment(node, input_values, skill_context, runtime_config):
    _ = skill_context
    counter = int(input_values.get("counter") or 0) + 1
    outputs = {
        binding.state: counter
        for binding in node.writes
    }
    return outputs, "", [], runtime_config


def _fake_retrieve_knowledge_base_context(*, knowledge_base, query, limit=3):
    return {
        "knowledge_base": knowledge_base or "graphiteui-official",
        "query": query or "",
        "result_count": min(int(limit or 3), 1),
        "context": "stubbed knowledge context",
        "results": [
            {
                "title": "Stub Document",
                "section": "Overview",
                "summary": "Stub summary",
                "source": "stub://graphiteui",
                "url": "stub://graphiteui",
                "score": 1.0,
            }
        ],
        "citations": [
            {
                "index": 1,
                "title": "Stub Document",
                "section": "Overview",
                "source": "stub://graphiteui",
                "url": "stub://graphiteui",
            }
        ],
    }


def _build_cycle_graph() -> NodeSystemGraphPayload:
    return NodeSystemGraphPayload.model_validate(
        {
            "name": "Cycle Validation",
            "state_schema": {
                "counter": {
                    "name": "counter",
                    "description": "Counter for validating LangGraph cycle execution.",
                    "type": "number",
                    "value": 0,
                    "color": "#d97706",
                }
            },
            "nodes": {
                "seed_counter": {
                    "kind": "input",
                    "name": "seed_counter",
                    "description": "Seed counter value.",
                    "ui": {"position": {"x": 0, "y": 0}, "collapsed": False},
                    "writes": [{"state": "counter", "mode": "replace"}],
                    "config": {"value": 0},
                },
                "increment_counter": {
                    "kind": "agent",
                    "name": "increment_counter",
                    "description": "Increment the counter by one.",
                    "ui": {"position": {"x": 240, "y": 0}, "collapsed": False},
                    "reads": [{"state": "counter", "required": True}],
                    "writes": [{"state": "counter", "mode": "replace"}],
                    "config": {"skills": [], "systemInstruction": "", "taskInstruction": ""},
                },
                "continue_check": {
                    "kind": "condition",
                    "name": "continue_check",
                    "description": "Loop until the counter reaches three.",
                    "ui": {"position": {"x": 520, "y": 0}, "collapsed": False},
                    "reads": [{"state": "counter", "required": True}],
                    "config": {
                        "branches": ["continue", "stop"],
                        "conditionMode": "rule",
                        "branchMapping": {},
                        "rule": {"source": "counter", "operator": "<", "value": 3},
                    },
                },
                "output_counter": {
                    "kind": "output",
                    "name": "output_counter",
                    "description": "Show the final counter.",
                    "ui": {"position": {"x": 800, "y": 0}, "collapsed": False},
                    "reads": [{"state": "counter", "required": True}],
                    "config": {
                        "displayMode": "auto",
                        "persistEnabled": False,
                        "persistFormat": "auto",
                        "fileNameTemplate": "",
                    },
                },
            },
            "edges": [
                {
                    "source": "seed_counter",
                    "target": "increment_counter",
                    "sourceHandle": "write:counter",
                    "targetHandle": "read:counter",
                },
                {
                    "source": "increment_counter",
                    "target": "continue_check",
                    "sourceHandle": "write:counter",
                    "targetHandle": "read:counter",
                },
            ],
            "conditional_edges": [
                {
                    "source": "continue_check",
                    "branches": {
                        "continue": "increment_counter",
                        "stop": "output_counter",
                    },
                }
            ],
            "metadata": {
                "cycle_max_iterations": 5,
            },
        }
    )


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

    def test_cycle_graph_resolves_langgraph_backend(self):
        graph = _build_cycle_graph()
        backend, reasons = resolve_graph_runtime_backend(graph)
        self.assertEqual(backend, "langgraph")
        self.assertEqual(reasons, [])

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
        self.assertTrue(result["lifecycle"]["updated_at"])
        self.assertEqual(result["checkpoint_metadata"]["available"], True)
        self.assertTrue(result["checkpoint_metadata"]["checkpoint_id"])
        self.assertEqual(result["checkpoint_metadata"]["thread_id"], result["run_id"])
        self.assertEqual(len(result["node_executions"]), 3)
        self.assertEqual(result["cycle_summary"]["has_cycle"], False)
        self.assertIn("output_answer", {item["node_id"] for item in result["node_executions"]})
        self.assertIn("answer", result["state_snapshot"]["values"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_fail_once)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_resume_from_checkpoint_after_failure(self):
        _FAIL_ONCE_STATE["failed"] = False
        graph = _load_hello_world_graph()
        initial_state = create_initial_run_state(
            graph_id=graph.graph_id or "test_graph",
            graph_name=graph.name,
            max_revision_round=1,
        )

        with self.assertRaises(RuntimeError):
            execute_node_system_graph_langgraph(graph, initial_state=initial_state, persist_progress=False)

        self.assertEqual(initial_state["status"], "failed")
        self.assertTrue(initial_state["checkpoint_metadata"]["available"])
        self.assertTrue(initial_state["checkpoint_metadata"]["checkpoint_id"])

        resumed_state = create_initial_run_state(
            graph_id=graph.graph_id or "test_graph",
            graph_name=graph.name,
            max_revision_round=1,
        )
        resumed_state["checkpoint_metadata"] = dict(initial_state["checkpoint_metadata"])
        resumed_state["metadata"] = {"resolved_runtime_backend": "langgraph"}
        set_run_status(resumed_state, "resuming", resumed_from_run_id=initial_state["run_id"])

        result = execute_node_system_graph_langgraph(
            graph,
            initial_state=resumed_state,
            persist_progress=False,
            resume_from_checkpoint=True,
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["lifecycle"]["resume_count"], 1)
        self.assertEqual(result["lifecycle"]["resumed_from_run_id"], initial_state["run_id"])
        self.assertIn("answer", result["state_snapshot"]["values"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_interrupt_before_waits_for_human(self):
        graph = _load_hello_world_graph()
        payload = graph.model_dump(by_alias=True)
        payload["metadata"] = {"interrupt_before": ["answer_helper"]}
        interrupt_graph = NodeSystemGraphPayload.model_validate(payload)

        result = execute_node_system_graph_langgraph(interrupt_graph, persist_progress=False)

        self.assertEqual(result["status"], "awaiting_human")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["current_node_id"], "answer_helper")
        self.assertEqual(result["lifecycle"]["pause_reason"], "breakpoint")
        self.assertTrue(result["checkpoint_metadata"]["available"])
        self.assertEqual(result["state_snapshot"]["values"]["question"], "什么是 GraphiteUI？")
        self.assertEqual(result["metadata"]["pending_interrupt_nodes"], ["answer_helper"])
        self.assertEqual(result["metadata"]["pending_interrupts"], [])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_interrupt_resume_accepts_human_state_updates(self):
        graph = _load_hello_world_graph()
        payload = graph.model_dump(by_alias=True)
        payload["metadata"] = {"interrupt_before": ["answer_helper"]}
        interrupt_graph = NodeSystemGraphPayload.model_validate(payload)

        interrupted = execute_node_system_graph_langgraph(interrupt_graph, persist_progress=False)
        self.assertEqual(interrupted["status"], "awaiting_human")

        resumed_state = create_initial_run_state(
            graph_id=interrupt_graph.graph_id or "test_graph",
            graph_name=interrupt_graph.name,
            max_revision_round=1,
        )
        resumed_state["checkpoint_metadata"] = dict(interrupted["checkpoint_metadata"])
        resumed_state["metadata"] = {"resolved_runtime_backend": "langgraph"}
        set_run_status(resumed_state, "resuming", resumed_from_run_id=interrupted["run_id"])

        result = execute_node_system_graph_langgraph(
            interrupt_graph,
            initial_state=resumed_state,
            persist_progress=False,
            resume_from_checkpoint=True,
            resume_command={"question": "人工确认后的问题"},
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["lifecycle"]["resume_count"], 1)
        self.assertEqual(result["lifecycle"]["resumed_from_run_id"], interrupted["run_id"])
        self.assertEqual(result["state_snapshot"]["values"]["question"], "人工确认后的问题")
        self.assertEqual(result["state_snapshot"]["values"]["answer"], "answer_helper:人工确认后的问题")
        self.assertNotIn("pending_interrupt_nodes", result.get("metadata", {}))

    def test_knowledge_base_validation_template_still_valid(self):
        graph = _load_knowledge_base_validation_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_conditional_edge_validation_template_still_valid(self):
        graph = _load_conditional_edge_validation_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_knowledge_base_validation_resolves_langgraph_backend(self):
        graph = _load_knowledge_base_validation_graph()
        backend, reasons = resolve_graph_runtime_backend(graph)
        self.assertEqual(backend, "langgraph")
        self.assertEqual(reasons, [])

    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_exported_langgraph_python_source_is_executable(self):
        graph = _load_hello_world_graph()
        source = generate_langgraph_python_source(graph)
        self.assertIn("def build_graph()", source)
        self.assertIn("def invoke_graph", source)

        namespace: dict[str, object] = {}
        exec(source, namespace, namespace)
        result = namespace["invoke_graph"]()
        self.assertIn("answer", result)

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_cycle_runtime(self):
        graph = _build_cycle_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["state_snapshot"]["values"]["counter"], 3)
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["cycle_summary"]["max_iterations"], 5)
        self.assertEqual(result["cycle_summary"]["stop_reason"], "completed")
        self.assertEqual(len(result["cycle_iterations"]), 3)
        self.assertEqual(result["cycle_iterations"][0]["stop_reason"], None)
        self.assertEqual(result["cycle_iterations"][-1]["stop_reason"], "completed")

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor.retrieve_knowledge_base_context", _fake_retrieve_knowledge_base_context)
    def test_knowledge_base_validation_langgraph_runtime(self):
        graph = _load_knowledge_base_validation_graph()
        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(len(result["node_executions"]), 6)
        self.assertIn("search_knowledge_base", result["selected_skills"])
        self.assertEqual(len(result["skill_outputs"]), 2)
        self.assertTrue(result["knowledge_summary"])
        self.assertIn("raw_answer", result["state_snapshot"]["values"])
        self.assertIn("formatted_answer", result["state_snapshot"]["values"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    def test_conditional_edge_validation_langgraph_runtime(self):
        graph = _load_conditional_edge_validation_graph()
        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["final_result"], "通过分支命中：score >= 60")
        self.assertEqual(result["state_snapshot"]["values"]["score"], 80)
        self.assertIn("output_pass", {item["node_id"] for item in result["node_executions"]})
        self.assertNotIn("output_fail", {item["node_id"] for item in result["node_executions"]})
