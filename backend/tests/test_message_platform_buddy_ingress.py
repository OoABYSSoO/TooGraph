from __future__ import annotations

from copy import deepcopy
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.runtime.run_events import publish_run_event
from app.messaging.buddy_ingress import handle_inbound_event, run_buddy_graph_for_external_message
from app.messaging.event_model import MessagingInboundEvent


def _minimal_buddy_template() -> dict:
    return {
        "template_id": "buddy_autonomous_loop",
        "label": "Buddy",
        "description": "",
        "default_graph_name": "伙伴自主循环",
        "state_schema": {
            "user_message": {
                "name": "用户消息",
                "description": "",
                "type": "text",
                "value": "",
                "color": "#2563eb",
            },
            "public_response": {
                "name": "模型整理回复",
                "description": "",
                "type": "markdown",
                "value": "",
                "color": "#16a34a",
            },
        },
        "nodes": {
            "input_user_message": {
                "kind": "input",
                "name": "Input",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "user_message", "mode": "replace"}],
                "config": {"value": "", "boundaryType": "text"},
            },
            "output_public_response": {
                "kind": "output",
                "name": "Output",
                "description": "",
                "ui": {"position": {"x": 240, "y": 0}},
                "reads": [{"state": "public_response", "required": True}],
                "writes": [],
                "config": {
                    "displayMode": "auto",
                    "persistEnabled": False,
                    "persistFormat": "auto",
                    "fileNameTemplate": "",
                },
            },
        },
        "edges": [{"source": "input_user_message", "target": "output_public_response"}],
        "conditional_edges": [],
        "metadata": {},
    }


def _buddy_template_with_capability_output() -> dict:
    template = deepcopy(_minimal_buddy_template())
    template["state_schema"]["capability_result"] = {
        "name": "能力结果",
        "description": "",
        "type": "result_package",
        "value": {},
        "color": "#0284c7",
    }
    template["nodes"]["reply_and_select_capability"] = {
        "kind": "agent",
        "name": "整理回复",
        "description": "",
        "ui": {"position": {"x": 240, "y": 0}},
        "reads": [{"state": "user_message", "required": True}],
        "writes": [{"state": "public_response", "mode": "replace"}],
        "config": {"taskInstruction": "Reply."},
    }
    template["nodes"]["execute_capability"] = {
        "kind": "agent",
        "name": "执行能力",
        "description": "",
        "ui": {"position": {"x": 480, "y": 0}},
        "reads": [{"state": "user_message", "required": True}],
        "writes": [{"state": "capability_result", "mode": "replace"}],
        "config": {"taskInstruction": "Execute capability."},
    }
    template["nodes"]["output_capability_result"] = {
        "kind": "output",
        "name": "Capability Output",
        "description": "",
        "ui": {"position": {"x": 720, "y": 0}},
        "reads": [{"state": "capability_result", "required": True}],
        "writes": [],
        "config": {
            "displayMode": "auto",
            "persistEnabled": False,
            "persistFormat": "auto",
            "fileNameTemplate": "",
        },
    }
    template["edges"] = [
        {"source": "input_user_message", "target": "reply_and_select_capability"},
        {"source": "reply_and_select_capability", "target": "output_public_response"},
        {"source": "reply_and_select_capability", "target": "execute_capability"},
        {"source": "execute_capability", "target": "output_capability_result"},
    ]
    return template


def _buddy_template_with_direct_reply_and_terminal_conditions() -> dict:
    template = deepcopy(_minimal_buddy_template())
    template["state_schema"]["show_result_package"] = {
        "name": "展示结果包",
        "description": "",
        "type": "boolean",
        "value": False,
        "color": "#f59e0b",
    }
    template["state_schema"]["needs_capability"] = {
        "name": "需要能力",
        "description": "",
        "type": "boolean",
        "value": False,
        "color": "#f59e0b",
    }
    template["nodes"]["reply_and_select_capability"] = {
        "kind": "agent",
        "name": "整理回复",
        "description": "",
        "ui": {"position": {"x": 240, "y": 0}},
        "reads": [{"state": "user_message", "required": True}],
        "writes": [
            {"state": "show_result_package", "mode": "replace"},
            {"state": "public_response", "mode": "replace"},
            {"state": "needs_capability", "mode": "replace"},
        ],
        "config": {"taskInstruction": "Reply."},
    }
    template["nodes"]["condition_show_result"] = {
        "kind": "condition",
        "name": "是否展示结果包",
        "description": "",
        "ui": {"position": {"x": 480, "y": 0}},
        "reads": [{"state": "show_result_package", "required": True}],
        "writes": [],
        "config": {
            "branches": ["true", "false", "exhausted"],
            "branchMapping": {"true": "true", "false": "false"},
            "rule": {"source": "$state.show_result_package", "operator": "==", "value": True},
        },
    }
    template["nodes"]["condition_needs_capability"] = {
        "kind": "condition",
        "name": "是否需要继续调用能力",
        "description": "",
        "ui": {"position": {"x": 720, "y": 0}},
        "reads": [{"state": "needs_capability", "required": True}],
        "writes": [],
        "config": {
            "branches": ["true", "false", "exhausted"],
            "branchMapping": {"true": "true", "false": "false"},
            "rule": {"source": "$state.needs_capability", "operator": "==", "value": True},
        },
    }
    template["edges"] = [
        {"source": "input_user_message", "target": "reply_and_select_capability"},
        {"source": "reply_and_select_capability", "target": "output_public_response"},
        {"source": "reply_and_select_capability", "target": "condition_show_result"},
    ]
    template["conditional_edges"] = [
        {
            "source": "condition_show_result",
            "branches": {
                "true": "output_public_response",
                "false": "condition_needs_capability",
                "exhausted": "condition_needs_capability",
            },
        },
        {
            "source": "condition_needs_capability",
            "branches": {
                "true": "output_public_response",
                "false": "output_public_response",
                "exhausted": "output_public_response",
            },
        },
    ]
    return template


def test_external_runner_builds_buddy_template_run_and_returns_reply_text() -> None:
    saved_runs: list[dict] = []
    seen_graphs: list[object] = []

    def fake_execute(graph: object, run_state: dict, *, persist_progress: bool) -> dict:
        seen_graphs.append(graph)
        assert persist_progress is True
        run_state["status"] = "completed"
        run_state["final_result"] = "fallback reply"
        run_state["state_snapshot"] = {"values": {"public_response": "reply from public state"}}
        return run_state

    with (
        patch(
            "app.messaging.buddy_ingress.buddy_store.load_run_template_binding",
            return_value={
                "version": 1,
                "template_id": "buddy_autonomous_loop",
                "input_bindings": {"input_user_message": "current_message"},
            },
        ),
        patch("app.messaging.buddy_ingress.get_template", return_value=_minimal_buddy_template()),
        patch("app.messaging.buddy_ingress.save_run", side_effect=lambda run_state: saved_runs.append(dict(run_state))),
        patch("app.messaging.buddy_ingress.execute_node_system_graph_langgraph", side_effect=fake_execute),
    ):
        result = run_buddy_graph_for_external_message(
            session_id="session-1",
            message_id="msg-1",
            text="hello from telegram",
            buddy_model_ref="local/test-model",
        )

    graph = seen_graphs[0]
    assert result["final_text"] == "reply from public state"
    assert result["status"] == "completed"
    assert result["run_id"]
    assert graph.metadata["origin"] == "buddy"
    assert graph.metadata["buddy_template_id"] == "buddy_autonomous_loop"
    assert graph.metadata["buddy_model_ref"] == "local/test-model"
    assert graph.metadata["runtime_context"]["buddy_session_id"] == "session-1"
    assert graph.metadata["runtime_context"]["buddy_current_message_id"] == "msg-1"
    assert graph.nodes["input_user_message"].config.value == "hello from telegram"
    assert saved_runs[0]["runtime_backend"] == "langgraph"


def test_external_runner_returns_buddy_visible_outputs_from_result_package() -> None:
    full_weather_reply = "今天北京天气晴朗，气温适中，空气质量良好。"
    short_final_reply = "为您查询到北京今天的实时天气信息，请查看下方详细结果："
    result_package = {
        "kind": "result_package",
        "outputs": {
            "public_response": {
                "name": "天气结果",
                "description": "",
                "type": "markdown",
                "value": full_weather_reply,
            }
        },
    }

    def fake_execute(graph: object, run_state: dict, *, persist_progress: bool) -> dict:
        del graph, persist_progress
        state_events = [
            {
                "node_id": "reply_and_select_capability",
                "state_key": "public_response",
                "value": "我先查一下。",
                "created_at": "2026-05-28T02:17:10+00:00",
                "sequence": 1,
            },
            {
                "node_id": "execute_capability",
                "state_key": "capability_result",
                "value": result_package,
                "created_at": "2026-05-28T02:17:20+00:00",
                "sequence": 2,
            },
            {
                "node_id": "reply_and_select_capability",
                "state_key": "public_response",
                "value": short_final_reply,
                "created_at": "2026-05-28T02:17:30+00:00",
                "sequence": 3,
            },
        ]
        run_state["status"] = "completed"
        run_state["state_snapshot"] = {"values": {"public_response": short_final_reply, "capability_result": result_package}}
        run_state["state_events"] = deepcopy(state_events)
        run_state["artifacts"] = {"state_events": deepcopy(state_events)}
        return run_state

    with (
        patch(
            "app.messaging.buddy_ingress.buddy_store.load_run_template_binding",
            return_value={
                "version": 1,
                "template_id": "buddy_autonomous_loop",
                "input_bindings": {"input_user_message": "current_message"},
            },
        ),
        patch("app.messaging.buddy_ingress.get_template", return_value=_buddy_template_with_capability_output()),
        patch("app.messaging.buddy_ingress.save_run"),
        patch("app.messaging.buddy_ingress.execute_node_system_graph_langgraph", side_effect=fake_execute),
    ):
        result = run_buddy_graph_for_external_message(
            session_id="session-1",
            message_id="msg-1",
            text="帮我看看今天北京的天气",
            buddy_model_ref="",
        )

    assert result["final_text"] == "\n\n".join(["我先查一下。", full_weather_reply, short_final_reply])
    assert result["visible_reply_text"] == result["final_text"]
    assert result["visible_reply_parts"] == ["我先查一下。", full_weather_reply, short_final_reply]


def test_external_runner_streams_visible_outputs_from_run_events() -> None:
    full_weather_reply = "今天北京天气晴朗，气温适中，空气质量良好。"
    short_final_reply = "为您查询到北京今天的实时天气信息，请查看下方详细结果："
    result_package = {
        "kind": "result_package",
        "outputs": {
            "public_response": {
                "name": "天气结果",
                "description": "",
                "type": "markdown",
                "value": full_weather_reply,
            }
        },
    }
    streamed_parts: list[str] = []

    def fake_execute(graph: object, run_state: dict, *, persist_progress: bool) -> dict:
        del graph, persist_progress
        run_id = str(run_state["run_id"])
        state_events = [
            {
                "node_id": "reply_and_select_capability",
                "state_key": "public_response",
                "value": "我先查一下。",
                "created_at": "2026-05-28T02:17:10+00:00",
                "sequence": 1,
            },
            {
                "node_id": "execute_capability",
                "state_key": "capability_result",
                "value": result_package,
                "created_at": "2026-05-28T02:17:20+00:00",
                "sequence": 2,
            },
            {
                "node_id": "reply_and_select_capability",
                "state_key": "public_response",
                "value": short_final_reply,
                "created_at": "2026-05-28T02:17:30+00:00",
                "sequence": 3,
            },
        ]
        for event in state_events:
            publish_run_event(run_id, "state.updated", event)
        run_state["status"] = "completed"
        run_state["state_snapshot"] = {"values": {"public_response": short_final_reply, "capability_result": result_package}}
        run_state["state_events"] = deepcopy(state_events)
        run_state["artifacts"] = {"state_events": deepcopy(state_events)}
        return run_state

    with (
        patch(
            "app.messaging.buddy_ingress.buddy_store.load_run_template_binding",
            return_value={
                "version": 1,
                "template_id": "buddy_autonomous_loop",
                "input_bindings": {"input_user_message": "current_message"},
            },
        ),
        patch("app.messaging.buddy_ingress.get_template", return_value=_buddy_template_with_capability_output()),
        patch("app.messaging.buddy_ingress.save_run"),
        patch("app.messaging.buddy_ingress.execute_node_system_graph_langgraph", side_effect=fake_execute),
    ):
        result = run_buddy_graph_for_external_message(
            session_id="session-1",
            message_id="msg-1",
            text="帮我看看今天北京的天气",
            buddy_model_ref="",
            visible_message_callback=lambda message: (
                streamed_parts.append(str(message.get("text") or ""))
                if message.get("kind") == "output"
                else None
            ),
        )

    assert streamed_parts == ["我先查一下。", full_weather_reply, short_final_reply]
    assert result["visible_reply_parts"] == streamed_parts


def test_external_runner_streams_buddy_visible_messages_from_run_events() -> None:
    streamed_events: list[str] = []

    def fake_execute(graph: object, run_state: dict, *, persist_progress: bool) -> dict:
        del graph, persist_progress
        run_id = str(run_state["run_id"])
        publish_run_event(
            run_id,
            "node.started",
            {
                "node_id": "reply_and_select_capability",
                "node_type": "agent",
                "status": "running",
                "created_at": "2026-05-28T02:17:09+00:00",
            },
        )
        publish_run_event(
            run_id,
            "state.updated",
            {
                "node_id": "reply_and_select_capability",
                "state_key": "public_response",
                "value": "我先查一下。",
                "created_at": "2026-05-28T02:17:10+00:00",
                "sequence": 1,
            },
        )
        publish_run_event(
            run_id,
            "node.started",
            {
                "node_id": "execute_capability",
                "node_type": "agent",
                "status": "running",
                "created_at": "2026-05-28T02:17:19+00:00",
            },
        )
        publish_run_event(
            run_id,
            "state.updated",
            {
                "node_id": "execute_capability",
                "state_key": "capability_result",
                "value": {
                    "kind": "result_package",
                    "outputs": {
                        "public_response": {
                            "name": "天气结果",
                            "description": "",
                            "type": "markdown",
                            "value": "天气很好。",
                        }
                    },
                },
                "created_at": "2026-05-28T02:17:20+00:00",
                "sequence": 2,
            },
        )
        run_state["status"] = "completed"
        return run_state

    with (
        patch(
            "app.messaging.buddy_ingress.buddy_store.load_run_template_binding",
            return_value={
                "version": 1,
                "template_id": "buddy_autonomous_loop",
                "input_bindings": {"input_user_message": "current_message"},
            },
        ),
        patch("app.messaging.buddy_ingress.get_template", return_value=_buddy_template_with_capability_output()),
        patch("app.messaging.buddy_ingress.save_run"),
        patch("app.messaging.buddy_ingress.execute_node_system_graph_langgraph", side_effect=fake_execute),
    ):
        run_buddy_graph_for_external_message(
            session_id="session-1",
            message_id="msg-1",
            text="帮我看看今天北京的天气",
            buddy_model_ref="",
            visible_message_callback=lambda message: streamed_events.append(
                "placeholder"
                if message.get("kind") == "placeholder"
                else f"output:{message.get('text')}"
            ),
        )

    assert streamed_events == ["placeholder", "output:我先查一下。", "placeholder", "output:天气很好。"]


def test_buddy_visible_stream_does_not_start_new_message_for_terminal_conditions_after_direct_reply() -> None:
    streamed_events: list[str] = []

    def fake_execute(_graph, run_state: dict, *, persist_progress: bool) -> dict:
        del _graph, persist_progress
        run_id = str(run_state["run_id"])
        publish_run_event(
            run_id,
            "node.started",
            {
                "node_id": "reply_and_select_capability",
                "node_type": "agent",
                "status": "running",
                "created_at": "2026-05-28T02:17:10+00:00",
            },
        )
        publish_run_event(
            run_id,
            "state.updated",
            {
                "node_id": "reply_and_select_capability",
                "node_type": "agent",
                "state_key": "public_response",
                "output_key": "public_response",
                "value": "你好！很高兴见到你。",
                "created_at": "2026-05-28T02:17:11+00:00",
                "sequence": 1,
            },
        )
        publish_run_event(
            run_id,
            "state.updated",
            {
                "node_id": "reply_and_select_capability",
                "node_type": "agent",
                "state_key": "show_result_package",
                "output_key": "show_result_package",
                "value": False,
                "created_at": "2026-05-28T02:17:12+00:00",
                "sequence": 2,
            },
        )
        publish_run_event(
            run_id,
            "state.updated",
            {
                "node_id": "reply_and_select_capability",
                "node_type": "agent",
                "state_key": "needs_capability",
                "output_key": "needs_capability",
                "value": False,
                "created_at": "2026-05-28T02:17:13+00:00",
                "sequence": 3,
            },
        )
        publish_run_event(
            run_id,
            "node.completed",
            {
                "node_id": "reply_and_select_capability",
                "node_type": "agent",
                "status": "success",
                "created_at": "2026-05-28T02:17:14+00:00",
            },
        )
        publish_run_event(
            run_id,
            "node.started",
            {
                "node_id": "condition_show_result",
                "node_type": "condition",
                "status": "running",
                "created_at": "2026-05-28T02:17:15+00:00",
            },
        )
        publish_run_event(
            run_id,
            "node.completed",
            {
                "node_id": "condition_show_result",
                "node_type": "condition",
                "status": "success",
                "selected_branch": "false",
                "created_at": "2026-05-28T02:17:16+00:00",
            },
        )
        publish_run_event(
            run_id,
            "node.started",
            {
                "node_id": "condition_needs_capability",
                "node_type": "condition",
                "status": "running",
                "created_at": "2026-05-28T02:17:17+00:00",
            },
        )
        publish_run_event(
            run_id,
            "node.completed",
            {
                "node_id": "condition_needs_capability",
                "node_type": "condition",
                "status": "success",
                "selected_branch": "false",
                "created_at": "2026-05-28T02:17:18+00:00",
            },
        )
        run_state["status"] = "completed"
        return run_state

    with (
        patch(
            "app.messaging.buddy_ingress.buddy_store.load_run_template_binding",
            return_value={
                "version": 1,
                "template_id": "buddy_autonomous_loop",
                "input_bindings": {"input_user_message": "current_message"},
            },
        ),
        patch("app.messaging.buddy_ingress.get_template", return_value=_buddy_template_with_direct_reply_and_terminal_conditions()),
        patch("app.messaging.buddy_ingress.save_run"),
        patch("app.messaging.buddy_ingress.execute_node_system_graph_langgraph", side_effect=fake_execute),
    ):
        run_buddy_graph_for_external_message(
            session_id="session-1",
            message_id="msg-1",
            text="你好",
            buddy_model_ref="",
            visible_message_callback=lambda message: streamed_events.append(
                "placeholder"
                if message.get("kind") == "placeholder"
                else f"output:{message.get('text')}"
            ),
        )

    assert streamed_events == ["placeholder", "output:你好！很高兴见到你。"]


def test_buddy_ingress_persists_user_and_assistant_messages() -> None:
    appended: list[dict] = []

    def fake_append(session_id: str, payload: dict, *, changed_by: str, change_reason: str) -> dict:
        del changed_by, change_reason
        appended.append({"session_id": session_id, **payload})
        return {"message_id": f"msg_{len(appended)}", **payload}

    with (
        patch(
            "app.messaging.buddy_ingress.resolve_buddy_session_for_event",
            return_value={"platform_session_id": "mps_1", "buddy_session_id": "session-1", "buddy_model_ref": ""},
        ),
        patch("app.messaging.buddy_ingress.buddy_store.append_chat_message", side_effect=fake_append),
        patch(
            "app.messaging.buddy_ingress.run_buddy_graph_for_external_message",
            return_value={"run_id": "run_1", "final_text": "hi back"},
        ),
        patch("app.messaging.buddy_ingress.store.append_audit_event"),
    ):
        result = handle_inbound_event(
            MessagingInboundEvent(
                platform_id="telegram",
                binding_id="mpb_telegram",
                chat_id="chat-1",
                sender_id="user-1",
                text="hello",
            )
        )

    assert result["run_id"] == "run_1"
    assert appended[0]["role"] == "user"
    assert appended[0]["metadata"]["platform_id"] == "telegram"
    assert appended[1]["role"] == "assistant"
    assert appended[1]["run_id"] == "run_1"


def test_buddy_ingress_persists_visible_reply_text_when_available() -> None:
    appended: list[dict] = []

    def fake_append(session_id: str, payload: dict, *, changed_by: str, change_reason: str) -> dict:
        del changed_by, change_reason
        appended.append({"session_id": session_id, **payload})
        return {"message_id": f"msg_{len(appended)}", **payload}

    with (
        patch(
            "app.messaging.buddy_ingress.resolve_buddy_session_for_event",
            return_value={"platform_session_id": "mps_1", "buddy_session_id": "session-1", "buddy_model_ref": ""},
        ),
        patch("app.messaging.buddy_ingress.buddy_store.append_chat_message", side_effect=fake_append),
        patch(
            "app.messaging.buddy_ingress.run_buddy_graph_for_external_message",
            return_value={"run_id": "run_1", "final_text": "short final", "visible_reply_text": "complete Buddy output"},
        ),
        patch("app.messaging.buddy_ingress.store.append_audit_event"),
    ):
        result = handle_inbound_event(
            MessagingInboundEvent(
                platform_id="feishu",
                binding_id="mpb_feishu",
                chat_id="chat-1",
                sender_id="user-1",
                text="hello",
            )
        )

    assert result["final_text"] == "short final"
    assert result["visible_reply_text"] == "complete Buddy output"
    assert appended[1]["role"] == "assistant"
    assert appended[1]["content"] == "complete Buddy output"


def test_buddy_ingress_handles_slash_command_without_graph_run() -> None:
    appended: list[dict] = []

    def fake_append(session_id: str, payload: dict, *, changed_by: str, change_reason: str) -> dict:
        del changed_by, change_reason
        appended.append({"session_id": session_id, **payload})
        return {"message_id": f"msg_{len(appended)}", **payload}

    with (
        patch(
            "app.messaging.buddy_ingress.resolve_buddy_session_for_event",
            return_value={
                "platform_session_id": "mps_1",
                "buddy_session_id": "session-1",
                "external_conversation_key": "telegram:dm:chat-1",
                "buddy_model_ref": "",
                "last_run_id": "run_1",
                "status": "active",
            },
        ),
        patch("app.messaging.buddy_ingress.buddy_store.append_chat_message", side_effect=fake_append),
        patch("app.messaging.buddy_ingress.run_buddy_graph_for_external_message") as runner,
    ):
        result = handle_inbound_event(
            MessagingInboundEvent(
                platform_id="telegram",
                binding_id="mpb_telegram",
                chat_id="chat-1",
                sender_id="user-1",
                text="/session",
            )
        )

    runner.assert_not_called()
    assert result["command"] == "session"
    assert appended[0]["role"] == "assistant"
    assert appended[0]["include_in_context"] is False
    assert appended[0]["metadata"]["source_kind"] == "message_platform_command"
