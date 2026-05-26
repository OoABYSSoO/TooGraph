from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.node_handlers import (
    execute_agent_node,
    execute_condition_node,
    execute_input_node,
)
from app.core.runtime.permission_approval import build_pending_permission_approval
from app.core.runtime.action_invocation import callable_accepts_keyword
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemConditionNode, NodeSystemInputNode, NodeSystemStateDefinition
from app.core.schemas.actions import ActionDefinition, ActionIoField


def pass_through_action_inputs_func(**kwargs):
    return (
        {resolved.binding.action_key: dict(kwargs["input_values"]) for resolved in kwargs["bindings"]},
        {},
        "",
        [],
        kwargs["runtime_config"],
    )


def fixed_action_inputs_func(inputs_by_action: dict[str, dict[str, object]]):
    def generate(**kwargs):
        return inputs_by_action, {}, "", [], kwargs["runtime_config"]

    return generate


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
                    "branches": ["true", "false", "exhausted"],
                    "loopLimit": 5,
                    "branchMapping": {"true": "true", "false": "false"},
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

        self.assertEqual(result, {"outputs": {"true": True}, "selected_branch": "true", "final_result": "true"})

        with self.assertRaisesRegex(ValueError, "could not resolve"):
            execute_condition_node(
                node,
                {},
                {"state": {}},
                resolve_condition_source_func=lambda source, *, inputs, graph, state_values: None,
                evaluate_condition_rule_func=lambda actual, operator, expected: False,
                resolve_branch_key_func=lambda branches, branch_mapping, condition_result: None,
            )

    def test_execute_agent_node_invokes_actions_streaming_and_generation(self) -> None:
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
                "config": {"actionKey": "custom"},
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
            get_action_registry_func=lambda *, include_disabled: {"custom": object()},
            invoke_action_func=lambda action_func, action_inputs: {"echo": action_inputs["question"]},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: keyword in {"on_delta", "state_schema"},
            generate_agent_action_inputs_func=pass_through_action_inputs_func,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
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
        self.assertEqual(result["selected_actions"], ["custom"])
        self.assertNotIn("selected_skills", result)
        self.assertEqual(result["action_outputs"][0]["inputs"], {"question": "q"})
        self.assertEqual(result["action_outputs"][0]["outputs"], {"echo": "q"})
        self.assertNotIn("skill_outputs", result)
        self.assertEqual(result["runtime_config"]["runtime"], "updated")
        self.assertEqual(result["runtime_config"]["kwargs"]["on_delta"], "delta")
        self.assertEqual(result["runtime_config"]["kwargs"]["state_schema"], state_schema)
        self.assertEqual(result["warnings"], ["warn"])
        self.assertEqual(result["final_result"], "value")
        self.assertEqual(finalized, {"answer": "value"})

    def test_execute_agent_node_streams_action_planning_state_outputs(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "public_response": NodeSystemStateDefinition.model_validate({"type": "markdown"}),
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "needs_capability": NodeSystemStateDefinition.model_validate({"type": "boolean"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "reply_and_select_capability",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [
                    {"state": "public_response", "mode": "replace"},
                    {"state": "selected_capability", "mode": "replace"},
                    {"state": "needs_capability", "mode": "replace"},
                ],
                "config": {
                    "actionKey": "toograph_capability_selector",
                    "actionBindings": [
                        {
                            "actionKey": "toograph_capability_selector",
                            "outputMapping": {
                                "capability": "selected_capability",
                                "needs_capability": "needs_capability",
                            },
                        }
                    ],
                },
            }
        )
        stream_callback_calls: list[dict[str, object]] = []
        generated_kwargs: dict[str, object] = {}
        finalized: dict[str, object] = {}

        def build_stream_callback(**kwargs):
            stream_callback_calls.append(dict(kwargs))
            return "action-planning-delta"

        def generate_action_inputs(**kwargs):
            generated_kwargs.update(kwargs)
            return (
                {"toograph_capability_selector": {"capability": {"kind": "none"}, "needs_capability": False}},
                {"public_response": "Streaming hello."},
                "planned",
                [],
                kwargs["runtime_config"],
            )

        def invoke_action(action_func, action_inputs):
            return {
                "capability": action_inputs["capability"],
                "needs_capability": action_inputs["needs_capability"],
            }

        result = execute_agent_node(
            state_schema,
            node,
            {"question": "q"},
            {"state": {}},
            node_name="reply_and_select_capability",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"toograph_capability_selector": object()},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "toograph_capability_selector": ActionDefinition(
                    actionKey="toograph_capability_selector",
                    name="Capability Selector",
                    llmOutputSchema=[
                        ActionIoField(key="capability", name="Capability", valueType="json"),
                        ActionIoField(key="needs_capability", name="Needs Capability", valueType="boolean"),
                    ],
                )
            },
            invoke_action_func=invoke_action,
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=build_stream_callback,
            callable_accepts_keyword_func=lambda func, keyword: keyword in {"on_delta", "stream_state_keys"},
            generate_agent_action_inputs_func=generate_action_inputs,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("Action planning outputs should satisfy all node writes.")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: finalized.update(output_values),
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(stream_callback_calls[0]["output_keys"], ["public_response"])
        self.assertEqual(stream_callback_calls[0]["stream_state_keys"], ["public_response"])
        self.assertIs(generated_kwargs["on_delta"], "action-planning-delta")
        self.assertEqual(result["outputs"]["public_response"], "Streaming hello.")
        self.assertEqual(result["outputs"]["selected_capability"], {"kind": "none"})
        self.assertEqual(result["outputs"]["needs_capability"], False)
        self.assertEqual(finalized, result["outputs"])

    def test_execute_agent_node_passes_graph_action_runtime_context_to_action_input_planning(self) -> None:
        state_schema = {
            "user_goal": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "ok": NodeSystemStateDefinition.model_validate({"type": "boolean"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "operate_page",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "user_goal", "required": True}],
                "writes": [{"state": "ok", "mode": "replace"}],
                "config": {
                    "actionKey": "toograph_page_operator",
                    "actionBindings": [
                        {
                            "actionKey": "toograph_page_operator",
                            "outputMapping": {"ok": "ok"},
                        }
                    ],
                },
            }
        )
        captured: dict[str, Any] = {}

        def generate_action_inputs(**kwargs: Any):
            captured["runtime_config"] = kwargs["runtime_config"]
            return (
                {
                    "toograph_page_operator": {
                        "commands": ["click app.nav.runs"],
                        "cursor_lifecycle": "return_after_step",
                        "reason": "test",
                    }
                },
                {},
                "",
                [],
                kwargs["runtime_config"],
            )

        result = execute_agent_node(
            state_schema,
            node,
            {"user_goal": "打开运行历史"},
            {"metadata": {"action_runtime_context": {"page_path": "/editor"}}, "state": {}},
            node_name="operate_page",
            state={"run_id": "run-1", "metadata": {"action_runtime_context": {"page_path": "/editor"}}, "activity_events": []},
            get_action_registry_func=lambda *, include_disabled: {"toograph_page_operator": "toograph_page_operator"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "toograph_page_operator": ActionDefinition(
                    actionKey="toograph_page_operator",
                    name="页面操作",
                    llmOutputSchema=[
                        ActionIoField(key="commands", name="Commands", valueType="json"),
                        ActionIoField(key="cursor_lifecycle", name="Cursor Lifecycle", valueType="text"),
                        ActionIoField(key="reason", name="Reason", valueType="text"),
                    ],
                    stateOutputSchema=[ActionIoField(key="ok", name="OK", valueType="boolean")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            invoke_action_func=lambda action_func, action_inputs: {"ok": True},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=generate_action_inputs,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("mapped action output should satisfy node writes")
            ),
            finalize_agent_stream_delta_func=lambda **kwargs: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured["runtime_config"]["action_runtime_context"], {"page_path": "/editor"})
        self.assertEqual(result["outputs"], {"ok": True})

    def test_execute_agent_node_merges_capability_permission_policy_into_action_runtime_context(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "select_capability",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question", "required": True}],
                "writes": [{"state": "selected_capability", "mode": "replace"}],
                "config": {
                    "actionKey": "toograph_capability_selector",
                    "actionBindings": [
                        {
                            "actionKey": "toograph_capability_selector",
                            "outputMapping": {"capability": "selected_capability"},
                        }
                    ],
                },
            }
        )
        captured: dict[str, Any] = {}
        policy = {
            "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
            "approval_required_permission_tiers": ["risky"],
        }

        def generate_action_inputs(**kwargs: Any):
            captured["runtime_config"] = kwargs["runtime_config"]
            return (
                {"toograph_capability_selector": {"capability": {"kind": "none"}}},
                {},
                "",
                [],
                kwargs["runtime_config"],
            )

        execute_agent_node(
            state_schema,
            node,
            {"question": "需要联网搜索吗"},
            {
                "metadata": {
                    "action_runtime_context": {"page_path": "/editor"},
                    "capability_permission_policy": policy,
                },
                "state": {},
            },
            node_name="select_capability",
            state={"run_id": "run-1", "metadata": {"capability_permission_policy": policy}},
            get_action_registry_func=lambda *, include_disabled: {"toograph_capability_selector": object()},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "toograph_capability_selector": ActionDefinition(
                    actionKey="toograph_capability_selector",
                    name="Capability Selector",
                    llmOutputSchema=[
                        ActionIoField(key="capability", name="Capability", valueType="capability"),
                    ],
                    stateOutputSchema=[
                        ActionIoField(key="capability", name="Capability", valueType="capability"),
                    ],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            invoke_action_func=lambda action_func, action_inputs: {"capability": action_inputs["capability"]},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=generate_action_inputs,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("mapped action output should satisfy node writes")
            ),
            finalize_agent_stream_delta_func=lambda **kwargs: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(
            captured["runtime_config"]["action_runtime_context"],
            {
                "page_path": "/editor",
                "capability_permission_policy": policy,
            },
        )

    def test_execute_agent_node_passes_graph_action_runtime_context_to_action_invocation(self) -> None:
        state_schema = {
            "user_goal": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "ok": NodeSystemStateDefinition.model_validate({"type": "boolean"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "operate_page",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "user_goal", "required": True}],
                "writes": [{"state": "ok", "mode": "replace"}],
                "config": {
                    "actionKey": "toograph_page_operator",
                    "actionBindings": [
                        {
                            "actionKey": "toograph_page_operator",
                            "outputMapping": {"ok": "ok"},
                        }
                    ],
                },
            }
        )
        captured: dict[str, Any] = {}

        def generate_action_inputs(**kwargs: Any):
            return (
                {
                    "toograph_page_operator": {
                        "commands": ["graph_edit editor.graph.playback"],
                        "graph_edit_intents": [
                            {"kind": "create_node", "ref": "name_input", "nodeType": "input", "title": "input节点"},
                        ],
                        "cursor_lifecycle": "return_after_step",
                        "reason": "test",
                    }
                },
                {},
                "",
                [],
                kwargs["runtime_config"],
            )

        def invoke_action(action_func: Any, action_inputs: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
            captured["context"] = context
            return {"ok": True}

        result = execute_agent_node(
            state_schema,
            node,
            {"user_goal": "创建一个 input 节点"},
            {"metadata": {"action_runtime_context": {"page_path": "/editor/new"}}, "state": {}},
            node_name="operate_page",
            state={"run_id": "run-1", "metadata": {"action_runtime_context": {"page_path": "/editor/new"}}, "activity_events": []},
            get_action_registry_func=lambda *, include_disabled: {"toograph_page_operator": "toograph_page_operator"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "toograph_page_operator": ActionDefinition(
                    actionKey="toograph_page_operator",
                    name="页面操作",
                    llmOutputSchema=[
                        ActionIoField(key="commands", name="Commands", valueType="json"),
                        ActionIoField(key="graph_edit_intents", name="Graph Edit Intents", valueType="json"),
                        ActionIoField(key="cursor_lifecycle", name="Cursor Lifecycle", valueType="text"),
                        ActionIoField(key="reason", name="Reason", valueType="text"),
                    ],
                    stateOutputSchema=[ActionIoField(key="ok", name="OK", valueType="boolean")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            invoke_action_func=invoke_action,
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=callable_accepts_keyword,
            generate_agent_action_inputs_func=generate_action_inputs,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("mapped action output should satisfy node writes")
            ),
            finalize_agent_stream_delta_func=lambda **kwargs: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured["context"]["action_runtime_context"], {"page_path": "/editor/new"})
        self.assertEqual(result["outputs"], {"ok": True})

    def test_execute_agent_node_passes_bound_action_state_inputs_to_action_invocation_context(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "agent_loop_control": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "select_capability",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [
                    {"state": "question", "required": True},
                    {
                        "state": "agent_loop_control",
                        "required": False,
                        "binding": {
                            "kind": "action_input",
                            "actionKey": "toograph_capability_selector",
                            "fieldKey": "agent_loop_control",
                            "managed": True,
                        },
                    },
                ],
                "writes": [{"state": "selected_capability", "mode": "replace"}],
                "config": {
                    "actionKey": "toograph_capability_selector",
                    "actionBindings": [
                        {
                            "actionKey": "toograph_capability_selector",
                            "outputMapping": {"capability": "selected_capability"},
                        }
                    ],
                },
            }
        )
        loop_control = {
            "iteration_index": 2,
            "max_iterations": 6,
            "capability_call_count": 3,
            "max_capability_calls": 4,
        }
        captured: dict[str, Any] = {}

        def invoke_action(action_func: Any, action_inputs: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
            captured["context"] = context
            return {"capability": action_inputs["capability"]}

        execute_agent_node(
            state_schema,
            node,
            {"question": "需要联网搜索吗", "agent_loop_control": loop_control},
            {"metadata": {"action_runtime_context": {"page_path": "/buddy"}}, "state": {}},
            node_name="select_capability",
            state={"run_id": "run-1", "metadata": {"action_runtime_context": {"page_path": "/buddy"}}},
            get_action_registry_func=lambda *, include_disabled: {"toograph_capability_selector": object()},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "toograph_capability_selector": ActionDefinition(
                    actionKey="toograph_capability_selector",
                    name="Capability Selector",
                    stateInputSchema=[
                        ActionIoField(key="agent_loop_control", name="Agent Loop Control", valueType="json"),
                    ],
                    llmOutputSchema=[
                        ActionIoField(key="capability", name="Capability", valueType="capability"),
                    ],
                    stateOutputSchema=[
                        ActionIoField(key="capability", name="Capability", valueType="capability"),
                    ],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            invoke_action_func=invoke_action,
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=callable_accepts_keyword,
            generate_agent_action_inputs_func=fixed_action_inputs_func(
                {"toograph_capability_selector": {"capability": {"kind": "none"}}}
            ),
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("mapped action output should satisfy node writes")
            ),
            finalize_agent_stream_delta_func=lambda **kwargs: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(
            captured["context"]["action_runtime_context"],
            {
                "page_path": "/buddy",
                "action_state_inputs": {"agent_loop_control": loop_control},
                "action_state_input_sources": {"agent_loop_control": "agent_loop_control"},
            },
        )

    def test_execute_agent_node_records_action_activity_event(self) -> None:
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
                "config": {"actionKey": "custom"},
            }
        )
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            event = {"sequence": len(recorded_events) + 1, **kwargs}
            if kwargs.get("kind") == "action_invocation":
                event["activity_id"] = "activity_parent"
                event["invocation_id"] = "activity_parent"
            recorded_events.append(event)
            return event

        execute_agent_node(
            state_schema,
            node,
            {"question": "q"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"custom": object()},
            invoke_action_func=lambda action_func, action_inputs: {"echo": action_inputs["question"]},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=pass_through_action_inputs_func,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": "value"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
            record_activity_event_func=record_activity_event_func,
        )

        self.assertEqual(len(recorded_events), 1)
        event = recorded_events[0]
        self.assertEqual(event["kind"], "action_invocation")
        self.assertEqual(event["node_id"], "writer")
        self.assertEqual(event["status"], "succeeded")
        self.assertEqual(event["summary"], "Action 'custom' succeeded.")
        self.assertEqual(event["detail"]["action_key"], "custom")
        self.assertEqual(event["detail"]["binding_source"], "node_config")
        self.assertEqual(event["detail"]["input_keys"], ["question"])
        self.assertEqual(event["detail"]["output_keys"], ["echo"])

    def test_execute_agent_node_records_action_returned_activity_events(self) -> None:
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
                "config": {"actionKey": "custom"},
            }
        )
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            event = {"sequence": len(recorded_events) + 1, **kwargs}
            if kwargs.get("kind") == "action_invocation":
                event["activity_id"] = "activity_parent"
                event["invocation_id"] = "activity_parent"
            recorded_events.append(event)
            return event

        execute_agent_node(
            state_schema,
            node,
            {"question": "q"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"custom": object()},
            invoke_action_func=lambda action_func, action_inputs: {
                "echo": action_inputs["question"],
                "activity_events": [
                    {
                        "kind": "file_read",
                        "summary": "Read docs/a.md",
                        "detail": {"path": "docs/a.md", "characters": 42},
                    }
                ],
            },
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=pass_through_action_inputs_func,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": "value"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
            record_activity_event_func=record_activity_event_func,
        )

        self.assertEqual(len(recorded_events), 2)
        self.assertEqual(recorded_events[0]["kind"], "action_invocation")
        self.assertEqual(recorded_events[1]["kind"], "file_read")
        self.assertEqual(recorded_events[1]["node_id"], "writer")
        self.assertEqual(recorded_events[1]["summary"], "Read docs/a.md")
        self.assertEqual(recorded_events[1]["parent_activity_id"], "activity_parent")
        self.assertEqual(recorded_events[1]["invocation_id"], "activity_parent")
        self.assertEqual(recorded_events[1]["detail"]["action_key"], "custom")
        self.assertEqual(recorded_events[1]["detail"]["binding_source"], "node_config")
        self.assertEqual(recorded_events[1]["detail"]["path"], "docs/a.md")

    def test_execute_agent_node_records_local_folder_prompt_context_activity_event(self) -> None:
        state_schema = {
            "buddy_context": NodeSystemStateDefinition.model_validate({"type": "file"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "buddy_context"}],
                "writes": [{"state": "answer"}],
                "config": {},
            }
        )
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            recorded_events.append(kwargs)
            return {"sequence": len(recorded_events), **kwargs}

        execute_agent_node(
            state_schema,
            node,
            {
                "buddy_context": {
                    "kind": "local_folder",
                    "root": "/tmp/buddy_home",
                    "selected": ["SOUL.md", "MEMORY.md"],
                }
            },
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {},
            get_action_definition_registry_func=lambda *, include_disabled: {},
            invoke_action_func=lambda action_func, action_inputs: {},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=pass_through_action_inputs_func,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": "ok"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
            record_activity_event_func=record_activity_event_func,
        )

        self.assertEqual(len(recorded_events), 1)
        event = recorded_events[0]
        self.assertEqual(event["kind"], "file_context_read")
        self.assertEqual(event["node_id"], "writer")
        self.assertEqual(event["status"], "succeeded")
        self.assertEqual(event["summary"], "Prepared 2 selected local input files for LLM context.")
        self.assertEqual(event["detail"]["state_key"], "buddy_context")
        self.assertEqual(event["detail"]["root"], "/tmp/buddy_home")
        self.assertEqual(event["detail"]["file_count"], 2)
        self.assertEqual(event["detail"]["files"], ["SOUL.md", "MEMORY.md"])

    def test_execute_agent_node_records_local_folder_context_for_action_input_planning(self) -> None:
        state_schema = {
            "buddy_context": NodeSystemStateDefinition.model_validate({"type": "file"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "buddy_context"}],
                "writes": [{"state": "answer"}],
                "config": {"actionKey": "custom"},
            }
        )
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            recorded_events.append(kwargs)
            return {"sequence": len(recorded_events), **kwargs}

        result = execute_agent_node(
            state_schema,
            node,
            {
                "buddy_context": {
                    "kind": "local_folder",
                    "root": "/tmp/buddy_home",
                    "selected": ["SOUL.md"],
                }
            },
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"custom": object()},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "custom": ActionDefinition(
                    actionKey="custom",
                    name="Custom",
                    stateOutputSchema=[ActionIoField(key="answer", name="Answer", valueType="text")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            invoke_action_func=lambda action_func, action_inputs: {"answer": "action answer"},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=fixed_action_inputs_func({"custom": {}}),
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("mapped action output should skip final response generation")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
            record_activity_event_func=record_activity_event_func,
        )

        self.assertEqual(result["outputs"], {"answer": "action answer"})
        self.assertEqual([event["kind"] for event in recorded_events], ["file_context_read", "action_invocation"])
        self.assertEqual(recorded_events[0]["summary"], "Prepared 1 selected local input file for LLM context.")
        self.assertEqual(recorded_events[0]["detail"]["phase"], "action_input_planning")
        self.assertEqual(recorded_events[0]["detail"]["files"], ["SOUL.md"])

    def test_execute_agent_node_treats_knowledge_base_state_as_normal_action_input(self) -> None:
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
                "config": {"actionKey": "custom_retrieval"},
            }
        )

        result = execute_agent_node(
            state_schema,
            node,
            {"kb": "docs", "question": "q"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"custom_retrieval": object()},
            invoke_action_func=lambda action_func, action_inputs: {"context": action_inputs["question"]},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=pass_through_action_inputs_func,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": action_context["custom_retrieval"]["context"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["action_outputs"][0]["inputs"], {"kb": "docs", "question": "q"})
        self.assertEqual(result["outputs"], {"answer": "q"})

    def test_execute_agent_node_static_action_ignores_capability_state_inputs(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "writer",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "question"}],
                "writes": [{"state": "answer"}],
                "config": {"actionKey": "web_search"},
            }
        )
        invoked: list[str] = []

        def invoke_action_func(action_func: str, action_inputs: dict[str, object]) -> dict[str, object]:
            invoked.append(action_func)
            return {"status": "succeeded", "summary": f"{action_func} result"}

        result = execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {"kind": "action", "key": "file_reader", "name": "File Reader"},
                "question": "q",
            },
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {
                "web_search": "web_search",
                "file_reader": "file_reader",
            },
            get_action_definition_registry_func=lambda *, include_disabled: {},
            invoke_action_func=invoke_action_func,
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_action_inputs_func=pass_through_action_inputs_func,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": ",".join(action_context)},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(invoked, ["web_search"])
        self.assertEqual(result["selected_actions"], ["web_search"])
        self.assertEqual(result["outputs"], {"answer": "web_search"})

    def test_execute_agent_node_uses_llm_generated_action_inputs(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "answer": NodeSystemStateDefinition.model_validate({"type": "text"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "searcher",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [{"state": "answer"}],
                "config": {
                    "actionKey": "web_search",
                    "actionBindings": [{"actionKey": "web_search"}],
                },
            }
        )
        captured_inputs: list[dict[str, object]] = []

        result = execute_agent_node(
            state_schema,
            node,
            {"question": "帮我总结鸣潮最新版本内容"},
            {"state": {}},
            node_name="searcher",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": "web_search"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "web_search": ActionDefinition(
                    actionKey="web_search",
                    name="Web Search",
                    llmOutputSchema=[
                        ActionIoField(key="query", name="Query", valueType="text"),
                    ],
                    stateOutputSchema=[ActionIoField(key="summary", name="Summary", valueType="markdown")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=lambda **kwargs: (
                {"web_search": {"query": "鸣潮 最新版本 更新内容"}},
                {},
                "planned action inputs",
                [],
                kwargs["runtime_config"],
            ),
            invoke_action_func=lambda action_func, action_inputs: captured_inputs.append(dict(action_inputs))
            or {"status": "succeeded", "summary": "searched"},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": action_context["web_search"]["summary"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_inputs, [{"query": "鸣潮 最新版本 更新内容"}])
        self.assertEqual(result["action_outputs"][0]["inputs"], {"query": "鸣潮 最新版本 更新内容"})
        self.assertEqual(result["action_outputs"][0]["input_source"], "agent_llm")
        self.assertEqual(result["reasoning"], "")
        self.assertEqual(result["outputs"], {"answer": "searched"})

    def test_execute_agent_node_uses_llm_inputs_for_capability_state_selected_action(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "query": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "tool_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "query"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        captured_inputs: list[dict[str, object]] = []

        result = execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {"kind": "action", "key": "web_search"},
                "query": "fallback query",
            },
            {"state": {}},
            node_name="tool_executor",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": "web_search"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "web_search": ActionDefinition(
                    actionKey="web_search",
                    name="Web Search",
                    llmOutputSchema=[
                        ActionIoField(key="query", name="Query", valueType="text"),
                        ActionIoField(key="max_results", name="Max Results", valueType="text"),
                    ],
                    stateOutputSchema=[
                        ActionIoField(
                            key="summary",
                            name="Summary",
                            valueType="markdown",
                            description="Search result summary.",
                        )
                    ],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func(
                {"web_search": {"query": "Wuthering Waves latest version", "max_results": "8"}}
            ),
            invoke_action_func=lambda action_func, action_inputs: captured_inputs.append(dict(action_inputs))
            or {"status": "succeeded", "summary": "searched"},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic action results should be packaged without an extra LLM response")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_inputs, [{"query": "Wuthering Waves latest version", "max_results": "8"}])
        self.assertEqual(result["action_outputs"][0]["node_id"], "tool_executor")
        self.assertEqual(result["action_outputs"][0]["binding_source"], "capability_state")
        self.assertEqual(result["action_outputs"][0]["output_mapping"], {})
        self.assertEqual(result["action_outputs"][0]["output_mapping_details"], [])
        self.assertEqual(
            result["action_outputs"][0]["inputs"],
            {"query": "Wuthering Waves latest version", "max_results": "8"},
        )
        self.assertEqual(
            result["outputs"],
            {
                "dynamic_result": {
                    "kind": "result_package",
                    "sourceType": "action",
                    "sourceKey": "web_search",
                    "sourceName": "Web Search",
                    "status": "succeeded",
                    "inputs": {"query": "Wuthering Waves latest version", "max_results": "8"},
                    "outputs": {
                        "summary": {
                            "name": "Summary",
                            "description": "Search result summary.",
                            "type": "markdown",
                            "value": "searched",
                        }
                    },
                    "durationMs": result["outputs"]["dynamic_result"]["durationMs"],
                    "error": "",
                    "errorType": "",
                }
            },
        )
        self.assertIsInstance(result["final_result"], str)
        self.assertIn('"kind": "result_package"', result["final_result"].replace("'", '"'))

    def test_execute_agent_node_pauses_before_ask_first_risky_dynamic_action(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "request": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "tool_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "request"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            recorded_events.append(kwargs)
            return {"sequence": len(recorded_events), **kwargs}

        result = execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {"kind": "action", "key": "local_workspace_executor"},
                "request": "write a file",
            },
            {"state": {}},
            node_name="execute_capability",
            state={"run_id": "run-1", "metadata": {"graph_permission_mode": "ask_first"}},
            get_action_registry_func=lambda *, include_disabled: {"local_workspace_executor": "local_workspace_executor"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "local_workspace_executor": ActionDefinition(
                    actionKey="local_workspace_executor",
                    name="Local Workspace Executor",
                    permissions=["file_write", "subprocess"],
                    llmOutputSchema=[ActionIoField(key="path", name="Path", valueType="text")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func(
                {"local_workspace_executor": {"path": "action/user/demo/ACTION.md"}}
            ),
            invoke_action_func=lambda action_func, action_inputs: (_ for _ in ()).throw(
                AssertionError("risky action should not execute before approval")
            ),
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic action approval should pause before response generation")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
            record_activity_event_func=record_activity_event_func,
        )

        self.assertTrue(result["awaiting_human"])
        approval = result["pending_permission_approval"]
        self.assertEqual(approval["kind"], "capability_permission_approval")
        self.assertEqual(approval["node_id"], "execute_capability")
        self.assertEqual(approval["capability_key"], "local_workspace_executor")
        self.assertEqual(approval["binding_source"], "capability_state")
        self.assertEqual(approval["permissions"], ["file_write", "subprocess"])
        self.assertEqual(approval["inputs"], {"path": "action/user/demo/ACTION.md"})
        self.assertEqual(recorded_events[0]["kind"], "permission_pause")
        self.assertEqual(recorded_events[0]["node_id"], "execute_capability")
        self.assertEqual(recorded_events[0]["status"], "awaiting_human")
        self.assertEqual(recorded_events[0]["detail"]["action_key"], "local_workspace_executor")
        self.assertEqual(recorded_events[0]["detail"]["permissions"], ["file_write", "subprocess"])

    def test_execute_agent_node_resumes_risky_action_with_stored_approval_inputs(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "request": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "tool_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "request"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        stored_inputs = {"path": "action/user/demo/ACTION.md", "content": "# Demo"}
        state = {
            "run_id": "run-1",
            "metadata": {
                "graph_permission_mode": "ask_first",
                "pending_permission_approval": build_pending_permission_approval(
                    state={"run_id": "run-1", "metadata": {"graph_permission_mode": "ask_first"}},
                    node_name="execute_capability",
                    action_key="local_workspace_executor",
                    action_name="Local Workspace Executor",
                    binding_source="capability_state",
                    permissions=["file_write"],
                    inputs=stored_inputs,
                ),
                "pending_permission_approval_resume_payload": {},
            },
        }
        captured_inputs: list[dict[str, object]] = []

        result = execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {"kind": "action", "key": "local_workspace_executor"},
                "request": "write a file",
            },
            {"state": {}},
            node_name="execute_capability",
            state=state,
            get_action_registry_func=lambda *, include_disabled: {"local_workspace_executor": "local_workspace_executor"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "local_workspace_executor": ActionDefinition(
                    actionKey="local_workspace_executor",
                    name="Local Workspace Executor",
                    permissions=["file_write"],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=lambda **kwargs: (_ for _ in ()).throw(
                AssertionError("approved resume should reuse stored action inputs")
            ),
            invoke_action_func=lambda action_func, action_inputs: captured_inputs.append(dict(action_inputs))
            or {"status": "succeeded", "path": action_inputs["path"]},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic action results should be packaged without an extra LLM response")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_inputs, [stored_inputs])
        self.assertNotIn("pending_permission_approval", state["metadata"])
        self.assertEqual(state["permission_approvals"][0]["status"], "approved")
        self.assertEqual(result["outputs"]["dynamic_result"]["inputs"], stored_inputs)

    def test_execute_agent_node_resumes_risky_action_denial_as_result_package_failure(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "request": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "tool_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "request"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        stored_inputs = {"path": "action/user/demo/ACTION.md", "content": "# Demo"}
        state = {
            "run_id": "run-1",
            "metadata": {
                "graph_permission_mode": "ask_first",
                "pending_permission_approval": build_pending_permission_approval(
                    state={"run_id": "run-1", "metadata": {"graph_permission_mode": "ask_first"}},
                    node_name="execute_capability",
                    action_key="local_workspace_executor",
                    action_name="Local Workspace Executor",
                    binding_source="capability_state",
                    permissions=["file_write"],
                    inputs=stored_inputs,
                ),
                "pending_permission_approval_resume_payload": {
                    "permission_approval": {
                        "decision": "denied",
                        "reason": "不要写本地文件",
                    }
                },
            },
        }

        result = execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {"kind": "action", "key": "local_workspace_executor"},
                "request": "write a file",
            },
            {"state": {}},
            node_name="execute_capability",
            state=state,
            get_action_registry_func=lambda *, include_disabled: {"local_workspace_executor": "local_workspace_executor"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "local_workspace_executor": ActionDefinition(
                    actionKey="local_workspace_executor",
                    name="Local Workspace Executor",
                    permissions=["file_write"],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=lambda **kwargs: (_ for _ in ()).throw(
                AssertionError("denied resume should reuse stored permission inputs")
            ),
            invoke_action_func=lambda action_func, action_inputs: (_ for _ in ()).throw(
                AssertionError("denied permission should not execute the action")
            ),
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic denial results should be packaged without an extra LLM response")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertNotIn("pending_permission_approval", state["metadata"])
        self.assertEqual(state["permission_approvals"][0]["status"], "denied")
        self.assertEqual(state["permission_approvals"][0]["denial_reason"], "不要写本地文件")
        package = result["outputs"]["dynamic_result"]
        self.assertEqual(package["status"], "failed")
        self.assertEqual(package["errorType"], "permission_denied")
        self.assertEqual(package["error"], "Permission denied for action 'local_workspace_executor': 不要写本地文件")
        self.assertEqual(package["inputs"], stored_inputs)
        self.assertEqual(result["action_outputs"][0]["status"], "failed")
        self.assertEqual(result["action_outputs"][0]["error_type"], "permission_denied")

    def test_execute_agent_node_uses_llm_inputs_for_capability_state_selected_subgraph(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "subgraph_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "question"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        captured_subgraph_inputs: list[dict[str, object]] = []

        def execute_subgraph_capability_func(**kwargs):
            captured_subgraph_inputs.append(dict(kwargs["subgraph_inputs"]))
            return {
                "source_name": "Advanced Web Research",
                "status": "succeeded",
                "child_run_id": "run_child_research",
                "outputs": {"public_response": "最终答案"},
                "output_definitions": {
                    "public_response": {
                        "name": "最终回复",
                        "description": "面向用户展示的最终整理结果。",
                        "type": "markdown",
                    }
                },
                "duration_ms": 12,
                "error": "",
                "error_type": "",
                "warnings": [],
                "subgraph": {"graph_id": "advanced_web_research_loop"},
            }

        result = execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {
                    "kind": "subgraph",
                    "key": "advanced_web_research_loop",
                    "name": "高级联网搜索",
                },
                "question": "总结今天 AI 新闻",
            },
            {"state": {}},
            node_name="subgraph_executor",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {},
            get_action_definition_registry_func=lambda *, include_disabled: {},
            generate_agent_subgraph_inputs_func=lambda **kwargs: (
                {"advanced_web_research_loop": {"user_question": "总结今天 AI 新闻"}},
                "planned subgraph inputs",
                [],
                kwargs["runtime_config"],
            ),
            execute_subgraph_capability_func=execute_subgraph_capability_func,
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic subgraph results should be packaged without an extra LLM response")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_subgraph_inputs, [{"user_question": "总结今天 AI 新闻"}])
        self.assertEqual(result["selected_actions"], [])
        self.assertEqual(result["selected_capabilities"], [{"kind": "subgraph", "key": "advanced_web_research_loop"}])
        self.assertEqual(result["capability_outputs"][0]["node_id"], "subgraph_executor")
        self.assertEqual(result["capability_outputs"][0]["binding_source"], "capability_state")
        self.assertEqual(result["capability_outputs"][0]["input_source"], "agent_llm")
        self.assertEqual(result["capability_outputs"][0]["inputs"], {"user_question": "总结今天 AI 新闻"})
        self.assertEqual(
            result["outputs"],
            {
                "dynamic_result": {
                    "kind": "result_package",
                    "sourceType": "subgraph",
                    "sourceKey": "advanced_web_research_loop",
                    "sourceName": "Advanced Web Research",
                    "status": "succeeded",
                    "childRunId": "run_child_research",
                    "child_run_id": "run_child_research",
                    "triggered_run_id": "run_child_research",
                    "inputs": {"user_question": "总结今天 AI 新闻"},
                    "outputs": {
                        "public_response": {
                            "name": "最终回复",
                            "description": "面向用户展示的最终整理结果。",
                            "type": "markdown",
                            "value": "最终答案",
                        }
                    },
                    "durationMs": 12,
                    "error": "",
                    "errorType": "",
                }
            },
        )
        self.assertIn('"sourceType": "subgraph"', result["final_result"].replace("'", '"'))

    def test_execute_agent_node_records_dynamic_subgraph_activity_event(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "subgraph_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}, {"state": "question"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        recorded_events: list[dict[str, Any]] = []

        def record_activity_event_func(state: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
            recorded_events.append(kwargs)
            return {"sequence": len(recorded_events), **kwargs}

        execute_agent_node(
            state_schema,
            node,
            {
                "selected_capability": {
                    "kind": "subgraph",
                    "key": "advanced_web_research_loop",
                    "name": "高级联网搜索",
                },
                "question": "总结今天 AI 新闻",
            },
            {"state": {}},
            node_name="subgraph_executor",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {},
            get_action_definition_registry_func=lambda *, include_disabled: {},
            generate_agent_subgraph_inputs_func=lambda **kwargs: (
                {"advanced_web_research_loop": {"user_question": "总结今天 AI 新闻"}},
                "planned subgraph inputs",
                [],
                kwargs["runtime_config"],
            ),
            execute_subgraph_capability_func=lambda **kwargs: {
                "source_name": "Advanced Web Research",
                "status": "succeeded",
                "outputs": {"public_response": "最终答案"},
                "output_definitions": {},
                "duration_ms": 12,
                "error": "",
                "error_type": "",
                "warnings": [],
                "subgraph": {"graph_id": "advanced_web_research_loop"},
            },
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic subgraph results should be packaged without an extra LLM response")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
            record_activity_event_func=record_activity_event_func,
        )

        self.assertEqual(len(recorded_events), 1)
        self.assertEqual(recorded_events[0]["kind"], "subgraph_invocation")
        self.assertEqual(recorded_events[0]["summary"], "Subgraph 'advanced_web_research_loop' succeeded.")
        self.assertEqual(recorded_events[0]["node_id"], "subgraph_executor")
        self.assertEqual(recorded_events[0]["status"], "succeeded")
        self.assertEqual(recorded_events[0]["duration_ms"], 12)
        self.assertEqual(recorded_events[0]["detail"]["capability_key"], "advanced_web_research_loop")
        self.assertEqual(recorded_events[0]["detail"]["input_keys"], ["user_question"])
        self.assertEqual(recorded_events[0]["detail"]["output_keys"], ["public_response"])

    def test_execute_agent_node_infers_action_output_mapping_from_state_outputs(self) -> None:
        state_schema = {
            "query": NodeSystemStateDefinition.model_validate({"name": "Search Query", "type": "text"}),
            "source_urls": NodeSystemStateDefinition.model_validate(
                {
                    "name": "联网搜索 Source URLs",
                    "description": "搜索 Action返回的原文网页 URL 列表。",
                    "type": "json",
                }
            ),
            "artifact_paths": NodeSystemStateDefinition.model_validate(
                {
                    "name": "联网搜索 Artifact Paths",
                    "description": "搜索 Action写入本地的原文文档路径。",
                    "type": "file",
                }
            ),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "searcher",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "query"}],
                "writes": [{"state": "source_urls"}, {"state": "artifact_paths"}],
                "config": {"actionKey": "web_search"},
            }
        )
        action_result = {
            "status": "succeeded",
            "source_urls": ["https://example.test/source"],
            "artifact_paths": ["run/doc_001.md"],
            "errors": [],
        }

        result = execute_agent_node(
            state_schema,
            node,
            {"query": "TooGraph latest"},
            {"state": {}},
            node_name="searcher",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": "web_search"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "web_search": ActionDefinition(
                    actionKey="web_search",
                    name="Web Search",
                    llmOutputSchema=[ActionIoField(key="query", name="Query", valueType="text")],
                    stateOutputSchema=[
                        ActionIoField(
                            key="source_urls",
                            name="Source URLs",
                            valueType="json",
                            description="Original source URLs.",
                        ),
                        ActionIoField(
                            key="artifact_paths",
                            name="Artifact Paths",
                            valueType="file",
                            description="Downloaded local documents.",
                        ),
                        ActionIoField(key="errors", name="Errors", valueType="json"),
                    ],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=lambda **kwargs: (
                {"web_search": {"query": "TooGraph latest"}},
                {},
                "planned action inputs",
                [],
                kwargs["runtime_config"],
            ),
            invoke_action_func=lambda action_func, action_inputs: action_result,
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("mapped action outputs should not be repackaged by the LLM")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(
            result["outputs"],
            {
                "source_urls": ["https://example.test/source"],
                "artifact_paths": ["run/doc_001.md"],
            },
        )
        self.assertEqual(
            result["action_outputs"][0]["state_writes"],
            {
                "source_urls": ["https://example.test/source"],
                "artifact_paths": ["run/doc_001.md"],
            },
        )
        self.assertEqual(
            result["action_outputs"][0]["output_mapping"],
            {
                "source_urls": "source_urls",
                "artifact_paths": "artifact_paths",
            },
        )
        self.assertEqual(
            result["action_outputs"][0]["output_mapping_details"],
            [
                {
                    "output_key": "source_urls",
                    "output_name": "Source URLs",
                    "output_type": "json",
                    "output_description": "Original source URLs.",
                    "state_key": "source_urls",
                    "state_name": "联网搜索 Source URLs",
                    "state_type": "json",
                    "state_description": "搜索 Action返回的原文网页 URL 列表。",
                },
                {
                    "output_key": "artifact_paths",
                    "output_name": "Artifact Paths",
                    "output_type": "file",
                    "output_description": "Downloaded local documents.",
                    "state_key": "artifact_paths",
                    "state_name": "联网搜索 Artifact Paths",
                    "state_type": "file",
                    "state_description": "搜索 Action写入本地的原文文档路径。",
                },
            ],
        )

    def test_execute_agent_node_reports_missing_llm_generated_action_input_without_invoking_script(self) -> None:
        state_schema = {
            "selected_capability": NodeSystemStateDefinition.model_validate({"type": "capability"}),
            "dynamic_result": NodeSystemStateDefinition.model_validate({"type": "result_package"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "tool_executor",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "selected_capability"}],
                "writes": [{"state": "dynamic_result"}],
                "config": {"actionKey": ""},
            }
        )
        invoked: list[str] = []

        result = execute_agent_node(
            state_schema,
            node,
            {"selected_capability": {"kind": "action", "key": "web_search"}},
            {"state": {}},
            node_name="tool_executor",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": "web_search"},
            get_action_definition_registry_func=lambda *, include_disabled: {
                "web_search": ActionDefinition(
                    actionKey="web_search",
                    name="Web Search",
                    llmOutputSchema=[
                        ActionIoField(key="query", name="Query", valueType="text"),
                    ],
                    stateOutputSchema=[ActionIoField(key="error", name="Error", valueType="text")],
                    runtimeReady=True,
                    runtimeRegistered=True,
                )
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {}}),
            invoke_action_func=lambda action_func, action_inputs: invoked.append(str(action_func)) or {},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("dynamic action failures should be packaged without an extra LLM response")
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(invoked, [])
        self.assertEqual(result["selected_actions"], ["web_search"])
        self.assertEqual(result["action_outputs"][0]["binding_source"], "capability_state")
        self.assertEqual(result["action_outputs"][0]["output_mapping"], {})
        self.assertEqual(result["action_outputs"][0]["output_mapping_details"], [])
        self.assertEqual(result["action_outputs"][0]["status"], "failed")
        self.assertEqual(result["action_outputs"][0]["error_type"], "missing_action_llm_output")
        self.assertIn("query", result["action_outputs"][0]["error"])
        self.assertEqual(result["outputs"]["dynamic_result"]["kind"], "result_package")
        self.assertEqual(result["outputs"]["dynamic_result"]["status"], "failed")
        self.assertEqual(result["outputs"]["dynamic_result"]["errorType"], "missing_action_llm_output")
        self.assertIn("query", result["outputs"]["dynamic_result"]["error"])
        self.assertIsInstance(result["final_result"], str)
        self.assertIn("Action 'web_search' failed before execution", result["warnings"][0])

    def test_execute_agent_node_maps_bound_action_outputs_into_state_outputs(self) -> None:
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
                    "actionKey": "summarize_text",
                    "actionBindings": [
                        {
                            "actionKey": "summarize_text",
                            "outputMapping": {"summary": "summary_text"},
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
            get_action_registry_func=lambda *, include_disabled: {
                "summarize_text": object(),
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func(
                {"summarize_text": {"text": "Long text", "max_sentences": 2}}
            ),
            invoke_action_func=lambda action_func, action_inputs: {
                "summary": f"{action_inputs['text']} / {action_inputs['max_sentences']}",
                "key_points": ["one"],
            },
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": f"Final using {action_context['summarize_text']['summary']}"},
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
        self.assertEqual(result["action_outputs"][0]["inputs"], {"text": "Long text", "max_sentences": 2})
        self.assertEqual(result["action_outputs"][0]["output_mapping"], {"summary": "summary_text"})
        self.assertEqual(result["action_outputs"][0]["state_writes"], {"summary_text": "Long text / 2"})
        self.assertEqual(result["action_outputs"][0]["status"], "succeeded")

    def test_execute_agent_node_skips_generation_when_bound_action_outputs_cover_all_writes(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "context": NodeSystemStateDefinition.model_validate({"type": "markdown"}),
            "snapshot": NodeSystemStateDefinition.model_validate({"type": "json"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "context_loader",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [
                    {"state": "context", "mode": "replace"},
                    {"state": "snapshot", "mode": "replace"},
                ],
                "config": {
                    "actionKey": "load_context",
                    "actionBindings": [
                        {
                            "actionKey": "load_context",
                            "outputMapping": {"context": "context", "snapshot": "snapshot"},
                        }
                    ],
                },
            }
        )
        finalized: dict[str, object] = {}

        def generate_agent_response_func(*args, **kwargs):
            raise AssertionError("action-only LLM nodes must not call the language model")

        result = execute_agent_node(
            state_schema,
            node,
            {"question": "q"},
            {"state": {}},
            node_name="context_loader",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"load_context": object()},
            generate_agent_action_inputs_func=fixed_action_inputs_func({"load_context": {"question": "q"}}),
            invoke_action_func=lambda action_func, action_inputs: {
                "status": "succeeded",
                "context": "loaded context",
                "snapshot": {"ok": True},
            },
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=generate_agent_response_func,
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: finalized.update(output_values),
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["outputs"], {"context": "loaded context", "snapshot": {"ok": True}})
        self.assertEqual(result["response"], {})
        self.assertEqual(result["reasoning"], "")
        self.assertEqual(result["runtime_config"], {"runtime": "initial"})
        self.assertEqual(finalized, {"context": "loaded context", "snapshot": {"ok": True}})

    def test_execute_agent_node_writes_custom_action_planning_outputs_without_agent_response(self) -> None:
        state_schema = {
            "question": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "planner_notes": NodeSystemStateDefinition.model_validate({"type": "markdown"}),
            "source_documents": NodeSystemStateDefinition.model_validate({"type": "json"}),
            "draft_answer": NodeSystemStateDefinition.model_validate({"type": "markdown"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "search_planner",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "question"}],
                "writes": [
                    {"state": "planner_notes", "mode": "replace"},
                    {"state": "source_documents", "mode": "replace"},
                    {"state": "draft_answer", "mode": "replace"},
                ],
                "config": {
                    "actionKey": "web_search",
                    "actionBindings": [
                        {
                            "actionKey": "web_search",
                            "outputMapping": {"source_documents": "source_documents"},
                        }
                    ],
                },
            }
        )
        source_documents = [{"title": "TooGraph", "url": "https://example.com"}]
        finalized: dict[str, object] = {}
        invoked_inputs: list[dict[str, object]] = []

        def generate_action_inputs(**kwargs):
            return (
                {"web_search": {"query": "TooGraph RAG"}},
                {
                    "planner_notes": "Search first, then synthesize.",
                    "draft_answer": "Initial draft.",
                },
                "planned",
                [],
                kwargs["runtime_config"],
            )

        def invoke_action(action_func, action_inputs):
            invoked_inputs.append(dict(action_inputs))
            return {
                "status": "succeeded",
                "source_documents": source_documents,
            }

        def generate_agent_response_func(*args, **kwargs):
            raise AssertionError("custom outputs produced by Action planning must not trigger a second LLM call")

        result = execute_agent_node(
            state_schema,
            node,
            {"question": "q"},
            {"state": {}},
            node_name="search_planner",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": object()},
            generate_agent_action_inputs_func=generate_action_inputs,
            invoke_action_func=invoke_action,
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=generate_agent_response_func,
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: finalized.update(output_values),
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(invoked_inputs, [{"query": "TooGraph RAG"}])
        self.assertEqual(
            result["outputs"],
            {
                "planner_notes": "Search first, then synthesize.",
                "source_documents": source_documents,
                "draft_answer": "Initial draft.",
            },
        )
        self.assertEqual(result["response"], {})
        self.assertEqual(result["reasoning"], "")
        self.assertEqual(result["action_input_reasoning"], "planned")
        self.assertEqual(result["llm_phases"], ["action_input_planning"])
        self.assertEqual(finalized, result["outputs"])

    def test_execute_agent_node_preserves_mapped_action_output_when_response_omits_that_state(self) -> None:
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
                    "actionKey": "web_search",
                    "actionBindings": [
                        {
                            "actionKey": "web_search",
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
            {"query": "TooGraph"},
            {"state": {}},
            node_name="web_search_agent",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": object()},
            generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {"query": "TooGraph"}}),
            invoke_action_func=lambda action_func, action_inputs: {
                "status": "succeeded",
                "source_documents": source_documents,
            },
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
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

    def test_execute_agent_node_preserves_append_action_outputs_when_response_mentions_same_state(self) -> None:
        state_schema = {
            "query": NodeSystemStateDefinition.model_validate({"type": "text"}),
            "search_report": NodeSystemStateDefinition.model_validate({"type": "markdown"}),
            "source_documents": NodeSystemStateDefinition.model_validate({"type": "file"}),
        }
        node = NodeSystemAgentNode.model_validate(
            {
                "kind": "agent",
                "name": "web_search_agent",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [{"state": "query"}],
                "writes": [
                    {"state": "search_report", "mode": "replace"},
                    {"state": "source_documents", "mode": "append"},
                ],
                "config": {
                    "actionKey": "web_search",
                    "actionBindings": [
                        {
                            "actionKey": "web_search",
                            "outputMapping": {"source_documents": "source_documents"},
                        }
                    ],
                },
            }
        )
        source_documents = [{"local_path": "run_1/web_search/doc_001.md"}]

        result = execute_agent_node(
            state_schema,
            node,
            {"query": "TooGraph"},
            {"state": {}},
            node_name="web_search_agent",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {"web_search": object()},
            generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {"query": "TooGraph"}}),
            invoke_action_func=lambda action_func, action_inputs: {
                "status": "succeeded",
                "source_documents": source_documents,
            },
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {
                    "search_report": "report",
                    "source_documents": [{"local_path": "llm_summary_only.md"}],
                },
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
                    "actionKey": "web_search",
                    "taskInstruction": "联网搜索，告知今天的日期和北京天气",
                },
            }
        )
        captured_inputs: dict[str, object] = {}

        result = execute_agent_node(
            state_schema,
            node,
            {"name": "TooGraph 用户"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {"query": "Beijing weather today"}}),
            invoke_action_func=lambda action_func, action_inputs: captured_inputs.update(action_inputs)
            or {"status": "succeeded", "summary": "联网结果", "context": "联网上下文"},
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": action_context["web_search"]["summary"]},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(captured_inputs, {"query": "Beijing weather today"})
        self.assertEqual(result["action_outputs"][0]["inputs"], {"query": "Beijing weather today"})
        self.assertEqual(result["outputs"]["answer"], "联网结果")

    def test_execute_agent_node_rejects_static_action_input_mapping(self) -> None:
        with self.assertRaisesRegex(ValueError, "inputMapping"):
            NodeSystemAgentNode.model_validate(
                {
                    "kind": "agent",
                    "name": "writer",
                    "ui": {"position": {"x": 0, "y": 0}},
                    "reads": [{"state": "question"}],
                    "writes": [{"state": "answer"}],
                    "config": {
                        "actionKey": "web_search",
                        "actionBindings": [
                            {
                                "actionKey": "web_search",
                                "inputMapping": {"query": "question"},
                            }
                        ],
                    },
                }
            )

    def test_execute_agent_node_passes_capability_artifact_invocation_context(self) -> None:
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
                    "actionKey": "web_search",
                    "actionBindings": [
                        {
                            "actionKey": "web_search",
                        }
                    ],
                },
            }
        )
        captured_contexts: list[dict[str, object]] = []

        result = execute_agent_node(
            state_schema,
            node,
            {"query": "TooGraph"},
            {"state": {}},
            node_name="searcher",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {"query": "TooGraph"}}),
            invoke_action_func=lambda action_func, action_inputs, *, context=None: captured_contexts.append(context or {})
            or {"status": "succeeded", "summary": "联网结果"},
            resolve_agent_runtime_config_func=lambda agent_node: {},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
            callable_accepts_keyword_func=callable_accepts_keyword,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": action_context["web_search"]["summary"]},
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
        self.assertEqual(context["capability_key"], "web_search")
        self.assertTrue(str(context["artifact_relative_dir"]).startswith("run-1/searcher/web_search/invocation_001"))

    def test_execute_agent_node_increments_capability_artifact_invocation_context_across_repeated_node_runs(self) -> None:
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
                    "actionKey": "web_search",
                    "actionBindings": [
                        {
                            "actionKey": "web_search",
                        }
                    ],
                },
            }
        )
        run_state: dict[str, object] = {"run_id": "run-1"}
        captured_contexts: list[dict[str, object]] = []

        def invoke_action_func(action_func: object, action_inputs: dict[str, object], *, context=None) -> dict[str, object]:
            captured_contexts.append(context or {})
            return {"status": "succeeded", "summary": "联网结果"}

        for _ in range(2):
            execute_agent_node(
                state_schema,
                node,
                {"query": "TooGraph"},
                {"state": {}},
                node_name="searcher",
                state=run_state,
                get_action_registry_func=lambda *, include_disabled: {
                    "web_search": object(),
                },
                generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {"query": "TooGraph"}}),
                invoke_action_func=invoke_action_func,
                resolve_agent_runtime_config_func=lambda agent_node: {},
                build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: None,
                callable_accepts_keyword_func=callable_accepts_keyword,
                generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                    {"answer": action_context["web_search"]["summary"]},
                    "",
                    [],
                    runtime_config,
                ),
                finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
                first_truthy_func=lambda values: next((value for value in values if value), None),
            )

        self.assertEqual(len(captured_contexts), 2)
        self.assertTrue(
            str(captured_contexts[0]["artifact_relative_dir"]).startswith(
                "run-1/searcher/web_search/invocation_001"
            )
        )
        self.assertTrue(
            str(captured_contexts[1]["artifact_relative_dir"]).startswith(
                "run-1/searcher/web_search/invocation_002"
            )
        )

    def test_execute_agent_node_surfaces_failed_action_result_status(self) -> None:
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
                "config": {"actionKey": "web_search"},
            }
        )

        result = execute_agent_node(
            state_schema,
            node,
            {"name": "TooGraph 用户"},
            {"state": {}},
            node_name="writer",
            state={"run_id": "run-1"},
            get_action_registry_func=lambda *, include_disabled: {
                "web_search": object(),
            },
            generate_agent_action_inputs_func=fixed_action_inputs_func({"web_search": {"query": "TooGraph"}}),
            invoke_action_func=lambda action_func, action_inputs: {
                "status": "failed",
                "error": "Search query is required.",
            },
            resolve_agent_runtime_config_func=lambda agent_node: {"runtime": "initial"},
            build_agent_stream_delta_callback_func=lambda *, state, node_name, output_keys: "delta",
            callable_accepts_keyword_func=lambda func, keyword: False,
            generate_agent_response_func=lambda agent_node, input_values, action_context, runtime_config, **kwargs: (
                {"answer": "fallback"},
                "",
                [],
                runtime_config,
            ),
            finalize_agent_stream_delta_func=lambda *, state, node_name, output_values: None,
            first_truthy_func=lambda values: next((value for value in values if value), None),
        )

        self.assertEqual(result["action_outputs"][0]["status"], "failed")
        self.assertEqual(result["action_outputs"][0]["error"], "Search query is required.")
        self.assertIn("Action 'web_search' failed: Search query is required.", result["warnings"])


if __name__ == "__main__":
    unittest.main()
