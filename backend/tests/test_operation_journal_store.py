from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.storage.operation_journal_store import list_operation_journal_entries, record_operation_journal_event


class OperationJournalStoreTests(unittest.TestCase):
    def test_operation_journal_reads_camel_case_operation_request_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            journal_path = Path(temp_dir) / "operation_journal.jsonl"
            with patch("app.core.storage.operation_journal_store.OPERATION_JOURNAL_PATH", journal_path):
                entry = record_operation_journal_event(
                    run_id="run_parent",
                    event={
                        "sequence": 1,
                        "kind": "virtual_ui_operation",
                        "summary": "Requested virtual input.",
                        "status": "requested",
                        "created_at": "2026-05-18T10:00:00Z",
                        "detail": {
                            "operationRequest": {
                                "operationRequestId": "vop_input",
                                "operations": [{"kind": "input", "targetId": "buddy.input", "inputText": "继续"}],
                            },
                        },
                    },
                )

        self.assertIsNotNone(entry)
        assert entry is not None
        self.assertEqual(entry["operation_request_id"], "vop_input")
        self.assertEqual(entry["target_id"], "buddy.input")
        self.assertEqual(entry["input_text"], "继续")

    def test_operation_journal_infers_operation_from_operation_request(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            journal_path = Path(temp_dir) / "operation_journal.jsonl"
            with patch("app.core.storage.operation_journal_store.OPERATION_JOURNAL_PATH", journal_path):
                entry = record_operation_journal_event(
                    run_id="run_parent",
                    event={
                        "sequence": 1,
                        "kind": "virtual_ui_operation",
                        "summary": "Requested virtual click.",
                        "node_id": "execute_page_operation",
                        "status": "requested",
                        "created_at": "2026-05-18T10:00:00Z",
                        "detail": {
                            "operation_request_id": "vop_click",
                            "operation_request": {
                                "commands": ["click app.nav.runs"],
                                "operations": [
                                    {
                                        "kind": "click",
                                        "target_id": "app.nav.runs",
                                        "target_label": "运行记录",
                                    }
                                ],
                            },
                        },
                    },
                )

        self.assertIsNotNone(entry)
        assert entry is not None
        self.assertEqual(entry["operation"]["kind"], "click")
        self.assertEqual(entry["target_id"], "app.nav.runs")
        self.assertEqual(entry["target_label"], "运行记录")

    def test_operation_journal_links_request_and_completion_by_operation_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            journal_path = Path(temp_dir) / "operation_journal.jsonl"
            with patch("app.core.storage.operation_journal_store.OPERATION_JOURNAL_PATH", journal_path):
                request_entry = record_operation_journal_event(
                    run_id="run_parent",
                    event={
                        "sequence": 1,
                        "kind": "virtual_ui_operation",
                        "summary": "Requested virtual template run.",
                        "node_id": "run_visible_template_operation",
                        "subgraph_node_id": "buddy_capability_loop",
                        "subgraph_path": ["buddy_capability_loop"],
                        "status": "requested",
                        "created_at": "2026-05-18T10:00:00Z",
                        "detail": {
                            "operation_request_id": "vop_template",
                            "operation": {
                                "kind": "run_template",
                                "target_id": "library.template.advanced_web_research_loop.open",
                                "target_label": "高级联网搜索",
                                "input_text": "鸣潮最新资讯",
                            },
                            "operation_request": {
                                "commands": ["run_template advanced_web_research_loop"],
                                "operations": [
                                    {
                                        "kind": "run_template",
                                        "target_id": "library.template.advanced_web_research_loop.open",
                                        "input_text": "鸣潮最新资讯",
                                    }
                                ],
                            },
                            "journal": [
                                {
                                    "kind": "run_template",
                                    "operation_request_id": "vop_template",
                                    "status": "requested",
                                    "target_id": "library.template.advanced_web_research_loop.open",
                                }
                            ],
                        },
                    },
                )
                completion_entry = record_operation_journal_event(
                    run_id="run_parent",
                    event={
                        "sequence": 2,
                        "kind": "virtual_ui_operation",
                        "summary": "Virtual run_template succeeded.",
                        "node_id": "run_visible_template_operation",
                        "subgraph_node_id": "buddy_capability_loop",
                        "subgraph_path": ["buddy_capability_loop"],
                        "status": "succeeded",
                        "created_at": "2026-05-18T10:00:12Z",
                        "detail": {
                            "operation_request_id": "vop_template",
                            "operation": {
                                "kind": "run_template",
                                "target_id": "library.template.advanced_web_research_loop.open",
                                "search_text": "advanced_web_research_loop",
                                "input_text": "鸣潮最新资讯",
                            },
                            "operation_report": {
                                "operation_request_id": "vop_template",
                                "status": "succeeded",
                                "triggered_run_id": "run_search",
                                "triggered_run_status": "completed",
                                "triggered_run_result_summary": "已拿到《鸣潮》最新资讯摘要。",
                            },
                            "page_snapshots": {
                                "before": {"snapshot_id": "before_1", "path": "/library", "title": "图与模板"},
                                "after": {"snapshot_id": "after_1", "path": "/editor", "title": "编辑器"},
                            },
                            "triggered_run": {
                                "run_id": "run_search",
                                "graph_id": "advanced_web_research_loop",
                                "initial_status": "queued",
                                "status": "completed",
                                "result_summary": "已拿到《鸣潮》最新资讯摘要。",
                            },
                        },
                    },
                )

                result = list_operation_journal_entries(operation_request_id="vop_template")

        self.assertEqual(request_entry["stage"], "request")
        self.assertEqual(completion_entry["stage"], "completion")
        self.assertEqual(result["total"], 2)
        self.assertEqual([entry["stage"] for entry in result["entries"]], ["request", "completion"])
        latest = result["entries"][-1]
        self.assertEqual(latest["operation_request_id"], "vop_template")
        self.assertEqual(latest["operation"]["kind"], "run_template")
        self.assertEqual(latest["operation"]["input_text"], "鸣潮最新资讯")
        self.assertEqual(latest["triggered_run"]["run_id"], "run_search")
        self.assertEqual(latest["triggered_run"]["status"], "completed")
        self.assertEqual(latest["page_snapshots"]["before"]["path"], "/library")


if __name__ == "__main__":
    unittest.main()
