from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan, get_langgraph_runtime_unsupported_reasons
from app.core.langgraph.codegen import (
    _build_export_graph_payload,
    generate_langgraph_python_source,
    import_graph_payload_from_python_source,
)
from app.core.langgraph.runtime import _finalize_langgraph_cycle_summary, execute_node_system_graph_langgraph
from app.core.runtime import node_system_executor
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


def _load_cycle_counter_demo_graph() -> NodeSystemGraphPayload:
    template = NodeSystemTemplate.model_validate(load_template_record("cycle_counter_demo"))
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


def _load_human_review_demo_graph() -> NodeSystemGraphPayload:
    template = NodeSystemTemplate.model_validate(load_template_record("human_review_demo"))
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


def _load_web_research_loop_graph() -> NodeSystemGraphPayload:
    template = NodeSystemTemplate.model_validate(load_template_record("web_research_loop"))
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
    return {"web_search": object()}


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
    primary_value = input_values.get("question")
    if primary_value is None and input_values:
        primary_value = next(iter(input_values.values()))
    outputs = {
        binding.state: f"{node.name}:{primary_value or ''}".strip(":")
        for binding in node.writes
    }
    return outputs, "", [], runtime_config


def _state_key_by_name(graph: NodeSystemGraphPayload, state_name: str) -> str:
    for state_key, definition in graph.state_schema.items():
        if definition.name == state_name:
            return state_key
    raise AssertionError(f"State named {state_name!r} not found")


_FAIL_ONCE_STATE = {"failed": False}


def _fake_generate_agent_response_fail_once(node, input_values, skill_context, runtime_config):
    if not _FAIL_ONCE_STATE["failed"]:
        _FAIL_ONCE_STATE["failed"] = True
        raise RuntimeError("forced once for checkpoint resume")
    return _fake_generate_agent_response(node, input_values, skill_context, runtime_config)


def _fake_generate_agent_response_increment(node, input_values, skill_context, runtime_config):
    _ = skill_context
    counter_input = input_values.get("counter")
    if counter_input is None and input_values:
        counter_input = next(iter(input_values.values()))
    counter = int(counter_input or 0) + 1
    outputs = {
        binding.state: counter
        for binding in node.writes
    }
    return outputs, "", [], runtime_config


def _fake_generate_agent_response_no_change(node, input_values, skill_context, runtime_config):
    _ = skill_context
    counter_input = input_values.get("counter")
    if counter_input is None and input_values:
        counter_input = next(iter(input_values.values()))
    counter = int(counter_input or 0)
    outputs = {
        binding.state: counter
        for binding in node.writes
    }
    return outputs, "", [], runtime_config


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
                    "config": {"skills": [], "taskInstruction": ""},
                },
                "continue_check": {
                    "kind": "condition",
                    "name": "continue_check",
                    "description": "Loop until the counter reaches three.",
                    "ui": {"position": {"x": 520, "y": 0}, "collapsed": False},
                    "reads": [{"state": "counter", "required": True}],
                    "config": {
                        "branches": ["continue", "stop"],
                        "loopLimit": 5,
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
                {"source": "seed_counter", "target": "increment_counter"},
                {"source": "increment_counter", "target": "continue_check"},
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
            "metadata": {},
        }
    )


class LangGraphMigrationTests(unittest.TestCase):
    def test_hello_world_validate_baseline(self):
        graph = _load_hello_world_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_hello_world_build_plan(self):
        graph = _load_hello_world_graph()
        name_key = _state_key_by_name(graph, "name")
        greeting_key = _state_key_by_name(graph, "greeting")
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(plan.name, "Hello World")
        self.assertEqual(set(plan.requirements.entry_nodes), {"input_name"})
        self.assertEqual(set(plan.requirements.terminal_nodes), {"output_greeting"})
        self.assertEqual(set(plan.requirements.runtime_entry_nodes), {"greeting_agent"})
        self.assertEqual(set(plan.requirements.runtime_terminal_nodes), {"greeting_agent"})
        self.assertEqual(set(plan.runtime_nodes), {"greeting_agent"})
        self.assertEqual([edge.model_dump(by_alias=True) for edge in plan.runtime_edges], [])
        self.assertEqual(
            [boundary.model_dump(by_alias=True) for boundary in plan.input_boundaries],
            [{"node": "input_name", "state": name_key}],
        )
        self.assertEqual(
            [boundary.model_dump(by_alias=True) for boundary in plan.output_boundaries],
            [{"node": "output_greeting", "state": greeting_key}],
        )
        self.assertEqual(plan.requirements.skill_keys, [])
        self.assertEqual(plan.requirements.unsupported_reasons, [])

    def test_hello_world_langgraph_support_ignores_legacy_runtime_metadata(self):
        graph = _load_hello_world_graph()
        graph.metadata["runtime_backend"] = "legacy"
        reasons = get_langgraph_runtime_unsupported_reasons(graph)
        self.assertEqual(reasons, [])

    def test_cycle_graph_has_no_langgraph_support_issues(self):
        graph = _build_cycle_graph()
        reasons = get_langgraph_runtime_unsupported_reasons(graph)
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

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_hello_world_runtime_prefers_state_schema_value_for_input_nodes(self):
        graph = _load_hello_world_graph()
        name_key = _state_key_by_name(graph, "name")
        greeting_key = _state_key_by_name(graph, "greeting")
        graph.state_schema[name_key].value = "来自 state_schema 的名称"
        graph.nodes["input_name"].config.value = "来自节点 config 的旧值"

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final_result"], "greeting_agent:来自 state_schema 的名称")
        self.assertEqual(result["checkpoint_metadata"]["available"], True)
        self.assertTrue(result["checkpoint_metadata"]["checkpoint_id"])
        self.assertEqual(result["checkpoint_metadata"]["thread_id"], result["run_id"])
        self.assertEqual(len(result["node_executions"]), 1)
        self.assertEqual({item["node_id"] for item in result["node_executions"]}, {"greeting_agent"})
        self.assertEqual({item["node_type"] for item in result["node_executions"]}, {"agent"})
        self.assertEqual(result["cycle_summary"]["has_cycle"], False)
        self.assertEqual(result["output_previews"][0]["node_id"], "output_greeting")
        self.assertEqual(result["output_previews"][0]["source_key"], greeting_key)
        self.assertEqual(result["output_previews"][0]["value"], "greeting_agent:来自 state_schema 的名称")
        self.assertEqual(result["node_status_map"]["input_name"], "success")
        self.assertEqual(result["node_status_map"]["output_greeting"], "success")
        self.assertIn(greeting_key, result["state_snapshot"]["values"])

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
        self.assertIn(_state_key_by_name(graph, "greeting"), result["state_snapshot"]["values"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_interrupt_before_waits_for_human(self):
        graph = _load_hello_world_graph()
        name_key = _state_key_by_name(graph, "name")
        payload = graph.model_dump(by_alias=True)
        payload["metadata"] = {"interrupt_before": ["greeting_agent"]}
        interrupt_graph = NodeSystemGraphPayload.model_validate(payload)

        result = execute_node_system_graph_langgraph(interrupt_graph, persist_progress=False)

        self.assertEqual(result["status"], "awaiting_human")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["current_node_id"], "greeting_agent")
        self.assertEqual(result["lifecycle"]["pause_reason"], "breakpoint")
        self.assertTrue(result["checkpoint_metadata"]["available"])
        self.assertEqual(result["state_snapshot"]["values"][name_key], "GraphiteUI 用户")
        self.assertEqual(result["metadata"]["pending_interrupt_nodes"], ["greeting_agent"])
        self.assertEqual(result["metadata"]["pending_interrupts"], [])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_interrupt_after_agent_collects_output_preview(self):
        graph = _load_hello_world_graph()
        greeting_key = _state_key_by_name(graph, "greeting")
        payload = graph.model_dump(by_alias=True)
        payload["metadata"] = {"interrupt_after": ["greeting_agent"]}
        interrupt_graph = NodeSystemGraphPayload.model_validate(payload)

        result = execute_node_system_graph_langgraph(interrupt_graph, persist_progress=False)

        self.assertEqual(result["status"], "awaiting_human")
        self.assertEqual(result["current_node_id"], "greeting_agent")
        self.assertEqual(result["node_status_map"]["greeting_agent"], "success")
        self.assertEqual(result["state_snapshot"]["values"][greeting_key], "greeting_agent:GraphiteUI 用户")
        self.assertEqual(result["output_previews"][0]["node_id"], "output_greeting")
        self.assertEqual(result["output_previews"][0]["source_key"], greeting_key)
        self.assertEqual(result["output_previews"][0]["value"], "greeting_agent:GraphiteUI 用户")

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_langgraph_interrupt_resume_accepts_human_state_updates(self):
        graph = _load_hello_world_graph()
        name_key = _state_key_by_name(graph, "name")
        greeting_key = _state_key_by_name(graph, "greeting")
        payload = graph.model_dump(by_alias=True)
        payload["metadata"] = {"interrupt_before": ["greeting_agent"]}
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
            resume_command={name_key: "人工确认后的名称"},
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["lifecycle"]["resume_count"], 1)
        self.assertEqual(result["lifecycle"]["resumed_from_run_id"], interrupted["run_id"])
        self.assertEqual(result["state_snapshot"]["values"][name_key], "人工确认后的名称")
        self.assertEqual(result["state_snapshot"]["values"][greeting_key], "greeting_agent:人工确认后的名称")
        self.assertNotIn("pending_interrupt_nodes", result.get("metadata", {}))

    def test_conditional_edge_validation_template_still_valid(self):
        graph = _load_conditional_edge_validation_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_cycle_counter_demo_template_still_valid(self):
        graph = _load_cycle_counter_demo_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_human_review_demo_template_still_valid(self):
        graph = _load_human_review_demo_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    def test_web_research_loop_template_still_valid(self):
        graph = _load_web_research_loop_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_human_review_demo_template_pauses_after_draft_agent(self):
        graph = _load_human_review_demo_graph()
        request_key = _state_key_by_name(graph, "request")
        draft_answer_key = _state_key_by_name(graph, "draft_answer")
        human_feedback_key = _state_key_by_name(graph, "human_feedback")

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "awaiting_human")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["current_node_id"], "draft_writer")
        self.assertEqual(result["node_status_map"]["draft_writer"], "success")
        self.assertEqual(result["lifecycle"]["pause_reason"], "breakpoint")
        self.assertTrue(result["checkpoint_metadata"]["available"])
        self.assertEqual(result["metadata"]["pending_interrupt_nodes"], ["draft_writer"])
        self.assertEqual(result["state_snapshot"]["values"][request_key], "请给 GraphiteUI 写一段简短的欢迎介绍。")
        self.assertEqual(result["state_snapshot"]["values"][draft_answer_key], "draft_writer:请给 GraphiteUI 写一段简短的欢迎介绍。")
        self.assertEqual(result["state_snapshot"]["values"][human_feedback_key], "")
        self.assertEqual(result["output_previews"][0]["node_id"], "output_draft_answer")
        self.assertEqual(result["output_previews"][0]["source_key"], draft_answer_key)
        self.assertEqual(result["output_previews"][0]["value"], "draft_writer:请给 GraphiteUI 写一段简短的欢迎介绍。")
        self.assertEqual(len(result["run_snapshots"]), 1)
        self.assertEqual(result["run_snapshots"][0]["kind"], "pause")
        self.assertEqual(result["run_snapshots"][0]["current_node_id"], "draft_writer")
        self.assertEqual(result["run_snapshots"][0]["state_snapshot"]["values"][draft_answer_key], "draft_writer:请给 GraphiteUI 写一段简短的欢迎介绍。")
        self.assertTrue(result["run_snapshots"][0]["checkpoint_metadata"]["available"])
        self.assertTrue(result["run_snapshots"][0]["checkpoint_metadata"]["checkpoint_id"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_human_review_resume_preserves_prior_status_and_output_previews(self):
        graph = _load_human_review_demo_graph()
        human_feedback_key = _state_key_by_name(graph, "human_feedback")

        interrupted = execute_node_system_graph_langgraph(graph, persist_progress=False)
        self.assertEqual(interrupted["status"], "awaiting_human")

        resumed_state = copy.deepcopy(interrupted)
        set_run_status(resumed_state, "resuming")

        result = execute_node_system_graph_langgraph(
            graph,
            initial_state=resumed_state,
            persist_progress=False,
            resume_from_checkpoint=True,
            resume_command={human_feedback_key: "请更强调可视化编排。"},
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["run_id"], interrupted["run_id"])
        self.assertEqual(result["node_status_map"]["draft_writer"], "success")
        self.assertEqual(result["node_status_map"]["output_draft_answer"], "success")
        self.assertEqual(result["node_status_map"]["revision_writer"], "success")
        self.assertEqual(result["node_status_map"]["output_final_answer"], "success")
        self.assertEqual(
            [preview["node_id"] for preview in result["output_previews"]],
            ["output_draft_answer", "output_final_answer"],
        )
        self.assertEqual([snapshot["kind"] for snapshot in result["run_snapshots"]], ["pause", "completed"])

    def test_plain_edge_graph_validates_without_handle_fields(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Plain Edge Graph",
                "state_schema": {
                    "question": {
                        "name": "Question",
                        "description": "",
                        "type": "text",
                        "value": "",
                        "color": "",
                    }
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "name": "Input Question",
                        "description": "",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [],
                        "writes": [{"state": "question", "mode": "replace"}],
                        "config": {"value": "What is GraphiteUI?"},
                    },
                    "answer_helper": {
                        "kind": "agent",
                        "name": "Answer Helper",
                        "description": "",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "reads": [{"state": "question", "required": True}],
                        "writes": [{"state": "question", "mode": "replace"}],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                },
                "edges": [{"source": "input_question", "target": "answer_helper"}],
                "conditional_edges": [],
                "metadata": {},
            }
        )

        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(
            [edge.model_dump(by_alias=True) for edge in plan.edges],
            [{"source": "input_question", "target": "answer_helper"}],
        )

    def test_plain_edge_graph_accepts_zero_shared_states_as_control_flow(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Plain Edge Zero Shared States",
                "state_schema": {
                    "question": {
                        "name": "Question",
                        "description": "",
                        "type": "text",
                        "value": "",
                        "color": "",
                    },
                    "answer": {
                        "name": "Answer",
                        "description": "",
                        "type": "text",
                        "value": "",
                        "color": "",
                    },
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "name": "Input Question",
                        "description": "",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [],
                        "writes": [{"state": "question", "mode": "replace"}],
                        "config": {"value": "What is GraphiteUI?"},
                    },
                    "output_answer": {
                        "kind": "output",
                        "name": "Output Answer",
                        "description": "",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "reads": [{"state": "answer", "required": True}],
                        "writes": [],
                        "config": {
                            "displayMode": "auto",
                            "persistEnabled": False,
                            "persistFormat": "auto",
                            "fileNameTemplate": "",
                        },
                    },
                },
                "edges": [{"source": "input_question", "target": "output_answer"}],
                "conditional_edges": [],
                "metadata": {},
            }
        )

        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(plan.requirements.unsupported_reasons, [])
        self.assertEqual(
            [edge.model_dump(by_alias=True) for edge in plan.edges],
            [{"source": "input_question", "target": "output_answer"}],
        )

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    def test_input_output_only_runtime_collects_output_without_node_executions(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Input Output Only",
                "state_schema": {
                    "answer": {
                        "name": "Answer",
                        "description": "",
                        "type": "text",
                        "value": "hello",
                        "color": "",
                    },
                },
                "nodes": {
                    "input_answer": {
                        "kind": "input",
                        "name": "Input Answer",
                        "description": "",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [],
                        "writes": [{"state": "answer", "mode": "replace"}],
                        "config": {"value": "ignored"},
                    },
                    "output_answer": {
                        "kind": "output",
                        "name": "Output Answer",
                        "description": "",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "reads": [{"state": "answer", "required": True}],
                        "writes": [],
                        "config": {
                            "displayMode": "auto",
                            "persistEnabled": False,
                            "persistFormat": "auto",
                            "fileNameTemplate": "",
                        },
                    },
                },
                "edges": [{"source": "input_answer", "target": "output_answer"}],
                "conditional_edges": [],
                "metadata": {},
            }
        )

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["node_executions"], [])
        self.assertEqual(result["final_result"], "hello")
        self.assertEqual(result["node_status_map"]["input_answer"], "success")
        self.assertEqual(result["node_status_map"]["output_answer"], "success")
        self.assertEqual([preview["node_id"] for preview in result["output_previews"]], ["output_answer"])

    def test_plain_edge_graph_accepts_multiple_shared_states_as_control_flow(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Plain Edge Multiple Shared States",
                "state_schema": {
                    "alpha": {
                        "name": "Alpha",
                        "description": "",
                        "type": "text",
                        "value": "",
                        "color": "",
                    },
                    "beta": {
                        "name": "Beta",
                        "description": "",
                        "type": "text",
                        "value": "",
                        "color": "",
                    },
                },
                "nodes": {
                    "source_node": {
                        "kind": "agent",
                        "name": "Source Node",
                        "description": "",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [],
                        "writes": [
                            {"state": "alpha", "mode": "replace"},
                            {"state": "beta", "mode": "replace"},
                        ],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                    "target_node": {
                        "kind": "agent",
                        "name": "Target Node",
                        "description": "",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "reads": [
                            {"state": "alpha", "required": True},
                            {"state": "beta", "required": True},
                        ],
                        "writes": [],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                },
                "edges": [{"source": "source_node", "target": "target_node"}],
                "conditional_edges": [],
                "metadata": {},
            }
        )

        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(plan.requirements.unsupported_reasons, [])
        self.assertEqual(
            [edge.model_dump(by_alias=True) for edge in plan.edges],
            [{"source": "source_node", "target": "target_node"}],
        )

    def test_same_state_sequential_writers_are_allowed(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Sequential Writers",
                "state_schema": {
                    "question": {"name": "Question", "description": "", "type": "text", "value": "", "color": ""},
                    "answer": {"name": "Answer", "description": "", "type": "text", "value": "", "color": ""},
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "name": "Input",
                        "description": "",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [],
                        "writes": [{"state": "question", "mode": "replace"}],
                        "config": {"value": "hello"},
                    },
                    "draft_answer": {
                        "kind": "agent",
                        "name": "Draft Answer",
                        "description": "",
                        "ui": {"position": {"x": 240, "y": 0}},
                        "reads": [{"state": "question", "required": True}],
                        "writes": [{"state": "answer", "mode": "replace"}],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                    "final_answer": {
                        "kind": "agent",
                        "name": "Final Answer",
                        "description": "",
                        "ui": {"position": {"x": 480, "y": 0}},
                        "reads": [{"state": "answer", "required": True}],
                        "writes": [{"state": "answer", "mode": "replace"}],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                    "show_answer": {
                        "kind": "output",
                        "name": "Show Answer",
                        "description": "",
                        "ui": {"position": {"x": 720, "y": 0}},
                        "reads": [{"state": "answer", "required": True}],
                        "writes": [],
                        "config": {
                            "displayMode": "auto",
                            "persistEnabled": False,
                            "persistFormat": "auto",
                            "fileNameTemplate": "",
                        },
                    },
                },
                "edges": [
                    {"source": "input_question", "target": "draft_answer"},
                    {"source": "draft_answer", "target": "final_answer"},
                    {"source": "final_answer", "target": "show_answer"},
                ],
                "conditional_edges": [],
                "metadata": {},
            }
        )

        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(plan.requirements.unsupported_reasons, [])

    def test_same_state_parallel_writers_are_rejected(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Parallel Writers",
                "state_schema": {
                    "answer": {"name": "Answer", "description": "", "type": "text", "value": "", "color": ""},
                },
                "nodes": {
                    "start": {
                        "kind": "input",
                        "name": "Start",
                        "description": "",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "reads": [],
                        "writes": [],
                        "config": {"value": ""},
                    },
                    "writer_a": {
                        "kind": "agent",
                        "name": "Writer A",
                        "description": "",
                        "ui": {"position": {"x": 220, "y": -120}},
                        "reads": [],
                        "writes": [{"state": "answer", "mode": "replace"}],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                    "writer_b": {
                        "kind": "agent",
                        "name": "Writer B",
                        "description": "",
                        "ui": {"position": {"x": 220, "y": 120}},
                        "reads": [],
                        "writes": [{"state": "answer", "mode": "replace"}],
                        "config": {
                            "skills": [],
                            "taskInstruction": "",
                            "modelSource": "global",
                            "model": "",
                            "thinkingMode": "on",
                            "temperature": 0.2,
                        },
                    },
                    "show_answer": {
                        "kind": "output",
                        "name": "Show Answer",
                        "description": "",
                        "ui": {"position": {"x": 520, "y": 0}},
                        "reads": [{"state": "answer", "required": True}],
                        "writes": [],
                        "config": {
                            "displayMode": "auto",
                            "persistEnabled": False,
                            "persistFormat": "auto",
                            "fileNameTemplate": "",
                        },
                    },
                },
                "edges": [
                    {"source": "start", "target": "writer_a"},
                    {"source": "start", "target": "writer_b"},
                    {"source": "writer_a", "target": "show_answer"},
                    {"source": "writer_b", "target": "show_answer"},
                ],
                "conditional_edges": [],
                "metadata": {},
            }
        )

        validation = validate_graph(graph)
        self.assertFalse(validation.valid)
        self.assertTrue(any(issue.code == "state_writer_order_ambiguous" for issue in validation.issues))
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertTrue(any("multiple unordered writers" in reason for reason in plan.requirements.unsupported_reasons))

    def test_agent_prompt_ignores_legacy_system_instruction_and_keeps_graph_state_inputs(self):
        graph = _load_cycle_counter_demo_graph()
        node = graph.nodes["increment_counter"]
        counter_key = _state_key_by_name(graph, "counter")
        captured: dict[str, str] = {}

        def _fake_chat_with_local_model_with_meta(**kwargs):
            captured["system_prompt"] = kwargs["system_prompt"]
            captured["user_prompt"] = kwargs["user_prompt"]
            return ('{"counter": 1}', {"warnings": []})

        with patch("app.core.runtime.node_system_executor._chat_with_local_model_with_meta", _fake_chat_with_local_model_with_meta):
            runtime_config = node_system_executor._resolve_agent_runtime_config(node)
            runtime_config = {
                **runtime_config,
                "resolved_model_ref": "local/test-model",
                "resolved_provider_id": "local",
                "runtime_model_name": "test-model",
            }
            node_system_executor._generate_agent_response(node, {counter_key: 0}, {}, runtime_config, state_schema=graph.state_schema)

        self.assertFalse(hasattr(node.config, "system_instruction"))
        self.assertIn("== Graph State Inputs ==", captured["system_prompt"])
        self.assertIn(f"- key: {counter_key}", captured["system_prompt"])
        self.assertIn("  name: counter", captured["system_prompt"])
        self.assertIn("  value: 0", captured["system_prompt"])
        self.assertIn(f'"{counter_key}": 0', captured["system_prompt"])
        self.assertNotIn("== Node System Instruction ==", captured["system_prompt"])
        self.assertNotIn("你是一个计数节点", captured["system_prompt"])
        self.assertEqual(
            captured["user_prompt"],
            "读取输入 counter，并严格只返回 JSON：{\"counter\": 当前 counter + 1}。不要输出任何解释。",
        )

    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_exported_langgraph_python_source_is_executable(self):
        graph = _load_hello_world_graph()
        greeting_key = _state_key_by_name(graph, "greeting")
        source = generate_langgraph_python_source(graph)
        self.assertIn("def build_graph()", source)
        self.assertIn("def invoke_graph", source)
        self.assertNotIn("for node_name in GRAPH.nodes:", source)
        self.assertIn("for node_name in RUNTIME_NODES:", source)

        namespace: dict[str, object] = {}
        exec(source, namespace, namespace)
        result = namespace["invoke_graph"]()
        self.assertIn(greeting_key, result)

    def test_exported_langgraph_invoke_clears_non_input_initial_values(self):
        graph = NodeSystemGraphPayload.model_validate(
            {
                "name": "Input Only Export",
                "state_schema": {
                    "request": {"name": "Request", "type": "text", "value": "schema request"},
                    "result": {"name": "Result", "type": "markdown", "value": "stale schema result"},
                },
                "nodes": {
                    "input_request": {
                        "kind": "input",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "request"}],
                    }
                },
                "edges": [],
                "conditional_edges": [],
                "metadata": {},
            }
        )
        source = generate_langgraph_python_source(graph)

        namespace: dict[str, object] = {}
        exec(source, namespace, namespace)
        result = namespace["invoke_graph"](
            {
                "request": "runtime request",
                "result": "previous result",
                "obsolete": "previous extra state",
            }
        )

        self.assertEqual(result, {"request": "runtime request", "result": ""})

    def test_exported_langgraph_payload_keeps_only_runtime_fields(self):
        graph = _load_hello_world_graph()
        name_key = _state_key_by_name(graph, "name")
        greeting_key = _state_key_by_name(graph, "greeting")
        payload = _build_export_graph_payload(graph)

        self.assertNotIn("graph_id", payload)
        self.assertNotIn("metadata", payload)
        self.assertEqual(payload["state_schema"][name_key], {"value": "GraphiteUI 用户"})
        self.assertEqual(payload["state_schema"][greeting_key], {"value": ""})
        self.assertEqual(
            payload["nodes"]["input_name"],
            {
                "kind": "input",
                "writes": [{"state": name_key}],
            },
        )
        self.assertEqual(
            payload["nodes"]["greeting_agent"],
            {
                "kind": "agent",
                "reads": [{"state": name_key}],
                "writes": [{"state": greeting_key}],
                "config": {"taskInstruction": "读取输入 name，用中文生成一句简短、友好的欢迎语。只输出问候内容，不要解释。"},
            },
        )
        self.assertEqual(
            payload["nodes"]["output_greeting"],
            {
                "kind": "output",
                "reads": [{"state": greeting_key}],
            },
        )

    def test_exported_langgraph_python_source_omits_editor_only_payload_fields(self):
        graph = _load_hello_world_graph()
        source = generate_langgraph_python_source(graph)
        runtime_payload_source = source.split("GRAPH_PAYLOAD = ", 1)[1].split("\nGRAPHITEUI_EDITOR_GRAPH =", 1)[0]

        self.assertIn("NodeSystemGraphPayload.model_validate(_inflate_graph_payload(GRAPH_PAYLOAD))", source)
        self.assertNotIn("NodeSystemGraphDocument", source)
        self.assertNotIn("'ui':", runtime_payload_source)
        self.assertNotIn("'description':", runtime_payload_source)
        self.assertNotIn("'color':", runtime_payload_source)
        self.assertNotIn("'required':", runtime_payload_source)
        self.assertNotIn("'modelSource': 'global'", runtime_payload_source)
        self.assertNotIn("'graph_id': 'exported_graph'", runtime_payload_source)

    def test_exported_langgraph_python_source_embeds_reversible_editor_graph(self):
        graph = _load_hello_world_graph()
        source = generate_langgraph_python_source(graph)
        editor_payload_source = source.split("GRAPHITEUI_EDITOR_GRAPH = ", 1)[1].split("\nINTERRUPT_BEFORE_CONFIG", 1)[0]

        self.assertIn("GRAPHITEUI_EXPORT_VERSION = 1", source)
        self.assertIn("'ui':", editor_payload_source)
        self.assertIn("'description':", editor_payload_source)
        self.assertIn("'color':", editor_payload_source)
        self.assertNotIn("'graph_id':", editor_payload_source)

    def test_import_graph_payload_from_python_source_reads_editor_graph_without_execution(self):
        graph = _load_hello_world_graph()
        name_key = _state_key_by_name(graph, "name")
        source = generate_langgraph_python_source(graph) + "\nraise RuntimeError('must not execute import file')\n"

        imported = import_graph_payload_from_python_source(source)

        self.assertEqual(imported.name, graph.name)
        self.assertIsNone(imported.graph_id)
        self.assertEqual(imported.nodes["input_name"].ui.position.x, 80.0)
        self.assertEqual(imported.state_schema[name_key].color, "#d97706")

    def test_import_graph_payload_from_python_source_rejects_plain_python(self):
        with self.assertRaises(ValueError):
            import_graph_payload_from_python_source("print('ordinary python file')\n")

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
        self.assertEqual(result["cycle_summary"]["back_edges"], ["continue_check→increment_counter"])
        self.assertEqual(len(result["cycle_iterations"]), 3)
        self.assertEqual(result["cycle_iterations"][0]["stop_reason"], None)
        self.assertEqual(result["cycle_iterations"][-1]["stop_reason"], "completed")
        self.assertEqual(result["cycle_iterations"][-1]["executed_node_ids"], ["increment_counter"])
        execution_ids = {item["node_id"] for item in result["node_executions"]}
        self.assertNotIn("continue_check", execution_ids)
        self.assertNotIn("output_counter", execution_ids)

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_template_langgraph_runtime(self):
        graph = _load_cycle_counter_demo_graph()
        counter_key = _state_key_by_name(graph, "counter")
        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["state_snapshot"]["values"][counter_key], 3)
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["cycle_summary"]["max_iterations"], 5)
        self.assertEqual(result["cycle_summary"]["stop_reason"], "completed")
        self.assertEqual(result["cycle_summary"]["back_edges"], ["continue_check→increment_counter"])
        self.assertEqual(result["final_result"], "3")
        self.assertEqual(result["cycle_iterations"][-1]["executed_node_ids"], ["increment_counter"])
        execution_ids = {item["node_id"] for item in result["node_executions"]}
        self.assertNotIn("continue_check", execution_ids)
        self.assertNotIn("output_counter", execution_ids)

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_routes_to_exhausted_branch_when_loop_limit_is_hit(self):
        graph = _load_cycle_counter_demo_graph()
        counter_key = _state_key_by_name(graph, "counter")
        graph.nodes["continue_check"].config.loop_limit = 1

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["state_snapshot"]["values"][counter_key], 1)
        self.assertEqual(result["cycle_summary"]["stop_reason"], "max_iterations_exceeded")
        self.assertEqual(result["cycle_summary"]["iteration_count"], 1)
        self.assertEqual(result["final_result"], "循环已达上限，最新的结果是：1")
        self.assertEqual(len(result["output_previews"]), 1)
        self.assertEqual(result["output_previews"][0]["node_id"], "output_loop_exhausted")
        self.assertEqual(result["output_previews"][0]["value"], "循环已达上限，最新的结果是：1")

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_allows_unlimited_cycle_iterations_with_negative_one(self):
        graph = _load_cycle_counter_demo_graph()
        counter_key = _state_key_by_name(graph, "counter")
        graph.nodes["continue_check"].config.loop_limit = -1

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["max_iterations"], -1)
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["state_snapshot"]["values"][counter_key], 3)

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_ignores_graph_level_cycle_limit_metadata(self):
        graph = _load_cycle_counter_demo_graph()
        counter_key = _state_key_by_name(graph, "counter")
        graph.metadata["cycle_max_iterations"] = 1
        graph.nodes["continue_check"].config.loop_limit = 5

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["max_iterations"], 5)
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["state_snapshot"]["values"][counter_key], 3)

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_no_change)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_runtime_stops_when_loop_makes_no_state_progress(self):
        graph = _build_cycle_graph()
        graph.nodes["continue_check"].config.loop_limit = -1
        initial_state = create_initial_run_state(
            graph_id=graph.graph_id or "cycle_graph",
            graph_name=graph.name,
            max_revision_round=1,
        )

        with self.assertRaisesRegex(RuntimeError, "made no state progress"):
            execute_node_system_graph_langgraph(graph, initial_state=initial_state, persist_progress=False)

        self.assertEqual(initial_state["status"], "failed")
        self.assertTrue(initial_state["cycle_summary"]["has_cycle"])
        self.assertEqual(initial_state["cycle_summary"]["stop_reason"], "no_state_change")
        self.assertEqual(initial_state["cycle_summary"]["iteration_count"], 1)
        self.assertEqual(initial_state["cycle_iterations"][-1]["stop_reason"], "no_state_change")

    def test_finalize_cycle_summary_marks_empty_iteration_when_last_pass_never_runs(self):
        state = {"node_executions": []}
        cycle_tracker = {
            "has_cycle": True,
            "back_edges": ["continue_check→increment_counter"],
            "max_iterations": 5,
            "records": {
                1: {
                    "iteration": 1,
                    "executed_node_ids": ["increment_counter", "continue_check"],
                    "incoming_edge_ids": [],
                    "activated_edge_ids": ["edge:seed_counter:increment_counter", "edge:increment_counter:continue_check"],
                    "next_iteration_edge_ids": ["conditional:continue_check:continue:increment_counter"],
                    "stop_reason": None,
                },
                2: {
                    "iteration": 2,
                    "executed_node_ids": [],
                    "incoming_edge_ids": ["conditional:continue_check:continue:increment_counter"],
                    "activated_edge_ids": [],
                    "next_iteration_edge_ids": [],
                    "stop_reason": None,
                },
            },
        }

        _finalize_langgraph_cycle_summary(state, cycle_tracker, set())

        self.assertTrue(state["cycle_summary"]["has_cycle"])
        self.assertEqual(state["cycle_summary"]["stop_reason"], "empty_iteration")
        self.assertEqual(state["cycle_summary"]["iteration_count"], 2)
        self.assertEqual(state["cycle_iterations"][-1]["stop_reason"], "empty_iteration")

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    def test_conditional_edge_validation_langgraph_runtime(self):
        graph = _load_conditional_edge_validation_graph()
        score_key = _state_key_by_name(graph, "score")
        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["final_result"], "通过：score >= 60，进入 true 分支。")
        self.assertEqual(result["state_snapshot"]["values"][score_key], 80)
        self.assertEqual(result["node_executions"], [])
        self.assertEqual(result["node_status_map"]["score_gate"], "success")
        self.assertEqual(result["node_status_map"]["output_pass"], "success")
        self.assertEqual(result["node_status_map"]["output_fail"], "idle")
        self.assertEqual([preview["node_id"] for preview in result["output_previews"]], ["output_pass"])
