from __future__ import annotations

import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage import database
from app.core.storage.memory_store import load_memory_entry
from app.core.storage.run_store import load_run
from app.evaluator.checks import evaluate_case_checks
from app.evaluator.llm_judge import run_llm_judge
from app.evaluator import store
from app.buddy import store as buddy_store
from app.main import app


@contextmanager
def isolated_eval_database():
    old_data_dir = database.DATA_DIR
    old_db_path = database.DB_PATH
    with tempfile.TemporaryDirectory() as temp_dir:
        data_dir = Path(temp_dir)
        database.DATA_DIR = data_dir
        database.DB_PATH = data_dir / "toograph.db"
        try:
            database.initialize_storage()
            yield
        finally:
            database.DATA_DIR = old_data_dir
            database.DB_PATH = old_db_path


def _eval_template_record() -> dict[str, object]:
    return {
        "template_id": "mock_template",
        "label": "Mock Template",
        "description": "Mock eval template",
        "default_graph_name": "Mock Eval Template",
        "state_schema": {
            "prompt": {
                "name": "Prompt",
                "description": "",
                "type": "text",
                "value": "",
                "color": "#2563eb",
            }
        },
        "nodes": {
            "input_prompt": {
                "kind": "input",
                "name": "Input Prompt",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "prompt", "mode": "replace"}],
                "config": {"boundaryType": "text"},
            },
            "output_prompt": {
                "kind": "output",
                "name": "Output Prompt",
                "description": "",
                "ui": {"position": {"x": 240, "y": 0}},
                "reads": [{"state": "prompt", "required": True}],
                "writes": [],
                "config": {
                    "displayMode": "auto",
                    "persistEnabled": False,
                    "persistFormat": "auto",
                    "fileNameTemplate": "",
                },
            },
        },
        "edges": [{"source": "input_prompt", "target": "output_prompt"}],
        "conditional_edges": [],
        "metadata": {"description": "Mock eval template"},
        "source": "official",
        "status": "active",
    }


def _completed_eval_graph_run() -> dict[str, object]:
    return {
        "run_id": "run_completed",
        "status": "completed",
        "final_result": "结论引用 [1]。",
        "errors": [],
        "output_previews": [
            {
                "node_id": "output_final",
                "label": "public_response",
                "source_kind": "state",
                "source_key": "public_response",
                "value": "结论引用 [1]。",
            },
            {
                "node_id": "output_citations",
                "label": "citations",
                "source_kind": "state",
                "source_key": "citations",
                "value": ["kb:1"],
            },
        ],
        "saved_outputs": [
            {
                "node_id": "output_final",
                "source_key": "public_response",
                "path": "backend/data/outputs/run_completed/final.md",
                "format": "md",
                "file_name": "final.md",
            }
        ],
        "artifacts": {
            "exported_outputs": [
                {
                    "node_id": "output_final",
                    "source_key": "public_response",
                    "value": "结论引用 [1]。",
                    "saved_file": {
                        "path": "backend/data/outputs/run_completed/final.md",
                        "format": "md",
                        "file_name": "final.md",
                    },
                }
            ],
            "state_values": {"public_response": "结论引用 [1]。", "citations": ["kb:1"]},
        },
        "node_executions": [],
    }


class EvaluatorStoreRouteTests(unittest.TestCase):
    def test_eval_store_closes_read_connections(self) -> None:
        class FakeConnection:
            def __init__(self) -> None:
                self.closed = False

            def __enter__(self) -> "FakeConnection":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def execute(self, *_args: object) -> "FakeConnection":
                return self

            def fetchall(self) -> list[object]:
                return []

            def close(self) -> None:
                self.closed = True

        fake_connection = FakeConnection()

        with patch("app.evaluator.store.get_connection", return_value=fake_connection):
            self.assertEqual(store.list_eval_suites(), [])

        self.assertTrue(fake_connection.closed)

    def test_eval_route_starts_case_graph_run_from_target_template(self) -> None:
        saved_runs: list[dict[str, object]] = []

        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.save_run", side_effect=lambda run: saved_runs.append(dict(run))),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "template_eval",
                        "name": "Template eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/template_eval/cases",
                    json={
                        "case_id": "case_one",
                        "name": "Case one",
                        "input_values": {"prompt": "输入材料"},
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "template_eval"})
                eval_run_id = run_response.json()["eval_run_id"]

                start_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_one/run")
                run_detail_response = client.get(f"/api/evals/runs/{eval_run_id}")

        self.assertEqual(start_response.status_code, 200)
        started_case = start_response.json()
        self.assertEqual(started_case["status"], "running")
        self.assertTrue(started_case["graph_run_id"].startswith("run_"))
        self.assertEqual(started_case["final_output"], {})
        self.assertEqual(started_case["artifacts"], {})
        self.assertEqual(started_case["check_results"], [])
        self.assertEqual(run_detail_response.json()["status"], "running")
        self.assertEqual(saved_runs[0]["metadata"]["eval"]["eval_run_id"], eval_run_id)
        self.assertEqual(saved_runs[0]["metadata"]["eval"]["case_id"], "case_one")
        self.assertEqual(saved_runs[0]["metadata"]["eval"]["target_template_id"], "mock_template")
        self.assertEqual(saved_runs[0]["graph_snapshot"]["state_schema"]["prompt"]["value"], "输入材料")

    def test_eval_route_installs_case_fixture_source_runs_before_starting_graph(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "fixture_eval",
                        "name": "Fixture eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/fixture_eval/cases",
                    json={
                        "case_id": "case_with_source_run",
                        "name": "Case with source run",
                        "input_values": {"prompt": "输入材料"},
                        "metadata": {
                            "fixture_runs": [
                                {
                                    "run_id": "run_eval_source_fixture",
                                    "graph_id": "buddy_fixture_graph",
                                    "graph_name": "Buddy source fixture",
                                    "status": "completed",
                                    "metadata": {
                                        "runtime_context": {
                                            "buddy_session_id": "session_eval_fixture",
                                            "buddy_current_message_id": "message_eval_fixture",
                                        }
                                    },
                                    "state_values": {
                                        "user_message": "请记住我偏好简洁回答。",
                                        "conversation_history": {
                                            "kind": "context_assembly_ref",
                                            "source_refs": [
                                                {"source_kind": "buddy_message", "source_id": "message_eval_fixture"}
                                            ],
                                        },
                                        "public_response": "我会在后续回复中保持简洁。",
                                    },
                                }
                            ]
                        },
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "fixture_eval"})
                eval_run_id = run_response.json()["eval_run_id"]

                start_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_with_source_run/run")
                fixture_run = load_run("run_eval_source_fixture")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(fixture_run["status"], "completed")
        self.assertEqual(fixture_run["graph_id"], "buddy_fixture_graph")
        self.assertEqual(
            fixture_run["metadata"]["runtime_context"]["buddy_session_id"],
            "session_eval_fixture",
        )
        self.assertEqual(fixture_run["metadata"]["eval_fixture"]["eval_run_id"], eval_run_id)
        self.assertEqual(fixture_run["metadata"]["eval_fixture"]["case_id"], "case_with_source_run")
        self.assertEqual(
            fixture_run["state_snapshot"]["values"]["public_response"],
            "我会在后续回复中保持简洁。",
        )
        self.assertEqual(
            fixture_run["artifacts"]["state_values"]["user_message"],
            "请记住我偏好简洁回答。",
        )

    def test_eval_route_installs_case_fixture_memory_entries_before_starting_graph(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "memory_fixture_eval",
                        "name": "Memory fixture eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/memory_fixture_eval/cases",
                    json={
                        "case_id": "case_with_memory_fixture",
                        "input_values": {"prompt": "召回 memory-fixture-evidence"},
                        "metadata": {
                            "fixture_memory_entries": [
                                {
                                    "memory_id": "mem_eval_fixture_preference",
                                    "scope_kind": "buddy",
                                    "scope_id": "default",
                                    "layer": "long_term",
                                    "memory_type": "preference",
                                    "title": "评测偏好",
                                    "content": "memory-fixture-evidence 表示用户偏好先给结论。",
                                    "confidence": 0.9,
                                    "salience": 0.8,
                                    "sources": [
                                        {
                                            "source_kind": "buddy_message",
                                            "source_id": "msg_eval_fixture_preference",
                                        }
                                    ],
                                }
                            ]
                        },
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "memory_fixture_eval"})
                eval_run_id = run_response.json()["eval_run_id"]

                start_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_with_memory_fixture/run")
                memory = load_memory_entry("mem_eval_fixture_preference")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(memory["title"], "评测偏好")
        self.assertEqual(memory["metadata"]["eval_fixture"]["eval_run_id"], eval_run_id)
        self.assertEqual(memory["metadata"]["eval_fixture"]["case_id"], "case_with_memory_fixture")
        self.assertEqual(memory["sources"][0]["source_id"], "msg_eval_fixture_preference")

    def test_eval_route_installs_case_fixture_buddy_sessions_before_starting_graph(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "buddy_session_fixture_eval",
                        "name": "Buddy session fixture eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/buddy_session_fixture_eval/cases",
                    json={
                        "case_id": "case_with_buddy_session_fixture",
                        "input_values": {"prompt": "召回 hybrid-session-evidence"},
                        "metadata": {
                            "fixture_buddy_sessions": [
                                {
                                    "session_id": "session_eval_hybrid_history",
                                    "title": "Hybrid history",
                                    "messages": [
                                        {
                                            "message_id": "msg_eval_hybrid_user",
                                            "role": "user",
                                            "content": "hybrid-session-evidence 来自历史用户消息。",
                                            "client_order": 0,
                                        },
                                        {
                                            "message_id": "msg_eval_hybrid_assistant",
                                            "role": "assistant",
                                            "content": "历史伙伴回复保留 source ref。",
                                            "client_order": 1,
                                        },
                                    ],
                                }
                            ]
                        },
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "buddy_session_fixture_eval"})
                eval_run_id = run_response.json()["eval_run_id"]

                start_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_with_buddy_session_fixture/run"
                )
                session = buddy_store.get_chat_session("session_eval_hybrid_history")
                messages = buddy_store.list_chat_messages("session_eval_hybrid_history")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(session["title"], "Hybrid history")
        self.assertEqual([message["message_id"] for message in messages], ["msg_eval_hybrid_user", "msg_eval_hybrid_assistant"])
        self.assertEqual(messages[0]["metadata"]["eval_fixture"]["eval_run_id"], eval_run_id)
        self.assertEqual(messages[0]["content"], "hybrid-session-evidence 来自历史用户消息。")

    def test_eval_route_installs_case_fixture_capability_usage_before_starting_graph(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "capability_usage_fixture_eval",
                        "name": "Capability usage fixture eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/capability_usage_fixture_eval/cases",
                    json={
                        "case_id": "case_with_capability_usage_fixture",
                        "input_values": {"prompt": "需要选择健康 fallback 能力"},
                        "metadata": {
                            "fixture_capability_usage_entries": [
                                {
                                    "capability": {
                                        "kind": "subgraph",
                                        "key": "advanced_web_research_loop",
                                    },
                                    "success": False,
                                    "run_id": "run_eval_selector_failed_1",
                                    "summary": "provider timeout",
                                },
                                {
                                    "capability": {
                                        "kind": "subgraph",
                                        "key": "advanced_web_research_loop",
                                    },
                                    "success": False,
                                    "run_id": "run_eval_selector_failed_2",
                                    "summary": "provider timeout",
                                },
                                {
                                    "capability": {"kind": "action", "key": "web_search"},
                                    "success": True,
                                    "run_id": "run_eval_selector_search_ok",
                                    "summary": "search completed",
                                },
                            ]
                        },
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "capability_usage_fixture_eval"})
                eval_run_id = run_response.json()["eval_run_id"]

                start_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_with_capability_usage_fixture/run"
                )
                second_start_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_with_capability_usage_fixture/run"
                )
                from app.buddy.store import load_capability_usage_stats

                stats = load_capability_usage_stats()

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(second_start_response.status_code, 200)
        capabilities = stats["capabilities"]
        self.assertEqual(capabilities["subgraph:advanced_web_research_loop"]["failure_count"], 2)
        self.assertEqual(capabilities["subgraph:advanced_web_research_loop"]["recent_runs"][0]["success"], False)
        self.assertEqual(capabilities["action:web_search"]["success_count"], 1)

    def test_eval_route_installs_case_fixture_scheduler_records_before_starting_graph(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.scheduler.store.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "scheduler_fixture_eval",
                        "name": "Scheduler fixture eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/scheduler_fixture_eval/cases",
                    json={
                        "case_id": "case_with_scheduler_fixture",
                        "input_values": {"prompt": "读取调度运行"},
                        "metadata": {
                            "fixture_scheduled_graph_jobs": [
                                {
                                    "job_id": "sched_eval_retry_delivery",
                                    "name": "调度重试投递评测",
                                    "template_id": "mock_template",
                                    "schedule_kind": "interval",
                                    "schedule_expr": "PT6H",
                                    "retry_policy": {"max_attempts": 3, "delay_seconds": 300},
                                    "delivery_target": {
                                        "kind": "local_audit",
                                        "label": "Scheduler eval",
                                        "token": "secret-token",
                                    },
                                }
                            ],
                            "fixture_scheduled_graph_job_runs": [
                                {
                                    "job_run_id": "schedrun_eval_retry_delivery_1",
                                    "job_id": "sched_eval_retry_delivery",
                                    "run_id": "run_eval_scheduler_failed_1",
                                    "trigger_reason": "schedule",
                                    "status": "failed",
                                    "error": "provider timeout",
                                    "started_at": "2026-05-27T06:00:00Z",
                                    "completed_at": "2026-05-27T06:05:00Z",
                                    "now": "2026-05-27T06:05:00Z",
                                }
                            ],
                        },
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "scheduler_fixture_eval"})
                eval_run_id = run_response.json()["eval_run_id"]

                start_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_with_scheduler_fixture/run")
                from app.scheduler import store as scheduler_store

                job = scheduler_store.load_scheduled_graph_job("sched_eval_retry_delivery")
                job_run = scheduler_store.load_scheduled_graph_job_run("schedrun_eval_retry_delivery_1")

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(job["metadata"]["scheduler_retry_pending"]["next_attempt_number"], 2)
        self.assertEqual(job["metadata"]["scheduler_retry_pending"]["parent_run_id"], "run_eval_scheduler_failed_1")
        self.assertEqual(job_run["metadata"]["retry_decision"]["action"], "scheduled")
        self.assertEqual(job_run["metadata"]["delivery_result"]["status"], "delivered")
        self.assertEqual(job_run["metadata"]["delivery_result"]["target"]["token"], "[redacted]")

    def test_eval_route_reruns_case_and_clears_previous_result_data(self) -> None:
        saved_runs: list[dict[str, object]] = []

        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.load_template_record", return_value=_eval_template_record()),
                patch("app.evaluator.runner.save_run", side_effect=lambda run: saved_runs.append(dict(run))),
                patch("app.evaluator.runner.execute_node_system_graph_langgraph", return_value={}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "rerun_eval",
                        "name": "Rerun eval",
                        "target_template_id": "mock_template",
                    },
                )
                client.post(
                    "/api/evals/suites/rerun_eval/cases",
                    json={"case_id": "case_one", "input_values": {"prompt": "第一次输入"}},
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "rerun_eval"})
                eval_run_id = run_response.json()["eval_run_id"]
                client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_one/result",
                    json={
                        "graph_run_id": "old_graph_run",
                        "status": "failed",
                        "final_output": {"public_response": "旧输出"},
                        "artifacts": {"old.md": {"path": "old.md"}},
                        "node_failures": [{"node_id": "agent", "error": "failed"}],
                        "check_results": [{"kind": "rule", "status": "failed", "message": "old"}],
                    },
                )

                rerun_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_one/run")

        self.assertEqual(rerun_response.status_code, 200)
        rerun_case = rerun_response.json()
        self.assertEqual(rerun_case["status"], "running")
        self.assertNotEqual(rerun_case["graph_run_id"], "old_graph_run")
        self.assertEqual(rerun_case["final_output"], {})
        self.assertEqual(rerun_case["artifacts"], {})
        self.assertEqual(rerun_case["node_failures"], [])
        self.assertEqual(rerun_case["check_results"], [])
        self.assertEqual(saved_runs[-1]["graph_snapshot"]["state_schema"]["prompt"]["value"], "第一次输入")

    def test_eval_route_collects_completed_graph_run_outputs_and_evaluates_checks(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.collector.load_run", return_value=_completed_eval_graph_run()),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "collect_eval",
                        "name": "Collect eval",
                        "target_graph_id": "graph_collect",
                    },
                )
                client.post(
                    "/api/evals/suites/collect_eval/cases",
                    json={
                        "case_id": "case_one",
                        "checks": [
                            {
                                "kind": "schema",
                                "target": "final_output",
                                "required": ["public_response", "citations"],
                            },
                            {"kind": "artifact", "target": "final.md"},
                            {"kind": "citation", "min_citations": 1},
                        ],
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "collect_eval"})
                eval_run_id = run_response.json()["eval_run_id"]
                client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_one/result",
                    json={"graph_run_id": "run_completed", "status": "running"},
                )

                collect_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_one/collect")

        self.assertEqual(collect_response.status_code, 200)
        collected = collect_response.json()
        self.assertEqual(collected["status"], "passed")
        self.assertEqual(collected["final_output"]["public_response"], "结论引用 [1]。")
        self.assertEqual(collected["final_output"]["citations"], ["kb:1"])
        self.assertEqual(collected["artifacts"]["final.md"]["path"], "backend/data/outputs/run_completed/final.md")
        self.assertEqual([check["status"] for check in collected["check_results"]], ["passed", "passed", "passed"])

    def test_eval_route_collect_can_opt_into_llm_judge_checks(self) -> None:
        def fake_create_judge_runner():
            return lambda **_kwargs: {
                "status": "passed",
                "score": 0.9,
                "message": "Useful and grounded.",
                "actual": {"verdict": "pass"},
                "details": {"model_ref": "test/judge-model"},
            }

        with isolated_eval_database():
            with (
                patch("app.evaluator.collector.load_run", return_value=_completed_eval_graph_run()),
                patch("app.api.routes_evals.create_llm_judge_runner", side_effect=fake_create_judge_runner) as create_runner,
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "collect_judge_eval",
                        "name": "Collect judge eval",
                        "target_graph_id": "graph_collect",
                    },
                )
                client.post(
                    "/api/evals/suites/collect_judge_eval/cases",
                    json={
                        "case_id": "case_one",
                        "checks": [
                            {
                                "kind": "llm_judge",
                                "name": "Rubric judge",
                                "rubric": "The answer must be useful and grounded.",
                            }
                        ],
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "collect_judge_eval"})
                eval_run_id = run_response.json()["eval_run_id"]
                client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_one/result",
                    json={"graph_run_id": "run_completed", "status": "running"},
                )

                collect_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_one/collect",
                    json={"run_llm_judge": True},
                )

        self.assertEqual(collect_response.status_code, 200)
        self.assertEqual(collect_response.json()["status"], "passed")
        self.assertEqual(collect_response.json()["check_results"][0]["reviewer"], "llm_judge")
        self.assertEqual(collect_response.json()["check_results"][0]["score"], 0.9)
        self.assertEqual(create_runner.call_count, 1)

    def test_eval_route_collect_rejects_non_terminal_graph_run(self) -> None:
        with isolated_eval_database():
            with (
                patch("app.evaluator.collector.load_run", return_value={"run_id": "run_pending", "status": "running"}),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "pending_collect_eval",
                        "name": "Pending collect eval",
                        "target_graph_id": "graph_collect",
                    },
                )
                client.post(
                    "/api/evals/suites/pending_collect_eval/cases",
                    json={"case_id": "case_one"},
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "pending_collect_eval"})
                eval_run_id = run_response.json()["eval_run_id"]
                client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_one/result",
                    json={"graph_run_id": "run_pending", "status": "running"},
                )

                collect_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/case_one/collect")

        self.assertEqual(collect_response.status_code, 409)
        self.assertIn("not terminal", collect_response.json()["detail"])

    def test_eval_check_executor_evaluates_schema_artifact_rule_and_citation_checks(self) -> None:
        case = {
            "case_id": "policy_answer",
            "expected": {"min_citations": 2},
            "checks": [
                {
                    "kind": "schema",
                    "name": "Final output fields",
                    "target": "final_output",
                    "required": ["public_response", "citations"],
                },
                {"kind": "artifact", "name": "Markdown artifact", "target": "final.md"},
                {
                    "kind": "rule",
                    "name": "Grounded answer",
                    "target": "public_response",
                    "must_include": ["引用"],
                    "forbidden": ["保证通过"],
                },
                {"kind": "citation", "name": "Two citations", "min_citations": 2},
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={"public_response": "已引用 [1] 和 [2]，仍需人工确认。", "citations": ["kb:1", "kb:2"]},
            artifacts={"final.md": {"path": "backend/data/outputs/run/final.md", "summary": "final answer"}},
        )

        self.assertEqual([result["status"] for result in results], ["passed", "passed", "passed", "passed"])
        self.assertEqual(results[0]["actual"]["present"], ["public_response", "citations"])
        self.assertEqual(results[1]["actual"]["found"], True)
        self.assertEqual(results[2]["actual"]["forbidden_found"], [])
        self.assertEqual(results[3]["actual"]["citation_count"], 2)

    def test_eval_check_executor_evaluates_knowledge_retrieval_quality(self) -> None:
        case = {
            "case_id": "refund_policy_retrieval",
            "checks": [
                {
                    "kind": "knowledge_retrieval",
                    "name": "Refund policy retrieval quality",
                    "target": "knowledge_context",
                    "min_results": 2,
                    "required_chunk_ids": ["refund-policy#rules"],
                    "required_citation_ids": ["kb:hybrid-test:1"],
                    "required_source_paths": ["docs/policies/refund.md"],
                    "required_terms": ["Refund audit policy", "human review"],
                    "forbidden_terms": ["unverified shortcut"],
                    "max_citations": 3,
                    "max_context_chars": 900,
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "knowledge_context": {
                    "result_count": 2,
                    "context": (
                        "Refund audit policy requires support tickets and human review before approval. "
                        "Evidence must stay citation-ready."
                    ),
                    "results": [
                        {
                            "citation_id": "kb:hybrid-test:1",
                            "chunk_id": "refund-policy#rules",
                            "title": "Refund Policy",
                            "source": "https://example.test/refund",
                            "summary": "Refund audit policy",
                            "metadata": {"source_path": "docs/policies/refund.md"},
                            "retrieval": {"mode": "hybrid", "keyword_score": 1.0, "vector_score": 0.77},
                        },
                        {
                            "citation_id": "kb:hybrid-test:2",
                            "chunk_id": "refund-policy#evidence",
                            "title": "Refund Evidence",
                            "source": "docs/policies/refund.md",
                            "summary": "Evidence requirements",
                            "metadata": {"source_path": "docs/policies/refund.md"},
                            "retrieval": {"mode": "hybrid", "keyword_score": 0.8, "vector_score": 0.52},
                        },
                    ],
                    "citations": [
                        {"citation_id": "kb:hybrid-test:1", "chunk_id": "refund-policy#rules"},
                        {"citation_id": "kb:hybrid-test:2", "chunk_id": "refund-policy#evidence"},
                    ],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["result_count"], 2)
        self.assertEqual(results[0]["actual"]["citation_count"], 2)
        self.assertEqual(results[0]["actual"]["missing_chunk_ids"], [])
        self.assertEqual(results[0]["actual"]["missing_citation_ids"], [])
        self.assertEqual(results[0]["actual"]["missing_source_paths"], [])
        self.assertEqual(results[0]["actual"]["missing_terms"], [])
        self.assertEqual(results[0]["actual"]["forbidden_terms_found"], [])

    def test_eval_check_executor_evaluates_memory_retrieval_quality(self) -> None:
        case = {
            "case_id": "memory_recall_quality",
            "checks": [
                {
                    "kind": "memory_retrieval",
                    "name": "Memory recall quality",
                    "target": "memory_search_report",
                    "min_results": 1,
                    "required_memory_ids": ["mem_eval_preference"],
                    "required_source_refs": [
                        {"source_kind": "buddy_message", "source_id": "msg_eval_preference"}
                    ],
                    "required_terms": ["先给结论", "memory recall"],
                    "forbidden_terms": ["无来源"],
                    "max_context_chars": 1200,
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "memory_search_report": {
                    "query": "memory recall",
                    "memory_count": 1,
                    "context_chars": 42,
                    "memory_ids": ["mem_eval_preference"],
                    "source_refs": [
                        {
                            "source_kind": "memory_entry",
                            "source_id": "mem_eval_preference",
                        },
                        {
                            "source_kind": "buddy_message",
                            "source_id": "msg_eval_preference",
                        },
                    ],
                    "results": [
                        {
                            "memory_id": "mem_eval_preference",
                            "title": "回复偏好",
                            "content": "用户偏好 memory recall 命中后先给结论。",
                        }
                    ],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["memory_count"], 1)
        self.assertEqual(results[0]["actual"]["missing_memory_ids"], [])
        self.assertEqual(results[0]["actual"]["missing_source_refs"], [])
        self.assertEqual(results[0]["actual"]["missing_terms"], [])

    def test_eval_check_executor_fails_memory_retrieval_when_required_rerank_order_is_missing(self) -> None:
        case = {
            "case_id": "memory_rerank_quality",
            "checks": [
                {
                    "kind": "memory_retrieval",
                    "target": "memory_search_report",
                    "min_results": 2,
                    "required_memory_ids": ["mem_expected", "mem_other"],
                    "required_reranker_model_ref": "local-rerank/bge-reranker-v2",
                    "required_rerank_status": "succeeded",
                    "required_top_memory_id": "mem_expected",
                    "required_ranked_memory_ids": ["mem_expected", "mem_other"],
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "memory_search_report": {
                    "memory_count": 2,
                    "memory_ids": ["mem_expected", "mem_other"],
                    "ranking_reports": [
                        {
                            "kind": "retrieval_ranking_report",
                            "reranker_model_ref": "local-rerank/bge-reranker-v2",
                            "ranking_metadata": {"rerank": {"status": "succeeded"}},
                            "ranked_results": [
                                {
                                    "rank": 1,
                                    "source_ref": {"source_kind": "memory_entry", "source_id": "mem_other"},
                                    "rerank_score": 0.91,
                                },
                                {
                                    "rank": 2,
                                    "source_ref": {"source_kind": "memory_entry", "source_id": "mem_expected"},
                                    "rerank_score": 0.89,
                                },
                            ],
                        }
                    ],
                    "results": [
                        {"memory_id": "mem_expected", "content": "expected memory"},
                        {"memory_id": "mem_other", "content": "other memory"},
                    ],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "failed")
        self.assertIn("Expected top reranked memory id mem_expected", results[0]["message"])
        self.assertEqual(results[0]["actual"]["top_memory_id"], "mem_other")
        self.assertEqual(results[0]["actual"]["ranked_memory_ids"], ["mem_other", "mem_expected"])

    def test_eval_check_executor_passes_memory_retrieval_rerank_quality(self) -> None:
        case = {
            "case_id": "memory_rerank_quality",
            "checks": [
                {
                    "kind": "memory_retrieval",
                    "target": "memory_search_report",
                    "min_results": 2,
                    "required_memory_ids": ["mem_expected", "mem_other"],
                    "required_reranker_model_ref": "local-rerank/bge-reranker-v2",
                    "required_rerank_status": "succeeded",
                    "required_top_memory_id": "mem_expected",
                    "required_ranked_memory_ids": ["mem_expected", "mem_other"],
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "memory_search_report": {
                    "memory_count": 2,
                    "memory_ids": ["mem_expected", "mem_other"],
                    "ranking_reports": [
                        {
                            "kind": "retrieval_ranking_report",
                            "reranker_model_ref": "local-rerank/bge-reranker-v2",
                            "ranking_metadata": {"rerank": {"status": "succeeded"}},
                            "ranked_results": [
                                {
                                    "rank": 1,
                                    "source_ref": {"source_kind": "memory_entry", "source_id": "mem_expected"},
                                    "rerank_score": 0.97,
                                },
                                {
                                    "rank": 2,
                                    "source_ref": {"source_kind": "memory_entry", "source_id": "mem_other"},
                                    "rerank_score": 0.61,
                                },
                            ],
                        }
                    ],
                    "results": [
                        {"memory_id": "mem_expected", "content": "expected memory"},
                        {"memory_id": "mem_other", "content": "other memory"},
                    ],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["actual"]["top_memory_id"], "mem_expected")
        self.assertEqual(results[0]["actual"]["rerank_statuses"], ["succeeded"])

    def test_eval_check_executor_evaluates_hybrid_recall_report(self) -> None:
        case = {
            "case_id": "hybrid_recall_quality",
            "checks": [
                {
                    "kind": "hybrid_recall",
                    "name": "Hybrid recall quality",
                    "target": "hybrid_recall_report",
                    "min_memory_results": 1,
                    "min_session_results": 1,
                    "required_memory_ids": ["mem_eval_hybrid_preference"],
                    "required_message_ids": ["msg_eval_hybrid_user"],
                    "required_source_refs": [
                        {"source_kind": "memory_entry", "source_id": "mem_eval_hybrid_preference"},
                        {"source_kind": "buddy_message", "source_id": "msg_eval_hybrid_user"},
                    ],
                    "required_terms": ["hybrid-memory-evidence", "hybrid-session-evidence"],
                    "max_context_chars": 1600,
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "hybrid_recall_report": {
                    "scope": "hybrid_recall",
                    "query": "hybrid evidence",
                    "memory_count": 1,
                    "session_count": 1,
                    "context_chars": 84,
                    "memory_ids": ["mem_eval_hybrid_preference"],
                    "message_ids": ["msg_eval_hybrid_user"],
                    "source_refs": [
                        {"source_kind": "memory_entry", "source_id": "mem_eval_hybrid_preference"},
                        {"source_kind": "buddy_message", "source_id": "msg_eval_hybrid_user"},
                    ],
                    "results": [
                        {
                            "kind": "memory",
                            "memory_id": "mem_eval_hybrid_preference",
                            "content": "hybrid-memory-evidence 表示用户偏好。",
                        },
                        {
                            "kind": "session",
                            "message_id": "msg_eval_hybrid_user",
                            "content": "hybrid-session-evidence 来自历史对话。",
                        },
                    ],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["memory_count"], 1)
        self.assertEqual(results[0]["actual"]["session_count"], 1)
        self.assertEqual(results[0]["actual"]["missing_memory_ids"], [])
        self.assertEqual(results[0]["actual"]["missing_message_ids"], [])
        self.assertEqual(results[0]["actual"]["missing_source_refs"], [])

    def test_eval_check_executor_evaluates_capability_selection_fallback_trace(self) -> None:
        case = {
            "case_id": "selector_fallback_quality",
            "checks": [
                {
                    "kind": "capability_selection",
                    "name": "Selector chooses healthy fallback",
                    "target": "capability_selection_trace",
                    "required_requested": {"kind": "action", "key": "raw_search"},
                    "required_selected": {"kind": "action", "key": "web_search_backup"},
                    "required_rejected": [
                        {
                            "kind": "action",
                            "key": "raw_search",
                            "reason": "recent_failures_fallback_preferred",
                        }
                    ],
                    "required_fallbacks": [
                        {"kind": "action", "key": "raw_search", "reason": "original_candidate"}
                    ],
                    "min_rejected": 1,
                    "min_fallbacks": 1,
                    "required_terms": ["recent_failures_fallback_preferred"],
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "capability_selection_trace": {
                    "requested": {"kind": "action", "key": "raw_search"},
                    "selected": {"kind": "action", "key": "web_search_backup"},
                    "rejected_candidates": [
                        {
                            "kind": "action",
                            "key": "raw_search",
                            "reason": "recent_failures_fallback_preferred",
                        }
                    ],
                    "fallback_candidates": [
                        {"kind": "action", "key": "raw_search", "reason": "original_candidate"}
                    ],
                    "score_breakdown": {"selected": {"recent_failure_count": 0}},
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["selected"], {"kind": "action", "key": "web_search_backup"})
        self.assertEqual(results[0]["actual"]["missing_selected"], [])
        self.assertEqual(results[0]["actual"]["missing_rejected"], [])
        self.assertEqual(results[0]["actual"]["missing_fallbacks"], [])

    def test_eval_check_executor_evaluates_scheduler_retry_delivery_report(self) -> None:
        case = {
            "case_id": "scheduler_retry_delivery_quality",
            "checks": [
                {
                    "kind": "scheduler_run",
                    "name": "Scheduler retry and delivery",
                    "target": "scheduler_run_report",
                    "required_job_id": "sched_eval_retry_delivery",
                    "required_job_run_id": "schedrun_eval_retry_delivery_1",
                    "required_run_id": "run_eval_scheduler_failed_1",
                    "required_trigger_reason": "schedule",
                    "required_status": "failed",
                    "required_retry_decision": {
                        "action": "scheduled",
                        "next_attempt_number": 2,
                        "delay_seconds": 300,
                    },
                    "required_pending_retry": {
                        "next_attempt_number": 2,
                        "parent_run_id": "run_eval_scheduler_failed_1",
                    },
                    "required_delivery_result": {
                        "kind": "local_audit",
                        "status": "delivered",
                        "terminal_status": "failed",
                        "run_ref": {"run_id": "run_eval_scheduler_failed_1"},
                    },
                    "required_terms": ["provider timeout", "scheduler_retry_pending"],
                    "forbidden_terms": ["secret-token"],
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "scheduler_run_report": {
                    "job_id": "sched_eval_retry_delivery",
                    "job_run_id": "schedrun_eval_retry_delivery_1",
                    "run_id": "run_eval_scheduler_failed_1",
                    "trigger_reason": "schedule",
                    "status": "failed",
                    "error": "provider timeout",
                    "retry_decision": {
                        "action": "scheduled",
                        "attempt_number": 1,
                        "next_attempt_number": 2,
                        "max_attempts": 3,
                        "scheduled_for": "2026-05-27T06:10:00Z",
                        "delay_seconds": 300,
                    },
                    "scheduler_retry_pending": {
                        "parent_job_run_id": "schedrun_eval_retry_delivery_1",
                        "parent_run_id": "run_eval_scheduler_failed_1",
                        "next_attempt_number": 2,
                        "scheduled_for": "2026-05-27T06:10:00Z",
                    },
                    "delivery_result": {
                        "kind": "local_audit",
                        "status": "delivered",
                        "terminal_status": "failed",
                        "run_ref": {"kind": "graph_run", "run_id": "run_eval_scheduler_failed_1"},
                        "target": {"kind": "local_audit", "token": "[redacted]"},
                    },
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["missing_retry_decision"], {})
        self.assertEqual(results[0]["actual"]["missing_delivery_result"], {})
        self.assertEqual(results[0]["actual"]["forbidden_terms_found"], [])

    def test_eval_check_executor_fails_scheduler_report_missing_permission_policy(self) -> None:
        case = {
            "case_id": "scheduler_permission_boundary_quality",
            "checks": [
                {
                    "kind": "scheduler_run",
                    "name": "Scheduler permission boundary",
                    "target": "scheduler_run_report",
                    "required_graph_permission_mode": "ask_first",
                    "required_permission_policy": {
                        "approval_required_permission_tiers": ["risky"],
                    },
                    "required_permission_policy_source": "scheduler_default",
                    "required_pending_permission_approval": {
                        "permissions": ["file_write"],
                    },
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={"scheduler_run_report": {"job_id": "sched_eval_permission"}},
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "failed")
        self.assertEqual(results[0]["actual"]["missing_fields"], ["graph_permission_mode", "permission_policy_source"])
        self.assertEqual(
            results[0]["actual"]["missing_permission_policy"],
            {"approval_required_permission_tiers": ["risky"]},
        )
        self.assertEqual(
            results[0]["actual"]["missing_pending_permission_approval"],
            {"permissions": ["file_write"]},
        )

    def test_eval_check_executor_evaluates_delegation_worker_result_package(self) -> None:
        case = {
            "case_id": "delegation_worker_quality",
            "checks": [
                {
                    "kind": "delegation_worker",
                    "name": "Worker result package",
                    "target": "worker_result_package",
                    "required_task_id": "worker_eval_research_1",
                    "required_status": "succeeded",
                    "required_output_keys": ["findings", "source_refs"],
                    "required_source_refs": [
                        {"source_kind": "context_package", "source_id": "ctx_eval_worker_brief"}
                    ],
                    "required_terms": ["TooGraph", "Hermes"],
                    "forbidden_terms": ["unscoped secret"],
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "worker_result_package": {
                    "kind": "worker_result_package",
                    "task_id": "worker_eval_research_1",
                    "status": "succeeded",
                    "summary": "Compared TooGraph and Hermes worker delegation requirements.",
                    "outputs": {
                        "findings": {
                            "name": "Findings",
                            "type": "markdown",
                            "value": "TooGraph should expose worker_task_packet and worker_result_package.",
                        },
                        "source_refs": {
                            "name": "Source Refs",
                            "type": "json",
                            "value": [{"source_kind": "context_package", "source_id": "ctx_eval_worker_brief"}],
                        },
                    },
                    "source_refs": [
                        {"source_kind": "context_package", "source_id": "ctx_eval_worker_brief"}
                    ],
                    "budget": {"max_steps": 2, "used_steps": 1},
                    "errors": [],
                    "followups": [],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["missing_output_keys"], [])
        self.assertEqual(results[0]["actual"]["missing_source_refs"], [])
        self.assertEqual(results[0]["actual"]["forbidden_terms_found"], [])

    def test_eval_check_executor_evaluates_provider_fallback_trace(self) -> None:
        case = {
            "case_id": "provider_fallback_quality",
            "checks": [
                {
                    "kind": "provider_fallback",
                    "name": "Provider fallback quality",
                    "target": "provider_fallback_trace",
                    "required_requested": {"provider_id": "openai", "model": "gpt-primary"},
                    "required_selected": {"provider_id": "local", "model": "backup-model"},
                    "required_failed": {"provider_id": "openai", "error_type": "provider_timeout"},
                    "required_capabilities": ["chat", "structured_output"],
                    "required_permissions": ["text_generation"],
                    "min_fallbacks": 1,
                    "required_terms": ["fallback_selected", "provider_timeout"],
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "provider_fallback_trace": {
                    "kind": "provider_fallback_trace",
                    "decision": "fallback_selected",
                    "fallback_used": True,
                    "requested": {"provider_id": "openai", "model": "gpt-primary", "model_ref": "openai/gpt-primary"},
                    "selected": {"provider_id": "local", "model": "backup-model", "model_ref": "local/backup-model"},
                    "failed_candidates": [
                        {
                            "provider_id": "openai",
                            "model": "gpt-primary",
                            "model_ref": "openai/gpt-primary",
                            "error_type": "provider_timeout",
                        }
                    ],
                    "fallback_candidates": [
                        {"provider_id": "local", "model": "backup-model", "model_ref": "local/backup-model"}
                    ],
                    "required_capabilities": ["chat", "structured_output"],
                    "required_permissions": ["text_generation"],
                }
            },
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "passed")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[0]["actual"]["selected"]["model_ref"], "local/backup-model")
        self.assertEqual(results[0]["actual"]["missing_failed"], [])
        self.assertEqual(results[0]["actual"]["missing_capabilities"], [])

    def test_eval_check_executor_reports_knowledge_retrieval_quality_failures(self) -> None:
        case = {
            "case_id": "weak_refund_retrieval",
            "checks": [
                {
                    "kind": "knowledge_retrieval",
                    "name": "Weak retrieval quality",
                    "target": "knowledge_context",
                    "min_results": 2,
                    "required_chunk_ids": ["refund-policy#rules"],
                    "required_citation_ids": ["kb:hybrid-test:1"],
                    "required_source_paths": ["docs/policies/refund.md"],
                    "required_terms": ["Refund audit policy"],
                    "forbidden_terms": ["unverified shortcut"],
                    "max_citations": 1,
                    "max_context_chars": 30,
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={
                "knowledge_context": {
                    "context": "Release notes mention an unverified shortcut for dashboards.",
                    "results": [
                        {
                            "citation_id": "kb:hybrid-test:9",
                            "chunk_id": "release-notes#overview",
                            "title": "Release Notes",
                            "source": "docs/releases/may.md",
                            "metadata": {"source_path": "docs/releases/may.md"},
                        }
                    ],
                    "citations": [
                        {"citation_id": "kb:hybrid-test:9"},
                        {"citation_id": "kb:hybrid-test:10"},
                    ],
                }
            },
            artifacts={},
        )

        actual = results[0]["actual"]
        self.assertEqual(results[0]["status"], "failed")
        self.assertIn("Expected at least 2 retrieval result", results[0]["message"])
        self.assertEqual(actual["result_count"], 1)
        self.assertEqual(actual["citation_count"], 2)
        self.assertEqual(actual["missing_chunk_ids"], ["refund-policy#rules"])
        self.assertEqual(actual["missing_citation_ids"], ["kb:hybrid-test:1"])
        self.assertEqual(actual["missing_source_paths"], ["docs/policies/refund.md"])
        self.assertEqual(actual["missing_terms"], ["Refund audit policy"])
        self.assertEqual(actual["forbidden_terms_found"], ["unverified shortcut"])
        self.assertGreater(actual["context_chars"], 30)

    def test_eval_check_executor_reports_failed_rule_and_missing_artifact(self) -> None:
        case = {
            "case_id": "unsafe_answer",
            "checks": [
                {"kind": "artifact", "name": "Missing markdown", "target": "final.md"},
                {
                    "kind": "rule",
                    "name": "No certainty",
                    "target": "public_response",
                    "forbidden": ["保证通过"],
                },
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={"public_response": "这份材料保证通过审批。"},
            artifacts={},
        )

        self.assertEqual([result["status"] for result in results], ["failed", "failed"])
        self.assertIn("Missing artifact", results[0]["message"])
        self.assertEqual(results[1]["actual"]["forbidden_found"], ["保证通过"])

    def test_eval_check_executor_skips_llm_judge_without_runner(self) -> None:
        case = {
            "case_id": "policy_answer",
            "checks": [
                {
                    "kind": "llm_judge",
                    "name": "Policy usefulness judge",
                    "rubric": "The answer should cite the policy and identify risks.",
                    "min_score": 0.7,
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={"public_response": "Policy answer with [1]."},
            artifacts={},
        )

        self.assertEqual(results[0]["status"], "skipped")
        self.assertEqual(results[0]["reviewer"], "llm_judge")
        self.assertIn("not enabled", results[0]["message"])

    def test_eval_check_executor_records_llm_judge_result_from_runner(self) -> None:
        seen: dict[str, object] = {}

        def fake_judge_runner(**kwargs):
            seen.update(kwargs)
            return {
                "status": "failed",
                "score": 0.4,
                "message": "The answer cites a source but does not explain operational risk.",
                "actual": {"verdict": "fail", "reason": "Missing risk explanation."},
                "details": {"model_ref": "test/judge-model", "latency_ms": 12},
            }

        case = {
            "case_id": "policy_answer",
            "expected": {"must_include": ["risk"]},
            "checks": [
                {
                    "kind": "llm_judge",
                    "name": "Risk-aware answer judge",
                    "target": "public_response",
                    "rubric": "Score whether the answer explains concrete operational risk.",
                    "min_score": 0.75,
                }
            ],
        }

        results = evaluate_case_checks(
            case,
            final_output={"public_response": "Policy answer with [1]."},
            artifacts={"final.md": {"path": "backend/data/outputs/run/final.md"}},
            judge_runner=fake_judge_runner,
        )

        self.assertEqual(seen["case"]["case_id"], "policy_answer")
        self.assertEqual(seen["check"]["name"], "Risk-aware answer judge")
        self.assertEqual(seen["final_output"], {"public_response": "Policy answer with [1]."})
        self.assertEqual(results[0]["kind"], "llm_judge")
        self.assertEqual(results[0]["status"], "failed")
        self.assertEqual(results[0]["score"], 0.4)
        self.assertEqual(results[0]["reviewer"], "llm_judge")
        self.assertEqual(results[0]["expected"]["min_score"], 0.75)
        self.assertEqual(results[0]["actual"]["verdict"], "fail")
        self.assertEqual(results[0]["details"]["model_ref"], "test/judge-model")

    def test_llm_judge_runner_skips_when_no_model_is_configured(self) -> None:
        def fail_chat(**_kwargs):
            raise AssertionError("chat should not be called without a model ref")

        result = run_llm_judge(
            case={"case_id": "policy_answer"},
            check={"kind": "llm_judge", "name": "Policy judge"},
            final_output={"public_response": "Answer."},
            artifacts={},
            get_default_text_model_ref_func=lambda **_kwargs: "",
            chat_with_model_ref_with_meta_func=fail_chat,
        )

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["details"]["reason"], "missing_model_ref")

    def test_llm_judge_runner_invokes_model_and_parses_structured_judgment(self) -> None:
        seen: dict[str, object] = {}

        def fake_chat(**kwargs):
            seen.update(kwargs)
            return (
                '{"status":"passed","score":0.88,"message":"Useful and grounded.",'
                '"verdict":"pass","reason":"Cites a policy source."}',
                {"provider_id": "test", "model": "judge-model", "request_raw": {"secret": True}},
            )

        result = run_llm_judge(
            case={
                "case_id": "policy_answer",
                "input_values": {"question": "What changed?"},
                "expected": {"must_include": ["risk"]},
            },
            check={
                "kind": "llm_judge",
                "name": "Policy judge",
                "model_ref": "test/judge-model",
                "rubric": "The answer must be grounded and useful.",
            },
            final_output={"public_response": "Answer with [1]."},
            artifacts={},
            get_default_text_model_ref_func=lambda **_kwargs: "",
            chat_with_model_ref_with_meta_func=fake_chat,
        )

        self.assertEqual(seen["model_ref"], "test/judge-model")
        self.assertIn("structured_output_schema", seen)
        self.assertIn('"case_id": "policy_answer"', seen["user_prompt"])
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["score"], 0.88)
        self.assertEqual(result["actual"]["verdict"], "pass")
        self.assertEqual(result["details"]["model_ref"], "test/judge-model")
        self.assertEqual(result["details"]["model_meta"]["provider_id"], "test")
        self.assertNotIn("request_raw", result["details"]["model_meta"])

    def test_eval_store_records_suite_cases_runs_results_and_checks(self) -> None:
        with isolated_eval_database():
            suite = store.create_eval_suite(
                {
                    "suite_id": "buddy_loop_core",
                    "name": "Buddy loop core",
                    "description": "Core Buddy regression suite.",
                    "target_template_id": "buddy_autonomous_loop",
                    "tags": ["buddy", "capability_loop"],
                    "metadata": {"owner": "product"},
                }
            )
            case = store.create_eval_case(
                "buddy_loop_core",
                {
                    "case_id": "answers_with_citations",
                    "name": "Answers with citations",
                    "input_values": {"input_user_message": "Summarize the cited policy."},
                    "expected": {"must_include": ["citation"]},
                    "checks": [
                        {"kind": "schema", "name": "Final reply schema", "required": ["public_response"]},
                        {"kind": "citation", "name": "Citation present"},
                    ],
                    "metadata": {"priority": "p0"},
                },
            )
            eval_run = store.create_eval_run("buddy_loop_core", requested_by="unit-test", metadata={"reason": "regression"})
            pending_detail = store.load_eval_run(eval_run["eval_run_id"])

            self.assertEqual(suite["suite_id"], "buddy_loop_core")
            self.assertEqual(case["checks"][1]["kind"], "citation")
            self.assertEqual(pending_detail["case_results"][0]["status"], "pending")
            self.assertEqual(pending_detail["case_results"][0]["case_id"], "answers_with_citations")

            result = store.record_eval_case_result(
                eval_run["eval_run_id"],
                "answers_with_citations",
                {
                    "graph_run_id": "run_graph_123",
                    "status": "failed",
                    "final_output": {"public_response": "No citation."},
                    "error": "Missing citation.",
                    "artifacts": {"output_path": "backend/data/outputs/run_graph_123/final.md"},
                    "node_failures": [{"node_id": "citation_check", "error": "No citation ids found."}],
                    "check_results": [
                        {"kind": "schema", "name": "Final reply schema", "status": "passed", "score": 1},
                        {
                            "kind": "citation",
                            "name": "Citation present",
                            "status": "failed",
                            "score": 0,
                            "message": "No citation ids found.",
                            "expected": {"min_citations": 1},
                            "actual": {"citations": []},
                        },
                    ],
                    "human_review": {"reviewer": "qa", "decision": "needs_fix"},
                },
            )
            loaded = store.load_eval_run(eval_run["eval_run_id"])

            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["graph_run_id"], "run_graph_123")
            self.assertEqual(result["node_failures"][0]["node_id"], "citation_check")
            self.assertEqual([check["status"] for check in result["check_results"]], ["passed", "failed"])
            self.assertEqual(loaded["status"], "failed")
            self.assertEqual(loaded["case_results"][0]["error"], "Missing citation.")
            self.assertEqual(loaded["case_results"][0]["human_review"]["decision"], "needs_fix")
            self.assertEqual(store.list_eval_suites()[0]["case_count"], 1)

    def test_eval_routes_create_and_report_suite_run_results(self) -> None:
        with isolated_eval_database():
            with TestClient(app) as client:
                suite_response = client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "template_quality",
                        "name": "Template quality",
                        "target_template_id": "policy_navigator_agent",
                        "tags": ["gallery"],
                    },
                )
                case_response = client.post(
                    "/api/evals/suites/template_quality/cases",
                    json={
                        "case_id": "policy_citation",
                        "name": "Policy citation",
                        "input_values": {"policy_text": "Policy text"},
                        "expected": {"citations": 1},
                        "checks": [{"kind": "citation", "name": "Has citation"}],
                    },
                )
                run_response = client.post(
                    "/api/evals/runs",
                    json={"suite_id": "template_quality", "requested_by": "route-test"},
                )
                eval_run_id = run_response.json()["eval_run_id"]
                result_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/policy_citation/result",
                    json={
                        "graph_run_id": "run_policy_1",
                        "status": "passed",
                        "final_output": {"answer": "Includes [1]."},
                        "artifacts": {"citations": ["kb:policy:1"]},
                        "check_results": [
                            {"kind": "citation", "name": "Has citation", "status": "passed", "score": 1}
                        ],
                    },
                )
                suites_response = client.get("/api/evals/suites")
                run_detail_response = client.get(f"/api/evals/runs/{eval_run_id}")

        self.assertEqual(suite_response.status_code, 200)
        self.assertEqual(case_response.status_code, 200)
        self.assertEqual(run_response.status_code, 200)
        self.assertEqual(result_response.status_code, 200)
        suites_by_id = {suite["suite_id"]: suite for suite in suites_response.json()}
        self.assertEqual(suites_by_id["template_quality"]["case_count"], 1)
        self.assertEqual(run_detail_response.json()["status"], "passed")
        self.assertEqual(run_detail_response.json()["case_results"][0]["graph_run_id"], "run_policy_1")
        self.assertEqual(run_detail_response.json()["case_results"][0]["check_results"][0]["kind"], "citation")

    def test_eval_routes_list_suite_runs_with_case_results(self) -> None:
        with isolated_eval_database():
            with TestClient(app) as client:
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "listable_suite",
                        "name": "Listable suite",
                        "target_template_id": "policy_navigator_agent",
                    },
                )
                client.post(
                    "/api/evals/suites/listable_suite/cases",
                    json={"case_id": "case_one", "name": "Case one"},
                )
                first_run = client.post("/api/evals/runs", json={"suite_id": "listable_suite"}).json()
                second_run = client.post("/api/evals/runs", json={"suite_id": "listable_suite"}).json()
                client.post(
                    f"/api/evals/runs/{second_run['eval_run_id']}/cases/case_one/result",
                    json={"graph_run_id": "run_case_one", "status": "passed"},
                )

                runs_response = client.get("/api/evals/suites/listable_suite/runs")

        self.assertEqual(runs_response.status_code, 200)
        runs = runs_response.json()
        self.assertEqual([run["eval_run_id"] for run in runs], [second_run["eval_run_id"], first_run["eval_run_id"]])
        self.assertEqual(runs[0]["status"], "passed")
        self.assertEqual(runs[0]["case_results"][0]["graph_run_id"], "run_case_one")

    def test_eval_route_runs_all_cases_for_eval_run(self) -> None:
        def fake_start(_eval_run, case_result, _case, **_kwargs):
            return {"run_id": f"run_{case_result['case_id']}"}

        with isolated_eval_database():
            with (
                patch("app.evaluator.runner.start_eval_case_graph_run", side_effect=fake_start),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "batch_run_suite",
                        "name": "Batch run suite",
                        "target_graph_id": "graph_batch",
                    },
                )
                client.post("/api/evals/suites/batch_run_suite/cases", json={"case_id": "case_one"})
                client.post("/api/evals/suites/batch_run_suite/cases", json={"case_id": "case_two"})
                run_response = client.post("/api/evals/runs", json={"suite_id": "batch_run_suite"})
                eval_run_id = run_response.json()["eval_run_id"]

                batch_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/run")
                run_detail_response = client.get(f"/api/evals/runs/{eval_run_id}")

        self.assertEqual(batch_response.status_code, 200)
        batch = batch_response.json()
        self.assertEqual(batch["started_count"], 2)
        self.assertEqual(batch["skipped_count"], 0)
        self.assertEqual(batch["errors"], [])
        self.assertEqual(
            {result["case_id"]: result["graph_run_id"] for result in batch["results"]},
            {"case_one": "run_case_one", "case_two": "run_case_two"},
        )
        self.assertEqual(run_detail_response.json()["status"], "running")
        self.assertEqual([result["status"] for result in run_detail_response.json()["case_results"]], ["running", "running"])

    def test_eval_route_collects_all_available_case_results(self) -> None:
        def fake_collect(_case, case_result):
            return {
                "graph_run_id": case_result["graph_run_id"],
                "status": "passed",
                "final_output": {"public_response": case_result["case_id"]},
                "artifacts": {},
                "node_failures": [],
                "check_results": [],
            }

        with isolated_eval_database():
            with (
                patch("app.evaluator.collector.collect_eval_case_result_payload", side_effect=fake_collect),
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "batch_collect_suite",
                        "name": "Batch collect suite",
                        "target_graph_id": "graph_batch",
                    },
                )
                client.post("/api/evals/suites/batch_collect_suite/cases", json={"case_id": "case_one"})
                client.post("/api/evals/suites/batch_collect_suite/cases", json={"case_id": "case_two"})
                run_response = client.post("/api/evals/runs", json={"suite_id": "batch_collect_suite"})
                eval_run_id = run_response.json()["eval_run_id"]
                client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/case_one/result",
                    json={"graph_run_id": "run_case_one", "status": "running"},
                )

                batch_response = client.post(f"/api/evals/runs/{eval_run_id}/cases/collect")

        self.assertEqual(batch_response.status_code, 200)
        batch = batch_response.json()
        self.assertEqual(batch["collected_count"], 1)
        self.assertEqual(batch["skipped_count"], 1)
        self.assertEqual(batch["errors"], [])
        self.assertEqual(batch["results"][0]["case_id"], "case_one")
        self.assertEqual(batch["results"][0]["status"], "passed")

    def test_eval_route_evaluates_and_records_case_checks(self) -> None:
        with isolated_eval_database():
            with TestClient(app) as client:
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "policy_quality",
                        "name": "Policy quality",
                        "target_template_id": "policy_navigator_agent",
                    },
                )
                client.post(
                    "/api/evals/suites/policy_quality/cases",
                    json={
                        "case_id": "policy_answer",
                        "name": "Policy answer",
                        "checks": [
                            {
                                "kind": "schema",
                                "name": "Final output fields",
                                "target": "final_output",
                                "required": ["public_response", "citations"],
                            },
                            {"kind": "artifact", "name": "Final artifact", "target": "final.md"},
                            {"kind": "citation", "name": "Citation present", "min_citations": 1},
                        ],
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "policy_quality"})
                eval_run_id = run_response.json()["eval_run_id"]

                evaluate_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/policy_answer/evaluate",
                    json={
                        "graph_run_id": "run_policy_eval",
                        "final_output": {
                            "public_response": "结论引用 [1]，仍需人工确认。",
                            "citations": ["kb:policy:1"],
                        },
                        "artifacts": {"final.md": {"path": "backend/data/outputs/run_policy_eval/final.md"}},
                    },
                )
                run_detail_response = client.get(f"/api/evals/runs/{eval_run_id}")

        self.assertEqual(evaluate_response.status_code, 200)
        self.assertEqual(evaluate_response.json()["status"], "passed")
        self.assertEqual(
            [check["status"] for check in evaluate_response.json()["check_results"]],
            ["passed", "passed", "passed"],
        )
        self.assertEqual(run_detail_response.json()["status"], "passed")
        self.assertEqual(run_detail_response.json()["case_results"][0]["graph_run_id"], "run_policy_eval")

    def test_eval_route_runs_llm_judge_only_with_explicit_opt_in(self) -> None:
        def fake_create_judge_runner():
            return lambda **_kwargs: {
                "status": "passed",
                "score": 0.91,
                "message": "The response satisfies the rubric.",
                "actual": {"verdict": "pass"},
                "details": {"model_ref": "test/judge-model"},
            }

        with isolated_eval_database():
            with (
                patch("app.api.routes_evals.create_llm_judge_runner", side_effect=fake_create_judge_runner) as create_runner,
                TestClient(app) as client,
            ):
                client.post(
                    "/api/evals/suites",
                    json={
                        "suite_id": "judge_quality",
                        "name": "Judge quality",
                        "target_template_id": "policy_navigator_agent",
                    },
                )
                client.post(
                    "/api/evals/suites/judge_quality/cases",
                    json={
                        "case_id": "judge_answer",
                        "name": "Judge answer",
                        "checks": [
                            {
                                "kind": "llm_judge",
                                "name": "Rubric judge",
                                "rubric": "The answer must be grounded and useful.",
                                "min_score": 0.8,
                            }
                        ],
                    },
                )
                run_response = client.post("/api/evals/runs", json={"suite_id": "judge_quality"})
                eval_run_id = run_response.json()["eval_run_id"]

                skipped_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/judge_answer/evaluate",
                    json={"final_output": {"public_response": "Grounded answer [1]."}},
                )
                judged_response = client.post(
                    f"/api/evals/runs/{eval_run_id}/cases/judge_answer/evaluate",
                    json={"run_llm_judge": True, "final_output": {"public_response": "Grounded answer [1]."}},
                )

        self.assertEqual(skipped_response.status_code, 200)
        self.assertEqual(skipped_response.json()["status"], "skipped")
        self.assertEqual(skipped_response.json()["check_results"][0]["status"], "skipped")
        self.assertEqual(judged_response.status_code, 200)
        self.assertEqual(judged_response.json()["status"], "passed")
        self.assertEqual(judged_response.json()["check_results"][0]["score"], 0.91)
        self.assertEqual(create_runner.call_count, 1)


if __name__ == "__main__":
    unittest.main()
