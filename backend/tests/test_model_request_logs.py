from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


class ModelRequestLogTests(unittest.TestCase):
    def test_appends_database_model_request_log_with_run_context(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_root", "Root Graph")
                    run["run_id"] = "run_root"
                    run["root_run_id"] = "run_root"
                    run["run_path"] = ["run_root"]
                    run["status"] = "running"
                    run_store.save_run(run)

                    with use_model_call_context(
                        run_id="run_root",
                        root_run_id="run_root",
                        execution_id="agent:1",
                        node_id="agent",
                        node_type="agent",
                        node_name="Answer",
                        phase="agent_response",
                    ):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="gemma",
                            path="/v1/chat/completions",
                            request_raw={
                                "model": "gemma",
                                "messages": [
                                    {"role": "system", "content": "sys"},
                                    {
                                        "role": "user",
                                        "content": [{"type": "image_url", "image_url": {"url": "data:image/png,abcd"}}],
                                    },
                                ],
                            },
                            response_raw={
                                "id": "chatcmpl_1",
                                "choices": [{"message": {"reasoning_content": "think", "content": "hello"}}],
                            },
                            duration_ms=1234,
                            status_code=200,
                        )

                    payload = list_model_request_logs(page=1, size=10)
                    with database.get_connection() as connection:
                        stored_count = connection.execute("SELECT COUNT(*) FROM graph_model_calls").fetchone()[0]

        self.assertEqual(stored_count, 1)
        self.assertEqual(payload["total"], 1)
        entry = payload["entries"][0]
        self.assertEqual(entry["run_id"], "run_root")
        self.assertEqual(entry["root_run_id"], "run_root")
        self.assertEqual(entry["execution_id"], "agent:1")
        self.assertEqual(entry["node_id"], "agent")
        self.assertEqual(entry["node_type"], "agent")
        self.assertEqual(entry["node_name"], "Answer")
        self.assertEqual(entry["phase"], "agent_response")
        self.assertEqual(entry["provider_id"], "local")
        self.assertEqual(entry["transport"], "openai-compatible")
        self.assertEqual(entry["model"], "gemma")
        self.assertEqual(entry["path"], "/v1/chat/completions")
        self.assertEqual(entry["request_kind"], "chat")
        self.assertEqual(entry["duration_ms"], 1234)
        self.assertEqual(entry["status_code"], 200)
        self.assertEqual(entry["messages"][0], {"role": "system", "body": "sys"})
        self.assertEqual(entry["reasoning"], "think")
        self.assertEqual(entry["content"], "hello")
        self.assertEqual(
            entry["request_raw"]["messages"][1]["content"][0]["image_url"]["url"],
            "<inline-media-reference mime=image/png chars=19>",
        )

    def test_lists_model_request_logs_as_run_tree_without_legacy_jsonl(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.run_tree import create_child_run_state
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    root = create_initial_run_state("graph_root", "Root Graph")
                    root["run_id"] = "run_root"
                    root["root_run_id"] = "run_root"
                    root["run_path"] = ["run_root"]
                    root["node_executions"] = [
                        {"execution_id": "plan:1", "node_id": "plan", "node_type": "agent", "status": "success", "duration_ms": 10},
                        {"execution_id": "nested:2", "node_id": "nested", "node_type": "subgraph", "status": "success", "duration_ms": 20},
                    ]
                    child = create_child_run_state(
                        root,
                        graph_id="graph_child",
                        graph_name="Child Graph",
                        parent_node_id="nested",
                        invocation_kind="subgraph_node",
                        invocation_key="embedded:Nested",
                    )
                    child["run_id"] = "run_child"
                    child["run_path"] = ["run_root", "run_child"]
                    child["node_executions"] = [
                        {"execution_id": "child_agent:1", "node_id": "child_agent", "node_type": "agent", "status": "success", "duration_ms": 30},
                    ]
                    run_store.save_run(root)
                    run_store.save_run(child)

                    with use_model_call_context(run_id="run_root", root_run_id="run_root", execution_id="plan:1", node_id="plan", node_type="agent", phase="agent_response"):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="root-model",
                            path="/chat/completions",
                            request_raw={"model": "root-model", "messages": [{"role": "user", "content": "root"}]},
                            response_raw={"choices": [{"message": {"content": "root reply"}}]},
                            duration_ms=10,
                            status_code=200,
                        )
                    with use_model_call_context(
                        run_id="run_child",
                        root_run_id="run_root",
                        execution_id="child_agent:1",
                        node_id="child_agent",
                        node_type="agent",
                        phase="agent_response",
                    ):
                        append_model_request_log(
                            provider_id="local",
                            transport="openai-compatible",
                            model="child-model",
                            path="/chat/completions",
                            request_raw={"model": "child-model", "messages": [{"role": "user", "content": "child"}]},
                            response_raw={"choices": [{"message": {"content": "child reply"}}]},
                            duration_ms=20,
                            status_code=200,
                        )

                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 2)
        self.assertEqual([root["run_id"] for root in payload["run_trees"]], ["run_root"])
        tree = payload["run_trees"][0]
        self.assertEqual(tree["kind"], "run")
        self.assertEqual(tree["label"], "Root Graph")
        self.assertEqual([child["id"] for child in tree["children"]], ["node:run_root:plan", "node:run_root:nested"])
        plan_node = tree["children"][0]
        self.assertEqual(plan_node["kind"], "graph_node")
        self.assertEqual(plan_node["model_log_ids"], [payload["entries"][1]["id"]])
        nested_node = tree["children"][1]
        self.assertEqual(nested_node["node_type"], "subgraph")
        self.assertEqual(nested_node["children"][0]["kind"], "run")
        self.assertEqual(nested_node["children"][0]["run_id"], "run_child")
        self.assertEqual(nested_node["children"][0]["children"][0]["model_log_ids"], [payload["entries"][0]["id"]])

    def test_prunes_model_request_logs_by_latest_root_runs(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs, prune_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    for index, run_id in enumerate(["run_old", "run_mid", "run_new"]):
                        run = create_initial_run_state(f"graph_{index}", f"Graph {index}")
                        run["run_id"] = run_id
                        run["root_run_id"] = run_id
                        run["run_path"] = [run_id]
                        run["started_at"] = f"2026-05-26T00:00:0{index}Z"
                        run_store.save_run(run)
                        with use_model_call_context(run_id=run_id, root_run_id=run_id, node_id="agent", node_type="agent"):
                            append_model_request_log(
                                provider_id="local",
                                transport="openai-compatible",
                                model=run_id,
                                path="/chat/completions",
                                request_raw={"model": run_id, "messages": [{"role": "user", "content": run_id}]},
                                response_raw={"choices": [{"message": {"content": run_id}}]},
                                duration_ms=1,
                                status_code=200,
                            )

                    removed = prune_model_request_logs(max_root_runs=2)
                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(removed, 1)
        self.assertEqual([entry["root_run_id"] for entry in payload["entries"]], ["run_new", "run_mid"])
        self.assertEqual([tree["run_id"] for tree in payload["run_trees"]], ["run_new", "run_mid"])

    def test_saving_model_log_retention_prunes_existing_history(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs, save_model_log_retention_settings

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    for index, run_id in enumerate(["run_old", "run_new"]):
                        run = create_initial_run_state(f"graph_{index}", f"Graph {index}")
                        run["run_id"] = run_id
                        run["root_run_id"] = run_id
                        run["run_path"] = [run_id]
                        run["started_at"] = f"2026-05-26T00:00:0{index}Z"
                        run_store.save_run(run)
                        with use_model_call_context(run_id=run_id, root_run_id=run_id, node_id="agent", node_type="agent"):
                            append_model_request_log(
                                provider_id="local",
                                transport="openai-compatible",
                                model=run_id,
                                path="/chat/completions",
                                request_raw={"model": run_id, "messages": [{"role": "user", "content": run_id}]},
                                response_raw={"choices": [{"message": {"content": run_id}}]},
                                duration_ms=1,
                                status_code=200,
                            )

                    with patch("app.core.storage.model_log_store.load_app_settings", return_value={}):
                        with patch("app.core.storage.model_log_store.save_app_settings", return_value=None):
                            saved = save_model_log_retention_settings(max_root_runs=1)
                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(saved, {"max_root_runs": 1})
        self.assertEqual([entry["root_run_id"] for entry in payload["entries"]], ["run_new"])

    def test_ignores_model_request_logs_without_run_context(self) -> None:
        from app.core.storage import database
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    append_model_request_log(
                        provider_id="local",
                        transport="openai-compatible",
                        model="gemma",
                        path="/v1/chat/completions",
                        request_raw={"model": "gemma", "messages": [{"role": "user", "content": "hello"}]},
                        response_raw={"choices": [{"message": {"content": "hello"}}]},
                        duration_ms=1,
                        status_code=200,
                    )

                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 0)
        self.assertEqual(payload["entries"], [])
        self.assertEqual(payload["run_trees"], [])

    def test_langgraph_runtime_attaches_model_call_context(self) -> None:
        from app.core.langgraph.runtime import execute_node_system_graph_langgraph
        from app.core.runtime.state import create_initial_run_state
        from app.core.schemas.node_system import NodeSystemGraphDocument
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        graph = NodeSystemGraphDocument.model_validate(
            {
                "graph_id": "graph_context",
                "name": "Context Graph",
                "state_schema": {
                    "question": {"name": "Question", "type": "text", "value": "hello"},
                    "answer": {"name": "Answer", "type": "text"},
                },
                "nodes": {
                    "input_question": {
                        "kind": "input",
                        "ui": {"position": {"x": 0, "y": 0}},
                        "writes": [{"state": "question"}],
                    },
                    "agent_answer": {
                        "kind": "agent",
                        "name": "Answer Agent",
                        "ui": {"position": {"x": 200, "y": 0}},
                        "reads": [{"state": "question"}],
                        "writes": [{"state": "answer"}],
                        "config": {
                            "taskInstruction": "Answer.",
                            "actionKey": "",
                            "modelSource": "override",
                            "model": "local/context-model",
                            "thinkingMode": "off",
                            "temperature": 0.2,
                        },
                    },
                },
                "edges": [{"source": "input_question", "target": "agent_answer"}],
                "conditional_edges": [],
            }
        )

        def fake_chat(**_kwargs):
            append_model_request_log(
                provider_id="local",
                transport="openai-compatible",
                model="context-model",
                path="/chat/completions",
                request_raw={"model": "context-model", "messages": [{"role": "user", "content": "hello"}]},
                response_raw={"choices": [{"message": {"content": "{\"answer\":\"ok\"}"}}]},
                duration_ms=5,
                status_code=200,
            )
            return '{"answer":"ok"}', {"model": "context-model", "provider_id": "local", "warnings": []}

        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    initial_state = create_initial_run_state(graph.graph_id, graph.name)
                    initial_state["run_id"] = "run_context"
                    initial_state["root_run_id"] = "run_context"
                    initial_state["run_path"] = ["run_context"]
                    initial_state["runtime_backend"] = "langgraph"
                    initial_state["graph_snapshot"] = graph.model_dump(by_alias=True)
                    initial_state["node_status_map"] = {node_id: "idle" for node_id in graph.nodes}
                    run_store.save_run(initial_state)
                    with patch("app.core.runtime.node_system_executor._chat_with_local_model_with_meta", side_effect=fake_chat):
                        execute_node_system_graph_langgraph(graph, initial_state, persist_progress=True)

                    payload = list_model_request_logs(page=1, size=10)

        self.assertEqual(payload["total"], 1)
        entry = payload["entries"][0]
        self.assertEqual(entry["run_id"], "run_context")
        self.assertEqual(entry["root_run_id"], "run_context")
        self.assertEqual(entry["node_id"], "agent_answer")
        self.assertEqual(entry["node_type"], "agent")
        self.assertEqual(entry["node_name"], "Answer Agent")
        self.assertEqual(entry["phase"], "agent_response")
        self.assertEqual(payload["run_trees"][0]["children"][0]["model_log_ids"], [entry["id"]])

    def test_sanitizes_large_inline_media_payloads(self) -> None:
        from app.core.storage.model_log_store import sanitize_payload_for_log

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "video/mp4",
                                "data": "A" * 2048,
                            }
                        }
                    ],
                }
            ]
        }

        sanitized = sanitize_payload_for_log(payload)

        self.assertEqual(
            sanitized["contents"][0]["parts"][0]["inline_data"]["data"],
            "<inline-media-data mime=video/mp4 chars=2048>",
        )

    def test_appended_model_request_log_redacts_secret_values(self) -> None:
        from app.core.runtime.model_call_context import use_model_call_context
        from app.core.runtime.state import create_initial_run_state
        from app.core.storage import database, run_store
        from app.core.storage.model_log_store import append_model_request_log, list_model_request_logs

        request_secret = "sk-requestsecretvalue1234567890"
        response_secret = "sk-responsesecretvalue1234567890"
        error_secret = "sk-errorsecretvalue1234567890"
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir) / "data"
            with patch("app.core.storage.database.DATA_DIR", data_dir):
                with patch("app.core.storage.database.DB_PATH", data_dir / "toograph.db"):
                    database.initialize_storage()
                    run = create_initial_run_state("graph_secret", "Secret Graph")
                    run["run_id"] = "run_secret"
                    run["root_run_id"] = "run_secret"
                    run["run_path"] = ["run_secret"]
                    run_store.save_run(run)
                    with use_model_call_context(run_id="run_secret", root_run_id="run_secret", node_id="agent", node_type="agent"):
                        append_model_request_log(
                            provider_id="openai",
                            transport="openai-compatible",
                            model="gpt-4.1",
                            path="/v1/chat/completions",
                            request_raw={
                                "model": "gpt-4.1",
                                "messages": [
                                    {"role": "user", "content": f"OPENAI_API_KEY={request_secret}"},
                                ],
                            },
                            response_raw={"error": f"provider returned token {response_secret}"},
                            duration_ms=20,
                            status_code=500,
                            error=f"request failed with token {error_secret}",
                        )
                    payload = list_model_request_logs(page=1, size=10)

        entry = payload["entries"][0]
        serialized_entry = str(entry)
        self.assertNotIn(request_secret, serialized_entry)
        self.assertNotIn(response_secret, serialized_entry)
        self.assertNotIn(error_secret, serialized_entry)
        self.assertIn("[REDACTED_SECRET]", entry["request_raw"]["messages"][0]["content"])
        self.assertIn("[REDACTED_SECRET]", entry["response_raw"]["error"])
        self.assertIn("[REDACTED_SECRET]", entry["error"])

    def test_model_logs_route_returns_paginated_payload(self) -> None:
        with patch(
            "app.api.routes_model_logs.list_model_request_logs",
            return_value={"entries": [], "run_trees": [], "total": 0, "page": 2, "size": 5, "pages": 0, "retention": {"max_root_runs": 200}},
        ) as list_logs:
            with TestClient(app) as client:
                response = client.get("/api/model-logs?page=2&size=5&q=gemma")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["page"], 2)
        list_logs.assert_called_once_with(page=2, size=5, query="gemma")

    def test_provider_chat_records_raw_request_and_response(self) -> None:
        from app.tools.model_provider_client import chat_with_model_provider

        def fake_streaming_request(**kwargs):
            return (
                {"id": "chatcmpl_1", "model": "gpt-4.1", "choices": [{"message": {"content": "hello"}}]},
                kwargs["stream_payload"],
                None,
                True,
            )

        with patch("app.tools.model_provider_client.post_streaming_json_with_fallback", side_effect=fake_streaming_request):
            with patch("app.tools.model_provider_client.append_model_request_log") as append_log:
                content, _meta = chat_with_model_provider(
                    provider_id="openai",
                    transport="openai-compatible",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-test",
                    model="gpt-4.1",
                    system_prompt="sys",
                    user_prompt="user",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        append_log.assert_called_once()
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["provider_id"], "openai")
        self.assertEqual(logged["transport"], "openai-compatible")
        self.assertEqual(logged["path"], "/chat/completions")
        self.assertEqual(logged["request_raw"]["messages"][0], {"role": "system", "content": "sys"})
        self.assertEqual(logged["response_raw"]["id"], "chatcmpl_1")

    def test_local_chat_records_raw_request_and_response(self) -> None:
        from app.tools.local_llm import _chat_with_local_model_with_meta

        with patch(
            "app.tools.local_llm._request_local_chat_completion",
            return_value={"id": "chatcmpl_local", "model": "gemma", "choices": [{"message": {"content": "hello"}}]},
        ):
            with patch("app.tools.local_llm.append_model_request_log") as append_log:
                content, _meta = _chat_with_local_model_with_meta(
                    system_prompt="sys",
                    user_prompt="user",
                    model="gemma",
                    provider_id="local",
                    temperature=0.2,
                )

        self.assertEqual(content, "hello")
        append_log.assert_called_once()
        logged = append_log.call_args.kwargs
        self.assertEqual(logged["provider_id"], "local")
        self.assertEqual(logged["transport"], "openai-compatible")
        self.assertEqual(logged["path"], "/chat/completions")
        self.assertEqual(logged["request_raw"]["model"], "gemma")
        self.assertEqual(logged["response_raw"]["id"], "chatcmpl_local")


if __name__ == "__main__":
    unittest.main()
