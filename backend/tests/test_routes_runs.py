from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


def _valid_resume_graph_snapshot() -> dict:
    return {
        "graph_id": "graph_1",
        "name": "伙伴自主循环",
        "state_schema": {
            "answer": {
                "name": "Answer",
                "description": "",
                "type": "text",
                "value": "ok",
                "color": "#2563eb",
            }
        },
        "nodes": {
            "input_answer": {
                "kind": "input",
                "name": "Input Answer",
                "description": "",
                "ui": {"position": {"x": 0, "y": 0}},
                "reads": [],
                "writes": [{"state": "answer", "mode": "replace"}],
                "config": {"value": "ok", "boundaryType": "text"},
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


def _run_summary(run_id: str, *, internal: bool = False, role: str = "buddy_autonomous_review") -> dict:
    return {
        "run_id": run_id,
        "graph_id": None,
        "graph_name": "自主复盘" if internal else "伙伴自主循环",
        "status": "completed",
        "started_at": "2026-05-11T07:28:47Z",
        "completed_at": "2026-05-11T07:29:05Z",
        "duration_ms": 18445,
        "runtime_backend": "langgraph",
        "metadata": {"internal": True, "role": role} if internal else {"origin": "buddy"},
        "lifecycle": {},
        "checkpoint_metadata": {},
        "graph_snapshot": {},
    }


def _child_run_summary(run_id: str = "run_child", *, parent_run_id: str = "run_root") -> dict:
    payload = _run_summary(run_id)
    payload.update(
        {
            "graph_id": "graph_child",
            "graph_name": "Child Graph",
            "parent_run_id": parent_run_id,
            "root_run_id": "run_root",
            "parent_node_id": "run_selected_subgraph",
            "invocation_kind": "dynamic_subgraph_capability",
            "invocation_key": "advanced_web_research_loop",
            "run_depth": 1,
            "run_path": ["run_root", run_id],
        }
    )
    return payload


def _paused_run(run_id: str = "run_paused", status: str = "awaiting_human") -> dict:
    return {
        "run_id": run_id,
        "graph_id": "graph_1",
        "graph_name": "伙伴自主循环",
        "status": status,
        "started_at": "2026-05-11T07:28:47Z",
        "completed_at": None,
        "duration_ms": None,
        "runtime_backend": "langgraph",
        "current_node_id": "human_review",
        "metadata": {
            "origin": "buddy",
            "pending_permission_approval": {"action_key": "write_file"},
            "pending_permission_approval_resume_payload": {"answer": "ok"},
            "pending_subgraph_breakpoint": {"node_id": "inner_review"},
            "pending_subgraph_resume_payload": {"draft": "hello"},
        },
        "lifecycle": {
            "updated_at": "2026-05-11T07:28:47Z",
            "paused_at": "2026-05-11T07:28:50Z",
            "pause_reason": "permission_approval",
            "resume_count": 0,
        },
        "checkpoint_metadata": {"available": True, "thread_id": run_id, "checkpoint_id": "checkpoint_1"},
        "node_status_map": {"human_review": "paused"},
        "graph_snapshot": _valid_resume_graph_snapshot(),
        "errors": [],
        "warnings": [],
    }


class RunRouteTests(unittest.TestCase):
    def test_run_list_keeps_buddy_background_audit_runs_visible_by_default(self) -> None:
        with patch(
            "app.api.routes_runs.list_runs",
            return_value=[
                _run_summary("run_review", internal=True),
                _run_summary("run_compaction", internal=True, role="buddy_context_compaction"),
                _run_summary("run_visible"),
            ],
        ):
            with TestClient(app) as client:
                response = client.get("/api/runs")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([run["run_id"] for run in response.json()], ["run_review", "run_compaction", "run_visible"])

    def test_run_list_can_include_internal_runs_explicitly(self) -> None:
        with patch(
            "app.api.routes_runs.list_runs",
            return_value=[
                _run_summary("run_review", internal=True),
                _run_summary("run_compaction", internal=True, role="buddy_context_compaction"),
                _run_summary("run_visible"),
            ],
        ):
            with TestClient(app) as client:
                response = client.get("/api/runs", params={"include_internal": "true"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([run["run_id"] for run in response.json()], ["run_review", "run_compaction", "run_visible"])

    def test_get_run_detail_includes_direct_child_run_summaries(self) -> None:
        root = _run_summary("run_root")
        with (
            patch("app.api.routes_runs.load_run", return_value=root),
            patch("app.api.routes_runs.list_child_runs", return_value=[_child_run_summary()], create=True),
        ):
            with TestClient(app) as client:
                response = client.get("/api/runs/run_root")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["children"][0]["run_id"], "run_child")
        self.assertEqual(payload["children"][0]["parent_run_id"], "run_root")
        self.assertEqual(payload["children"][0]["invocation_kind"], "dynamic_subgraph_capability")

    def test_get_run_tree_returns_nested_child_runs(self) -> None:
        tree = {
            **_run_summary("run_root"),
            "parent_run_id": "",
            "root_run_id": "run_root",
            "parent_node_id": "",
            "invocation_kind": "root",
            "invocation_key": "",
            "run_depth": 0,
            "run_path": ["run_root"],
            "batch_group_id": "",
            "batch_item_index": None,
            "batch_item_label": "",
            "current_node_id": None,
            "children": [{**_child_run_summary(), "children": []}],
        }
        with patch("app.api.routes_runs.build_run_tree", return_value=tree, create=True):
            with TestClient(app) as client:
                response = client.get("/api/runs/run_root/tree")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["run_id"], "run_root")
        self.assertEqual(payload["children"][0]["run_id"], "run_child")
        self.assertEqual(payload["children"][0]["run_path"], ["run_root", "run_child"])

    def test_cancel_run_marks_paused_run_cancelled_and_clears_pending_resume_metadata(self) -> None:
        run = _paused_run()
        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs.publish_run_event") as publish_run_event,
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/cancel", json={"reason": "用户取消"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"run_id": "run_paused", "status": "cancelled"})
        saved_run = save_run.call_args.args[0]
        self.assertEqual(saved_run["status"], "cancelled")
        self.assertIsNotNone(saved_run["completed_at"])
        self.assertTrue(saved_run["metadata"]["cancelled"])
        self.assertEqual(saved_run["metadata"]["cancellation_reason"], "用户取消")
        self.assertNotIn("pending_permission_approval", saved_run["metadata"])
        self.assertNotIn("pending_permission_approval_resume_payload", saved_run["metadata"])
        self.assertNotIn("pending_subgraph_breakpoint", saved_run["metadata"])
        self.assertNotIn("pending_subgraph_resume_payload", saved_run["metadata"])
        publish_run_event.assert_called_once_with("run_paused", "run.cancelled", {"status": "cancelled", "reason": "用户取消"})

    def test_cancel_run_rejects_terminal_runs(self) -> None:
        with (
            patch("app.api.routes_runs.load_run", return_value=_paused_run(status="completed")),
            patch("app.api.routes_runs.save_run") as save_run,
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/cancel", json={"reason": "用户取消"})

        self.assertEqual(response.status_code, 409)
        save_run.assert_not_called()

    def test_resume_run_restores_pause_snapshot_subgraph_resume_metadata(self) -> None:
        run = _paused_run(status="cancelled")
        run["metadata"] = {"origin": "buddy", "cancelled": True}
        run["run_snapshots"] = [
            {
                "snapshot_id": "pause_1",
                "kind": "pause",
                "label": "Paused at intake_request",
                "status": "awaiting_human",
                "current_node_id": "intake_request",
                "checkpoint_metadata": {"available": True, "thread_id": "run_paused", "checkpoint_id": "checkpoint_pause"},
                "graph_snapshot": _valid_resume_graph_snapshot(),
                "state_snapshot": {"values": {"answer": "waiting"}},
                "artifacts": {"state_values": {"answer": "waiting"}},
                "node_status_map": {"intake_request": "paused"},
                "subgraph_status_map": {"intake_request": {"ask_clarification": "paused"}},
                "output_previews": [],
                "final_result": "",
                "metadata": {
                    "origin": "buddy",
                    "pending_subgraph_breakpoint": {
                        "subgraph_node_id": "intake_request",
                        "inner_node_id": "ask_clarification",
                        "state_values": {"clarification_prompt": "需要选择执行方案"},
                    },
                },
            }
        ]
        resume_payload = {"clarification_answer": "执行第一个方案"}

        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs._resume_run_worker") as resume_worker,
        ):
            with TestClient(app) as client:
                response = client.post(
                    "/api/runs/run_paused/resume",
                    json={"snapshot_id": "pause_1", "resume": resume_payload},
                )

        self.assertEqual(response.status_code, 200)
        saved_run = save_run.call_args.args[0]
        self.assertEqual(saved_run["status"], "resuming")
        self.assertEqual(saved_run["checkpoint_metadata"]["checkpoint_id"], "checkpoint_pause")
        self.assertEqual(
            saved_run["metadata"]["pending_subgraph_breakpoint"]["inner_node_id"],
            "ask_clarification",
        )
        self.assertEqual(saved_run["metadata"]["pending_subgraph_resume_payload"], resume_payload)
        resume_worker.assert_called_once()
        self.assertIsNone(resume_worker.call_args.args[2])

    def test_resume_run_rejects_mismatched_page_operation_continuation(self) -> None:
        run = _paused_run()
        run["metadata"] = {
            "origin": "buddy",
            "pending_page_operation_continuation": {
                "mode": "auto_resume_after_ui_operation",
                "operation_request_id": "vop_expected",
                "resume_state_keys": ["page_operation_context", "page_context", "operation_result", "operation_report"],
            },
        }

        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs._resume_run_worker") as resume_worker,
        ):
            with TestClient(app) as client:
                response = client.post(
                    "/api/runs/run_paused/resume",
                    json={"resume": {"operation_result": {"operation_request_id": "vop_actual", "status": "succeeded"}}},
                )

        self.assertEqual(response.status_code, 409)
        self.assertIn("operation_request_id", response.text)
        save_run.assert_not_called()
        resume_worker.assert_not_called()

    def test_resume_run_accepts_matching_page_operation_continuation(self) -> None:
        run = _paused_run()
        run["metadata"] = {
            "origin": "buddy",
            "pending_page_operation_continuation": {
                "mode": "auto_resume_after_ui_operation",
                "operation_request_id": "vop_expected",
                "resume_state_keys": ["page_operation_context", "page_context", "operation_result", "operation_report"],
            },
        }
        resume_payload = {
            "operation_result": {"operation_request_id": "vop_expected", "status": "succeeded"},
            "page_context": "当前路径: /runs",
            "page_operation_context": {"page_path": "/runs"},
        }

        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs._resume_run_worker") as resume_worker,
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/resume", json={"resume": resume_payload})

        self.assertEqual(response.status_code, 200)
        saved_run = save_run.call_args.args[0]
        self.assertNotIn("pending_page_operation_continuation", saved_run["metadata"])
        resume_worker.assert_called_once()
        self.assertEqual(resume_worker.call_args.args[2], resume_payload)

    def test_resume_run_records_page_operation_completion_activity(self) -> None:
        run = _paused_run()
        run["activity_events"] = [
            {
                "sequence": 1,
                "kind": "virtual_ui_operation",
                "summary": "Requested virtual template run.",
                "node_id": "run_visible_template_operation",
                "status": "requested",
                "detail": {"operation_request_id": "vop_expected"},
                "created_at": "2026-05-11T07:28:50Z",
            }
        ]
        run["artifacts"] = {"activity_events": list(run["activity_events"])}
        run["metadata"] = {
            "origin": "buddy",
            "pending_page_operation_continuation": {
                "mode": "auto_resume_after_ui_operation",
                "operation_request_id": "vop_expected",
                "resume_state_keys": ["page_operation_context", "page_context", "operation_result", "operation_report"],
                "node_id": "run_visible_template_operation",
                "subgraph_node_id": "buddy_capability_loop",
                "subgraph_path": ["buddy_capability_loop"],
            },
        }
        resume_payload = {
            "operation_result": {
                "operation_request_id": "vop_expected",
                "status": "succeeded",
                "target_id": "library.template.advanced_web_research_loop.open",
                "commands": ["run_template advanced_web_research_loop"],
                "route_before": "/library",
                "route_after": "/editor",
                "triggered_run_id": "run_search",
                "triggered_graph_id": "advanced_web_research_loop",
                "triggered_run_initial_status": "queued",
                "triggered_run_status": "completed",
                "triggered_run_result_summary": "已拿到《鸣潮》最新资讯摘要。",
                "retry_chain": [
                    {
                        "kind": "affordance",
                        "target_id": "app.nav.library",
                        "attempts": 4,
                        "status": "resolved",
                        "elapsed_ms": 360,
                    }
                ],
                "artifact_refs": [
                    {
                        "title": "Brief",
                        "artifact_kind": "saved_output",
                        "path": "runs/run_search/brief.md",
                        "file_name": "brief.md",
                        "source_key": "brief",
                    }
                ],
                "input_text": "鸣潮最新资讯",
                "failure_category": None,
                "error": None,
            },
            "operation_report": {
                "operation_request_id": "vop_expected",
                "status": "succeeded",
                "target_id": "library.template.advanced_web_research_loop.open",
                "commands": ["run_template advanced_web_research_loop"],
                "route_before": "/library",
                "route_after": "/editor",
                "triggered_run_id": "run_search",
                "triggered_graph_id": "advanced_web_research_loop",
                "triggered_run_initial_status": "queued",
                "triggered_run_status": "completed",
                "triggered_run_result_summary": "已拿到《鸣潮》最新资讯摘要。",
                "retry_chain": [
                    {
                        "kind": "affordance",
                        "target_id": "app.nav.library",
                        "attempts": 4,
                        "status": "resolved",
                        "elapsed_ms": 360,
                    }
                ],
                "artifact_refs": [
                    {
                        "title": "Brief",
                        "artifact_kind": "saved_output",
                        "path": "runs/run_search/brief.md",
                        "file_name": "brief.md",
                        "source_key": "brief",
                    }
                ],
                "input_text": "鸣潮最新资讯",
                "failure_category": None,
                "error": None,
            },
            "page_context": "当前路径: /editor",
            "page_operation_context": {"page_path": "/editor"},
        }

        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs._resume_run_worker") as resume_worker,
            patch("app.api.routes_runs.publish_run_event") as publish_run_event,
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/resume", json={"resume": resume_payload})

        self.assertEqual(response.status_code, 200)
        saved_run = save_run.call_args.args[0]
        completion_event = saved_run["activity_events"][-1]
        self.assertEqual(completion_event["sequence"], 2)
        self.assertEqual(completion_event["kind"], "virtual_ui_operation")
        self.assertEqual(completion_event["status"], "succeeded")
        self.assertEqual(completion_event["node_id"], "run_visible_template_operation")
        self.assertEqual(completion_event["subgraph_node_id"], "buddy_capability_loop")
        self.assertEqual(completion_event["subgraph_path"], ["buddy_capability_loop"])
        self.assertEqual(completion_event["detail"]["operation_request_id"], "vop_expected")
        self.assertEqual(completion_event["detail"]["operation"]["kind"], "run_template")
        self.assertEqual(completion_event["detail"]["operation"]["search_text"], "advanced_web_research_loop")
        self.assertEqual(completion_event["detail"]["operation_report"]["triggered_run_id"], "run_search")
        self.assertEqual(completion_event["detail"]["retry_chain"][0]["attempts"], 4)
        self.assertEqual(completion_event["detail"]["operation_report"]["retry_chain"][0]["target_id"], "app.nav.library")
        self.assertEqual(completion_event["detail"]["triggered_run"]["status"], "completed")
        self.assertEqual(completion_event["detail"]["triggered_run"]["artifact_refs"][0]["path"], "runs/run_search/brief.md")
        self.assertEqual(saved_run["artifacts"]["activity_events"][-1], completion_event)
        publish_run_event.assert_any_call("run_paused", "activity.event", completion_event)
        resume_worker.assert_called_once()

    def test_resume_run_records_failed_page_operation_completion_category(self) -> None:
        run = _paused_run()
        run["metadata"] = {
            "origin": "buddy",
            "pending_page_operation_continuation": {
                "mode": "auto_resume_after_ui_operation",
                "operation_request_id": "vop_expected",
                "node_id": "run_visible_template_operation",
            },
        }
        resume_payload = {
            "operation_result": {
                "operation_request_id": "vop_expected",
                "status": "failed",
                "target_id": "editor.action.runActiveGraph",
                "commands": ["run_template advanced_web_research_loop"],
                "triggered_run_id": "run_failed",
                "triggered_run_status": "failed",
                "failure_category": "target_run_failed",
                "error": "目标图运行失败。",
            },
            "page_context": "当前路径: /editor",
            "page_operation_context": {"page_path": "/editor"},
        }

        with (
            patch("app.api.routes_runs.load_run", return_value=run),
            patch("app.api.routes_runs.save_run") as save_run,
            patch("app.api.routes_runs._resume_run_worker"),
            patch("app.api.routes_runs.publish_run_event"),
        ):
            with TestClient(app) as client:
                response = client.post("/api/runs/run_paused/resume", json={"resume": resume_payload})

        self.assertEqual(response.status_code, 200)
        completion_event = save_run.call_args.args[0]["activity_events"][-1]
        self.assertEqual(completion_event["status"], "failed")
        self.assertEqual(completion_event["detail"]["failure_category"], "target_run_failed")
        self.assertEqual(completion_event["error"], "目标图运行失败。")


if __name__ == "__main__":
    unittest.main()
