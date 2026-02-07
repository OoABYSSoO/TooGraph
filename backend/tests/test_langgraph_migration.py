from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.compiler.validator import validate_graph
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan, get_langgraph_runtime_unsupported_reasons
from app.core.langgraph.codegen import generate_langgraph_python_source
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


def _fake_generate_agent_response_no_change(node, input_values, skill_context, runtime_config):
    _ = skill_context
    counter = int(input_values.get("counter") or 0)
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
        plan = compile_graph_to_langgraph_plan(graph)
        self.assertEqual(plan.name, "Hello World")
        self.assertEqual(set(plan.requirements.entry_nodes), {"input_question"})
        self.assertEqual(set(plan.requirements.terminal_nodes), {"output_answer"})
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
        graph.state_schema["question"].value = "来自 state_schema 的问题"
        graph.nodes["input_question"].config.value = "来自节点 config 的旧值"

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final_result"], "answer_helper:来自 state_schema 的问题")
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

    def test_cycle_counter_demo_template_still_valid(self):
        graph = _load_cycle_counter_demo_graph()
        validation = validate_graph(graph)
        self.assertTrue(validation.valid, validation.model_dump())

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
                            "systemInstruction": "",
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
                            "systemInstruction": "",
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
                            "systemInstruction": "",
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
                            "systemInstruction": "",
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
                            "systemInstruction": "",
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
                            "systemInstruction": "",
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
                            "systemInstruction": "",
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

    def test_explicit_system_instruction_still_keeps_graph_state_inputs_in_agent_prompt(self):
        graph = _load_cycle_counter_demo_graph()
        node = graph.nodes["increment_counter"]
        captured: dict[str, str] = {}

        def _fake_chat_with_local_model_with_meta(**kwargs):
            captured["system_prompt"] = kwargs["system_prompt"]
            captured["user_prompt"] = kwargs["user_prompt"]
            return ('{"counter": 1}', {"warnings": []})

        with patch("app.core.runtime.node_system_executor._chat_with_local_model_with_meta", _fake_chat_with_local_model_with_meta):
            runtime_config = node_system_executor._resolve_agent_runtime_config(node)
            node_system_executor._generate_agent_response(node, {"counter": 0}, {}, runtime_config)

        self.assertIn("== Graph State Inputs ==", captured["system_prompt"])
        self.assertIn("- counter: 0", captured["system_prompt"])
        self.assertIn('{"counter": "..."}', captured["system_prompt"])
        self.assertIn("你是一个计数节点", captured["system_prompt"])
        self.assertEqual(
            captured["user_prompt"],
            "读取输入 counter，并严格只返回 JSON：{\"counter\": 当前 counter + 1}。不要输出任何解释。",
        )

    def test_knowledge_base_validation_has_no_langgraph_support_issues(self):
        graph = _load_knowledge_base_validation_graph()
        reasons = get_langgraph_runtime_unsupported_reasons(graph)
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
        self.assertEqual(result["cycle_summary"]["back_edges"], ["continue_check→increment_counter"])
        self.assertEqual(len(result["cycle_iterations"]), 3)
        self.assertEqual(result["cycle_iterations"][0]["stop_reason"], None)
        self.assertEqual(result["cycle_iterations"][-1]["stop_reason"], "completed")
        self.assertEqual(result["cycle_iterations"][-1]["executed_node_ids"], ["increment_counter", "continue_check", "output_counter"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_template_langgraph_runtime(self):
        graph = _load_cycle_counter_demo_graph()
        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["runtime_backend"], "langgraph")
        self.assertEqual(result["state_snapshot"]["values"]["counter"], 3)
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["cycle_summary"]["max_iterations"], 5)
        self.assertEqual(result["cycle_summary"]["stop_reason"], "completed")
        self.assertEqual(result["cycle_summary"]["back_edges"], ["continue_check→increment_counter"])
        self.assertEqual(result["final_result"], "3")
        self.assertEqual(result["cycle_iterations"][-1]["executed_node_ids"], ["increment_counter", "continue_check", "output_counter"])

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_allows_unlimited_cycle_iterations_with_negative_one(self):
        graph = _load_cycle_counter_demo_graph()
        graph.nodes["continue_check"].config.loop_limit = -1

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["max_iterations"], -1)
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["state_snapshot"]["values"]["counter"], 3)

    @patch("app.core.langgraph.runtime.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor.save_run", lambda state: None)
    @patch("app.core.runtime.node_system_executor._generate_agent_response", _fake_generate_agent_response_increment)
    @patch("app.core.runtime.node_system_executor._invoke_skill", _fake_invoke_skill)
    @patch("app.core.runtime.node_system_executor.get_skill_registry", _fake_skill_registry)
    def test_cycle_counter_demo_ignores_graph_level_cycle_limit_metadata(self):
        graph = _load_cycle_counter_demo_graph()
        graph.metadata["cycle_max_iterations"] = 1
        graph.nodes["continue_check"].config.loop_limit = 5

        result = execute_node_system_graph_langgraph(graph, persist_progress=False)

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["cycle_summary"]["has_cycle"])
        self.assertEqual(result["cycle_summary"]["max_iterations"], 5)
        self.assertEqual(result["cycle_summary"]["iteration_count"], 3)
        self.assertEqual(result["state_snapshot"]["values"]["counter"], 3)

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
